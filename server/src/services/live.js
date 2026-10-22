import { AccessToken } from 'livekit-server-sdk';
import { one, many, id, tx, fail, afterCommit } from '../db.js';
import { config } from '../config.js';
import * as hub from '../realtime/hub.js';
import * as storage from '../storage.js';
import * as stock from './stock.js';
import { createOrdersAndPayment } from './orders.js';
import { notify, KIND } from './notifications.js';
import { getSettings, isPremium } from '../settings.js';
import { bs, toCents, colorFor } from '../util.js';
import { photosByProduct } from './present.js';

/**
 * Vivos sobre el catálogo.
 *
 * - Al armar el vivo (E9) cada variante o paquete cargado es una *reserva*: sus unidades dejan de
 *   estar disponibles en el catálogo hasta que el vivo termine.
 * - Un *lote* es lo que está al aire: una unidad en subasta, un paquete en subasta o una oferta a
 *   precio fijo con N unidades. El siguiente lote NUNCA arranca solo: lo inicia el vendedor.
 * - Ganar o comprar crea un pedido con el mismo pago de la plataforma (ventana corta).
 *
 * El reloj de la subasta vive en memoria (un intervalo de 1 s); lotes, pujas y resultados se
 * guardan en la base.
 */

export const BID_WINDOW = 15;      // segundos; cada puja vuelve el reloj al menos a 15 (anti-snipe)
const MAX_TIMER = 300;
const lots = new Map();            // streamId -> estado del lote abierto

// --------------------------------------------------------------- tarjetas ---

/** B1/D1: vivos activos para las grillas. */
export async function liveCards({ limit = 30, mode, q, sellerIds } = {}) {
  const params = [];
  let where = `st.status = 'live' AND s.status = 'active'`;
  if (q) { params.push(`%${q}%`); where += ` AND (st.title ILIKE $${params.length} OR s.name ILIKE $${params.length})`; }
  if (sellerIds) { params.push(sellerIds); where += ` AND st.seller_id = ANY($${params.length})`; }
  const rows = await many(
    `SELECT st.*, s.name AS seller_name, s.slug, s.initials, s.color AS seller_color, s.rating_pct, s.sales_count
     FROM streams st JOIN sellers s ON s.id = st.seller_id WHERE ${where} ORDER BY st.started_at DESC LIMIT ${Number(limit) || 30}`,
    params
  );
  const cards = await Promise.all(rows.map((r) => card(r)));
  return mode ? cards.filter((c) => c.mode === mode || (mode === 'subasta' && c.mode === 'paquete')) : cards;
}

async function card(r) {
  const state = lots.get(r.id);
  const next = state ? null : await one(
    `SELECT mode, bundle_id, COALESCE(price_cents, start_cents) AS cents FROM live_reservations
     WHERE stream_id = $1 AND status IN ('queued','on_air') AND committed < qty_reserved ORDER BY position LIMIT 1`,
    [r.id]
  );
  const mode = state ? (state.bundleId ? 'paquete' : state.mode) : next ? (next.bundle_id ? 'paquete' : next.mode) : 'subasta';
  return {
    id: r.id,
    title: r.title,
    color: r.color || r.seller_color,
    tag: r.tag,
    viewers: viewersOf(r),
    mode,
    price: bs(state ? state.priceCents : next?.cents),
    seller: { id: r.seller_id, name: r.seller_name, slug: r.slug, initials: r.initials, ratingPct: r.rating_pct, salesCount: r.sales_count },
  };
}

const viewersOf = (stream) => Math.max(hub.viewersOf(stream.id), stream.base_viewers || 0);

/** B1: próximos vivos de los vendedores que sigo. */
export async function upcomingFromFollowed(userId) {
  const rows = await many(
    `SELECT st.id, st.title, st.scheduled_at, s.id AS seller_id, s.name, s.initials, s.color, f.notify
     FROM follows f JOIN streams st ON st.seller_id = f.seller_id AND st.status = 'scheduled' AND st.scheduled_at > now()
     JOIN sellers s ON s.id = f.seller_id WHERE f.user_id = $1 ORDER BY st.scheduled_at LIMIT 10`,
    [userId]
  );
  return rows.map((r) => ({ id: r.id, title: r.title, at: r.scheduled_at, notify: r.notify, seller: { id: r.seller_id, name: r.name, initials: r.initials, color: r.color } }));
}

// ---------------------------------------------------------------- la sala ---

