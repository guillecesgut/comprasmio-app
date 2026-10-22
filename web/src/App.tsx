import React from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, onSocket } from './api';
import { useSession } from './session';
import { ErrorLine } from './ui';
import Dashboard from './pages/Dashboard';
import Payments from './pages/Payments';
import Orders from './pages/Orders';
import Payouts from './pages/Payouts';
import Claims from './pages/Claims';
import { Sellers, Buyers, Subscriptions } from './pages/People';
import { Moderation, Categories, Banners } from './pages/Content';
import { Plans, Config, Team, Audit } from './pages/Settings';

type Counts = { payments: number; claims: number };

/** Ítems de la barra lateral por grupo; `roles` vacío = visible para todo el equipo. */
const NAV: { group: string; items: { to: string; label: string; roles: string[]; count?: keyof Counts }[] }[] = [
  {
    group: 'Operación',
    items: [
      { to: '/', label: 'Inicio', roles: [] },
      { to: '/pagos', label: 'Pagos por verificar', roles: ['pagos'], count: 'payments' },
      { to: '/pedidos', label: 'Pedidos', roles: ['pagos'] },
      { to: '/liquidaciones', label: 'Liquidaciones', roles: ['pagos'] },
      { to: '/reclamos', label: 'Reclamos', roles: ['pagos'], count: 'claims' },
    ],
  },
  {
    group: 'Personas',
    items: [
      { to: '/vendedores', label: 'Vendedores', roles: ['pagos', 'moderador'] },
      { to: '/compradores', label: 'Compradores', roles: ['moderador'] },
      { to: '/suscripciones', label: 'Suscripciones', roles: ['pagos'] },
    ],
  },
  {
    group: 'Contenido',
    items: [
      { to: '/moderacion', label: 'Catálogo y reportes', roles: ['moderador'] },
      { to: '/categorias', label: 'Categorías', roles: ['moderador'] },
      { to: '/banners', label: 'Banners y destacados', roles: ['moderador'] },
    ],
  },
  {
    group: 'Ajustes',
    items: [
      { to: '/planes', label: 'Planes y comisiones', roles: ['__admin'] },
      { to: '/configuracion', label: 'Configuración y QR', roles: ['__admin'] },
      { to: '/equipo', label: 'Equipo', roles: ['__admin'] },
      { to: '/registro', label: 'Registro de cambios', roles: ['__admin'] },
    ],
  },
];

const ROLE_LABEL: Record<string, string> = { admin: 'Administración', pagos: 'Pagos', moderador: 'Moderación' };

function Login() {
  const { login } = useSession();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="login">
      <form onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try { await login(email, password); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
      }}>
        <div>
          <div className="wordmark" style={{ color: 'var(--forest)' }}>ComprasMío<b>!</b></div>
          <p className="muted">Panel del equipo</p>
        </div>
        <label className="field"><span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field"><span>Contraseña</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <ErrorLine error={error} />
        <button className="btn primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, can } = useSession();
  const [counts, setCounts] = React.useState<Counts>({ payments: 0, claims: 0 });

  const refresh = React.useCallback(() => {
    api.get('/dashboard').then((d) => setCounts({ payments: d.toVerify.count, claims: d.openClaims })).catch(() => {});
  }, []);
  React.useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 60_000);
    const off = [onSocket('payment:new', refresh), onSocket('claim:new', refresh), onSocket('admin:refresh', refresh)];
    window.addEventListener('admin:changed', refresh);
    return () => { window.clearInterval(t); off.forEach((f) => f()); window.removeEventListener('admin:changed', refresh); };
  }, [refresh]);

  const visible = (roles: string[]) =>
    roles.length === 0 || (roles.includes('__admin') ? user?.adminRole === 'admin' : can(...roles));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div>
            <div className="wordmark">ComprasMío<b>!</b></div>
            <small>Panel</small>
          </div>
        </div>
        <nav aria-label="Secciones" className="stack" style={{ gap: 16 }}>
          {NAV.map((g) => {
            const items = g.items.filter((i) => visible(i.roles));
            if (!items.length) return null;
            return (
              <div className="nav-group" key={g.group}>
                <span>{g.group}</span>
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                    {i.label}
                    {i.count && counts[i.count] > 0 && <span className="nav-count">{counts[i.count]}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div><strong style={{ color: '#FFFDFA' }}>{user?.name}</strong><br />{ROLE_LABEL[user?.adminRole || 'admin']}</div>
          <button type="button" onClick={logout}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export default function App() {
  const { user, loading, can } = useSession();
  if (loading) return <div className="empty">Cargando…</div>;
  if (!user) return <Login />;
  const isAdmin = user.adminRole === 'admin';
  const guard = (ok: boolean, el: React.ReactElement) => (ok ? el : <Navigate to="/" replace />);
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pagos" element={guard(can('pagos'), <Payments />)} />
        <Route path="/pedidos" element={guard(can('pagos'), <Orders />)} />
        <Route path="/liquidaciones" element={guard(can('pagos'), <Payouts />)} />
        <Route path="/reclamos" element={guard(can('pagos'), <Claims />)} />
        <Route path="/vendedores" element={guard(can('pagos', 'moderador'), <Sellers />)} />
        <Route path="/compradores" element={guard(can('moderador'), <Buyers />)} />
        <Route path="/suscripciones" element={guard(can('pagos'), <Subscriptions />)} />
        <Route path="/moderacion" element={guard(can('moderador'), <Moderation />)} />
        <Route path="/categorias" element={guard(can('moderador'), <Categories />)} />
        <Route path="/banners" element={guard(can('moderador'), <Banners />)} />
        <Route path="/planes" element={guard(isAdmin, <Plans />)} />
        <Route path="/configuracion" element={guard(isAdmin, <Config />)} />
        <Route path="/equipo" element={guard(isAdmin, <Team />)} />
        <Route path="/registro" element={guard(isAdmin, <Audit />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

