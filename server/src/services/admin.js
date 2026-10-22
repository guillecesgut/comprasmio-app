import { one, many, id, tx, fail } from '../db.js';
import * as storage from '../storage.js';
import * as stock from './stock.js';
import { hash } from '../auth.js';
import { notify, KIND, sellerUserId } from './notifications.js';
import { getSettings, setSettings, isPremium, commissionBpFor } from '../settings.js';
import { bs } from '../util.js';
import { ORDER_STATUS_LABEL } from './present.js';
import * as hub from '../realtime/hub.js';

const audit = (q, actorId, action, entity, entityId, data) =>
  one(
    'INSERT INTO audit_log(actor_id, action, entity, entity_id, data) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [actorId, action, entity, entityId, data ? JSON.stringify(data) : null], q
  );

// ------------------------------------------------------ F2 · pagos ---

export async function paymentsQueue(status = 'in_review') {
  const statuses = { in_review: ['in_review'], approved: ['approved'], rejected: ['pending'], expired: ['expired'], todos: null }[status] ?? ['in_review'];
  const rows = await many(
    `SELECT p.*, u.name AS buyer_name, u.handle AS buyer_handle, u.phone AS buyer_phone,
       (SELECT count(*)::int FROM orders o WHERE o.payment_id = p.id) AS orders_count,
       (SELECT string_agg(DISTINCT s.name, ', ') FROM orders o JOIN sellers s ON s.id = o.seller_id WHERE o.payment_id = p.id) AS sellers,
       ps.name AS plan_seller
     FROM payments p JOIN users u ON u.id = p.user_id LEFT JOIN sellers ps ON ps.id = p.plan_seller_id
     WHERE ${statuses ? `p.status = ANY($1)${status === 'rejected' ? ' AND p.reject_reason IS NOT NULL' : ''}` : 'true'}
     ORDER BY ${status === 'in_review' ? 'p.receipt_at ASC' : 'p.created_at DESC'} LIMIT 200`,
    statuses ? [statuses] : []
  );
  return Promise.all(rows.map(async (p) => ({
    id: p.id, ref: p.ref, kind: p.kind, status: p.status, amount: bs(p.amount_cents),
    buyer: { name: p.buyer_name, handle: p.buyer_handle, phone: p.buyer_phone },
    ordersCount: p.orders_count, sellers: p.kind === 'plan' ? `Plan Premium · ${p.plan_seller}` : p.sellers,
    receiptAt: p.receipt_at, createdAt: p.created_at, expiresAt: p.expires_at, rejectReason: p.reject_reason,
    receiptUrl: await storage.url(p.receipt_key),
  })));
}

// ------------------------------------------------------ F3 · pedidos ---

export async function ordersList({ status, sellerId, channel, q, from, to } = {}) {
  const where = ['true'];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (status) add('o.status = ?', status);
  if (sellerId) add('o.seller_id = ?', sellerId);
  if (channel) add('o.channel = ?', channel);
  if (q) {
    params.push(`%${q}%`);
    where.push(`(o.ref ILIKE $${params.length} OR u.handle ILIKE $${params.length})`);
  }
  if (from) add('o.created_at >= ?', from);
  if (to) add(`o.created_at < (?::date + 1)`, to);
  const rows = await many(
    `SELECT o.*, s.name AS seller_name, u.handle AS buyer_handle FROM orders o JOIN sellers s ON s.id = o.seller_id JOIN users u ON u.id = o.buyer_id
     WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC LIMIT 300`,
    params
  );
  return rows.map((o) => ({
    id: o.id, ref: o.ref, status: o.status, statusLabel: ORDER_STATUS_LABEL[o.status], channel: o.channel,
    seller: o.seller_name, buyer: o.buyer_handle, total: bs(o.total_cents), commission: bs(o.commission_cents), createdAt: o.created_at,
  }));
}

