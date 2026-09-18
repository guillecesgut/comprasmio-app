import { WebSocketServer } from 'ws';
import { verify } from '../auth.js';

/**
 * Canales:
 *   stream:<id>  puja, compra, chat, contador de espectadores
 *   user:<id>    cambios de estado de las órdenes del comprador
 *   seller:<id>  pedidos entrantes y verificaciones
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

export function attach(server, { onViewersChange } = {}) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const payload = verify(url.searchParams.get('token') || '');
    ws.userId = payload?.sub || null;
    ws.channels = new Set();
    ws.isAlive = true;

    if (ws.userId) join(ws, `user:${ws.userId}`);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'subscribe' && typeof msg.channel === 'string') {
        join(ws, msg.channel);
        if (msg.channel.startsWith('stream:')) {
          const streamId = msg.channel.slice(7);
          onViewersChange?.(streamId, viewersOf(streamId));
        }
      }
      if (msg.type === 'unsubscribe' && typeof msg.channel === 'string') {
        const wasStream = msg.channel.startsWith('stream:');
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
  wss.on('close', () => clearInterval(ping));

  return wss;
}
