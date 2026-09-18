import React from 'react';
import { MODE, Mode } from '../api';

export function Logomark({ size = 34, radius = 11 }: { size?: number; radius?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: 'var(--green)', display: 'grid', placeItems: 'center', position: 'relative', flex: 'none' }}>
      <div style={{ width: size * 0.42, height: size * 0.36, borderRadius: size * 0.07, background: 'var(--card)', display: 'grid', placeItems: 'center' }}>
        <div style={{ width: size * 0.12, height: size * 0.12, borderRadius: '50%', background: 'var(--orange-l)' }} />
      </div>
      <div
        style={{
          position: 'absolute', top: size * 0.2, width: size * 0.22, height: size * 0.16,
          borderTopLeftRadius: size * 0.11, borderTopRightRadius: size * 0.11,
          border: `${Math.max(2, size * 0.05)}px solid var(--card)`, borderBottom: 'none',
        }}
      />
    </div>
  );
}

export function Wordmark({ size = 19, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <span style={{ fontWeight: 700, fontSize: size, letterSpacing: '-.03em', color: onDark ? 'var(--card)' : 'var(--ink)' }}>
      ComprasMío<span style={{ color: onDark ? 'var(--orange-l)' : 'var(--orange)' }}>!</span>
    </span>
  );
}

export function ModeChip({ mode }: { mode: Mode }) {
  return <span className="mode-chip" style={{ background: MODE[mode].accent }}>{MODE[mode].label}</span>;
}

/** Bloque de color liso, a la espera de la foto real del producto. */
export function Thumb({ grad, size = 38 }: { grad: string; size?: number }) {
  return <div className="thumb" style={{ width: size, height: size, background: grad || 'var(--green)' }} />;
}

export function Badge({ status, label }: { status: string; label: string }) {
  const tone =
    status === 'verificado' || status === 'enviado' ? 'badge--good'
      : status === 'en_revision' || status === 'pendiente_pago' ? 'badge--warn'
      : '';
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-.4px' }}>{title}</h2>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
      <p style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>{title}</p>
      <p style={{ margin: '6px auto 0', fontSize: 13.5, color: 'var(--muted)', maxWidth: 380, lineHeight: 1.5 }}>{body}</p>
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div style={{ background: 'var(--orange-soft)', border: '1px solid #E8D3BE', color: 'var(--orange-d)', borderRadius: 12, padding: '11px 14px', marginBottom: 16, fontSize: 13.5, fontWeight: 500 }}>
      {message}
    </div>
  );
}

/** Íconos de trazo de 2px, como en la app. */
export function UserBadge({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  return (
    <div className="user-badge">
      <span className="user-badge__avatar">{initials}</span>
      <span className="user-badge__name">{name}</span>
    </div>
  );
}

export function Icon({ name, size = 18, filled = false }: { name: keyof typeof PATHS; size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

const PATHS = {
  chart: <><line x1="5" y1="20" x2="5" y2="11" /><line x1="12" y1="20" x2="12" y2="5" /><line x1="19" y1="20" x2="19" y2="14" /></>,
  box: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M3 11h18M8 7V4h8v3" /></>,
  bag: <><path d="M6 7h12l1 14H5L6 7z" /><path d="M9 10V6a3 3 0 0 1 6 0v4" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M16 12.5h3" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M17 8.5a3 3 0 0 1 0 5M17.5 20c0-2.6-1-4.2-2.5-5" /></>,
  bell: <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  logout: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" /><polyline points="17 8 21 12 17 16" /><path d="M21 12H9" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="M14 6l4 4" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3" /><path d="M6 7l1 14h10l1-14" /></>,
  close: <path d="M18 6L6 18M6 6l12 12" />,
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />,
  heart: <path d="M20.8 8.6a5 5 0 0 0-8.8-2.6A5 5 0 0 0 3.2 8.6c0 4.5 8.8 10 8.8 10s8.8-5.5 8.8-10Z" />,
  back: <polyline points="15 18 9 12 15 6" />,
  check: <polyline points="20 6 9 17 4 12" />,
  download: <><path d="M12 3v12" /><polyline points="7 11 12 16 17 11" /><path d="M4 20h16" /></>,
  camera: <><path d="M3 8h4l2-3h6l2 3h4v12H3z" /><circle cx="12" cy="13" r="4" /></>,
  chevron: <polyline points="9 6 15 12 9 18" />,
  home: <><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
  video: <><rect x="2" y="6" width="14" height="12" rx="3" /><path d="M16 11l6-3.5v9L16 13" /></>,
  radio: <><circle cx="12" cy="12" r="3" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 19.1a10 10 0 0 0 0-14.2" /></>,
} as const;