/** F3 · cancelar un pedido (con reembolso si ya estaba pagado). */
export async function cancelOrder(adminId, orderId, { reason, refundReceiptKey, restock = true }) {
  if (!String(reason || '').trim()) fail(400, 'Indicá el motivo.');
  return tx(async (q) => {
    const o = await one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId], q);
    if (!o) fail(404, 'Ese pedido no existe.');
    if (['cancelado', 'vencido'].includes(o.status)) fail(409, 'Este pedido ya está cerrado.');
    if (o.payout_id) fail(409, 'Este pedido ya entró en una liquidación.');
    if (['pendiente_pago', 'pago_en_revision'].includes(o.status)) {
      await stock.releaseHolds(q, o.id, 'cancelado', o.ref);
    } else if (restock) {
      await stock.restock(q, o.id, o.ref, adminId);
    }
    const updated = await one(`UPDATE orders SET status = 'cancelado', cancelled_at = now() WHERE id = $1 RETURNING *`, [o.id], q);
    await q.query('INSERT INTO order_events(order_id, status, note, actor_id) VALUES ($1,$2,$3,$4)', [o.id, 'cancelado', reason, adminId]);
    await audit(q, adminId, 'cancelar_pedido', 'order', o.id, { reason, refundReceiptKey, previous: o.status });
    await notify(q, { userId: o.buyer_id, kind: KIND.ORDER_UPDATE, title: `Pedido ${o.ref} cancelado`, body: reason, link: `/compras/${o.id}` });
    await notify(q, { userId: await sellerUserId(o.seller_id, q), kind: KIND.ORDER_UPDATE, title: `Pedido ${o.ref} cancelado`, body: reason, link: `/vendedor/pedidos/${o.id}` });
    hub.emit(`user:${o.buyer_id}`, 'order:update', { order: { id: o.id, status: updated.status } });
    hub.emit(`seller:${o.seller_id}`, 'order:update', { order: { id: o.id, status: updated.status } });
  });
}

// ------------------------------------------------------ F5 · reclamos ---

export async function claimsList(status) {
  const filter = status === 'resueltos' ? `c.status LIKE 'resuelto%'` : status === 'todos' ? 'true' : `c.status IN ('abierto','esperando_vendedor')`;
  const rows = await many(
    `SELECT c.*, o.ref, o.total_cents, s.name AS seller_name, u.handle AS buyer_handle
     FROM claims c JOIN orders o ON o.id = c.order_id JOIN sellers s ON s.id = o.seller_id JOIN users u ON u.id = c.buyer_id
     WHERE ${filter} ORDER BY c.created_at DESC LIMIT 200`
  );
  return rows.map((c) => ({
    id: c.id, orderId: c.order_id, ref: c.ref, reason: c.reason, status: c.status, seller: c.seller_name, buyer: c.buyer_handle,
    amount: bs(c.total_cents), createdAt: c.created_at, resolvedAt: c.resolved_at,
  }));
}

export async function setClaimWaiting(adminId, claimId) {
  const c = await one(`UPDATE claims SET status = 'esperando_vendedor' WHERE id = $1 AND status = 'abierto' RETURNING *`, [claimId]);
  if (!c) fail(409, 'Este reclamo no está abierto.');
  const o = await one('SELECT ref, seller_id FROM orders WHERE id = $1', [c.order_id]);
  await notify(undefined, {
    userId: await sellerUserId(o.seller_id), kind: KIND.CLAIM, title: `Necesitamos tu respuesta · ${o.ref}`,
    body: 'Contanos qué pasó con este pedido respondiendo en el chat con el comprador.', link: `/vendedor/pedidos/${c.order_id}`,
  });
  await audit(undefined, adminId, 'pedir_info_reclamo', 'claim', claimId);
}

// ------------------------------------------------- F6/F7 · personas ---

