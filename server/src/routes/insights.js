import { Router } from 'express';
import * as db from '../db.js';
import * as hub from '../realtime/hub.js';
import { requireAuth, requireSeller } from '../auth.js';
import { STATUS, salesSummary } from '../orders.js';

const router = Router();

/* --------------------------------------------------------- Resumen --- */

router.get('/overview', requireSeller, (req, res) => {
  const sellerId = req.user.sellerId;
  const orders = db.filter('orders', (o) => o.sellerId === sellerId);
  const summary = salesSummary(sellerId);
  const products = db.filter('products', (p) => p.sellerId === sellerId);

  // Ingresos de los últimos 7 días, para el gráfico de barras semanal.
  const days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const total = orders
      .filter((o) => o.createdAt.slice(0, 10) === key && o.status !== STATUS.PENDING)
      .reduce((s, o) => s + o.amount, 0);
    return { day: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()], total };
  });

  const bySales = new Map();
  for (const o of orders) {
    const row = bySales.get(o.productId) || { name: o.productName, units: 0, revenue: 0 };
    row.units += 1;
    row.revenue += o.amount;
    bySales.set(o.productId, row);
  }

  const byBuyer = new Map();
  for (const o of orders) {
    const row = byBuyer.get(o.buyerId) || { handle: o.buyerHandle, orders: 0, spend: 0 };
    row.orders += 1;
    row.spend += o.total;
    byBuyer.set(o.buyerId, row);
  }

  res.json({
    kpis: {
      revenue: summary.net,
      pending: summary.pending,
      orders: orders.length,
      averageTicket: summary.averageTicket,
      products: products.length,
      live: db.filter('streams', (s) => s.sellerId === sellerId && s.live).length,
    },
    week: days,
    topProducts: [...bySales.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    topBuyers: [...byBuyer.values()].sort((a, b) => b.spend - a.spend).slice(0, 5),
    byMode: summary.byMode,
  });
});

/* -------------------------------------------------------- Clientes --- */

router.get('/customers', requireSeller, (req, res) => {
  const orders = db.filter('orders', (o) => o.sellerId === req.user.sellerId);
  const map = new Map();
  for (const o of orders) {
    const row = map.get(o.buyerId) || {
      id: o.buyerId,
      handle: o.buyerHandle,
      name: db.find('users', (u) => u.id === o.buyerId)?.name || o.buyerHandle,
      orders: 0,
      spend: 0,
      lastOrderAt: o.createdAt,
    };
    row.orders += 1;
    row.spend += o.total;
    if (o.createdAt > row.lastOrderAt) row.lastOrderAt = o.createdAt;
    map.set(o.buyerId, row);
  }
  res.json({ customers: [...map.values()].sort((a, b) => b.spend - a.spend) });
});

router.get('/customers/:id/thread', requireSeller, (req, res) => {
  const thread = db.filter(
    'threads',
    (t) => t.sellerId === req.user.sellerId && t.buyerId === req.params.id
  );
  res.json({ thread });
});

router.post('/customers/:id/thread', requireSeller, (req, res) => {
  const text = (req.body?.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Escribí un mensaje.' });

  const entry = db.insert('threads', {
    id: db.id('thr'),
    sellerId: req.user.sellerId,
    buyerId: req.params.id,
    from: 'seller',
    text,
    at: new Date().toISOString(),
  });
  hub.emit(`user:${req.params.id}`, 'thread:new', { message: entry });
  res.status(201).json({ message: entry });
});

/* ------------------------------------------------------- Favoritos --- */

router.get('/favorites', requireAuth, (req, res) =>
  res.json({ favorites: req.user.favorites || [] })
);

router.put('/favorites/:streamId', requireAuth, (req, res) => {
  const current = new Set(req.user.favorites || []);
  current.has(req.params.streamId) ? current.delete(req.params.streamId) : current.add(req.params.streamId);
  const user = db.update('users', req.user.id, { favorites: [...current] });
  res.json({ favorites: user.favorites });
});

export default router;
