import crypto from 'node:crypto';
import pg from 'pg';
import * as db from '../src/db.js';
import { migrate } from '../src/migrate.js';

/**
 * Crea una base nueva en el Postgres de pruebas, la migra y conecta el pool de la app a ella.
 * Devuelve la función para borrarla al final.
 */
export async function freshDb() {
  const admin = process.env.TEST_PG_URL;
  if (!admin) throw new Error('Corré las pruebas con `npm test` (levanta Postgres local).');
  const name = `t_${crypto.randomBytes(6).toString('hex')}`;
  const c = new pg.Client({ connectionString: admin });
  await c.connect();
  await c.query(`CREATE DATABASE ${name}`);
  await c.end();
  const url = admin.replace(/\/[^/]*$/, `/${name}`);
  db.connect(url);
  await migrate({ log: () => {} });
  return async () => {
    await db.close();
    const c2 = new pg.Client({ connectionString: admin });
    await c2.connect();
    await c2.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await c2.end();
  };
}

let n = 0;
const uniq = () => `${Date.now().toString(36)}${n++}`;

export async function makeUser({ role = 'buyer', name = 'Ana Quispe', phone } = {}) {
  const u = uniq();
  return db.one(
    `INSERT INTO users(id, name, handle, initials, phone, password_hash, role)
     VALUES ($1, $2, $3, 'AQ', $4, 'x', $5) RETURNING *`,
    [db.id('usr'), name, `h_${u}`, phone || `7${u}`.slice(0, 12), role]
  );
}

export async function makeSeller({ plan = 'basico' } = {}) {
  const user = await makeUser({ role: 'seller', name: 'Relojería Andina' });
  const seller = await db.one(
    `INSERT INTO sellers(id, user_id, slug, name, initials, plan, plan_until)
     VALUES ($1, $2, $3, 'Relojería Andina', 'RA', $4, $5) RETURNING *`,
    [db.id('sel'), user.id, `tienda-${uniq()}`, plan, plan === 'premium' ? new Date(Date.now() + 30 * 864e5) : null]
  );
  return { user, seller };
}

/** Producto con variantes: `variants` = [{ label, price, stock }] (precio en Bs). */
export async function makeProduct(sellerId, { title = 'Peluche oso', variants = [{ label: 'Única', price: 90, stock: 10 }] } = {}) {
  const product = await db.one(
    `INSERT INTO products(id, seller_id, title) VALUES ($1, $2, $3) RETURNING *`,
    [db.id('prd'), sellerId, title]
  );
  const vs = [];
  for (const [i, v] of variants.entries()) {
    vs.push(await db.one(
      `INSERT INTO variants(id, product_id, label, price_cents, stock, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [db.id('var'), product.id, v.label, Math.round(v.price * 100), v.stock, i]
    ));
  }
  return { product, variants: vs };
}

export async function makeStream(sellerId, status = 'live') {
  return db.one(
    `INSERT INTO streams(id, seller_id, title, status, started_at) VALUES ($1, $2, 'Vivo de prueba', $3, now()) RETURNING *`,
    [db.id('str'), sellerId, status]
  );
}

/** Pedido mínimo (con su pago) para colgarle apartados en las pruebas de stock. */
export async function makeOrderShell(buyerId, sellerId) {
  const payment = await db.one(
    `INSERT INTO payments(id, ref, user_id, kind, amount_cents, status, expires_at)
     VALUES ($1, $2, $3, 'orders', 100, 'pending', now() + interval '15 min') RETURNING *`,
    [db.id('pay'), `CM-${uniq()}`, buyerId]
  );
  return db.one(
    `INSERT INTO orders(id, ref, payment_id, buyer_id, seller_id, channel, status, subtotal_cents, total_cents, commission_bp, commission_cents)
     VALUES ($1, $2, $3, $4, $5, 'catalogo', 'pendiente_pago', 100, 100, 1500, 15) RETURNING *`,
    [db.id('ord'), `${payment.ref}-1`, payment.id, buyerId, sellerId]
  );
}
