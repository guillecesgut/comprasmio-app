import { many } from '../db.js';
import * as storage from '../storage.js';
import { bs } from '../util.js';

/**
 * Cómo se ve cada cosa en la API. Un solo lugar para que la app y el panel reciban siempre las
 * mismas formas: montos en Bs (no centavos), imágenes como enlaces firmados.
 */

export async function photosByProduct(productIds) {
  if (!productIds.length) return new Map();
  const rows = await many(
    'SELECT product_id, storage_key FROM product_photos WHERE product_id = ANY($1) ORDER BY product_id, position',
    [productIds]
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.product_id)) map.set(r.product_id, []);
    map.get(r.product_id).push(r.storage_key);
  }
  return map;
}

export const sellerMini = async (s) => s && ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  initials: s.initials,
  color: s.color,
  verified: s.verified,
  ratingPct: s.rating_pct,
  ratingAvg: s.rating_avg,
  ratingCount: s.rating_count,
  salesCount: s.sales_count,
  avatarUrl: await storage.url(s.avatar_key),
});

/**
 * Tarjeta de producto (ProductoCard): precio mínimo de sus variantes activas, precio anterior,
 * chip según el caso (agotado > oferta > envío gratis > nuevo).
 */
export async function productCards(rows, { favorites = new Set() } = {}) {
  const photos = await photosByProduct(rows.map((r) => r.id));
  return Promise.all(rows.map(async (r) => {
    const keys = photos.get(r.id) || [];
    const price = r.min_price_cents;
    const compareAt = r.compare_at_cents && r.compare_at_cents > price ? r.compare_at_cents : null;
    const isNew = r.created_at && Date.now() - new Date(r.created_at).getTime() < 7 * 864e5;
    let chip = null;
    if (r.available <= 0) chip = { type: 'agotado', label: 'Agotado' };
    else if (compareAt) chip = { type: 'oferta', label: `−${Math.round((1 - price / compareAt) * 100)} %` };
    else if ((r.shipping_options || []).includes('envio_gratis')) chip = { type: 'envio', label: 'Envío gratis' };
    else if (isNew) chip = { type: 'nuevo', label: 'Nuevo' };
    return {
      id: r.id,
      title: r.title,
      price: bs(price),
      maxPrice: bs(r.max_price_cents),
      compareAt: bs(compareAt),
      available: r.available,
      color: r.color,
      photoUrl: await storage.url(keys[0]),
      chip,
      favorite: favorites.has(r.id),
      seller: { id: r.seller_id, name: r.seller_name, slug: r.seller_slug, ratingPct: r.seller_rating_pct, verified: r.seller_verified },
    };
  }));
}

/** SELECT común para tarjetas de producto (se combina con WHERE/ORDER propios). */
export const PRODUCT_CARD_SELECT = `
  SELECT p.id, p.title, p.color, p.compare_at_cents, p.shipping_options, p.created_at, p.seller_id, p.category_id,
         s.name AS seller_name, s.slug AS seller_slug, s.rating_pct AS seller_rating_pct, s.verified AS seller_verified,
         agg.min_price_cents, agg.max_price_cents, agg.available, agg.sold
  FROM products p
  JOIN sellers s ON s.id = p.seller_id
  JOIN LATERAL (
    SELECT MIN(v.price_cents) AS min_price_cents, MAX(v.price_cents) AS max_price_cents,
           COALESCE(SUM(stock_available(v.id)), 0)::int AS available, COALESCE(SUM(v.sold), 0)::int AS sold
    FROM variants v WHERE v.product_id = p.id AND v.active
  ) agg ON agg.min_price_cents IS NOT NULL`;

export const ORDER_STATUS_LABEL = {
  pendiente_pago: 'Pendiente de pago',
  pago_en_revision: 'Pago en revisión',
  pagado: 'Pago confirmado',
  preparando: 'Preparando',
  enviado: 'Enviado',
  entregado: 'Entregado',
  en_reclamo: 'En reclamo',
  cancelado: 'Cancelado',
  vencido: 'Venció el pago',
};
