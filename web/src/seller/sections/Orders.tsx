import React from 'react';
import { api, bs, Mode, STATUS_TABS } from '../../api';
import { SectionTitle, ErrorNote, Empty, ModeChip, Thumb, Badge, Icon } from '../../components/shared';

const COLUMNS = '110px 2.2fr 1fr 1fr 1.2fr 130px';
const SALES_COLUMNS = '110px 2fr 1fr 1fr 1fr';

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' });

export function Orders({ refreshKey, onChange }: { refreshKey: number; onChange: () => void }) {
  const [tab, setTab] = React.useState<string>('todas');
  const [orders, setOrders] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    api.sellerOrders(tab).then(({ orders }) => setOrders(orders)).catch((e) => setError(e.message));
  }, [tab]);

  React.useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (order: any, action: 'verify' | 'ship') => {
    setBusyId(order.id);
    setError(null);
    try {
      await (action === 'verify' ? api.verifyOrder(order.id) : api.shipOrder(order.id));
      load();
      onChange();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <SectionTitle title="Órdenes" subtitle="Todo se paga por QR: verificá el comprobante antes de despachar" />
      <ErrorNote message={error} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((option) => {
          const active = tab === option.key;
          return (
            <button
              key={option.key}
              onClick={() => setTab(option.key)}
              aria-pressed={active}
              style={{
                height: 36, padding: '0 14px', borderRadius: 11, fontSize: 13, fontWeight: 500,
                border: `1px solid ${active ? 'var(--green-forest)' : 'var(--line)'}`,
                background: active ? 'var(--green-forest)' : 'var(--card)',
                color: active ? 'var(--card)' : 'var(--muted)',
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <Empty
          title="No hay órdenes en este filtro"
          body="Las compras de tus vivos aparecen acá apenas alguien gana un lote o compra a precio fijo."
        />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-head" style={{ '--cols': COLUMNS } as React.CSSProperties}>
            <span>Orden</span><span>Producto</span><span>Comprador</span><span>Monto</span><span>Estado</span><span />
          </div>
          {orders.map((order) => (
            <div key={order.id} className="table-row" style={{ '--cols': COLUMNS } as React.CSSProperties}>
              <span data-label="Orden" className="mono" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{order.ref}</span>

              <div className="row-header" style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <Thumb grad={order.grad} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.productName}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <ModeChip mode={order.mode as Mode} />
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fecha(order.createdAt)}</span>
                  </div>
                </div>
              </div>

              <span data-label="Comprador" style={{ color: 'var(--green-d)', fontWeight: 500 }}>@{order.buyerHandle}</span>

              <div data-label="Monto" style={{ lineHeight: 1.4, textAlign: 'right' }}>
                <div style={{ fontWeight: 600 }}>{bs(order.total)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>+ {bs(order.shipping)} envío</div>
              </div>

              <div data-label="Estado" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge status={order.status} label={order.statusLabel} />
                {order.receiptUrl && (
                  <a
                    href={order.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12.5, color: 'var(--green)', fontWeight: 500 }}
                  >
                    Ver comprobante
                  </a>
                )}
              </div>

              <div data-label="Acciones">
                {order.status === 'en_revision' && (
                  <button className="btn btn--sm" disabled={busyId === order.id} onClick={() => act(order, 'verify')}>
                    Verificar pago
                  </button>
                )}
                {order.status === 'verificado' && (
                  <button className="btn btn--sm btn--outline" disabled={busyId === order.id} onClick={() => act(order, 'ship')}>
                    Marcar enviado
                  </button>
                )}
                {order.status === 'pendiente_pago' && (
                  <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Esperando comprobante</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function Sales({ refreshKey }: { refreshKey: number }) {
  const [summary, setSummary] = React.useState<any>(null);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.summary().then(({ summary }) => setSummary(summary)).catch((e) => setError(e.message));
    api.sellerOrders().then(({ orders }) => setOrders(orders)).catch(() => {});
  }, [refreshKey]);

  const cards = [
    { label: 'Ingresos netos', value: bs(summary?.net ?? 0), background: 'var(--green-d)', color: 'var(--card)' },
    { label: 'Pendiente de verificar', value: bs(summary?.pending ?? 0), color: 'var(--orange-d)' },
    { label: 'Ticket promedio', value: bs(summary?.averageTicket ?? 0) },
  ];

  return (
    <>
      <SectionTitle title="Ventas" subtitle="Detalle de ingresos por subasta y precio fijo" />
      <ErrorNote message={error} />

      <div className="grid-auto-md" style={{ marginBottom: 14 }}>
        {cards.map((card) => (
          <div key={card.label} className="card" style={{ padding: 18, background: card.background, border: card.background ? 'none' : undefined }}>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500, color: card.background ? 'rgba(255,253,250,.72)' : 'var(--muted)' }}>{card.label}</p>
            <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 700, letterSpacing: '-.4px', color: card.color || 'var(--ink)' }}>{card.value}</p>
          </div>
        ))}
      </div>

      {orders.length === 0 ? (
        <Empty title="Sin movimientos todavía" body="Cuando cierres tu primer lote, el detalle de ingresos aparece acá." />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-head" style={{ '--cols': SALES_COLUMNS } as React.CSSProperties}>
            <span>Orden</span><span>Producto</span><span>Forma de venta</span><span>Fecha</span><span>Ingreso</span>
          </div>
          {orders.map((order) => (
            <div key={order.id} className="table-row" style={{ '--cols': SALES_COLUMNS } as React.CSSProperties}>
              <span data-label="Orden" className="mono" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{order.ref}</span>
              <span data-label="Producto" style={{ fontWeight: 500 }}>{order.productName}</span>
              <span data-label="Forma de venta"><ModeChip mode={order.mode as Mode} /></span>
              <span data-label="Fecha" style={{ color: 'var(--muted)' }}>{fecha(order.createdAt)}</span>
              <span
                data-label="Ingreso"
                style={{ fontWeight: 600, color: order.status === 'pendiente_pago' || order.status === 'en_revision' ? 'var(--orange-d)' : 'var(--green-d)' }}
              >
                {bs(order.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
