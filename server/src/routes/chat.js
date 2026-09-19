import { Router } from 'express';
import * as db from '../db.js';
import * as hub from '../realtime/hub.js';
import { requireAuth } from '../auth.js';
import * as notifications from '../notifications.js';

const router = Router();

/** Info pública de un vendedor, para el encabezado de la ventana de chat del comprador. */
router.get('/sellers/:id', (req, res) => {
  const seller = db.find('sellers', (s) => s.id === req.params.id);
  if (!seller) return res.status(404).json({ error: 'Ese vendedor no existe.' });
  res.json({
    seller: {
      id: seller.id,
      name: seller.name,
      initials: seller.initials || seller.name.slice(0, 2).toUpperCase(),
      rating: seller.rating ?? 100,
    },
  });
});

/**
 * Conversación entre el comprador que está logueado y un vendedor puntual.
 * Reutiliza la misma colección `threads` que ya usa el panel de Clientes del
 * vendedor: es una sola charla continua por cada par comprador-vendedor, no
 * una ventana nueva por cada compra — así no se pierde el hilo si alguien le
 * compra dos veces al mismo vendedor.
 */
router.get('/threads/:sellerId', requireAuth, (req, res) => {
  const thread = db.filter(
    'threads',
    (t) => t.sellerId === req.params.sellerId && t.buyerId === req.user.id
  );
  res.json({ thread });
});

router.post('/threads/:sellerId', requireAuth, (req, res) => {
  const seller = db.find('sellers', (s) => s.id === req.params.sellerId);
  if (!seller) return res.status(404).json({ error: 'Ese vendedor no existe.' });

  const text = (req.body?.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Escribí un mensaje.' });

  const message = db.insert('threads', {
    id: db.id('thr'),
    sellerId: seller.id,
    buyerId: req.user.id,
    from: 'buyer',
    text,
    at: new Date().toISOString(),
  });
  hub.emit(`seller:${seller.id}`, 'thread:new', { message });

  // Agrupado por conversación: cinco mensajes seguidos no generan cinco filas.
  const sellerUser = notifications.ownerOfSeller(seller.id);
  notifications.notify({
    userId: sellerUser?.id,
    kind: notifications.KIND.MESSAGE,
    title: `Mensaje de @${req.user.handle}`,
    body: text,
    link: `/vender/clientes?cliente=${req.user.id}`,
    group: `chat:${seller.id}:${req.user.id}`,
  });

  res.status(201).json({ message });
});

/* -------------------------------------------------- notificaciones --- */

router.get('/notifications', requireAuth, (req, res) => {
  res.json({
    notifications: notifications.listFor(req.user.id),
    unread: notifications.unreadCount(req.user.id),
  });
});

/** Sin `ids` marca todas; con `ids` solo esas. */
router.post('/notifications/read', requireAuth, (req, res) => {
  notifications.markRead(req.user.id, req.body?.ids);
  res.json({ unread: notifications.unreadCount(req.user.id) });
});

export default router;
