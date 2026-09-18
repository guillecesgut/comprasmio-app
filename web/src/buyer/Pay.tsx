import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api, bs } from '../api';
import { Icon, ErrorNote, Wordmark } from '../components/shared';

/**
 * Pago por QR: es el único método. El comprador descarga el código, paga desde
 * su banco y sube el comprobante. Recién ahí el vendedor puede verificarlo.
 * No hay entrega automatizada: al confirmar, se manda directo al chat con el
 * vendedor para coordinar — el mensaje de bienvenida ya lo escribe el servidor.
 */
export function PayDialog({ order, onClose }: { order: any; onClose: () => void }) {
  const navigate = useNavigate();
  const [payment, setPayment] = React.useState<any>(null);
  const [receipt, setReceipt] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savingQr, setSavingQr] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    api.paymentQr(order.id).then(setPayment).catch((e) => setError(e.message));
  }, [order.id]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  React.useEffect(() => {
    if (!receipt) return;
    const url = URL.createObjectURL(receipt);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [receipt]);

  /**
   * En Safari (sobre todo iOS) el atributo `download` de un enlace no descarga
   * los `data:` URI — el navegador simplemente navega a la imagen. La forma
   * confiable en el celular es la hoja de compartir nativa, que sí sabe
   * guardar un archivo de imagen en Fotos. Donde no exista esa API (la
   * mayoría de escritorio), se cae a un blob descargable de verdad, que es
   * el método que copyprogramming.com señala como el más confiable — a
   * diferencia del enlace con `download` apuntando directo al data URI.
   */
  const saveQr = async () => {
    if (!payment) return;
    setSavingQr(true);
    try {
      const res = await fetch(payment.qr);
      const blob = await res.blob();
      const filename = `qr-${order.ref.replace('#', '')}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Código QR de pago' });
        return;
      }

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      // El usuario canceló la hoja de compartir: no es un error real.
      if (e?.name !== 'AbortError') setError('No pudimos descargar el QR. Mantené el dedo sobre la imagen para guardarla.');
    } finally {
      setSavingQr(false);
    }
  };

  const confirm = async () => {
    if (!receipt) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadReceipt(order.id, receipt);
      // El servidor ya dejó escrito el primer mensaje del vendedor: no hay
      // sistema de entregas automatizado, así que la coordinación sigue ahí.
      navigate(`/mensajes/${order.sellerId}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pagar la compra"
      className="overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card sheet">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <Wordmark size={18} />
            <p className="mono" style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted)' }}>{order.ref}</p>
          </div>
          <button className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={16} />
          </button>
        </div>

        <ErrorNote message={error} />

        <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 'var(--radius-cta)', padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8, fontSize: 13.5 }}>
            <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.productName}</span>
            <strong style={{ flex: 'none' }}>{bs(order.amount)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8, fontSize: 13.5 }}>
            <span style={{ color: 'var(--muted)' }}>Envío</span>
            <strong style={{ flex: 'none', color: order.shippingMode === 'free' ? 'var(--green-d)' : 'var(--ink)' }}>
              {order.shippingMode === 'free' ? 'Gratis' : 'A convenir con el vendedor'}
            </strong>
          </div>
          <div style={{ height: 1, background: 'var(--line)', margin: '10px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <strong style={{ fontSize: 15 }}>Total</strong>
            <strong style={{ fontSize: 24, color: 'var(--green-d)' }}>{bs(order.total)}</strong>
          </div>
        </div>

        <div className="card" style={{ padding: 18, marginTop: 12, textAlign: 'center' }}>
          {payment ? (
            <img src={payment.qr} alt="Código QR para pagar" width={180} height={180} style={{ borderRadius: 8 }} />
          ) : (
            <div style={{ height: 180, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Generando el código…
            </div>
          )}

          <div
            style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 'var(--radius-input)',
              background: 'var(--orange-soft)', border: '1px solid #E8D3BE',
            }}
          >
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--orange-d)', fontWeight: 500, lineHeight: 1.5 }}>
              Tienes 5 minutos para pagar el pedido, caso contrario tu producto podría volver a ser
              subastado. El vendedor confirmará tu pago inmediatamente.
            </p>
          </div>

          <p style={{ margin: '10px 0 0', fontSize: 13, fontWeight: 500 }}>{payment?.bank}</p>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
            {payment?.holder} · {payment?.account}
          </p>
          {payment && (
            <button
              type="button"
              className="btn btn--outline"
              onClick={saveQr}
              disabled={savingQr}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12 }}
            >
              <Icon name="download" size={16} /> {savingQr ? 'Preparando…' : 'Descargar QR'}
            </button>
          )}
          <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>
            En iPhone también podés mantener presionada la imagen y elegir "Agregar a Fotos".
          </p>
        </div>

        <p className="label" style={{ marginTop: 16 }}>Adjuntar comprobante</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          hidden
          onChange={(e) => setReceipt(e.target.files?.[0] || null)}
        />
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            width: '100%', padding: 20, borderRadius: 'var(--radius-cta)', textAlign: 'center',
            border: `1.5px dashed ${receipt ? 'var(--green)' : 'var(--line)'}`,
            background: receipt ? 'var(--green-soft)' : 'var(--bg)',
          }}
        >
          {receipt ? (
            <>
              {preview && <img src={preview} alt="" width={64} height={64} style={{ borderRadius: 8, objectFit: 'cover' }} />}
              <p style={{ margin: '8px 0 0', fontSize: 13.5, fontWeight: 500, color: 'var(--green-d)' }}>
                Comprobante listo · tocá para cambiar
              </p>
            </>
          ) : (
            <>
              <Icon name="camera" size={22} />
              <p style={{ margin: '8px 0 0', fontSize: 13.5, fontWeight: 500 }}>Subí la foto de tu transferencia</p>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>
                El vendedor la revisa y confirma tu pago
              </p>
            </>
          )}
        </button>

        <button className="btn" onClick={confirm} disabled={!receipt || busy} style={{ width: '100%', height: 50, marginTop: 16 }}>
          {busy ? 'Enviando…' : 'Confirmar pago'}
        </button>
      </div>
    </div>
  );
}
