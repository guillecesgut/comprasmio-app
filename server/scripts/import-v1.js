// Trae a la base v2 las cuentas de la v1 (archivo JSON): usuarios con su misma contraseña,
// tiendas, productos (como catálogo con una variante), seguidos y bloqueos.
//
//   node scripts/import-v1.js data/comprasmio.json
//
// Es idempotente: lo que ya existe (mismo id o mismo celular) no se toca.
// Los pedidos de la v1 NO se importan: se pagaron directo al vendedor, y meterlos en las
// liquidaciones semanales de la v2 haría que se les pague dos veces.
import fs from 'node:fs';
import { config } from '../src/config.js';
import * as db from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { slugify, colorFor } from '../src/util.js';
import { categoryIdFor, ensureCategories } from './categories.js';

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('Uso: node scripts/import-v1.js <ruta al comprasmio.json de la v1>');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
db.connect(process.env.DATABASE_URL || config.databaseUrl);
await migrate();
await ensureCategories();

const counts = { users: 0, sellers: 0, products: 0, follows: 0, blocks: 0, skipped: 0 };

await db.tx(async (q) => {
  for (const u of data.users || []) {
    if (!u.phone || !u.password) { counts.skipped++; continue; }
    const exists = await db.one('SELECT 1 FROM users WHERE id = $1 OR phone = $2', [u.id, u.phone], q);
    if (exists) { counts.skipped++; continue; }
    let handle = u.handle || `usuario_${u.id.slice(-6)}`;
    for (let n = 2; await db.one('SELECT 1 FROM users WHERE handle = $1', [handle], q); n++) handle = `${u.handle}${n}`;
    await q.query(
      `INSERT INTO users(id, name, handle, initials, phone, password_hash, role, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [u.id, u.name, handle, u.initials || u.name.slice(0, 2).toUpperCase(), u.phone, u.password, u.role === 'seller' ? 'seller' : 'buyer', u.createdAt || new Date()]
    );
    counts.users++;
  }

  for (const s of data.sellers || []) {
    if (await db.one('SELECT 1 FROM sellers WHERE id = $1', [s.id], q)) continue;
    if (!(await db.one('SELECT 1 FROM users WHERE id = $1', [s.ownerId], q))) continue;
    let slug = slugify(s.name);
    for (let n = 2; await db.one('SELECT 1 FROM sellers WHERE slug = $1', [slug], q); n++) slug = `${slugify(s.name)}-${n}`;
    await q.query(
      `INSERT INTO sellers(id, user_id, slug, name, initials, color, verified, rating_pct, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [s.id, s.ownerId, slug, s.name, s.initials || s.name.slice(0, 2).toUpperCase(), colorFor(s.id), Boolean(s.verified),
        Math.round(Number(s.rating ?? 100)), s.createdAt || new Date()]
    );
    await q.query(`UPDATE users SET role = 'seller' WHERE id = $1`, [s.ownerId]);
    counts.sellers++;
  }

  for (const p of data.products || []) {
    if (await db.one('SELECT 1 FROM products WHERE id = $1', [p.id], q)) continue;
    if (!(await db.one('SELECT 1 FROM sellers WHERE id = $1', [p.sellerId], q))) continue;
    // En la v1 un producto de subasta no tenía precio de catálogo: se usa su precio mínimo.
    const price = p.mode === 'fixed' ? p.price : Math.max(p.min || 0, p.start || 0);
    if (!(price > 0)) continue;
    const sold = p.status === 'sold';
    const units = sold ? 0 : p.mode === 'fixed' ? p.stock || 0 : 1;
    await q.query(
      `INSERT INTO products(id, seller_id, category_id, title, shipping_options, color, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [p.id, p.sellerId, await categoryIdFor(p.category, q), p.name, [p.shipping === 'free' ? 'envio_gratis' : 'a_convenir'], p.grad || colorFor(p.id), p.createdAt || new Date()]
    );
    const vid = db.id('var');
    await q.query(
      `INSERT INTO variants(id, product_id, label, price_cents, stock, sold) VALUES ($1,$2,'Única',$3,$4,$5)`,
      [vid, p.id, Math.round(price * 100), units, sold ? 1 : 0]
    );
    if (units > 0) await q.query(`INSERT INTO stock_movements(variant_id, kind, qty, stock_after, note) VALUES ($1,'alta',$2,$2,'Importado de la v1')`, [vid, units]);
    counts.products++;
  }

  // Favoritos de la v1 = transmisiones guardadas → seguir a la tienda de esa transmisión.
  const streamSeller = new Map((data.streams || []).map((st) => [st.id, st.sellerId]));
  for (const u of data.users || []) {
    for (const sid of u.favorites || []) {
      const sellerId = streamSeller.get(sid);
      if (!sellerId) continue;
      const ok = await db.one(
        `INSERT INTO follows(user_id, seller_id) SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM users WHERE id = $1)
           AND EXISTS (SELECT 1 FROM sellers WHERE id = $2) ON CONFLICT DO NOTHING RETURNING 1`,
        [u.id, sellerId], q
      );
      if (ok) counts.follows++;
    }
    for (const handle of u.blocked || []) {
      const ok = await db.one(
        `INSERT INTO user_blocks(user_id, blocked_user_id) SELECT $1, id FROM users WHERE handle = $2 AND id <> $1
         AND EXISTS (SELECT 1 FROM users WHERE id = $1) ON CONFLICT DO NOTHING RETURNING 1`,
        [u.id, handle], q
      );
      if (ok) counts.blocks++;
    }
  }
});

console.log('Importación de la v1 terminada:', counts);
console.log('Los pedidos de la v1 no se importan (se pagaron directo al vendedor).');
await db.close();
