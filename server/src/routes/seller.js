import { Router } from 'express';
import { handle, requireSeller } from '../auth.js';
import { one, tx, fail } from '../db.js';
import * as catalog from '../services/catalog.js';
import * as bundles from '../services/bundles.js';
import * as stock from '../services/stock.js';
import * as orders from '../services/orders.js';
import * as payouts from '../services/payouts.js';
import * as plans from '../services/plans.js';
import * as messages from '../services/messages.js';
import * as dashboard from '../services/dashboard.js';
import * as live from '../services/live.js';
import { isPremium } from '../settings.js';

/** Panel del vendedor en la app (C1, E1–E12, C7, C8). */
const router = Router();
router.use(requireSeller);

const sellerOf = async (req) => {
  const s = await one('SELECT * FROM sellers WHERE id = $1', [req.user.seller_id]);
  if (!s || s.status === 'suspended') fail(403, 'Tu tienda está suspendida. Escribinos a soporte.');
  return s;
};
const premiumOnly = handle(async (req, _res, next) => {
  if (!isPremium(await sellerOf(req))) fail(403, 'Esta función es parte de Premium.');
  next();
});

router.get('/summary', handle(async (req, res) => res.json(await dashboard.sellerSummary(req.user.seller_id, req.query.period))));

// Catálogo (E1, E2, E3)
router.get('/products', handle(async (req, res) => res.json(await catalog.sellerCatalog(req.user.seller_id, req.query))));
router.get('/products/:id', handle(async (req, res) => res.json({ product: await catalog.productForEdit(req.user.seller_id, req.params.id) })));
router.post('/products', handle(async (req, res) => {
  await sellerOf(req);
  const id = await catalog.saveProduct(req.user.seller_id, req.user.id, req.body || {});
  res.status(201).json({ product: await catalog.productForEdit(req.user.seller_id, id) });
}));
router.put('/products/:id', handle(async (req, res) => {
  await catalog.saveProduct(req.user.seller_id, req.user.id, req.body || {}, req.params.id);
  res.json({ product: await catalog.productForEdit(req.user.seller_id, req.params.id) });
}));
router.patch('/products/:id/status', handle(async (req, res) => {
  await catalog.setProductStatus(req.user.seller_id, req.params.id, req.body?.status);
  res.json({ ok: true });
}));
router.get('/variants/:id/stock', handle(async (req, res) => res.json({ variant: await catalog.variantStock(req.user.seller_id, req.params.id) })));
router.post('/variants/:id/adjust', handle(async (req, res) => {
  await catalog.variantStock(req.user.seller_id, req.params.id); // valida que sea suya
  await tx((q) => stock.adjust(q, {
    variantId: req.params.id, delta: Number.parseInt(req.body?.delta, 10), kind: req.body?.reason, note: req.body?.note, actorId: req.user.id,
  }));
  res.json({ variant: await catalog.variantStock(req.user.seller_id, req.params.id) });
}));

// Paquetes (E4, Premium)
router.get('/bundles', premiumOnly, handle(async (req, res) => res.json({ bundles: await bundles.list(req.user.seller_id) })));
router.get('/bundles/:id', premiumOnly, handle(async (req, res) => res.json({ bundle: await bundles.get(req.user.seller_id, req.params.id) })));
router.post('/bundles', premiumOnly, handle(async (req, res) => {
  const id = await bundles.save(req.user.seller_id, req.body || {});
  res.status(201).json({ bundle: await bundles.get(req.user.seller_id, id) });
}));
router.put('/bundles/:id', premiumOnly, handle(async (req, res) => {
  await bundles.save(req.user.seller_id, req.body || {}, req.params.id);
  res.json({ bundle: await bundles.get(req.user.seller_id, req.params.id) });
}));
router.delete('/bundles/:id', premiumOnly, handle(async (req, res) => { await bundles.remove(req.user.seller_id, req.params.id); res.json({ ok: true }); }));

