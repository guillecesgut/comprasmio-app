import { one, many, fail } from '../db.js';
import * as storage from '../storage.js';
import { availability } from './stock.js';
import { bs } from '../util.js';
import { photosByProduct, sellerMini } from './present.js';

/**
 * Carrito persistente (D6), agrupado por vendedor. No aparta stock: lo aparta el checkout.
 * Cada ítem muestra lo disponible en este momento y avisa si alcanza o no.
 */
export async function view(userId) {
  const rows = await many(
    `SELECT c.variant_id, c.qty, v.label, v.price_cents, v.active AS variant_active, p.id AS product_id, p.title, p.color,
            p.status AS product_status, p.shipping_options, s.id AS seller_id, s.status AS seller_status
     FROM cart_items c JOIN variants v ON v.id = c.variant_id JOIN products p ON p.id = v.product_id
     JOIN sellers s ON s.id = p.seller_id
     WHERE c.user_id = $1 ORDER BY c.added_at`,
    [userId]
  );
  const avail = await availability(rows.map((r) => r.variant_id));
  const photos = await photosByProduct([...new Set(rows.map((r) => r.product_id))]);
  const sellers = new Map();
  for (const s of await many('SELECT * FROM sellers WHERE id = ANY($1)', [[...new Set(rows.map((r) => r.seller_id))]])) {
    sellers.set(s.id, s);
  }

  const groups = new Map();
  for (const r of rows) {
    const available = r.variant_active && r.product_status === 'active' && r.seller_status === 'active'
      ? avail.get(r.variant_id)?.available ?? 0 : 0;
    const usable = available > 0;
    const qty = usable ? Math.min(r.qty, available) : r.qty;
    const item = {
      variantId: r.variant_id,
      productId: r.product_id,
      title: r.title,
      label: r.label,
      color: r.color,
      photoUrl: await storage.url((photos.get(r.product_id) || [])[0]),
      price: bs(r.price_cents),
      qty,
      available,
      unavailable: !usable,
      warning: !usable ? 'Sin stock' : available <= 3 ? `Solo quedan ${available}` : null,
      shippingOptions: r.shipping_options,
      lineTotal: usable ? bs(r.price_cents * qty) : 0,
      cents: usable ? r.price_cents * qty : 0,
    };
    if (!groups.has(r.seller_id)) groups.set(r.seller_id, { seller: await sellerMini(sellers.get(r.seller_id)), items: [] });
    groups.get(r.seller_id).items.push(item);
  }

  const out = [...groups.values()].map((g) => {
    const usable = g.items.filter((i) => !i.unavailable);
    const freeShipping = usable.length > 0 && usable.every((i) => i.shippingOptions.includes('envio_gratis'));
    const pickup = usable.length > 0 && usable.every((i) => i.shippingOptions.includes('retiro'));
    return {
      seller: g.seller,
      items: g.items.map(({ cents, ...rest }) => rest),
      shipping: freeShipping ? 'Envío gratis' : 'A convenir',
      allowsPickup: pickup,
      subtotal: bs(usable.reduce((sum, i) => sum + i.cents, 0)),
    };
  });
  const totalCents = [...groups.values()].flatMap((g) => g.items).reduce((s, i) => s + i.cents, 0);
  return {
    groups: out,
    units: rows.reduce((s, r) => s + r.qty, 0),
    products: bs(totalCents),
    shipping: 0,
    total: bs(totalCents),
    sellersCount: out.filter((g) => g.items.some((i) => !i.unavailable)).length,
  };
}

export async function add(userId, variantId, qty = 1) {
  const n = Number.parseInt(qty, 10);
  if (!(n > 0)) fail(400, 'Indicá una cantidad.');
  const v = await one(
    `SELECT v.id, p.seller_id, s.user_id AS owner FROM variants v JOIN products p ON p.id = v.product_id JOIN sellers s ON s.id = p.seller_id
     WHERE v.id = $1 AND v.active AND p.status = 'active' AND s.status = 'active'`,
    [variantId]
  );
  if (!v) fail(404, 'Este producto ya no está a la venta.');
  if (v.owner === userId) fail(400, 'No podés comprar tus propios productos.');
  const available = (await availability([variantId])).get(variantId)?.available ?? 0;
  if (available <= 0) fail(409, 'Se agotó esta variante.');
  const current = await one('SELECT qty FROM cart_items WHERE user_id = $1 AND variant_id = $2', [userId, variantId]);
  const wanted = Math.min((current?.qty || 0) + n, available);
  await one(
    `INSERT INTO cart_items(user_id, variant_id, qty) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, variant_id) DO UPDATE SET qty = EXCLUDED.qty RETURNING 1`,
    [userId, variantId, wanted]
  );
  return view(userId);
}

export async function setQty(userId, variantId, qty) {
  const n = Number.parseInt(qty, 10);
  if (!(n >= 0)) fail(400, 'Cantidad inválida.');
  if (n === 0) {
    await many('DELETE FROM cart_items WHERE user_id = $1 AND variant_id = $2 RETURNING 1', [userId, variantId]);
    return view(userId);
  }
  const available = (await availability([variantId])).get(variantId)?.available ?? 0;
  if (n > available) fail(409, available ? `Solo quedan ${available}.` : 'Se agotó esta variante.', { available });
  const row = await one('UPDATE cart_items SET qty = $3 WHERE user_id = $1 AND variant_id = $2 RETURNING 1', [userId, variantId, n]);
  if (!row) fail(404, 'Ese producto no está en tu carrito.');
  return view(userId);
}

export const units = async (userId) =>
  (await one('SELECT COALESCE(SUM(qty), 0)::int AS n FROM cart_items WHERE user_id = $1', [userId])).n;
