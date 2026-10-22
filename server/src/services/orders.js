import { one, many, id, tx, fail, afterCommit } from '../db.js';
import * as storage from '../storage.js';
import * as stock from './stock.js';
import * as hub from '../realtime/hub.js';
import { notify, KIND, sellerUserId } from './notifications.js';
import { getSettings, commissionBpFor } from '../settings.js';
import { bs, commissionOf } from '../util.js';
import { ORDER_STATUS_LABEL, sellerMini } from './present.js';

/**
 * Pedidos y pagos en modo plataforma: el comprador paga a ComprasMío! con una sola
 * transferencia (aunque compre a varios vendedores), la plataforma verifica el comprobante y
 * los pedidos pasan a "Pago confirmado". Cada vendedor prepara y envía su parte.
 */

const ACTIVE_FOR_BUYER = ['pendiente_pago', 'pago_en_revision', 'pagado', 'preparando', 'enviado', 'en_reclamo'];
const REVIEW_HOLD = "interval '30 days'"; // mientras el operador revisa, lo apartado no vence

export async function activeQr(q) {
  return one('SELECT * FROM platform_qrs WHERE active ORDER BY activated_at DESC LIMIT 1', [], q);
}

async function nextPaymentRef(q) {
  return `CM-${(await one(`SELECT nextval('payment_ref_seq') AS n`, [], q)).n}`;
}

function emitOrder(q, order, event = 'order:update') {
  afterCommit(q, () => {
    const payload = { order: { id: order.id, ref: order.ref, status: order.status, statusLabel: ORDER_STATUS_LABEL[order.status], paymentId: order.payment_id } };
    hub.emit(`user:${order.buyer_id}`, event, payload);
    hub.emit(`seller:${order.seller_id}`, event, payload);
  });
}

async function event(q, orderId, status, actorId, note) {
  await q.query('INSERT INTO order_events(order_id, status, note, actor_id) VALUES ($1,$2,$3,$4)', [orderId, status, note || null, actorId || null]);
}

/**
 * Crea un pago y un pedido por grupo (vendedor), y aparta el stock. Lo usan el checkout del
 * carrito y las compras de un vivo. `groups`: [{ sellerId, channel, streamId?, deliveryMethod,
 * shippingMode, items: [{ variantId|bundleId, productId, title, label, color, photoKey, qty,
 * unitPriceCents, reservationId?, lotId? }] }]
 */
