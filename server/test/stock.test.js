import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../src/db.js';
import * as stock from '../src/services/stock.js';
import { freshDb, makeUser, makeSeller, makeProduct, makeStream, makeOrderShell } from './helpers.js';

let drop;
before(async () => { drop = await freshDb(); });
after(async () => { await drop(); });

const inFuture = () => new Date(Date.now() + 15 * 60_000);
const avail = async (variantId) => (await stock.availability([variantId])).get(variantId);

async function hold(order, items) {
  const rows = [];
  for (const it of items) {
    const row = await db.one(
      `INSERT INTO order_items(id, order_id, variant_id, bundle_id, title, qty, unit_price_cents, reservation_id)
       VALUES ($1, $2, $3, $4, 'x', $5, 100, $6) RETURNING id`,
      [db.id('itm'), order.id, it.variantId || null, it.bundleId || null, it.qty, it.reservationId || null]
    );
    rows.push({ ...it, orderItemId: row.id });
  }
  return db.tx((q) => stock.holdForOrder(q, { orderId: order.id, orderRef: order.ref, items: rows, expiresAt: inFuture() }));
}

test('apartar, pagar y vencer mueven las cifras de la fórmula', async () => {
  const { seller } = await makeSeller();
  const buyer = await makeUser();
  const { variants: [v] } = await makeProduct(seller.id, { variants: [{ label: 'M', price: 90, stock: 10 }] });

  const o1 = await makeOrderShell(buyer.id, seller.id);
  await hold(o1, [{ variantId: v.id, qty: 3 }]);
  assert.deepEqual(await avail(v.id), { id: v.id, stock: 10, sold: 0, held: 3, live: 0, available: 7 });

  await db.tx((q) => stock.confirmHolds(q, o1.id, o1.ref));
  assert.deepEqual(await avail(v.id), { id: v.id, stock: 7, sold: 3, held: 0, live: 0, available: 7 });

  const o2 = await makeOrderShell(buyer.id, seller.id);
  await hold(o2, [{ variantId: v.id, qty: 2 }]);
  assert.equal((await avail(v.id)).available, 5);
  await db.tx((q) => stock.releaseHolds(q, o2.id, 'vencido', o2.ref));
  assert.deepEqual(await avail(v.id), { id: v.id, stock: 7, sold: 3, held: 0, live: 0, available: 7 });
});

test('no se puede apartar más de lo disponible', async () => {
  const { seller } = await makeSeller();
  const buyer = await makeUser();
  const { variants: [v] } = await makeProduct(seller.id, { variants: [{ label: 'Única', price: 50, stock: 2 }] });
  const o = await makeOrderShell(buyer.id, seller.id);
  await assert.rejects(hold(o, [{ variantId: v.id, qty: 3 }]), /Solo quedan 2/);
  assert.equal((await avail(v.id)).held, 0, 'un rechazo no deja nada apartado');
});

test('dos compras simultáneas de la última unidad: una sola gana', async () => {
  const { seller } = await makeSeller();
  const { variants: [v] } = await makeProduct(seller.id, { variants: [{ label: 'Única', price: 120, stock: 1 }] });
  const buyers = await Promise.all(Array.from({ length: 6 }, () => makeUser()));
  const orders = await Promise.all(buyers.map((b) => makeOrderShell(b.id, seller.id)));

  const results = await Promise.allSettled(orders.map((o) => hold(o, [{ variantId: v.id, qty: 1 }])));
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  assert.equal(ok, 1);
  for (const r of results.filter((x) => x.status === 'rejected')) assert.match(r.reason.message, /Se agotó/);
  assert.deepEqual(await avail(v.id), { id: v.id, stock: 1, sold: 0, held: 1, live: 0, available: 0 });
});

test('el vivo aparta stock del catálogo y al terminar devuelve lo no vendido', async () => {
  const { seller } = await makeSeller({ plan: 'premium' });
  const buyer = await makeUser();
  const { variants: [v] } = await makeProduct(seller.id, { variants: [{ label: 'Única', price: 80, stock: 100 }] });
  const stream = await makeStream(seller.id);

  const [rid] = await db.tx((q) => stock.reserveForLive(q, {
    streamId: stream.id, sellerId: seller.id, entries: [{ variantId: v.id, qty: 50, mode: 'fijo', priceCents: 8000 }],
  }));
  assert.equal((await avail(v.id)).available, 50, '100 en stock, 50 cargados en el vivo');

  // Una compra del catálogo no puede tocar las 50 del vivo.
  const big = await makeOrderShell(buyer.id, seller.id);
  await assert.rejects(hold(big, [{ variantId: v.id, qty: 51 }]), /Solo quedan 50/);

  // Ventas en el vivo: salen de lo reservado, el catálogo no cambia.
  const o = await makeOrderShell(buyer.id, seller.id);
  await hold(o, [{ variantId: v.id, qty: 4, reservationId: rid }]);
  assert.deepEqual(await avail(v.id), { id: v.id, stock: 100, sold: 0, held: 4, live: 46, available: 50 });

  // Una de las compras del vivo vence mientras el vivo sigue: vuelve al vivo.
  await db.tx((q) => stock.releaseHolds(q, o.id, 'vencido', o.ref));
  assert.deepEqual(await avail(v.id), { id: v.id, stock: 100, sold: 0, held: 0, live: 50, available: 50 });

  const o2 = await makeOrderShell(buyer.id, seller.id);
  await hold(o2, [{ variantId: v.id, qty: 30, reservationId: rid }]);
  await db.tx((q) => stock.confirmHolds(q, o2.id, o2.ref));

  await db.query(`UPDATE streams SET status = 'ended' WHERE id = $1`, [stream.id]);
  const returned = await db.tx((q) => stock.closeLiveReservations(q, stream.id));
  assert.equal(returned.get(v.id), 20, 'vendió 30 de 50: vuelven 20');
  assert.deepEqual(await avail(v.id), { id: v.id, stock: 70, sold: 30, held: 0, live: 0, available: 70 });
});

