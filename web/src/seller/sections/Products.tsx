import React from 'react';
import { api, bs, Mode } from '../../api';
import { SectionTitle, ErrorNote, Empty, ModeChip, Thumb, Badge, Icon } from '../../components/shared';

const COLUMNS = '2fr 1fr 1fr 0.95fr 1.2fr 1fr 84px';

const SHIPPING_OPTIONS: { key: 'free' | 'arranged'; title: string; sub: string }[] = [
  { key: 'free', title: 'Envío gratis', sub: 'Lo asumís vos, no se le cobra al comprador.' },
  { key: 'arranged', title: 'A convenir', sub: 'Lo coordinan por chat después de la compra.' },
];

export function Products({ refreshKey, onChange }: { refreshKey: number; onChange: () => void }) {
  const [products, setProducts] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<any | null>(null);
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(() => {
    api.products().then(({ products }) => setProducts(products)).catch((e) => setError(e.message));
  }, []);

  React.useEffect(() => { load(); }, [load, refreshKey]);

  const remove = async (product: any) => {
    if (!confirm(`¿Borrar "${product.name}" de tu catálogo?`)) return;
    try {
      await api.deleteProduct(product.id);
      load();
      onChange();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startNew = () => { setEditing(null); setOpen(true); };
  const startEdit = (product: any) => { setEditing(product); setOpen(true); };

  return (
    <>
      <SectionTitle
        title="Productos"
        subtitle={`${products.length} en tu catálogo`}
        action={
          <button className="btn" onClick={startNew}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="plus" size={16} /> Nuevo producto</span>
          </button>
        }
      />
      <ErrorNote message={error} />

      {products.length === 0 ? (
        <Empty
          title="No tenés productos todavía"
          body="Creá uno para subastarlo o venderlo a precio fijo en tu próxima transmisión."
          action={<button className="btn" onClick={startNew}>Crear producto</button>}
        />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-head" style={{ '--cols': COLUMNS } as React.CSSProperties}>
            <span>Producto</span><span>Categoría</span><span>Tipo de venta</span><span>Envío</span><span>Precios</span><span>Estado</span><span />
          </div>
          {products.map((product) => (
            <div key={product.id} className="table-row" style={{ '--cols': COLUMNS } as React.CSSProperties}>
              <div className="row-header" style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <Thumb grad={product.grad} />
                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</span>
              </div>
              <span data-label="Categoría" style={{ color: 'var(--muted)' }}>{product.category}</span>
              <span data-label="Tipo de venta"><ModeChip mode={product.mode as Mode} /></span>
              <span data-label="Envío" style={{ fontSize: 12.5, color: product.shipping === 'free' ? 'var(--green-d)' : 'var(--muted)', fontWeight: product.shipping === 'free' ? 600 : 400 }}>
                {product.shipping === 'free' ? 'Gratis' : 'A convenir'}
              </span>
              <div data-label="Precios" style={{ lineHeight: 1.4, textAlign: 'right' }}>
                {product.mode === 'fixed' ? (
                  <>
                    <div style={{ fontWeight: 600 }}>{bs(product.price)}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{product.stock} unidades</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 600 }}>{bs(product.start)}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>mínimo {bs(product.min)}</div>
                  </>
                )}
              </div>
              <span data-label="Estado"><Badge status={product.status === 'sold' ? 'neutral' : 'verificado'} label={product.status === 'sold' ? 'Vendido' : 'Listo'} /></span>
              <div data-label="Acciones" style={{ display: 'flex', gap: 6 }}>
                <button className="icon-btn icon-btn--sm" aria-label={`Editar ${product.name}`} onClick={() => startEdit(product)}><Icon name="edit" size={15} /></button>
                <button className="icon-btn icon-btn--sm" aria-label={`Borrar ${product.name}`} onClick={() => remove(product)}><Icon name="trash" size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <ProductModal
          product={editing}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); load(); onChange(); }}
        />
      )}
    </>
  );
}

/**
 * Los campos de precio dependen de la forma de venta, así que se eligen primero.
 * El mínimo de subasta es el precio de reserva: solo lo ve el vendedor.
 */