export async function createOrdersAndPayment(q, { buyerId, groups, windowMin, address, phone }) {
  if (!groups.length) fail(400, 'No hay nada para pagar.');
  const qr = await activeQr(q);
  if (!qr) fail(503, 'No pudimos cargar los datos de pago. Intentá de nuevo en unos minutos.');
  const settings = await getSettings();
  const ref = await nextPaymentRef(q);
  const expiresAt = new Date(Date.now() + windowMin * 60_000);
  const paymentId = id('pay');

  let amount = 0;
  const orders = [];
  for (const [i, g] of groups.entries()) {
    const seller = await one('SELECT * FROM sellers WHERE id = $1', [g.sellerId], q);
    if (!seller || seller.status !== 'active') fail(409, 'Uno de los vendedores ya no está activo.');
    const subtotal = g.items.reduce((s, it) => s + it.unitPriceCents * it.qty, 0);
    const bp = commissionBpFor(seller, settings);
    orders.push({
      id: id('ord'), ref: `${ref}-${i + 1}`, seller, group: g, subtotal, bp, commission: commissionOf(subtotal, bp),
    });
    amount += subtotal;
  }

  await q.query(
    `INSERT INTO payments(id, ref, user_id, kind, amount_cents, status, expires_at, qr_id) VALUES ($1,$2,$3,'orders',$4,'pending',$5,$6)`,
    [paymentId, ref, buyerId, amount, expiresAt, qr.id]
  );
  for (const o of orders) {
    const g = o.group;
    await q.query(
      `INSERT INTO orders(id, ref, payment_id, buyer_id, seller_id, channel, stream_id, status, subtotal_cents, shipping_cents,
         total_cents, commission_bp, commission_cents, delivery_method, shipping_mode, address, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente_pago',$8,0,$8,$9,$10,$11,$12,$13,$14)`,
      [o.id, o.ref, paymentId, buyerId, o.seller.id, g.channel, g.streamId || null, o.subtotal, o.bp, o.commission,
        g.deliveryMethod || 'envio', g.shippingMode || null, address ? JSON.stringify(address) : null, phone || null]
    );
    const holdItems = [];
    for (const it of g.items) {
      const itemId = id('itm');
      await q.query(
        `INSERT INTO order_items(id, order_id, variant_id, bundle_id, product_id, title, variant_label, photo_key, color, qty,
           unit_price_cents, reservation_id, lot_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [itemId, o.id, it.variantId || null, it.bundleId || null, it.productId || null, it.title, it.label || null,
          it.photoKey || null, it.color || null, it.qty, it.unitPriceCents, it.reservationId || null, it.lotId || null]
      );
      holdItems.push({ ...it, orderItemId: itemId });
    }
    await stock.holdForOrder(q, { orderId: o.id, orderRef: o.ref, items: holdItems, expiresAt });
    await event(q, o.id, 'pendiente_pago', buyerId);
  }
  return { paymentId, ref, amountCents: amount, expiresAt, orderIds: orders.map((o) => o.id) };
}

/** D7 → D8: confirma el carrito. Crea un pedido por vendedor y una sola referencia de pago. */
export async function checkout(userId, { addressId, phone, delivery = {} }) {
  const settings = await getSettings();
  return tx(async (q) => {
    const items = await many(
      `SELECT c.variant_id, c.qty, v.label, v.price_cents, p.id AS product_id, p.title, p.color, p.seller_id, p.shipping_options,
              (SELECT storage_key FROM product_photos WHERE product_id = p.id ORDER BY position LIMIT 1) AS photo_key
       FROM cart_items c JOIN variants v ON v.id = c.variant_id JOIN products p ON p.id = v.product_id
       WHERE c.user_id = $1 ORDER BY p.seller_id, c.added_at FOR UPDATE OF c`,
      [userId], q
    );
    if (!items.length) fail(400, 'Tu carrito está vacío.');
    const bySeller = new Map();
    for (const it of items) {
      if (!bySeller.has(it.seller_id)) bySeller.set(it.seller_id, []);
      bySeller.get(it.seller_id).push(it);
    }
    const needsAddress = [...bySeller.keys()].some((sid) => delivery[sid] !== 'retiro');
    let address = null;
    if (needsAddress) {
      const a = addressId
        ? await one('SELECT * FROM addresses WHERE id = $1 AND user_id = $2', [addressId, userId], q)
        : await one('SELECT * FROM addresses WHERE user_id = $1 AND is_default', [userId], q);
      if (!a) fail(400, 'Agregá una dirección de entrega.');
      address = { label: a.label, city: a.city, zone: a.zone, street: a.street, reference: a.reference };
      phone = phone || a.phone;
    }
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    if (cleanPhone.length < 8) fail(400, 'Agregá un teléfono de contacto.');

    const groups = [...bySeller.entries()].map(([sellerId, rows]) => {
      const method = delivery[sellerId] === 'retiro' ? 'retiro' : 'envio';
      if (method === 'retiro' && !rows.every((r) => r.shipping_options.includes('retiro')))
        fail(400, 'Uno de los vendedores no ofrece retiro en persona para esos productos.');
      return {
        sellerId,
        channel: 'catalogo',
        deliveryMethod: method,
        shippingMode: rows.every((r) => r.shipping_options.includes('envio_gratis')) ? 'envio_gratis' : 'a_convenir',
        items: rows.map((r) => ({
          variantId: r.variant_id, productId: r.product_id, title: r.title, label: r.label, color: r.color,
          photoKey: r.photo_key, qty: r.qty, unitPriceCents: r.price_cents,
        })),
      };
    });
    const created = await createOrdersAndPayment(q, {
      buyerId: userId, groups, windowMin: settings.payment_window_catalog_min, address, phone: cleanPhone,
    });
    await q.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
    for (const oid of created.orderIds) {
      const o = await one('SELECT * FROM orders WHERE id = $1', [oid], q);
      afterCommit(q, () => hub.emit(`seller:${o.seller_id}`, 'order:new', { order: { id: o.id, ref: o.ref, status: o.status } }));
    }
    return created;
  });
}

// ------------------------------------------------------------- pago D8 ---

export async function paymentView(userId, paymentId, { admin = false } = {}) {
  const p = await one('SELECT * FROM payments WHERE id = $1', [paymentId]);
  if (!p || (!admin && p.user_id !== userId)) fail(404, 'Ese pago no existe.');
  const qr = p.qr_id ? await one('SELECT * FROM platform_qrs WHERE id = $1', [p.qr_id]) : await activeQr();
  const current = await activeQr();
  const orders = await many(
    `SELECT o.*, s.name AS seller_name FROM orders o JOIN sellers s ON s.id = o.seller_id WHERE o.payment_id = $1 ORDER BY o.ref`,
    [paymentId]
  );
  const settings = await getSettings();
  // Si el QR se cambió mientras la persona pagaba, sigue viendo el que tenía (puede terminar su pago).
  const shown = qr || current;
  return {
    id: p.id,
    ref: p.ref,
    kind: p.kind,
    amount: bs(p.amount_cents),
    status: p.status,
    expiresAt: p.expires_at,
    rejectReason: p.reject_reason,
    receiptUrl: await storage.url(p.receipt_key),
    receiptAt: p.receipt_at,
    qr: shown ? {
      imageUrl: await storage.url(shown.image_key),
      bank: shown.bank,
      holder: shown.holder,
      account: shown.account,
      platformName: settings.platform_name,
    } : null,
    orders: orders.map((o) => ({
      id: o.id, ref: o.ref, status: o.status, statusLabel: ORDER_STATUS_LABEL[o.status], seller: o.seller_name,
      total: bs(o.total_cents), channel: o.channel,
    })),
  };
}

/** "Ya pagué · Enviar comprobante": el pago queda en revisión y lo apartado deja de vencer. */
export async function submitReceipt(userId, paymentId, receiptKey) {
  if (!receiptKey) fail(400, 'Adjuntá una foto o PDF del comprobante.');
  const result = await tx(async (q) => {
    const p = await one('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId], q);
    if (!p || p.user_id !== userId) fail(404, 'Ese pago no existe.');
    if (p.status === 'in_review') fail(409, 'Ya enviaste el comprobante. Lo estamos verificando.');
    if (p.status === 'expired') fail(410, 'El tiempo para pagar terminó. Liberamos el stock; podés volver a intentarlo.');
    if (p.status !== 'pending') fail(409, 'Este pago ya no admite comprobantes.');
    if (p.expires_at && new Date(p.expires_at) < new Date()) {
      // Se vence en esta misma transacción (que sí se confirma) y se avisa después.
      await expirePayment(q, p);
      return 'expired';
    }
    await q.query(
      `UPDATE payments SET status = 'in_review', receipt_key = $2, receipt_at = now(), reject_reason = NULL WHERE id = $1`,
      [paymentId, receiptKey]
    );
    if (p.kind === 'orders') {
      const orders = await many(`UPDATE orders SET status = 'pago_en_revision' WHERE payment_id = $1 RETURNING *`, [paymentId], q);
      await q.query(
        `UPDATE stock_holds SET expires_at = now() + ${REVIEW_HOLD} WHERE released_at IS NULL AND order_id = ANY($1)`,
        [orders.map((o) => o.id)]
      );
      for (const o of orders) {
        await event(q, o.id, 'pago_en_revision', userId);
        emitOrder(q, o);
      }
    }
    afterCommit(q, () => hub.emit('admin', 'payment:new', { paymentId }));
    return 'ok';
  });
  if (result === 'expired') fail(410, 'El tiempo para pagar terminó. Liberamos el stock; podés volver a intentarlo.');
  return paymentView(userId, paymentId);
}

/** F2 · Aprobar: los pedidos pasan a "Pago confirmado" y el stock apartado se da por vendido. */
export async function approvePayment(adminId, paymentId) {
  return tx(async (q) => {
    const p = await one('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId], q);
    if (!p) fail(404, 'Ese pago no existe.');
    if (p.status !== 'in_review') fail(409, 'Este pago no está esperando verificación.');
    await q.query(`UPDATE payments SET status = 'approved', reviewed_by = $2, reviewed_at = now() WHERE id = $1`, [paymentId, adminId]);
    await q.query(
      `INSERT INTO audit_log(actor_id, action, entity, entity_id, data) VALUES ($1, 'aprobar_pago', 'payment', $2, $3)`,
      [adminId, paymentId, JSON.stringify({ ref: p.ref, amount_cents: p.amount_cents })]
    );

    if (p.kind === 'plan') {
      const { activatePremiumFromPayment } = await import('./plans.js');
      await activatePremiumFromPayment(q, p, adminId);
      return { ok: true };
    }

    const orders = await many(`SELECT * FROM orders WHERE payment_id = $1 ORDER BY ref FOR UPDATE`, [paymentId], q);
    for (const o of orders) {
      await stock.confirmHolds(q, o.id, o.ref);
      const updated = await one(`UPDATE orders SET status = 'pagado', paid_at = now() WHERE id = $1 RETURNING *`, [o.id], q);
      await event(q, o.id, 'pagado', adminId);
      await q.query('UPDATE sellers SET sales_count = sales_count + 1 WHERE id = $1', [o.seller_id]);
      emitOrder(q, updated);
      const seller = await one('SELECT name FROM sellers WHERE id = $1', [o.seller_id], q);
      await systemMessage(q, o, `ComprasMío! confirmó el pago del pedido ${o.ref}. ${seller.name} lo va a preparar.`);
      await notify(q, {
        userId: await sellerUserId(o.seller_id, q), kind: KIND.ORDER_NEW,
        title: 'Pedido para preparar', body: `${o.ref} · ${bs(o.total_cents)} Bs. El pago ya está confirmado.`,
        link: `/vendedor/pedidos/${o.id}`,
      });
    }
    await notify(q, {
      userId: p.user_id, kind: KIND.PAYMENT_APPROVED, title: 'Pago confirmado',
      body: orders.length > 1 ? `Confirmamos tu pago ${p.ref}. Cada vendedor ya está preparando su parte.` : `Confirmamos tu pago ${p.ref}.`,
      link: orders.length === 1 ? `/compras/${orders[0].id}` : '/compras',
    });
    afterCommit(q, () => hub.emit(`user:${p.user_id}`, 'payment:update', { paymentId, status: 'approved' }));
    return { ok: true };
  });
}

/**
 * F2 · Rechazar: el comprador recibe el motivo y tiene una nueva ventana para reenviar el
 * comprobante. Si no lo hace a tiempo, el pedido vence y el stock se libera.
 */
export async function rejectPayment(adminId, paymentId, reason) {
  const text = String(reason || '').trim();
  if (!text) fail(400, 'Indicá el motivo del rechazo.');
  const settings = await getSettings();
  return tx(async (q) => {
    const p = await one('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId], q);
    if (!p) fail(404, 'Ese pago no existe.');
    if (p.status !== 'in_review') fail(409, 'Este pago no está esperando verificación.');
    const live = await one(`SELECT 1 FROM orders WHERE payment_id = $1 AND channel <> 'catalogo'`, [paymentId], q);
    const minutes = live ? settings.payment_window_live_min : settings.payment_window_catalog_min;
    const expiresAt = new Date(Date.now() + Math.max(minutes, 15) * 60_000);
    await q.query(
      `UPDATE payments SET status = 'pending', reject_reason = $2, reviewed_by = $3, reviewed_at = now(), expires_at = $4 WHERE id = $1`,
      [paymentId, text.slice(0, 200), adminId, expiresAt]
    );
    await q.query(
      `INSERT INTO audit_log(actor_id, action, entity, entity_id, data) VALUES ($1, 'rechazar_pago', 'payment', $2, $3)`,
      [adminId, paymentId, JSON.stringify({ ref: p.ref, reason: text })]
    );
    if (p.kind === 'orders') {
      const orders = await many(`UPDATE orders SET status = 'pendiente_pago' WHERE payment_id = $1 RETURNING *`, [paymentId], q);
      await q.query('UPDATE stock_holds SET expires_at = $2 WHERE released_at IS NULL AND order_id = ANY($1)', [orders.map((o) => o.id), expiresAt]);
      for (const o of orders) {
        await event(q, o.id, 'pendiente_pago', adminId, `Comprobante rechazado: ${text}`);
        emitOrder(q, o);
      }
    }
    await notify(q, {
      userId: p.user_id, kind: KIND.PAYMENT_REJECTED, title: 'Revisá tu comprobante',
      body: `${text}. Podés enviarlo de nuevo antes de las ${expiresAt.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' })}.`,
      link: `/pago/${paymentId}`,
    });
    afterCommit(q, () => hub.emit(`user:${p.user_id}`, 'payment:update', { paymentId, status: 'pending' }));
    return { ok: true };
  });
}

