import { Router } from 'express';
import * as db from '../db.js';
import * as hub from '../realtime/hub.js';
import * as engine from '../realtime/engine.js';
import { requireAuth, requireSeller } from '../auth.js';
import * as livekit from '../livekit.js';

const router = Router();

/** Vista de tarjeta del feed: precio y nota dependen del modo del lote activo. */
function cardOf(stream) {
  const seller = db.find('sellers', (s) => s.id === stream.sellerId);
  const lot = engine.publicLotOf(stream.id);
  const product = lot ? db.find('products', (p) => p.id === lot.productId) : null;
  const mode = lot?.mode || stream.defaultMode;

  return {
    id: stream.id,
    title: stream.title,
    tag: stream.tag,
    grad: stream.grad,
    live: stream.live,
    mode,
    viewers: Math.max(hub.viewersOf(stream.id), stream.baseViewers || 0),
    seller: { id: seller?.id, name: seller?.name, initials: seller?.initials || (seller?.name || '?').slice(0, 2).toUpperCase(), rating: seller?.rating ?? 100 },
    lotNo: lot?.lotNo || null,
    price: mode === 'fixed' ? (lot?.price ?? product?.price ?? stream.previewPrice) : (lot?.price ?? stream.previewPrice),
    stock: mode === 'fixed' ? (lot ? lot.stock - lot.sold : product?.stock ?? stream.previewStock) : null,
  };
}

router.get('/', (req, res) => {
  const { mode, q } = req.query;
  let list = db.filter('streams', (s) => s.live !== false).map(cardOf);
  if (mode === 'auction' || mode === 'fixed') list = list.filter((c) => c.mode === mode);
  if (q) {
    const needle = String(q).toLowerCase();
    list = list.filter(
      (c) => c.title.toLowerCase().includes(needle) || c.seller.name.toLowerCase().includes(needle)
    );
  }
  res.json({ streams: list, count: list.length });
});

router.get('/:id', (req, res) => {
  const stream = db.find('streams', (s) => s.id === req.params.id);
  if (!stream) return res.status(404).json({ error: 'Esa transmisión no existe.' });
  res.json({
    stream: cardOf(stream),
    lot: engine.publicLotOf(stream.id),
    queue: engine.publicQueue(stream.id),
    messages: db.filter('messages', (m) => m.streamId === stream.id).slice(-40),
  });
});

/** Credenciales para entrar al video de la sala. Sin LiveKit configurado devuelve 503. */
router.get('/:id/token', requireAuth, async (req, res) => {
  const stream = db.find('streams', (s) => s.id === req.params.id);
  if (!stream) return res.status(404).json({ error: 'Esa transmisión no existe.' });

  const grant = await livekit.issueToken(stream, req.user);
  if (!grant)
    return res.status(503).json({ error: 'El video en vivo no está configurado en este servidor.' });

  res.json(grant);
});

router.post('/:id/bid', requireAuth, (req, res) => {
  const stream = db.find('streams', (s) => s.id === req.params.id);
  if (!stream) return res.status(404).json({ error: 'Esa transmisión no existe.' });

  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount)) return res.status(400).json({ error: 'Puja inválida.' });

  const result = engine.placeBid(stream.id, req.user, amount);
  if (result.error) return res.status(409).json(result);
  res.json(result);
});

router.post('/:id/buy', requireAuth, (req, res) => {
  const stream = db.find('streams', (s) => s.id === req.params.id);
  if (!stream) return res.status(404).json({ error: 'Esa transmisión no existe.' });

  const result = engine.buyNow(stream.id, req.user);
  if (result.error) return res.status(409).json(result);
  res.status(201).json(result);
});

router.post('/:id/chat', requireAuth, (req, res) => {
  const stream = db.find('streams', (s) => s.id === req.params.id);
  if (!stream) return res.status(404).json({ error: 'Esa transmisión no existe.' });

  const text = (req.body?.text || '').trim().slice(0, 240);
  if (!text) return res.status(400).json({ error: 'Escribí un mensaje.' });

  const seller = db.find('sellers', (s) => s.id === stream.sellerId);
  const message = db.insert('messages', {
    id: db.id('msg'),
    streamId: stream.id,
    userId: req.user.id,
    handle: req.user.handle,
    text,
    seller: seller?.ownerId === req.user.id,
    at: new Date().toISOString(),
  });
  hub.emit(`stream:${stream.id}`, 'chat:new', { streamId: stream.id, message });
  res.status(201).json({ message });
});

/* ------------------------------------------------- lado del vendedor --- */

