import { Router } from 'express';
import * as db from '../db.js';
import { requireSeller } from '../auth.js';

const router = Router();

const PALETTE = ['#0E7C66', '#0A6350', '#AE5115', '#0A3B31', '#8E4211', '#0E4A3D'];

/**
 * Un producto se vende de una de dos formas y los campos de precio dependen de eso:
 *   subasta     → start (precio inicial) + min (reserva, solo la ve el vendedor)
 *   precio fijo → price (lo que paga el comprador) + stock (unidades para el vivo)
 */
function normalize(body, sellerId, previous) {
  const name = (body.name || '').trim();
  if (!name) return { error: 'Poné un nombre al producto.' };

  const mode = body.mode === 'fixed' ? 'fixed' : 'auction';
  // Envío: el vendedor lo asume gratis, o se coordina el costo por chat con el
  // comprador después de la compra. La plataforma nunca cobra un monto de envío.
  const shipping = body.shipping === 'arranged' ? 'arranged' : body.shipping === 'free' ? 'free' : null;
  if (!shipping) return { error: 'Elegí si el envío es gratis o a convenir.' };

  const int = (v) => {
    const n = parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) ? n : NaN;
  };

  const base = {
    sellerId,
    name,
    category: (body.category || 'General').trim(),
    mode,
    shipping,
    grad: previous?.grad || PALETTE[db.get().products.length % PALETTE.length],
    status: previous?.status === 'sold' ? 'ready' : previous?.status || 'ready',
  };

  if (mode === 'fixed') {
    const price = int(body.price);
    const stock = int(body.stock);
    if (!(price > 0)) return { error: 'El precio de venta tiene que ser mayor a 0.' };
    if (!(stock > 0)) return { error: 'Cargá al menos una unidad disponible.' };
    return { product: { ...base, price, stock, start: 0, min: 0, increment: 0 } };
  }

  const start = int(body.start);
  const min = int(body.min);
  if (!(start >= 0)) return { error: 'Poné un precio inicial de subasta.' };
  if (!(min >= 0)) return { error: 'Poné un precio mínimo.' };
  if (min < start) return { error: 'El precio mínimo no puede ser menor al inicial.' };
  return { product: { ...base, start, min, increment: int(body.increment) || 10, price: 0, stock: 0 } };
}

/** Lo que ve el comprador nunca incluye `min`: es el precio de reserva del vendedor. */
export const publicProduct = ({ min, ...rest }) => rest;

router.get('/', requireSeller, (req, res) => {
  res.json({ products: db.filter('products', (p) => p.sellerId === req.user.sellerId) });
});

router.post('/', requireSeller, (req, res) => {
  const { product, error } = normalize(req.body || {}, req.user.sellerId);
  if (error) return res.status(400).json({ error });
  const saved = db.insert('products', { ...product, id: db.id('prd'), createdAt: new Date().toISOString() });
  res.status(201).json({ product: saved });
});

router.patch('/:id', requireSeller, (req, res) => {
  const current = db.find('products', (p) => p.id === req.params.id && p.sellerId === req.user.sellerId);
  if (!current) return res.status(404).json({ error: 'Ese producto no está en tu catálogo.' });

  const { product, error } = normalize({ ...current, ...req.body }, req.user.sellerId, current);
  if (error) return res.status(400).json({ error });
  res.json({ product: db.update('products', current.id, product) });
});

router.delete('/:id', requireSeller, (req, res) => {
  const current = db.find('products', (p) => p.id === req.params.id && p.sellerId === req.user.sellerId);
  if (!current) return res.status(404).json({ error: 'Ese producto no está en tu catálogo.' });
  db.remove('products', current.id);
  res.json({ ok: true });
});

export default router;
