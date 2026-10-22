import React from 'react';

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

/** Segundos que faltan hasta `iso` (0 si ya pasó); se actualiza cada segundo. */
export function useCountdown(iso?: string | null) {
  const compute = React.useCallback(() => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000)) : 0), [iso]);
  const [left, setLeft] = React.useState(compute);
  React.useEffect(() => {
    setLeft(compute());
    const t = setInterval(() => setLeft(compute()), 1000);
    return () => clearInterval(t);
  }, [compute]);
  return left;
}

const TZ = 'America/La_Paz';
/** "3 nov" (con el año si no es el actual: "22 oct 2027"). */
export function shortDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  const otherYear = d.getUTCFullYear() !== new Date().getUTCFullYear();
  return d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short', ...(otherYear ? { year: 'numeric' } : {}), timeZone: TZ }).replace(' de ', ' ');
}
/** "lunes 3 nov" */
export const weekdayDate = (iso?: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'short', timeZone: TZ }).replace(',', '') : '';
/** "hoy 20:30", "mañana 19:00" o "vie 7 nov 19:00" para vivos programados. */
export function whenLabel(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const time = d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: TZ });
  if (day(d) === day(new Date())) return `Hoy ${time}`;
  if (day(d) === day(new Date(Date.now() + 864e5))) return `Mañana ${time}`;
  return `${d.toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ })} ${time}`;
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
