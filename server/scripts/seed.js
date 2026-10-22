// Datos de ejemplo para desarrollo y para la revisión de las tiendas de apps.
//
//   node scripts/seed.js            → agrega lo que falte (no borra nada)
//
// Crea: categorías, el administrador (ADMIN_EMAIL/ADMIN_PASSWORD o admin@comprasmio.bo /
// comprasmio-admin), un QR de cobro de prueba activo, tiendas con catálogo y variantes, una
// compradora con dirección y tiendas con productos para probar catálogo y vivos.
// Cuentas: compradora 71234567 / comprar123 · vendedor 70000000 / vender123.
import QRCode from 'qrcode';
import { config } from '../src/config.js';
import * as db from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { hash } from '../src/auth.js';
import * as storage from '../src/storage.js';
import { ensureAdmin } from '../src/services/users.js';
import { colorFor } from '../src/util.js';
import { ensureCategories, categoryIdFor } from './categories.js';

db.connect(process.env.DATABASE_URL || config.databaseUrl);
await migrate();
await ensureCategories();
const adminId = await ensureAdmin({
  email: process.env.ADMIN_EMAIL || 'admin@comprasmio.bo',
  password: process.env.ADMIN_PASSWORD || 'comprasmio-admin',
  name: 'Administración',
});

// QR de cobro de prueba (en producción lo sube el administrador desde el panel).
if (!(await db.one('SELECT 1 FROM platform_qrs WHERE active'))) {
  const png = await QRCode.toBuffer('ComprasMio! · QR de prueba · no transferir', { width: 512, margin: 1 });
  const key = storage.newKey('qrs', 'image/png');
  await storage.put(key, png, 'image/png');
  await db.one(
    `INSERT INTO platform_qrs(id, image_key, bank, holder, account, active, created_by, activated_at)
     VALUES ($1,$2,'Banco Unión','ComprasMío! SRL','1000-2345-67',true,$3,now()) RETURNING id`,
    [db.id('qr'), key, adminId]
  );
}

async function user({ name, phone, password, role }) {
  const existing = await db.one('SELECT * FROM users WHERE phone = $1', [phone]);
  if (existing) return existing;
  const handle = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').slice(0, 18);
  return db.one(
    `INSERT INTO users(id, name, handle, initials, phone, password_hash, role) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [db.id('usr'), name, handle, name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(), phone, hash(password), role]
  );
}

async function store(owner, { name, slug, bio, city, verified, ratingPct, sales }) {
  const existing = await db.one('SELECT * FROM sellers WHERE user_id = $1', [owner.id]);
  if (existing) return existing;
  return db.one(
    `INSERT INTO sellers(id, user_id, slug, name, initials, bio, city, color, verified, rating_pct, sales_count, socials)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [db.id('sel'), owner.id, slug, name, name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(), bio, city,
      colorFor(slug), verified, ratingPct, sales,
      JSON.stringify({ tiktok: `@${slug.replace(/-/g, '')}`, instagram: `@${slug.replace(/-/g, '')}` })]
  );
}

async function product(seller, { title, category, description, variants, compareAt, shipping = ['envio_gratis'] }) {
  if (await db.one('SELECT 1 FROM products WHERE seller_id = $1 AND title = $2', [seller.id, title])) return;
  const pid = db.id('prd');
  const attrs = {};
  for (const v of variants) for (const [k, val] of Object.entries(v.options || {})) (attrs[k] ||= new Set()).add(val);
  await db.one(
    `INSERT INTO products(id, seller_id, category_id, title, description, compare_at_cents, shipping_options, attributes, color)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [pid, seller.id, await categoryIdFor(category), title, description, compareAt ? compareAt * 100 : null, shipping,
      JSON.stringify(Object.entries(attrs).map(([name, values]) => ({ name, values: [...values] }))), colorFor(title)]
  );
  for (const [i, v] of variants.entries()) {
    const vid = db.id('var');
    const label = Object.values(v.options || {}).join(' · ') || 'Única';
    await db.one(
      `INSERT INTO variants(id, product_id, options, label, price_cents, stock, position) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [vid, pid, JSON.stringify(v.options || {}), label, v.price * 100, v.stock, i]
    );
    if (v.stock) await db.one(`INSERT INTO stock_movements(variant_id, kind, qty, stock_after, note) VALUES ($1,'alta',$2,$2,'Datos de ejemplo') RETURNING id`, [vid, v.stock]);
  }
}

