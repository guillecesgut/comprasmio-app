import React from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink, Navigate, useLocation } from 'react-router-dom';
import { SessionProvider, useSession } from './session';
import { Logomark, Wordmark, Icon, UserBadge } from './components/shared';
import { Feed } from './buyer/Feed';
import { Room } from './buyer/Room';
import { Orders, Favorites } from './buyer/Account';
import { Messages } from './buyer/Messages';
import { Welcome } from './Welcome';
import { NotificationBell } from './NotificationBell';
import { SellerArea } from './seller/SellerArea';

const BUYER_NAV = [
  { to: '/', label: 'Inicio', icon: 'home' as const, end: true },
  { to: '/favoritos', label: 'Favoritos', icon: 'heart' as const },
  { to: '/compras', label: 'Compras', icon: 'bag' as const },
];

function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, online } = useSession();
  const location = useLocation();

  // Mientras se resuelve la sesión, nada de menú todavía: evita el parpadeo
  // de ver el menú de comprador un instante antes de saber quién es.
  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <Logomark size={48} radius={16} />
      </div>
    );
  }

  const WELCOME_PATHS = ['/', '/entrar', '/crear-cuenta'];
  const bare =
    location.pathname.startsWith('/vivo/') ||
    location.pathname.startsWith('/vender/transmitir') ||
    (!user && WELCOME_PATHS.includes(location.pathname));

  if (bare) return <>{children}</>;

  const isSeller = user?.role === 'seller';

  return (
    <>
      <header className="topbar">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <Logomark size={30} radius={10} />
          <Wordmark size={19} />
        </Link>

        {/* La navegación de Inicio/Favoritos/Compras es del comprador. El vendedor
            ya tiene su propio menú arriba de cada sección, dentro de /vender. */}
        {!isSeller && (
          <nav className="topbar__nav">
            {BUYER_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `topbar__link${isActive ? ' is-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {!online && <span className="offline-dot" title="Sin conexión con el servidor" />}
          {user ? (
            <>
              {user.role === 'seller' && (
                <Link to="/vender" className="btn btn--sm btn--outline" style={{ textDecoration: 'none', display: 'grid', placeItems: 'center' }}>
                  Vender
                </Link>
              )}
              <NotificationBell />
              <UserBadge name={user.name} />
              <button className="icon-btn icon-btn--sm" onClick={logout} aria-label="Cerrar sesión">
                <Icon name="logout" size={16} />
              </button>
            </>
          ) : (
            <Link to="/entrar" className="btn btn--sm" style={{ textDecoration: 'none', display: 'grid', placeItems: 'center' }}>
              Entrar
            </Link>
          )}
        </div>
      </header>

      <main className={`page${isSeller ? ' page--seller' : ''}`}>{children}</main>

      {!isSeller && (
        <nav className="bottombar">
          {BUYER_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `bottombar__link${isActive ? ' is-active' : ''}`}
            >
              <Icon name={item.icon} size={20} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
}

function Protected({ children, seller }: { children: React.ReactNode; seller?: boolean }) {
  const { user, loading } = useSession();
  const location = useLocation();

  if (loading) return <p style={{ color: 'var(--muted)' }}>Cargando…</p>;
  if (!user) return <Navigate to="/entrar" state={{ from: location.pathname }} replace />;
  if (seller && user.role !== 'seller') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Si ya tenés sesión, no hay nada que hacer en /entrar o /crear-cuenta. */
function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Root() {
  const { user } = useSession();
  if (!user) return <Welcome initialTab="signup" />;
  // Cada rol tiene su interfaz fija: el vendedor nunca aterriza en el feed de compras.
  return user.role === 'seller' ? <Navigate to="/vender" replace /> : <Feed />;
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Shell>
          <Routes>
            <Route path="/" element={<Root />} />
            <Route path="/vivo/:id" element={<Room />} />
            <Route path="/entrar" element={<GuestOnly><Welcome initialTab="login" /></GuestOnly>} />
            <Route path="/crear-cuenta" element={<GuestOnly><Welcome initialTab="signup" /></GuestOnly>} />
            <Route path="/compras" element={<Protected><Orders /></Protected>} />
            <Route path="/mensajes/:sellerId" element={<Protected><Messages /></Protected>} />
            <Route path="/favoritos" element={<Protected><Favorites /></Protected>} />
            <Route path="/vender/*" element={<Protected seller><SellerArea /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
      </SessionProvider>
    </BrowserRouter>
  );
}
