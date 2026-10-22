import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import { handle, requireAuth } from '../auth.js';
import { fail } from '../db.js';
import * as storage from '../storage.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

/**
 * Carpeta según el uso. Cada una define quién puede subir: los comprobantes de pago los sube el
 * comprador; las fotos de producto, el vendedor; banners y QR de cobro, el equipo.
 */
const FOLDERS = {
  receipts: (u) => u.role !== 'admin',
  claims: (u) => u.role === 'buyer' || u.role === 'seller',
  reviews: () => true,
  products: (u) => u.role === 'seller',
  bundles: (u) => u.role === 'seller',
  avatars: (u) => u.role === 'seller',
  covers: (u) => u.role === 'seller',
  'payout-accounts': (u) => u.role === 'seller',
  banners: (u) => u.role === 'admin',
  qrs: (u) => u.role === 'admin',
  payouts: (u) => u.role === 'admin',
  refunds: (u) => u.role === 'admin',
};

router.post('/uploads', requireAuth, upload.single('file'), handle(async (req, res) => {
  const folder = String(req.body?.folder || '');
  if (!FOLDERS[folder]) fail(400, 'Carpeta inválida.');
  if (!FOLDERS[folder](req.user)) fail(403, 'No podés subir archivos acá.');
  if (!req.file) fail(400, 'Adjuntá un archivo.');
  const type = req.file.mimetype;
  const pdfOk = ['receipts', 'payouts', 'refunds'].includes(folder);
  if (!storage.ALLOWED_TYPES.includes(type) || (type === 'application/pdf' && !pdfOk)) {
    fail(400, pdfOk ? 'Subí una imagen (JPG, PNG, WEBP o HEIC) o un PDF.' : 'Subí una imagen JPG, PNG, WEBP o HEIC.');
  }
  const key = storage.newKey(folder, type);
  await storage.put(key, req.file.buffer, type);
  res.status(201).json({ key, url: await storage.url(key) });
}));

/** Archivos del disco local (solo en desarrollo o si no hay bucket): exigen enlace firmado vigente. */
router.get('/files/*', (req, res) => {
  const key = decodeURI(req.params[0] || '');
  if (!storage.verifyLocal(key, req.query.exp, String(req.query.sig || ''))) {
    return res.status(403).json({ error: 'El enlace venció o no es válido.' });
  }
  const file = storage.localPath(key);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'El archivo no existe.' });
  res.setHeader('Cache-Control', storage.isPrivate(key) ? 'private, no-store' : 'private, max-age=86400');
  res.sendFile(file);
});

export default router;
