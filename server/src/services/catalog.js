import { one, many, id, tx, fail, afterCommit } from '../db.js';
import * as storage from '../storage.js';
import * as stock from './stock.js';
import { bs, toCents, colorFor, clampInt } from '../util.js';
import { productCards, PRODUCT_CARD_SELECT, sellerMini, photosByProduct } from './present.js';

const SHIPPING = ['envio_gratis', 'a_convenir', 'retiro'];

// ----------------------------------------------------------- categorías ---

export async function categoryTree() {
  const rows = await many('SELECT * FROM categories WHERE active ORDER BY position, name');
  const counts = await many(
    `SELECT category_id, count(*)::int AS n FROM products WHERE status = 'active' AND category_id IS NOT NULL GROUP BY category_id`
  );
  const countBy = new Map(counts.map((c) => [c.category_id, c.n]));
  const node = (c) => ({ id: c.id, name: c.name, slug: c.slug, icon: c.icon, parentId: c.parent_id, products: countBy.get(c.id) || 0 });
  const roots = rows.filter((c) => !c.parent_id).map((c) => ({
    ...node(c),
    children: rows.filter((x) => x.parent_id === c.id).map(node),
  }));
  for (const r of roots) r.products += r.children.reduce((s, c) => s + c.products, 0);
  return roots;
}

async function categoryAndChildren(categoryId) {
  const rows = await many('SELECT id FROM categories WHERE id = $1 OR parent_id = $1', [categoryId]);
  return rows.map((r) => r.id);
}

// -------------------------------------------------------------- listado ---

const SORTS = {
  relevancia: 'agg.sold DESC, p.created_at DESC',
  precio_asc: 'agg.min_price_cents ASC',
  precio_desc: 'agg.min_price_cents DESC',
  nuevos: 'p.created_at DESC',
};

/**
 * Búsqueda y listados del marketplace (D1, D2, D4, D9). Solo productos activos de tiendas activas.
 * Filtros: q, categoryId (incluye subcategorías), sellerId, minPrice/maxPrice (Bs), freeShipping,
 * offers, inStock, sort, limit/offset.
 */
export async function listProducts(filters = {}, { viewerId } = {}) {
  const where = [`p.status = 'active'`, `s.status = 'active'`];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };

  if (filters.q) {
    const q = String(filters.q).trim().slice(0, 80);
    params.push(q);
    const n = params.length;
    where.push(`(p.search @@ plainto_tsquery('simple', $${n}) OR p.title ILIKE '%' || $${n} || '%' OR s.name ILIKE '%' || $${n} || '%')`);
  }
  if (filters.categoryId) add('p.category_id = ANY(?)', await categoryAndChildren(filters.categoryId));
  if (filters.sellerId) add('p.seller_id = ?', filters.sellerId);
  if (filters.minPrice) add('agg.min_price_cents >= ?', toCents(filters.minPrice));
  if (filters.maxPrice) add('agg.min_price_cents <= ?', toCents(filters.maxPrice));
  if (filters.freeShipping === 'true' || filters.freeShipping === true) where.push(`'envio_gratis' = ANY(p.shipping_options)`);
  if (filters.offers === 'true' || filters.offers === true) where.push('p.compare_at_cents > agg.min_price_cents');
  if (filters.inStock === 'true' || filters.inStock === true) where.push('agg.available > 0');
  if (filters.ids) add('p.id = ANY(?)', [].concat(filters.ids));

  const limit = clampInt(filters.limit, 1, 60, 20);
  const offset = clampInt(filters.offset, 0, 10_000, 0);
  const order = SORTS[filters.sort] || SORTS.relevancia;

  const base = `${PRODUCT_CARD_SELECT} WHERE ${where.join(' AND ')}`;
  const [rows, total] = await Promise.all([
    many(`${base} ORDER BY ${order}, p.id LIMIT ${limit} OFFSET ${offset}`, params),
    one(`SELECT count(*)::int AS n FROM (${base}) t`, params),
  ]);
  const favorites = await favoriteSet(viewerId, rows.map((r) => r.id));
  return { items: await productCards(rows, { favorites }), total: total.n, limit, offset };
}