async function reservationRows(streamId) {
  return many(
    `SELECT r.*, v.label, v.price_cents AS catalog_cents, p.id AS product_id, p.title AS product_title, p.color,
            b.name AS bundle_name, b.photo_key AS bundle_photo
     FROM live_reservations r
     LEFT JOIN variants v ON v.id = r.variant_id LEFT JOIN products p ON p.id = v.product_id
     LEFT JOIN bundles b ON b.id = r.bundle_id
     WHERE r.stream_id = $1 ORDER BY r.position, r.id`,
    [streamId]
  );
}

async function bundlePieces(bundleIds) {
  if (!bundleIds.length) return new Map();
  const rows = await many(
    `SELECT bi.bundle_id, bi.qty, v.label, p.id AS product_id, p.title, p.color FROM bundle_items bi
     JOIN variants v ON v.id = bi.variant_id JOIN products p ON p.id = v.product_id WHERE bi.bundle_id = ANY($1) ORDER BY p.title`,
    [bundleIds]
  );
  const photos = await photosByProduct([...new Set(rows.map((r) => r.product_id))]);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.bundle_id)) map.set(r.bundle_id, []);
    map.get(r.bundle_id).push({ title: r.title, label: r.label, qty: r.qty, color: r.color, photoUrl: await storage.url((photos.get(r.product_id) || [])[0]) });
  }
  return map;
}

/** Cola del vivo (B4 y C7): cada fila es una variante o un paquete con su resultado. */
export async function queue(streamId) {
  const rows = await reservationRows(streamId);
  const photos = await photosByProduct([...new Set(rows.filter((r) => r.product_id).map((r) => r.product_id))]);
  const pieces = await bundlePieces(rows.filter((r) => r.bundle_id).map((r) => r.bundle_id));
  const results = await many(
    `SELECT reservation_id, status, price_cents, sold_qty, winner_id, (SELECT handle FROM users WHERE id = winner_id) AS winner
     FROM lots WHERE stream_id = $1 ORDER BY opened_at`,
    [streamId]
  );
  const state = lots.get(streamId);
  return Promise.all(rows.map(async (r, i) => {
    const mine = results.filter((x) => x.reservation_id === r.id);
    const isBundle = Boolean(r.bundle_id);
    const bp = isBundle ? pieces.get(r.bundle_id) || [] : [];
    return {
      reservationId: r.id,
      position: i + 1,
      kind: isBundle ? 'paquete' : 'variante',
      mode: r.mode,
      title: isBundle ? r.bundle_name : r.product_title,
      label: isBundle ? `Paquete · ${bp.length} productos` : r.label !== 'Única' ? r.label : null,
      color: isBundle ? bp[0]?.color : r.color,
      photoUrl: isBundle ? (await storage.url(r.bundle_photo)) || bp[0]?.photoUrl || null : await storage.url((photos.get(r.product_id) || [])[0]),
      pieces: bp,
      qty: r.qty_reserved,
      sold: mine.reduce((s, x) => s + (x.status === 'sold' ? Math.max(1, x.sold_qty) : 0), 0),
      committed: r.committed,
      remaining: r.qty_reserved - r.committed,
      price: bs(r.mode === 'fijo' ? r.price_cents : r.start_cents),
      min: bs(r.min_cents),
      increment: bs(r.increment_cents),
      status: state?.reservationId === r.id ? 'on_air' : r.status,
      results: mine.map((x) => ({ status: x.status, price: bs(x.price_cents), winner: x.winner, sold: x.sold_qty })),
    };
  }));
}

/** Lo que ven los compradores del lote al aire (nunca el precio mínimo). */
function publicLot(state, viewerId) {
  if (!state) return null;
  const base = {
    id: state.id,
    lotNo: state.lotNo,
    mode: state.mode,
    kind: state.bundleId ? 'paquete' : 'variante',
    title: state.title,
    label: state.label,
    color: state.color,
    photoUrl: state.photoUrl,
    pieces: state.pieces,
    unitIndex: state.unitIndex,
    unitTotal: state.unitTotal,
    shipping: state.shipping,
  };
  if (state.mode === 'subasta') {
    return {
      ...base,
      price: bs(state.priceCents),
      increment: bs(state.incrementCents),
      nextBid: bs(state.priceCents + (state.leaderId ? state.incrementCents : 0)),
      timer: state.timer,
      leaderHandle: state.leaderHandle,
      leading: Boolean(viewerId && state.leaderId === viewerId),
      bids: state.bids,
    };
  }
  return {
    ...base,
    price: bs(state.priceCents),
    stock: state.unitTotal,
    sold: state.soldQty,
    left: state.unitTotal - state.soldQty,
    lastBuyerHandle: state.lastBuyerHandle,
  };
}

