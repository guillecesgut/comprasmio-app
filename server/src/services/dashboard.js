import { one, many } from '../db.js';
import { getSettings, commissionBpFor } from '../settings.js';
import { bs } from '../util.js';
import { boliviaDate, periodFor } from './payouts.js';

const PAID = `('pagado','preparando','enviado','entregado','en_reclamo')`;

/** Rango del segmentado Hoy | Semana | Mes, en fechas de Bolivia. */
function range(period) {
  const today = boliviaDate();
  const d = new Date(`${today}T12:00:00Z`);
  if (period === 'hoy') return { from: today, days: 1 };
  if (period === 'mes') return { from: `${today.slice(0, 8)}01`, days: d.getUTCDate() };
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  const start = new Date(d.getTime() - dow * 864e5).toISOString().slice(0, 10);
  return { from: start, days: dow + 1 };
}

/** C1 · Resumen del vendedor. */
export async function sellerSummary(sellerId, period = 'semana') {
  const settings = await getSettings();
  const seller = await one('SELECT * FROM sellers WHERE id = $1', [sellerId]);
  const r = range(period);
  const sales = await many(
    `SELECT to_char(paid_at AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD') AS day,
            SUM(CASE WHEN channel = 'catalogo' THEN subtotal_cents ELSE 0 END)::int AS catalogo,
            SUM(CASE WHEN channel <> 'catalogo' THEN subtotal_cents ELSE 0 END)::int AS vivo,
            count(*)::int AS orders
     FROM orders WHERE seller_id = $1 AND status IN ${PAID}
       AND (paid_at AT TIME ZONE 'America/La_Paz')::date >= $2::date
     GROUP BY 1 ORDER BY 1`,
    [sellerId, r.from]
  );
  const days = [];
  for (let i = 0; i < Math.max(r.days, period === 'semana' ? 7 : r.days); i++) {
    const day = new Date(new Date(`${r.from}T12:00:00Z`).getTime() + i * 864e5).toISOString().slice(0, 10);
    const row = sales.find((s) => s.day === day);
    days.push({ day, catalogo: bs(row?.catalogo || 0), vivo: bs(row?.vivo || 0) });
  }
  const totalCatalogo = sales.reduce((s, x) => s + x.catalogo, 0);
  const totalVivo = sales.reduce((s, x) => s + x.vivo, 0);

  const [toPrepare, accumulating, scheduled, monthCommission, reviews] = await Promise.all([
    one(`SELECT count(*)::int AS n FROM orders WHERE seller_id = $1 AND status IN ('pagado','preparando')`, [sellerId]),
    one(`SELECT COALESCE(SUM(total_cents - commission_cents), 0)::int AS net FROM orders WHERE seller_id = $1 AND status = 'entregado' AND payout_id IS NULL`, [sellerId]),
    one(`SELECT net_cents, scheduled_for FROM payouts WHERE seller_id = $1 AND status = 'programada' ORDER BY scheduled_for LIMIT 1`, [sellerId]),
    one(
      `SELECT COALESCE(SUM(commission_cents), 0)::int AS cents FROM orders WHERE seller_id = $1 AND status IN ${PAID}
         AND date_trunc('month', paid_at AT TIME ZONE 'America/La_Paz') = date_trunc('month', now() AT TIME ZONE 'America/La_Paz')`,
      [sellerId]
    ),
    one('SELECT count(*) FILTER (WHERE reply IS NULL)::int AS unanswered FROM reviews WHERE seller_id = $1', [sellerId]),
  ]);
  const next = scheduled ? { net: bs(scheduled.net_cents), date: scheduled.scheduled_for } : { net: bs(accumulating.net), date: periodFor(new Date(), settings).payOn };
  return {
    storeName: seller.name,
    period,
    sales: { total: bs(totalCatalogo + totalVivo), catalogo: bs(totalCatalogo), vivo: bs(totalVivo), orders: sales.reduce((s, x) => s + x.orders, 0), days },
    nextPayout: next,
    toPrepare: toPrepare.n,
    monthCommission: { amount: bs(monthCommission.cents), pct: commissionBpFor(seller, settings) / 100 },
    reviews: { avg: seller.rating_avg, count: seller.rating_count, unanswered: reviews.unanswered },
  };
}

/** F1 · Inicio del panel. */
export async function adminDashboard() {
  const settings = await getSettings();
  const [toVerify, oldest, claims, week, byDay, attention] = await Promise.all([
    one(`SELECT count(*)::int AS n, COALESCE(SUM(amount_cents), 0)::int AS cents FROM payments WHERE status = 'in_review'`),
    one(`SELECT min(receipt_at) AS at FROM payments WHERE status = 'in_review'`),
    one(`SELECT count(*)::int AS n FROM claims WHERE status IN ('abierto', 'esperando_vendedor')`),
    one(
      `SELECT COALESCE(SUM(subtotal_cents), 0)::int AS sales, COALESCE(SUM(commission_cents), 0)::int AS commission, count(*)::int AS orders
       FROM orders WHERE status IN ${PAID} AND paid_at > now() - interval '7 days'`
    ),
    many(
      `SELECT to_char(paid_at AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD') AS day,
         SUM(CASE WHEN channel = 'catalogo' THEN subtotal_cents ELSE 0 END)::int AS catalogo,
         SUM(CASE WHEN channel <> 'catalogo' THEN subtotal_cents ELSE 0 END)::int AS vivo
       FROM orders WHERE status IN ${PAID} AND paid_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1`
    ),
    many(
      `(SELECT 'pago' AS kind, id, ref AS label, receipt_at AS at FROM payments WHERE status = 'in_review' AND receipt_at < now() - interval '2 hours')
       UNION ALL
       (SELECT 'reclamo', c.id, o.ref, c.created_at FROM claims c JOIN orders o ON o.id = c.order_id
        WHERE c.status IN ('abierto','esperando_vendedor') AND c.created_at < now() - interval '48 hours')
       ORDER BY at LIMIT 20`
    ),
  ]);
  const scheduled = await one(
    `SELECT min(scheduled_for) AS date, COALESCE(SUM(net_cents), 0)::int AS cents, count(*)::int AS sellers FROM payouts WHERE status = 'programada'`
  );
  return {
    toVerify: { count: toVerify.n, amount: bs(toVerify.cents), oldestAt: oldest.at },
    nextPayout: { date: scheduled.date || periodFor(new Date(), settings).payOn, amount: bs(scheduled.cents), sellers: scheduled.sellers },
    openClaims: claims.n,
    week: { sales: bs(week.sales), commission: bs(week.commission), orders: week.orders },
    byDay: byDay.map((d) => ({ day: d.day, catalogo: bs(d.catalogo), vivo: bs(d.vivo) })),
    attention: [
      ...attention.map((a) => ({ kind: a.kind, id: a.id, label: a.label, at: a.at })),
    ],
  };
}
