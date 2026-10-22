import { one, many, id, tx, fail } from '../db.js';
import * as storage from '../storage.js';
import { bundleAvailability } from './stock.js';
import { bs, toCents } from '../util.js';
import { photosByProduct } from './present.js';

/**
 * Paquetes (E4/E4b): varias variantes combinadas que se subastan juntas en un vivo.
 * Cuántos se pueden armar lo limita la pieza más escasa.
 */
export async function list(sellerId) {
  const bundles = await many(`SELECT * FROM bundles WHERE seller_id = $1 AND status = 'active' ORDER BY created_at DESC`, [sellerId]);
  return Promise.all(bundles.map((b) => present(b)));
}

async function present(b) {
  const items = await many(
    `SELECT bi.variant_id, bi.qty, v.label, v.price_cents, p.id AS product_id, p.title, p.color, stock_available(v.id) AS available
     FROM bundle_items bi JOIN variants v ON v.id = bi.variant_id JOIN products p ON p.id = v.product_id
     WHERE bi.bundle_id = $1 ORDER BY p.title`,
    [b.id]
  );
  const photos = await photosByProduct(items.map((i) => i.product_id));
  const available = items.length ? await bundleAvailability(b.id) : 0;
  const limiting = items.reduce((min, i) => (!min || Math.floor(i.available / i.qty) < Math.floor(min.available / min.qty) ? i : min), null);
  return {
    id: b.id,
    name: b.name,
    photoUrl: await storage.url(b.photo_key),
    suggestedStart: bs(b.suggested_start_cents),
    available,
    limitedBy: limiting && available <= 1 ? `${limiting.title}${limiting.label !== 'Única' ? ` · ${limiting.label}` : ''}` : null,
    pieces: await Promise.all(items.map(async (i) => ({
      variantId: i.variant_id,
      productId: i.product_id,
      title: i.title,
      label: i.label,
      qty: i.qty,
      available: i.available,
      color: i.color,
      price: bs(i.price_cents),
      photoUrl: await storage.url((photos.get(i.product_id) || [])[0]),
    }))),
  };
}

export async function get(sellerId, bundleId) {
  const b = await one(`SELECT * FROM bundles WHERE id = $1 AND seller_id = $2 AND status = 'active'`, [bundleId, sellerId]);
  if (!b) fail(404, 'Ese paquete no existe.');
  return present(b);
}

export async function save(sellerId, input, bundleId = null) {
  const name = String(input.name || '').trim();
  const pieces = (input.pieces || []).filter((p) => p.variantId && Number(p.qty) > 0);
  if (!name) fail(400, 'Ponele un nombre al paquete.');
  if (pieces.length < 2 && !(pieces.length === 1 && pieces[0].qty > 1)) fail(400, 'Un paquete necesita al menos dos piezas.');
  const start = input.suggestedStart ? toCents(input.suggestedStart) : null;

  return tx(async (q) => {
    const owned = await many(
      `SELECT v.id FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.id = ANY($1) AND p.seller_id = $2 AND v.active AND p.status <> 'deleted'`,
      [pieces.map((p) => p.variantId), sellerId], q
    );
    if (owned.length !== new Set(pieces.map((p) => p.variantId)).size) fail(400, 'Una de las piezas no está en tu catálogo.');
    let bid = bundleId;
    if (bid) {
      const b = await one(`SELECT id FROM bundles WHERE id = $1 AND seller_id = $2 AND status = 'active'`, [bid, sellerId], q);
      if (!b) fail(404, 'Ese paquete no existe.');
      const inLive = await one(`SELECT 1 FROM live_reservations WHERE bundle_id = $1 AND status <> 'closed'`, [bid], q);
      if (inLive) fail(409, 'Este paquete está cargado en un vivo. Editalo cuando termine.');
      await q.query('UPDATE bundles SET name = $2, photo_key = $3, suggested_start_cents = $4 WHERE id = $1', [bid, name, input.photoKey || null, start]);
      await q.query('DELETE FROM bundle_items WHERE bundle_id = $1', [bid]);
    } else {
      bid = id('bun');
      await q.query(
        'INSERT INTO bundles(id, seller_id, name, photo_key, suggested_start_cents) VALUES ($1,$2,$3,$4,$5)',
        [bid, sellerId, name.slice(0, 80), input.photoKey || null, start]
      );
    }
    const merged = new Map();
    for (const p of pieces) merged.set(p.variantId, (merged.get(p.variantId) || 0) + Number(p.qty));
    for (const [variantId, qty] of merged) {
      await q.query('INSERT INTO bundle_items(bundle_id, variant_id, qty) VALUES ($1,$2,$3)', [bid, variantId, qty]);
    }
    return bid;
  });
}

export async function remove(sellerId, bundleId) {
  const inLive = await one(`SELECT 1 FROM live_reservations WHERE bundle_id = $1 AND status <> 'closed'`, [bundleId]);
  if (inLive) fail(409, 'Este paquete está cargado en un vivo. Borralo cuando termine.');
  const row = await one(`UPDATE bundles SET status = 'deleted' WHERE id = $1 AND seller_id = $2 RETURNING id`, [bundleId, sellerId]);
  if (!row) fail(404, 'Ese paquete no existe.');
}
