import React from 'react';
import { api, bs, fecha, fechaHora, upload } from '../api';
import { useSession } from '../session';
import { Chip, Confirm, Empty, ErrorLine, PageHead, UploadButton, useLoad, useToast } from '../ui';

type Settings = Record<string, number | string>;
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Formulario de ajustes: convierte entre lo que se edita (Bs, %) y lo que se guarda (centavos, puntos básicos). */
function useSettingsForm(fields: { key: string; scale?: number }[]) {
  const { data, error, setData } = useLoad<Settings>(() => api.get('/settings').then((r) => r.settings));
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const toast = useToast();
  React.useEffect(() => {
    if (!data) return;
    setForm(Object.fromEntries(fields.map((f) => [f.key, f.scale ? String(Number(data[f.key]) / f.scale) : String(data[f.key] ?? '')])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const dirty = data != null && fields.some((f) => (f.scale ? String(Number(data[f.key]) / f.scale) : String(data[f.key] ?? '')) !== form[f.key]);
  const save = async () => {
    setBusy(true);
    setSaveError(null);
    try {
      const patch = Object.fromEntries(fields.map((f) => [f.key, f.scale ? Math.round(Number(form[f.key]) * f.scale) : typeof data![f.key] === 'number' ? Number(form[f.key]) : form[f.key]]));
      const r = await api.put('/settings', patch);
      setData(r.settings);
      toast('Cambios guardados');
    } catch (e: any) { setSaveError(e.message); } finally { setBusy(false); }
  };
  const bind = (key: string) => ({ value: form[key] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value })) });
  return { data, error: error || saveError, form, bind, dirty, busy, save };
}

// --------------------------------------------------------- F12 · comisión

/** Una sola comisión para catálogo y vivos; los vivos están abiertos a todos los vendedores. */
export function Commission() {
  const s = useSettingsForm([{ key: 'commission_bp', scale: 100 }]);
  const example = 500;
  const pct = Number(s.form.commission_bp || 0);
  return (
    <>
      <PageHead title="Comisión" subtitle="Se aplica a las ventas nuevas del catálogo y de los vivos; los pedidos ya creados conservan la suya." />
      <ErrorLine error={s.error} />
      {s.data && (
        <section className="card stack" style={{ maxWidth: 520 }}>
          <label className="field"><span>Comisión por venta (%)</span>
            <input type="number" min={0} max={100} step="0.5" {...s.bind('commission_bp')} />
            <small>Sobre el precio de los productos, no sobre el envío. Igual para catálogo y vivos.</small>
          </label>
          <p className="note">En una venta de {bs(example)} el vendedor recibe {bs(example * (1 - pct / 100))} y ComprasMío! {bs(example * pct / 100)}.</p>
          <p className="small muted">Para un vendedor puntual, la comisión especial se edita en Vendedores.</p>
          <div className="row"><button className="btn primary" disabled={!s.dirty || s.busy} onClick={s.save}>{s.busy ? 'Guardando…' : 'Guardar'}</button></div>
        </section>
      )}
    </>
  );
}

// --------------------------------------------- F13 · configuración y QR

export function Config() {
  const s = useSettingsForm([
    { key: 'payment_window_catalog_min' }, { key: 'payment_window_live_min' }, { key: 'auto_deliver_days' },
    { key: 'payout_cut_weekday' }, { key: 'payout_pay_weekday' }, { key: 'payout_min_cents', scale: 100 },
    { key: 'support_whatsapp' }, { key: 'support_email' }, { key: 'platform_name' },
  ]);
  return (
    <>
      <PageHead title="Configuración" subtitle="QR de cobro, plazos de pago y liquidaciones, y datos de soporte." />
      <QrSection platformName={String(s.data?.platform_name || 'ComprasMío!')} />
      <ErrorLine error={s.error} />
      {s.data && (
        <div className="grid-2" style={{ alignItems: 'start', marginTop: 16 }}>
          <section className="card stack">
            <h2 style={{ margin: 0 }}>Plazos</h2>
            <label className="field"><span>Minutos para pagar · catálogo</span><input type="number" min={5} max={1440} {...s.bind('payment_window_catalog_min')} /><small>Lo apartado se libera si no llega el comprobante a tiempo.</small></label>
            <label className="field"><span>Minutos para pagar · en vivo</span><input type="number" min={2} max={120} {...s.bind('payment_window_live_min')} /></label>
            <label className="field"><span>Días para dar por entregado</span><input type="number" min={1} max={30} {...s.bind('auto_deliver_days')} /><small>Después de “Enviado”, si el comprador no confirma ni reclama.</small></label>
          </section>
          <section className="card stack">
            <h2 style={{ margin: 0 }}>Liquidaciones semanales</h2>
            <label className="field"><span>Último día de la semana que se liquida</span>
              <select {...s.bind('payout_cut_weekday')}>{WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
            </label>
            <label className="field"><span>Día de transferencia</span>
              <select {...s.bind('payout_pay_weekday')}>{WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
            </label>
            <label className="field"><span>Monto mínimo a transferir (Bs)</span><input type="number" min={0} step="1" {...s.bind('payout_min_cents')} /><small>Por debajo, el saldo pasa a la semana siguiente.</small></label>
          </section>
          <section className="card stack">
            <h2 style={{ margin: 0 }}>Soporte y datos legales</h2>
            <label className="field"><span>WhatsApp de soporte</span><input type="text" placeholder="+591 7…" {...s.bind('support_whatsapp')} /></label>
            <label className="field"><span>Email de soporte</span><input type="email" {...s.bind('support_email')} /></label>
            <label className="field"><span>Razón social que cobra</span><input type="text" {...s.bind('platform_name')} /><small>Aparece junto al QR de pago.</small></label>
          </section>
          <div className="row"><button className="btn primary" disabled={!s.dirty || s.busy} onClick={s.save}>{s.busy ? 'Guardando…' : 'Guardar cambios'}</button></div>
        </div>
      )}
    </>
  );
}

type Qr = { id: string; bank: string; holder: string; account: string; active: boolean; imageUrl: string; createdAt: string; createdBy: string | null; activatedAt: string | null; deactivatedAt: string | null };

/** QR de cobro de la plataforma: se sube inactivo, se previsualiza como lo ve el comprador y se activa. */
function QrSection({ platformName }: { platformName: string }) {
  const { data, error, reload, setData } = useLoad<Qr[]>(() => api.get('/qrs').then((r) => r.qrs));
  const [adding, setAdding] = React.useState(false);
  const [confirm, setConfirm] = React.useState<Qr | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const toast = useToast();
  const active = data?.find((q) => q.active);

  return (
    <section className="card stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>QR de cobro</h2>
        <button className="btn primary" onClick={() => setAdding(true)}>{active ? 'Cambiar QR' : 'Subir QR'}</button>
      </div>
      <ErrorLine error={error || actionError} />
      {data && !active && <p className="note amber">No hay un QR activo: los compradores no pueden pagar hasta que actives uno.</p>}
      {active && (
        <div className="qr-preview">
          <img src={active.imageUrl} alt="QR de cobro activo" />
          <div className="stack" style={{ gap: 6 }}>
            <Chip tone="solid">Activo desde {fecha(active.activatedAt)}</Chip>
            <dl className="kv" style={{ maxWidth: 420 }}>
              <dt>Titular</dt><dd>{active.holder}</dd><dt>Banco</dt><dd>{active.bank}</dd><dt>Cuenta</dt><dd className="mono">{active.account}</dd>
            </dl>
            <p className="small muted">Así lo ve el comprador: “Pagá a {platformName}”. Los pagos ya iniciados conservan el QR con el que empezaron.</p>
          </div>
        </div>
      )}
      {data && data.length > 1 && (
        <details>
          <summary className="small">Historial de QR ({data.length})</summary>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>QR</th><th>Cuenta</th><th>Subido</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {data.map((q) => (
                <tr key={q.id}>
                  <td><img className="thumb" src={q.imageUrl} alt="" /></td>
                  <td className="small">{q.bank} · <span className="mono">{q.account}</span><br />{q.holder}</td>
                  <td className="small">{fechaHora(q.createdAt)}{q.createdBy && ` · ${q.createdBy}`}</td>
                  <td>{q.active ? <Chip tone="solid">Activo</Chip> : q.activatedAt ? <Chip tone="dim">Usado hasta {fecha(q.deactivatedAt)}</Chip> : <Chip tone="amber">Sin activar</Chip>}</td>
                  <td className="r">{!q.active && <button className="btn small outline" onClick={() => setConfirm(q)}>{q.activatedAt ? 'Volver a usar' : 'Activar'}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {adding && <AddQr platformName={platformName} onClose={() => setAdding(false)} onCreated={async (id) => {
        setAdding(false);
        await reload();
        const created = (await api.get('/qrs')).qrs.find((q: Qr) => q.id === id);
        if (created) setConfirm(created);
      }} />}
      {confirm && (
        <Confirm title="¿Activar este QR?" confirmLabel="Activar QR" busy={busy} onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setBusy(true);
            setActionError(null);
            try { setData((await api.post(`/qrs/${confirm.id}/activate`)).qrs); toast('QR activado'); setConfirm(null); }
            catch (e: any) { setActionError(e.message); setConfirm(null); } finally { setBusy(false); }
          }}>
          <div className="qr-preview" style={{ gridTemplateColumns: '140px minmax(0,1fr)' }}>
            <img src={confirm.imageUrl} alt="QR a activar" style={{ width: 140, height: 140 }} />
            <dl className="kv"><dt>Titular</dt><dd>{confirm.holder}</dd><dt>Banco</dt><dd>{confirm.bank}</dd><dt>Cuenta</dt><dd className="mono">{confirm.account}</dd></dl>
          </div>
          <p className="muted">Desde ahora, los pagos nuevos se hacen a esta cuenta. Escaneá el QR con tu app del banco antes de activarlo para verificar que funcione.</p>
        </Confirm>
      )}
    </section>
  );
}

function AddQr({ platformName, onClose, onCreated }: { platformName: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [img, setImg] = React.useState<{ key: string; url: string } | null>(null);
  const [form, setForm] = React.useState({ bank: '', holder: platformName, account: '' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <Confirm title="Subir QR de cobro" confirmLabel="Guardar y revisar" busy={busy} disabled={!img || !form.bank.trim() || !form.holder.trim() || !form.account.trim()} onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        setError(null);
        try { onCreated((await api.post('/qrs', { imageKey: img!.key, ...form })).id); }
        catch (e: any) { setError(e.message); } finally { setBusy(false); }
      }}>
      {img && <img src={img.url} alt="QR subido" style={{ width: 200, height: 200, objectFit: 'contain', margin: '0 auto', background: '#fff', borderRadius: 14, padding: 8 }} />}
      <UploadButton folder="qrs" label={img ? 'Cambiar imagen' : 'Elegir imagen del QR'} uploadFn={upload} onUploaded={setImg} />
      <label className="field"><span>Banco</span><input type="text" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} placeholder="Banco Unión" /></label>
      <label className="field"><span>Titular</span><input type="text" value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value })} /></label>
      <label className="field"><span>Número de cuenta</span><input type="text" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} /></label>
      <p className="small muted">Queda guardado sin activar; en el siguiente paso lo revisás y lo activás.</p>
      <ErrorLine error={error} />
    </Confirm>
  );
}

// ------------------------------------------------------- F14 · equipo

const ROLES: Record<string, [string, string]> = {
  admin: ['Administración', 'Todo, incluidos comisión, QR y equipo'],
  pagos: ['Pagos', 'Pagos, pedidos, liquidaciones y reclamos'],
  moderador: ['Moderación', 'Catálogo, reportes, compradores, categorías y banners'],
};

export function Team() {
  const { user } = useSession();
  const { data, error, reload } = useLoad<any[]>(() => api.get('/team').then((r) => r.team));
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', email: '', password: '', role: 'pagos' });
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const toast = useToast();
  const update = async (id: string, body: any) => {
    setActionError(null);
    try { await api.patch(`/team/${id}`, body); toast('Cuenta actualizada'); reload(); } catch (e: any) { setActionError(e.message); }
  };
  return (
    <>
      <PageHead title="Equipo" subtitle="Cuentas del panel y qué puede hacer cada una.">
        <button className="btn primary" onClick={() => { setForm({ name: '', email: '', password: '', role: 'pagos' }); setAdding(true); }}>Agregar persona</button>
      </PageHead>
      <ErrorLine error={error || actionError} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>Desde</th><th /></tr></thead>
          <tbody>
            {data?.map((m) => (
              <tr key={m.id}>
                <td><strong>{m.name}</strong><div className="small muted">{m.email}</div></td>
                <td>
                  <select value={m.role} disabled={m.id === user?.id} onChange={(e) => update(m.id, { role: e.target.value })} style={{ width: 180 }} aria-label="Rol">
                    {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
                  </select>
                </td>
                <td>{m.status === 'active' ? <Chip tone="green">Activa</Chip> : <Chip tone="dim">Desactivada</Chip>}</td>
                <td className="small">{fecha(m.createdAt)}</td>
                <td className="r">{m.id !== user?.id && <button className="btn small outline" onClick={() => update(m.id, { status: m.status === 'active' ? 'blocked' : 'active' })}>{m.status === 'active' ? 'Desactivar' : 'Reactivar'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="stack small muted" style={{ marginTop: 14, gap: 4 }}>
        {Object.values(ROLES).map(([n, d]) => <span key={n}><strong>{n}:</strong> {d}</span>)}
      </div>
      {adding && (
        <Confirm title="Agregar persona al equipo" confirmLabel="Crear cuenta" busy={busy} disabled={!form.email || form.password.length < 10} onCancel={() => setAdding(false)}
          onConfirm={async () => {
            setBusy(true);
            setActionError(null);
            try { await api.post('/team', form); toast('Cuenta creada'); setAdding(false); reload(); }
            catch (e: any) { setActionError(e.message); setAdding(false); } finally { setBusy(false); }
          }}>
          <label className="field"><span>Nombre</span><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field"><span>Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="field"><span>Contraseña inicial</span><input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><small>Al menos 10 caracteres. Compartila por un canal privado.</small></label>
          <label className="field"><span>Rol</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v[0]} — {v[1]}</option>)}</select>
          </label>
        </Confirm>
      )}
    </>
  );
}

// ------------------------------------------------- F14 · registro de cambios

const ACTIONS: Record<string, string> = {
  aprobar_pago: 'Aprobó un pago', rechazar_pago: 'Rechazó un pago', cancelar_pedido: 'Canceló un pedido', pagar_liquidacion: 'Pagó una liquidación',
  generar_corte: 'Generó un corte', resolver_reclamo: 'Resolvió un reclamo', pedir_info_reclamo: 'Pidió respuesta al vendedor',
  editar_vendedor: 'Editó un vendedor', verificar_cuenta: 'Verificó datos para cobrar', rechazar_cuenta: 'Rechazó datos para cobrar',
  bloquear_usuario: 'Bloqueó a una persona', desbloquear_usuario: 'Desbloqueó a una persona', pausar_producto: 'Pausó un producto',
  subir_qr: 'Subió un QR', activar_qr: 'Activó un QR', cambiar_ajustes: 'Cambió ajustes', agregar_equipo: 'Agregó a alguien al equipo',
  editar_equipo: 'Editó una cuenta del equipo',
};

export function Audit() {
  const [action, setAction] = React.useState('');
  const { data, error } = useLoad<any[]>(() => api.get(`/audit${action ? `?action=${action}` : ''}`).then((r) => r.entries), [action]);
  return (
    <>
      <PageHead title="Registro de cambios" subtitle="Quién hizo qué en el panel. No se puede editar ni borrar.">
        <select value={action} onChange={(e) => setAction(e.target.value)} style={{ width: 260 }} aria-label="Acción">
          <option value="">Todas las acciones</option>
          {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </PageHead>
      <ErrorLine error={error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Persona</th><th>Acción</th><th>Detalle</th></tr></thead>
          <tbody>
            {data?.map((a) => (
              <tr key={a.id}>
                <td className="small" style={{ whiteSpace: 'nowrap' }}>{fechaHora(a.at)}</td>
                <td>{a.actor || 'Sistema'}</td>
                <td>{ACTIONS[a.action] || a.action}<div className="mono muted" style={{ fontSize: 12 }}>{a.entity}{a.entityId ? ` · ${a.entityId}` : ''}</div></td>
                <td className="small mono" style={{ maxWidth: 420, overflowWrap: 'anywhere' }}>{a.data ? JSON.stringify(a.data) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <Empty>Sin registros.</Empty>}
      </div>
    </>
  );
}