async function expirePayment(q, p) {
  await q.query(`UPDATE payments SET status = 'expired' WHERE id = $1`, [p.id]);
  if (p.kind !== 'orders') return;
  const orders = await many(`UPDATE orders SET status = 'vencido', expired_at = now() WHERE payment_id = $1 RETURNING *`, [p.id], q);
  for (const o of orders) {
    await stock.releaseHolds(q, o.id, 'vencido', o.ref);
    await event(q, o.id, 'vencido', null);
    emitOrder(q, o);
  }
  afterCommit(q, () => hub.emit(`user:${p.user_id}`, 'payment:update', { paymentId: p.id, status: 'expired' }));
}

/** Proceso programado: vence los pagos sin comprobante cuya ventana terminó. */
export async function expireDuePayments() {
  const due = await many(`SELECT id FROM payments WHERE status = 'pending' AND expires_at < now() LIMIT 200`);
  let n = 0;
  for (const { id: pid } of due) {
    await tx(async (q) => {
      const p = await one(`SELECT * FROM payments WHERE id = $1 AND status = 'pending' AND expires_at < now() FOR UPDATE SKIP LOCKED`, [pid], q);
      if (!p) return;
      await expirePayment(q, p);
      n++;
    });
  }
  return n;
}

// -------------------------------------------------------------- pedidos ---

