import * as db from './../db.js';
import * as hub from './hub.js';
import { createOrder } from '../orders.js';

/**
 * Un lote activo por transmisión. La sala vive en memoria porque es efímera;
 * lo que persiste es el resultado (orden + estado del producto).
 *
 * Subasta:      { mode:'auction', price, increment, min, timer, leaderId, leaderHandle }
 * Precio fijo:  { mode:'fixed', price, stock, sold, lastBuyerHandle }
 */
const lots = new Map(); // streamId -> lot

/**
 * Cola de productos precargados por el vendedor al iniciar la transmisión.
 * Vive en memoria igual que `lots`: es estado de la sesión en vivo, no algo
 * que sobreviva un reinicio del servidor. Cuando un lote cierra —por venta,
 * por no alcanzar el mínimo, o porque se agotó el stock— se abre solo el
 * siguiente de la cola, como una fila esperando turno.
 */
const queues = new Map(); // streamId -> string[] (ids de producto, en orden)

export const BID_WINDOW = 15;   // segundos; toda puja aceptada vuelve a 15 (anti-snipe)
export const CLOSE_DELAY = 900; // ms antes de cerrar cuando el stock llega a 0

export const getLot = (streamId) => lots.get(streamId) || null;

function publicLot(lot) {
  if (!lot) return null;
  const base = {
    lotNo: lot.lotNo,
    mode: lot.mode,
    productId: lot.productId,
    productName: lot.productName,
    grad: lot.grad,
    running: lot.running,
    price: lot.price,
  };
  return lot.mode === 'auction'
    ? { ...base, increment: lot.increment, timer: lot.timer, leaderId: lot.leaderId, leaderHandle: lot.leaderHandle }
    : { ...base, stock: lot.stock, sold: lot.sold, lastBuyerHandle: lot.lastBuyerHandle };
}

function broadcastLot(streamId) {
  hub.emit(`stream:${streamId}`, 'lot:update', { streamId, lot: publicLot(lots.get(streamId)) });
}

function systemMessage(streamId, handle, text) {
  const message = {
    id: db.id('msg'),
    streamId,
    handle,
    text,
    system: true,
    at: new Date().toISOString(),
  };
  db.insert('messages', message);
  hub.emit(`stream:${streamId}`, 'chat:new', { streamId, message });
  return message;
}

/* ---------------------------------------------------------------- lotes --- */

export function openLot(stream, product) {
  const lotNo = db.nextLotNo(product.mode);
  const lot =
    product.mode === 'fixed'
      ? {
          streamId: stream.id, lotNo, mode: 'fixed', productId: product.id,
          productName: product.name, grad: product.grad,
          price: product.price, stock: product.stock, sold: 0,
          lastBuyerHandle: null, running: true,
        }
      : {
          streamId: stream.id, lotNo, mode: 'auction', productId: product.id,
          productName: product.name, grad: product.grad,
          price: product.start, increment: product.increment || 10, min: product.min,
          timer: BID_WINDOW, leaderId: null, leaderHandle: null, running: true,
        };

  lots.set(stream.id, lot);
  db.update('streams', stream.id, { activeProductId: product.id, activeLotNo: lotNo });
  broadcastLot(stream.id);
  return publicLot(lot);
}

export function closeLot(streamId, reason = 'manual') {
  const lot = lots.get(streamId);
  if (!lot) return null;
  lot.running = false;
  const outcome = settle(streamId, lot, reason);
  lots.delete(streamId);
  db.update('streams', streamId, { activeProductId: null, activeLotNo: null });
  hub.emit(`stream:${streamId}`, 'lot:closed', { streamId, lot: publicLot(lot), outcome });

  // No hay avance automático: entre cada lote el vendedor decide cuándo sale
  // el siguiente producto de la cola, para poder hablarle a la audiencia
  // antes de arrancar la próxima puja. Ver `advanceQueue`, disparado a pedido
  // desde la ruta POST /:id/queue/next.
  return outcome;
}

/* ------------------------------------------------------------------ cola --- */

/** Lo que ve el comprador nunca incluye `min`: es el precio de reserva del vendedor. */
const publicProductOf = ({ min, ...rest }) => rest;

export function publicQueue(streamId) {
  return (queues.get(streamId) || [])
    .map((id) => db.find('products', (p) => p.id === id))
    .filter(Boolean)
    .map(publicProductOf);
}

function broadcastQueue(streamId) {
  hub.emit(`stream:${streamId}`, 'queue:update', { streamId, queue: publicQueue(streamId) });
}

/** Reemplaza la cola completa. Se usa al armar la lista al iniciar la transmisión. */
export function setQueue(streamId, productIds) {
  queues.set(streamId, [...productIds]);
  broadcastQueue(streamId);
}

/** Agrega un producto al final de la cola, sin tocar el resto. */
export function addToQueue(streamId, productId) {
  const queue = queues.get(streamId) || [];
  queue.push(productId);
  queues.set(streamId, queue);
  broadcastQueue(streamId);
}

export function clearQueue(streamId) {
  queues.delete(streamId);
}

/**
 * Saca el siguiente producto de la cola y lo pone en el aire. Si el producto
 * ya no está disponible (se vendió o lo borraron desde otra pestaña), lo
 * salta y prueba con el que sigue, hasta encontrar uno válido o vaciar la cola.
 */