export async function sellersList({ q, status } = {}) {
  const params = [];
  let where = 'true';
  if (q) { params.push(`%${q}%`); where += ` AND (s.name ILIKE $${params.length} OR u.phone ILIKE $${params.length})`; }
  if (status) { params.push(status); where += ` AND s.status = $${params.length}`; }
  const settings = await getSettings();
  const rows = await many(
    `SELECT s.*, u.phone, u.name AS owner_name, pa.status AS account_status,
       (SELECT COALESCE(SUM(subtotal_cents), 0)::int FROM orders o WHERE o.seller_id = s.id AND o.status IN ('pagado','preparando','enviado','entregado')
          AND o.paid_at > date_trunc('month', now())) AS month_sales,
       (SELECT count(*)::int FROM products p WHERE p.seller_id = s.id AND p.status = 'active') AS products
     FROM sellers s JOIN users u ON u.id = s.user_id LEFT JOIN payout_accounts pa ON pa.seller_id = s.id
     WHERE ${where} ORDER BY s.created_at DESC LIMIT 300`,
    params
  );
  return rows.map((s) => ({
    id: s.id, name: s.name, slug: s.slug, owner: s.owner_name, phone: s.phone, status: s.status, verified: s.verified,
    plan: isPremium(s) ? 'premium' : 'basico', planUntil: s.plan_until, commissionPct: commissionBpFor(s, settings) / 100,
    commissionOverride: s.commission_bp_override != null ? s.commission_bp_override / 100 : null,
    ratingPct: s.rating_pct, salesCount: s.sales_count, monthSales: bs(s.month_sales), products: s.products,
    accountStatus: s.account_status || 'missing', createdAt: s.created_at,
  }));
}

export async function sellerDetail(sellerId) {
  const [s] = (await sellersList()).filter((x) => x.id === sellerId);
  if (!s) fail(404, 'Ese vendedor no existe.');
  const account = await one('SELECT * FROM payout_accounts WHERE seller_id = $1', [sellerId]);
  const [orders, payoutRows, claims] = await Promise.all([
    many(`SELECT id, ref, status, total_cents, created_at FROM orders WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 20`, [sellerId]),
    many(`SELECT id, period_end, status, net_cents FROM payouts WHERE seller_id = $1 ORDER BY period_end DESC LIMIT 12`, [sellerId]),
    many(`SELECT c.id, c.status, o.ref FROM claims c JOIN orders o ON o.id = c.order_id WHERE o.seller_id = $1 ORDER BY c.created_at DESC LIMIT 20`, [sellerId]),
  ]);
  return {
    ...s,
    account: account && {
      bank: account.bank, accountType: account.account_type, accountNumber: account.account_number, holder: account.holder,
      holderDoc: account.holder_doc, status: account.status, rejectReason: account.reject_reason, qrUrl: await storage.url(account.qr_key),
    },
    orders: orders.map((o) => ({ id: o.id, ref: o.ref, status: o.status, statusLabel: ORDER_STATUS_LABEL[o.status], total: bs(o.total_cents), at: o.created_at })),
    payouts: payoutRows.map((p) => ({ id: p.id, periodEnd: p.period_end, status: p.status, net: bs(p.net_cents) })),
    claims,
  };
}

export async function updateSeller(adminId, sellerId, { status, verified, commissionPct }) {
  return tx(async (q) => {
    const s = await one('SELECT * FROM sellers WHERE id = $1 FOR UPDATE', [sellerId], q);
    if (!s) fail(404, 'Ese vendedor no existe.');
    if (status && !['active', 'pending', 'suspended'].includes(status)) fail(400, 'Estado inválido.');
    const override = commissionPct === null ? null : commissionPct !== undefined ? Math.round(Number(commissionPct) * 100) : s.commission_bp_override;
    if (override != null && !(override >= 0 && override <= 10000)) fail(400, 'La comisión tiene que estar entre 0 y 100 %.');
    await q.query(
      'UPDATE sellers SET status = $2, verified = $3, commission_bp_override = $4 WHERE id = $1',
      [sellerId, status || s.status, verified ?? s.verified, override]
    );
    if (status === 'suspended' && s.status !== 'suspended') {
      await q.query(`UPDATE products SET status = 'paused' WHERE seller_id = $1 AND status = 'active'`, [sellerId]);
    }
    await audit(q, adminId, 'editar_vendedor', 'seller', sellerId, { status, verified, commissionPct });
  });
}

