import { one, many, id, fail } from '../db.js';
import * as hub from '../realtime/hub.js';
import { notify, KIND, sellerUserId } from './notifications.js';
import { ORDER_STATUS_LABEL } from './present.js';
import * as storage from '../storage.js';
import { bs } from '../util.js';

/**
 * Chat comprador ↔ vendedor (B7 y su vista vendedor desde C8). Una conversación continua por par
 * comprador-vendedor; la tarjeta fijada muestra el último pedido entre ambos.
 */

async function pinnedOrder(buyerId, sellerId, orderId) {
  const o = orderId
    ? await one('SELECT * FROM orders WHERE id = $1 AND buyer_id = $2 AND seller_id = $3', [orderId, buyerId, sellerId])
    : await one(`SELECT * FROM orders WHERE buyer_id = $1 AND seller_id = $2 AND status <> 'vencido' ORDER BY created_at DESC LIMIT 1`, [buyerId, sellerId]);
  if (!o) return null;
  const item = await one('SELECT title, photo_key, color FROM order_items WHERE order_id = $1 ORDER BY id LIMIT 1', [o.id]);
  return {
    id: o.id, ref: o.ref, status: o.status, statusLabel: ORDER_STATUS_LABEL[o.status], total: bs(o.total_cents),
    title: item?.title, color: item?.color, photoUrl: await storage.url(item?.photo_key),
  };
}

const out = (m) => ({ id: m.id, sender: m.sender, text: m.text, orderId: m.order_id, at: m.at, readAt: m.read_at, buyerId: m.buyer_id, sellerId: m.seller_id });

export async function thread({ buyerId, sellerId, viewer, orderId }) {
  const rows = await many('SELECT * FROM messages WHERE buyer_id = $1 AND seller_id = $2 ORDER BY at, id LIMIT 500', [buyerId, sellerId]);
  // Al abrir el hilo se marcan como leídos los mensajes de la otra parte.
  const other = viewer === 'buyer' ? 'seller' : 'buyer';
  await many(`UPDATE messages SET read_at = now() WHERE buyer_id = $1 AND seller_id = $2 AND sender IN ($3, 'system') AND read_at IS NULL RETURNING 1`, [buyerId, sellerId, other]);
  const [seller, buyer] = await Promise.all([
    one('SELECT id, name, slug, initials, color, avatar_key FROM sellers WHERE id = $1', [sellerId]),
    one('SELECT id, name, handle, initials FROM users WHERE id = $1', [buyerId]),
  ]);
  if (!seller || !buyer) fail(404, 'Esa conversación no existe.');
  return {
    seller: { id: seller.id, name: seller.name, slug: seller.slug, initials: seller.initials, color: seller.color, avatarUrl: await storage.url(seller.avatar_key) },
    buyer: { id: buyer.id, name: buyer.name, handle: buyer.handle, initials: buyer.initials },
    order: await pinnedOrder(buyerId, sellerId, orderId),
    messages: rows.map(out),
  };
}