async function orderRows(where, params) {
  return many(
    `SELECT o.*, s.name AS seller_name, s.slug AS seller_slug, s.initials AS seller_initials, s.color AS seller_color,
            u.name AS buyer_name, u.handle AS buyer_handle, u.initials AS buyer_initials,
            p.expires_at AS payment_expires_at, p.ref AS payment_ref,
            (SELECT count(*)::int FROM order_items i WHERE i.order_id = o.id) AS items_count,
            (SELECT COALESCE(sum(qty), 0)::int FROM order_items i WHERE i.order_id = o.id) AS units,
            (SELECT title FROM order_items i WHERE i.order_id = o.id ORDER BY id LIMIT 1) AS first_title,
            (SELECT photo_key FROM order_items i WHERE i.order_id = o.id ORDER BY id LIMIT 1) AS first_photo,
            (SELECT color FROM order_items i WHERE i.order_id = o.id ORDER BY id LIMIT 1) AS first_color
     FROM orders o JOIN sellers s ON s.id = o.seller_id JOIN users u ON u.id = o.buyer_id JOIN payments p ON p.id = o.payment_id
     WHERE ${where} ORDER BY o.created_at DESC LIMIT 200`,
    params
  );
}

async function orderCard(o) {
  return {
    id: o.id,
    ref: o.ref,
    status: o.status,
    statusLabel: ORDER_STATUS_LABEL[o.status],
    channel: o.channel,
    total: bs(o.total_cents),
    net: bs(o.total_cents - o.commission_cents),
    itemsCount: o.items_count,
    units: o.units,
    title: o.first_title,
    photoUrl: await storage.url(o.first_photo),
    color: o.first_color,
    seller: { id: o.seller_id, name: o.seller_name, slug: o.seller_slug, initials: o.seller_initials, color: o.seller_color },
    buyer: { id: o.buyer_id, name: o.buyer_name, handle: o.buyer_handle, initials: o.buyer_initials },
    paymentId: o.payment_id,
    paymentExpiresAt: o.status === 'pendiente_pago' ? o.payment_expires_at : null,
    createdAt: o.created_at,
  };
}

const BUYER_FILTERS = {
  todos: null,
  pago_en_revision: ['pago_en_revision'],
  en_camino: ['pagado', 'preparando', 'enviado'],
  entregados: ['entregado'],
  en_reclamo: ['en_reclamo'],
};

