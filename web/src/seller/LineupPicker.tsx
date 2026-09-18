import React from 'react';
import { api, bs, Mode, MODE } from '../api';
import { Thumb, ModeChip, ErrorNote, Empty, Icon } from '../components/shared';

/**
 * Selección múltiple del catálogo, mostrada al tocar "Transmitir". Con lo que
 * el vendedor marca acá se arma la cola: el primer producto sale al aire de
 * inmediato y el resto espera turno, abriéndose solo después de cada venta.
 */
export function LineupPicker({ onClose, onStart }: { onClose: () => void; onStart: (productIds: string[]) => Promise<void> }) {
  const [products, setProducts] = React.useState<any[] | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    api.products()
      .then(({ products }) => setProducts(products.filter((p: any) => p.status !== 'sold')))
      .catch((e) => setError(e.message));
  }, []);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set((products || []).map((p) => p.id)));
  const selectNone = () => setSelected(new Set());

  const start = async (ids: string[]) => {
    setBusy(true);
    setError(null);
    try {
      await onStart(ids);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Elegir productos para la transmisión" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card sheet">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>¿Qué vas a subastar hoy?</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--muted)' }}>
              Elegí el orden en el que aparecen: el primero sale al aire apenas empieces.
            </p>
          </div>
          <button className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={16} /></button>
        </div>

        <ErrorNote message={error} />

        {products === null ? (
          <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>Cargando catálogo…</p>
        ) : products.length === 0 ? (
          <Empty title="Todavía no tenés productos" body="Creá al menos uno desde la sección Productos para poder armar tu vivo." />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 8px' }}>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{selected.size} de {products.length} seleccionados</span>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" onClick={selectAll} style={{ fontSize: 12.5, color: 'var(--green-d)', fontWeight: 500, background: 'none', border: 'none' }}>Todos</button>
                <button type="button" onClick={selectNone} style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 500, background: 'none', border: 'none' }}>Ninguno</button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, maxHeight: '46vh', overflowY: 'auto' }}>
              {products.map((product) => {
                const checked = selected.has(product.id);
                return (
                  <label
                    key={product.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: 12, cursor: 'pointer',
                      border: `1.5px solid ${checked ? 'var(--green)' : 'var(--line)'}`, borderRadius: 'var(--radius-input)',
                      background: checked ? 'var(--green-soft)' : 'var(--bg)',
                    }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(product.id)} style={{ width: 18, height: 18, flex: 'none' }} />
                    <Thumb grad={product.grad} size={40} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: 'block', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {product.name}
                      </strong>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <ModeChip mode={product.mode as Mode} />
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {product.mode === 'fixed'
                            ? `${bs(product.price)} · ${product.stock} u.`
                            : `Inicial ${bs(product.start)} · Mín. ${bs(product.min)}`}
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            <button
              className="btn btn--orange"
              onClick={() => start([...selected])}
              disabled={selected.size === 0 || busy}
              style={{ width: '100%', marginTop: 16 }}
            >
              {busy ? 'Abriendo…' : selected.size === 0 ? 'Elegí al menos un producto' : `Salir al aire con ${selected.size} producto${selected.size === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={() => start([])}
              disabled={busy}
              style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}
            >
              Empezar sin seleccionar nada todavía
            </button>
          </>
        )}
      </div>
    </div>
  );
}
