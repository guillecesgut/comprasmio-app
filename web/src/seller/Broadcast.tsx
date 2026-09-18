import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, bs, clock, realtime, Mode, MODE } from '../api';
import { Icon, ModeChip, ErrorNote, Empty, Thumb } from '../components/shared';
import { useBroadcast, useLiveAvailable } from '../live';

/**
 * Transmisión desde el navegador. La cámara sale de getUserMedia y viaja por
 * WebRTC hasta la sala, vía LiveKit. Sin credenciales configuradas, la pantalla
 * lo dice y el resto del control del vivo sigue funcionando igual.
 */
export function Broadcast() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const liveAvailable = useLiveAvailable();
  const { videoRef, status, error, muted, start, stop, toggleMute, flip, setError } = useBroadcast(id);

  const [lot, setLot] = React.useState<any>(null);
  const [viewers, setViewers] = React.useState(0);
  const [messages, setMessages] = React.useState<any[]>([]);
  const [queue, setQueue] = React.useState<any[]>([]);
  const [picker, setPicker] = React.useState(false);
  const [outcome, setOutcome] = React.useState<any>(null);
  const [warning, setWarning] = React.useState<string | null>(null);
  const [advancing, setAdvancing] = React.useState(false);

  // Si el vendedor cambia de pestaña, el navegador suspende la cámara.
  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && status === 'live')
        setWarning('Si dejás esta pestaña, el navegador pausa la cámara y la sala deja de verte.');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [status]);

  React.useEffect(() => {
    api.stream(id).then(({ lot, messages, queue }) => {
      setLot(lot);
      setMessages(messages);
      setQueue(queue || []);
    }).catch(() => {});

    const off = realtime.subscribe(`stream:${id}`);
    const listeners = [
      realtime.on('lot:update', (p) => p.streamId === id && setLot(p.lot)),
      realtime.on('lot:tick', (p) => p.streamId === id && setLot((l: any) => (l ? { ...l, timer: p.timer, price: p.price } : l))),
      realtime.on('lot:closed', (p) => {
        if (p.streamId !== id) return;
        setLot(null);
        setOutcome(p.outcome);
      }),
      realtime.on('chat:new', (p) => p.streamId === id && setMessages((m) => [...m.slice(-40), p.message])),
      realtime.on('stream:viewers', (p) => p.streamId === id && setViewers(p.viewers)),
      realtime.on('queue:update', (p) => p.streamId === id && setQueue(p.queue)),
    ];
    return () => {
      off();
      listeners.forEach((s) => s());
    };
  }, [id]);

  const end = async () => {
    stop();
    await api.endStream(id).catch(() => {});
    navigate('/vender');
  };

  const closeLot = async () => {
    try {
      await api.closeLot(id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  /** El vendedor pide el siguiente producto de la cola cuando está listo para arrancar. */
  const nextFromQueue = async () => {
    setAdvancing(true);
    try {
      await api.nextInQueue(id);
      setOutcome(null); // el lote llega por el socket (lot:update)
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdvancing(false);
    }
  };

  const onAir = status === 'live';

  return (
    <div className="broadcast">
      <div className="broadcast__stage">
        <video ref={videoRef} autoPlay playsInline muted className="broadcast__video" />

        {!onAir && (
          <div className="broadcast__gate">
            <div className="card" style={{ padding: 26, maxWidth: 400, textAlign: 'center' }}>
              <div style={{ display: 'grid', placeItems: 'center', color: 'var(--green)' }}>
                <Icon name="camera" size={30} />
              </div>

              {liveAvailable === false ? (
                <>
                  <h2 style={{ margin: '14px 0 0', fontSize: 20, fontWeight: 600 }}>Falta configurar el video</h2>
                  <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                    El servidor no tiene las claves de LiveKit. Podés igual abrir lotes y recibir pujas:
                    la sala va a mostrar el bloque de color en lugar de tu cámara.
                  </p>
                </>
              ) : (
                <>
                  <h2 style={{ margin: '14px 0 0', fontSize: 20, fontWeight: 600 }}>Necesitamos tu cámara</h2>
                  <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                    El navegador te va a pedir permiso. Se apaga sola cuando cerrás la transmisión.
                  </p>
                </>
              )}

              <ErrorNote message={error} />

              {liveAvailable !== false && (
                <button className="btn" onClick={start} disabled={status === 'connecting'} style={{ width: '100%', marginTop: 16 }}>
                  {status === 'connecting' ? 'Conectando…' : status === 'error' ? 'Reintentar' : 'Salir al aire'}
                </button>
              )}
              <button className="btn btn--outline" onClick={end} style={{ width: '100%', marginTop: 10 }}>
                {liveAvailable === false ? 'Seguir sin video' : 'Cancelar'}
              </button>
            </div>
          </div>
        )}

        <div className="broadcast__hud">
          <span className="room__live"><span className="room__dot" /> {onAir ? 'AL AIRE' : 'PREPARANDO'}</span>
          <span className="room__pill"><Icon name="users" size={13} /> {viewers}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="broadcast__ctrl" onClick={flip} aria-label="Cambiar de cámara" disabled={!onAir}>
              <Icon name="radio" size={16} />
            </button>
            <button
              className="broadcast__ctrl"
              onClick={toggleMute}
              aria-label={muted ? 'Activar micrófono' : 'Silenciar micrófono'}
              disabled={!onAir}
              style={{ background: muted ? 'var(--orange)' : undefined }}
            >
              <Icon name="radio" size={16} />
            </button>
            <button className="broadcast__end" onClick={end}>Terminar</button>
          </div>
        </div>

        {onAir && (warning || error) && (
          <p className="broadcast__warn" onClick={() => { setWarning(null); setError(null); }}>
            {warning || error}
          </p>
        )}
      </div>

      <aside className="broadcast__panel card">
        <header style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <strong style={{ fontSize: 15 }}>Control del vivo</strong>
        </header>

        <div style={{ padding: 16, borderBottom: '1px solid var(--line)' }}>
          {lot ? (
            <LotPanel lot={lot} onClose={closeLot} />
          ) : (
            <NextPanel
              outcome={outcome}
              nextProduct={queue[0] || null}
              queueLeft={queue.length}
              busy={advancing}
              onNext={nextFromQueue}
              onPick={() => setPicker(true)}
            />
          )}
        </div>

        {queue.length > 0 && (
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              Siguen en la cola · {queue.length}
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {queue.slice(0, 4).map((product: any, i: number) => (
                <div key={product.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 18, fontSize: 11.5, color: 'var(--muted)', textAlign: 'right', flex: 'none' }}>{i + 1}</span>
                  <Thumb grad={product.grad} size={28} />
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</span>
                  <ModeChip mode={product.mode as Mode} />
                </div>
              ))}
              {queue.length > 4 && (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>y {queue.length - 4} más…</p>
              )}
            </div>
          </div>
        )}

        <div className="broadcast__chat">
          {messages.map((m) => (
            <p key={m.id} style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
              <strong style={{ color: m.system ? 'var(--orange-d)' : 'var(--muted)' }}>{m.handle}</strong>{' '}
              {m.text}
            </p>
          ))}
        </div>
      </aside>

      {picker && <ProductPicker streamId={id} onClose={() => setPicker(false)} onError={setError} />}
    </div>
  );
}

function LotPanel({ lot, onClose }: { lot: any; onClose: () => void }) {
  const isAuction = lot.mode === 'auction';
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <ModeChip mode={lot.mode as Mode} />
        <span style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lot.productName}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: '-.5px' }}>{bs(lot.price)}</p>
      <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--muted)' }}>
        {isAuction
          ? lot.leaderHandle ? `@${lot.leaderHandle} va ganando` : 'Aún sin pujas'
          : `${lot.sold} de ${lot.stock} vendidas · ${bs(lot.sold * lot.price)}`}
      </p>
      {isAuction && (
        <p className="mono" style={{ margin: '10px 0 0', fontSize: 20, color: lot.timer <= 5 ? 'var(--orange-d)' : 'var(--ink)' }}>
          {clock(lot.timer)}
        </p>
      )}
      {!isAuction && (
        <div className="progress" style={{ marginTop: 12 }}>
          <div style={{ width: `${lot.stock ? (lot.sold / lot.stock) * 100 : 0}%` }} />
        </div>
      )}
      <button className="btn btn--outline" onClick={onClose} style={{ width: '100%', marginTop: 14 }}>
        {isAuction ? 'Cerrar lote' : 'Cerrar oferta'}
      </button>
    </>
  );
}

