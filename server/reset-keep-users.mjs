/**
 * Deja la plataforma como recién estrenada: borra transmisiones, órdenes,
 * mensajes, hilos de chat y catálogo de productos. Conserva únicamente las
 * dos cuentas que le indiques (y, si alguna es vendedora, su fila de
 * `sellers` — sin ella no podría iniciar sesión).
 *
 * IMPORTANTE: parar el servidor antes de correr esto. El servidor escribe su
 * propio estado en memoria cada tanto; si sigue corriendo, puede pisar el
 * archivo limpio con datos viejos que todavía tenía en memoria.
 *
 * Uso:
 *   node reset-keep-users.mjs                     (usa las dos cuentas de simulación: 77326694 y 75580800)
 *   node reset-keep-users.mjs 70000000 71234567    (o elegís vos otros celulares a conservar)
 */
import * as db from './src/db.js';

const DEFAULT_KEEP = ['77326694', '75580800']; // las dos cuentas de simulación
const keepPhones = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_KEEP;

db.load();
const before = db.get();

const keptUsers = before.users.filter((u) => keepPhones.includes(u.phone));

if (keptUsers.length === 0) {
  console.error(`No encontré ninguna cuenta con esos celulares: ${keepPhones.join(', ')}`);
  console.error('Cuentas que sí existen ahora mismo:');
  before.users.forEach((u) => console.error(`  ${u.phone}  ·  ${u.name}  ·  ${u.role}`));
  process.exit(1);
}

const keptUserIds = new Set(keptUsers.map((u) => u.id));
const keptSellerIds = new Set(keptUsers.filter((u) => u.sellerId).map((u) => u.sellerId));

const state = db.get();
state.users = keptUsers;
state.sellers = before.sellers.filter((s) => keptSellerIds.has(s.id));
state.products = [];
state.streams = [];
state.orders = [];
state.messages = [];
state.threads = [];
state.meta = { orderSeq: 10482, lotSeq: 4 };
// Cuentas fresh no siguen nada todavía.
state.users.forEach((u) => { u.favorites = []; });

db.flush();

console.log('Listo. Quedó así:');
keptUsers.forEach((u) => console.log(`  ${u.phone}  ·  ${u.name}  ·  ${u.role}`));
console.log('\nTransmisiones, productos, órdenes, mensajes y el resto de las cuentas: borrados.');
