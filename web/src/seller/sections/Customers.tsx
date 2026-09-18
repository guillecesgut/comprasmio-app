import React from 'react';
import { api, bs, realtime } from '../../api';
import { SectionTitle, ErrorNote, Empty, Icon } from '../../components/shared';

export function Customers({ refreshKey }: { refreshKey: number }) {
  const [customers, setCustomers] = React.useState<any[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [thread, setThread] = React.useState<any[]>([]);
  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const scroller = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    api.customers()
      .then(({ customers }) => {
        setCustomers(customers);
        setSelected((current) => current ?? customers[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, [refreshKey]);

  React.useEffect(() => {
    if (!selected) return;
    api.thread(selected).then(({ thread }) => setThread(thread)).catch(() => setThread([]));
  }, [selected]);

  // Sin esto, la respuesta del comprador solo aparece si recargás la página.
  React.useEffect(() => {
    return realtime.on('thread:new', ({ message }) => {
      if (message.buyerId === selected) setThread((current) => [...current, message]);
    });
  }, [selected]);

  React.useEffect(() => {
    // El hilo siempre muestra lo último, como cualquier chat.
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [thread]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !selected) return;
    setDraft('');
    try {
      const { message } = await api.sendMessage(selected, text);
      setThread((current) => [...current, message]);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const detail = customers.find((c) => c.id === selected);

  if (customers.length === 0) {
    return (
      <>
        <SectionTitle title="Clientes" />
        <ErrorNote message={error} />
        <Empty title="Todavía no tenés clientes" body="Quien compre en tus vivos aparece acá con su historial y un chat directo." />
      </>
    );
  }

  return (
    <>
      <SectionTitle title="Clientes" subtitle={`${customers.length} compradores`} />
      <ErrorNote message={error} />

      <div className="customers-grid">
        <div className="card" style={{ overflow: 'hidden' }}>
          {customers.map((customer) => {
            const active = customer.id === selected;
            return (
              <button
                key={customer.id}
                onClick={() => setSelected(customer.id)}
                aria-pressed={active}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px',
                  borderTop: '1px solid var(--line)', borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
                  background: active ? 'var(--green-soft)' : 'transparent', textAlign: 'left',
                }}
              >
                <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--green-forest)', color: 'var(--card)', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 13, flex: 'none' }}>
                  {customer.name.slice(0, 2).toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.name}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>@{customer.handle}</span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5 }}>{bs(customer.spend)}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{customer.orders} órdenes</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', minHeight: 420 }}>
          {detail && (
            <>
              <div style={{ display: 'flex', gap: 20, paddingBottom: 16, borderBottom: '1px solid var(--line)' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{detail.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--green-d)' }}>@{detail.handle}</p>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 24, textAlign: 'right' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)' }}>Gastado</p>
                    <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{bs(detail.spend)}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)' }}>Órdenes</p>
                    <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{detail.orders}</p>
                  </div>
                </div>
              </div>

              <div ref={scroller} style={{ flex: 1, overflowY: 'auto', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {thread.length === 0 ? (
                  <p style={{ margin: 'auto', fontSize: 13.5, color: 'var(--muted)', textAlign: 'center', maxWidth: 260 }}>
                    Todavía no hablaste con {detail.name.split(' ')[0]}. Escribile para coordinar el envío.
                  </p>
                ) : (
                  thread.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        alignSelf: message.from === 'seller' ? 'flex-end' : 'flex-start',
                        maxWidth: '75%', padding: '10px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.45,
                        background: message.from === 'seller' ? 'var(--green-soft)' : 'var(--sand)',
                        border: `1px solid ${message.from === 'seller' ? 'var(--green-border)' : 'var(--line)'}`,
                      }}
                    >
                      {message.text}
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <input
                  className="input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                  placeholder="Escribí un mensaje…"
                  aria-label={`Mensaje para ${detail.name}`}
                />
                <button className="btn" onClick={send} disabled={!draft.trim()} aria-label="Enviar mensaje" style={{ padding: '0 16px' }}>
                  <Icon name="send" size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
