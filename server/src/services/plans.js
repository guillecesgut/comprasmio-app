import { one, many, id, tx, fail } from '../db.js';
import { notify, KIND, sellerUserId } from './notifications.js';
import { getSettings, isPremium, commissionBpFor } from '../settings.js';
import { bs } from '../util.js';

/**
 * Planes del vendedor. Básico: catálogo con comisión. Premium: monto fijo mensual, comisión
 * menor, vivos, subastas y paquetes. El Premium se paga por transferencia al QR de la
 * plataforma, fuera de la tienda de apps (no es un bien digital: no aplica la compra integrada).
 */
export async function planInfo(sellerId) {
  const s = await one('SELECT * FROM sellers WHERE id = $1', [sellerId]);
  const settings = await getSettings();
  const premium = isPremium(s);
  const pending = await one(
    `SELECT id, ref, status, amount_cents, expires_at FROM payments
     WHERE plan_seller_id = $1 AND kind = 'plan' AND status IN ('pending', 'in_review') ORDER BY created_at DESC LIMIT 1`,
    [sellerId]
  );
  // Ahorro estimado con las ventas del último mes (banner de E11).
  const sales = await one(
    `SELECT COALESCE(SUM(subtotal_cents), 0)::int AS cents FROM orders
     WHERE seller_id = $1 AND paid_at > now() - interval '30 days' AND status NOT IN ('cancelado', 'vencido')`,
    [sellerId]
  );
  const saving = Math.round(sales.cents * (settings.commission_basico_bp - settings.commission_premium_bp) / 10000) - settings.premium_price_cents;
  const daysLeft = premium ? Math.ceil((new Date(s.plan_until) - Date.now()) / 864e5) : null;
  return {
    plan: premium ? 'premium' : 'basico',
    until: premium ? s.plan_until : null,
    daysLeft,
    expiringSoon: premium && daysLeft <= 5,
    expired: s.plan === 'premium' && !premium,
    commissionPct: commissionBpFor(s, settings) / 100,
    basicoPct: settings.commission_basico_bp / 100,
    premiumPct: settings.commission_premium_bp / 100,
    premiumPrice: bs(settings.premium_price_cents),
    premiumDays: settings.premium_days,
    lastMonthSales: bs(sales.cents),
    estimatedSaving: saving > 0 ? bs(saving) : 0,
    pendingPayment: pending ? { id: pending.id, ref: pending.ref, status: pending.status } : null,
  };
}

/** E11 · Pasar a Premium (o renovar): genera la referencia PREMIUM-<TIENDA> y el monto. */
export async function requestPremium(sellerId, userId) {
  const settings = await getSettings();
  return tx(async (q) => {
    const existing = await one(
      `SELECT id FROM payments WHERE plan_seller_id = $1 AND kind = 'plan' AND status IN ('pending', 'in_review') FOR UPDATE`,
      [sellerId], q
    );
    if (existing) return existing.id;
    const s = await one('SELECT slug FROM sellers WHERE id = $1', [sellerId], q);
    const qr = await one('SELECT id FROM platform_qrs WHERE active', [], q);
    if (!qr) fail(503, 'No pudimos cargar los datos de pago. Intentá de nuevo en unos minutos.');
    const n = (await one(`SELECT nextval('payment_ref_seq') AS n`, [], q)).n;
    const ref = `PREMIUM-${s.slug.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 14)}-${n}`;
    const pid = id('pay');
    await q.query(
      `INSERT INTO payments(id, ref, user_id, kind, amount_cents, status, expires_at, qr_id, plan_seller_id)
       VALUES ($1,$2,$3,'plan',$4,'pending', now() + interval '3 days', $5, $6)`,
      [pid, ref, userId, settings.premium_price_cents, qr.id, sellerId]
    );
    return pid;
  });
}

/** Al aprobarse el pago del plan: suma los días de Premium (sobre lo que quedaba, si renueva). */
export async function activatePremiumFromPayment(q, payment, adminId) {
  const settings = await getSettings();
  await grantPremium(q, payment.plan_seller_id, settings.premium_days, adminId, payment);
}

export async function grantPremium(q, sellerId, days, adminId, payment = null) {
  const s = await one('SELECT * FROM sellers WHERE id = $1 FOR UPDATE', [sellerId], q);
  if (!s) fail(404, 'Ese vendedor no existe.');
  const from = isPremium(s) ? new Date(s.plan_until) : new Date();
  const until = new Date(from.getTime() + Number(days) * 864e5);
  await q.query(`UPDATE sellers SET plan = 'premium', plan_until = $2 WHERE id = $1`, [sellerId, until]);
  await q.query(
    `INSERT INTO plan_subscriptions(id, seller_id, plan, amount_cents, payment_id, starts_at, ends_at, activated_by)
     VALUES ($1,$2,'premium',$3,$4,$5,$6,$7)`,
    [id('sub'), sellerId, payment?.amount_cents || 0, payment?.id || null, from, until, adminId]
  );
  await q.query(
    `INSERT INTO audit_log(actor_id, action, entity, entity_id, data) VALUES ($1, 'activar_premium', 'seller', $2, $3)`,
    [adminId, sellerId, JSON.stringify({ until, days })]
  );
  await notify(q, {
    userId: await sellerUserId(sellerId, q), kind: KIND.PLAN, title: 'Premium activo',
    body: `Ya podés transmitir en vivo. Tu plan vence el ${until.toLocaleDateString('es-BO', { day: 'numeric', month: 'short', timeZone: 'America/La_Paz' })}.`,
    link: '/vendedor/plan',
  });
  return until;
}

/** F8 · lista de suscripciones Premium con su vencimiento. */
export async function subscriptions() {
  const rows = await many(
    `SELECT s.id, s.name, s.slug, s.plan, s.plan_until,
       (SELECT max(created_at) FROM plan_subscriptions ps WHERE ps.seller_id = s.id) AS last_payment
     FROM sellers s WHERE s.plan = 'premium' ORDER BY s.plan_until`
  );
  return rows.map((r) => ({
    sellerId: r.id, seller: r.name, slug: r.slug, until: r.plan_until, active: new Date(r.plan_until) > new Date(),
    daysLeft: Math.ceil((new Date(r.plan_until) - Date.now()) / 864e5), lastPayment: r.last_payment,
  }));
}

export async function grantPremiumManually(adminId, sellerId, days) {
  const d = Number.parseInt(days, 10);
  if (!(d > 0 && d <= 366)) fail(400, 'Indicá entre 1 y 366 días.');
  return tx((q) => grantPremium(q, sellerId, d, adminId));
}
