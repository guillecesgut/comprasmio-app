import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, bs, clock, realtime, Mode } from '../api';
import { useSession } from '../session';
import { Icon, ModeChip, ErrorNote, Thumb } from '../components/shared';
import { PayDialog } from './Pay';
import { useViewer, useLiveAvailable } from '../live';

const URGENT_AT = 5; // segundos finales: el reloj se pone ámbar y el botón late

export function Room() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user, favorites, toggleFavorite } = useSession();

  const [stream, setStream] = React.useState<any>(null);
  const [lot, setLot] = React.useState<any>(null);
  const [queue, setQueue] = React.useState<any[]>([]);
  const [showCatalog, setShowCatalog] = React.useState(false);
  const [messages, setMessages] = React.useState<any[]>([]);
  const [draft, setDraft] = React.useState('');
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [payOrder, setPayOrder] = React.useState<any>(null);
  const chatRef = React.useRef<HTMLDivElement>(null);

  // El video es un extra: si no hay, la sala funciona igual con el bloque de color.
  const liveAvailable = useLiveAvailable();
  const { videoRef, status: videoStatus } = useViewer(id, liveAvailable === true && !!user);

  React.useEffect(() => {
    let alive = true;
    api
      .stream(id)
      .then(({ stream, lot, messages, queue }) => {
        if (!alive) return;
        setStream(stream);
        setLot(lot);
        setMessages(messages);
        setQueue(queue || []);
      })
      .catch((e) => setNotice(e.message));

    const off = realtime.subscribe(`stream:${id}`);
    const listeners = [
      realtime.on('lot:update', (p) => p.streamId === id && setLot(p.lot)),
      realtime.on('lot:tick', (p) =>
        p.streamId === id && setLot((l: any) => (l ? { ...l, timer: p.timer, price: p.price } : l))
      ),
      realtime.on('lot:closed', (p) => {
        if (p.streamId !== id) return;
        setLot(null);
        if (p.outcome?.type === 'no_sale') setNotice('El lote cerró sin alcanzar el precio mínimo.');
        if (p.outcome?.type === 'offer_closed') setNotice('La oferta se cerró.');
      }),
      realtime.on('chat:new', (p) => p.streamId === id && setMessages((m) => [...m.slice(-80), p.message])),
      realtime.on('stream:viewers', (p) =>
        p.streamId === id && setStream((s: any) => (s ? { ...s, viewers: p.viewers } : s))
      ),
      realtime.on('auction:won', ({ order }) => setPayOrder(order)),
      realtime.on('purchase:done', ({ order }) => setPayOrder(order)),
      realtime.on('stream:ended', () => setNotice('La transmisión terminó.')),
      realtime.on('queue:update', (p) => p.streamId === id && setQueue(p.queue)),
    ];
    return () => {
      alive = false;
      off();
      listeners.forEach((stop) => stop());
    };
  }, [id]);

  React.useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [messages]);

  const requireLogin = () => {
    navigate('/entrar', { state: { from: `/vivo/${id}` } });
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return requireLogin();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await api.chat(id, text).catch(() => {});
  };

  const bid = async () => {
    if (!user) return requireLogin();
    setBusy(true);
    try {
      const { lot: updated } = await api.bid(id, lot.price + lot.increment);
      setLot(updated);
      setNotice(null);
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };

  const buy = async () => {
    if (!user) return requireLogin();
    setBusy(true);
    try {
      const { order } = await api.buy(id);
      setPayOrder(order);
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!stream) return <p style={{ color: 'var(--muted)', padding: 24 }}>Cargando la sala…</p>;

  const favorite = favorites.includes(stream.id);

  return (
    <div className="room">
      <div className="room__stage">
        <div className="room__video" style={{ background: stream.grad || 'var(--green-forest)' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="room__player"
            style={{ display: videoStatus === 'live' ? 'block' : 'none' }}
          />
          {videoStatus !== 'live' && stream.tag && <span className="room__tag">{stream.tag}</span>}
          {videoStatus === 'connecting' && <span className="room__hint">Conectando con el video…</span>}
          {videoStatus === 'waiting' && <span className="room__hint">El vendedor todavía no abrió su cámara</span>}

          <div className="room__topbar">
            <Link to="/" className="room__round" aria-label="Volver al inicio">
              <Icon name="back" size={17} />
            </Link>
            <span className="room__live">
              <span className="room__dot" /> EN VIVO
            </span>
            <span className="room__pill">
              <Icon name="users" size={13} /> {stream.viewers}
            </span>
            {queue.length > 0 && (
              <button className="room__catalog" onClick={() => setShowCatalog(true)}>
                <Icon name="box" size={13} /> Catálogo <span className="room__catalog-count">{queue.length}</span>
              </button>
            )}
          </div>

          <div className="room__seller">
            <span className="room__avatar">{stream.seller?.initials}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{stream.seller?.name}</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--orange-l)' }}>★ {stream.seller?.rating}%</p>
            </div>
            {user && (
              <button
                onClick={() => toggleFavorite(stream.id)}
                className="room__follow"
                style={{ background: favorite ? 'rgba(255,253,250,.18)' : 'transparent' }}
              >
                {favorite ? 'Siguiendo' : 'Seguir'}
              </button>
            )}
          </div>

          {/* Solo en móvil (ver theme.css): flota sobre el video, acotado a su propia caja. */}
          <div className="room__overlay-messages">
            {messages.slice(-6).map((m) => (
              <p key={m.id} className="room__overlay-msg">
                <strong>{m.handle === user?.handle ? 'Tú' : m.handle}</strong> {m.text}
              </p>
            ))}
          </div>
        </div>

        {/* Solo en móvil: renglón propio entre el video y el dock, nunca superpuesto a ninguno. */}
        <form onSubmit={send} className="room__mobile-composer">
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={user ? 'Escribí un comentario…' : 'Entrá para comentar'}
            aria-label="Comentario"
          />
          <button className="btn" aria-label="Enviar">
            <Icon name="send" size={16} />
          </button>
        </form>

        <Dock lot={lot} userId={user?.id} busy={busy} notice={notice} onBid={bid} onBuy={buy} />
      </div>

      <aside className="room__chat card">
        <header style={{ padding: '13px 16px', borderBottom: '1px solid var(--line)', fontWeight: 600, fontSize: 14 }}>
          Chat de la sala
        </header>

        <div ref={chatRef} className="room__messages">
          {messages.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 'auto', textAlign: 'center' }}>
              Todavía no hay mensajes. Saludá al vendedor.
            </p>
          ) : (
            messages.map((m) => (
              <p key={m.id} style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
                <strong style={{ color: m.system ? 'var(--orange-d)' : m.seller ? 'var(--green-d)' : 'var(--muted)' }}>
                  {m.handle === user?.handle ? 'Tú' : m.handle}
                </strong>{' '}
                <span style={{ color: m.system ? 'var(--orange-d)' : 'var(--ink)' }}>{m.text}</span>
              </p>
            ))
          )}
        </div>

        <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line)' }}>
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={user ? 'Escribí un comentario…' : 'Entrá para comentar'}
            aria-label="Comentario"
            style={{ height: 42 }}
          />
          <button className="btn" style={{ height: 42, padding: '0 14px' }} aria-label="Enviar">
            <Icon name="send" size={16} />
          </button>
        </form>
      </aside>

      {payOrder && <PayDialog order={payOrder} onClose={() => setPayOrder(null)} />}
      {showCatalog && <CatalogSheet queue={queue} onClose={() => setShowCatalog(false)} />}
    </div>
  );
}

