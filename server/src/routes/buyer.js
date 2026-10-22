import { Router } from 'express';
import { handle, requireAuth } from '../auth.js';
import { fail } from '../db.js';
import * as catalog from '../services/catalog.js';
import * as cart from '../services/cart.js';
import * as orders from '../services/orders.js';
import * as messages from '../services/messages.js';
import * as notifications from '../services/notifications.js';
import * as live from '../services/live.js';

/** Todo lo del comprador con sesión: deseos, seguidos, direcciones, carrito, pagos, pedidos, chat. */
const router = Router();
router.use(requireAuth);

// Deseos y seguidos (D14, D15)
router.get('/wishlist', handle(async (req, res) => res.json({ items: await catalog.wishlist(req.user.id) })));
router.put('/wishlist/:productId', handle(async (req, res) => res.json(await catalog.toggleWishlist(req.user.id, req.params.productId))));
router.get('/following', handle(async (req, res) => res.json({ sellers: await catalog.following(req.user.id) })));
router.put('/following/:sellerId', handle(async (req, res) => res.json(await catalog.toggleFollow(req.user.id, req.params.sellerId))));
router.patch('/following/:sellerId', handle(async (req, res) => res.json(await catalog.setFollowNotify(req.user.id, req.params.sellerId, req.body?.notify))));
router.get('/upcoming', handle(async (req, res) => res.json({ streams: await live.upcomingFromFollowed(req.user.id) })));

// Direcciones (D16)
router.get('/addresses', handle(async (req, res) => res.json({ addresses: await catalog.addresses(req.user.id) })));
router.post('/addresses', handle(async (req, res) => res.status(201).json({ address: await catalog.saveAddress(req.user.id, req.body || {}) })));
router.patch('/addresses/:id', handle(async (req, res) => res.json({ address: await catalog.saveAddress(req.user.id, req.body || {}, req.params.id) })));
router.delete('/addresses/:id', handle(async (req, res) => { await catalog.deleteAddress(req.user.id, req.params.id); res.json({ ok: true }); }));

// Carrito (D6) y checkout (D7)
router.get('/cart', handle(async (req, res) => res.json(await cart.view(req.user.id))));
router.post('/cart/items', handle(async (req, res) => res.json(await cart.add(req.user.id, req.body?.variantId, req.body?.qty ?? 1))));
router.patch('/cart/items/:variantId', handle(async (req, res) => res.json(await cart.setQty(req.user.id, req.params.variantId, req.body?.qty))));
router.delete('/cart/items/:variantId', handle(async (req, res) => res.json(await cart.setQty(req.user.id, req.params.variantId, 0))));
router.post('/checkout', handle(async (req, res) => {
  const created = await orders.checkout(req.user.id, req.body || {});
  res.status(201).json({ paymentId: created.paymentId, ref: created.ref });
}));

// Pago por QR (D8, D8b)
router.get('/payments/:id', handle(async (req, res) => res.json({ payment: await orders.paymentView(req.user.id, req.params.id) })));
router.post('/payments/:id/receipt', handle(async (req, res) => {
  const key = req.body?.receiptKey;
  if (!key || !String(key).startsWith('receipts/')) fail(400, 'Adjuntá una foto o PDF del comprobante.');
  res.json({ payment: await orders.submitReceipt(req.user.id, req.params.id, key) });
}));

// Mis compras (B6, D11–D13)
router.get('/orders', handle(async (req, res) => res.json(await orders.buyerOrders(req.user.id, req.query.filter))));
router.get('/orders/:id', handle(async (req, res) => res.json({ order: await orders.orderDetail(req.user, req.params.id) })));
router.post('/orders/:id/confirm', handle(async (req, res) => { await orders.confirmReceived(req.user.id, req.params.id); res.json({ ok: true }); }));
router.post('/orders/:id/claim', handle(async (req, res) => res.status(201).json({ claimId: await orders.openClaim(req.user.id, req.params.id, req.body || {}) })));
router.post('/orders/:id/review', handle(async (req, res) => { await orders.review(req.user.id, req.params.id, req.body || {}); res.status(201).json({ ok: true }); }));

// Chat con vendedores (B7)
router.get('/threads', handle(async (req, res) => res.json({ threads: await messages.buyerThreads(req.user.id) })));
router.get('/threads/:sellerId', handle(async (req, res) => {
  res.json(await messages.thread({ buyerId: req.user.id, sellerId: req.params.sellerId, viewer: 'buyer', orderId: req.query.order }));
}));
router.post('/threads/:sellerId', handle(async (req, res) => {
  res.status(201).json({ message: await messages.send({ buyerId: req.user.id, sellerId: req.params.sellerId, sender: 'buyer', text: req.body?.text, orderId: req.body?.orderId }) });
}));

// Avisos
router.get('/notifications', handle(async (req, res) => {
  res.json({ notifications: await notifications.list(req.user.id), unread: await notifications.unread(req.user.id) });
}));
router.post('/notifications/read', handle(async (req, res) => res.json({ unread: await notifications.markRead(req.user.id, req.body?.ids) })));

// Badges de la tab bar (Carrito: unidades; Cuenta: pagos pendientes)
router.get('/badges', handle(async (req, res) => {
  const mine = await orders.buyerOrders(req.user.id);
  res.json({ cartUnits: await cart.units(req.user.id), pendingPayments: mine.pendingCount, unread: await notifications.unread(req.user.id) });
}));

// Vivos: pujar, comprar, chatear, video
router.post('/streams/:id/bid', handle(async (req, res) => res.json({ lot: await live.bid(req.params.id, req.user, req.body?.amount) })));
router.post('/streams/:id/buy', handle(async (req, res) => res.status(201).json(await live.buy(req.params.id, req.user))));
router.post('/streams/:id/chat', handle(async (req, res) => res.status(201).json({ message: await live.chat(req.params.id, req.user, req.body?.text) })));
router.get('/streams/:id/token', handle(async (req, res) => res.json(await live.liveToken(req.params.id, req.user))));

export default router;
