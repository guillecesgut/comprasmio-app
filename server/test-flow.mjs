/**
 * Prueba de humo del flujo completo, contra el servidor levantado en :4000.
 *   node test-flow.mjs
 */
const API = process.env.API || 'http://localhost:4000';
let failures = 0;

const call = async (path, { token, method = 'GET', body } = {}) => {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

function check(label, condition, detail) {
  const ok = !!condition;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FALLA'} ${label}${ok || detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`);
}

const login = (phone, password) => call('/api/auth/login', { method: 'POST', body: { phone, password } });

const run = async () => {
  const buyer = (await login('71234567', 'comprar123')).data;
  const seller = (await login('70000000', 'vender123')).data;
  check('login comprador', buyer?.token, buyer);
  check('login vendedor', seller?.token, seller);
  const bt = buyer.token, st = seller.token;

  const { data: feed } = await call('/api/streams');
  check('feed con transmisiones', feed.streams.length === 6, feed.count);
  const { data: fixedFeed } = await call('/api/streams?mode=fixed');
  check('filtro por modo', fixedFeed.streams.every((s) => s.mode === 'fixed'));

  const streamId = feed.streams.find((s) => s.seller.name === 'Relojería Andina').id;
  const { data: cat } = await call('/api/products', { token: st });
  const auctionProduct = cat.products.find((p) => p.mode === 'auction');
  const fixedProduct = cat.products.find((p) => p.mode === 'fixed');

  /* ---- subasta ---- */
  const opened = await call(`/api/streams/${streamId}/lot`, { token: st, method: 'POST', body: { productId: auctionProduct.id } });
  check('vendedor abre lote de subasta', opened.data.lot?.mode === 'auction', opened.data);
  check('cronómetro arranca en 15s', opened.data.lot.timer === 15);

  const low = await call(`/api/streams/${streamId}/bid`, { token: bt, method: 'POST', body: { amount: auctionProduct.start + 2 } });
  check('rechaza puja por debajo del incremento', low.status === 409, low.data);

  const good = await call(`/api/streams/${streamId}/bid`, { token: bt, method: 'POST', body: { amount: auctionProduct.start + 10 } });
  check('acepta puja válida', good.data.lot?.price === auctionProduct.start + 10, good.data);

  const twice = await call(`/api/streams/${streamId}/bid`, { token: bt, method: 'POST', body: { amount: auctionProduct.start + 20 } });
  check('no deja pujar contra vos mismo', twice.status === 409, twice.data);

  await new Promise((r) => setTimeout(r, 3100));
  const { data: mid } = await call(`/api/streams/${streamId}`);
  check('el cronómetro corre', mid.lot.timer < 15 && mid.lot.timer > 8, mid.lot.timer);

  const antiSnipe = await call(`/api/streams/${streamId}/bid`, { token: st, method: 'POST', body: { amount: mid.lot.price + 10 } });
  check('anti-snipe: la puja reinicia a 15s', antiSnipe.data.lot?.timer === 15, antiSnipe.data);

  // Cierre por debajo del mínimo → sin venta (precio de reserva).
  const noSale = await call(`/api/streams/${streamId}/lot`, { token: st, method: 'DELETE' });
  check('lote bajo el mínimo no genera venta', noSale.data.outcome?.type === 'no_sale', noSale.data);

  /* ---- precio fijo ---- */
  const fixedOpen = await call(`/api/streams/${streamId}/lot`, { token: st, method: 'POST', body: { productId: fixedProduct.id } });
  check('vendedor abre lote a precio fijo', fixedOpen.data.lot?.stock === fixedProduct.stock, fixedOpen.data);

  const buy = await call(`/api/streams/${streamId}/buy`, { token: bt, method: 'POST' });
  check('compra directa crea orden', buy.data.order?.status === 'pendiente_pago', buy.data);
  check('descuenta una unidad', buy.data.lot.sold === 1, buy.data.lot);
  check('total incluye envío', buy.data.order.total === buy.data.order.amount + buy.data.order.shipping);

  const order = buy.data.order;

  /* ---- pago por QR ---- */
  const qr = await call(`/api/orders/${order.id}/qr`, { token: bt });
  check('genera QR de pago', qr.data.qr?.startsWith('data:image/png;base64,'), qr.status);

  const early = await call(`/api/orders/${order.id}/verify`, { token: st, method: 'POST' });
  check('no se verifica sin comprobante', early.status === 409, early.data);

  const form = new FormData();
  form.append('receipt', new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xdb])], { type: 'image/jpeg' }), 'comprobante.jpg');
  const receiptRes = await fetch(`${API}/api/orders/${order.id}/receipt`, {
    method: 'POST', headers: { Authorization: `Bearer ${bt}` }, body: form,
  });
  const receipt = await receiptRes.json();
  check('adjunta comprobante y pasa a revisión', receipt.order?.status === 'en_revision', receipt);

  const verified = await call(`/api/orders/${order.id}/verify`, { token: st, method: 'POST' });
  check('el vendedor verifica el pago', verified.data.order?.status === 'verificado', verified.data);

  const shipped = await call(`/api/orders/${order.id}/ship`, { token: st, method: 'POST' });
  check('marca como enviado', shipped.data.order?.status === 'enviado', shipped.data);

  const { data: mine } = await call('/api/orders', { token: bt });
  check('la compra aparece en Compras del comprador', mine.orders.some((o) => o.id === order.id && o.status === 'enviado'));

  /* ---- métricas ---- */
  const { data: overview } = await call('/api/seller/overview', { token: st });
  check('el resumen refleja el ingreso', overview.kpis.revenue >= order.amount, overview.kpis);
  const { data: customers } = await call('/api/seller/customers', { token: st });
  check('el comprador aparece en Clientes', customers.customers.some((c) => c.handle === 'ana_bo'), customers);

  /* ---- validación de catálogo ---- */
  const bad = await call('/api/products', { token: st, method: 'POST', body: { name: 'Sin precio', mode: 'fixed', price: 0, stock: 5 } });
  check('rechaza precio fijo sin precio', bad.status === 400, bad.data);
  const reserve = await call('/api/products', { token: st, method: 'POST', body: { name: 'Reserva baja', mode: 'auction', start: 100, min: 50 } });
  check('rechaza mínimo menor al inicial', reserve.status === 400, reserve.data);

  const anon = await call(`/api/streams/${streamId}/buy`, { method: 'POST' });
  check('exige sesión para comprar', anon.status === 401, anon.data);

  await call(`/api/streams/${streamId}/lot`, { token: st, method: 'DELETE' });
  console.log(failures ? `\n${failures} prueba(s) fallaron.` : '\nTodo en verde.');
  process.exit(failures ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
