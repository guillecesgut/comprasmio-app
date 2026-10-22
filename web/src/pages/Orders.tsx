import React from 'react';
import { api, bs, fechaHora, upload, notifyChanged } from '../api';
import { Chip, Confirm, Empty, ErrorLine, PageHead, ReceiptView, StatusChip, UploadButton, useLoad, useToast, ORDER_STATUS } from '../ui';

type Row = { id: string; ref: string; status: string; channel: string; seller: string; buyer: string; total: number; commission: number; createdAt: string };

const CHANNEL: Record<string, string> = { catalogo: 'Catálogo', subasta: 'Subasta en vivo', fijo: 'Precio fijo en vivo' };
const PAYOUT_LABEL: Record<string, string> = { acumulando: 'Acumulando para el próximo pago', retenida: 'Retenida por reclamo', programada: 'Programada', pagada: 'Pagada' };

/** F3 · Pedidos: búsqueda, filtros y detalle con cancelación (con reembolso si ya estaba pagado). */
export default function Orders() {
  const [filters, setFilters] = React.useState({ q: '', status: '', channel: '', from: '', to: '' });
  const [selected, setSelected] = React.useState<string | null>(null);
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const list = useLoad<Row[]>(() => api.get(`/orders?${qs}`).then((r) => r.orders), [qs]);
  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHead title="Pedidos" subtitle="Todos los pedidos del catálogo y de los vivos." />
      <div className="row" style={{ marginBottom: 14 }}>
        <input type="search" className="search" placeholder="Referencia o @comprador" value={filters.q} onChange={set('q')} aria-label="Buscar" />
        <select value={filters.status} onChange={set('status')} style={{ width: 200 }} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filters.channel} onChange={set('channel')} style={{ width: 190 }} aria-label="Canal">
          <option value="">Todos los canales</option>
          {Object.entries(CHANNEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" value={filters.from} onChange={set('from')} style={{ width: 160 }} aria-label="Desde" />
        <input type="date" value={filters.to} onChange={set('to')} style={{ width: 160 }} aria-label="Hasta" />
      </div>
      <ErrorLine error={list.error} />
      <div className="split">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Pedido</th><th>Estado</th><th>Vendedor</th><th>Comprador</th><th>Canal</th><th className="r">Total</th><th className="r">Comisión</th><th>Fecha</th></tr></thead>
            <tbody>
              {list.data?.map((o) => (
                <tr key={o.id} className={`clickable${o.id === selected ? ' selected' : ''}`} onClick={() => setSelected(o.id)}>
                  <td className="mono">{o.ref}</td>
                  <td><StatusChip status={o.status} /></td>
                  <td>{o.seller}</td>
                  <td>@{o.buyer}</td>
                  <td className="small">{CHANNEL[o.channel] || o.channel}</td>
                  <td className="r">{bs(o.total)}</td>
                  <td className="r muted">{bs(o.commission)}</td>
                  <td className="small">{fechaHora(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data?.length === 0 && <Empty>No hay pedidos con esos filtros.</Empty>}
        </div>
        {selected && <OrderPanel key={selected} id={selected} onChanged={list.reload} onClose={() => setSelected(null)} />}
      </div>
    </>
  );
}

export function OrderPanel({ id, onChanged, onClose }: { id: string; onChanged: () => void; onClose: () => void }) {
  const { data: o, error, reload } = useLoad<any>(() => api.get(`/orders/${id}`).then((r) => r.order), [id]);
  const [cancel, setCancel] = React.useState(false);
  const toast = useToast();
  if (error) return <aside className="card detail"><ErrorLine error={error} /></aside>;
  if (!o) return <aside className="card detail"><Empty>Cargando…</Empty></aside>;
  const paid = ['pagado', 'preparando', 'enviado', 'entregado', 'en_reclamo'].includes(o.status);
  const canCancel = !['cancelado', 'vencido'].includes(o.status) && !(o.payout && o.payout.id);

  return (
    <aside className="card detail stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="mono" style={{ fontSize: 18 }}>{o.ref}</h2>
        <button className="btn ghost small" onClick={onClose}>Cerrar</button>
      </div>
      <div className="row"><StatusChip status={o.status} /><Chip tone="dim">{CHANNEL[o.channel] || o.channel}</Chip></div>
      <dl className="kv">
        <dt>Vendedor</dt><dd>{o.seller.name}</dd>
        <dt>Comprador</dt><dd>{o.buyer.name} · @{o.buyer.handle}</dd>
        <dt>Teléfono</dt><dd>{o.phone || '—'}</dd>
        <dt>Entrega</dt><dd>{o.deliveryMethod === 'retiro' ? 'Retiro en persona' : o.address ? [o.address.street, o.address.zone, o.address.city].filter(Boolean).join(', ') : '—'}</dd>
        {o.tracking && <><dt>Envío</dt><dd>{[o.carrier, o.tracking].filter(Boolean).join(' · ')}</dd></>}
      </dl>
      <div className="stack" style={{ gap: 8 }}>
        {o.items.map((i: any) => (
          <div key={i.id} className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <div className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
              {i.photoUrl ? <img className="thumb" src={i.photoUrl} alt="" /> : <div className="thumb" style={{ background: i.color || undefined }} />}
              <div style={{ minWidth: 0 }}><div className="small"><strong>{i.title}</strong></div><div className="small muted">{i.label} · {i.qty} × {bs(i.unitPrice)}</div></div>
            </div>
            <span className="num">{bs(i.total)}</span>
          </div>
        ))}
      </div>
      <dl className="kv">
        <dt>Subtotal</dt><dd>{bs(o.subtotal)}</dd>
        <dt>Envío</dt><dd>{o.shipping ? bs(o.shipping) : o.shippingMode === 'a_convenir' ? 'A convenir' : 'Gratis'}</dd>
        <dt><strong>Total</strong></dt><dd><strong>{bs(o.total)}</strong></dd>
        <dt>Comisión ({o.commissionPct} %)</dt><dd>− {bs(o.commission)}</dd>
        <dt>Neto vendedor</dt><dd>{bs(o.net)}</dd>
        <dt>Pago</dt><dd className="mono">{o.paymentRef}</dd>
        {o.payout && <><dt>Liquidación</dt><dd>{PAYOUT_LABEL[o.payout.status] || o.payout.status}</dd></>}
      </dl>
      {o.receiptUrl && <details><summary className="small">Ver comprobante del comprador</summary><ReceiptView url={o.receiptUrl} /></details>}
      <div>
        <strong className="small">Historial</strong>
        <ul className="timeline" style={{ marginTop: 8 }}>
          {o.events.map((e: any, n: number) => (
            <li key={n}><span className="dot" /><span className="small">{ORDER_STATUS[e.status]?.label || e.status}{e.note && <span className="muted"> · {e.note}</span>}</span><span className="small muted">{fechaHora(e.at)}</span></li>
          ))}
        </ul>
      </div>
      {o.claim && <p className="note amber">Este pedido tiene un reclamo ({o.claim.status.replace('_', ' ')}). Resolvelo desde Reclamos.</p>}
      {canCancel && <button className="btn outline" onClick={() => setCancel(true)}>Cancelar pedido</button>}
      {cancel && <CancelModal order={o} paid={paid} onClose={() => setCancel(false)} onDone={() => { setCancel(false); toast(`Pedido ${o.ref} cancelado`); reload(); onChanged(); notifyChanged(); }} />}
    </aside>
  );
}

function CancelModal({ order, paid, onClose, onDone }: { order: any; paid: boolean; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState('');
  const [restock, setRestock] = React.useState(true);
  const [receipt, setReceipt] = React.useState<{ key: string; url: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <Confirm title={`Cancelar ${order.ref}`} tone="danger" busy={busy}
      confirmLabel={paid ? `Cancelar y registrar reembolso de ${bs(order.total)}` : 'Cancelar pedido'}
      disabled={!reason.trim() || (paid && !receipt)} onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        setError(null);
        try {
          await api.post(`/orders/${order.id}/cancel`, { reason, restock, refundReceiptKey: receipt?.key });
          onDone();
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
      }}>
      <label className="field"><span>Motivo (lo ven comprador y vendedor)</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></label>
      {paid && (
        <>
          <p className="note amber">Este pedido ya estaba pagado. Hacé la devolución de {bs(order.total)} al comprador y subí el comprobante.</p>
          {receipt ? <ReceiptView url={receipt.url} alt="Comprobante de reembolso" /> : (
            <UploadButton folder="refunds" accept="image/*,application/pdf" label="Subir comprobante del reembolso" uploadFn={upload} onUploaded={setReceipt} />
          )}
          <label className="check"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Devolver las unidades al stock del vendedor</label>
        </>
      )}
      <ErrorLine error={error} />
    </Confirm>
  );
}