/** B6: mis compras. Los pendientes de pago se muestran aparte, arriba, con su cuenta atrás. */
export async function buyerOrders(userId, filter = 'todos') {
  const rows = await orderRows('o.buyer_id = $1', [userId]);
  const pending = rows.filter((o) => o.status === 'pendiente_pago');
  const statuses = BUYER_FILTERS[filter];
  const rest = rows.filter((o) => o.status !== 'pendiente_pago' && (!statuses || statuses.includes(o.status)));
  const counts = Object.fromEntries(Object.entries(BUYER_FILTERS).map(([k, s]) => [k, rows.filter((o) => o.status !== 'pendiente_pago' && (!s || s.includes(o.status))).length]));
  return {
    pending: await Promise.all(pending.map(orderCard)),
    items: await Promise.all(rest.map(orderCard)),
    counts,
    pendingCount: pending.length,
  };
}

const SELLER_FILTERS = {
  por_preparar: ['pagado', 'preparando'],
  enviados: ['enviado'],
  entregados: ['entregado'],
  en_reclamo: ['en_reclamo'],
  pendientes: ['pendiente_pago', 'pago_en_revision'],
  todos: null,
};

/** E5: pedidos del vendedor por estado. */
export async function sellerOrders(sellerId, filter = 'por_preparar') {
  const rows = await orderRows(`o.seller_id = $1 AND o.status NOT IN ('vencido')`, [sellerId]);
  const statuses = SELLER_FILTERS[filter] ?? SELLER_FILTERS.por_preparar;
  const counts = Object.fromEntries(Object.entries(SELLER_FILTERS).map(([k, s]) => [k, rows.filter((o) => !s || s.includes(o.status)).length]));
  return {
    items: await Promise.all(rows.filter((o) => !statuses || statuses.includes(o.status)).map(orderCard)),
    counts,
  };
}

/** D11 / E6: detalle con ítems, línea de tiempo, entrega, reclamo y (para el vendedor) lo que recibe. */
export async function orderDetail(viewer, orderId, { admin = false } = {}) {
  const [o] = await orderRows('o.id = $1', [orderId]);
  if (!o) fail(404, 'Ese pedido no existe.');
  const asBuyer = viewer && o.buyer_id === viewer.id;
  const asSeller = viewer && viewer.seller_id && o.seller_id === viewer.seller_id;
  if (!asBuyer && !asSeller && !admin) fail(404, 'Ese pedido no existe.');

  const [items, events, claim, review, payment, payout] = await Promise.all([
    many('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [orderId]),
    many('SELECT status, note, at FROM order_events WHERE order_id = $1 ORDER BY at, id', [orderId]),
    one('SELECT * FROM claims WHERE order_id = $1', [orderId]),
    one('SELECT * FROM reviews WHERE order_id = $1', [orderId]),
    one('SELECT * FROM payments WHERE id = $1', [o.payment_id]),
    o.payout_id ? one('SELECT * FROM payouts WHERE id = $1', [o.payout_id]) : null,
  ]);
  const settings = await getSettings();
  const at = (s) => events.filter((e) => e.status === s).at(-1)?.at || null;
  const steps = [
    { key: 'pagado', label: 'Pago confirmado', at: o.paid_at || at('pagado') },
    { key: 'preparando', label: 'Preparando', at: o.preparing_at || at('preparando') },
    { key: 'enviado', label: 'Enviado', at: o.shipped_at || at('enviado'), detail: o.carrier || o.tracking ? [o.carrier, o.tracking && `Guía ${o.tracking}`].filter(Boolean).join(' · ') : null },
    { key: 'entregado', label: 'Entregado', at: o.delivered_at || at('entregado'), detail: o.status === 'enviado' ? 'Confirmalo cuando te llegue' : null },
  ];
  const base = await orderCard(o);
  const detail = {
    ...base,
    items: await Promise.all(items.map(async (i) => ({
      id: i.id, title: i.title, label: i.variant_label, qty: i.qty, unitPrice: bs(i.unit_price_cents),
      total: bs(i.unit_price_cents * i.qty), photoUrl: await storage.url(i.photo_key), color: i.color,
      productId: i.product_id, isBundle: Boolean(i.bundle_id),
    }))),
    subtotal: bs(o.subtotal_cents),
    shipping: bs(o.shipping_cents),
    shippingMode: o.shipping_mode,
    deliveryMethod: o.delivery_method,
    address: o.address,
    phone: o.phone,
    carrier: o.carrier,
    tracking: o.tracking,
    steps,
    events,
    paymentRef: o.payment_ref,
    receiptUrl: asBuyer || admin ? await storage.url(payment?.receipt_key) : null,
    claim: claim && {
      id: claim.id, reason: claim.reason, description: claim.description, status: claim.status,
      photos: await Promise.all(claim.photo_keys.map((k) => storage.url(k))), createdAt: claim.created_at,
      resolutionNote: claim.resolution_note, refund: bs(claim.refund_cents),
    },
    review: review && { rating: review.rating, comment: review.comment, reply: review.reply, at: review.created_at },
    canConfirm: asBuyer && o.status === 'enviado',
    canClaim: asBuyer && ['pagado', 'preparando', 'enviado', 'entregado'].includes(o.status) && !o.payout_id && !claim,
    canReview: asBuyer && o.status === 'entregado' && !review,
    autoDeliverDays: settings.auto_deliver_days,
  };
  if (asSeller || admin) {
    const { nextPayoutDate } = await import('./payouts.js');
    detail.commissionPct = o.commission_bp / 100;
    detail.commission = bs(o.commission_cents);
    detail.net = bs(o.total_cents - o.commission_cents);
    detail.payout = payout
      ? { id: payout.id, status: payout.status, date: payout.scheduled_for }
      : o.status === 'en_reclamo' ? { status: 'retenida' } : ['pagado', 'preparando', 'enviado', 'entregado'].includes(o.status)
        ? { status: 'acumulando', date: nextPayoutDate(o.delivered_at || new Date(), settings) } : null;
  }
  return detail;
}

async function lockOrder(q, orderId) {
  const o = await one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId], q);
  if (!o) fail(404, 'Ese pedido no existe.');
  return o;
}