async function favoriteSet(userId, productIds) {
  if (!userId || !productIds.length) return new Set();
  const rows = await many('SELECT product_id FROM wishlist WHERE user_id = $1 AND product_id = ANY($2)', [userId, productIds]);
  return new Set(rows.map((r) => r.product_id));
}

// -------------------------------------------------------------- detalle ---

/** D5: producto con variantes, disponible por variante, vendedor, reseñas y aviso si hay stock en un vivo. */
export async function productDetail(productId, { viewerId } = {}) {
  const p = await one(
    `SELECT p.*, c.name AS category_name, c.parent_id AS category_parent FROM products p
     LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = $1 AND p.status <> 'deleted'`,
    [productId]
  );
  if (!p) fail(404, 'Este producto ya no está disponible.');
  const seller = await one('SELECT * FROM sellers WHERE id = $1', [p.seller_id]);
  if (p.status !== 'active' || seller.status !== 'active') {
    // El dueño puede ver su producto pausado; el público no.
    const isOwner = viewerId && (await one('SELECT 1 FROM sellers WHERE id = $1 AND user_id = $2', [seller.id, viewerId]));
    if (!isOwner) fail(404, 'Este producto ya no está disponible.');
  }
  const variants = await many(
    `SELECT v.*, stock_available(v.id) AS available, live_reserved(v.id) AS in_live
     FROM variants v WHERE v.product_id = $1 ORDER BY v.position`,
    [productId]
  );
  const photoKeys = (await photosByProduct([productId])).get(productId) || [];
  const live = await one(`SELECT id, title FROM streams WHERE seller_id = $1 AND status = 'live' ORDER BY started_at DESC LIMIT 1`, [seller.id]);
  const reviews = await many(
    `SELECT r.*, u.name AS buyer_name, u.initials AS buyer_initials FROM reviews r JOIN users u ON u.id = r.buyer_id
     WHERE r.product_id = $1 ORDER BY r.created_at DESC LIMIT 3`,
    [productId]
  );
  const reviewStats = await one(
    `SELECT count(*)::int AS n, COALESCE(round(avg(rating)::numeric, 1), 0) AS avg FROM reviews WHERE product_id = $1`,
    [productId]
  );
  const favorite = viewerId ? Boolean(await one('SELECT 1 FROM wishlist WHERE user_id = $1 AND product_id = $2', [viewerId, productId])) : false;
  const following = viewerId ? Boolean(await one('SELECT 1 FROM follows WHERE user_id = $1 AND seller_id = $2', [viewerId, seller.id])) : false;

  return {
    id: p.id,
    title: p.title,
    description: p.description,
    condition: p.condition,
    status: p.status,
    category: p.category_id ? { id: p.category_id, name: p.category_name, parentId: p.category_parent } : null,
    compareAt: bs(p.compare_at_cents),
    shippingOptions: p.shipping_options,
    attributes: p.attributes,
    color: p.color,
    photos: await Promise.all(photoKeys.map((k) => storage.url(k))),
    variants: variants.filter((v) => v.active).map((v) => ({
      id: v.id,
      label: v.label,
      options: v.options,
      price: bs(v.price_cents),
      available: v.available,
      inLive: v.in_live,
      sku: v.sku,
    })),
    inLiveNow: live && variants.some((v) => v.in_live > 0) ? { streamId: live.id, title: live.title } : null,
    seller: {
      ...(await sellerMini(seller)),
      followers: (await one('SELECT count(*)::int AS n FROM follows WHERE seller_id = $1', [seller.id])).n,
      liveStreamId: live?.id || null,
      following,
    },
    favorite,
    reviews: {
      count: reviewStats.n,
      avg: reviewStats.avg,
      recent: reviews.map((r) => ({
        id: r.id, rating: r.rating, comment: r.comment, buyer: r.buyer_name, initials: r.buyer_initials,
        at: r.created_at, reply: r.reply,
      })),
    },
  };
}

