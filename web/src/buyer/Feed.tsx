import React from 'react';
import { Link } from 'react-router-dom';
import { api, bs, realtime, Mode, MODE } from '../api';
import { useSession } from '../session';
import { Logomark, Wordmark, ModeChip, Icon, Empty, ErrorNote } from '../components/shared';

const FILTERS: { key: 'all' | Mode; label: string; dot?: string }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'auction', label: 'Subastas', dot: 'var(--orange)' },
  { key: 'fixed', label: 'Precio fijo', dot: 'var(--green)' },
];

export function Feed() {
  const { favorites, toggleFavorite, user } = useSession();
  const [filter, setFilter] = React.useState<'all' | Mode>('all');
  const [query, setQuery] = React.useState('');
  const [streams, setStreams] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const { streams } = await api.streams(filter, query.trim() || undefined);
      setStreams(streams);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter, query]);

  React.useEffect(() => {
    load();
  }, [load]);

  // El feed respira: espectadores y precios se mueven sin recargar.
  React.useEffect(() => {
    const off = realtime.subscribe('feed');
    const stop = realtime.on('stream:update', ({ stream }) =>
      setStreams((current) => current.map((s) => (s.id === stream.id ? { ...s, ...stream } : s)))
    );
    const started = realtime.on('stream:started', () => load());
    // Sin esto, la tarjeta de un vivo que ya terminó queda visible hasta recargar.
    const ended = realtime.on('stream:ended', ({ streamId }) =>
      setStreams((current) => current.filter((s) => s.id !== streamId))
    );
    return () => {
      off();
      stop();
      started();
      ended();
    };
  }, [load]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: '-.5px', flex: 1, minWidth: 180 }}>
          En vivo ahora
        </h1>
        <label style={{ position: 'relative', flex: '1 1 260px', maxWidth: 340 }}>
          <span style={{ position: 'absolute', left: 13, top: 15, color: 'var(--soft-ink)' }}>
            <Icon name="search" size={16} />
          </span>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar productos, vendedores…"
            aria-label="Buscar transmisiones"
            style={{ paddingLeft: 38 }}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 11,
                fontSize: 13.5, fontWeight: 500,
                border: `1px solid ${active ? 'var(--green-forest)' : 'var(--line)'}`,
                background: active ? 'var(--green-forest)' : 'var(--card)',
                color: active ? 'var(--card)' : 'var(--muted)',
              }}
            >
              {f.dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.dot }} />}
              {f.label}
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 13, color: 'var(--muted)' }}>
          {streams.length} transmisiones
        </span>
      </div>

      <ErrorNote message={error} />

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Cargando…</p>
      ) : streams.length === 0 ? (
        <Empty
          title="No hay transmisiones con ese filtro"
          body="Probá con otro modo de venta, o volvé en un rato: los vivos entran y salen todo el día."
        />
      ) : (
        <div className="feed-grid">
          {streams.map((stream) => (
            <StreamCard
              key={stream.id}
              stream={stream}
              favorite={favorites.includes(stream.id)}
              onFavorite={user ? () => toggleFavorite(stream.id) : undefined}
            />
          ))}
        </div>
      )}
    </>
  );
}

function StreamCard({ stream, favorite, onFavorite }: { stream: any; favorite: boolean; onFavorite?: () => void }) {
  const mode: Mode = stream.mode;
  // La nota bajo el precio dice cosas distintas según el modo.
  const note = mode === 'fixed' ? `${stream.stock ?? 0} u. disponibles` : 'precio inicial';

  return (
    <Link to={`/vivo/${stream.id}`} className="card stream-card" style={{ textDecoration: 'none', color: 'inherit', overflow: 'hidden', display: 'block' }}>
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: stream.grad || 'var(--green)' }}>
        {stream.tag && (
          <span
            style={{
              position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center',
              color: 'rgba(255,253,250,.82)', fontWeight: 700, fontSize: 15, letterSpacing: '1.2px',
              whiteSpace: 'pre-line', padding: 12,
            }}
          >
            {stream.tag}
          </span>
        )}

        <span
          style={{
            position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(10,59,49,.72)', color: 'var(--card)', borderRadius: 999, padding: '4px 9px', fontSize: 12,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--orange-l)' }} />
          {stream.viewers}
        </span>

        {onFavorite && (
          <button
            aria-label={favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
            onClick={(e) => {
              e.preventDefault();
              onFavorite();
            }}
            style={{
              position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: '50%', border: 'none',
              background: 'rgba(10,59,49,.55)', color: favorite ? 'var(--orange-l)' : 'var(--card)',
              display: 'grid', placeItems: 'center',
            }}
          >
            <Icon name="heart" size={16} filled={favorite} />
          </button>
        )}

        <span style={{ position: 'absolute', bottom: 10, left: 10 }}>
          <ModeChip mode={mode} />
        </span>
        <span
          style={{
            position: 'absolute', bottom: 10, right: 10, background: MODE[mode].accent, color: 'var(--card)',
            borderRadius: 'var(--radius-chip)', padding: '5px 11px', fontSize: 12.5, fontWeight: 600,
          }}
        >
          {MODE[mode].cta}
        </span>
      </div>

      <div style={{ padding: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span
            style={{
              width: 22, height: 22, borderRadius: '50%', background: stream.grad || 'var(--green-forest)',
              color: 'var(--card)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 600, flex: 'none',
            }}
          >
            {stream.seller?.initials}
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stream.seller?.name}
          </span>
        </div>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 14.5, lineHeight: 1.35, minHeight: '2.7em' }}>{stream.title}</p>
        <p style={{ margin: '8px 0 0', display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <strong style={{ fontSize: 16, color: 'var(--green-d)' }}>{bs(stream.price)}</strong>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{note}</span>
        </p>
      </div>
    </Link>
  );
}
