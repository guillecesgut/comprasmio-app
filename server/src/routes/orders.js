import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import QRCode from 'qrcode';
import * as db from '../db.js';
import * as hub from '../realtime/hub.js';
import { requireAuth, requireSeller } from '../auth.js';
import { STATUS, STATUS_LABEL, attachReceipt, verifyPayment, markShipped, salesSummary } from '../orders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) =>
      cb(null, `comprobante-${req.params.id}-${Date.now()}${path.extname(file.originalname) || '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(null, /^image\/(jpeg|png|webp|heic)$/.test(file.mimetype) || file.mimetype === 'application/pdf'),
});

const router = Router();

const view = (o) => ({ ...o, statusLabel: STATUS_LABEL[o.status] });

router.get('/', requireAuth, (req, res) => {
  const mine = db
    .filter('orders', (o) => o.buyerId === req.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ orders: mine.map(view) });
});

router.get('/:id', requireAuth, (req, res) => {
  const order = db.find('orders', (o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Esa orden no existe.' });
  const isSeller = req.user.sellerId && order.sellerId === req.user.sellerId;
  if (order.buyerId !== req.user.id && !isSeller)
    return res.status(403).json({ error: 'Esa orden no es tuya.' });
  res.json({ order: view(order) });
});

/**
 * QR de pago. El único método es transferencia bancaria: el comprador descarga
 * este código, paga desde su app del banco y sube la foto del comprobante.
 */
router.get('/:id/qr', requireAuth, async (req, res) => {
  const order = db.find('orders', (o) => o.id === req.params.id);
  if (!order || order.buyerId !== req.user.id)
    return res.status(404).json({ error: 'Esa orden no existe.' });

  const seller = db.find('sellers', (s) => s.id === order.sellerId);
  const payload =
    seller?.qr?.payload ||
    JSON.stringify({ ref: order.ref, total: order.total, moneda: 'BOB', beneficiario: seller?.name });

  res.json({
    qr: await QRCode.toDataURL(payload, { width: 512, margin: 1, color: { dark: '#201F1B', light: '#FFFDFA' } }),
    bank: seller?.qr?.bank || 'Banco Nacional de Bolivia',
    account: seller?.qr?.account || '—',
    holder: seller?.qr?.holder || seller?.name,
    total: order.total,
    ref: order.ref,
  });
});

router.post('/:id/receipt', requireAuth, upload.single('receipt'), (req, res) => {
  const order = db.find('orders', (o) => o.id === req.params.id);
  if (!order || order.buyerId !== req.user.id)
    return res.status(404).json({ error: 'Esa orden no existe.' });
  if (!req.file) return res.status(400).json({ error: 'Adjuntá una foto del comprobante.' });
  if (order.status !== STATUS.PENDING)
    return res.status(409).json({ error: 'Ya enviaste el comprobante de esta orden.' });

  const updated = attachReceipt(order, `/uploads/${req.file.filename}`);
  hub.emit(`seller:${order.sellerId}`, 'order:update', { order: view(updated) });

  /**
   * No hay sistema de entregas automatizado: la coordinación pasa por el chat
   * directo con el vendedor. Cada compra abre (o continúa) esa conversación,
   * y acá dejamos el primer mensaje ya escrito, de parte del vendedor, para
   * que el comprador no llegue a una pantalla vacía.
   */
  const priorMessages = db.filter(
    'threads',
    (t) => t.sellerId === order.sellerId && t.buyerId === order.buyerId
  );
  const shippingNote =
    order.shippingMode === 'free'
      ? 'El envío corre por mi cuenta, no tenés que pagar nada más.'
      : 'Acá coordinamos el costo del envío también.';
  const greeting =
    priorMessages.length === 0
      ? `¡Hola! Soy de ${order.sellerName}. Recibí tu comprobante de "${order.productName}" (${order.ref}). Pasame tu dirección y a qué hora te viene bien para coordinar la entrega. ${shippingNote}`
      : `Recibí tu comprobante de "${order.productName}" (${order.ref}). Pasame tu dirección para coordinar esta entrega. ${shippingNote}`;

  const welcome = db.insert('threads', {
    id: db.id('thr'),
    sellerId: order.sellerId,
    buyerId: order.buyerId,
    from: 'seller',
    text: greeting,
    at: new Date().toISOString(),
  });
  hub.emit(`user:${order.buyerId}`, 'thread:new', { message: welcome });
  hub.emit(`seller:${order.sellerId}`, 'thread:new', { message: welcome });

  res.json({ order: view(updated) });
});

/* ------------------------------------------------- lado del vendedor --- */

router.get('/seller/list', requireSeller, (req, res) => {
  const { status } = req.query;
  let list = db
    .filter('orders', (o) => o.sellerId === req.user.sellerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (status && status !== 'todas') list = list.filter((o) => o.status === status);
  res.json({ orders: list.map(view) });
});

router.get('/seller/summary', requireSeller, (req, res) =>
  res.json({ summary: salesSummary(req.user.sellerId) })
);

router.post('/:id/verify', requireSeller, (req, res) => {
  const order = db.find('orders', (o) => o.id === req.params.id && o.sellerId === req.user.sellerId);
  if (!order) return res.status(404).json({ error: 'Esa orden no existe.' });
  if (order.status !== STATUS.REVIEW)
    return res.status(409).json({ error: 'Esta orden todavía no tiene comprobante para revisar.' });

  const updated = verifyPayment(order);
  // Sincronización entre superficies: el comprador ve el cambio en Compras al instante.
  hub.emit(`user:${order.buyerId}`, 'order:update', { order: view(updated) });
  hub.emit(`seller:${order.sellerId}`, 'order:update', { order: view(updated) });
  res.json({ order: view(updated) });
});

router.post('/:id/ship', requireSeller, (req, res) => {
  const order = db.find('orders', (o) => o.id === req.params.id && o.sellerId === req.user.sellerId);
  if (!order) return res.status(404).json({ error: 'Esa orden no existe.' });
  if (order.status !== STATUS.VERIFIED)
    return res.status(409).json({ error: 'Verificá el pago antes de marcarla como enviada.' });

  const updated = markShipped(order);
  hub.emit(`user:${order.buyerId}`, 'order:update', { order: view(updated) });
  hub.emit(`seller:${order.sellerId}`, 'order:update', { order: view(updated) });
  res.json({ order: view(updated) });
});

export default router;