/** E5/E6 · el vendedor avanza el pedido: Preparando → Enviado (con guía opcional). */
export async function sellerAdvance(seller, orderId, { to, carrier, tracking }) {
  return tx(async (q) => {
    const o = await lockOrder(q, orderId);
    if (o.seller_id !== seller.seller_id) fail(404, 'Ese pedido no existe.');
    const allowed = { preparando: ['pagado'], enviado: ['pagado', 'preparando'] }[to];
    if (!allowed) fail(400, 'Estado inválido.');
    if (!allowed.includes(o.status)) fail(409, `Este pedido está «${ORDER_STATUS_LABEL[o.status]}» y no se puede marcar así.`);
    const updated = to === 'preparando'
      ? await one(`UPDATE orders SET status = 'preparando', preparing_at = now() WHERE id = $1 RETURNING *`, [o.id], q)
      : await one(
        `UPDATE orders SET status = 'enviado', shipped_at = now(), preparing_at = COALESCE(preparing_at, now()),
           carrier = $2, tracking = $3 WHERE id = $1 RETURNING *`,
        [o.id, String(carrier || '').slice(0, 60) || null, String(tracking || '').slice(0, 60) || null], q
      );
    await event(q, o.id, to, seller.id);
    emitOrder(q, updated);
    if (to === 'enviado') {
      await notify(q, {
        userId: o.buyer_id, kind: KIND.ORDER_UPDATE, title: 'Tu pedido está en camino',
        body: `${o.ref}${tracking ? ` · guía ${tracking}` : ''}. Confirmalo cuando te llegue.`, link: `/compras/${o.id}`,
      });
    }
    return updated.status;
  });
}

/** D12 · el comprador confirma que recibió todo bien. */
export async function confirmReceived(userId, orderId) {
  return tx(async (q) => {
    const o = await lockOrder(q, orderId);
    if (o.buyer_id !== userId) fail(404, 'Ese pedido no existe.');
    if (o.status !== 'enviado') fail(409, 'Solo podés confirmar un pedido enviado.');
    const updated = await one(`UPDATE orders SET status = 'entregado', delivered_at = now() WHERE id = $1 RETURNING *`, [o.id], q);
    await event(q, o.id, 'entregado', userId, 'Confirmado por el comprador');
    emitOrder(q, updated);
    await notify(q, {
      userId: await sellerUserId(o.seller_id, q), kind: KIND.ORDER_UPDATE, title: 'Pedido entregado',
      body: `El comprador confirmó la recepción de ${o.ref}. Entra en tu próximo pago semanal.`, link: `/vendedor/pedidos/${o.id}`,
    });
  });
}

/** Proceso programado: un pedido enviado se da por entregado a los N días sin confirmación ni reclamo. */
export async function autoDeliver() {
  const settings = await getSettings();
  const rows = await many(
    `SELECT id FROM orders WHERE status = 'enviado' AND shipped_at < now() - ($1 || ' days')::interval LIMIT 500`,
    [String(settings.auto_deliver_days)]
  );
  for (const { id: oid } of rows) {
    await tx(async (q) => {
      const o = await one(`SELECT * FROM orders WHERE id = $1 AND status = 'enviado' FOR UPDATE SKIP LOCKED`, [oid], q);
      if (!o) return;
      const updated = await one(`UPDATE orders SET status = 'entregado', delivered_at = now() WHERE id = $1 RETURNING *`, [o.id], q);
      await event(q, o.id, 'entregado', null, `Entregado automáticamente a los ${settings.auto_deliver_days} días`);
      emitOrder(q, updated);
    });
  }
  return rows.length;
}

// ------------------------------------------------------- reclamos D13 ---

const CLAIM_REASONS = { no_llego: 'No llegó', danado: 'Llegó dañado', no_es_lo_que_compre: 'No es lo que compré', otro: 'Otro' };