// ---------------------------------------------------- edición (vendedor) ---

function validateProductInput(input) {
  const title = String(input.title || '').trim();
  const variants = Array.isArray(input.variants) ? input.variants : [];
  const missing = [];
  if (!title) missing.push('el nombre');
  if (!variants.length) missing.push('al menos una variante');
  const noPrice = variants.filter((v) => v.active !== false && !(toCents(v.price) > 0)).length;
  if (noPrice) missing.push(noPrice === 1 && variants.length === 1 ? 'el precio' : `el precio de ${noPrice} variante${noPrice === 1 ? '' : 's'}`);
  const shipping = (input.shippingOptions || []).filter((s) => SHIPPING.includes(s));
  if (!shipping.length) missing.push('cómo se entrega');
  if (missing.length) {
    const text = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} y ${missing.at(-1)}` : missing[0];
    fail(400, `Falta ${text}.`);
  }
  for (const v of variants) {
    const s = Number(v.stock ?? 0);
    if (!Number.isInteger(s) || s < 0) fail(400, 'El stock tiene que ser un número entero, 0 o más.');
  }
  const compareAt = input.compareAt ? toCents(input.compareAt) : null;
  if (input.compareAt && !(compareAt > 0)) fail(400, 'El precio anterior no es válido.');
  return {
    title: title.slice(0, 120),
    description: String(input.description || '').slice(0, 4000),
    categoryId: input.categoryId || null,
    condition: input.condition === 'usado' ? 'usado' : 'nuevo',
    compareAtCents: compareAt,
    shipping,
    attributes: Array.isArray(input.attributes)
      ? input.attributes.filter((a) => a && a.name).map((a) => ({ name: String(a.name).slice(0, 30), values: (a.values || []).map(String).slice(0, 30) }))
      : [],
    variants,
    photoKeys: (input.photoKeys || []).filter((k) => typeof k === 'string' && k.startsWith('products/')).slice(0, 8),
  };
}

const labelOf = (options) => {
  const values = Object.values(options || {}).filter(Boolean);
  return values.length ? values.join(' · ') : 'Única';
};

/** Crea o actualiza un producto con sus variantes y fotos (E2). El stock se ajusta con movimientos. */
export async function saveProduct(sellerId, actorId, input, productId = null) {
  const data = validateProductInput(input);
  if (data.categoryId && !(await one('SELECT 1 FROM categories WHERE id = $1', [data.categoryId]))) fail(400, 'Esa categoría no existe.');

  return tx(async (q) => {
    let pid = productId;
    if (pid) {
      const current = await one(`SELECT * FROM products WHERE id = $1 AND seller_id = $2 AND status <> 'deleted' FOR UPDATE`, [pid, sellerId], q);
      if (!current) fail(404, 'Ese producto no está en tu catálogo.');
      await q.query(
        `UPDATE products SET title=$2, description=$3, category_id=$4, condition=$5, compare_at_cents=$6,
           shipping_options=$7, attributes=$8, updated_at=now() WHERE id=$1`,
        [pid, data.title, data.description, data.categoryId, data.condition, data.compareAtCents, data.shipping, JSON.stringify(data.attributes)]
      );
    } else {
      pid = id('prd');
      await q.query(
        `INSERT INTO products(id, seller_id, category_id, title, description, condition, compare_at_cents, shipping_options, attributes, color)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [pid, sellerId, data.categoryId, data.title, data.description, data.condition, data.compareAtCents, data.shipping,
          JSON.stringify(data.attributes), colorFor(pid)]
      );
    }

    // Variantes: las que vienen con id se actualizan; las nuevas se crean; las que faltan se
    // desactivan (si tienen historia) o se borran.
    const existing = await many('SELECT * FROM variants WHERE product_id = $1', [pid], q);
    const keep = new Set();
    for (const [i, v] of data.variants.entries()) {
      const options = v.options && typeof v.options === 'object' ? v.options : {};
      const label = String(v.label || labelOf(options)).slice(0, 60);
      const price = toCents(v.price);
      const active = v.active !== false;
      const wanted = Number(v.stock ?? 0);
      const found = v.id && existing.find((e) => e.id === v.id);
      if (found) {
        keep.add(found.id);
        await q.query(
          'UPDATE variants SET options=$2, label=$3, price_cents=$4, sku=$5, active=$6, position=$7 WHERE id=$1',
          [found.id, JSON.stringify(options), label, price > 0 ? price : found.price_cents, v.sku || null, active, i]
        );
        if (wanted !== found.stock) {
          await stock.adjust(q, { variantId: found.id, delta: wanted - found.stock, kind: 'correccion', note: 'Editor de producto', actorId });
        }
      } else {
        const vid = id('var');
        keep.add(vid);
        await q.query(
          `INSERT INTO variants(id, product_id, sku, options, label, price_cents, stock, active, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [vid, pid, v.sku || null, JSON.stringify(options), label, price > 0 ? price : 100, wanted, active, i]
        );
        if (wanted > 0) {
          await q.query(
            `INSERT INTO stock_movements(variant_id, kind, qty, stock_after, actor_id) VALUES ($1, 'alta', $2, $2, $3)`,
            [vid, wanted, actorId]
          );
        }
      }
    }
    for (const e of existing.filter((x) => !keep.has(x.id))) {
      const used = await one(
        `SELECT (SELECT count(*) FROM order_items WHERE variant_id = $1) + (SELECT count(*) FROM bundle_items WHERE variant_id = $1)
           + (SELECT count(*) FROM live_reservations WHERE variant_id = $1) AS n`,
        [e.id], q
      );
      if (Number(used.n) > 0) await q.query('UPDATE variants SET active = false WHERE id = $1', [e.id]);
      else await q.query('DELETE FROM variants WHERE id = $1', [e.id]);
    }
    if (!(await one('SELECT 1 FROM variants WHERE product_id = $1 AND active', [pid], q))) fail(400, 'El producto necesita al menos una variante activa.');

    // Fotos en el orden recibido; la primera es la portada.
    const oldPhotos = await many('SELECT storage_key FROM product_photos WHERE product_id = $1', [pid], q);
    await q.query('DELETE FROM product_photos WHERE product_id = $1', [pid]);
    for (const [i, key] of data.photoKeys.entries()) {
      await q.query('INSERT INTO product_photos(id, product_id, storage_key, position) VALUES ($1,$2,$3,$4)', [id('pho'), pid, key, i]);
    }
    const removed = oldPhotos.map((p) => p.storage_key).filter((k) => !data.photoKeys.includes(k));
    afterCommit(q, () => Promise.all(removed.map((k) => storage.remove(k).catch(() => {}))));
    return pid;
  });
}

export async function setProductStatus(sellerId, productId, status) {
  if (!['active', 'paused', 'deleted'].includes(status)) fail(400, 'Estado inválido.');
  const p = await one(`SELECT id FROM products WHERE id = $1 AND seller_id = $2 AND status <> 'deleted'`, [productId, sellerId]);
  if (!p) fail(404, 'Ese producto no está en tu catálogo.');
  if (status === 'deleted') {
    const busy = await one(
      `SELECT count(*)::int AS n FROM variants v WHERE v.product_id = $1 AND (held_by_orders(v.id) > 0 OR live_reserved(v.id) > 0)`,
      [productId]
    );
    if (busy.n > 0) fail(409, 'Este producto tiene unidades apartadas o en un vivo. Podés pausarlo y borrarlo después.');
  }
  await one('UPDATE products SET status = $2, updated_at = now() WHERE id = $1 RETURNING id', [productId, status]);
}

/** E1: catálogo del vendedor con barras de stock. Filtros: todos · activos · sin_stock · pausados · en_vivo. */
export async function sellerCatalog(sellerId, { filter = 'todos', q } = {}) {
  const params = [sellerId];
  let sql = `
    SELECT p.*, agg.*
    FROM products p
    JOIN LATERAL (
      SELECT count(*)::int AS variants_count,
             MIN(v.price_cents) AS min_price_cents, MAX(v.price_cents) AS max_price_cents,
             COALESCE(SUM(stock_available(v.id)), 0)::int AS available,
             COALESCE(SUM(held_by_orders(v.id)), 0)::int AS held,
             COALESCE(SUM(live_reserved(v.id)), 0)::int AS in_live,
             COALESCE(SUM(v.sold), 0)::int AS sold
      FROM variants v WHERE v.product_id = p.id AND v.active
    ) agg ON true
    WHERE p.seller_id = $1 AND p.status <> 'deleted'`;
  if (q) { params.push(`%${q}%`); sql += ` AND p.title ILIKE $${params.length}`; }
  sql += ' ORDER BY p.updated_at DESC';
  let rows = await many(sql, params);
  const counts = {
    todos: rows.length,
    activos: rows.filter((r) => r.status === 'active').length,
    sin_stock: rows.filter((r) => r.status === 'active' && r.available === 0 && r.in_live === 0).length,
    pausados: rows.filter((r) => r.status === 'paused').length,
    en_vivo: rows.filter((r) => r.in_live > 0).length,
  };
  rows = rows.filter((r) => ({
    todos: true,
    activos: r.status === 'active',
    sin_stock: r.status === 'active' && r.available === 0 && r.in_live === 0,
    pausados: r.status === 'paused',
    en_vivo: r.in_live > 0,
  })[filter] ?? true);
  const photos = await photosByProduct(rows.map((r) => r.id));
  const items = await Promise.all(rows.map(async (r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    color: r.color,
    photoUrl: await storage.url((photos.get(r.id) || [])[0]),
    variantsCount: r.variants_count,
    minPrice: bs(r.min_price_cents),
    maxPrice: bs(r.max_price_cents),
    stock: { available: r.available, held: r.held, inLive: r.in_live, sold: r.sold },
  })));
  return { items, counts };
}

/** E2 en modo edición: todo lo que el editor necesita para precargarse. */
export async function productForEdit(sellerId, productId) {
  const p = await one(`SELECT * FROM products WHERE id = $1 AND seller_id = $2 AND status <> 'deleted'`, [productId, sellerId]);
  if (!p) fail(404, 'Ese producto no está en tu catálogo.');
  const variants = await many(
    `SELECT v.*, stock_available(v.id) AS available, held_by_orders(v.id) AS held, live_reserved(v.id) AS in_live
     FROM variants v WHERE v.product_id = $1 AND v.active ORDER BY position`,
    [productId]
  );
  const photos = await many('SELECT storage_key FROM product_photos WHERE product_id = $1 ORDER BY position', [productId]);
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    categoryId: p.category_id,
    condition: p.condition,
    status: p.status,
    compareAt: bs(p.compare_at_cents),
    shippingOptions: p.shipping_options,
    attributes: p.attributes,
    photos: await Promise.all(photos.map(async (ph) => ({ key: ph.storage_key, url: await storage.url(ph.storage_key) }))),
    variants: variants.map((v) => ({
      id: v.id, label: v.label, options: v.options, price: bs(v.price_cents), stock: v.stock, sku: v.sku,
      available: v.available, held: v.held, inLive: v.in_live, sold: v.sold,
    })),
  };
}

/** E3: cifras y movimientos de una variante. */
export async function variantStock(sellerId, variantId) {
  const v = await one(
    `SELECT v.*, p.title, p.seller_id FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = $1`,
    [variantId]
  );
  if (!v || v.seller_id !== sellerId) fail(404, 'Esa variante no está en tu catálogo.');
  const a = (await stock.availability([variantId])).get(variantId);
  const moves = await many('SELECT * FROM stock_movements WHERE variant_id = $1 ORDER BY at DESC, id DESC LIMIT 50', [variantId]);
  return {
    id: v.id,
    title: v.title,
    label: v.label,
    stock: a.stock,
    available: a.available,
    held: a.held,
    inLive: a.live,
    sold: a.sold,
    movements: moves.map((m) => ({ kind: m.kind, qty: m.qty, stockAfter: m.stock_after, ref: m.ref, note: m.note, at: m.at })),
  };
}

// -------------------------------------------------------------- tiendas ---

/** D9: perfil público de la tienda. */
export async function sellerPublic(slugOrId, { viewerId } = {}) {
  const s = await one(`SELECT * FROM sellers WHERE (slug = $1 OR id = $1) AND status <> 'suspended'`, [slugOrId]);
  if (!s) fail(404, 'Esta tienda no existe o ya no está activa.');
  const [followers, live, upcoming, following, categories] = await Promise.all([
    one('SELECT count(*)::int AS n FROM follows WHERE seller_id = $1', [s.id]),
    one(`SELECT id, title FROM streams WHERE seller_id = $1 AND status = 'live' ORDER BY started_at DESC LIMIT 1`, [s.id]),
    many(`SELECT id, title, scheduled_at FROM streams WHERE seller_id = $1 AND status = 'scheduled' AND scheduled_at > now() ORDER BY scheduled_at LIMIT 5`, [s.id]),
    viewerId ? one('SELECT notify FROM follows WHERE user_id = $1 AND seller_id = $2', [viewerId, s.id]) : null,
    many(
      `SELECT DISTINCT c.id, c.name FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.seller_id = $1 AND p.status = 'active' ORDER BY c.name`,
      [s.id]
    ),
  ]);
  return {
    ...(await sellerMini(s)),
    bio: s.bio,
    city: s.city,
    socials: s.socials,
    coverUrl: await storage.url(s.cover_key),
    followers: followers.n,
    following: Boolean(following),
    notify: following?.notify ?? false,
    live: live ? { streamId: live.id, title: live.title } : null,
    upcoming: upcoming.map((u) => ({ id: u.id, title: u.title, at: u.scheduled_at })),
    categories,
    since: s.created_at,
    deliveryOptions: s.delivery_options,
  };
}

/** E10: editar la tienda. */
export async function updateStore(sellerId, input) {
  const name = String(input.name || '').trim();
  if (name.length < 2) fail(400, 'Escribí el nombre de tu tienda.');
  const socials = {};
  for (const k of ['tiktok', 'instagram', 'whatsapp']) if (input.socials?.[k]) socials[k] = String(input.socials[k]).slice(0, 80);
  const delivery = (input.deliveryOptions || []).filter((d) => SHIPPING.includes(d));
  const patch = [sellerId, name.slice(0, 60), String(input.bio || '').slice(0, 500), String(input.city || '').slice(0, 40),
    JSON.stringify(socials), delivery.length ? delivery : ['envio_gratis']];
  let sql = 'UPDATE sellers SET name=$2, bio=$3, city=$4, socials=$5, delivery_options=$6';
  if (input.avatarKey !== undefined) { patch.push(input.avatarKey || null); sql += `, avatar_key=$${patch.length}`; }
  if (input.coverKey !== undefined) { patch.push(input.coverKey || null); sql += `, cover_key=$${patch.length}`; }
  await one(`${sql} WHERE id=$1 RETURNING id`, patch);
  return sellerPublic(sellerId);
}

// ---------------------------------------------------- deseos y seguidos ---

export async function toggleWishlist(userId, productId) {
  const removed = await one('DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2 RETURNING 1', [userId, productId]);
  if (removed) return { favorite: false };
  const p = await one(
    `SELECT p.id, MIN(v.price_cents) AS price FROM products p JOIN variants v ON v.product_id = p.id AND v.active
     WHERE p.id = $1 AND p.status = 'active' GROUP BY p.id`,
    [productId]
  );
  if (!p) fail(404, 'Este producto ya no está disponible.');
  await one('INSERT INTO wishlist(user_id, product_id, price_at_add_cents) VALUES ($1, $2, $3) RETURNING 1', [userId, productId, p.price]);
  return { favorite: true };
}

/** D14: lista de deseos con chip "Bajó de precio" o "Volvió". */
export async function wishlist(userId) {
  const rows = await many(
    `${PRODUCT_CARD_SELECT.replace('FROM products p', 'FROM wishlist w JOIN products p ON p.id = w.product_id')}
     WHERE w.user_id = $1 AND p.status = 'active' ORDER BY w.created_at DESC`.replace('SELECT p.id,', 'SELECT w.price_at_add_cents, p.id,'),
    [userId]
  );
  const cards = await productCards(rows, { favorites: new Set(rows.map((r) => r.id)) });
  return cards.map((c, i) => {
    const r = rows[i];
    if (r.price_at_add_cents && r.min_price_cents < r.price_at_add_cents && r.available > 0) {
      return { ...c, chip: { type: 'nuevo', label: 'Bajó de precio' } };
    }
    return c;
  });
}

export async function toggleFollow(userId, sellerId) {
  const removed = await one('DELETE FROM follows WHERE user_id = $1 AND seller_id = $2 RETURNING 1', [userId, sellerId]);
  if (removed) return { following: false };
  if (!(await one(`SELECT 1 FROM sellers WHERE id = $1 AND status = 'active'`, [sellerId]))) fail(404, 'Esta tienda ya no está activa.');
  await one('INSERT INTO follows(user_id, seller_id) VALUES ($1, $2) RETURNING 1', [userId, sellerId]);
  return { following: true };
}

export async function setFollowNotify(userId, sellerId, notify) {
  const row = await one('UPDATE follows SET notify = $3 WHERE user_id = $1 AND seller_id = $2 RETURNING notify', [userId, sellerId, Boolean(notify)]);
  if (!row) fail(404, 'No seguís a esta tienda.');
  return { notify: row.notify };
}

/** D15: vendedores que sigo, primero los que están en vivo. */
export async function following(userId) {
  const rows = await many(
    `SELECT s.*, f.notify,
       (SELECT id FROM streams WHERE seller_id = s.id AND status = 'live' ORDER BY started_at DESC LIMIT 1) AS live_id,
       (SELECT title FROM streams WHERE seller_id = s.id AND status = 'live' ORDER BY started_at DESC LIMIT 1) AS live_title,
       (SELECT scheduled_at FROM streams WHERE seller_id = s.id AND status = 'scheduled' AND scheduled_at > now() ORDER BY scheduled_at LIMIT 1) AS next_at
     FROM follows f JOIN sellers s ON s.id = f.seller_id
     WHERE f.user_id = $1 AND s.status <> 'suspended' ORDER BY f.created_at DESC`,
    [userId]
  );
  return Promise.all(rows.map(async (s) => ({
    ...(await sellerMini(s)),
    notify: s.notify,
    live: s.live_id ? { streamId: s.live_id, title: s.live_title } : null,
    nextLiveAt: s.next_at,
  })));
}

// ---------------------------------------------------------- direcciones ---

const CITIES = ['Santa Cruz', 'La Paz', 'El Alto', 'Cochabamba', 'Sucre', 'Oruro', 'Potosí', 'Tarija', 'Trinidad', 'Cobija'];
export const cities = () => CITIES;

const addressOut = (a) => ({
  id: a.id, label: a.label, city: a.city, zone: a.zone, street: a.street, reference: a.reference, phone: a.phone, isDefault: a.is_default,
});

export async function addresses(userId) {
  return (await many('SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at', [userId])).map(addressOut);
}

export async function saveAddress(userId, input, addressId = null) {
  const city = String(input.city || '').trim();
  const zone = String(input.zone || '').trim();
  const street = String(input.street || '').trim();
  if (!city || !zone || !street) fail(400, 'Completá ciudad, zona y calle.');
  return tx(async (q) => {
    const count = (await one('SELECT count(*)::int AS n FROM addresses WHERE user_id = $1', [userId], q)).n;
    const makeDefault = Boolean(input.isDefault) || count === 0;
    if (makeDefault) await q.query('UPDATE addresses SET is_default = false WHERE user_id = $1', [userId]);
    const values = [String(input.label || 'Casa').slice(0, 30), city.slice(0, 40), zone.slice(0, 60), street.slice(0, 120),
      String(input.reference || '').slice(0, 160) || null, String(input.phone || '').replace(/\D/g, '').slice(0, 12) || null];
    let row;
    if (addressId) {
      row = await one(
        `UPDATE addresses SET label=$3, city=$4, zone=$5, street=$6, reference=$7, phone=$8, is_default = is_default OR $9
         WHERE id = $1 AND user_id = $2 RETURNING *`,
        [addressId, userId, ...values, makeDefault], q
      );
      if (!row) fail(404, 'Esa dirección no existe.');
    } else {
      row = await one(
        `INSERT INTO addresses(id, user_id, label, city, zone, street, reference, phone, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [id('adr'), userId, ...values, makeDefault], q
      );
    }
    return addressOut(row);
  });
}

