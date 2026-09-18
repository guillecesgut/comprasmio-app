import 'dotenv/config';
import { RoomServiceClient } from 'livekit-server-sdk';

/**
 * Diagnóstico de las credenciales de LiveKit.
 *   node check-livekit.mjs
 *
 * No imprime el secreto: solo su forma (largo y primeros caracteres), que alcanza
 * para detectar los errores típicos de copiado.
 */
const { LIVEKIT_URL: url, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = process.env;

const line = (label, value) => console.log(`  ${label.padEnd(22)} ${value}`);
let problems = 0;
const problem = (text) => {
  problems++;
  console.log(`  ⚠  ${text}`);
};

console.log('\nArchivo .env\n');

if (!url && !key && !secret) {
  console.log('  No se leyó ninguna variable.');
  console.log('  El archivo .env tiene que estar en esta misma carpeta (server) y llamarse');
  console.log('  exactamente ".env" — ojo con que Windows lo haya guardado como ".env.txt".\n');
  process.exit(1);
}

/* ------------------------------------------------------------------ URL --- */

line('LIVEKIT_URL', url || '(vacío)');
if (!url) problem('Falta la URL.');
else {
  if (!url.startsWith('wss://')) problem('La URL tiene que empezar con wss://, no con https:// ni http://');
  if (url.endsWith('/')) problem('La URL no debe terminar con barra.');
  if (/tu-proyecto|a1b2c3d4|ejemplo/.test(url)) problem('Sigue siendo una URL de ejemplo, no la de tu proyecto.');
  if (url !== url.trim()) problem('La URL tiene espacios al principio o al final.');
}

/* ------------------------------------------------------------- API KEY --- */

line('LIVEKIT_API_KEY', key ? `${key.slice(0, 6)}… (${key.length} caracteres)` : '(vacío)');
if (!key) problem('Falta la clave.');
else {
  if (!key.startsWith('API')) problem('Las claves de LiveKit empiezan con "API". Puede que hayas pegado otro valor.');
  if (key !== key.trim()) problem('La clave tiene espacios alrededor.');
  if (/["']/.test(key)) problem('La clave quedó con comillas. En .env no se usan.');
}

/* -------------------------------------------------------------- SECRET --- */

line('LIVEKIT_API_SECRET', secret ? `${secret.slice(0, 3)}… (${secret.length} caracteres)` : '(vacío)');
if (!secret) problem('Falta el secreto.');
else {
  // Los secretos de LiveKit Cloud rondan los 32 caracteres o más.
  if (secret.length < 30)
    problem(
      `El secreto parece corto (${secret.length} caracteres). Si el original contiene un "#", ` +
        'el archivo .env corta todo lo que viene después salvo que lo pongas entre comillas dobles.'
    );
  if (secret !== secret.trim()) problem('El secreto tiene espacios alrededor.');
  // El panel muestra el secreto enmascarado; si se copia con el mouse se copian los puntos.
  if (/[^\x20-\x7E]/.test(secret) || /^[•·*●\u2022]+$/.test(secret))
    problem(
      'El secreto contiene caracteres de relleno (•, ·, *). Copiaste el valor enmascarado ' +
        'del panel, no el secreto real. LiveKit solo lo muestra al crear la clave: generá ' +
        'una nueva en Settings → Keys y usá el botón de copiar, no el mouse.'
    );
  if (/["']/.test(secret)) problem('El secreto quedó con comillas dentro del valor.');
}

if (problems) {
  console.log(`\n${problems} problema(s) en el archivo. Corregilos y volvé a correr este script.\n`);
  process.exit(1);
}

/* ----------------------------------------------- prueba contra LiveKit --- */

console.log('\nProbando las credenciales contra LiveKit…\n');

try {
  const client = new RoomServiceClient(url.replace(/^wss:/, 'https:'), key, secret);
  const rooms = await client.listRooms();
  console.log(`  ✓ Credenciales válidas. Salas activas en tu proyecto: ${rooms.length}`);
  console.log('\n  Todo listo. Arrancá el servidor con: npm run dev\n');
} catch (e) {
  const text = String(e?.message || e);
  console.log(`  ✗ LiveKit rechazó la conexión: ${text}\n`);

  if (/invalid (token|api key)|401|unauthorized/i.test(text)) {
    console.log('  La clave y el secreto no corresponden entre sí, o son de otro proyecto.');
    console.log('  Entrá a Settings → Keys en cloud.livekit.io, generá un par nuevo y copiá');
    console.log('  los TRES valores (URL, key, secret) de esa misma pantalla, de una sola vez.\n');
  } else if (/ENOTFOUND|EAI_AGAIN|fetch failed/i.test(text)) {
    console.log('  No se pudo llegar al dominio. Revisá la URL y tu conexión a internet.\n');
  }
  process.exit(1);
}
