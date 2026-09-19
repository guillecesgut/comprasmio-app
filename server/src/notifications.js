import * as db from './db.js';
import * as hub from './realtime/hub.js';

/**
 * Notificaciones persistidas por destinatario. Se guardan en la base (y no solo
 * se emiten por socket) porque quien no tenía la pestaña abierta en el momento
 * del evento igual tiene que enterarse al volver.
 *
 * El destinatario se identifica por `userId`: el vendedor recibe en su cuenta
 * de usuario, no en su `sellerId`, para que el canal `user:<id>` del socket y
 * las consultas por sesión usen siempre la misma clave.
 */
export const KIND = {
  PAYMENT_SUBMITTED: 'pago_por_verificar', // al vendedor: llegó un comprobante
  PAYMENT_VERIFIED: 'pago_verificado',     // al comprador: le confirmaron el pago
  MESSAGE: 'mensaje',                      // a cualquiera: mensaje nuevo en un chat
};

const MAX_PER_USER = 50; // el historial viejo no aporta y engorda el archivo

/**
 * Crea la notificación y la emite en vivo. `link` es la ruta de la web a la que
 * lleva al tocarla, y `group` permite que un chat con muchos mensajes seguidos
 * no genere una fila nueva por cada uno: se actualiza la que ya existía sin leer.
 */
export function notify({ userId, kind, title, body, link, group }) {
  if (!userId) return null;

  if (group) {
    const existing = db.find(
      'notifications',
      (n) => n.userId === userId && n.group === group && !n.read
    );
    if (existing) {
      Object.assign(existing, { title, body, link, at: new Date().toISOString(), count: (existing.count || 1) + 1 });
      db.persist();
      hub.emit(`user:${userId}`, 'notification:update', { notification: existing });
      return existing;
    }
  }

  const notification = db.insert('notifications', {
    id: db.id('ntf'),
    userId,
    kind,
    title,
    body,
    link: link || null,
    group: group || null,
    count: 1,
    read: false,
    at: new Date().toISOString(),
  });

  // Poda: conservamos solo las más recientes de cada persona.
  const mine = db.filter('notifications', (n) => n.userId === userId);
  if (mine.length > MAX_PER_USER) {
    const state = db.get();
    const keep = new Set(
      mine.sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_PER_USER).map((n) => n.id)
    );
    state.notifications = state.notifications.filter((n) => n.userId !== userId || keep.has(n.id));
    db.persist();
  }

  hub.emit(`user:${userId}`, 'notification:new', { notification });
  return notification;
}

export function listFor(userId) {
  return db
    .filter('notifications', (n) => n.userId === userId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export const unreadCount = (userId) =>
  db.filter('notifications', (n) => n.userId === userId && !n.read).length;

export function markRead(userId, ids) {
  const target = Array.isArray(ids) && ids.length ? new Set(ids) : null;
  let changed = 0;
  for (const n of db.filter('notifications', (x) => x.userId === userId && !x.read)) {
    if (target && !target.has(n.id)) continue;
    n.read = true;
    changed++;
  }
  if (changed) {
    db.persist();
    hub.emit(`user:${userId}`, 'notification:read', { unread: unreadCount(userId) });
  }
  return changed;
}

/** El usuario dueño de una cuenta de vendedor, para saber a quién notificar. */
export const ownerOfSeller = (sellerId) => {
  const seller = db.find('sellers', (s) => s.id === sellerId);
  return seller ? db.find('users', (u) => u.id === seller.ownerId) : null;
};
