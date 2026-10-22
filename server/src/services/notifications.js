import { one, many, id, afterCommit } from '../db.js';
import * as hub from '../realtime/hub.js';

/**
 * Notificaciones guardadas por destinatario (quien no tenía la app abierta igual se entera) y
 * emitidas por el socket `user:<id>`. `group` agrupa mensajes seguidos del mismo chat.
 * `link` es la ruta de la app a la que lleva al tocarla.
 */
export const KIND = {
  PAYMENT_APPROVED: 'pago_confirmado',
  PAYMENT_REJECTED: 'pago_rechazado',
  ORDER_NEW: 'pedido_nuevo',
  ORDER_UPDATE: 'pedido',
  CLAIM: 'reclamo',
  PAYOUT: 'liquidacion',
  MESSAGE: 'mensaje',
  LIVE: 'vivo',
  REVIEW: 'resena',
};

const MAX_PER_USER = 80;

export async function notify(q, { userId, kind, title, body, link, group }) {
  if (!userId) return null;
  if (group) {
    const existing = await one(
      `UPDATE notifications SET title = $3, body = $4, link = $5, at = now(), count = count + 1
       WHERE id = (SELECT id FROM notifications WHERE user_id = $1 AND group_key = $2 AND NOT read ORDER BY at DESC LIMIT 1)
       RETURNING *`,
      [userId, group, title, body, link || null], q
    );
    if (existing) {
      afterCommit(q, () => hub.emit(`user:${userId}`, 'notification:update', { notification: out(existing) }));
      return existing;
    }
  }
  const row = await one(
    `INSERT INTO notifications(id, user_id, kind, title, body, link, group_key) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id('ntf'), userId, kind, title, body, link || null, group || null], q
  );
  await one(
    `DELETE FROM notifications WHERE user_id = $1 AND id NOT IN (
       SELECT id FROM notifications WHERE user_id = $1 ORDER BY at DESC LIMIT ${MAX_PER_USER}) RETURNING 1`,
    [userId], q
  );
  afterCommit(q, () => hub.emit(`user:${userId}`, 'notification:new', { notification: out(row) }));
  return row;
}

const out = (n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, count: n.count, read: n.read, at: n.at });

export async function list(userId) {
  return (await many('SELECT * FROM notifications WHERE user_id = $1 ORDER BY at DESC LIMIT 80', [userId])).map(out);
}

export const unread = async (userId) =>
  (await one('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND NOT read', [userId])).n;

export async function markRead(userId, ids) {
  if (Array.isArray(ids) && ids.length) {
    await many('UPDATE notifications SET read = true WHERE user_id = $1 AND id = ANY($2) RETURNING 1', [userId, ids]);
  } else {
    await many('UPDATE notifications SET read = true WHERE user_id = $1 AND NOT read RETURNING 1', [userId]);
  }
  const n = await unread(userId);
  hub.emit(`user:${userId}`, 'notification:read', { unread: n });
  return n;
}

/** Usuario dueño de una tienda, para avisarle. */
export const sellerUserId = async (sellerId, q) => (await one('SELECT user_id FROM sellers WHERE id = $1', [sellerId], q))?.user_id;
