/** Utilidades de texto y dinero compartidas por servicios y rutas. */

export const bs = (cents) => (cents == null ? null : Math.round(cents) / 100);
export const toCents = (bsValue) => {
  const n = Number(String(bsValue ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

export const plain = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const slugify = (s, max = 40) =>
  plain(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max) || 'tienda';

export const handleFrom = (name) =>
  plain(name).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 18) || 'usuario';

export const initialsFrom = (name) =>
  String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'US';

/** Teléfono boliviano: solo dígitos, sin el +591. */
export const normalizePhone = (s) => String(s || '').replace(/\D/g, '').replace(/^591(?=\d{8}$)/, '');

/** Comisión sobre un monto (redondeo al centavo). */
export const commissionOf = (subtotalCents, bp) => Math.round((subtotalCents * bp) / 10000);

export const clampInt = (v, min, max, fallback) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/** Paleta de placeholders cuando un producto o tienda no tiene foto (colores del Brand Kit). */
export const PALETTE = ['#0E7C66', '#0A6350', '#AE5115', '#0A3B31', '#8E4211', '#0E4A3D'];
export const colorFor = (seed) => PALETTE[[...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
