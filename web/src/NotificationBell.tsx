import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api, realtime } from './api';
import { Icon } from './components/shared';

const relativo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
};

const ICON_BY_KIND: Record<string, { name: 'wallet' | 'send' | 'bell'; color: string }> = {
  pago_por_verificar: { name: 'wallet', color: 'var(--orange)' },
  pago_verificado: { name: 'wallet', color: 'var(--green)' },
  mensaje: { name: 'send', color: 'var(--green-forest)' },
};

/**
 * Campana del encabezado. Sirve a comprador y vendedor por igual: el servidor
 * ya decide a quién le manda cada aviso, así que acá solo se muestran los del
 * usuario logueado, en su canal `user:<id>` del socket.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = React.useState<any[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(() => {
    api.notifications()
      .then(({ notifications, unread }) => {
        setItems(notifications);
        setUnread(unread);
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    load();
    const offNew = realtime.on('notification:new', ({ notification }) => {
      setItems((current) => [notification, ...current]);
      setUnread((n) => n + 1);
    });
    // Mensajes seguidos del mismo chat actualizan la fila existente en vez de apilarse.
    const offUpdate = realtime.on('notification:update', ({ notification }) => {
      setItems((current) => [notification, ...current.filter((n) => n.id !== notification.id)]);
    });
    const offRead = realtime.on('notification:read', ({ unread }) => setUnread(unread));
    return () => {
      offNew();
      offUpdate();
      offRead();
    };
  }, [load]);

  // Cerrar al hacer clic afuera o con Escape.
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Abrir el panel cuenta como haberlas visto.
    if (next && unread > 0) {
      setUnread(0);
      setItems((current) => current.map((n) => ({ ...n, read: true })));
      api.markNotificationsRead().catch(() => {});
    }
  };

  const go = (item: any) => {
    setOpen(false);
    if (item.link) navigate(item.link);
  };

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <button
        className="icon-btn icon-btn--sm"
        onClick={toggle}
        aria-label={unread > 0 ? `Notificaciones: ${unread} sin leer` : 'Notificaciones'}
        aria-expanded={open}
        style={{ position: 'relative' }}
      >
        <Icon name="bell" size={16} />
        {unread > 0 && <span className="bell__dot">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="bell__panel card" role="dialog" aria-label="Notificaciones">
          <header className="bell__head">
            <strong style={{ fontSize: 14 }}>Notificaciones</strong>
          </header>

          <div className="bell__list">
            {items.length === 0 ? (
              <p style={{ margin: 0, padding: '28px 16px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
                No tenés notificaciones todavía.
              </p>
            ) : (
              items.map((item) => {
                const icon = ICON_BY_KIND[item.kind] || ICON_BY_KIND.mensaje;
                return (
                  <button key={item.id} className="bell__item" onClick={() => go(item)}>
                    <span className="bell__item-icon" style={{ background: icon.color }}>
                      <Icon name={icon.name} size={14} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                        <strong style={{ fontSize: 13.5 }}>{item.title}</strong>
                        <span style={{ fontSize: 11, color: 'var(--muted)', flex: 'none' }}>{relativo(item.at)}</span>
                      </span>
                      <span className="bell__item-body">
                        {item.count > 1 ? `${item.count} mensajes · ` : ''}{item.body}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