test('una compra del vivo que vence después de terminar vuelve al catálogo', async () => {
  const { seller } = await makeSeller({ plan: 'premium' });
  const buyer = await makeUser();
  const { variants: [v] } = await makeProduct(seller.id, { variants: [{ label: 'Única', price: 80, stock: 10 }] });
  const stream = await makeStream(seller.id);
  const [rid] = await db.tx((q) => stock.reserveForLive(q, {
    streamId: stream.id, sellerId: seller.id, entries: [{ variantId: v.id, qty: 5, mode: 'subasta', startCents: 1000 }],
  }));
  const o = await makeOrderShell(buyer.id, seller.id);
  await hold(o, [{ variantId: v.id, qty: 1, reservationId: rid }]);

  await db.query(`UPDATE streams SET status = 'ended' WHERE id = $1`, [stream.id]);
  await db.tx((q) => stock.closeLiveReservations(q, stream.id));
  assert.equal((await avail(v.id)).available, 9, 'vuelven 4 al terminar; 1 sigue apartado por el pedido');

  await db.tx((q) => stock.releaseHolds(q, o.id, 'vencido', o.ref));
  assert.equal((await avail(v.id)).available, 10);
});

test('los paquetes apartan todas sus piezas y su disponible lo limita la más escasa', async () => {
  const { seller } = await makeSeller({ plan: 'premium' });
  const buyer = await makeUser();
  const { variants: [a] } = await makeProduct(seller.id, { title: 'Orient Bambino', variants: [{ label: 'Única', price: 600, stock: 1 }] });
  const { variants: [b] } = await makeProduct(seller.id, { title: 'Correa', variants: [{ label: 'Única', price: 90, stock: 12 }] });
  const bundle = await db.one(`INSERT INTO bundles(id, seller_id, name) VALUES ($1, $2, 'Combo') RETURNING *`, [db.id('bun'), seller.id]);
  await db.query('INSERT INTO bundle_items VALUES ($1, $2, 1), ($1, $3, 2)', [bundle.id, a.id, b.id]);
  assert.equal(await stock.bundleAvailability(bundle.id), 1);

  const stream = await makeStream(seller.id);
  await assert.rejects(
    db.tx((q) => stock.reserveForLive(q, { streamId: stream.id, sellerId: seller.id, entries: [{ bundleId: bundle.id, qty: 2, mode: 'subasta' }] })),
    /solo hay 1 disponibles/
  );
  const [rid] = await db.tx((q) => stock.reserveForLive(q, {
    streamId: stream.id, sellerId: seller.id, entries: [{ bundleId: bundle.id, qty: 1, mode: 'subasta', startCents: 50000 }],
  }));
  assert.equal((await avail(a.id)).available, 0);
  assert.equal((await avail(b.id)).available, 10);

  const o = await makeOrderShell(buyer.id, seller.id);
  await hold(o, [{ bundleId: bundle.id, qty: 1, reservationId: rid }]);
  await db.tx((q) => stock.confirmHolds(q, o.id, o.ref));
  assert.deepEqual(await avail(a.id), { id: a.id, stock: 0, sold: 1, held: 0, live: 0, available: 0 });
  assert.deepEqual(await avail(b.id), { id: b.id, stock: 10, sold: 2, held: 0, live: 0, available: 10 });
});

test('el ajuste manual no puede dejar el stock debajo de lo comprometido', async () => {
  const { seller, user } = await makeSeller();
  const buyer = await makeUser();
  const { variants: [v] } = await makeProduct(seller.id, { variants: [{ label: 'Única', price: 90, stock: 5 }] });
  const o = await makeOrderShell(buyer.id, seller.id);
  await hold(o, [{ variantId: v.id, qty: 3 }]);
  await assert.rejects(
    db.tx((q) => stock.adjust(q, { variantId: v.id, delta: -3, kind: 'perdida', actorId: user.id })),
    /menos de 3/
  );
  const after = await db.tx((q) => stock.adjust(q, { variantId: v.id, delta: 4, kind: 'reposicion', actorId: user.id }));
  assert.equal(after.available, 6);
  const moves = await db.many('SELECT kind, qty FROM stock_movements WHERE variant_id = $1 ORDER BY id', [v.id]);
  assert.deepEqual(moves.map((m) => m.kind), ['apartado', 'reposicion']);
});