export async function openClaim(userId, orderId, { reason, description, photoKeys = [] }) {
  if (!CLAIM_REASONS[reason]) fail(400, 'Elegí qué pasó.');
  return tx(async (q) => {
    const o = await lockOrder(q, orderId);
    if (o.buyer_id !== userId) fail(404, 'Ese pedido no existe.');
    if (!['pagado', 'preparando', 'enviado', 'entregado'].includes(o.status)) fail(409, 'Este pedido no admite reclamos.');
    if (o.payout_id) fail(409, 'Este pedido ya se liquidó al vendedor. Escribinos a soporte para revisarlo.');
    if (await one('SELECT 1 FROM claims WHERE order_id = $1', [o.id], q)) fail(409, 'Ya abriste un reclamo para este pedido.');
    const claimId = id('clm');
    await q.query(
      `INSERT INTO claims(id, order_id, buyer_id, reason, description, photo_keys, previous_status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [claimId, o.id, userId, reason, String(description || '').slice(0, 1000) || null,
        photoKeys.filter((k) => typeof k === 'string' && k.startsWith('claims/')).slice(0, 5), o.status]
    );
    const updated = await one(`UPDATE orders SET status = 'en_reclamo' WHERE id = $1 RETURNING *`, [o.id], q);
    await event(q, o.id, 'en_reclamo', userId, CLAIM_REASONS[reason]);
    emitOrder(q, updated);
    await notify(q, {
      userId: await sellerUserId(o.seller_id, q), kind: KIND.CLAIM, title: 'Reclamo abierto',
      body: `${o.ref}: «${CLAIM_REASONS[reason]}». El pago de este pedido queda retenido mientras se revisa.`,
      link: `/vendedor/pedidos/${o.id}`,
    });
    afterCommit(q, () => hub.emit('admin', 'claim:new', { claimId }));
    return claimId;
  });
}

/**
 * F5 · resolver un reclamo. A favor del vendedor: el pedido vuelve a su estado (o a entregado) y
 * entra en la próxima liquidación. A favor del comprador: se reembolsa (total o parcial) y el
 * pedido queda cancelado; opcionalmente vuelve el stock.
 */
export async function resolveClaim(adminId, claimId, { outcome, note, refund, refundReceiptKey, restock = false }) {
  if (!['comprador', 'vendedor'].includes(outcome)) fail(400, 'Indicá a favor de quién se resuelve.');
  return tx(async (q) => {
    const c = await one('SELECT * FROM claims WHERE id = $1 FOR UPDATE', [claimId], q);
    if (!c) fail(404, 'Ese reclamo no existe.');
    if (c.status.startsWith('resuelto')) fail(409, 'Este reclamo ya está resuelto.');
    const o = await lockOrder(q, c.order_id);
    let updated;
    if (outcome === 'vendedor') {
      const back = c.previous_status === 'enviado' || c.previous_status === 'entregado' ? 'entregado' : c.previous_status;
      updated = await one(
        `UPDATE orders SET status = $2, delivered_at = CASE WHEN $2 = 'entregado' THEN COALESCE(delivered_at, now()) ELSE delivered_at END
         WHERE id = $1 RETURNING *`,
        [o.id, back], q
      );
      await q.query(`UPDATE claims SET status = 'resuelto_vendedor', resolution_note = $2, resolved_by = $3, resolved_at = now() WHERE id = $1`, [c.id, note || null, adminId]);
      await event(q, o.id, back, adminId, 'Reclamo resuelto a favor del vendedor');
    } else {
      const refundCents = refund != null ? Math.round(Number(refund) * 100) : o.total_cents;
      if (!(refundCents > 0) || refundCents > o.total_cents) fail(400, 'El monto a reembolsar no es válido.');
      updated = await one(`UPDATE orders SET status = 'cancelado', cancelled_at = now() WHERE id = $1 RETURNING *`, [o.id], q);
      await q.query(
        `UPDATE claims SET status = 'resuelto_comprador', resolution_note = $2, refund_cents = $3, refund_receipt_key = $4,
           resolved_by = $5, resolved_at = now() WHERE id = $1`,
        [c.id, note || null, refundCents, refundReceiptKey || null, adminId]
      );
      if (restock) await stock.restock(q, o.id, o.ref, adminId);
      await event(q, o.id, 'cancelado', adminId, `Reembolso de Bs ${bs(refundCents)}`);
    }
    await q.query(
      `INSERT INTO audit_log(actor_id, action, entity, entity_id, data) VALUES ($1, 'resolver_reclamo', 'claim', $2, $3)`,
      [adminId, c.id, JSON.stringify({ outcome, order: o.ref })]
    );
    emitOrder(q, updated);
    const msg = outcome === 'vendedor' ? 'Revisamos tu reclamo y lo cerramos a favor del vendedor.' : 'Revisamos tu reclamo: te reembolsamos el pago.';
    await notify(q, { userId: o.buyer_id, kind: KIND.CLAIM, title: `Reclamo de ${o.ref} resuelto`, body: note ? `${msg} ${note}` : msg, link: `/compras/${o.id}` });
    await notify(q, {
      userId: await sellerUserId(o.seller_id, q), kind: KIND.CLAIM, title: `Reclamo de ${o.ref} resuelto`,
      body: outcome === 'vendedor' ? 'Se resolvió a tu favor: el pedido entra en tu próximo pago.' : 'Se resolvió a favor del comprador y se le reembolsó.',
      link: `/vendedor/pedidos/${o.id}`,
    });
  });
}

// --------------------------------------------------------- reseñas D12 ---

export async function review(userId, orderId, { rating, comment, photoKey }) {
  const r = Number.parseInt(rating, 10);
  if (!(r >= 1 && r <= 5)) fail(400, 'Elegí de 1 a 5 estrellas.');
  return tx(async (q) => {
    const o = await lockOrder(q, orderId);
    if (o.buyer_id !== userId) fail(404, 'Ese pedido no existe.');
    if (o.status !== 'entregado') fail(409, 'Podés calificar cuando el pedido esté entregado.');
    if (await one('SELECT 1 FROM reviews WHERE order_id = $1', [o.id], q)) fail(409, 'Ya calificaste este pedido.');
    const first = await one('SELECT product_id FROM order_items WHERE order_id = $1 AND product_id IS NOT NULL ORDER BY id LIMIT 1', [o.id], q);
    await q.query(
      `INSERT INTO reviews(id, order_id, seller_id, buyer_id, product_id, rating, comment, photo_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id('rev'), o.id, o.seller_id, userId, first?.product_id || null, r, String(comment || '').slice(0, 1000) || null,
        photoKey && String(photoKey).startsWith('reviews/') ? photoKey : null]
    );
    await refreshSellerRating(q, o.seller_id);
    await notify(q, {
      userId: await sellerUserId(o.seller_id, q), kind: KIND.REVIEW, title: `Nueva reseña · ${'★'.repeat(r)}`,
      body: comment ? String(comment).slice(0, 120) : `Calificaron el pedido ${o.ref}.`, link: '/vendedor/resenas',
    });
  });
}

