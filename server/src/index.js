import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';

import * as db from './db.js';
import { attachUser } from './auth.js';
import * as hub from './realtime/hub.js';
import * as engine from './realtime/engine.js';

import * as livekit from './livekit.js';
import authRoutes from './routes/auth.js';
import streamRoutes, { cardOf } from './routes/streams.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import insightRoutes from './routes/insights.js';
import chatRoutes from './routes/chat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

db.load();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }));

/** El cliente pregunta si hay video antes de intentar conectarse. */
app.get('/api/config', (_req, res) => res.json({ live: livekit.config() }));
app.use('/api/auth', authRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/seller', insightRoutes);
app.use('/api', chatRoutes);

/**
 * En desarrollo, la web corre aparte (Vite) y le pega a esta API por proxy.
 * Para un despliegue de un solo servicio (por ejemplo, en Render), esta misma
 * API también sirve el build de la web si existe `web/dist` — así hay una
 * sola URL, sin CORS que configurar ni una segunda cuenta de hosting.
 * Si no compilaste la web, esto simplemente no hace nada.
 */
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  // Cualquier ruta que no sea /api, /uploads o /ws es una ruta de React Router:
  // le devolvemos siempre index.html y el navegador arma el resto.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: `No existe ${req.method} ${req.path}` }));

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? 'Algo falló de nuestro lado.' : err.message });
});

const server = http.createServer(app);

hub.attach(server, {
  onViewersChange(streamId, viewers) {
    const stream = db.find('streams', (s) => s.id === streamId);
    if (!stream) return;
    hub.emit(`stream:${streamId}`, 'stream:viewers', { streamId, viewers: Math.max(viewers, stream.baseViewers || 0) });
    hub.emit('feed', 'stream:update', { stream: cardOf(stream) });
  },
});

const clock = engine.startClock();

server.listen(PORT, () => {
  console.log(`ComprasMío! API  →  http://localhost:${PORT}`);
  console.log(`WebSocket        →  ws://localhost:${PORT}/ws`);
  console.log(
    fs.existsSync(webDist)
      ? `Web (build)      →  serví desde ${webDist}`
      : 'Web (build)      →  no encontrada; corré "npm run build" en web/ para servirla desde acá'
  );
  console.log(
    livekit.isConfigured()
      ? 'Video en vivo       →  LiveKit configurado'
      : 'Video en vivo       →  sin configurar (falta .env con las claves de LiveKit)'
  );
});

function shutdown() {
  clearInterval(clock);
  db.flush();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