// Pedidos (E5, E6)
router.get('/orders', handle(async (req, res) => res.json(await orders.sellerOrders(req.user.seller_id, req.query.filter))));
router.get('/orders/:id', handle(async (req, res) => res.json({ order: await orders.orderDetail(req.user, req.params.id) })));
router.post('/orders/:id/advance', handle(async (req, res) => {
  res.json({ status: await orders.sellerAdvance(req.user, req.params.id, req.body || {}) });
}));

// Cobros (E7, E8)
router.get('/payouts', handle(async (req, res) => res.json(await payouts.sellerPayouts(req.user.seller_id))));
router.get('/payout-account', handle(async (req, res) => res.json({ account: await payouts.payoutAccount(req.user.seller_id) })));
router.put('/payout-account', handle(async (req, res) => res.json({ account: await payouts.savePayoutAccount(req.user.seller_id, req.body || {}) })));

// Tienda (E10), plan (E11), reseñas (E12)
router.get('/store', handle(async (req, res) => {
  const s = await sellerOf(req);
  res.json({ store: { ...(await catalog.sellerPublic(s.id)), link: `comprasmio.bo/${s.slug}` } });
}));
router.put('/store', handle(async (req, res) => res.json({ store: await catalog.updateStore(req.user.seller_id, req.body || {}) })));
router.get('/plan', handle(async (req, res) => res.json({ plan: await plans.planInfo(req.user.seller_id) })));
router.post('/plan/premium', handle(async (req, res) => {
  res.status(201).json({ paymentId: await plans.requestPremium(req.user.seller_id, req.user.id) });
}));
router.get('/reviews', handle(async (req, res) => res.json(await orders.sellerReviews(req.user.seller_id, req.query))));
router.post('/reviews/:id/reply', handle(async (req, res) => { await orders.replyReview(req.user.seller_id, req.params.id, req.body?.text); res.json({ ok: true }); }));

// Mensajes (C8)
router.get('/threads', handle(async (req, res) => res.json({ threads: await messages.sellerThreads(req.user.seller_id, req.query.q) })));
router.get('/threads/:buyerId', handle(async (req, res) => {
  res.json(await messages.thread({ buyerId: req.params.buyerId, sellerId: req.user.seller_id, viewer: 'seller', orderId: req.query.order }));
}));
router.post('/threads/:buyerId', handle(async (req, res) => {
  res.status(201).json({ message: await messages.send({ buyerId: req.params.buyerId, sellerId: req.user.seller_id, sender: 'seller', text: req.body?.text, orderId: req.body?.orderId }) });
}));

// Vivos (E9, C7, C7b) — Premium
router.get('/streams', handle(async (req, res) => res.json({ streams: await live.sellerStreams(req.user.seller_id) })));
router.get('/streams/setup', premiumOnly, handle(async (req, res) => res.json(await live.setupData(req.user.seller_id))));
router.post('/streams', premiumOnly, handle(async (req, res) => {
  const id = await live.startStream(await sellerOf(req), req.body || {});
  res.status(201).json({ streamId: id });
}));
router.post('/streams/schedule', premiumOnly, handle(async (req, res) => {
  res.status(201).json({ streamId: await live.scheduleStream(await sellerOf(req), req.body || {}) });
}));
router.put('/streams/:id/queue', handle(async (req, res) => {
  await live.reorderQueue(req.user.seller_id, req.params.id, req.body?.reservationIds || []);
  res.json({ queue: await live.queue(req.params.id) });
}));
router.post('/streams/:id/next', handle(async (req, res) => res.status(201).json({ lot: await live.openNext(await sellerOf(req), req.params.id, req.body || {}) })));
router.post('/streams/:id/extend', handle(async (req, res) => res.json({ lot: await live.extend(await sellerOf(req), req.params.id, req.body?.seconds) })));
router.delete('/streams/:id/lot', handle(async (req, res) => res.json({ outcome: await live.closeLot(await sellerOf(req), req.params.id) })));
router.post('/streams/:id/end', handle(async (req, res) => res.json({ summary: await live.endStream(await sellerOf(req), req.params.id) })));
router.get('/streams/:id/summary', handle(async (req, res) => res.json({ summary: await live.summary(req.user.seller_id, req.params.id) })));

export default router;
