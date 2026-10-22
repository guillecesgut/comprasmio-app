import { one, many, id, tx, fail } from '../db.js';
import * as storage from '../storage.js';
import { slugify } from '../util.js';
import { listProducts, categoryTree } from './catalog.js';
import { sellerMini } from './present.js';
import { liveCards } from './live.js';

/** D1 · Inicio del marketplace. */
export async function home({ viewerId } = {}) {
  const [banners, categories, live, featuredRows, offers, sellers, recent] = await Promise.all([
    many(`SELECT * FROM banners WHERE active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())
          ORDER BY position LIMIT 8`),
    categoryTree(),
    liveCards({ limit: 10 }),
    many(`SELECT ref_id FROM featured WHERE kind = 'producto' ORDER BY position`),
    listProducts({ offers: true, inStock: true, limit: 10 }, { viewerId }),
    many(`SELECT ref_id FROM featured WHERE kind = 'vendedor' ORDER BY position`),
    listProducts({ sort: 'nuevos', limit: 20 }, { viewerId }),
  ]);
  const featured = featuredRows.length
    ? await listProducts({ ids: featuredRows.map((f) => f.ref_id), limit: 20 }, { viewerId })
    : await listProducts({ inStock: true, limit: 6 }, { viewerId });
  // Los destacados respetan el orden que eligió el administrador.
  if (featuredRows.length) {
    const pos = new Map(featuredRows.map((f, i) => [f.ref_id, i]));
    featured.items.sort((a, b) => pos.get(a.id) - pos.get(b.id));
  }
  const sellerRows = sellers.length
    ? await many(`SELECT * FROM sellers WHERE id = ANY($1) AND status = 'active'`, [sellers.map((s) => s.ref_id)])
    : await many(`SELECT * FROM sellers WHERE status = 'active' ORDER BY sales_count DESC, rating_pct DESC LIMIT 6`);
  const followed = viewerId
    ? new Set((await many('SELECT seller_id FROM follows WHERE user_id = $1', [viewerId])).map((r) => r.seller_id))
    : new Set();
  return {
    banners: await Promise.all(banners.map(async (b) => ({
      id: b.id, title: b.title, cta: b.cta, imageUrl: await storage.url(b.image_key), targetType: b.target_type, targetId: b.target_id,
    }))),
    categories: categories.map(({ children, ...c }) => c),
    live,
    featured: featured.items,
    offers: offers.items,
    sellers: await Promise.all(sellerRows.map(async (s) => ({
      ...(await sellerMini(s)),
      productsCount: (await one(`SELECT count(*)::int AS n FROM products WHERE seller_id = $1 AND status = 'active'`, [s.id])).n,
      following: followed.has(s.id),
    }))),
    recent: recent.items,
  };
}

// --------------------------------------------------- F10 · categorías ---

export async function adminCategories() {
  const rows = await many(
    `SELECT c.*, (SELECT count(*)::int FROM products p WHERE p.category_id = c.id AND p.status <> 'deleted') AS products
     FROM categories c ORDER BY c.position, c.name`
  );
  return rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, icon: c.icon, parentId: c.parent_id, position: c.position, active: c.active, products: c.products }));
}

export async function saveCategory(input, categoryId = null) {
  const name = String(input.name || '').trim();
  if (!name) fail(400, 'Escribí el nombre de la categoría.');
  if (input.parentId && input.parentId === categoryId) fail(400, 'Una categoría no puede ser su propia subcategoría.');
  if (input.parentId) {
    const parent = await one('SELECT parent_id FROM categories WHERE id = $1', [input.parentId]);
    if (!parent) fail(400, 'La categoría padre no existe.');
    if (parent.parent_id) fail(400, 'Solo hay dos niveles: categoría y subcategoría.');
  }
  if (categoryId) {
    const row = await one(
      'UPDATE categories SET name = $2, icon = $3, parent_id = $4, active = $5 WHERE id = $1 RETURNING id',
      [categoryId, name, input.icon || null, input.parentId || null, input.active !== false]
    );
    if (!row) fail(404, 'Esa categoría no existe.');
    return row.id;
  }
  let slug = slugify(name);
  for (let n = 2; await one('SELECT 1 FROM categories WHERE slug = $1', [slug]); n++) slug = `${slugify(name)}-${n}`;
  const pos = (await one('SELECT COALESCE(max(position), 0) + 1 AS n FROM categories WHERE parent_id IS NOT DISTINCT FROM $1', [input.parentId || null])).n;
  return (await one(
    'INSERT INTO categories(id, parent_id, name, slug, icon, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [id('cat'), input.parentId || null, name, slug, input.icon || null, pos]
  )).id;
}

