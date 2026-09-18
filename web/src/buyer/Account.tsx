import React from 'react';
import { Link } from 'react-router-dom';
import { api, bs, realtime } from '../api';
import { useSession } from '../session';
import { Icon, ModeChip, Badge, Empty, ErrorNote, SectionTitle } from '../components/shared';
import { PayDialog } from './Pay';

export function Orders() {
  const [orders, setOrders] = React.useState<any[]>([]);
  const [pay, setPay] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    api.orders().then(({ orders }) => setOrders(orders)).catch((e) => setError(e.message));
  }, []);

  React.useEffect(() => {
    load();
    // Cuando el vendedor verifica un pago, la fila cambia sola.
    return realtime.on('order:update', ({ order }) =>
      setOrders((current) => current.map((o) => (o.id === order.id ? order : o)))
    );
  }, [load]);

  return (
    <>
      <SectionTitle title="Mis compras" subtitle="Todo se paga por transferencia QR" />
      <ErrorNote message={error} />

      {orders.length === 0 ? (
        <Empty
          title="Todavía no compraste nada"
          body="Entrá a un vivo y comprá al toque, o pujá por un lote."
          action={<Link to="/" className="btn" style={{ textDecoration: 'none', display: 'inline-block', lineHeight: '44px' }}>Ver transmisiones</Link>}
        />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {orders.map((order) => (
            <div key={order.id} className="card" style={{ padding: 14, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div className="thumb" style={{ width: 56, height: 56, background: order.grad || 'var(--green)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong style={{ fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.productName}
                  </strong>
                  <strong style={{ color: 'var(--green-d)', flex: 'none' }}>{bs(order.total)}</strong>
                </div>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--muted)' }}>{order.sellerName}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9, flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{order.ref}</span>
                  <ModeChip mode={order.mode} />
                  <Badge status={order.status} label={order.statusLabel} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 11, flexWrap: 'wrap' }}>
                  {order.status === 'pendiente_pago' && (
                    <button className="btn btn--sm btn--orange" onClick={() => setPay(order)}>
                      Subir comprobante
                    </button>
                  )}
                  <Link to={`/mensajes/${order.sellerId}`} style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--green-d)' }}>
                    Escribir al vendedor
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pay && (
        <PayDialog
          order={pay}
          onClose={() => {
            setPay(null);
            load();
          }}
        />
      )}
    </>
  );
}

export function Favorites() {
  const { favorites } = useSession();
  const [streams, setStreams] = React.useState<any[]>([]);

  React.useEffect(() => {
    api.streams('all').then(({ streams }) => setStreams(streams)).catch(() => {});
  }, []);

  const saved = streams.filter((s) => favorites.includes(s.id));

  return (
    <>
      <SectionTitle title="Favoritos" subtitle="Los vendedores que seguís" />
      {saved.length === 0 ? (
        <Empty title="Sin favoritos todavía" body="Tocá el corazón en cualquier transmisión para tenerla a mano acá." />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {saved.map((stream) => (
            <Link
              key={stream.id}
              to={`/vivo/${stream.id}`}
              className="card"
              style={{ padding: 14, display: 'flex', gap: 14, alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
            >
              <div className="thumb" style={{ width: 52, height: 52, background: stream.grad }} />
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 14.5 }}>{stream.seller?.name}</strong>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: stream.live ? 'var(--orange-d)' : 'var(--muted)' }}>
                  {stream.live ? 'En vivo ahora' : 'Sin transmisión'}
                </p>
              </div>
              <Icon name="chevron" size={18} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

