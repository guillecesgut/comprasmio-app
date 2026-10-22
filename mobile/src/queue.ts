import { bs } from './api';

/** Texto de estado de cada fila de la cola ("Vendido · Bs 1.050", "En el aire", "Bs 90 · 6 u."). */
export function queueSub(r: any) {
  if (r.status === 'on_air') return 'En el aire';
  const sold = r.results?.filter((x: any) => x.status === 'sold') || [];
  if (r.mode === 'fijo') {
    if (r.status === 'done') return `Oferta cerrada · ${r.committed} de ${r.qty}`;
    return `${bs(r.price)} · ${r.remaining} u.`;
  }
  if (r.status === 'done' && sold.length) return `Vendido · ${bs(sold[sold.length - 1].price)}${r.qty > 1 ? ` · ${r.committed} de ${r.qty}` : ''}`;
  if (r.status === 'done') return 'Sin venta';
  return `Desde ${bs(r.price)}${r.qty > 1 ? ` · ${r.remaining} u.` : ''}`;
}
