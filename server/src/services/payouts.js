import { one, many, id, tx, fail } from '../db.js';
import * as storage from '../storage.js';
import { notify, KIND, sellerUserId } from './notifications.js';
import { getSettings } from '../settings.js';
import { bs } from '../util.js';
import { ORDER_STATUS_LABEL } from './present.js';

/**
 * Liquidaciones semanales. Una semana termina el día de corte (domingo por defecto) a las 23:59
 * de Bolivia y se paga el día de pago siguiente (lunes). Entran los pedidos ENTREGADOS sin
 * liquidar hasta esa fecha; los que están en reclamo esperan a resolverse y entran en el corte
 * siguiente. Nada se pierde: el criterio es "entregado y sin liquidar", no "entregado esa semana".
 */

const TZ_OFFSET_H = -4; // Bolivia no tiene horario de verano

/** Fecha (YYYY-MM-DD) en Bolivia de un instante. */
export function boliviaDate(instant = new Date()) {
  return new Date(new Date(instant).getTime() + TZ_OFFSET_H * 3600_000).toISOString().slice(0, 10);
}

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay();

/** Semana que contiene `instant`: { start, end, payOn } (fechas de Bolivia). */
export function periodFor(instant, settings) {
  const day = boliviaDate(instant);
  const cut = settings.payout_cut_weekday;
  const end = addDays(day, (cut - weekday(day) + 7) % 7);
  const payOn = addDays(end, ((settings.payout_pay_weekday - cut + 7) % 7) || 7);
  return { start: addDays(end, -6), end, payOn };
}

/** Fecha de pago de lo que se entrega en `instant` (E6: "Entra en el pago del lunes 3 nov"). */
export const nextPayoutDate = (instant, settings) => periodFor(instant, settings).payOn;

/** Último instante (UTC) de un día de Bolivia. */
const endOfBoliviaDay = (ymd) => new Date(new Date(`${ymd}T23:59:59.999Z`).getTime() - TZ_OFFSET_H * 3600_000);

/** Último corte cerrado: la semana que terminó antes de hoy. */
export function lastClosedPeriod(settings, now = new Date()) {
  const current = periodFor(now, settings);
  return periodFor(new Date(endOfBoliviaDay(current.start).getTime() - 86_400_000), settings);
}

/**
 * F4 · Generar el corte de una semana (por defecto, la última cerrada). Idempotente: si se
 * vuelve a generar, suma los pedidos nuevos a las liquidaciones todavía no pagadas.
 */
export async function generateCut(adminId, periodEnd) {
  const settings = await getSettings();
  const period = periodEnd ? periodFor(endOfBoliviaDay(periodEnd), settings) : lastClosedPeriod(settings);
  if (endOfBoliviaDay(period.end) > new Date()) fail(409, 'La semana todavía no terminó.');

  return tx(async (q) => {
    const orders = await many(
      `SELECT * FROM orders WHERE status = 'entregado' AND payout_id IS NULL AND delivered_at <= $1 ORDER BY seller_id FOR UPDATE`,
      [endOfBoliviaDay(period.end)], q
    );
    const bySeller = new Map();
    for (const o of orders) {
      if (!bySeller.has(o.seller_id)) bySeller.set(o.seller_id, []);
      bySeller.get(o.seller_id).push(o);
    }
    let created = 0;
    let carried = 0;
    for (const [sellerId, list] of bySeller) {
      const gross = list.reduce((s, o) => s + o.total_cents, 0);
      const commission = list.reduce((s, o) => s + o.commission_cents, 0);
      let payout = await one('SELECT * FROM payouts WHERE seller_id = $1 AND period_end = $2 FOR UPDATE', [sellerId, period.end], q);
      if (payout?.status === 'pagada') { carried += list.length; continue; } // van al próximo corte
      const existingNet = payout ? payout.net_cents : 0;
      if (existingNet + gross - commission < settings.payout_min_cents) { carried += list.length; continue; }
      const account = await one(`SELECT * FROM payout_accounts WHERE seller_id = $1`, [sellerId], q);
      const snapshot = account ? {
        bank: account.bank, accountType: account.account_type, accountNumber: account.account_number,
        holder: account.holder, holderDoc: account.holder_doc, verified: account.status === 'verified',
      } : null;
      if (payout) {
        payout = await one(
          `UPDATE payouts SET gross_cents = gross_cents + $2, commission_cents = commission_cents + $3, net_cents = net_cents + $4,
             orders_count = orders_count + $5, bank_snapshot = $6 WHERE id = $1 RETURNING *`,
          [payout.id, gross, commission, gross - commission, list.length, snapshot ? JSON.stringify(snapshot) : null], q
        );
      } else {
        payout = await one(
          `INSERT INTO payouts(id, seller_id, period_start, period_end, scheduled_for, gross_cents, commission_cents, net_cents,
             orders_count, status, bank_snapshot)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'programada',$10) RETURNING *`,
          [id('liq'), sellerId, period.start, period.end, period.payOn, gross, commission, gross - commission, list.length,
            snapshot ? JSON.stringify(snapshot) : null], q
        );
        created++;
      }
      await q.query('UPDATE orders SET payout_id = $2 WHERE id = ANY($1)', [list.map((o) => o.id), payout.id]);
      await notify(q, {
        userId: await sellerUserId(sellerId, q), kind: KIND.PAYOUT, title: 'Pago programado',
        body: `Bs ${bs(payout.net_cents)} por ${payout.orders_count} pedido${payout.orders_count === 1 ? '' : 's'}. Te transferimos el ${period.payOn}.`,
        link: '/vendedor/cobros',
      });
    }
    await q.query(
      `INSERT INTO audit_log(actor_id, action, entity, entity_id, data) VALUES ($1, 'generar_corte', 'payout', $2, $3)`,
      [adminId, period.end, JSON.stringify({ orders: orders.length, created, carried })]
    );
    return { period, orders: orders.length - carried, sellers: bySeller.size, created, carried };
  });
}

