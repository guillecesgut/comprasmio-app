import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSession } from './session';
import { Logomark, Wordmark, ErrorNote, Icon } from './components/shared';

type Tab = 'login' | 'signup';
type Role = 'buyer' | 'seller';

const ROLE_OPTIONS: { key: Role; title: string; sub: string; dot: string; icon: 'bag' | 'video' }[] = [
  { key: 'buyer', title: 'Quiero comprar', sub: 'Entrá a los vivos, pujá en subastas y comprá al toque.', dot: 'var(--green)', icon: 'bag' },
  { key: 'seller', title: 'Quiero vender', sub: 'Transmití en vivo, mostrá tu catálogo y cobrá por QR.', dot: 'var(--orange)', icon: 'video' },
];

/**
 * Primera pantalla del sitio para quien no tiene sesión. Login y creación de
 * cuenta viven acá; crear cuenta primero pide el rol —comprador o vendedor—
 * porque esa elección define para siempre a qué interfaz entra la persona
 * y no hay forma de cambiarla después.
 */
export function Welcome({ initialTab = 'signup' as Tab }: { initialTab?: Tab }) {
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [role, setRole] = React.useState<Role | null>(null);

  return (
    <div className="welcome">
      <div className="welcome__brand">
        <Logomark size={64} radius={20} />
        <div style={{ marginTop: 16 }}>
          <Wordmark size={27} />
        </div>
        <p className="welcome__slogan">Subastas y compras en vivo, sin bajar ninguna app.</p>
      </div>

      <div className="card welcome__card">
        <div className="welcome__tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'signup'}
            className={`welcome__tab${tab === 'signup' ? ' is-active' : ''}`}
            onClick={() => setTab('signup')}
          >
            Crear cuenta
          </button>
          <button
            role="tab"
            aria-selected={tab === 'login'}
            className={`welcome__tab${tab === 'login' ? ' is-active' : ''}`}
            onClick={() => setTab('login')}
          >
            Iniciar sesión
          </button>
        </div>

        {tab === 'login' ? (
          <LoginForm />
        ) : role === null ? (
          <RolePicker onPick={setRole} />
        ) : (
          <SignupForm role={role} onBack={() => setRole(null)} />
        )}
      </div>
    </div>
  );
}

function RolePicker({ onPick }: { onPick: (role: Role) => void }) {
  return (
    <div style={{ padding: '22px 24px 26px' }}>
      <h1 className="welcome__title">¿Qué querés hacer?</h1>
      <p className="welcome__subtitle">Elegí con qué cuenta vas a entrar. Esta elección es definitiva.</p>

      <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
        {ROLE_OPTIONS.map((option) => (
          <button key={option.key} type="button" className="welcome__role" onClick={() => onPick(option.key)}>
            <span className="welcome__role-icon" style={{ background: option.dot }}>
              <Icon name={option.icon} size={19} />
            </span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: 15 }}>{option.title}</strong>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>
                {option.sub}
              </span>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}

function SignupForm({ role, onBack }: { role: Role; onBack: () => void }) {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const from = location.state?.from;

  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const active = ROLE_OPTIONS.find((o) => o.key === role)!;
  const valid = name.trim() && phone.trim() && password.length >= 6;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await session.signup({ name, phone, password, role });
      // Un vendedor recién creado va directo a su panel; un comprador vuelve
      // a donde estaba (por ejemplo, la sala que lo mandó a crear cuenta).
      navigate(user.role === 'seller' ? '/vender' : from || '/', { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ padding: '22px 24px 26px' }}>
      <button type="button" onClick={onBack} className="welcome__back">
        <Icon name="back" size={15} /> Cambiar elección
      </button>

      <div className="welcome__chosen" style={{ borderColor: active.dot }}>
        <span className="welcome__role-icon" style={{ background: active.dot, width: 30, height: 30 }}>
          <Icon name={active.icon} size={15} />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{active.title}</span>
      </div>

      <ErrorNote message={error} />

      <label className="label" htmlFor="w-name">Nombre</label>
      <input id="w-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana Quispe" autoFocus style={{ marginBottom: 14 }} />

      <label className="label" htmlFor="w-phone">Celular</label>
      <input id="w-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="71234567" inputMode="tel" style={{ marginBottom: 14 }} />

      <label className="label" htmlFor="w-password">Contraseña</label>
      <input id="w-password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" style={{ marginBottom: 8 }} />

      <p style={{ margin: '0 0 18px', fontSize: 11.5, color: 'var(--muted)' }}>
        Vas a entrar como <strong>{active.title.toLowerCase()}</strong>. No se puede cambiar más adelante.
      </p>

      <button className="btn btn--orange" type="submit" disabled={!valid || busy} style={{ width: '100%', height: 50 }}>
        {busy ? 'Creando cuenta…' : 'Crear cuenta'}
      </button>
    </form>
  );
}

function LoginForm() {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const from = location.state?.from;

  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await session.login(phone, password);
      navigate(user.role === 'seller' ? '/vender' : from || '/', { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ padding: '22px 24px 26px' }}>
      <ErrorNote message={error} />

      <label className="label" htmlFor="l-phone">Celular</label>
      <input id="l-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="71234567" inputMode="tel" autoFocus style={{ marginBottom: 14 }} />

      <label className="label" htmlFor="l-password">Contraseña</label>
      <input id="l-password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginBottom: 20 }} />

      <button className="btn" type="submit" disabled={!phone || !password || busy} style={{ width: '100%', height: 50 }}>
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