/**
 * Cubre las tres situaciones en que no hay un lote en el aire: recién llegado
 * con una cola armada, justo después de que cerró un lote, o sin nada
 * preparado. En todas, el vendedor decide cuándo sale el siguiente producto.
 */
function NextPanel({ outcome, nextProduct, queueLeft, busy, onNext, onPick }: any) {
  return (
    <>
      {outcome ? (
        <>
          <strong style={{ fontSize: 15 }}>
            {outcome.type === 'won' ? 'Lote vendido' : outcome.type === 'no_sale' ? 'Sin venta' : 'Oferta cerrada'}
          </strong>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            {outcome.type === 'won'
              ? `@${outcome.winnerHandle} se llevó ${outcome.productName} por ${bs(outcome.price)}.`
              : outcome.type === 'no_sale'
                ? `La puja llegó a ${bs(outcome.price)} y tu mínimo era ${bs(outcome.min)}. No se vendió.`
                : `Vendiste ${outcome.sold} unidades por ${bs(outcome.revenue)}.`}
          </p>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)' }}>
          {nextProduct ? `Tenés ${queueLeft} producto${queueLeft === 1 ? '' : 's'} listo${queueLeft === 1 ? '' : 's'} en cola.` : 'No tenés ningún lote en el aire.'}
        </p>
      )}

      {nextProduct ? (
        <button className="btn btn--orange" onClick={onNext} disabled={busy} style={{ width: '100%', marginTop: 14 }}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {busy ? 'Abriendo…' : `Iniciar subasta: ${nextProduct.name}`}
          </span>
        </button>
      ) : (
        <button className="btn" onClick={onPick} style={{ width: '100%', marginTop: 14 }}>
          Elegir producto
        </button>
      )}
    </>
  );
}

