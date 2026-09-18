import React from 'react';
import { api, bs } from '../../api';
import { SectionTitle, ErrorNote, Empty } from '../../components/shared';

export function Overview({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.overview().then(setData).catch((e) => setError(e.message));
  }, [refreshKey]);

  const kpis = data?.kpis;
  const week: { day: string; total: number }[] = data?.week || [];
  const maxDay = Math.max(1, ...week.map((d) => d.total));

  const cards = [
    { label: 'Ingresos verificados', value: bs(kpis?.revenue ?? 0), dark: true },
    { label: 'Pendiente de verificar', value: bs(kpis?.pending ?? 0), tone: 'var(--orange-d)' },
    { label: 'Órdenes', value: String(kpis?.orders ?? 0) },
    { label: 'Ticket promedio', value: bs(kpis?.averageTicket ?? 0) },
  ];

  return (
    <>
      <SectionTitle title="Resumen" subtitle="Cómo viene tu operación en vivo" />
      <ErrorNote message={error} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        {cards.map((card) => (
          <div
            key={card.label}
            className="card"
            style={{ padding: 18, background: card.dark ? 'var(--green-d)' : undefined, border: card.dark ? 'none' : undefined }}
          >
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500, color: card.dark ? 'rgba(255,253,250,.72)' : 'var(--muted)' }}>{card.label}</p>
            <p style={{ margin: '6px 0 0', fontSize: 30, fontWeight: 700, letterSpacing: '-.4px', color: card.dark ? 'var(--card)' : card.tone || 'var(--ink)' }}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600 }}>Ingresos de la semana</h3>
          <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--muted)' }}>Subastas y precio fijo juntos</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 170 }}>
            {week.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{d.total ? bs(d.total).replace('Bs ', '') : ''}</span>
                <div
                  title={`${d.day}: ${bs(d.total)}`}
                  style={{ width: '100%', height: Math.max(4, (d.total / maxDay) * 118), borderRadius: 7, background: d.total ? 'var(--green)' : 'var(--sand)' }}
                />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600 }}>Ingresos por forma de venta</h3>
          {(['fixed', 'auction'] as const).map((mode) => {
            const value = data?.byMode?.[mode] ?? 0;
            const total = (data?.byMode?.fixed ?? 0) + (data?.byMode?.auction ?? 0);
            return (
              <div key={mode} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13.5 }}>
                  <span>{mode === 'fixed' ? 'Precio fijo' : 'Subasta'}</span>
                  <strong>{bs(value)}</strong>
                </div>
                <div className="progress">
                  <div style={{ width: `${total ? (value / total) * 100 : 0}%`, background: mode === 'fixed' ? 'var(--green)' : 'var(--orange)' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid-auto-md" style={{ marginTop: 14 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600 }}>Lo que más se vende</h3>
          {(data?.topProducts || []).length === 0 ? (
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)' }}>Todavía no hay ventas registradas.</p>
          ) : (
            data.topProducts.map((product: any) => {
              const max = data.topProducts[0].revenue || 1;
              return (
                <div key={product.name} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 6 }}>
                    <span>{product.name}</span>
                    <strong style={{ color: 'var(--green-d)' }}>{bs(product.revenue)}</strong>
                  </div>
                  <div className="progress"><div style={{ width: `${(product.revenue / max) * 100}%` }} /></div>
                </div>
              );
            })
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600 }}>Mejores compradores</h3>
          {(data?.topBuyers || []).length === 0 ? (
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)' }}>Cuando vendas, tus compradores aparecen acá.</p>
          ) : (
            data.topBuyers.map((buyer: any) => (
              <div key={buyer.handle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 13.5, color: 'var(--green-d)', fontWeight: 500 }}>@{buyer.handle}</span>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{buyer.orders} órdenes · <strong style={{ color: 'var(--ink)' }}>{bs(buyer.spend)}</strong></span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
