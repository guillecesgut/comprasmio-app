import React from 'react';
import { api, bs, fecha } from '../api';
import { useSession } from '../session';
import { Chip, Confirm, Empty, ErrorLine, PageHead, Seg, StatusChip, useLoad, useToast } from '../ui';

const SELLER_STATUS: Record<string, [string, string]> = { active: ['Activo', 'green'], pending: ['Pendiente', 'amber'], suspended: ['Suspendido', 'red'] };
const ACCOUNT: Record<string, [string, string]> = { verified: ['Verificada', 'green'], pending: ['Por verificar', 'amber'], rejected: ['Rechazada', 'red'], missing: ['Sin cargar', 'dim'] };

// ------------------------------------------------------------ F6 · vendedores

export function Sellers() {
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [selected, setSelected] = React.useState<string | null>(null);
  const qs = new URLSearchParams(Object.entries({ q, status }).filter(([, v]) => v)).toString();
  const list = useLoad<any[]>(() => api.get(`/sellers?${qs}`).then((r) => r.sellers), [qs]);
  return (
    <>
      <PageHead title="Vendedores" subtitle="Plan, comisión, datos para cobrar y estado de cada tienda." />
      <div className="row" style={{ marginBottom: 14 }}>
        <input type="search" className="search" placeholder="Nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        <Seg value={status} onChange={setStatus} options={[{ key: '', label: 'Todos' }, { key: 'active', label: 'Activos' }, { key: 'pending', label: 'Pendientes' }, { key: 'suspended', label: 'Suspendidos' }]} />
      </div>
      <ErrorLine error={list.error} />
      <div className="split">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tienda</th><th>Plan</th><th className="r">Comisión</th><th className="r">Ventas del mes</th><th className="r">Productos</th><th>Cuenta</th><th>Estado</th></tr></thead>
            <tbody>
              {list.data?.map((s) => (
                <tr key={s.id} className={`clickable${s.id === selected ? ' selected' : ''}`} onClick={() => setSelected(s.id)}>
                  <td><strong>{s.name}</strong>{s.verified && ' ✓'}<div className="small muted">{s.owner} · {s.phone}</div></td>
                  <td>{s.plan === 'premium' ? <Chip tone="amber">Premium</Chip> : <Chip tone="gray">Básico</Chip>}</td>
                  <td className="r">{s.commissionPct} %{s.commissionOverride != null && <div className="small muted">especial</div>}</td>
                  <td className="r">{bs(s.monthSales)}</td>
                  <td className="r">{s.products}</td>
                  <td><Chip tone={ACCOUNT[s.accountStatus][1]}>{ACCOUNT[s.accountStatus][0]}</Chip></td>
                  <td><Chip tone={SELLER_STATUS[s.status][1]}>{SELLER_STATUS[s.status][0]}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data?.length === 0 && <Empty>No hay vendedores con esos filtros.</Empty>}
        </div>
        {selected && <SellerPanel key={selected} id={selected} onChanged={list.reload} />}
      </div>
    </>
  );
}

function SellerPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { user, can } = useSession();
  const isAdmin = user?.adminRole === 'admin';
  const { data: s, error, setData } = useLoad<any>(() => api.get(`/sellers/${id}`).then((r) => r.seller), [id]);
  const [commission, setCommission] = React.useState('');
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const toast = useToast();
  React.useEffect(() => { if (s) setCommission(s.commissionOverride != null ? String(s.commissionOverride) : ''); }, [s?.id]);

  const run = async (fn: () => Promise<any>, msg: string) => {
    setBusy(true);
    setActionError(null);
    try { const r = await fn(); if (r?.seller) setData(r.seller); toast(msg); onChanged(); }
    catch (e: any) { setActionError(e.message); } finally { setBusy(false); }
  };
  const patch = (body: any, msg: string) => run(() => api.patch(`/sellers/${id}`, body), msg);

  if (error) return <aside className="card detail"><ErrorLine error={error} /></aside>;
  if (!s) return <aside className="card detail"><Empty>Cargando…</Empty></aside>;
  return (
    <aside className="card detail stack">
      <div>
        <h2>{s.name}{s.verified && ' ✓'}</h2>
        <p className="muted small">{s.owner} · {s.phone} · desde {fecha(s.createdAt)}</p>
      </div>
      <dl className="kv">
        <dt>Plan</dt><dd>{s.plan === 'premium' ? `Premium hasta ${fecha(s.planUntil)}` : 'Básico'}</dd>
        <dt>Comisión vigente</dt><dd>{s.commissionPct} %</dd>
        <dt>Calificación</dt><dd>{s.ratingPct != null ? `${s.ratingPct} % positivas` : '—'} · {s.salesCount} ventas</dd>
        <dt>Ventas del mes</dt><dd>{bs(s.monthSales)}</dd>
      </dl>

      <section className="stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Datos para cobrar</strong>
          <Chip tone={ACCOUNT[s.accountStatus][1]}>{ACCOUNT[s.accountStatus][0]}</Chip>
        </div>
        {s.account ? (
          <>
            <dl className="kv">
              <dt>Banco</dt><dd>{s.account.bank} · {s.account.accountType}</dd>
              <dt>Cuenta</dt><dd className="mono">{s.account.accountNumber}</dd>
              <dt>Titular</dt><dd>{s.account.holder}</dd>
              <dt>CI / NIT</dt><dd>{s.account.holderDoc}</dd>
            </dl>
            {s.account.qrUrl && <img src={s.account.qrUrl} alt="QR del vendedor" style={{ width: 140, borderRadius: 12, border: '1px solid var(--line)' }} />}
            {s.account.rejectReason && <p className="note amber">Rechazada: {s.account.rejectReason}</p>}
            {can('pagos') && s.account.status !== 'verified' && (
              <div className="row">
                <button className="btn primary small" disabled={busy} onClick={() => run(() => api.post(`/sellers/${id}/account`, { approve: true }), 'Cuenta verificada')}>Verificar cuenta</button>
                <button className="btn outline small" onClick={() => { setReason(''); setRejecting(true); }}>Rechazar</button>
              </div>
            )}
            <p className="small muted">Verificá que el titular coincida con el vendedor antes de la primera transferencia.</p>
          </>
        ) : <p className="note">El vendedor todavía no cargó sus datos. Sus liquidaciones quedan programadas hasta que lo haga.</p>}
      </section>

      {isAdmin && (
        <section className="stack" style={{ gap: 10 }}>
          <strong>Ajustes de la tienda</strong>
          <label className="check"><input type="checkbox" checked={s.verified} disabled={busy} onChange={(e) => patch({ verified: e.target.checked }, e.target.checked ? 'Insignia de verificado activada' : 'Insignia quitada')} /> Tienda verificada (muestra ✓)</label>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ width: 170 }}><span>Comisión especial %</span><input type="number" min={0} max={100} step="0.5" placeholder="Según plan" value={commission} onChange={(e) => setCommission(e.target.value)} /></label>
            <button className="btn small outline" disabled={busy} onClick={() => patch({ commissionPct: commission === '' ? null : Number(commission) }, 'Comisión actualizada')}>Guardar</button>
          </div>
          <div className="row">
            {s.status !== 'active' && <button className="btn small primary" disabled={busy} onClick={() => patch({ status: 'active' }, 'Tienda activada')}>Activar</button>}
            {s.status !== 'suspended' && <button className="btn small danger" disabled={busy} onClick={() => patch({ status: 'suspended' }, 'Tienda suspendida; sus productos quedaron pausados')}>Suspender</button>}
          </div>
        </section>
      )}
      <ErrorLine error={actionError} />

      {s.orders.length > 0 && (
        <section className="stack" style={{ gap: 6 }}>
          <strong>Últimos pedidos</strong>
          {s.orders.slice(0, 8).map((o: any) => (
            <div key={o.id} className="row small" style={{ justifyContent: 'space-between' }}><span className="mono">{o.ref}</span><span className="row"><StatusChip status={o.status} />{bs(o.total)}</span></div>
          ))}
        </section>
      )}
      {s.payouts.length > 0 && (
        <section className="stack" style={{ gap: 6 }}>
          <strong>Liquidaciones</strong>
          {s.payouts.map((p: any) => (
            <div key={p.id} className="row small" style={{ justifyContent: 'space-between' }}><span>Semana al {fecha(p.periodEnd)}</span><span className="row"><Chip tone={p.status === 'pagada' ? 'solid' : 'amber'}>{p.status}</Chip>{bs(p.net)}</span></div>
          ))}
        </section>
      )}

      {rejecting && (
        <Confirm title="Rechazar datos para cobrar" confirmLabel="Rechazar y avisar" tone="danger" busy={busy} disabled={!reason.trim()} onCancel={() => setRejecting(false)}
          onConfirm={async () => { await run(() => api.post(`/sellers/${id}/account`, { approve: false, reason }), 'Datos rechazados'); setRejecting(false); }}>
          <label className="field"><span>Motivo (lo ve el vendedor)</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ej.: el titular no coincide con el CI del vendedor" /></label>
        </Confirm>
      )}
    </aside>
  );
}