function ProductPicker({ streamId, onClose, onError }: { streamId: string; onClose: () => void; onError: (m: string) => void }) {
  const [products, setProducts] = React.useState<any[] | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.products()
      .then(({ products }) => setProducts(products.filter((p: any) => p.status !== 'sold')))
      .catch(() => setProducts([]));
  }, []);

  const pick = async (product: any) => {
    setBusyId(product.id);
    try {
      await api.openLot(streamId, product.id);
      onClose();
    } catch (e: any) {
      onError(e.message);
      onClose();
    }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Elegir producto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card sheet">
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>¿Qué vendés ahora?</h2>
        <p style={{ margin: '4px 0 16px', fontSize: 13.5, color: 'var(--muted)' }}>
          Se carga en tu transmisión con la forma de venta que configuraste.
        </p>

        {products === null ? (
          <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>Cargando catálogo…</p>
        ) : products.length === 0 ? (
          <Empty title="No tenés productos disponibles" body="Creá uno desde la sección Productos para poder ponerlo en el aire." />
        ) : (
          <div style={{ display: 'grid', gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => pick(product)}
                disabled={busyId === product.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: 12, textAlign: 'left',
                  border: '1px solid var(--line)', borderRadius: 'var(--radius-input)', background: 'var(--bg)',
                }}
              >
                <span className="thumb" style={{ width: 42, height: 42, background: product.grad, flex: 'none' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {product.name}
                  </strong>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <ModeChip mode={product.mode as Mode} />
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                      {product.mode === 'fixed'
                        ? `${bs(product.price)} · ${product.stock} u.`
                        : `Inicial ${bs(product.start)} · Mín. ${bs(product.min)}`}
                    </span>
                  </span>
                </span>
                <span
                  style={{
                    background: MODE[product.mode as Mode].accent, color: 'var(--card)', flex: 'none',
                    borderRadius: 'var(--radius-chip)', padding: '6px 11px', fontSize: 12.5, fontWeight: 600,
                  }}
                >
                  {MODE[product.mode as Mode].verb}
                </span>
              </button>
            ))}
          </div>
        )}

        <button className="btn btn--outline" onClick={onClose} style={{ width: '100%', marginTop: 14 }}>
          Volver a la transmisión
        </button>
      </div>
    </div>
  );
}
