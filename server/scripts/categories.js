import * as db from '../src/db.js';
import { slugify, plain } from '../src/util.js';

/** Categorías iniciales del marketplace (íconos SF Symbols del handoff v2). */
export const CATEGORIES = [
  { name: 'Ropa', icon: 'tshirt', children: ['Mujer', 'Hombre', 'Niños', 'Calzado'] },
  { name: 'Relojes', icon: 'applewatch', children: ['Vintage', 'Automáticos', 'Correas'] },
  { name: 'Electrónica', icon: 'desktopcomputer', children: ['Celulares', 'Audio', 'Accesorios'] },
  { name: 'Hogar', icon: 'sofa', children: ['Decoración', 'Cocina', 'Textiles'] },
  { name: 'Juguetes', icon: 'teddybear', children: ['Peluches', 'Coleccionables', 'Juegos de mesa'] },
  { name: 'Accesorios', icon: 'bag', children: ['Joyas', 'Carteras', 'Lentes'] },
  { name: 'Belleza', icon: 'sparkles', children: ['Maquillaje', 'Cuidado de la piel', 'Perfumes'] },
  { name: 'Artesanía', icon: 'paintpalette', children: ['Tejidos', 'Plata', 'Cerámica'] },
  { name: 'General', icon: 'shippingbox', children: [] },
];

export async function ensureCategories(q) {
  for (const [i, c] of CATEGORIES.entries()) {
    const slug = slugify(c.name);
    let row = await db.one('SELECT id FROM categories WHERE slug = $1', [slug], q);
    if (!row) row = await db.one('INSERT INTO categories(id, name, slug, icon, position) VALUES ($1,$2,$3,$4,$5) RETURNING id', [db.id('cat'), c.name, slug, c.icon, i], q);
    for (const [j, child] of c.children.entries()) {
      const cslug = `${slug}-${slugify(child)}`;
      if (!(await db.one('SELECT 1 FROM categories WHERE slug = $1', [cslug], q))) {
        await db.one('INSERT INTO categories(id, parent_id, name, slug, position) VALUES ($1,$2,$3,$4,$5) RETURNING id', [db.id('cat'), row.id, child, cslug, j], q);
      }
    }
  }
}

/** Busca una categoría por nombre (sin acentos); si no existe, cae en General. */
export async function categoryIdFor(name, q) {
  const rows = await db.many('SELECT id, name, parent_id FROM categories', [], q);
  const wanted = plain(name);
  const match = rows.find((r) => plain(r.name) === wanted) || rows.find((r) => r.name === 'General');
  return match?.id || null;
}
