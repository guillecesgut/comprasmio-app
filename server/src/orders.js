import * as db from './db.js';

/**
 * Ciclo de vida de una orden:
 *   pendiente_pago  → el comprador ganó o compró, todavía no envió comprobante
 *   en_revision     → adjuntó el comprobante, el vendedor tiene que verificarlo
 *   verificado      → el vendedor confirmó que el dinero llegó
 *   enviado         → despachado
 */
export const STATUS = {
  PENDING: 'pendiente_pago',
  REVIEW: 'en_revision',
  VERIFIED: 'verificado',
  SHIPPED: 'enviado',
};

export const STATUS_LABEL = {
  [STATUS.PENDING]: 'Falta pagar',
  [STATUS.REVIEW]: 'Pago en revisión',
  [STATUS.VERIFIED]: 'Pago verificado',
  [STATUS.SHIPPED]: 'Enviado',
};

const NEXT = {
  [STATUS.PENDING]: [STATUS.REVIEW],
  [STATUS.REVIEW]: [STATUS.VERIFIED],
  [STATUS.VERIFIED]: [STATUS.SHIPPED],
  [STATUS.SHIPPED]: [],
};

export function canTransition(from, to) {
  return (NEXT[from] || []).includes(to);
}

/**
 * El envío nunca se cobra por la plataforma: tiene dos modalidades definidas
 * por el vendedor al crear el producto.
 *   free      → el vendedor lo asume, no se cobra nada
 *   arranged  → se coordina el costo directo con el comprador, por chat
 */
export function createOrder({ buyer, seller, product, amount, mode, streamId, lotNo }) {
  const order = {
    id: db.id('ord'),
    ref: db.nextOrderRef(),
    buyerId: buyer.id,
    buyerHandle: buyer.handle,
    sellerId: seller.id,
    sellerName: seller.name,
    productId: product.id,
    productName: product.name,
    grad: product.grad,
    mode,
    streamId: streamId || null,
    lotNo: lotNo || null,
    amount,
    shipping: 0,
    shippingMode: product.shipping, // 'free' | 'arranged'
    total: amount,
    status: STATUS.PENDING,
    receiptUrl: null,
    createdAt: new Date().toISOString(),
    verifiedAt: null,
    shippedAt: null,
  };
  return db.insert('orders', order);
}

export function attachReceipt(order, receiptUrl) {
  return db.update('orders', order.id, {
    receiptUrl,
    status: STATUS.REVIEW,
    submittedAt: new Date().toISOString(),
  });
}

export function verifyPayment(order) {
  return db.update('orders', order.id, {
    status: STATUS.VERIFIED,
    verifiedAt: new Date().toISOString(),
  });
}

export function markShipped(order) {
  return db.update('orders', order.id, {
    status: STATUS.SHIPPED,
    shippedAt: new Date().toISOString(),
  });
}

/** Agregados para la sección Ventas del dashboard. */
export function salesSummary(sellerId) {
  const all = db.filter('orders', (o) => o.sellerId === sellerId);
  const settled = all.filter((o) => o.status === STATUS.VERIFIED || o.status === STATUS.SHIPPED);
  const pending = all.filter((o) => o.status === STATUS.PENDING || o.status === STATUS.REVIEW);
  const net = settled.reduce((sum, o) => sum + o.amount, 0);
  return {
    net,
    pending: pending.reduce((sum, o) => sum + o.amount, 0),
    averageTicket: settled.length ? Math.round(net / settled.length) : 0,
    countSettled: settled.length,
    countPending: pending.length,
    byMode: {
      auction: settled.filter((o) => o.mode === 'auction').reduce((s, o) => s + o.amount, 0),
      fixed: settled.filter((o) => o.mode === 'fixed').reduce((s, o) => s + o.amount, 0),
    },
  };
}