export async function buyersList({ q } = {}) {
  const params = [];
  let where = `u.role = 'buyer'`;
  if (q) { params.push(`%${q}%`); where += ` AND (u.name ILIKE $1 OR u.handle ILIKE $1 OR u.phone ILIKE $1)`; }
  const rows = await many(
    `SELECT u.*, (SELECT count(*)::int FROM orders o WHERE o.buyer_id = u.id AND o.status NOT IN ('vencido')) AS orders,
       (SELECT COALESCE(SUM(total_cents), 0)::int FROM orders o WHERE o.buyer_id = u.id AND o.status IN ('pagado','preparando','enviado','entregado')) AS spent,
       (SELECT count(*)::int FROM claims c WHERE c.buyer_id = u.id AND c.status IN ('abierto','esperando_vendedor')) AS open_claims,
       (SELECT count(*)::int FROM reports r WHERE r.target_user_id = u.id) AS reports
     FROM users u WHERE ${where} ORDER BY u.created_at DESC LIMIT 300`,
    params
  );
  return rows.map((u) => ({
    id: u.id, name: u.name, handle: u.handle, phone: u.phone, status: u.status, orders: u.orders, spent: bs(u.spent),
    openClaims: u.open_claims, reports: u.reports, createdAt: u.created_at,
  }));
}

export async function setUserStatus(adminId, userId, status) {
  if (!['active', 'blocked'].includes(status)) fail(400, 'Estado inválido.');
  const u = await one(`UPDATE users SET status = $2 WHERE id = $1 AND role <> 'admin' RETURNING id`, [userId, status]);
  if (!u) fail(404, 'Esa persona no existe.');
  await audit(undefined, adminId, status === 'blocked' ? 'bloquear_usuario' : 'desbloquear_usuario', 'user', userId);
}

// ------------------------------------------------- F9 · moderación ---

export async function reportsList(status = 'abierto') {
  const rows = await many(
    `SELECT r.*, b.handle AS by_handle, p.title AS product_title FROM reports r
     LEFT JOIN users b ON b.id = r.by_user_id LEFT JOIN products p ON p.id = r.product_id
     WHERE ${status === 'todos' ? 'true' : 'r.status = $1'} ORDER BY r.at DESC LIMIT 200`,
    status === 'todos' ? [] : [status]
  );
  return rows.map((r) => ({
    id: r.id, by: r.by_handle, targetHandle: r.target_handle, targetUserId: r.target_user_id, productId: r.product_id,
    productTitle: r.product_title, streamId: r.stream_id, text: r.text, reason: r.reason, status: r.status, at: r.at,
  }));
}

export async function resolveReport(adminId, reportId, status) {
  if (!['resuelto', 'descartado'].includes(status)) fail(400, 'Estado inválido.');
  const r = await one('UPDATE reports SET status = $2, resolved_by = $3 WHERE id = $1 RETURNING id', [reportId, status, adminId]);
  if (!r) fail(404, 'Ese reporte no existe.');
}

export async function moderateProduct(adminId, productId, reason) {
  if (!String(reason || '').trim()) fail(400, 'Indicá el motivo para el vendedor.');
  const p = await one(`UPDATE products SET status = 'paused' WHERE id = $1 AND status = 'active' RETURNING seller_id, title`, [productId]);
  if (!p) fail(404, 'Ese producto no está activo.');
  await notify(undefined, {
    userId: await sellerUserId(p.seller_id), kind: KIND.ORDER_UPDATE, title: `Pausamos «${p.title}»`, body: reason, link: '/vendedor/catalogo',
  });
  await audit(undefined, adminId, 'pausar_producto', 'product', productId, { reason });
}

export async function searchProducts(q) {
  const rows = await many(
    `SELECT p.id, p.title, p.status, s.name AS seller, (SELECT count(*)::int FROM reports r WHERE r.product_id = p.id) AS reports
     FROM products p JOIN sellers s ON s.id = p.seller_id WHERE p.status <> 'deleted' AND ($1 = '' OR p.title ILIKE '%' || $1 || '%')
     ORDER BY reports DESC, p.created_at DESC LIMIT 100`,
    [String(q || '')]
  );
  return rows;
}

// ------------------------------------------------- F13 · QR de cobro ---

export async function qrs() {
  const rows = await many(
    `SELECT q.*, u.name AS created_by_name FROM platform_qrs q LEFT JOIN users u ON u.id = q.created_by ORDER BY q.created_at DESC`
  );
  return Promise.all(rows.map(async (q) => ({
    id: q.id, bank: q.bank, holder: q.holder, account: q.account, active: q.active, imageUrl: await storage.url(q.image_key),
    createdAt: q.created_at, createdBy: q.created_by_name, activatedAt: q.activated_at, deactivatedAt: q.deactivated_at,
  })));
}

