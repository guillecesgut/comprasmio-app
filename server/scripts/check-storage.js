// Prueba el bucket configurado en .env (STORAGE_*): sube un archivo, lo lee con el enlace
// firmado y lo borra. Nunca imprime claves.
//
//   npm run check:storage
import { config } from '../src/config.js';
import * as storage from '../src/storage.js';

const s = config.storage;
const mask = (v) => (v ? `${String(v).slice(0, 4)}…(${String(v).length} caracteres)` : '(vacío)');
console.log('Driver   :', s.driver);
if (s.driver !== 's3') {
  console.log('No hay bucket configurado: faltan STORAGE_BUCKET y STORAGE_ACCESS_KEY en server/.env.');
  process.exit(1);
}
console.log('Endpoint :', s.endpoint || '(vacío)');
console.log('Bucket   :', s.bucket);
console.log('Región   :', s.region);
console.log('Access key:', mask(s.accessKeyId));
console.log('Secret   :', s.secretAccessKey ? 'cargado' : '(vacío)');

// PNG de 1×1 (los tipos permitidos son imágenes y PDF).
const body = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const key = storage.newKey('receipts', 'image/png');
try {
  await storage.put(key, body, 'image/png');
  console.log('1/3 Subida        ✓', key);
  const url = await storage.url(key);
  const res = await fetch(url);
  const got = Buffer.from(await res.arrayBuffer());
  if (!res.ok || !got.equals(body)) throw new Error(`lectura por enlace firmado: HTTP ${res.status}`);
  console.log('2/3 Enlace firmado ✓ (vence a los 10 min)');
  const plain = s.endpoint ? await fetch(`${s.endpoint.replace(/\/$/, '')}/${s.bucket}/${key}`).then((r) => r.status).catch(() => 'sin respuesta') : 'n/a';
  console.log(`    Sin firma       → ${plain === 200 ? '⚠ el archivo es PÚBLICO: revisá el acceso del bucket' : `bloqueado (${plain}) ✓ privado`}`);
  await storage.remove(key);
  console.log('3/3 Borrado        ✓');
  console.log('\nEl bucket funciona.');
} catch (err) {
  console.error('\n✗ Falló:', err.name || '', err.message);
  if (/AccessDenied|Forbidden|403/i.test(`${err.name} ${err.message}`)) console.error('  → La clave no tiene permiso de lectura y escritura sobre este bucket.');
  if (/NoSuchBucket/i.test(`${err.name} ${err.message}`)) console.error('  → El nombre del bucket no coincide.');
  if (/ENOTFOUND|getaddrinfo|InvalidEndpoint/i.test(err.message)) console.error('  → Revisá STORAGE_ENDPOINT (https://<id de cuenta>.r2.cloudflarestorage.com).');
  if (/SignatureDoesNotMatch|InvalidAccessKeyId/i.test(`${err.name} ${err.message}`)) console.error('  → Access Key ID o Secret incorrectos.');
  process.exit(1);
}
