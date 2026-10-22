import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.js';
import { startApi, activateQr, sql } from './http.js';
import * as orders from '../src/services/orders.js';
import { periodFor } from '../src/services/payouts.js';
import { DEFAULTS } from '../src/settings.js';

let drop;
let api;
let adm;
before(async () => {
  drop = await freshDb();
  api = await startApi();
  adm = await api.admin();
});
after(async () => {
  await api.stop();
  await drop();
});

async function product(seller, { title = 'Peluche oso', variants = [{ options: { Talla: 'M' }, price: 90, stock: 5 }], shipping = ['envio_gratis'] } = {}) {
  const r = await seller.post('/seller/products', { title, description: 'Suave', shippingOptions: shipping, variants });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.product;
}

async function receipt(buyer, paymentId) {
  const up = await buyer.upload('receipts', 'comprobante.jpg', 'image/jpeg');
  assert.equal(up.status, 201, JSON.stringify(up.data));
  return buyer.post(`/me/payments/${paymentId}/receipt`, { receiptKey: up.data.key });
}

async function address(buyer) {
  const r = await buyer.post('/me/addresses', { label: 'Casa', city: 'Santa Cruz', zone: 'Equipetrol', street: 'Calle 1 #23', phone: '71234567' });
  assert.equal(r.status, 201);
  return r.data.address;
}

test('sin QR de cobro activo no se puede pagar', async () => {
  const seller = await api.signup('seller');
  const buyer = await api.signup('buyer');
  const p = await product(seller);
  await buyer.post('/me/cart/items', { variantId: p.variants[0].id, qty: 1 });
  await address(buyer);
  const r = await buyer.post('/me/checkout', {});
  assert.equal(r.status, 503);
  assert.match(r.data.error, /No pudimos cargar los datos de pago/);
  assert.equal((await buyer.get('/me/cart')).data.units, 1, 'el carrito queda intacto');
});