/** F4 · Marcar transferida, con el comprobante. El vendedor lo ve en E7. */
export async function markPaid(adminId, payoutId, { receiptKey, operationNumber }) {
  if (!receiptKey) fail(400, 'Subí el comprobante de la transferencia.');
  return tx(async (q) => {
    const p = await one('SELECT * FROM payouts WHERE id = $1 FOR UPDATE', [payoutId], q);
    if (!p) fail(404, 'Esa liquidación no existe.');
    if (p.status === 'pagada') fail(409, 'Esta liquidación ya figura como pagada.');
    // Se paga a la cuenta vigente y verificada en este momento; queda copiada en la liquidación.
    const account = await one('SELECT * FROM payout_accounts WHERE seller_id = $1', [p.seller_id], q);
    if (!account) fail(409, 'El vendedor todavía no cargó sus datos para cobrar.');
    if (account.status !== 'verified') fail(409, 'Los datos para cobrar del vendedor todavía no están verificados.');
    const snapshot = {
      bank: account.bank, accountType: account.account_type, accountNumber: account.account_number,
      holder: account.holder, holderDoc: account.holder_doc, verified: true,
    };
    await q.query(
      `UPDATE payouts SET status = 'pagada', receipt_key = $2, operation_number = $3, paid_at = now(), paid_by = $4, bank_snapshot = $5
       WHERE id = $1`,
      [payoutId, receiptKey, String(operationNumber || '').slice(0, 60) || null, adminId, JSON.stringify(snapshot)]
    );
    await q.query(
      `INSERT INTO audit_log(actor_id, action, entity, entity_id, data) VALUES ($1, 'pagar_liquidacion', 'payout', $2, $3)`,
      [adminId, payoutId, JSON.stringify({ net_cents: p.net_cents, seller: p.seller_id })]
    );
    await notify(q, {
      userId: await sellerUserId(p.seller_id, q), kind: KIND.PAYOUT, title: 'Te pagamos',
      body: `Transferimos Bs ${bs(p.net_cents)} a tu cuenta. Podés ver el comprobante en Cobros.`, link: '/vendedor/cobros',
    });
  });
}

