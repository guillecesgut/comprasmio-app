import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, realtime } from '../api';
import { Icon, ErrorNote, SectionTitle } from '../components/shared';

/**
 * No hay sistema de entregas automatizado: acá se coordina la dirección, el
 * horario y —si el envío es "a convenir"— el costo, directo con el vendedor.
 * Reutiliza el mismo hilo que ya usa el vendedor en su panel de Clientes: es
 * una charla continua por vendedor, no una ventana nueva por cada compra.
 */
export function Messages() {
  const { sellerId = '' } = useParams();
  const [seller, setSeller] = React.useState<any>(null);
  const [thread, setThread] = React.useState<any[] | null>(null);
  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const scroller = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    api.sellerInfo(sellerId).then(({ seller }) => setSeller(seller)).catch((e) => setError(e.message));
  }, [sellerId]);

  React.useEffect(() => {
    api.threadWith(sellerId).then(({ thread }) => setThread(thread)).catch((e) => setError(e.message));
    // El vendedor ya está en el canal seller:<id> del lado suyo; acá alcanza
    // con escuchar, porque el comprador se auto-suscribe a su propio canal
    // de usuario apenas conecta el socket.
    return realtime.on('thread:new', ({ message }) => {
      if (message.sellerId === sellerId) setThread((current) => [...(current || []), message]);
    });
  }, [sellerId]);

  React.useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [thread]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setSending(true);
    try {
      const { message } = await api.messageSeller(sellerId, text);
      setThread((current) => [...(current || []), message]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <SectionTitle
        title={seller ? seller.name : 'Mensajes'}
        subtitle="Coordiná la entrega directo con el vendedor"
        action={
          <Link to="/compras" className="btn btn--sm btn--outline" style={{ textDecoration: 'none', display: 'grid', placeItems: 'center' }}>
            Volver a compras
          </Link>
        }
      />
      <ErrorNote message={error} />

      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'min(560px, 65vh)' }}>
        <div ref={scroller} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {thread === null ? (
            <p style={{ margin: 'auto', fontSize: 13.5, color: 'var(--muted)' }}>Cargando…</p>
          ) : thread.length === 0 ? (
            <p style={{ margin: 'auto', fontSize: 13.5, color: 'var(--muted)', textAlign: 'center', maxWidth: 260 }}>
              Todavía no hay mensajes. Escribile para coordinar la entrega.
            </p>
          ) : (
            thread.map((message) => (
              <div
                key={message.id}
                style={{
                  alignSelf: message.from === 'buyer' ? 'flex-end' : 'flex-start',
                  maxWidth: '75%', padding: '10px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.45,
                  background: message.from === 'buyer' ? 'var(--green-soft)' : 'var(--sand)',
                  border: `1px solid ${message.from === 'buyer' ? 'var(--green-border)' : 'var(--line)'}`,
                }}
              >
                {message.text}
              </div>
            ))
          )}
        </div>

        <form onSubmit={send} style={{ display: 'flex', gap: 10, padding: 14, borderTop: '1px solid var(--line)' }}>
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Escribile a ${seller?.name || 'tu vendedor'}…`}
            aria-label="Mensaje"
          />
          <button className="btn" disabled={!draft.trim() || sending} aria-label="Enviar mensaje" style={{ padding: '0 16px' }}>
            <Icon name="send" size={16} />
          </button>
        </form>
      </div>
    </>
  );
}