export async function deleteAddress(userId, addressId) {
  await tx(async (q) => {
    const row = await one('DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING is_default', [addressId, userId], q);
    if (!row) fail(404, 'Esa dirección no existe.');
    if (row.is_default) {
      await q.query(
        `UPDATE addresses SET is_default = true WHERE id = (SELECT id FROM addresses WHERE user_id = $1 ORDER BY created_at LIMIT 1)`,
        [userId]
      );
    }
  });
}

// --------------------------------------------------------- búsqueda D3 ---

export async function logSearch(query) {
  const q = String(query || '').trim().toLowerCase().slice(0, 60);
  if (q.length >= 2) await one('INSERT INTO search_log(query) VALUES ($1) RETURNING id', [q]);
}

export async function trending() {
  const rows = await many(
    `SELECT query, count(*)::int AS n FROM search_log WHERE at > now() - interval '7 days'
     GROUP BY query ORDER BY n DESC LIMIT 8`
  );
  return rows.map((r) => r.query);
}

/** Sugerencias mientras se escribe: productos, vendedores y categorías. */
export async function suggestions(text) {
  const q = String(text || '').trim();
  if (q.length < 2) return { products: [], sellers: [], categories: [] };
  const like = `%${q}%`;
  const [products, sellers, cats] = await Promise.all([
    many(`SELECT p.id, p.title FROM products p JOIN sellers s ON s.id = p.seller_id
          WHERE p.status = 'active' AND s.status = 'active' AND p.title ILIKE $1 ORDER BY p.created_at DESC LIMIT 5`, [like]),
    many(`SELECT id, slug, name, initials, color FROM sellers WHERE status = 'active' AND name ILIKE $1 LIMIT 3`, [like]),
    many('SELECT id, name, icon FROM categories WHERE active AND name ILIKE $1 LIMIT 3', [like]),
  ]);
  return { products, sellers, categories: cats };
}