/** B2/B3: estado completo de la sala. */
export async function room(streamId, viewer) {
  const st = await one(
    `SELECT st.*, s.name AS seller_name, s.slug, s.initials, s.color AS seller_color, s.rating_pct, s.sales_count, s.user_id AS owner_id
     FROM streams st JOIN sellers s ON s.id = st.seller_id WHERE st.id = $1`,
    [streamId]
  );
  if (!st) fail(404, 'Esa transmisión no existe.');
  const messages = await many(
    'SELECT id, handle, text, system, is_seller, user_id, at FROM stream_messages WHERE stream_id = $1 ORDER BY at DESC LIMIT 40',
    [streamId]
  );
  const following = viewer ? Boolean(await one('SELECT 1 FROM follows WHERE user_id = $1 AND seller_id = $2', [viewer.id, st.seller_id])) : false;
  return {
    stream: {
      id: st.id, title: st.title, status: st.status, color: st.color || st.seller_color, tag: st.tag, viewers: viewersOf(st),
      startedAt: st.started_at, isOwner: Boolean(viewer && viewer.id === st.owner_id),
      seller: { id: st.seller_id, name: st.seller_name, slug: st.slug, initials: st.initials, ratingPct: st.rating_pct, salesCount: st.sales_count, following },
    },
    lot: publicLot(lots.get(streamId), viewer?.id),
    lastOutcome: lots.get(`${streamId}:last`) || null,
    queue: await queue(streamId),
    messages: messages.reverse().map(messageOut),
  };
}

const messageOut = (m) => ({ id: m.id, handle: m.handle, text: m.text, system: m.system, seller: m.is_seller, userId: m.user_id, at: m.at });

async function systemMessage(streamId, handle, text, userId = null) {
  const m = await one(
    'INSERT INTO stream_messages(id, stream_id, user_id, handle, text, system) VALUES ($1,$2,$3,$4,$5,true) RETURNING *',
    [id('smg'), streamId, userId, handle, text]
  );
  hub.emit(`stream:${streamId}`, 'chat:new', { streamId, message: messageOut(m) });
}

