import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { attachUser } from './auth.js';
import authRoutes from './routes/auth.js';
import fileRoutes from './routes/files.js';
import publicRoutes from './routes/public.js';
import buyerRoutes from './routes/buyer.js';
import sellerRoutes from './routes/seller.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * La app HTTP. Rutas:
 *   /api/auth/*    cuentas            /api/me/*      comprador con sesión
 *   /api/seller/*  vendedor           /api/admin/*   panel de administración
 *   /api/*         público (catálogo, inicio, vivos, archivos)
 * Si existe web/dist (el panel compilado), se sirve en la raíz.
 */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(attachUser);

  app.get('/api/health', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }));
  app.use('/api/auth', authRoutes);
  app.use('/api/me', buyerRoutes);
  app.use('/api/seller', sellerRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', fileRoutes);
  app.use('/api', publicRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: `No existe ${req.method} ${req.path}` }));

  const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (req, res, next) => (req.path.startsWith('/api') ? next() : res.sendFile(path.join(webDist, 'index.html'))));
  }

  // Errores: los HttpError llevan su mensaje al cliente; el resto se registra sin datos del pedido.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500 && !err.status) console.error(`[error] ${req.method} ${req.path}`, err.message, err.code || '');
    // Solo los errores inesperados ocultan su mensaje; los intencionales (con status) lo muestran.
    const message = !err.status && status >= 500
      ? 'Algo falló de nuestro lado. Intentá de nuevo.'
      : err.code === 'LIMIT_FILE_SIZE' ? 'El archivo pesa más de 8 MB.' : err.message;
    res.status(status).json({ error: message, ...(err.extra || {}) });
  });
  return app;
}
