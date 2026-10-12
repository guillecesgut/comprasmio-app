import React from 'react';
import { bs } from './api';

/** "Desde Bs 600 · mín. Bs 750" (subasta) / "Bs 90 · 12 u." (precio fijo). */
export const priceLine = (p: any) =>
  p.mode === 'fixed' ? `${bs(p.price)} · ${p.stock} u.` : `Desde ${bs(p.start)} · mín. ${bs(p.min)}`;

export const initialsOf = (name?: string) =>
  (name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

/** "recién", "hace 3 min", "hace 2 h", "ayer", "hace 4 días". */
export function ago(iso?: string) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

/** Hora corta para listas de chat: "14:05" hoy, "ayer", o "12 oct". */
export function shortTime(iso?: string) {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString())
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'ayer';
  return date.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
}

export const PAY_WINDOW_MS = 5 * 60 * 1000;

/** Segundos que quedan para pagar una orden (5 min desde que se creó). */
export function useCountdown(fromIso?: string, windowMs = PAY_WINDOW_MS) {
  const compute = React.useCallback(
    () => (fromIso ? Math.max(0, Math.ceil((new Date(fromIso).getTime() + windowMs - Date.now()) / 1000)) : 0),
    [fromIso, windowMs]
  );
  const [left, setLeft] = React.useState(compute);
  React.useEffect(() => {
    setLeft(compute());
    const t = setInterval(() => setLeft(compute()), 1000);
    return () => clearInterval(t);
  }, [compute]);
  return left;
}

/** Cronómetro ascendente para "AL AIRE · 24:08". */
export function useElapsed(running: boolean) {
  const [start] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return Math.floor((now - start) / 1000);
}