export async function chat(streamId, user, text) {
  const clean = String(text || '').trim().slice(0, 240);
  if (!clean) fail(400, 'Escribí un mensaje.');
  const st = await one(`SELECT st.id, s.user_id AS owner FROM streams st JOIN sellers s ON s.id = st.seller_id WHERE st.id = $1`, [streamId]);
  if (!st) fail(404, 'Esa transmisión no existe.');
  const m = await one(
    `INSERT INTO stream_messages(id, stream_id, user_id, handle, text, is_seller) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [id('smg'), streamId, user.id, user.handle, clean, st.owner === user.id]
  );
  hub.emit(`stream:${streamId}`, 'chat:new', { streamId, message: messageOut(m) });
  return messageOut(m);
}

export async function liveToken(streamId, user) {
  const { url, key, secret } = config.livekit;
  if (!url || !key || !secret) fail(503, 'El video en vivo no está configurado en este servidor.');
  const st = await one(`SELECT st.*, s.user_id AS owner, s.name FROM streams st JOIN sellers s ON s.id = st.seller_id WHERE st.id = $1`, [streamId]);
  if (!st) fail(404, 'Esa transmisión no existe.');
  const isBroadcaster = st.owner === user.id;
  const token = new AccessToken(key, secret, { identity: user.id, name: isBroadcaster ? st.name : user.handle, ttl: '6h' });
  token.addGrant({ room: st.id, roomJoin: true, canPublish: isBroadcaster, canPublishData: isBroadcaster, canSubscribe: true });
  return { url, token: await token.toJwt(), room: st.id, role: isBroadcaster ? 'broadcaster' : 'viewer' };
}

export const liveConfig = () => ({ url: config.livekit.url, configured: Boolean(config.livekit.url && config.livekit.key && config.livekit.secret) });

// ---------------------------------------------------------- vendedor: armar ---

async function sellerStream(sellerId, streamId) {
  const st = await one('SELECT * FROM streams WHERE id = $1 AND seller_id = $2', [streamId, sellerId]);
  if (!st) fail(404, 'Esa transmisión no existe.');
  return st;
}

/**
 * E9 · Salir al aire: crea el vivo y aparta las unidades cargadas.
 * `entries`: [{ variantId | bundleId, qty, mode: 'subasta'|'fijo', startPrice, minPrice, increment, price }]
 * en el orden de la cola.
 */
export async function startStream(seller, { title, entries, scheduledId }) {
  if (!isPremium(seller)) fail(403, 'Transmitir es parte de Premium.');
  if (!Array.isArray(entries) || !entries.length) fail(400, 'Cargá al menos un producto o paquete.');
  if (await one(`SELECT 1 FROM streams WHERE seller_id = $1 AND status = 'live'`, [seller.id])) fail(409, 'Ya tenés un vivo al aire.');

  const clean = entries.map((e, i) => {
    const qty = Number.parseInt(e.qty, 10);
    if (!(qty > 0)) fail(400, 'Indicá cuántas unidades cargás.');
    const mode = e.bundleId ? 'subasta' : e.mode === 'fijo' ? 'fijo' : 'subasta';
    const out = { variantId: e.variantId || null, bundleId: e.bundleId || null, qty, mode, position: i };
    if (mode === 'subasta') {
      out.startCents = toCents(e.startPrice);
      if (!(out.startCents > 0)) fail(400, 'Poné un precio inicial para cada subasta.');
      out.minCents = e.minPrice ? toCents(e.minPrice) : out.startCents;
      if (out.minCents < out.startCents) fail(400, 'El precio mínimo no puede ser menor al inicial.');
      out.incrementCents = e.increment ? toCents(e.increment) : Math.max(1000, Math.round(out.startCents * 0.05 / 1000) * 1000);
    } else {
      out.priceCents = e.price ? toCents(e.price) : null;
    }
    return out;
  });

  return tx(async (q) => {
    // Precio fijo sin precio: el del catálogo.
    for (const e of clean.filter((x) => x.mode === 'fijo' && !(x.priceCents > 0))) {
      e.priceCents = (await one('SELECT price_cents FROM variants WHERE id = $1', [e.variantId], q))?.price_cents;
      if (!e.priceCents) fail(400, 'Uno de los productos no tiene precio.');
    }
    let streamId = scheduledId;
    const cleanTitle = String(title || `${seller.name} en vivo`).trim().slice(0, 80);
    if (streamId) {
      const sch = await one(`UPDATE streams SET status = 'live', started_at = now(), title = $3 WHERE id = $1 AND seller_id = $2 AND status = 'scheduled' RETURNING id`, [streamId, seller.id, cleanTitle], q);
      if (!sch) fail(404, 'Ese vivo programado no existe.');
    } else {
      streamId = id('str');
      await q.query(
        `INSERT INTO streams(id, seller_id, title, status, started_at, color) VALUES ($1,$2,$3,'live',now(),$4)`,
        [streamId, seller.id, cleanTitle, seller.color || colorFor(seller.id)]
      );
    }
    await stock.reserveForLive(q, { streamId, sellerId: seller.id, entries: clean, actorId: seller.user_id });
    afterCommit(q, async () => {
      hub.emit('feed', 'stream:started', { streamId });
      const followers = await many('SELECT user_id FROM follows WHERE seller_id = $1 AND notify', [seller.id]);
      for (const f of followers) {
        await notify(undefined, { userId: f.user_id, kind: KIND.LIVE, title: `${seller.name} está en vivo`, body: cleanTitle, link: `/vivo/${streamId}` });
      }
    });
    return streamId;
  });
}

/** Próximo vivo programado (aparece en D9, D15 y B1). */
export async function scheduleStream(seller, { title, at }) {
  if (!isPremium(seller)) fail(403, 'Transmitir es parte de Premium.');
  const when = new Date(at);
  if (Number.isNaN(when.getTime()) || when < new Date()) fail(400, 'Elegí una fecha y hora futura.');
  const sid = id('str');
  await one(
    `INSERT INTO streams(id, seller_id, title, status, scheduled_at, color) VALUES ($1,$2,$3,'scheduled',$4,$5) RETURNING id`,
    [sid, seller.id, String(title || 'Vivo programado').slice(0, 80), when, seller.color]
  );
  return sid;
}

export async function reorderQueue(sellerId, streamId, reservationIds) {
  await sellerStream(sellerId, streamId);
  await tx(async (q) => {
    for (const [i, rid] of reservationIds.entries()) {
      await q.query('UPDATE live_reservations SET position = $3 WHERE id = $1 AND stream_id = $2', [rid, streamId, i]);
    }
  });
  hub.emit(`stream:${streamId}`, 'queue:update', { streamId, queue: await queue(streamId) });
}

// ---------------------------------------------------------- vendedor: lotes ---

/**
 * "Iniciar subasta" / "Abrir oferta": pone al aire el siguiente lote de la cola (o el que elija
 * el vendedor). Una subasta de N unidades se remata de a una: cada unidad es un lote.
 */
export async function openNext(seller, streamId, { reservationId } = {}) {
  const st = await sellerStream(seller.id, streamId);
  if (st.status !== 'live') fail(409, 'El vivo ya terminó.');
  if (lots.get(streamId)) fail(409, 'Ya tenés un lote en el aire. Cerralo primero.');
  const r = reservationId
    ? await one(`SELECT * FROM live_reservations WHERE id = $1 AND stream_id = $2`, [reservationId, streamId])
    : await one(
      `SELECT * FROM live_reservations WHERE stream_id = $1 AND status IN ('queued','on_air') AND committed < qty_reserved
       ORDER BY position, id LIMIT 1`,
      [streamId]
    );
  if (!r || r.committed >= r.qty_reserved || r.status === 'closed') fail(409, 'No quedan productos en la cola.');

  const [row] = (await reservationRows(streamId)).filter((x) => x.id === r.id);
  const pieces = r.bundle_id ? (await bundlePieces([r.bundle_id])).get(r.bundle_id) || [] : [];
  const photo = r.bundle_id
    ? (await storage.url(row.bundle_photo)) || pieces[0]?.photoUrl || null
    : await storage.url(((await photosByProduct([row.product_id])).get(row.product_id) || [])[0]);
  const shippingRow = row.product_id ? await one('SELECT shipping_options FROM products WHERE id = $1', [row.product_id]) : null;
  const lotNo = r.mode === 'fijo' ? `#F-${(await one(`SELECT nextval('lot_no_seq') AS n`)).n}` : `#${String((await one(`SELECT nextval('lot_no_seq') AS n`)).n).padStart(3, '0')}`;
  const lotId = id('lot');
  const unitTotal = r.mode === 'fijo' ? r.qty_reserved - r.committed : r.qty_reserved;
  const unitIndex = r.mode === 'fijo' ? 1 : r.committed + 1;
  const priceCents = r.mode === 'fijo' ? r.price_cents : r.start_cents;

  await one(
    `INSERT INTO lots(id, stream_id, reservation_id, lot_no, mode, unit_index, unit_total, status, start_cents, min_cents, increment_cents, price_cents)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8,$9,$10,$11) RETURNING id`,
    [lotId, streamId, r.id, lotNo, r.mode, unitIndex, unitTotal, r.start_cents, r.min_cents, r.increment_cents, priceCents]
  );
  await one(`UPDATE live_reservations SET status = 'on_air' WHERE id = $1 RETURNING id`, [r.id]);

  const state = {
    id: lotId, streamId, reservationId: r.id, sellerId: seller.id, lotNo, mode: r.mode,
    variantId: r.variant_id, bundleId: r.bundle_id, productId: row.product_id,
    title: r.bundle_id ? row.bundle_name : row.product_title,
    label: r.bundle_id ? `Paquete · ${pieces.length} productos` : row.label !== 'Única' ? row.label : null,
    color: r.bundle_id ? pieces[0]?.color : row.color,
    photoUrl: photo, photoKey: null, pieces,
    shipping: shippingRow?.shipping_options?.includes('envio_gratis') ? 'Envío gratis' : 'Envío a convenir',
    unitIndex, unitTotal,
    priceCents, minCents: r.min_cents, incrementCents: r.increment_cents,
    timer: BID_WINDOW, leaderId: null, leaderHandle: null, bids: 0,
    soldQty: 0, lastBuyerHandle: null, settling: false,
  };
  lots.set(streamId, state);
  lots.delete(`${streamId}:last`);
  hub.emit(`stream:${streamId}`, 'lot:update', { streamId, lot: publicLot(state) });
  hub.emit(`stream:${streamId}`, 'queue:update', { streamId, queue: await queue(streamId) });
  hub.emit('feed', 'stream:update', { streamId });
  return publicLot(state);
}

/** "+30 s": alarga la subasta abierta (tope de 5 minutos). */
export async function extend(seller, streamId, seconds = 30) {
  await sellerStream(seller.id, streamId);
  const state = lots.get(streamId);
  if (!state || state.mode !== 'subasta' || state.settling) fail(409, 'No hay una subasta abierta.');
  state.timer = Math.min(state.timer + Math.min(Math.max(Number(seconds) || 30, 5), 60), MAX_TIMER);
  hub.emit(`stream:${streamId}`, 'lot:update', { streamId, lot: publicLot(state) });
  return publicLot(state);
}

/** Cerrar el lote a mano (subasta: se resuelve con la puja actual; oferta: se cierra con lo vendido). */
export async function closeLot(seller, streamId) {
  await sellerStream(seller.id, streamId);
  const state = lots.get(streamId);
  if (!state) fail(409, 'No hay ningún lote abierto.');
  return settle(streamId, 'vendedor');
}

// ------------------------------------------------------------ compradores ---

export async function bid(streamId, user, amount) {
  const state = lots.get(streamId);
  if (!state || state.mode !== 'subasta') fail(409, 'No hay una subasta abierta en esta sala.');
  if (state.settling || state.timer <= 0) fail(409, 'La subasta ya cerró.');
  if (state.sellerUserId === user.id || user.seller_id === state.sellerId) fail(403, 'No podés pujar en tu propio vivo.');
  if (state.leaderId === user.id) fail(409, 'Ya vas ganando este lote.');
  const minimum = state.leaderId ? state.priceCents + state.incrementCents : state.priceCents;
  const cents = toCents(amount);
  if (!(cents >= minimum)) fail(409, `La siguiente puja es de Bs ${bs(minimum)}.`);

  // Todo lo que decide la puja ocurre antes de cualquier await: no hay carreras en el mismo proceso.
  const previous = state.leaderId;
  state.priceCents = cents;
  state.leaderId = user.id;
  state.leaderHandle = user.handle;
  state.timer = Math.max(state.timer, BID_WINDOW);
  state.bids += 1;
  hub.emit(`stream:${streamId}`, 'lot:update', { streamId, lot: publicLot(state) });
  if (previous) hub.emit(`user:${previous}`, 'auction:outbid', { streamId, lotId: state.id, price: bs(cents) });

  await one('UPDATE lots SET price_cents = $2, winner_id = $3, bids_count = bids_count + 1 WHERE id = $1 RETURNING id', [state.id, cents, user.id]);
  await one('INSERT INTO bids(lot_id, user_id, amount_cents) VALUES ($1,$2,$3) RETURNING id', [state.id, user.id, cents]);
  await systemMessage(streamId, user.handle, `Pujó Bs ${bs(cents)}`, user.id);
  return publicLot(state, user.id);
}

async function buyerAddress(userId) {
  const a = await one('SELECT * FROM addresses WHERE user_id = $1 AND is_default', [userId]);
  return a ? { label: a.label, city: a.city, zone: a.zone, street: a.street, reference: a.reference } : null;
}

async function liveOrder(state, buyer, unitPriceCents, channel) {
  const settings = await getSettings();
  const address = await buyerAddress(buyer.id);
  const shippingOptions = state.productId
    ? (await one('SELECT shipping_options FROM products WHERE id = $1', [state.productId]))?.shipping_options || []
    : ['a_convenir'];
  return tx(async (q) => {
    const created = await createOrdersAndPayment(q, {
      buyerId: buyer.id,
      windowMin: settings.payment_window_live_min,
      address,
      phone: buyer.phone,
      groups: [{
        sellerId: state.sellerId,
        channel,
        streamId: state.streamId,
        deliveryMethod: 'envio',
        shippingMode: shippingOptions.includes('envio_gratis') ? 'envio_gratis' : 'a_convenir',
        items: [{
          variantId: state.variantId, bundleId: state.bundleId, productId: state.productId,
          title: state.title, label: state.bundleId ? state.label : state.label || null, color: state.color,
          photoKey: null, qty: 1, unitPriceCents, reservationId: state.reservationId, lotId: state.id,
        }],
      }],
    });
    const orderId = created.orderIds[0];
    afterCommit(q, () => hub.emit(`seller:${state.sellerId}`, 'order:new', { order: { id: orderId } }));
    return { paymentId: created.paymentId, orderId, ref: created.ref };
  });
}

/** "Comprar ya" en una oferta a precio fijo: una unidad por toque. */
export async function buy(streamId, user) {
  const state = lots.get(streamId);
  if (!state || state.mode !== 'fijo') fail(409, 'No hay una oferta abierta en esta sala.');
  if (state.settling) fail(409, 'La oferta ya cerró.');
  if (user.seller_id === state.sellerId) fail(403, 'No podés comprar en tu propio vivo.');
  if (state.soldQty >= state.unitTotal) fail(409, 'Se agotaron las unidades.');
  state.soldQty += 1; // se reserva la unidad antes de cualquier await
  try {
    const result = await liveOrder(state, user, state.priceCents, 'vivo');
    state.lastBuyerHandle = user.handle;
    await one('UPDATE lots SET sold_qty = $2 WHERE id = $1 RETURNING id', [state.id, state.soldQty]);
    hub.emit(`stream:${streamId}`, 'lot:update', { streamId, lot: publicLot(state) });
    await systemMessage(streamId, user.handle, `Compró 1 unidad · Bs ${bs(state.priceCents)}`, user.id);
    hub.emit(`user:${user.id}`, 'purchase:done', { streamId, paymentId: result.paymentId, orderId: result.orderId });
    if (state.soldQty >= state.unitTotal) setTimeout(() => settle(streamId, 'agotado').catch(() => {}), 900);
    return result;
  } catch (err) {
    state.soldQty -= 1;
    throw err;
  }
}

// ----------------------------------------------------------- cierre de lote ---

async function settle(streamId, reason) {
  const state = lots.get(streamId);
  if (!state || state.settling) return null;
  state.settling = true;
  let outcome;
  try {
    if (state.mode === 'subasta') {
      if (state.leaderId && state.priceCents >= state.minCents) {
        const winner = await one('SELECT u.*, s.id AS seller_id FROM users u LEFT JOIN sellers s ON s.user_id = u.id WHERE u.id = $1', [state.leaderId]);
        let result = null;
        try {
          result = await liveOrder(state, winner, state.priceCents, 'subasta');
        } catch (err) {
          console.error('[vivo] no se pudo crear el pedido del ganador', err.message);
        }
        await one(`UPDATE lots SET status = 'sold', closed_at = now(), sold_qty = 1 WHERE id = $1 RETURNING id`, [state.id]);
        outcome = { type: 'won', winnerHandle: state.leaderHandle, title: state.title, price: bs(state.priceCents), orderId: result?.orderId };
        if (result) {
          hub.emit(`user:${winner.id}`, 'auction:won', { streamId, paymentId: result.paymentId, orderId: result.orderId, price: bs(state.priceCents), title: state.title });
          await notify(undefined, {
            userId: winner.id, kind: KIND.ORDER_UPDATE, title: '¡Ganaste el lote!',
            body: `${state.title} por Bs ${bs(state.priceCents)}. Tenés pocos minutos para pagar.`, link: `/pago/${result.paymentId}`,
          });
        }
        await systemMessage(streamId, state.leaderHandle, `Se lo llevó por Bs ${bs(state.priceCents)}`);
      } else {
        await one(`UPDATE lots SET status = 'no_sale', closed_at = now() WHERE id = $1 RETURNING id`, [state.id]);
        // Sin venta: esa unidad vuelve al catálogo al terminar el vivo; la cola sigue con otro lote.
        await one(`UPDATE live_reservations SET status = 'done' WHERE id = $1 RETURNING id`, [state.reservationId]);
        outcome = { type: 'no_sale', title: state.title, price: bs(state.priceCents), min: bs(state.minCents), hadBids: state.bids > 0 };
      }
    } else {
      await one(`UPDATE lots SET status = 'closed', closed_at = now() WHERE id = $1 RETURNING id`, [state.id]);
      outcome = { type: 'offer_closed', title: state.title, sold: state.soldQty, total: state.unitTotal, revenue: bs(state.soldQty * state.priceCents) };
    }
    const r = await one('SELECT committed, qty_reserved, status FROM live_reservations WHERE id = $1', [state.reservationId]);
    if (r && r.status !== 'done' && (state.mode === 'fijo' || r.committed >= r.qty_reserved)) {
      await one(`UPDATE live_reservations SET status = 'done' WHERE id = $1 RETURNING id`, [state.reservationId]);
    } else if (r && r.status === 'on_air') {
      await one(`UPDATE live_reservations SET status = 'queued' WHERE id = $1 RETURNING id`, [state.reservationId]);
    }
  } finally {
    lots.delete(streamId);
  }
  outcome.reason = reason;
  lots.set(`${streamId}:last`, outcome);
  hub.emit(`stream:${streamId}`, 'lot:closed', { streamId, outcome });
  hub.emit(`stream:${streamId}`, 'queue:update', { streamId, queue: await queue(streamId) });
  return outcome;
}

/** Reloj único: mueve todas las subastas abiertas. */
export function startClock() {
  return setInterval(() => {
    for (const [key, state] of lots) {
      if (key.includes(':') || state.mode !== 'subasta' || state.settling) continue;
      if (state.timer > 0) {
        state.timer -= 1;
        hub.emit(`stream:${key}`, 'lot:tick', { streamId: key, timer: state.timer, price: bs(state.priceCents) });
        continue;
      }
      settle(key, 'tiempo').catch((err) => console.error('[vivo] cierre de lote', err.message));
    }
  }, 1000);
}

// ------------------------------------------------------------ fin del vivo ---

/** "Terminar": cierra el lote abierto, devuelve lo no vendido al catálogo y arma el resumen C7b. */
export async function endStream(seller, streamId) {
  const st = await sellerStream(seller.id, streamId);
  if (st.status === 'ended') return summary(seller.id, streamId);
  if (lots.get(streamId)) await settle(streamId, 'fin_del_vivo');
  await tx(async (q) => {
    await q.query(`UPDATE streams SET status = 'ended', ended_at = now(), peak_viewers = GREATEST(peak_viewers, $2) WHERE id = $1`, [streamId, hub.viewersOf(streamId)]);
    await stock.closeLiveReservations(q, streamId);
  });
  lots.delete(`${streamId}:last`);
  hub.emit(`stream:${streamId}`, 'stream:ended', { streamId });
  hub.emit('feed', 'stream:ended', { streamId });
  return summary(seller.id, streamId);
}

/** C7b · Resumen al terminar. */
export async function summary(sellerId, streamId) {
  const st = await sellerStream(sellerId, streamId);
  const q = await queue(streamId);
  const orders = await one(
    `SELECT count(*)::int AS n, COALESCE(SUM(total_cents), 0)::int AS cents,
            count(*) FILTER (WHERE status IN ('pendiente_pago','pago_en_revision'))::int AS pending
     FROM orders WHERE stream_id = $1 AND status <> 'vencido'`,
    [streamId]
  );
  const followers = await one(
    `SELECT count(*)::int AS n FROM follows WHERE seller_id = $1 AND created_at BETWEEN $2 AND COALESCE($3, now())`,
    [sellerId, st.started_at, st.ended_at]
  );
  const reserved = q.reduce((s, r) => s + r.qty, 0);
  const sold = q.reduce((s, r) => s + r.committed, 0);
  return {
    id: st.id,
    title: st.title,
    status: st.status,
    durationMin: st.started_at ? Math.round(((st.ended_at ? new Date(st.ended_at) : new Date()) - new Date(st.started_at)) / 60000) : 0,
    reserved,
    sold,
    returned: st.status === 'ended' ? reserved - sold : 0,
    orders: { count: orders.n, total: bs(orders.cents), pendingPayments: orders.pending },
    peakViewers: Math.max(st.peak_viewers, hub.viewersOf(streamId)),
    newFollowers: followers.n,
    lots: q,
  };
}

/** Pico de espectadores (lo llama el hub al cambiar el conteo). */
export async function trackViewers(streamId, count) {
  await one('UPDATE streams SET peak_viewers = GREATEST(peak_viewers, $2) WHERE id = $1 AND status = $3 RETURNING id', [streamId, count, 'live']).catch(() => {});
}

/** Al reiniciar el servidor, los lotes que estaban abiertos quedan cerrados sin venta. */
export async function recoverAfterRestart() {
  await many(`UPDATE lots SET status = 'closed', closed_at = now() WHERE status = 'open' RETURNING id`);
  await many(`UPDATE live_reservations SET status = 'queued' WHERE status = 'on_air' RETURNING id`);
}

/** Vivos del vendedor (historial y programados). */
export async function sellerStreams(sellerId) {
  const rows = await many(
    `SELECT id, title, status, scheduled_at, started_at, ended_at, peak_viewers FROM streams WHERE seller_id = $1
     ORDER BY COALESCE(started_at, scheduled_at) DESC LIMIT 50`,
    [sellerId]
  );
  return rows.map((r) => ({ id: r.id, title: r.title, status: r.status, scheduledAt: r.scheduled_at, startedAt: r.started_at, endedAt: r.ended_at, peakViewers: r.peak_viewers }));
}

/** Datos para E9 paso 1: catálogo con disponible por variante y paquetes armables. */
export async function setupData(sellerId) {
  const products = await many(
    `SELECT p.id, p.title, p.color FROM products p WHERE p.seller_id = $1 AND p.status = 'active' ORDER BY p.title`,
    [sellerId]
  );
  const variants = await many(
    `SELECT v.id, v.product_id, v.label, v.price_cents, stock_available(v.id) AS available FROM variants v
     JOIN products p ON p.id = v.product_id WHERE p.seller_id = $1 AND v.active AND p.status = 'active' ORDER BY v.position`,
    [sellerId]
  );
  const photos = await photosByProduct(products.map((p) => p.id));
  const { list } = await import('./bundles.js');
  return {
    products: await Promise.all(products.map(async (p) => ({
      id: p.id, title: p.title, color: p.color, photoUrl: await storage.url((photos.get(p.id) || [])[0]),
      variants: variants.filter((v) => v.product_id === p.id).map((v) => ({ id: v.id, label: v.label, price: bs(v.price_cents), available: v.available })),
    }))).then((ps) => ps.filter((p) => p.variants.some((v) => v.available > 0))),
    bundles: (await list(sellerId)).filter((b) => b.available > 0),
  };
}

export function _state() { return lots; } // para pruebas
