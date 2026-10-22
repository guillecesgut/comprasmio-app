import { many, one, id, fail } from '../db.js';

/**
 * Stock por variante, compartido entre el catálogo y los vivos.
 *
 *   disponible = stock − apartado (pedidos sin pagar) − en vivo (reservado para un vivo activo)
 *
 * Toda operación que cambia lo disponible corre dentro de una transacción y bloquea primero
 * las filas de las variantes involucradas (SELECT … FOR UPDATE, siempre en orden de id para que
 * dos transacciones no se bloqueen en cruz). Así, si dos personas compran la última unidad al
 * mismo tiempo, la segunda espera, ve 0 disponibles y recibe un error claro.
 */

export async function lockVariants(q, variantIds) {
  const ids = [...new Set(variantIds)].sort();
  if (!ids.length) return new Map();
  const rows = await many(
    `SELECT v.*, p.status AS product_status, p.seller_id, p.title
     FROM variants v JOIN products p ON p.id = v.product_id
     WHERE v.id = ANY($1) ORDER BY v.id FOR UPDATE OF v`,
    [ids], q
  );
  return new Map(rows.map((r) => [r.id, r]));
}

/** Disponible, apartado, en vivo y vendido de cada variante. */
export async function availability(variantIds, q) {
  const ids = [...new Set(variantIds)];
  if (!ids.length) return new Map();
  const rows = await many(
    `SELECT id, stock, sold, held_by_orders(id) AS held, live_reserved(id) AS live, stock_available(id) AS available
     FROM variants WHERE id = ANY($1)`,
    [ids], q
  );
  return new Map(rows.map((r) => [r.id, r]));
}

/** Cuántos paquetes completos se pueden armar hoy (limitado por la pieza más escasa). */
export async function bundleAvailability(bundleId, q) {
  const row = await one(
    `SELECT MIN(stock_available(bi.variant_id) / bi.qty)::int AS available FROM bundle_items bi WHERE bi.bundle_id = $1`,
    [bundleId], q
  );
  return row?.available ?? 0;
}

async function movement(q, { variantId, kind, qty, ref, note, actorId }) {
  await q.query(
    `INSERT INTO stock_movements(variant_id, kind, qty, stock_after, ref, note, actor_id)
     VALUES ($1, $2, $3, (SELECT stock FROM variants WHERE id = $1), $4, $5, $6)`,
    [variantId, kind, qty, ref || null, note || null, actorId || null]
  );
}

/**
 * Aparta unidades para un pedido recién creado. `items`: [{ orderItemId, variantId?, bundleId?,
 * qty, reservationId? }]. Las ventas del catálogo descuentan de lo disponible; las de un vivo
 * descuentan de lo reservado para ese vivo (que ya no estaba disponible en el catálogo).
 */