export async function refreshSellerRating(q, sellerId) {
  await q.query(
    `UPDATE sellers SET
       rating_count = s.n, rating_avg = s.avg, rating_pct = CASE WHEN s.n = 0 THEN 100 ELSE round(100.0 * s.good / s.n) END
     FROM (SELECT count(*)::int AS n, COALESCE(avg(rating), 0) AS avg, count(*) FILTER (WHERE rating >= 4)::int AS good
           FROM reviews WHERE seller_id = $1) s
     WHERE id = $1`,
    [sellerId]
  );
}

/** E12: reseñas recibidas por el vendedor. `stars` filtra. */
export async function sellerReviews(sellerId, { stars } = {}) {
  const params = [sellerId];
  let filter = '';
  if (stars) { params.push(Number(stars)); filter = ` AND r.rating = $2`; }
  const rows = await many(
    `SELECT r.*, u.name AS buyer_name, u.initials AS buyer_initials, p.title AS product_title
     FROM reviews r JOIN users u ON u.id = r.buyer_id LEFT JOIN products p ON p.id = r.product_id
     WHERE r.seller_id = $1${filter} ORDER BY r.created_at DESC LIMIT 100`,
    params
  );
  const dist = await many('SELECT rating, count(*)::int AS n FROM reviews WHERE seller_id = $1 GROUP BY rating', [sellerId]);
  const s = await one('SELECT rating_avg, rating_count, rating_pct FROM sellers WHERE id = $1', [sellerId]);
  return {
    avg: s.rating_avg,
    count: s.rating_count,
    pct: s.rating_pct,
    unanswered: (await one('SELECT count(*)::int AS n FROM reviews WHERE seller_id = $1 AND reply IS NULL', [sellerId])).n,
    distribution: Object.fromEntries([5, 4, 3, 2, 1].map((k) => [k, dist.find((d) => d.rating === k)?.n || 0])),
    items: await Promise.all(rows.map(async (r) => ({
      id: r.id, rating: r.rating, comment: r.comment, buyer: r.buyer_name, initials: r.buyer_initials,
      product: r.product_title, photoUrl: await storage.url(r.photo_key), reply: r.reply, repliedAt: r.replied_at, at: r.created_at,
    }))),
  };
}

export async function replyReview(sellerId, reviewId, text) {
  const reply = String(text || '').trim();
  if (!reply) fail(400, 'Escribí tu respuesta.');
  const row = await one(
    `UPDATE reviews SET reply = $3, replied_at = now() WHERE id = $1 AND seller_id = $2 AND reply IS NULL RETURNING id`,
    [reviewId, sellerId, reply.slice(0, 600)]
  );
  if (!row) fail(409, 'Esta reseña ya tiene respuesta.');
}

/** Reseñas públicas de una tienda (D9, pestaña Reseñas). */
export async function publicReviews(sellerId) {
  const rows = await many(
    `SELECT r.rating, r.comment, r.reply, r.created_at, u.name AS buyer_name, u.initials, p.title AS product
     FROM reviews r JOIN users u ON u.id = r.buyer_id LEFT JOIN products p ON p.id = r.product_id
     WHERE r.seller_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
    [sellerId]
  );
  return rows.map((r) => ({ rating: r.rating, comment: r.comment, reply: r.reply, at: r.created_at, buyer: r.buyer_name, initials: r.initials, product: r.product }));
}

// --------------------------------------------------------- mensajes ---

export async function systemMessage(q, order, text) {
  const row = await one(
    `INSERT INTO messages(id, buyer_id, seller_id, sender, text, order_id) VALUES ($1,$2,$3,'system',$4,$5) RETURNING *`,
    [id('msg'), order.buyer_id, order.seller_id, text, order.id], q
  );
  afterCommit(q, () => {
    hub.emit(`user:${order.buyer_id}`, 'thread:new', { message: row });
    hub.emit(`seller:${order.seller_id}`, 'thread:new', { message: row });
  });
}

export const isOpenForBuyer = (status) => ACTIVE_FOR_BUYER.includes(status);