test('compra a dos vendedores con una sola transferencia, de punta a punta hasta la liquidación', async () => {
  await activateQr(adm);
  const s1 = await api.signup('seller', 'Relojería Andina');
  const s2 = await api.signup('seller', 'Tejidos Wari');
  const buyer = await api.signup('buyer');
  const reloj = await product(s1, { title: 'Seiko 5', variants: [{ price: 900, stock: 1 }] });
  const aguayo = await product(s2, { title: 'Aguayo', variants: [{ options: { Color: 'Rojo' }, price: 320, stock: 4 }, { options: { Color: 'Azul' }, price: 340, stock: 2 }] });

  await buyer.post('/me/cart/items', { variantId: reloj.variants[0].id });
  await buyer.post('/me/cart/items', { variantId: aguayo.variants[1].id, qty: 2 });
  const cart = (await buyer.get('/me/cart')).data;
  assert.equal(cart.groups.length, 2);
  assert.equal(cart.total, 900 + 680);

  await address(buyer);
  const co = await buyer.post('/me/checkout', {});
  assert.equal(co.status, 201, JSON.stringify(co.data));
  const pay = (await buyer.get(`/me/payments/${co.data.paymentId}`)).data.payment;
  assert.equal(pay.amount, 1580);
  assert.equal(pay.orders.length, 2);
  assert.match(pay.ref, /^CM-\d+$/);
  assert.deepEqual(pay.orders.map((o) => o.ref), [`${pay.ref}-1`, `${pay.ref}-2`]);
  assert.ok(pay.qr.imageUrl && pay.qr.bank === 'Banco Unión');
  assert.equal((await buyer.get('/me/cart')).data.units, 0, 'el checkout vacía el carrito');

  // El reloj (1 unidad) ya no está disponible para otro comprador.
  const other = await api.signup('buyer', 'Luis');
  assert.equal((await other.post('/me/cart/items', { variantId: reloj.variants[0].id })).status, 409);

  assert.equal((await receipt(buyer, pay.id)).status, 200);
  const queue = (await adm.get('/admin/payments')).data.payments;
  assert.ok(queue.some((p) => p.id === pay.id && p.ordersCount === 2));
  assert.equal((await adm.post(`/admin/payments/${pay.id}/approve`)).status, 200);

  const s1orders = (await s1.get('/seller/orders')).data;
  assert.equal(s1orders.items.length, 1);
  const o1 = s1orders.items[0];
  assert.equal(o1.status, 'pagado');
  const detail = (await s1.get(`/seller/orders/${o1.id}`)).data.order;
  assert.equal(detail.commissionPct, 15);
  assert.equal(detail.net, 900 - 135);
  assert.equal(detail.payout.status, 'acumulando');

  // Stock vendido.
  const st = (await s1.get(`/seller/variants/${reloj.variants[0].id}/stock`)).data.variant;
  assert.deepEqual([st.stock, st.sold, st.available], [0, 1, 0]);

  assert.equal((await s1.post(`/seller/orders/${o1.id}/advance`, { to: 'preparando' })).status, 200);
  assert.equal((await s1.post(`/seller/orders/${o1.id}/advance`, { to: 'enviado', tracking: 'ABC123' })).status, 200);
  const bo = (await buyer.get(`/me/orders/${o1.id}`)).data.order;
  assert.equal(bo.status, 'enviado');
  assert.equal(bo.canConfirm, true);
  assert.equal((await buyer.post(`/me/orders/${o1.id}/confirm`)).status, 200);
  assert.equal((await buyer.post(`/me/orders/${o1.id}/review`, { rating: 5, comment: 'Impecable' })).status, 201);
  assert.equal((await s1.get('/seller/reviews')).data.avg, 5);

  // El corte de la semana: se simula que se entregó la semana pasada.
  await sql(`UPDATE orders SET delivered_at = now() - interval '8 days' WHERE id = $1`, [o1.id]);
  const cut = await adm.post('/admin/payouts/cut', {});
  assert.equal(cut.status, 200, JSON.stringify(cut.data));
  assert.equal(cut.data.created, 1);
  const again = await adm.post('/admin/payouts/cut', {});
  assert.equal(again.data.created, 0, 'generar dos veces no duplica');
  const week = (await adm.get('/admin/payouts')).data;
  const mine = week.items.find((i) => i.seller === 'Relojería Andina');
  assert.equal(mine.net, 765);
  assert.equal((await adm.post(`/admin/payouts/${mine.id}/paid`, { receiptKey: 'payouts/x.png' })).status, 409, 'sin datos para cobrar no se paga');

  await s1.put('/seller/payout-account', { bank: 'Banco Unión', accountType: 'Caja de ahorro', accountNumber: '100 2345', holder: 'Juan Pérez', holderDoc: '1234567' });
  assert.equal((await adm.post(`/admin/payouts/${mine.id}/paid`, { receiptKey: 'payouts/x.png' })).status, 409, 'sin verificar tampoco');
  await adm.post(`/admin/sellers/${s1.user.sellerId}/account`, { approve: true });
  assert.equal((await adm.get('/admin/payouts')).data.items.find((i) => i.id === mine.id).bank.verified, true);
  const up = await adm.upload('payouts', 'transferencia.pdf', 'application/pdf');
  assert.equal((await adm.post(`/admin/payouts/${mine.id}/paid`, { receiptKey: up.data.key, operationNumber: '987' })).status, 200);
  const cobros = (await s1.get('/seller/payouts')).data;
  assert.equal(cobros.history.length, 1);
  assert.equal(cobros.history[0].net, 765);
  assert.ok(cobros.history[0].receiptUrl);

  const csv = await fetch(`${api.base}/admin/payouts/export`, { headers: { Authorization: `Bearer ${adm.token || ''}` } });
  assert.ok([200, 403].includes(csv.status));
});

