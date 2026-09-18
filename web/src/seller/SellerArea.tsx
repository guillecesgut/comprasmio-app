import React from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { api, realtime } from '../api';
import { useSession } from '../session';
import { Icon } from '../components/shared';
import { Overview } from './sections/Overview';
import { Products } from './sections/Products';
import { Orders, Sales } from './sections/Orders';
import { Customers } from './sections/Customers';
import { Broadcast } from './Broadcast';
import { LineupPicker } from './LineupPicker';

const NAV = [
  { to: '', label: 'Resumen', icon: 'chart' as const, end: true },
  { to: 'productos', label: 'Productos', icon: 'box' as const },
  { to: 'ordenes', label: 'Órdenes', icon: 'bag' as const },
  { to: 'ventas', label: 'Ventas', icon: 'wallet' as const },
  { to: 'clientes', label: 'Clientes', icon: 'users' as const },
];

export function SellerArea() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [pending, setPending] = React.useState(0);
  const [picking, setPicking] = React.useState(false);

  const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

  React.useEffect(() => {
    const offNew = realtime.on('order:new', refresh);
    const offUpdate = realtime.on('order:update', refresh);
    return () => {
      offNew();
      offUpdate();
    };
  }, [refresh]);

  React.useEffect(() => {
    api.sellerOrders('en_revision').then(({ orders }) => setPending(orders.length)).catch(() => {});
  }, [refreshKey]);

  /** Crea la transmisión y, si el vendedor eligió productos, arma la cola con ellos. */
  const goLive = async (productIds: string[]) => {
    const { stream } = await api.startStream({ title: `${user?.name} en vivo` });
    if (productIds.length) await api.setQueue(stream.id, productIds);
    setPicking(false);
    navigate(`/vender/transmitir/${stream.id}`);
  };

  return (
    <Routes>
      <Route path="transmitir/:id" element={<Broadcast />} />
      <Route
        path="*"
        element={
          <div className="seller">
            <aside className="seller__nav">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `seller__link${isActive ? ' is-active' : ''}`}
                >
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                  {item.to === 'ordenes' && pending > 0 && <span className="seller__badge">{pending}</span>}
                </NavLink>
              ))}
              <button className="btn btn--orange" onClick={() => setPicking(true)} style={{ marginTop: 10, width: '100%' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="video" size={17} /> Transmitir
                </span>
              </button>
            </aside>

            <section className="seller__body">
              <Routes>
                <Route index element={<Overview refreshKey={refreshKey} />} />
                <Route path="productos" element={<Products refreshKey={refreshKey} onChange={refresh} />} />
                <Route path="ordenes" element={<Orders refreshKey={refreshKey} onChange={refresh} />} />
                <Route path="ventas" element={<Sales refreshKey={refreshKey} />} />
                <Route path="clientes" element={<Customers refreshKey={refreshKey} />} />
                <Route path="*" element={<Navigate to="/vender" replace />} />
              </Routes>
            </section>

            {picking && <LineupPicker onClose={() => setPicking(false)} onStart={goLive} />}
          </div>
        }
      />
    </Routes>
  );
}
