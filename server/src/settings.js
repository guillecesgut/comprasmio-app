import { many, query } from './db.js';

/**
 * Parámetros de negocio editables desde el panel (F12, F13). Los montos y porcentajes de
 * comisión todavía no están cerrados: viven acá y no en el código.
 */
export const DEFAULTS = {
  payment_window_catalog_min: 15,   // D7/D8: minutos para pagar una compra del catálogo
  payment_window_live_min: 5,       // B2/B3: minutos para pagar lo ganado o comprado en un vivo
  auto_deliver_days: 5,             // días tras "Enviado" para dar el pedido por entregado
  payout_cut_weekday: 0,            // 0 = domingo: último día de la semana que se liquida
  payout_pay_weekday: 1,            // 1 = lunes: día en que se transfiere
  payout_min_cents: 0,              // por debajo de esto el saldo pasa a la semana siguiente
  commission_basico_bp: 1500,       // 15 % (pendiente de confirmar)
  commission_premium_bp: 1000,      // 10 %
  premium_price_cents: 29000,       // Bs 290 / mes (pendiente de confirmar)
  premium_days: 30,
  support_whatsapp: '',
  support_email: '',
  platform_name: 'ComprasMío! SRL',
};

let cache = null;
let cacheAt = 0;

export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cacheAt < 10_000) return cache;
  const rows = await many('SELECT key, value FROM settings');
  cache = { ...DEFAULTS };
  for (const row of rows) cache[row.key] = row.value;
  cacheAt = Date.now();
  return cache;
}

export async function setSettings(patch, actorId) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULTS)) continue;
    const kind = typeof DEFAULTS[key];
    if (kind === 'number' && !(Number.isFinite(Number(value)) && Number(value) >= 0)) {
      throw Object.assign(new Error(`Valor inválido para ${key}.`), { status: 400 });
    }
    const normalized = kind === 'number' ? Number(value) : String(value);
    await query(
      `INSERT INTO settings(key, value, updated_by, updated_at) VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, JSON.stringify(normalized), actorId || null]
    );
  }
  cache = null;
  return getSettings({ fresh: true });
}

/** Comisión que corresponde a un vendedor según su plan vigente (o una comisión especial). */
export function commissionBpFor(seller, settings) {
  if (seller.commission_bp_override != null) return seller.commission_bp_override;
  return isPremium(seller) ? settings.commission_premium_bp : settings.commission_basico_bp;
}

export const isPremium = (seller) =>
  seller.plan === 'premium' && seller.plan_until && new Date(seller.plan_until) > new Date();