// ----------------------------------------------------------- F7 · compradores

export function Buyers() {
  const [q, setQ] = React.useState('');
  const list = useLoad<any[]>(() => api.get(`/buyers?q=${encodeURIComponent(q)}`).then((r) => r.buyers), [q]);
  const [target, setTarget] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const toast = useToast();
  return (
    <>
      <PageHead title="Compradores" subtitle="Historial de compras, reclamos y reportes de cada persona." />
      <input type="search" className="search" style={{ marginBottom: 14 }} placeholder="Nombre, @usuario o teléfono" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
      <ErrorLine error={list.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Persona</th><th>Teléfono</th><th className="r">Pedidos</th><th className="r">Compras</th><th className="r">Reclamos abiertos</th><th className="r">Reportes</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong><div className="small muted">@{u.handle} · desde {fecha(u.createdAt)}</div></td>
                <td>{u.phone}</td><td className="r">{u.orders}</td><td className="r">{bs(u.spent)}</td>
                <td className="r">{u.openClaims}</td><td className="r">{u.reports > 0 ? <Chip tone="red">{u.reports}</Chip> : 0}</td>
                <td>{u.status === 'blocked' ? <Chip tone="red">Bloqueado</Chip> : <Chip tone="green">Activo</Chip>}</td>
                <td className="r"><button className="btn small outline" onClick={() => { setError(null); setTarget(u); }}>{u.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data?.length === 0 && <Empty>No encontramos compradores.</Empty>}
      </div>
      {target && (
        <Confirm title={target.status === 'blocked' ? `Desbloquear a ${target.name}` : `Bloquear a ${target.name}`} busy={busy}
          tone={target.status === 'blocked' ? 'primary' : 'danger'} confirmLabel={target.status === 'blocked' ? 'Desbloquear' : 'Bloquear cuenta'}
          onCancel={() => setTarget(null)}
          onConfirm={async () => {
            setBusy(true);
            try { await api.patch(`/users/${target.id}/status`, { status: target.status === 'blocked' ? 'active' : 'blocked' }); toast('Listo'); setTarget(null); list.reload(); }
            catch (e: any) { setError(e.message); } finally { setBusy(false); }
          }}>
          <p className="muted">{target.status === 'blocked' ? 'Podrá volver a entrar y comprar.' : 'No podrá iniciar sesión ni comprar. Sus pedidos en curso siguen su curso.'}</p>
          <ErrorLine error={error} />
        </Confirm>
      )}
    </>
  );
}

// -------------------------------------------------------- F8 · suscripciones

export function Subscriptions() {
  const { user } = useSession();
  const list = useLoad<any[]>(() => api.get('/subscriptions').then((r) => r.subscriptions));
  const [grant, setGrant] = React.useState<any>(null);
  const [days, setDays] = React.useState('30');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const toast = useToast();
  return (
    <>
      <PageHead title="Suscripciones Premium" subtitle="Los pagos del plan entran por la cola de pagos; acá ves vencimientos y podés extender a mano." />
      <ErrorLine error={list.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Tienda</th><th>Vence</th><th className="r">Días</th><th>Último pago</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.map((s) => (
              <tr key={s.sellerId}>
                <td><strong>{s.seller}</strong></td><td>{fecha(s.until)}</td>
                <td className="r">{s.active ? s.daysLeft : '—'}</td><td className="small">{fecha(s.lastPayment)}</td>
                <td>{!s.active ? <Chip tone="dim">Vencida</Chip> : s.daysLeft <= 5 ? <Chip tone="amber">Vence pronto</Chip> : <Chip tone="green">Activa</Chip>}</td>
                <td className="r">{user?.adminRole === 'admin' && <button className="btn small outline" onClick={() => { setDays('30'); setError(null); setGrant(s); }}>Extender</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data?.length === 0 && <Empty>Todavía ningún vendedor tiene Premium.</Empty>}
      </div>
      {grant && (
        <Confirm title={`Extender Premium · ${grant.seller}`} confirmLabel={`Sumar ${days || 0} días`} busy={busy} onCancel={() => setGrant(null)}
          disabled={!(Number(days) > 0)}
          onConfirm={async () => {
            setBusy(true);
            try { await api.post(`/subscriptions/${grant.sellerId}`, { days: Number(days) }); toast('Premium extendido'); setGrant(null); list.reload(); }
            catch (e: any) { setError(e.message); } finally { setBusy(false); }
          }}>
          <p className="muted">Para cortesías o pagos recibidos por fuera de la app. Queda en el registro de cambios.</p>
          <label className="field"><span>Días</span><input type="number" min={1} max={366} value={days} onChange={(e) => setDays(e.target.value)} /></label>
          <ErrorLine error={error} />
        </Confirm>
      )}
    </>
  );
}
