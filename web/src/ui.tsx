import React from 'react';
import { bs } from './api';

/** Componentes compartidos del panel. */

export const ORDER_STATUS: Record<string, { label: string; tone: string }> = {
  pendiente_pago: { label: 'Pendiente de pago', tone: 'amber' },
  pago_en_revision: { label: 'Pago en revisión', tone: 'green' },
  pagado: { label: 'Pago confirmado', tone: 'solid' },
  preparando: { label: 'Preparando', tone: 'gray' },
  enviado: { label: 'Enviado', tone: 'gray' },
  entregado: { label: 'Entregado', tone: 'solid' },
  en_reclamo: { label: 'En reclamo', tone: 'red' },
  cancelado: { label: 'Cancelado', tone: 'dim' },
  vencido: { label: 'Venció el pago', tone: 'dim' },
};

export function StatusChip({ status }: { status: string }) {
  const s = ORDER_STATUS[status] || { label: status, tone: 'dim' };
  return <span className={`chip ${s.tone}`}>{s.label}</span>;
}

export function Chip({ tone = 'dim', children }: { tone?: string; children: React.ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export const Money = ({ value }: { value: number | null | undefined }) => <span className="num">{bs(value)}</span>;

export function PageHead({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </header>
  );
}

export function Seg<K extends string>({ value, onChange, options }: {
  value: K; onChange: (v: K) => void; options: { key: K; label: string; count?: number }[];
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={o.key === value} onClick={() => onChange(o.key)}>
          {o.label}
          {o.count != null && <span className="n">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ErrorLine({ error }: { error?: string | null }) {
  if (!error) return null;
  return <p className="error-line" role="alert">{error}</p>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Modal de confirmación: las acciones que mueven dinero repiten el monto en el botón. */
export function Confirm({ title, children, confirmLabel, tone = 'primary', busy, onConfirm, onCancel, disabled }: {
  title: string; children?: React.ReactNode; confirmLabel: string; tone?: 'primary' | 'danger'; busy?: boolean;
  onConfirm: () => void; onCancel: () => void; disabled?: boolean;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <h2>{title}</h2>
        {children}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn outline" type="button" onClick={onCancel}>Cancelar</button>
          <button className={`btn ${tone}`} type="button" disabled={busy || disabled} onClick={onConfirm}>
            {busy ? 'Guardando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Imagen con zoom al tocar (comprobantes). Los PDF se abren en otra pestaña. */
export function ReceiptView({ url, alt = 'Comprobante' }: { url?: string | null; alt?: string }) {
  const [zoom, setZoom] = React.useState(false);
  if (!url) return <p className="note">Sin comprobante adjunto.</p>;
  if (/\.pdf(\?|$)/i.test(url)) return <a className="btn outline" href={url} target="_blank" rel="noreferrer">Abrir comprobante (PDF)</a>;
  return (
    <div className="zoom-box">
      <img
        src={url}
        alt={alt}
        className={`receipt${zoom ? ' zoomed' : ''}`}
        style={zoom ? { width: '200%', maxWidth: 'none' } : undefined}
        onClick={() => setZoom((z) => !z)}
      />
    </div>
  );
}

/** Selector de archivo que sube al bucket y devuelve la clave. */
export function UploadButton({ folder, accept = 'image/*', label, onUploaded, uploadFn }: {
  folder: string; accept?: string; label: string; onUploaded: (r: { key: string; url: string }) => void;
  uploadFn: (folder: string, f: File) => Promise<{ key: string; url: string }>;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <input ref={ref} type="file" accept={accept} hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setBusy(true);
        setError(null);
        try {
          onUploaded(await uploadFn(folder, f));
        } catch (err: any) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }} />
      <button className="btn outline" type="button" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? 'Subiendo…' : label}
      </button>
      <ErrorLine error={error} />
    </div>
  );
}

const ToastCtx = React.createContext<(text: string) => void>(() => {});
export const useToast = () => React.useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [text, setText] = React.useState<string | null>(null);
  const timer = React.useRef<number>();
  const show = React.useCallback((t: string) => {
    setText(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setText(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {text && <div className="toast" role="status">✓ {text}</div>}
    </ToastCtx.Provider>
  );
}

/** Carga datos con estado de error y recarga. */
export function useLoad<T>(fn: () => Promise<T>, deps: React.DependencyList = []) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const fnRef = React.useRef(fn);
  fnRef.current = fn;
  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { reload(); }, deps);
  return { data, error, loading, reload, setData };
}
