import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';

/**
 * Archivos (fotos, comprobantes, QR) en un bucket privado compatible con S3 (Cloudflare R2) o,
 * en desarrollo, en disco. Nunca se exponen por URL fija: siempre por enlace firmado que vence.
 *
 * Los enlaces de imágenes públicas (fotos de producto, avatares) se firman con una fecha
 * redondeada al día para que la URL no cambie en cada pedido y el celular pueda cachearla.
 * Los comprobantes de pago se firman por 10 minutos.
 */
const LOCAL_DIR = config.storage.localDir
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');

const s3 = config.storage.driver === 's3'
  ? new S3Client({
      region: config.storage.region,
      endpoint: config.storage.endpoint || undefined,
      credentials: { accessKeyId: config.storage.accessKeyId, secretAccessKey: config.storage.secretAccessKey },
    })
  : null;

const PRIVATE_PREFIXES = ['receipts/', 'refunds/', 'payouts/', 'payout-accounts/', 'claims/'];
export const isPrivate = (key) => PRIVATE_PREFIXES.some((p) => key.startsWith(p));

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' };
export const ALLOWED_TYPES = Object.keys(EXT);

export function newKey(folder, contentType) {
  return `${folder}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${EXT[contentType] || 'bin'}`;
}

export async function put(key, buffer, contentType) {
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: config.storage.bucket, Key: key, Body: buffer, ContentType: contentType }));
    return key;
  }
  const file = path.join(LOCAL_DIR, key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  return key;
}

export async function remove(key) {
  if (!key) return;
  if (s3) await s3.send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: key }));
  else fs.rmSync(path.join(LOCAL_DIR, key), { force: true });
}

const DAY = 86_400;

/** Enlace firmado para ver un archivo. `null` si no hay archivo. */
export async function url(key) {
  if (!key) return null;
  if (/^https?:|^data:/.test(key)) return key; // datos de demostración con URL externa
  const priv = isPrivate(key);
  const now = Math.floor(Date.now() / 1000);
  const ttl = priv ? 600 : 7 * DAY;
  if (s3) {
    const signingDate = priv ? new Date() : new Date(Math.floor(now / DAY) * DAY * 1000);
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: config.storage.bucket, Key: key }), { expiresIn: ttl, signingDate });
  }
  const exp = priv ? now + ttl : Math.floor(now / DAY) * DAY + ttl;
  return `${config.publicUrl}/api/files/${encodeURI(key)}?exp=${exp}&sig=${sign(key, exp)}`;
}

const sign = (key, exp) => crypto.createHmac('sha256', config.fileSecret).update(`${key}:${exp}`).digest('hex').slice(0, 32);

/** Para la ruta /api/files del disco local. */
export function verifyLocal(key, exp, sig) {
  if (!key || key.includes('..') || !exp || !sig) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  const expected = sign(key, Number(exp));
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export const localPath = (key) => path.join(LOCAL_DIR, key);