test('un pago sin comprobante vence y libera el stock', async () => {
  const seller = await api.signup('seller');
  const buyer = await api.signup('buyer');
  const p = await product(seller, { variants: [{ price: 50, stock: 3 }] });
  await buyer.post('/me/cart/items', { variantId: p.variants[0].id, qty: 2 });
  await address(buyer);
  const co = await buyer.post('/me/checkout', {});
  assert.equal((await seller.get(`/seller/variants/${p.variants[0].id}/stock`)).data.variant.available, 1);

  await sql(`UPDATE payments SET expires_at = now() - interval '1 minute' WHERE id = $1`, [co.data.paymentId]);
  const late = await receipt(buyer, co.data.paymentId);
  assert.equal(late.status, 410);
  assert.match(late.data.error, /El tiempo para pagar terminó/);
  const v = (await seller.get(`/seller/variants/${p.variants[0].id}/stock`)).data.variant;
  assert.equal(v.available, 3);
  assert.ok(v.movements.some((m) => m.kind === 'pedido_vencido'));
  const mine = (await buyer.get('/me/orders')).data;
  assert.equal(mine.items[0].status, 'vencido');
  assert.equal(await orders.expireDuePayments(), 0);
});

test('comprobante rechazado: el comprador puede reenviarlo y se aprueba', async () => {
  const seller = await api.signup('seller');
  const buyer = await api.signup('buyer');
  const p = await product(seller, { variants: [{ price: 70, stock: 2 }] });
  await buyer.post('/me/cart/items', { variantId: p.variants[0].id });
  await address(buyer);
  const { paymentId } = (await buyer.post('/me/checkout', {})).data;
  await receipt(buyer, paymentId);
  assert.equal((await adm.post(`/admin/payments/${paymentId}/reject`, {})).status, 400, 'el motivo es obligatorio');
  assert.equal((await adm.post(`/admin/payments/${paymentId}/reject`, { reason: 'El monto no coincide' })).status, 200);
  const pay = (await buyer.get(`/me/payments/${paymentId}`)).data.payment;
  assert.equal(pay.status, 'pending');
  assert.equal(pay.rejectReason, 'El monto no coincide');
  const notes = (await buyer.get('/me/notifications')).data.notifications;
  assert.ok(notes.some((n) => n.title === 'Revisá tu comprobante'));
  assert.equal((await receipt(buyer, paymentId)).status, 200);
  assert.equal((await adm.post(`/admin/payments/${paymentId}/approve`)).status, 200);
  assert.equal((await buyer.get('/me/orders')).data.items[0].status, 'pagado');
});

test('un reclamo retiene el pago y se resuelve con reembolso', async () => {
  const seller = await api.signup('seller');
  const buyer = await api.signup('buyer');
  const p = await product(seller, { variants: [{ price: 200, stock: 2 }] });
  await buyer.post('/me/cart/items', { variantId: p.variants[0].id });
  await address(buyer);
  const { paymentId } = (await buyer.post('/me/checkout', {})).data;
  await receipt(buyer, paymentId);
  await adm.post(`/admin/payments/${paymentId}/approve`);
  const [o] = (await buyer.get('/me/orders')).data.items;
  await seller.post(`/seller/orders/${o.id}/advance`, { to: 'enviado' });

  assert.equal((await buyer.post(`/me/orders/${o.id}/claim`, { reason: 'nada' })).status, 400);
  assert.equal((await buyer.post(`/me/orders/${o.id}/claim`, { reason: 'danado', description: 'Llegó roto' })).status, 201);
  assert.equal((await seller.get('/seller/payouts')).data.held.orders.length, 1);
  await sql(`UPDATE orders SET delivered_at = now() - interval '8 days' WHERE id = $1`, [o.id]);
  await adm.post('/admin/payouts/cut', {});
  assert.equal((await sql('SELECT payout_id FROM orders WHERE id = $1', [o.id])).rows[0].payout_id, null, 'en reclamo no se liquida');

  const claims = (await adm.get('/admin/claims')).data.claims;
  const c = claims.find((x) => x.orderId === o.id);
  assert.equal((await adm.post(`/admin/claims/${c.id}/resolve`, { outcome: 'comprador', note: 'Reembolsado', restock: true })).status, 200);
  const d = (await buyer.get(`/me/orders/${o.id}`)).data.order;
  assert.equal(d.status, 'cancelado');
  assert.equal(d.claim.status, 'resuelto_comprador');
  assert.equal((await seller.get(`/seller/variants/${p.variants[0].id}/stock`)).data.variant.available, 2, 'el stock volvió');
});