export async function reorderCategories(ids) {
  await tx(async (q) => {
    for (const [i, cid] of ids.entries()) await q.query('UPDATE categories SET position = $2 WHERE id = $1', [cid, i]);
  });
}

// ----------------------------------------------- F11 · banners y destacados ---

export async function adminBanners() {
  const rows = await many('SELECT * FROM banners ORDER BY position');
  return Promise.all(rows.map(async (b) => ({
    id: b.id, title: b.title, cta: b.cta, imageKey: b.image_key, imageUrl: await storage.url(b.image_key), targetType: b.target_type,
    targetId: b.target_id, position: b.position, startsAt: b.starts_at, endsAt: b.ends_at, active: b.active,
  })));
}

const TARGETS = ['producto', 'categoria', 'vendedor', 'vivo', 'link'];

export async function saveBanner(input, bannerId = null) {
  if (!input.imageKey || !String(input.imageKey).startsWith('banners/')) fail(400, 'Subí la imagen del banner.');
  const title = String(input.title || '').trim();
  if (!title) fail(400, 'Escribí el título del banner.');
  if (!TARGETS.includes(input.targetType)) fail(400, 'Elegí a dónde lleva el banner.');
  if (!input.targetId) fail(400, 'Indicá el destino del banner.');
  const values = [title.slice(0, 60), String(input.cta || 'Ver colección').slice(0, 24), input.imageKey, input.targetType,
    String(input.targetId).slice(0, 300), input.startsAt || null, input.endsAt || null, input.active !== false];
  if (bannerId) {
    const row = await one(
      `UPDATE banners SET title=$2, cta=$3, image_key=$4, target_type=$5, target_id=$6, starts_at=$7, ends_at=$8, active=$9 WHERE id=$1 RETURNING id`,
      [bannerId, ...values]
    );
    if (!row) fail(404, 'Ese banner no existe.');
    return row.id;
  }
  const pos = (await one('SELECT COALESCE(max(position), 0) + 1 AS n FROM banners')).n;
  return (await one(
    `INSERT INTO banners(id, title, cta, image_key, target_type, target_id, starts_at, ends_at, active, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [id('ban'), ...values, pos]
  )).id;
}

export async function deleteBanner(bannerId) {
  const row = await one('DELETE FROM banners WHERE id = $1 RETURNING image_key', [bannerId]);
  if (!row) fail(404, 'Ese banner no existe.');
  await storage.remove(row.image_key).catch(() => {});
}

export async function reorderBanners(ids) {
  await tx(async (q) => {
    for (const [i, bid] of ids.entries()) await q.query('UPDATE banners SET position = $2 WHERE id = $1', [bid, i]);
  });
}

export async function featured() {
  const rows = await many('SELECT * FROM featured ORDER BY kind, position');
  const products = rows.filter((r) => r.kind === 'producto').map((r) => r.ref_id);
  const sellers = rows.filter((r) => r.kind === 'vendedor').map((r) => r.ref_id);
  const productRows = products.length ? await many('SELECT id, title FROM products WHERE id = ANY($1)', [products]) : [];
  const sellerRows = sellers.length ? await many('SELECT id, name FROM sellers WHERE id = ANY($1)', [sellers]) : [];
  return {
    products: products.map((pid) => productRows.find((p) => p.id === pid)).filter(Boolean),
    sellers: sellers.map((sid) => sellerRows.find((s) => s.id === sid)).filter(Boolean),
  };
}

export async function setFeatured(kind, ids) {
  if (!['producto', 'vendedor'].includes(kind)) fail(400, 'Tipo inválido.');
  await tx(async (q) => {
    await q.query('DELETE FROM featured WHERE kind = $1', [kind]);
    for (const [i, rid] of [...new Set(ids)].slice(0, 30).entries()) {
      await q.query('INSERT INTO featured(kind, ref_id, position) VALUES ($1,$2,$3)', [kind, rid, i]);
    }
  });
  return featured();
}
