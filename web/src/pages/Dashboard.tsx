import { Link } from 'react-router-dom';
import { api, bs, diaSemana, hace, fecha } from '../api';
import { useSession } from '../session';
import { Chip, Empty, ErrorLine, PageHead, useLoad } from '../ui';

type Dash = {
  toVerify: { count: number; amount: number; oldestAt: string | null };
  nextPayout: { date: string; amount: number; sellers: number };
  openClaims: number;
  week: { sales: number; commission: number; orders: number };
  byDay: { day: string; catalogo: number; vivo: number }[];
  attention: { kind: 'pago' | 'reclamo'; id: string; label: string; at: string }[];
};

/** Últimos 14 días, rellenando los días sin ventas. */
function last14(byDay: Dash['byDay']) {
  const out: Dash['byDay'] = [];
  const today = new Date(Date.now() - 4 * 3600_000);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400_000).toISOString().slice(0, 10);
    out.push(byDay.find((x) => x.day === d) || { day: d, catalogo: 0, vivo: 0 });
  }
  return out;
}

const ATTENTION = {
  pago: { label: 'Pago esperando más de 2 h', to: '/pagos', tone: 'amber' },
  reclamo: { label: 'Reclamo abierto más de 48 h', to: '/reclamos', tone: 'red' },
} as const;

export default function Dashboard() {
  const { user } = useSession();
  const { data, error } = useLoad<Dash>(() => api.get('/dashboard'));
  if (error) return <ErrorLine error={error} />;
  if (!data) return <Empty>Cargando…</Empty>;
  const days = last14(data.byDay);
  const max = Math.max(1, ...days.map((d) => d.catalogo + d.vivo));

  return (
    <>
      <PageHead title={`Hola, ${user?.name.split(' ')[0]}`} subtitle="Resumen de la operación de hoy." />
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <Link to="/pagos" className={`kpi${data.toVerify.count ? ' warn' : ''}`}>
          <span>Pagos por verificar</span>
          <strong>{data.toVerify.count}</strong>
          <em>{bs(data.toVerify.amount)}{data.toVerify.oldestAt && ` · el más antiguo ${hace(data.toVerify.oldestAt)}`}</em>
        </Link>
        <Link to="/liquidaciones" className="kpi dark">
          <span>Próxima liquidación</span>
          <strong>{bs(data.nextPayout.amount)}</strong>
          <em>{diaSemana(data.nextPayout.date)} · {data.nextPayout.sellers} vendedores</em>
        </Link>
        <Link to="/reclamos" className="kpi">
          <span>Reclamos abiertos</span>
          <strong>{data.openClaims}</strong>
          <em>Retienen el pago del vendedor</em>
        </Link>
        <div className="kpi">
          <span>Ventas · últimos 7 días</span>
          <strong>{bs(data.week.sales)}</strong>
          <em>{data.week.orders} pedidos · comisión {bs(data.week.commission)}</em>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Ventas por día</h2>
          <div className="bars" role="img" aria-label="Ventas de los últimos 14 días, catálogo y en vivo">
            {days.map((d) => (
              <div className="bar" key={d.day} title={`${fecha(d.day)} · catálogo ${bs(d.catalogo)} · en vivo ${bs(d.vivo)}`}>
                {d.vivo > 0 && <div className="seg-live" style={{ height: (d.vivo / max) * 110 }} />}
                <div className="seg-cat" style={{ height: Math.max(2, (d.catalogo / max) * 110), opacity: d.catalogo ? 1 : 0.25 }} />
                <small>{Number(d.day.slice(8))}</small>
              </div>
            ))}
          </div>
          <div className="legend" style={{ marginTop: 10 }}>
            <span><i style={{ background: 'var(--green)' }} />Catálogo</span>
            <span><i style={{ background: 'var(--amber)' }} />En vivo</span>
          </div>
        </section>

        <section className="card">
          <h2>Necesita atención</h2>
          {data.attention.length === 0 ? (
            <p className="muted">Todo al día. No hay pagos ni reclamos demorados.</p>
          ) : (
            <ul className="timeline">
              {data.attention.map((a) => {
                const meta = ATTENTION[a.kind];
                return (
                  <li key={`${a.kind}-${a.id}`} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                    <div>
                      <Link to={meta.to}><strong>{a.label}</strong></Link>
                      <div className="small muted">{hace(a.at)}</div>
                    </div>
                    <Chip tone={meta.tone}>{meta.label}</Chip>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