/** D4: cuántos resultados hay en cada pestaña. */
export async function searchCounts(text) {
  const q = String(text || '').trim();
  const like = `%${q}%`;
  const [products, sellers, streams] = await Promise.all([
    listProducts({ q, limit: 1 }).then((r) => r.total),
    one(`SELECT count(*)::int AS n FROM sellers WHERE status = 'active' AND name ILIKE $1`, [like]).then((r) => r.n),
    one(`SELECT count(*)::int AS n FROM streams st JOIN sellers s ON s.id = st.seller_id
         WHERE st.status = 'live' AND (st.title ILIKE $1 OR s.name ILIKE $1)`, [like]).then((r) => r.n),
  ]);
  return { products, sellers, streams };
}

export async function searchSellers(text, { viewerId } = {}) {
  const like = `%${String(text || '').trim()}%`;
  const rows = await many(
    `SELECT s.*, EXISTS(SELECT 1 FROM follows f WHERE f.seller_id = s.id AND f.user_id = $2) AS following
     FROM sellers s WHERE s.status = 'active' AND s.name ILIKE $1 ORDER BY s.sales_count DESC LIMIT 30`,
    [like, viewerId || null]
  );
  return Promise.all(rows.map(async (s) => ({ ...(await sellerMini(s)), following: s.following })));
}