router.post('/', requireSeller, (req, res) => {
  const stream = db.insert('streams', {
    id: db.id('str'),
    sellerId: req.user.sellerId,
    title: (req.body?.title || 'Transmisión en vivo').trim(),
    tag: req.body?.tag || null,
    grad: req.body?.grad || '#0E7C66',
    live: true,
    defaultMode: 'auction',
    baseViewers: 0,
    activeProductId: null,
    activeLotNo: null,
    startedAt: new Date().toISOString(),
  });
  hub.emit('feed', 'stream:started', { stream: cardOf(stream) });
  res.status(201).json({ stream: cardOf(stream) });
});

/** El vendedor pone un producto del catálogo en el aire. */
router.post('/:id/lot', requireSeller, (req, res) => {
  const stream = db.find('streams', (s) => s.id === req.params.id);
  if (!stream || stream.sellerId !== req.user.sellerId)
    return res.status(404).json({ error: 'Esa transmisión no existe.' });

  const product = db.find('products', (p) => p.id === req.body?.productId && p.sellerId === req.user.sellerId);
  if (!product) return res.status(404).json({ error: 'Ese producto no está en tu catálogo.' });
  if (product.status === 'sold') return res.status(409).json({ error: 'Ese producto ya se vendió.' });
  if (engine.getLot(stream.id)) return res.status(409).json({ error: 'Ya tenés un lote en el aire. Cerralo primero.' });

  res.status(201).json({ lot: engine.openLot(stream, product) });
});

/**
 * Arma la fila de productos a subastar. Se usa al iniciar la transmisión, con
 * la selección múltiple del vendedor: reemplaza la cola completa, pero NO
 * abre ningún lote todavía. El vendedor sale al aire, saluda a su audiencia,
 * y recién ahí dispara el primer producto con POST /:id/queue/next.
 */
router.post('/:id/queue', requireSeller, (req, res) => {
  const stream = db.find('streams', (s) => s.id === req.params.id);
  if (!stream || stream.sellerId !== req.user.sellerId)
    return res.status(404).json({ error: 'Esa transmisión no existe.' });

  const ids = Array.isArray(req.body?.productIds) ? req.body.productIds : [];
  const valid = ids.filter((id) =>
    db.find('products', (p) => p.id === id && p.sellerId === req.user.sellerId && p.status !== 'sold')
  );
  if (!valid.length) return res.status(400).json({ error: 'Elegí al menos un producto disponible.' });

  engine.setQueue(stream.id, valid);
  res.status(201).json({ queue: engine.publicQueue(stream.id) });
});

/**
 * Saca el siguiente producto de la cola y lo pone en el aire, a pedido del
 * vendedor. Sin esto no pasa nada: entre lote y lote la sala queda esperando,
 * así el vendedor tiene tiempo de hablarle a la audiencia antes de arrancar.
 */
router.post('/:id/queue/next', requireSeller, (req, res) => {
  const stream = db.find('streams', (s) => s.id === req.params.id);
  if (!stream || stream.sellerId !== req.user.sellerId)
    return res.status(404).json({ error: 'Esa transmisión no existe.' });
  if (engine.getLot(stream.id))
    return res.status(409).json({ error: 'Ya tenés un lote en el aire. Cerralo primero.' });

  const lot = engine.advanceQueue(stream.id);
  if (!lot) return res.status(409).json({ error: 'No quedan productos en la cola.' });
  res.status(201).json({ lot });
});

router.delete('/:id/lot', requireSeller, (req, res) => {
  const stream = db.find('streams', (s) => s.id === req.params.id);
  if (!stream || stream.sellerId !== req.user.sellerId)
    return res.status(404).json({ error: 'Esa transmisión no existe.' });

  const outcome = engine.closeLot(stream.id, 'seller');
  if (!outcome) return res.status(409).json({ error: 'No hay ningún lote abierto.' });
  res.json({ outcome });
});

router.post('/:id/end', requireSeller, (req, res) => {
  const stream = db.find('streams', (s) => s.id === req.params.id);
  if (!stream || stream.sellerId !== req.user.sellerId)
    return res.status(404).json({ error: 'Esa transmisión no existe.' });

  if (engine.getLot(stream.id)) engine.closeLot(stream.id, 'stream_end');
  engine.clearQueue(stream.id);
  db.update('streams', stream.id, { live: false, endedAt: new Date().toISOString() });
  hub.emit(`stream:${stream.id}`, 'stream:ended', { streamId: stream.id });
  // El feed no está suscrito a stream:<id>: sin este segundo aviso, la tarjeta
  // queda viva ahí hasta que alguien recargue la página.
  hub.emit('feed', 'stream:ended', { streamId: stream.id });
  res.json({ ok: true });
});

export { cardOf };
export default router;
