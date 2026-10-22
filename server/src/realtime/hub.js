import { WebSocketServer } from 'ws';
import { verify } from '../auth.js';
import { one } from '../db.js';

/**
 * Canales:
 *   feed           vivos que empiezan o terminan (público)
 *   stream:<id>    puja, compra, chat, espectadores de un vivo (público)
 *   user:<id>      avisos y pedidos de esa persona (se une sola al conectar)
 *   seller:<id>    pedidos y mensajes de una tienda (solo su dueño)
 *   admin          pagos y reclamos nuevos (solo el equipo)
 */
const channels = new Map();

let wss = null;

function join(ws, channel) {
  if (!channels.has(channel)) channels.set(channel, new Set());
  channels.get(channel).add(ws);
  ws.channels.add(channel);
}

function leave(ws, channel) {
  channels.get(channel)?.delete(ws);
  ws.channels.delete(channel);
}

export function emit(channel, type, payload) {
  const set = channels.get(channel);
  if (!set || set.size === 0) return;
  const frame = JSON.stringify({ type, payload, at: Date.now() });
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(frame);
  }
}

export const viewersOf = (streamId) => channels.get(`stream:${streamId}`)?.size ?? 0;

/** ¿Puede esta conexión escuchar este canal? */
function allowed(ws, channel) {
  if (channel === 'feed' || channel.startsWith('stream:')) return true;
  if (channel === 'admin') return ws.role === 'admin';
  if (channel.startsWith('seller:')) return Boolean(ws.sellerId) && channel === `seller:${ws.sellerId}`;
  return false; // user:<id> se asigna solo al conectar
}

export function attach(server, { onViewersChange } = {}) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const payload = verify(url.searchParams.get('token') || '');
    ws.userId = payload?.sub || null;
    ws.role = payload?.role || null;
    ws.sellerId = null;
    ws.channels = new Set();
    ws.isAlive = true;

    if (ws.userId) {
      join(ws, `user:${ws.userId}`);
      // La tienda del usuario se busca una vez; las suscripciones que llegan antes esperan.
      ws.ready = one('SELECT id FROM sellers WHERE user_id = $1', [ws.userId])
        .then((s) => { ws.sellerId = s?.id || null; })
        .catch(() => {});
    } else {
      ws.ready = Promise.resolve();
    }

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (typeof msg.channel !== 'string' || msg.channel.length > 80) return;
      await ws.ready;

      if (msg.type === 'subscribe') {
        if (!allowed(ws, msg.channel)) return;
        join(ws, msg.channel);
        if (msg.channel.startsWith('stream:')) {
          const streamId = msg.channel.slice(7);
          onViewersChange?.(streamId, viewersOf(streamId));
        }
      }
      if (msg.type === 'unsubscribe') {
        const wasStream = msg.channel.startsWith('stream:') && ws.channels.has(msg.channel);
        leave(ws, msg.channel);
        if (wasStream) {
          const streamId = msg.channel.slice(7);
          onViewersChange?.(streamId, viewersOf(streamId));
        }
      }
    });

    ws.on('close', () => {
      const streams = [...ws.channels].filter((c) => c.startsWith('stream:'));
      for (const c of [...ws.channels]) leave(ws, c);
      for (const c of streams) {
        const streamId = c.slice(7);
        onViewersChange?.(streamId, viewersOf(streamId));
      }
    });
  });

  // Descarta conexiones muertas: en móvil se pierden sin cerrar el socket.
  const ping = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
  ping.unref();
  wss.on('close', () => clearInterval(ping));

  return wss;
}
