import { AccessToken } from 'livekit-server-sdk';
import * as db from './db.js';

const URL = process.env.LIVEKIT_URL || '';
const KEY = process.env.LIVEKIT_API_KEY || '';
const SECRET = process.env.LIVEKIT_API_SECRET || '';

/**
 * El video es opcional: sin credenciales la plataforma funciona igual, solo que
 * la sala muestra el bloque de color en vez de la transmisión. Así nadie queda
 * bloqueado por no tener cuenta de LiveKit.
 */
export const isConfigured = () => Boolean(URL && KEY && SECRET);

export const config = () => ({ url: URL, configured: isConfigured() });

/**
 * Un token por persona y por sala. Solo el dueño de la transmisión puede publicar;
 * el resto entra a mirar. Esto se decide acá, en el servidor: si dependiera del
 * cliente, cualquiera podría pedir permiso de publicación y aparecer en el vivo.
 */
export async function issueToken(stream, user) {
  if (!isConfigured()) return null;

  const seller = db.find('sellers', (s) => s.id === stream.sellerId);
  const isBroadcaster = Boolean(user.sellerId && user.sellerId === stream.sellerId);

  const token = new AccessToken(KEY, SECRET, {
    identity: user.id,
    name: isBroadcaster ? seller?.name || user.name : user.handle,
    ttl: '4h',
  });

  token.addGrant({
    room: stream.id,
    roomJoin: true,
    canPublish: isBroadcaster,
    canPublishData: isBroadcaster,
    canSubscribe: true,
  });

  return {
    url: URL,
    token: await token.toJwt(),
    room: stream.id,
    role: isBroadcaster ? 'broadcaster' : 'viewer',
  };
}