export async function holdForOrder(q, { orderId, orderRef, items, expiresAt }) {
  // Piezas de cada ítem (un paquete aparta todas sus piezas).
  const pieces = [];
  for (const item of items) {
    if (item.bundleId) {
      const parts = await many('SELECT variant_id, qty FROM bundle_items WHERE bundle_id = $1', [item.bundleId], q);
      for (const p of parts) pieces.push({ item, variantId: p.variant_id, qty: p.qty * item.qty });
    } else {
      pieces.push({ item, variantId: item.variantId, qty: item.qty });
    }
  }

  const locked = await lockVariants(q, pieces.map((p) => p.variantId));

  // Reservas de vivo: se bloquean y se valida que quede lugar antes de tocar nada.
  const reservationIds = [...new Set(items.filter((i) => i.reservationId).map((i) => i.reservationId))].sort();
  const reservations = new Map();
  for (const rid of reservationIds) {
    const r = await one('SELECT * FROM live_reservations WHERE id = $1 FOR UPDATE', [rid], q);
    if (!r || r.status === 'closed') fail(409, 'Ese lote ya no está disponible en el vivo.');
    reservations.set(rid, r);
  }
  for (const item of items.filter((i) => i.reservationId)) {
    const r = reservations.get(item.reservationId);
    if (r.committed + item.qty > r.qty_reserved) fail(409, 'Se agotaron las unidades de este lote.');
    r.committed += item.qty;
  }

  // Catálogo: verificar disponible con la fórmula, ya con las filas bloqueadas.
  const fromCatalog = pieces.filter((p) => !p.item.reservationId);
  const needed = new Map();
  for (const p of fromCatalog) needed.set(p.variantId, (needed.get(p.variantId) || 0) + p.qty);
  if (needed.size) {
    const avail = await availability([...needed.keys()], q);
    for (const [variantId, qty] of needed) {
      const v = locked.get(variantId);
      if (!v || !v.active || v.product_status !== 'active') fail(409, 'Uno de los productos ya no está a la venta.', { variantId });
      const left = avail.get(variantId)?.available ?? 0;
      if (left < qty) {
        fail(409, left === 0 ? `Se agotó «${v.title}».` : `Solo quedan ${left} de «${v.title}».`, { variantId, available: left });
      }
    }
  }

  for (const [rid, r] of reservations) {
    await q.query('UPDATE live_reservations SET committed = $2 WHERE id = $1', [rid, r.committed]);
  }
  for (const p of pieces) {
    await q.query(
      `INSERT INTO stock_holds(id, variant_id, order_id, qty, reservation_id, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id('hld'), p.variantId, orderId, p.qty, p.item.reservationId || null, expiresAt]
    );
    await movement(q, { variantId: p.variantId, kind: 'apartado', qty: -p.qty, ref: orderRef });
  }
}

/** Pago confirmado: lo apartado pasa a vendido (sale del stock físico). */
export async function confirmHolds(q, orderId, orderRef) {
  const holds = await many(
    'SELECT * FROM stock_holds WHERE order_id = $1 AND released_at IS NULL ORDER BY variant_id FOR UPDATE',
    [orderId], q
  );
  await lockVariants(q, holds.map((h) => h.variant_id));
  for (const h of holds) {
    await q.query('UPDATE variants SET stock = stock - $2, sold = sold + $2 WHERE id = $1', [h.variant_id, h.qty]);
    await q.query(`UPDATE stock_holds SET released_at = now(), release_reason = 'pagado' WHERE id = $1`, [h.id]);
    await movement(q, { variantId: h.variant_id, kind: 'venta', qty: -h.qty, ref: orderRef });
  }
}

/**
 * Pedido vencido o cancelado antes de pagar: lo apartado vuelve. Si venía de un vivo que sigue
 * activo, vuelve a ese vivo; si el vivo ya terminó, vuelve directo al catálogo.
 */
export async function releaseHolds(q, orderId, reason, orderRef) {
  const holds = await many(
    'SELECT * FROM stock_holds WHERE order_id = $1 AND released_at IS NULL ORDER BY variant_id FOR UPDATE',
    [orderId], q
  );
  if (!holds.length) return;
  for (const h of holds) {
    await q.query('UPDATE stock_holds SET released_at = now(), release_reason = $2 WHERE id = $1', [h.id, reason]);
    await movement(q, {
      variantId: h.variant_id,
      kind: reason === 'vencido' ? 'pedido_vencido' : 'pedido_cancelado',
      qty: h.qty,
      ref: orderRef,
    });
  }
  // El compromiso con la reserva se cuenta por ítem (un paquete = 1), no por pieza.
  const items = await many(
    'SELECT reservation_id, SUM(qty)::int AS qty FROM order_items WHERE order_id = $1 AND reservation_id IS NOT NULL GROUP BY reservation_id',
    [orderId], q
  );
  for (const it of items) {
    await q.query('UPDATE live_reservations SET committed = GREATEST(0, committed - $2) WHERE id = $1', [it.reservation_id, it.qty]);
  }
}

/**
 * Pedido ya pagado que se cancela o reembolsa: las unidades vuelven al stock físico.
 * (Lo usa el panel al resolver un reclamo con devolución del producto.)
 */
export async function restock(q, orderId, orderRef, actorId) {
  const items = await many('SELECT variant_id, bundle_id, qty FROM order_items WHERE order_id = $1', [orderId], q);
  const pieces = [];
  for (const it of items) {
    if (it.bundle_id) {
      for (const p of await many('SELECT variant_id, qty FROM bundle_items WHERE bundle_id = $1', [it.bundle_id], q)) {
        pieces.push({ variantId: p.variant_id, qty: p.qty * it.qty });
      }
    } else if (it.variant_id) pieces.push({ variantId: it.variant_id, qty: it.qty });
  }
  await lockVariants(q, pieces.map((p) => p.variantId));
  for (const p of pieces) {
    await q.query('UPDATE variants SET stock = stock + $2, sold = GREATEST(0, sold - $2) WHERE id = $1', [p.variantId, p.qty]);
    await movement(q, { variantId: p.variantId, kind: 'correccion', qty: p.qty, ref: orderRef, note: 'Devolución por reclamo', actorId });
  }
}

/** Ajuste manual del vendedor (E3). `delta` positivo o negativo; nunca deja el stock por debajo de lo comprometido. */
export async function adjust(q, { variantId, delta, kind, note, actorId }) {
  if (!['reposicion', 'correccion', 'perdida'].includes(kind)) fail(400, 'Elegí un motivo: reposición, corrección o pérdida.');
  if (!Number.isInteger(delta) || delta === 0) fail(400, 'Indicá cuántas unidades sumar o restar.');
  const v = (await lockVariants(q, [variantId])).get(variantId);
  if (!v) fail(404, 'Esa variante no existe.');
  const a = (await availability([variantId], q)).get(variantId);
  const committed = a.held + a.live;
  if (v.stock + delta < committed) {
    fail(409, `No podés bajar el stock a menos de ${committed}: hay unidades apartadas o en un vivo.`);
  }
  await q.query('UPDATE variants SET stock = stock + $2 WHERE id = $1', [variantId, delta]);
  await movement(q, { variantId, kind, qty: delta, note, actorId });
  return (await availability([variantId], q)).get(variantId);
}

/**
 * Carga productos en un vivo (E9). `entries`: [{ variantId? | bundleId?, qty, mode, ...precios }].
 * Las unidades dejan de estar disponibles en el catálogo hasta que el vivo termine.
 */
export async function reserveForLive(q, { streamId, sellerId, entries, actorId }) {
  const pieces = [];
  for (const e of entries) {
    if (e.bundleId) {
      const b = await one('SELECT * FROM bundles WHERE id = $1 AND seller_id = $2 AND status = $3', [e.bundleId, sellerId, 'active'], q);
      if (!b) fail(404, 'Ese paquete no está en tu catálogo.');
      for (const p of await many('SELECT variant_id, qty FROM bundle_items WHERE bundle_id = $1', [e.bundleId], q)) {
        pieces.push({ variantId: p.variant_id, qty: p.qty * e.qty });
      }
    } else {
      pieces.push({ variantId: e.variantId, qty: e.qty });
    }
  }
  const locked = await lockVariants(q, pieces.map((p) => p.variantId));
  const needed = new Map();
  for (const p of pieces) needed.set(p.variantId, (needed.get(p.variantId) || 0) + p.qty);
  const avail = await availability([...needed.keys()], q);
  for (const [variantId, qty] of needed) {
    const v = locked.get(variantId);
    if (!v || v.seller_id !== sellerId) fail(404, 'Uno de los productos no está en tu catálogo.');
    const left = avail.get(variantId)?.available ?? 0;
    if (left < qty) fail(409, `De «${v.title}» solo hay ${left} disponibles.`, { variantId, available: left });
  }

  const created = [];
  for (const [i, e] of entries.entries()) {
    const rid = id('rsv');
    await q.query(
      `INSERT INTO live_reservations(id, stream_id, variant_id, bundle_id, mode, qty_reserved, start_cents, min_cents,
         increment_cents, price_cents, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [rid, streamId, e.variantId || null, e.bundleId || null, e.mode, e.qty, e.startCents ?? null, e.minCents ?? null,
        e.incrementCents ?? null, e.priceCents ?? null, e.position ?? i]
    );
    created.push(rid);
  }
  for (const [variantId, qty] of needed) {
    await movement(q, { variantId, kind: 'reserva_vivo', qty: -qty, ref: streamId, actorId });
  }
  return created;
}

/** Fin del vivo: lo no vendido vuelve al catálogo. Devuelve cuántas unidades volvieron por variante. */
export async function closeLiveReservations(q, streamId) {
  const rows = await many(
    `SELECT * FROM live_reservations WHERE stream_id = $1 AND status <> 'closed' ORDER BY id FOR UPDATE`,
    [streamId], q
  );
  const returned = new Map();
  for (const r of rows) {
    const left = r.qty_reserved - r.committed;
    if (left > 0) {
      if (r.variant_id) returned.set(r.variant_id, (returned.get(r.variant_id) || 0) + left);
      else {
        for (const p of await many('SELECT variant_id, qty FROM bundle_items WHERE bundle_id = $1', [r.bundle_id], q)) {
          returned.set(p.variant_id, (returned.get(p.variant_id) || 0) + p.qty * left);
        }
      }
    }
    await q.query(`UPDATE live_reservations SET status = 'closed' WHERE id = $1`, [r.id]);
  }
  for (const [variantId, qty] of returned) {
    await movement(q, { variantId, kind: 'devolucion_vivo', qty, ref: streamId });
  }
  return returned;
}