/** Sube un QR nuevo (queda inactivo hasta que se active, para ver antes cómo queda en D8). */
export async function addQr(adminId, { imageKey, bank, holder, account }) {
  if (!imageKey || !String(imageKey).startsWith('qrs/')) fail(400, 'Subí la imagen del QR.');
  if (!bank || !holder || !account) fail(400, 'Completá banco, titular y número de cuenta.');
  const row = await one(
    'INSERT INTO platform_qrs(id, image_key, bank, holder, account, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [id('qr'), imageKey, String(bank).trim(), String(holder).trim(), String(account).trim(), adminId]
  );
  await audit(undefined, adminId, 'subir_qr', 'platform_qr', row.id);
  return row.id;
}

/** Activa un QR (nuevo o uno anterior): los pagos nuevos lo usan desde ya. */
export async function activateQr(adminId, qrId) {
  await tx(async (q) => {
    const target = await one('SELECT id FROM platform_qrs WHERE id = $1 FOR UPDATE', [qrId], q);
    if (!target) fail(404, 'Ese QR no existe.');
    await q.query('UPDATE platform_qrs SET active = false, deactivated_at = now() WHERE active AND id <> $1', [qrId]);
    await q.query('UPDATE platform_qrs SET active = true, activated_at = now(), deactivated_at = NULL WHERE id = $1', [qrId]);
    await audit(q, adminId, 'activar_qr', 'platform_qr', qrId);
  });
  return qrs();
}

export const settings = () => getSettings({ fresh: true });

export async function updateSettings(adminId, patch) {
  const before = await getSettings({ fresh: true });
  const after = await setSettings(patch, adminId);
  const changed = Object.keys(patch).filter((k) => before[k] !== after[k]);
  if (changed.length) await audit(undefined, adminId, 'cambiar_ajustes', 'settings', null, Object.fromEntries(changed.map((k) => [k, { de: before[k], a: after[k] }])));
  return after;
}

// ----------------------------------------------- F14 · equipo y registro ---

export async function team() {
  const rows = await many(`SELECT id, name, email, admin_role, status, created_at FROM users WHERE role = 'admin' ORDER BY created_at`);
  return rows.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.admin_role, status: u.status, createdAt: u.created_at }));
}

export async function addTeamMember(adminId, { name, email, password, role }) {
  if (!['admin', 'pagos', 'moderador'].includes(role)) fail(400, 'Elegí un rol.');
  if (!email || !/@/.test(email)) fail(400, 'Escribí un email válido.');
  if (!password || password.length < 10) fail(400, 'La contraseña del panel necesita al menos 10 caracteres.');
  if (await one('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email])) fail(409, 'Ese email ya tiene una cuenta.');
  const row = await one(
    `INSERT INTO users(id, name, handle, initials, email, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'CM',$4,$5,'admin',$6) RETURNING id`,
    [id('usr'), String(name || email).trim(), `admin_${Date.now().toString(36)}`, email.trim(), hash(password), role]
  );
  await audit(undefined, adminId, 'agregar_equipo', 'user', row.id, { email, role });
  return row.id;
}

export async function updateTeamMember(adminId, userId, { role, status }) {
  if (userId === adminId && status === 'blocked') fail(400, 'No podés desactivar tu propia cuenta.');
  const row = await one(
    `UPDATE users SET admin_role = COALESCE($2, admin_role), status = COALESCE($3, status) WHERE id = $1 AND role = 'admin' RETURNING id`,
    [userId, role || null, status || null]
  );
  if (!row) fail(404, 'Esa cuenta no existe.');
  await audit(undefined, adminId, 'editar_equipo', 'user', userId, { role, status });
}

export async function auditLog({ action, limit = 200 } = {}) {
  const rows = await many(
    `SELECT a.*, u.name AS actor FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
     WHERE ($1::text IS NULL OR a.action = $1) ORDER BY a.at DESC LIMIT ${Math.min(Number(limit) || 200, 500)}`,
    [action || null]
  );
  return rows.map((a) => ({ id: a.id, actor: a.actor, action: a.action, entity: a.entity, entityId: a.entity_id, data: a.data, at: a.at }));
}
