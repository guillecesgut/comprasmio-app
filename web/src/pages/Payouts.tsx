import React from 'react';
import { api, bs, download, fecha, diaSemana, upload } from '../api';
import { Chip, Confirm, Empty, ErrorLine, PageHead, ReceiptView, UploadButton, useLoad, useToast } from '../ui';

type Bank = { bank: string; accountType: string; accountNumber: string; holder: string; holderDoc: string; verified: boolean } | null;
type Item = {
  id: string; sellerId: string; seller: string; status: 'programada' | 'pagada'; orders: number; gross: number; commission: number;
  net: number; held: number; bank: Bank; scheduledFor: string; paidAt: string | null; operationNumber: string | null; receiptUrl: string | null;
};
type Data = {
  period: { start: string; end: string; payOn: string }; pendingToCut: number;
  totals: { gross: number; commission: number; net: number; toTransfer: number };
  items: Item[]; weeks: { periodEnd: string; sellers: number; net: number; allPaid: boolean }[];
};

/** F4 · Liquidaciones semanales: corte lunes–domingo, transferencia el día de pago con comprobante. */
export default function Payouts() {
  const [periodEnd, setPeriodEnd] = React.useState<string>('');
  const { data, error, reload } = useLoad<Data>(() => api.get(`/payouts${periodEnd ? `?periodEnd=${periodEnd}` : ''}`), [periodEnd]);
  const [paying, setPaying] = React.useState<Item | null>(null);
  const [detail, setDetail] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const toast = useToast();

  const cut = async () => {
    if (!data) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.post('/payouts/cut', { periodEnd: data.period.end });
      toast('Corte generado');
      reload();
    } catch (e: any) { setActionError(e.message); } finally { setBusy(false); }
  };

  const weeks = data ? [...new Set([data.period.end, ...data.weeks.map((w) => w.periodEnd)])].sort().reverse() : [];

  return (
    <>
      <PageHead title="Liquidaciones" subtitle="Pagos semanales a vendedores: entra lo entregado de lunes a domingo; los pedidos con reclamo quedan retenidos.">
        <select value={data?.period.end || ''} onChange={(e) => setPeriodEnd(e.target.value)} style={{ width: 240 }} aria-label="Semana">
          {weeks.map((w) => <option key={w} value={w}>Semana al {fecha(w)}</option>)}
        </select>
        {data && <button className="btn outline" onClick={() => download(`/payouts/export?periodEnd=${data.period.end}`, `liquidaciones-${data.period.end}.csv`).catch((e) => setActionError(e.message))}>Exportar CSV</button>}
      </PageHead>
      <ErrorLine error={error || actionError} />
      {data && (
        <>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <div className="kpi"><span>Semana</span><strong style={{ fontSize: 20 }}>{fecha(data.period.start)} – {fecha(data.period.end)}</strong><em>Pago: {diaSemana(data.period.payOn)}</em></div>
            <div className="kpi"><span>Ventas entregadas</span><strong>{bs(data.totals.gross)}</strong><em>Comisión {bs(data.totals.commission)}</em></div>
            <div className="kpi dark"><span>Por transferir</span><strong>{bs(data.totals.toTransfer)}</strong><em>Neto total {bs(data.totals.net)}</em></div>
            <div className={`kpi${data.pendingToCut ? ' warn' : ''}`}><span>Pedidos sin corte</span><strong>{data.pendingToCut}</strong>
              <em>{data.pendingToCut ? <button className="btn small primary" disabled={busy} onClick={cut}>{busy ? 'Generando…' : 'Generar corte'}</button> : 'Todo incluido'}</em>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vendedor</th><th className="r">Pedidos</th><th className="r">Ventas</th><th className="r">Comisión</th><th className="r">Neto</th><th>Cuenta</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.seller}</strong>{p.held > 0 && <div className="small" style={{ color: 'var(--amber-text)' }}>Retenido por reclamo: {bs(p.held)}</div>}</td>
                    <td className="r"><button className="btn ghost small" onClick={() => setDetail(p.id)}>{p.orders}</button></td>
                    <td className="r">{bs(p.gross)}</td>
                    <td className="r muted">− {bs(p.commission)}</td>
                    <td className="r"><strong>{bs(p.net)}</strong></td>
                    <td className="small">
                      {p.bank ? <>{p.bank.bank} · <span className="mono">{p.bank.accountNumber}</span><br />{p.bank.holder}
                        {!p.bank.verified && <> <Chip tone="amber">Sin verificar</Chip></>}</> : <Chip tone="red">Sin datos para cobrar</Chip>}
                    </td>
                    <td>{p.status === 'pagada' ? <Chip tone="solid">Pagada {fecha(p.paidAt)}</Chip> : <Chip tone="amber">Programada</Chip>}</td>
                    <td className="r">
                      {p.status === 'programada'
                        ? <button className="btn small primary" disabled={!p.bank?.verified} title={p.bank?.verified ? '' : 'Verificá los datos para cobrar en Vendedores'} onClick={() => setPaying(p)}>Marcar pagada</button>
                        : p.receiptUrl && <a className="btn small ghost" href={p.receiptUrl} target="_blank" rel="noreferrer">Comprobante</a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.items.length === 0 && <Empty>{data.pendingToCut ? 'Hay pedidos entregados esperando el corte de esta semana.' : 'No hay liquidaciones para esta semana.'}</Empty>}
          </div>
        </>
      )}
      {paying && <PayModal item={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); toast(`Liquidación de ${paying.seller} pagada`); reload(); }} />}
      {detail && <DetailModal id={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function PayModal({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: () => void }) {
  const [receipt, setReceipt] = React.useState<{ key: string; url: string } | null>(null);
  const [op, setOp] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <Confirm title={`Pagar a ${item.seller}`} confirmLabel={`Registrar transferencia de ${bs(item.net)}`} busy={busy} disabled={!receipt} onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        setError(null);
        try { await api.post(`/payouts/${item.id}/paid`, { receiptKey: receipt!.key, operationNumber: op || undefined }); onDone(); }
        catch (e: any) { setError(e.message); } finally { setBusy(false); }
      }}>
      {item.bank && (
        <dl className="kv">
          <dt>Banco</dt><dd>{item.bank.bank} · {item.bank.accountType}</dd>
          <dt>Cuenta</dt><dd className="mono">{item.bank.accountNumber}</dd>
          <dt>Titular</dt><dd>{item.bank.holder}</dd>
          <dt>CI / NIT</dt><dd>{item.bank.holderDoc}</dd>
          <dt><strong>Monto</strong></dt><dd><strong>{bs(item.net)}</strong></dd>
        </dl>
      )}
      {receipt ? <ReceiptView url={receipt.url} /> : <UploadButton folder="payouts" accept="image/*,application/pdf" label="Subir comprobante de la transferencia" uploadFn={upload} onUploaded={setReceipt} />}
      <label className="field"><span>Número de operación (opcional)</span><input type="text" value={op} onChange={(e) => setOp(e.target.value)} maxLength={60} /></label>
      <ErrorLine error={error} />
    </Confirm>
  );
}

function DetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error } = useLoad<any>(() => api.get(`/payouts/${id}`).then((r) => r.payout), [id]);
  return (
    <div className="modal-back" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(640px, 100%)' }}>
        <h2>{data ? `${data.seller} · ${fecha(data.period.start)} – ${fecha(data.period.end)}` : 'Liquidación'}</h2>
        <ErrorLine error={error} />
        {data && (
          <table>
            <thead><tr><th>Pedido</th><th>Comprador</th><th>Entregado</th><th className="r">Total</th><th className="r">Comisión</th></tr></thead>
            <tbody>
              {data.orders.map((o: any) => (
                <tr key={o.ref}><td className="mono">{o.ref}</td><td>@{o.buyer}</td><td className="small">{fecha(o.deliveredAt)}</td><td className="r">{bs(o.total)}</td><td className="r muted">{bs(o.commission)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn outline" onClick={onClose}>Cerrar</button></div>
      </div>
    </div>
  );
}