/** E7 · Cobros del vendedor. */
export async function sellerPayouts(sellerId) {
  const settings = await getSettings();
  const [accumulating, held, history, account] = await Promise.all([
    many(
      `SELECT o.*, u.handle AS buyer_handle FROM orders o JOIN users u ON u.id = o.buyer_id
       WHERE o.seller_id = $1 AND o.status = 'entregado' AND o.payout_id IS NULL ORDER BY o.delivered_at DESC`,
      [sellerId]
    ),
    many(
      `SELECT o.*, u.handle AS buyer_handle FROM orders o JOIN users u ON u.id = o.buyer_id
       WHERE o.seller_id = $1 AND o.status = 'en_reclamo' ORDER BY o.created_at DESC`,
      [sellerId]
    ),
    many('SELECT * FROM payouts WHERE seller_id = $1 ORDER BY period_end DESC LIMIT 26', [sellerId]),
    one('SELECT status FROM payout_accounts WHERE seller_id = $1', [sellerId]),
  ]);
  const scheduled = history.find((p) => p.status === 'programada');
  const gross = accumulating.reduce((s, o) => s + o.total_cents, 0);
  const commission = accumulating.reduce((s, o) => s + o.commission_cents, 0);
  const row = (o) => ({
    id: o.id, ref: o.ref, buyer: o.buyer_handle, status: o.status, statusLabel: ORDER_STATUS_LABEL[o.status],
    total: bs(o.total_cents), net: bs(o.total_cents - o.commission_cents),
  });
  const next = periodFor(new Date(), settings);
  return {
    accountStatus: account?.status || 'missing',
    scheduled: scheduled ? { id: scheduled.id, date: scheduled.scheduled_for, net: bs(scheduled.net_cents), orders: scheduled.orders_count } : null,
    thisWeek: {
      payOn: next.payOn,
      cutOn: next.end,
      gross: bs(gross),
      commission: bs(commission),
      net: bs(gross - commission),
      orders: accumulating.map(row),
    },
    held: { total: bs(held.reduce((s, o) => s + o.total_cents - o.commission_cents, 0)), orders: held.map(row) },
    history: await Promise.all(history.filter((p) => p.status === 'pagada').map(async (p) => ({
      id: p.id, date: p.paid_at, periodEnd: p.period_end, net: bs(p.net_cents), orders: p.orders_count,
      receiptUrl: await storage.url(p.receipt_key), operationNumber: p.operation_number,
    }))),
  };
}

/** F4 · Liquidaciones de una semana para el panel. */
export async function adminPayouts({ periodEnd } = {}) {
  const settings = await getSettings();
  const period = periodEnd ? periodFor(endOfBoliviaDay(periodEnd), settings) : lastClosedPeriod(settings);
  const rows = await many(
    `SELECT p.*, s.name AS seller_name, s.slug,
       (SELECT COALESCE(SUM(o.total_cents - o.commission_cents), 0)::int FROM orders o WHERE o.seller_id = p.seller_id AND o.status = 'en_reclamo') AS held_cents,
       CASE WHEN p.status = 'pagada' THEN p.bank_snapshot ELSE (
         SELECT jsonb_build_object('bank', a.bank, 'accountType', a.account_type, 'accountNumber', a.account_number,
           'holder', a.holder, 'holderDoc', a.holder_doc, 'verified', a.status = 'verified')
         FROM payout_accounts a WHERE a.seller_id = p.seller_id) END AS bank_now
     FROM payouts p JOIN sellers s ON s.id = p.seller_id WHERE p.period_end = $1 ORDER BY s.name`,
    [period.end]
  );
  const pendingToCut = await one(
    `SELECT count(*)::int AS n FROM orders WHERE status = 'entregado' AND payout_id IS NULL AND delivered_at <= $1`,
    [endOfBoliviaDay(period.end)]
  );
  const weeks = await many(
    `SELECT period_end, count(*)::int AS sellers, SUM(net_cents)::int AS net, bool_and(status = 'pagada') AS all_paid
     FROM payouts GROUP BY period_end ORDER BY period_end DESC LIMIT 12`
  );
  return {
    period,
    pendingToCut: pendingToCut.n,
    totals: {
      gross: bs(rows.reduce((s, p) => s + p.gross_cents, 0)),
      commission: bs(rows.reduce((s, p) => s + p.commission_cents, 0)),
      net: bs(rows.reduce((s, p) => s + p.net_cents, 0)),
      toTransfer: bs(rows.filter((p) => p.status === 'programada').reduce((s, p) => s + p.net_cents, 0)),
    },
    items: await Promise.all(rows.map(async (p) => ({
      id: p.id, sellerId: p.seller_id, seller: p.seller_name, status: p.status, orders: p.orders_count,
      gross: bs(p.gross_cents), commission: bs(p.commission_cents), net: bs(p.net_cents), held: bs(p.held_cents),
      bank: p.bank_now, scheduledFor: p.scheduled_for, paidAt: p.paid_at, operationNumber: p.operation_number,
      receiptUrl: await storage.url(p.receipt_key),
    }))),
    weeks: weeks.map((w) => ({ periodEnd: w.period_end, sellers: w.sellers, net: bs(w.net), allPaid: w.all_paid })),
  };
}