test('Premium por transferencia habilita los vivos; subasta, precio fijo y devolución al terminar', async () => {
  const seller = await api.signup('seller', 'Juguetería Sol');
  const b1 = await api.signup('buyer', 'Marco');
  const b2 = await api.signup('buyer', 'Lucía');
  const peluche = await product(seller, { title: 'Peluche', variants: [{ price: 80, stock: 100 }] });
  const auto = await product(seller, { title: 'Auto a control', variants: [{ price: 300, stock: 3 }] });

  assert.equal((await seller.post('/seller/streams', { entries: [] })).status, 403, 'Básico no transmite');
  const plan = (await seller.get('/seller/plan')).data.plan;
  assert.equal(plan.plan, 'basico');
  const { paymentId } = (await seller.post('/seller/plan/premium')).data;
  const pay = (await seller.get(`/me/payments/${paymentId}`)).data.payment;
  assert.match(pay.ref, /^PREMIUM-JUGUETERIASOL-/);
  assert.equal(pay.amount, 290);
  await receipt(seller, paymentId);
  await adm.post(`/admin/payments/${paymentId}/approve`);
  assert.equal((await seller.get('/seller/plan')).data.plan.plan, 'premium');

  const start = await seller.post('/seller/streams', {
    title: 'Juguetes en vivo',
    entries: [
      { variantId: peluche.variants[0].id, qty: 50, mode: 'fijo' },
      { variantId: auto.variants[0].id, qty: 2, mode: 'subasta', startPrice: 300, minPrice: 400, increment: 50 },
    ],
  });
  assert.equal(start.status, 201, JSON.stringify(start.data));
  const sid = start.data.streamId;
  let v = (await seller.get(`/seller/variants/${peluche.variants[0].id}/stock`)).data.variant;
  assert.deepEqual([v.available, v.inLive], [50, 50]);
  assert.equal((await b1.get(`/products/${peluche.id}`)).data.product.inLiveNow.streamId, sid);

  // Oferta a precio fijo: dos compras.
  const lot1 = await seller.post(`/seller/streams/${sid}/next`);
  assert.equal(lot1.data.lot.mode, 'fijo');
  assert.equal(lot1.data.lot.left, 50);
  const buy1 = await b1.post(`/me/streams/${sid}/buy`);
  assert.equal(buy1.status, 201, JSON.stringify(buy1.data));
  await b2.post(`/me/streams/${sid}/buy`);
  const room = (await b1.get(`/streams/${sid}`)).data;
  assert.equal(room.lot.sold, 2);
  assert.equal((await seller.post(`/seller/streams/${sid}/next`)).status, 409, 'el siguiente no arranca con un lote abierto');
  await seller.del(`/seller/streams/${sid}/lot`);

  // Subasta de una unidad: pujas, anti-sniping y +30 s.
  const lot2 = await seller.post(`/seller/streams/${sid}/next`);
  assert.equal(lot2.data.lot.unitIndex, 1);
  assert.equal(lot2.data.lot.unitTotal, 2);
  assert.equal((await b1.post(`/me/streams/${sid}/bid`, { amount: 300 })).status, 200);
  assert.equal((await b1.post(`/me/streams/${sid}/bid`, { amount: 350 })).status, 409, 'ya va ganando');
  assert.equal((await b2.post(`/me/streams/${sid}/bid`, { amount: 320 })).status, 409, 'menos que el mínimo');
  assert.equal((await b2.post(`/me/streams/${sid}/bid`, { amount: 350 })).status, 200);
  assert.equal((await b1.post(`/me/streams/${sid}/bid`, { amount: 400 })).status, 200);
  const ext = await seller.post(`/seller/streams/${sid}/extend`, { seconds: 30 });
  assert.ok(ext.data.lot.timer > 15);
  const won = await seller.del(`/seller/streams/${sid}/lot`);
  assert.equal(won.data.outcome.type, 'won');
  assert.equal(won.data.outcome.winnerHandle, b1.user.handle);
  const b1orders = (await b1.get('/me/orders')).data;
  assert.equal(b1orders.pending.length, 2, 'una compra del vivo y la subasta ganada esperan pago');
  assert.ok(b1orders.pending.some((o) => o.channel === 'subasta' && o.total === 400));

  // Segunda unidad: sin pujas suficientes → sin venta; vuelve al terminar.
  await seller.post(`/seller/streams/${sid}/next`);
  await b2.post(`/me/streams/${sid}/bid`, { amount: 300 });
  const noSale = await seller.del(`/seller/streams/${sid}/lot`);
  assert.equal(noSale.data.outcome.type, 'no_sale');

  // La compra de b2 vence durante el vivo y vuelve al vivo.
  const b2pay = (await b2.get('/me/orders')).data.pending[0].paymentId;
  await sql(`UPDATE payments SET expires_at = now() - interval '1 minute' WHERE id = $1`, [b2pay]);
  await orders.expireDuePayments();

  const end = await seller.post(`/seller/streams/${sid}/end`);
  assert.equal(end.status, 200, JSON.stringify(end.data));
  assert.equal(end.data.summary.reserved, 52);
  assert.equal(end.data.summary.sold, 2, '1 peluche (b1) + 1 auto ganado');
  assert.equal(end.data.summary.returned, 50);
  v = (await seller.get(`/seller/variants/${peluche.variants[0].id}/stock`)).data.variant;
  assert.deepEqual([v.available, v.held, v.inLive], [99, 1, 0], '99 libres: 1 apartado por el pago pendiente de b1');
  const a = (await seller.get(`/seller/variants/${auto.variants[0].id}/stock`)).data.variant;
  assert.deepEqual([a.available, a.held, a.inLive], [2, 1, 0]);
});