const buyer = await user({ name: 'Ana Quispe', phone: '71234567', password: 'comprar123', role: 'buyer' });
if (!(await db.one('SELECT 1 FROM addresses WHERE user_id = $1', [buyer.id]))) {
  await db.one(
    `INSERT INTO addresses(id, user_id, label, city, zone, street, reference, phone, is_default)
     VALUES ($1,$2,'Casa','Santa Cruz','Equipetrol','Calle Los Pinos #123','Portón verde','71234567',true) RETURNING id`,
    [db.id('adr'), buyer.id]
  );
}

const relojeria = await store(await user({ name: 'Relojería Andina', phone: '70000000', password: 'vender123', role: 'seller' }), {
  name: 'Relojería Andina', slug: 'relojeria-andina', city: 'Santa Cruz', verified: true, ratingPct: 99, sales: 1080,
  bio: 'Relojes vintage y piezas raras, revisados uno por uno. Envíos a todo el país.',
});
const wari = await store(await user({ name: 'Tejidos Wari', phone: '70000001', password: 'vender123', role: 'seller' }), {
  name: 'Tejidos Wari', slug: 'tejidos-wari', city: 'La Paz', verified: true, ratingPct: 98, sales: 312,
  bio: 'Aguayos, chompas y textiles de alpaca tejidos a mano.',
});
const sol = await store(await user({ name: 'Juguetería Sol', phone: '70000002', password: 'vender123', role: 'seller' }), {
  name: 'Juguetería Sol', slug: 'jugueteria-sol', city: 'Cochabamba', verified: false, ratingPct: 97, sales: 140,
  bio: 'Peluches, juegos de mesa y coleccionables.',
});

await product(relojeria, { title: 'Seiko 5 Automático · 1974', category: 'Vintage', description: 'Esfera azul, caja de acero, revisado y funcionando.', variants: [{ price: 900, stock: 1 }], shipping: ['a_convenir', 'retiro'] });
await product(relojeria, { title: 'Orient Bambino', category: 'Automáticos', description: 'Clásico de vestir, cristal abombado.', variants: [{ options: { Esfera: 'Crema' }, price: 1250, stock: 2 }, { options: { Esfera: 'Negra' }, price: 1250, stock: 1 }], compareAt: 1490 });
await product(relojeria, { title: 'Correa de cuero cosida a mano', category: 'Correas', description: 'Cuero vacuno, hebilla de acero.', variants: [{ options: { Ancho: '18 mm' }, price: 90, stock: 6 }, { options: { Ancho: '20 mm' }, price: 90, stock: 8 }, { options: { Ancho: '22 mm' }, price: 95, stock: 4 }] });
await product(relojeria, { title: 'Casio F-91W dorado', category: 'Relojes', description: 'El clásico digital, en dorado.', variants: [{ price: 270, stock: 5 }] });
await product(wari, { title: 'Aguayo tradicional', category: 'Tejidos', description: 'Tejido a mano en telar, 1,2 × 1,2 m.', variants: [{ options: { Color: 'Rojo' }, price: 320, stock: 4 }, { options: { Color: 'Azul' }, price: 340, stock: 2 }] });
await product(wari, { title: 'Chompa de alpaca', category: 'Mujer', description: 'Alpaca 100 %, abrigada y liviana.', variants: [{ options: { Talla: 'S', Color: 'Natural' }, price: 380, stock: 2 }, { options: { Talla: 'M', Color: 'Natural' }, price: 380, stock: 3 }, { options: { Talla: 'L', Color: 'Natural' }, price: 380, stock: 0 }, { options: { Talla: 'M', Color: 'Gris' }, price: 395, stock: 2 }], compareAt: 450 });
await product(sol, { title: 'Peluche oso gigante', category: 'Peluches', description: '80 cm, relleno hipoalergénico.', variants: [{ options: { Color: 'Café' }, price: 180, stock: 20 }, { options: { Color: 'Blanco' }, price: 180, stock: 12 }] });
await product(sol, { title: 'Cacho de cuero con 5 dados', category: 'Juegos de mesa', description: 'El juego de siempre, cuero cosido.', variants: [{ price: 85, stock: 30 }], shipping: ['envio_gratis', 'retiro'] });

console.log('Datos de ejemplo listos.');
console.log('  Panel:     admin@comprasmio.bo / comprasmio-admin (o ADMIN_EMAIL/ADMIN_PASSWORD)');
console.log('  Compradora 71234567 / comprar123 · Vendedor 70000000 / vender123');
await db.close();