function ProductModal({ product, onClose, onSaved }: { product: any | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = React.useState(product?.name || '');
  const [category, setCategory] = React.useState(product?.category || 'General');
  const [mode, setMode] = React.useState<Mode>((product?.mode as Mode) || 'auction');
  const [shipping, setShipping] = React.useState<'free' | 'arranged' | null>(product?.shipping ?? null);
  const [start, setStart] = React.useState(product?.start ? String(product.start) : '');
  const [min, setMin] = React.useState(product?.min ? String(product.min) : '');
  const [price, setPrice] = React.useState(product?.price ? String(product.price) : '');
  const [stock, setStock] = React.useState(product?.stock ? String(product.stock) : '');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const digits = (v: string) => v.replace(/[^0-9]/g, '');
  const valid =
    name.trim() &&
    shipping !== null &&
    (mode === 'fixed' ? Number(price) > 0 && Number(stock) > 0 : start !== '' && min !== '');

  const save = async () => {
    setBusy(true);
    setError(null);
    const payload = { name, category, mode, shipping, start, min, price, stock };
    try {
      if (product) await api.updateProduct(product.id, payload);
      else await api.createProduct(payload);
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const options: { key: Mode; title: string; sub: string; dot: string }[] = [
    { key: 'auction', title: 'Subasta', sub: 'El precio lo pone la sala', dot: 'var(--orange)' },
    { key: 'fixed', title: 'Precio fijo', sub: 'Compra directa en el vivo', dot: 'var(--green)' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={product ? 'Editar producto' : 'Nuevo producto'}
      style={{ position: 'fixed', inset: 0, background: 'rgba(32,31,27,.45)', display: 'grid', placeItems: 'center', padding: 24, zIndex: 50 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(520px, 100%)', padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{product ? 'Editar producto' : 'Nuevo producto'}</h3>
          <button className="icon-btn icon-btn--sm" aria-label="Cerrar" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>

        <ErrorNote message={error} />

        <label className="label" htmlFor="p-name">Nombre del producto</label>
        <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Reloj Orient automático" style={{ marginBottom: 14 }} />

        <label className="label" htmlFor="p-cat">Categoría</label>
        <input id="p-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ marginBottom: 14 }} />

        <span className="label">Forma de venta en el vivo</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {options.map((option) => {
            const selected = mode === option.key;
            return (
              <button
                key={option.key}
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(option.key)}
                style={{
                  textAlign: 'left', padding: 13, borderRadius: 'var(--radius-input)',
                  border: `1.5px solid ${selected ? 'var(--green)' : 'var(--line)'}`,
                  background: selected ? 'var(--green-soft)' : 'var(--card)',
                  color: selected ? 'var(--green-d)' : 'var(--ink)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, marginBottom: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: option.dot }} />
                  {option.title}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{option.sub}</span>
              </button>
            );
          })}
        </div>

        {mode === 'auction' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label" htmlFor="p-start">Precio inicial (Bs)</label>
              <input id="p-start" className="input" inputMode="numeric" value={start} onChange={(e) => setStart(digits(e.target.value))} placeholder="70" />
            </div>
            <div>
              <label className="label" htmlFor="p-min">Precio mínimo (solo vos lo ves)</label>
              <input id="p-min" className="input" inputMode="numeric" value={min} onChange={(e) => setMin(digits(e.target.value))} placeholder="200" />
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label" htmlFor="p-price">Precio de venta (Bs)</label>
              <input id="p-price" className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(digits(e.target.value))} placeholder="45" />
            </div>
            <div>
              <label className="label" htmlFor="p-stock">Unidades (stock para el vivo)</label>
              <input id="p-stock" className="input" inputMode="numeric" value={stock} onChange={(e) => setStock(digits(e.target.value))} placeholder="24" />
            </div>
          </div>
        )}

        <span className="label" style={{ marginTop: 14, display: 'block' }}>Envío</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {SHIPPING_OPTIONS.map((option) => {
            const selected = shipping === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setShipping(option.key)}
                style={{
                  textAlign: 'left', padding: 13, borderRadius: 'var(--radius-input)',
                  border: `1.5px solid ${selected ? 'var(--green)' : 'var(--line)'}`,
                  background: selected ? 'var(--green-soft)' : 'var(--card)',
                  color: selected ? 'var(--green-d)' : 'var(--ink)',
                }}
              >
                <span style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>{option.title}</span>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{option.sub}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button className="btn btn--outline" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={save} disabled={!valid || busy}>{busy ? 'Guardando…' : 'Guardar producto'}</button>
        </div>
      </div>
    </div>
  );
}