export function advanceQueue(streamId) {
  const stream = db.find('streams', (s) => s.id === streamId);
  if (!stream || stream.live === false) return null; // la transmisión ya cerró
  if (lots.get(streamId)) return null; // ya hay un lote en el aire, no lo pisamos

  const queue = queues.get(streamId) || [];
  while (queue.length) {
    const nextId = queue.shift();
    const product = db.find('products', (p) => p.id === nextId && p.status !== 'sold');
    if (product) {
      const lot = openLot(stream, product);
      broadcastQueue(streamId);
      return lot;
    }
  }
  broadcastQueue(streamId);
  return null;
}

/** Resuelve el lote: gana, no se vende, o se agota. Devuelve el resumen para el vendedor. */
function settle(streamId, lot, reason) {
  const stream = db.find('streams', (s) => s.id === streamId);
  const seller = db.find('sellers', (s) => s.id === stream?.sellerId);
  const product = db.find('products', (p) => p.id === lot.productId);

  if (lot.mode === 'fixed') {
    if (product && lot.sold >= product.stock) db.update('products', product.id, { status: 'sold', stock: 0 });
    else if (product) db.update('products', product.id, { stock: product.stock, status: 'ready' });
    return {
      type: 'offer_closed',
      lotNo: lot.lotNo,
      productName: lot.productName,
      sold: lot.sold,
      stock: product?.stock ?? 0,
      revenue: lot.sold * lot.price,
      reason,
    };
  }

  // Precio de reserva: si la puja no llegó al mínimo del vendedor, no hay venta.
  if (!lot.leaderId || lot.price < lot.min) {
    return { type: 'no_sale', lotNo: lot.lotNo, productName: lot.productName, min: lot.min, price: lot.price };
  }

  const buyer = db.find('users', (u) => u.id === lot.leaderId);
  const order = createOrder({
    buyer, seller, product,
    amount: lot.price, mode: 'auction', streamId, lotNo: lot.lotNo,
  });
  if (product) db.update('products', product.id, { status: 'sold' });

  hub.emit(`user:${buyer.id}`, 'auction:won', { order });
  hub.emit(`seller:${seller.id}`, 'order:new', { order });
  return { type: 'won', lotNo: lot.lotNo, productName: lot.productName, winnerHandle: buyer.handle, price: lot.price, orderId: order.id };
}

/* ---------------------------------------------------------------- pujas --- */

export function placeBid(streamId, user, amount) {
  const lot = lots.get(streamId);
  if (!lot || lot.mode !== 'auction') return { error: 'No hay una subasta abierta en esta sala.' };
  if (!lot.running) return { error: 'La subasta ya cerró.' };

  const minimum = lot.price + lot.increment;
  if (amount < minimum) return { error: `La siguiente puja es de Bs ${minimum}.` };
  if (lot.leaderId === user.id) return { error: 'Ya vas ganando este lote.' };

  lot.price = amount;
  lot.leaderId = user.id;
  lot.leaderHandle = user.handle;
  lot.timer = BID_WINDOW; // anti-snipe

  broadcastLot(streamId);
  systemMessage(streamId, user.handle, `Pujó Bs ${amount}`);
  return { lot: publicLot(lot) };
}

/* -------------------------------------------------------- precio fijo --- */

export function buyNow(streamId, user) {
  const lot = lots.get(streamId);
  if (!lot || lot.mode !== 'fixed') return { error: 'Este lote no está a precio fijo.' };
  if (!lot.running) return { error: 'La oferta ya cerró.' };
  if (lot.sold >= lot.stock) return { error: 'Se agotaron las unidades.' };

  // Descuento sincrónico: Node es monohilo, así que dos compras no pueden cruzarse acá.
  lot.sold += 1;
  lot.lastBuyerHandle = user.handle;

  const stream = db.find('streams', (s) => s.id === streamId);
  const seller = db.find('sellers', (s) => s.id === stream.sellerId);
  const product = db.find('products', (p) => p.id === lot.productId);

  const order = createOrder({
    buyer: user, seller, product,
    amount: lot.price, mode: 'fixed', streamId, lotNo: lot.lotNo,
  });
  db.update('products', product.id, { stock: Math.max(0, product.stock - 1) });

  broadcastLot(streamId);
  systemMessage(streamId, user.handle, `Compró 1 unidad · Bs ${lot.price}`);
  hub.emit(`seller:${seller.id}`, 'order:new', { order });
  hub.emit(`user:${user.id}`, 'purchase:done', { order });

  if (lot.sold >= lot.stock) setTimeout(() => closeLot(streamId, 'sold_out'), CLOSE_DELAY);
  return { order, lot: publicLot(lot) };
}

/* ----------------------------------------------------------------- reloj --- */

/** Un solo intervalo global de 1s mueve todos los cronómetros. */
export function startClock() {
  return setInterval(() => {
    for (const [streamId, lot] of lots) {
      if (lot.mode !== 'auction' || !lot.running) continue;
      if (lot.timer > 0) {
        lot.timer -= 1;
        hub.emit(`stream:${streamId}`, 'lot:tick', { streamId, timer: lot.timer, price: lot.price });
        continue;
      }
      const outcome = closeLot(streamId, 'timeout');
      const stream = db.find('streams', (s) => s.id === streamId);
      if (stream) hub.emit(`seller:${stream.sellerId}`, 'lot:result', { streamId, outcome });
    }
  }, 1000);
}

export const publicLotOf = (streamId) => publicLot(lots.get(streamId));
export { systemMessage };
