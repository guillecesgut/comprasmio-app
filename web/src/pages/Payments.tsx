import React from 'react';
import { api, bs, fechaHora, hace, onSocket, notifyChanged } from '../api';
import { Chip, Confirm, Empty, ErrorLine, PageHead, ReceiptView, Seg, StatusChip, useLoad, useToast } from '../ui';

type Row = {
  id: string; ref: string; kind: 'orders' | 'plan'; status: string; amount: number;
  buyer: { name: string; handle: string; phone: string }; ordersCount: number; sellers: string;
  receiptAt: string | null; createdAt: string; expiresAt: string | null; rejectReason: string | null; receiptUrl: string | null;
};
type Detail = {
  id: string; ref: string; amount: number; status: string; receiptUrl: string | null; receiptAt: string | null;
  qr: { bank: string; holder: string; account: string } | null;
  orders: { id: string; ref: string; status: string; seller: string; total: number; channel: string }[];
};

type Tab = 'in_review' | 'approved' | 'rejected' | 'expired';
const STATUS_CHIP: Record<string, [string, string]> = {
  in_review: ['En revisión', 'green'], approved: ['Aprobado', 'solid'], pending: ['Rechazado · esperando nuevo comprobante', 'amber'],
  expired: ['Vencido', 'dim'],
};
const REASONS = ['El monto no coincide', 'El comprobante no se lee', 'No vemos la transferencia en la cuenta', 'El comprobante es de otra compra'];

/** F2 · Pagos por verificar: cola con el comprobante al lado y aprobación con el monto en el botón. */
export default function Payments() {
  const [tab, setTab] = React.useState<Tab>('in_review');
  const [selected, setSelected] = React.useState<string | null>(null);
  const list = useLoad<Row[]>(() => api.get(`/payments?status=${tab}`).then((r) => r.payments), [tab]);
  const toast = useToast();

  React.useEffect(() => onSocket('payment:new', () => tab === 'in_review' && list.reload()), [tab, list.reload]);
  React.useEffect(() => {
    // Selecciona el primero de la cola (el más antiguo) para revisar en orden.
    if (list.data && !list.data.some((p) => p.id === selected)) setSelected(list.data[0]?.id ?? null);
  }, [list.data, selected]);

  const row = list.data?.find((p) => p.id === selected) || null;

  return (
    <>
      <PageHead title="Pagos por verificar" subtitle="Compará el comprobante con la cuenta de ComprasMío! antes de aprobar.">
        <Seg value={tab} onChange={(t) => { setTab(t); setSelected(null); }} options={[
          { key: 'in_review', label: 'Por verificar' }, { key: 'approved', label: 'Aprobados' },
          { key: 'rejected', label: 'Rechazados' }, { key: 'expired', label: 'Vencidos' },
        ]} />
      </PageHead>
      <ErrorLine error={list.error} />
      <div className="split">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Referencia</th><th>Comprador</th><th>Vendedores</th><th className="r">Monto</th><th>{tab === 'in_review' ? 'Enviado' : 'Creado'}</th></tr>
            </thead>
            <tbody>
              {list.data?.map((p) => (
                <tr key={p.id} className={`clickable${p.id === selected ? ' selected' : ''}`} onClick={() => setSelected(p.id)}>
                  <td><span className="mono">{p.ref}</span>{p.kind === 'plan' && <> <Chip tone="amber">Plan</Chip></>}</td>
                  <td>{p.buyer.name}<div className="small muted">@{p.buyer.handle}</div></td>
                  <td className="small">{p.sellers}{p.ordersCount > 1 && <div className="muted">{p.ordersCount} pedidos</div>}</td>
                  <td className="r"><strong>{bs(p.amount)}</strong></td>
                  <td className="small">{tab === 'in_review' ? hace(p.receiptAt) : fechaHora(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data?.length === 0 && <Empty>{tab === 'in_review' ? 'No hay pagos esperando. ¡Todo al día!' : 'Nada por acá.'}</Empty>}
        </div>
        {row && <PaymentPanel key={row.id} row={row} onDone={(msg) => { toast(msg); list.reload(); notifyChanged(); }} />}
      </div>
    </>
  );
}

function PaymentPanel({ row, onDone }: { row: Row; onDone: (msg: string) => void }) {
  const detail = useLoad<Detail>(() => api.get(`/payments/${row.id}`).then((r) => r.payment), [row.id]);
  const [modal, setModal] = React.useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const d = detail.data;
  const [label, tone] = STATUS_CHIP[row.status] || [row.status, 'dim'];

  const act = async (kind: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'approve') await api.post(`/payments/${row.id}/approve`);
      else await api.post(`/payments/${row.id}/reject`, { reason });
      setModal(null);
      onDone(kind === 'approve' ? `Pago ${row.ref} aprobado` : `Pago ${row.ref} rechazado`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="card detail stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="mono">{row.ref}</span>
        <Chip tone={tone}>{label}</Chip>
      </div>
      <div>
        <div className="small muted">Monto que debe figurar en el comprobante</div>
        <div className="big-amount">{bs(row.amount)}</div>
      </div>
      <ReceiptView url={row.receiptUrl} />
      <dl className="kv">
        <dt>Comprador</dt><dd>{row.buyer.name} · {row.buyer.phone}</dd>
        <dt>Comprobante</dt><dd>{fechaHora(row.receiptAt)}</dd>
        {d?.qr && <><dt>Cuenta de cobro</dt><dd>{d.qr.bank} · {d.qr.account}</dd></>}
        {row.rejectReason && <><dt>Motivo de rechazo</dt><dd>{row.rejectReason}</dd></>}
      </dl>
      {d && d.orders.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <strong className="small">Pedidos que cubre</strong>
          {d.orders.map((o) => (
            <div key={o.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span className="small"><span className="mono">{o.ref}</span> · {o.seller}{o.channel !== 'catalogo' && ' · en vivo'}</span>
              <span className="row small"><StatusChip status={o.status} /> {bs(o.total)}</span>
            </div>
          ))}
        </div>
      )}
      {row.status === 'in_review' && (
        <div className="row">
          <button className="btn primary" style={{ flex: 1 }} onClick={() => setModal('approve')}>Aprobar pago de {bs(row.amount)}</button>
          <button className="btn outline" onClick={() => { setReason(''); setModal('reject'); }}>Rechazar</button>
        </div>
      )}

      {modal === 'approve' && (
        <Confirm title={`¿Aprobar ${bs(row.amount)}?`} confirmLabel={`Aprobar pago de ${bs(row.amount)}`} busy={busy}
          onCancel={() => setModal(null)} onConfirm={() => act('approve')}>
          <p className="muted">Confirmá que el dinero ya está en la cuenta de ComprasMío!. Los vendedores reciben el aviso para preparar el pedido.</p>
          <ErrorLine error={error} />
        </Confirm>
      )}
      {modal === 'reject' && (
        <Confirm title="Rechazar comprobante" confirmLabel="Rechazar y avisar al comprador" tone="danger" busy={busy}
          disabled={!reason.trim()} onCancel={() => setModal(null)} onConfirm={() => act('reject')}>
          <p className="muted">El comprador recibe el motivo y un tiempo nuevo para enviar otro comprobante. Lo apartado se mantiene.</p>
          <div className="row">
            {REASONS.map((r) => <button key={r} type="button" className="btn small outline" onClick={() => setReason(r)}>{r}</button>)}
          </div>
          <label className="field"><span>Motivo</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></label>
          <ErrorLine error={error} />
        </Confirm>
      )}
    </aside>
  );
}
