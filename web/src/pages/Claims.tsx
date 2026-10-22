import React from 'react';
import { api, bs, hace, fecha, upload, notifyChanged } from '../api';
import { Chip, Confirm, Empty, ErrorLine, PageHead, ReceiptView, Seg, StatusChip, UploadButton, useLoad, useToast } from '../ui';

type Row = { id: string; orderId: string; ref: string; reason: string; status: string; seller: string; buyer: string; amount: number; createdAt: string; resolvedAt: string | null };

const REASON: Record<string, string> = { no_llego: 'No llegó', danado: 'Llegó dañado', no_es_lo_que_compre: 'No es lo que compré', otro: 'Otro motivo' };
const STATUS: Record<string, [string, string]> = {
  abierto: ['Abierto', 'red'], esperando_vendedor: ['Esperando al vendedor', 'amber'],
  resuelto_comprador: ['A favor del comprador', 'gray'], resuelto_vendedor: ['A favor del vendedor', 'green'],
};

/** F5 · Reclamos: el pago del pedido queda retenido hasta resolver. */
export default function Claims() {
  const [tab, setTab] = React.useState<'abiertos' | 'resueltos'>('abiertos');
  const [selected, setSelected] = React.useState<string | null>(null);
  const list = useLoad<Row[]>(() => api.get(`/claims?status=${tab}`).then((r) => r.claims), [tab]);
  const row = list.data?.find((c) => c.id === selected) || null;

  return (
    <>
      <PageHead title="Reclamos" subtitle="Mientras un reclamo está abierto, el pedido no entra en la liquidación del vendedor.">
        <Seg value={tab} onChange={(t) => { setTab(t); setSelected(null); }} options={[{ key: 'abiertos', label: 'Abiertos' }, { key: 'resueltos', label: 'Resueltos' }]} />
      </PageHead>
      <ErrorLine error={list.error} />
      <div className="split">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Pedido</th><th>Motivo</th><th>Vendedor</th><th>Comprador</th><th className="r">Monto</th><th>Estado</th><th>Abierto</th></tr></thead>
            <tbody>
              {list.data?.map((c) => (
                <tr key={c.id} className={`clickable${c.id === selected ? ' selected' : ''}`} onClick={() => setSelected(c.id)}>
                  <td className="mono">{c.ref}</td><td>{REASON[c.reason] || c.reason}</td><td>{c.seller}</td><td>@{c.buyer}</td>
                  <td className="r">{bs(c.amount)}</td><td><Chip tone={STATUS[c.status]?.[1]}>{STATUS[c.status]?.[0] || c.status}</Chip></td>
                  <td className="small">{tab === 'abiertos' ? hace(c.createdAt) : fecha(c.resolvedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data?.length === 0 && <Empty>{tab === 'abiertos' ? 'No hay reclamos abiertos.' : 'Todavía no hay reclamos resueltos.'}</Empty>}
        </div>
        {row && <ClaimPanel key={row.id} row={row} onDone={() => { list.reload(); notifyChanged(); }} />}
      </div>
    </>
  );
}

function ClaimPanel({ row, onDone }: { row: Row; onDone: () => void }) {
  const { data: o, error, reload } = useLoad<any>(() => api.get(`/orders/${row.orderId}`).then((r) => r.order), [row.orderId]);
  const [resolve, setResolve] = React.useState<'comprador' | 'vendedor' | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const toast = useToast();
  const open = ['abierto', 'esperando_vendedor'].includes(row.status);

  const ask = async () => {
    setBusy(true);
    setActionError(null);
    try { await api.post(`/claims/${row.id}/ask-seller`); toast('Le pedimos su respuesta al vendedor'); onDone(); }
    catch (e: any) { setActionError(e.message); } finally { setBusy(false); }
  };

  return (
    <aside className="card detail stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="mono" style={{ fontSize: 18 }}>{row.ref}</h2>
        <Chip tone={STATUS[row.status]?.[1]}>{STATUS[row.status]?.[0]}</Chip>
      </div>
      <ErrorLine error={error || actionError} />
      {o && o.claim && (
        <>
          <dl className="kv">
            <dt>Motivo</dt><dd>{REASON[o.claim.reason]}</dd>
            <dt>Pedido</dt><dd><StatusChip status={o.status} /></dd>
            <dt>Total</dt><dd>{bs(o.total)}</dd>
            <dt>Vendedor</dt><dd>{o.seller.name}</dd>
            <dt>Comprador</dt><dd>{o.buyer.name} · {o.phone}</dd>
          </dl>
          <p className="note">{o.claim.description || 'Sin descripción.'}</p>
          {o.claim.photos.length > 0 && (
            <div className="row">{o.claim.photos.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Foto del reclamo" className="thumb" style={{ width: 88, height: 88 }} /></a>)}</div>
          )}
          {o.claim.resolutionNote && <p className="note">Resolución: {o.claim.resolutionNote}{o.claim.refund ? ` · Reembolso ${bs(o.claim.refund)}` : ''}</p>}
          {open && (
            <div className="stack" style={{ gap: 8 }}>
              {row.status === 'abierto' && <button className="btn outline" disabled={busy} onClick={ask}>Pedir respuesta al vendedor</button>}
              <div className="row">
                <button className="btn primary" style={{ flex: 1 }} onClick={() => setResolve('comprador')}>A favor del comprador</button>
                <button className="btn outline" style={{ flex: 1 }} onClick={() => setResolve('vendedor')}>A favor del vendedor</button>
              </div>
            </div>
          )}
        </>
      )}
      {resolve && o && (
        <ResolveModal claimId={row.id} order={o} outcome={resolve} onClose={() => setResolve(null)}
          onDone={() => { setResolve(null); toast('Reclamo resuelto'); reload(); onDone(); }} />
      )}
    </aside>
  );
}

function ResolveModal({ claimId, order, outcome, onClose, onDone }: { claimId: string; order: any; outcome: 'comprador' | 'vendedor'; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = React.useState('');
  const [refund, setRefund] = React.useState(String(order.total));
  const [restock, setRestock] = React.useState(false);
  const [receipt, setReceipt] = React.useState<{ key: string; url: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const amount = Number(refund);
  const buyer = outcome === 'comprador';
  return (
    <Confirm title={buyer ? 'Resolver a favor del comprador' : 'Resolver a favor del vendedor'} busy={busy} tone={buyer ? 'danger' : 'primary'}
      confirmLabel={buyer ? `Registrar reembolso de ${bs(amount || 0)}` : 'Liberar el pago al vendedor'}
      disabled={buyer && (!receipt || !(amount > 0 && amount <= order.total))} onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        setError(null);
        try {
          await api.post(`/claims/${claimId}/resolve`, buyer ? { outcome, note, refund: amount, refundReceiptKey: receipt?.key, restock } : { outcome, note });
          onDone();
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
      }}>
      {buyer ? (
        <>
          <p className="muted">El pedido se cancela y no entra en la liquidación del vendedor. Transferí el reembolso al comprador y subí el comprobante.</p>
          <label className="field"><span>Monto a reembolsar (Bs)</span><input type="number" min={0} max={order.total} step="0.01" value={refund} onChange={(e) => setRefund(e.target.value)} /><small>Máximo {bs(order.total)}</small></label>
          {receipt ? <ReceiptView url={receipt.url} /> : <UploadButton folder="refunds" accept="image/*,application/pdf" label="Subir comprobante del reembolso" uploadFn={upload} onUploaded={setReceipt} />}
          <label className="check"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> El producto vuelve al vendedor: sumar al stock</label>
        </>
      ) : (
        <p className="muted">El pedido vuelve a “Entregado” y entra en la próxima liquidación del vendedor.</p>
      )}
      <label className="field"><span>Nota para ambas partes</span><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>
      <ErrorLine error={error} />
    </Confirm>
  );
}