/** Detalle de una liquidación: pedidos incluidos. */
export async function payoutDetail(payoutId) {
  const p = await one('SELECT p.*, s.name AS seller_name FROM payouts p JOIN sellers s ON s.id = p.seller_id WHERE p.id = $1', [payoutId]);
  if (!p) fail(404, 'Esa liquidación no existe.');
  const orders = await many(
    `SELECT o.ref, o.total_cents, o.commission_cents, o.delivered_at, u.handle FROM orders o JOIN users u ON u.id = o.buyer_id
     WHERE o.payout_id = $1 ORDER BY o.delivered_at`,
    [payoutId]
  );
  return {
    id: p.id, seller: p.seller_name, status: p.status, period: { start: p.period_start, end: p.period_end }, net: bs(p.net_cents),
    orders: orders.map((o) => ({ ref: o.ref, buyer: o.handle, total: bs(o.total_cents), commission: bs(o.commission_cents), deliveredAt: o.delivered_at })),
  };
}

/** CSV de transferencias de la semana (F4 · Exportar). */
export async function payoutsCsv(periodEnd) {
  const data = await adminPayouts({ periodEnd });
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Vendedor', 'Banco', 'Tipo', 'Cuenta', 'Titular', 'CI/NIT', 'Pedidos', 'Ventas Bs', 'Comision Bs', 'Neto Bs', 'Estado'].map(esc).join(',')];
  for (const p of data.items) {
    lines.push([p.seller, p.bank?.bank, p.bank?.accountType, p.bank?.accountNumber, p.bank?.holder, p.bank?.holderDoc,
      p.orders, p.gross, p.commission, p.net, p.status].map(esc).join(','));
  }
  return { filename: `liquidaciones-${data.period.end}.csv`, body: `﻿${lines.join('\r\n')}\r\n` };
}

// ------------------------------------------------- datos para cobrar E8 ---

export async function payoutAccount(sellerId) {
  const a = await one('SELECT * FROM payout_accounts WHERE seller_id = $1', [sellerId]);
  if (!a) return null;
  return {
    bank: a.bank, accountType: a.account_type, accountNumber: a.account_number, holder: a.holder, holderDoc: a.holder_doc,
    qrUrl: await storage.url(a.qr_key), status: a.status, rejectReason: a.reject_reason,
  };
}

export async function savePayoutAccount(sellerId, input) {
  const fields = ['bank', 'accountType', 'accountNumber', 'holder', 'holderDoc'];
  for (const f of fields) if (!String(input[f] || '').trim()) fail(400, 'Completá banco, tipo de cuenta, número, titular y CI o NIT.');
  await one(
    `INSERT INTO payout_accounts(seller_id, bank, account_type, account_number, holder, holder_doc, qr_key, status, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',now())
     ON CONFLICT (seller_id) DO UPDATE SET bank=EXCLUDED.bank, account_type=EXCLUDED.account_type, account_number=EXCLUDED.account_number,
       holder=EXCLUDED.holder, holder_doc=EXCLUDED.holder_doc, qr_key=COALESCE(EXCLUDED.qr_key, payout_accounts.qr_key),
       status='pending', reject_reason=NULL, verified_at=NULL, verified_by=NULL, updated_at=now()
     RETURNING seller_id`,
    [sellerId, input.bank.trim(), input.accountType.trim(), String(input.accountNumber).replace(/\s/g, ''), input.holder.trim(),
      String(input.holderDoc).trim(), input.qrKey && String(input.qrKey).startsWith('payout-accounts/') ? input.qrKey : null]
  );
  return payoutAccount(sellerId);
}

export async function reviewPayoutAccount(adminId, sellerId, { approve, reason }) {
  const row = await one(
    `UPDATE payout_accounts SET status = $2, reject_reason = $3, verified_at = CASE WHEN $2 = 'verified' THEN now() END, verified_by = $4
     WHERE seller_id = $1 RETURNING *`,
    [sellerId, approve ? 'verified' : 'rejected', approve ? null : String(reason || 'Los datos no coinciden.').slice(0, 200), adminId]
  );
  if (!row) fail(404, 'Ese vendedor no cargó datos para cobrar.');
  await one(`INSERT INTO audit_log(actor_id, action, entity, entity_id) VALUES ($1, $2, 'payout_account', $3) RETURNING id`,
    [adminId, approve ? 'verificar_cuenta' : 'rechazar_cuenta', sellerId]);
  await notify(undefined, {
    userId: await sellerUserId(sellerId), kind: KIND.PAYOUT,
    title: approve ? 'Datos para cobrar verificados' : 'Revisá tus datos para cobrar',
    body: approve ? 'Ya podemos transferirte tus pagos semanales.' : row.reject_reason, link: '/vendedor/cobros/datos',
  });
}