export async function send({ buyerId, sellerId, sender, text, orderId }) {
  const clean = String(text || '').trim().slice(0, 1000);
  if (!clean) fail(400, 'Escribí un mensaje.');
  const s = await one(`SELECT id, name FROM sellers WHERE id = $1 AND status <> 'suspended'`, [sellerId]);
  if (!s) fail(404, 'Esa tienda ya no está activa.');
  if (sender === 'seller') {
    // El vendedor solo escribe a quien le compró o le escribió antes.
    const known = await one(
      `SELECT 1 FROM orders WHERE buyer_id = $1 AND seller_id = $2 UNION SELECT 1 FROM messages WHERE buyer_id = $1 AND seller_id = $2 LIMIT 1`,
      [buyerId, sellerId]
    );
    if (!known) fail(403, 'Podés escribirle a quien te compró o te escribió.');
  }
  const blocked = await one(
    `SELECT 1 FROM user_blocks b JOIN sellers s ON s.id = $2
     WHERE (b.user_id = $1 AND b.blocked_user_id = s.user_id) OR (b.user_id = s.user_id AND b.blocked_user_id = $1)`,
    [buyerId, sellerId]
  );
  if (blocked) fail(403, 'No podés enviar mensajes en esta conversación.');
  const m = await one(
    `INSERT INTO messages(id, buyer_id, seller_id, sender, text, order_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [id('msg'), buyerId, sellerId, sender, clean, orderId || null]
  );
  hub.emit(`user:${buyerId}`, 'thread:new', { message: out(m) });
  hub.emit(`seller:${sellerId}`, 'thread:new', { message: out(m) });
  if (sender === 'buyer') {
    const buyer = await one('SELECT handle FROM users WHERE id = $1', [buyerId]);
    await notify(undefined, {
      userId: await sellerUserId(sellerId), kind: KIND.MESSAGE, title: `Mensaje de @${buyer.handle}`, body: clean,
      link: `/vendedor/mensajes/${buyerId}`, group: `chat:${sellerId}:${buyerId}`,
    });
  } else {
    await notify(undefined, {
      userId: buyerId, kind: KIND.MESSAGE, title: `Mensaje de ${s.name}`, body: clean,
      link: `/chat/${sellerId}`, group: `chat:${sellerId}:${buyerId}`,
    });
  }
  return out(m);
}

/** C8: hilos del vendedor (último mensaje, no leídos, chip del último pedido). */
export async function sellerThreads(sellerId, q) {
  const params = [sellerId];
  let filter = '';
  if (q) {
    params.push(`%${q}%`);
    filter = `AND (u.handle ILIKE $2 OR u.name ILIKE $2 OR EXISTS (SELECT 1 FROM orders o WHERE o.buyer_id = t.buyer_id AND o.seller_id = $1 AND o.ref ILIKE $2))`;
  }
  const rows = await many(
    `SELECT t.buyer_id, u.name, u.handle, u.initials,
       (SELECT text FROM messages m WHERE m.buyer_id = t.buyer_id AND m.seller_id = $1 ORDER BY at DESC LIMIT 1) AS last_text,
       (SELECT sender FROM messages m WHERE m.buyer_id = t.buyer_id AND m.seller_id = $1 ORDER BY at DESC LIMIT 1) AS last_sender,
       t.last_at,
       (SELECT count(*)::int FROM messages m WHERE m.buyer_id = t.buyer_id AND m.seller_id = $1 AND m.sender = 'buyer' AND m.read_at IS NULL) AS unread
     FROM (SELECT buyer_id, max(at) AS last_at FROM messages WHERE seller_id = $1 GROUP BY buyer_id) t
     JOIN users u ON u.id = t.buyer_id
     WHERE true ${filter}
     ORDER BY t.last_at DESC LIMIT 100`,
    params
  );
  return Promise.all(rows.map(async (r) => ({
    buyerId: r.buyer_id, name: r.name, handle: r.handle, initials: r.initials,
    lastText: r.last_text, lastFromMe: r.last_sender === 'seller', lastAt: r.last_at, unread: r.unread,
    order: await pinnedOrder(r.buyer_id, sellerId),
  })));
}

/** Hilos del comprador (desde Cuenta). */
export async function buyerThreads(buyerId) {
  const rows = await many(
    `SELECT t.seller_id, s.name, s.slug, s.initials, s.color, t.last_at,
       (SELECT text FROM messages m WHERE m.buyer_id = $1 AND m.seller_id = t.seller_id ORDER BY at DESC LIMIT 1) AS last_text,
       (SELECT count(*)::int FROM messages m WHERE m.buyer_id = $1 AND m.seller_id = t.seller_id AND m.sender <> 'buyer' AND m.read_at IS NULL) AS unread
     FROM (SELECT seller_id, max(at) AS last_at FROM messages WHERE buyer_id = $1 GROUP BY seller_id) t
     JOIN sellers s ON s.id = t.seller_id ORDER BY t.last_at DESC LIMIT 100`,
    [buyerId]
  );
  return rows.map((r) => ({ sellerId: r.seller_id, name: r.name, slug: r.slug, initials: r.initials, color: r.color, lastText: r.last_text, lastAt: r.last_at, unread: r.unread }));
}