function Dock({ lot, userId, busy, notice, onBid, onBuy }: any) {
  if (!lot) {
    return (
      <div className="room__dock">
        <p style={{ margin: 0, fontWeight: 600 }}>El vendedor todavía no puso un lote en el aire</p>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--on-dark-muted)' }}>
          Quedate en la sala: el próximo producto aparece acá.
        </p>
      </div>
    );
  }

  const isAuction = lot.mode === 'auction';
  const leader = lot.leaderId === userId;
  const left = isAuction ? 0 : lot.stock - lot.sold;
  const urgent = isAuction ? lot.timer <= URGENT_AT && lot.timer > 0 : left <= 3;

  return (
    <div className="room__dock">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: '.5px', color: 'var(--on-dark-muted)' }}>
            {isAuction ? 'PUJA ACTUAL' : 'PRECIO FIJO'}
          </span>
          <p style={{ margin: '2px 0 0', fontSize: 32, fontWeight: 700, letterSpacing: '-.6px' }}>{bs(lot.price)}</p>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: leader ? '#7FD8B8' : 'var(--on-dark-muted)' }}>
            {isAuction
              ? leader
                ? 'Vas ganando'
                : lot.leaderHandle
                  ? `@${lot.leaderHandle} va ganando`
                  : 'Todavía nadie pujó'
              : lot.lastBuyerHandle
                ? `Última compra: @${lot.lastBuyerHandle}`
                : 'Sin pujas · lo compra quien llega primero'}
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lot.productName}
          </p>
        </div>

        <div style={{ textAlign: 'right', flex: 'none' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--on-dark-muted)' }}>QUEDAN</span>
          <p className="mono" style={{ margin: 0, fontSize: 22, color: urgent ? 'var(--orange-l)' : 'var(--card)' }}>
            {isAuction ? clock(lot.timer) : `${left} u.`}
          </p>
          <span className="mono" style={{ fontSize: 10, color: 'var(--on-dark-muted)' }}>{lot.lotNo}</span>
        </div>
      </div>

      {notice && <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--orange-l)', fontWeight: 500 }}>{notice}</p>}

      <button
        className={`btn ${isAuction ? 'btn--orange' : ''} ${urgent && isAuction ? 'btn--pulse' : ''}`}
        onClick={isAuction ? onBid : onBuy}
        disabled={busy || (!isAuction && left <= 0)}
        style={{ width: '100%', height: 54, marginTop: 14, fontSize: 17 }}
      >
        {isAuction
          ? `¡Mío! ${bs(lot.price + lot.increment)}`
          : left > 0
            ? `Comprar ya ${bs(lot.price)}`
            : 'Agotado'}
      </button>
    </div>
  );
}

/** Vitrina de lo que el vendedor precargó para este vivo: genera expectativa antes de que salga al aire. */
function CatalogSheet({ queue, onClose }: { queue: any[]; onClose: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Catálogo de subasta" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card sheet">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Catálogo de esta transmisión</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--muted)' }}>
              Estos productos ya están anotados para salir al aire, en este orden.
            </p>
          </div>
          <button className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 14, maxHeight: '60vh', overflowY: 'auto' }}>
          {queue.map((product: any, i: number) => (
            <div
              key={product.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 'var(--radius-input)', border: '1px solid var(--line)' }}
            >
              <span style={{ width: 20, fontSize: 12, color: 'var(--muted)', textAlign: 'right', flex: 'none' }}>{i + 1}</span>
              <Thumb grad={product.grad} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {product.name}
                </strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <ModeChip mode={product.mode as Mode} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {product.mode === 'fixed' ? `${bs(product.price)} · ${product.stock} u.` : `Sale desde ${bs(product.start)}`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