test('el corte semanal toma la semana cerrada y paga el lunes', () => {
  const settings = { ...DEFAULTS };
  // Miércoles 22 oct 2026 (Bolivia) → semana del lunes 19 al domingo 25, se paga el lunes 26.
  assert.deepEqual(periodFor(new Date('2026-10-22T15:00:00Z'), settings), { start: '2026-10-19', end: '2026-10-25', payOn: '2026-10-26' });
  // Domingo 25 a las 23:30 de Bolivia todavía es esa semana.
  assert.deepEqual(periodFor(new Date('2026-10-26T03:30:00Z'), settings).end, '2026-10-25');
  // Lunes 26 a las 00:30 de Bolivia ya es la siguiente.
  assert.deepEqual(periodFor(new Date('2026-10-26T04:30:00Z'), settings).end, '2026-11-01');
});

test('borrar la cuenta no se permite con pedidos en curso', async () => {
  const seller = await api.signup('seller');
  const buyer = await api.signup('buyer');
  const p = await product(seller, { variants: [{ price: 30, stock: 2 }] });
  await buyer.post('/me/cart/items', { variantId: p.variants[0].id });
  await address(buyer);
  await buyer.post('/me/checkout', {});
  const r = await buyer.del('/auth/me', { password: 'secreto1' });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /pedido.* en curso/);
  const lone = await api.signup('buyer', 'Sin pedidos');
  assert.equal((await lone.del('/auth/me', { password: 'mala' })).status, 401);
  assert.equal((await lone.del('/auth/me', { password: 'secreto1' })).status, 200);
  assert.equal((await lone.get('/auth/me')).status, 401);
});
