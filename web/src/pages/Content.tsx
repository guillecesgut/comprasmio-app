import React from 'react';
import { api, fecha, fechaHora, upload } from '../api';
import { useSession } from '../session';
import { Chip, Confirm, Empty, ErrorLine, PageHead, Seg, UploadButton, useLoad, useToast } from '../ui';

const REPORT_REASON: Record<string, string> = {
  estafa: 'Posible estafa', ofensivo: 'Contenido ofensivo', prohibido: 'Producto prohibido', spam: 'Spam', otro: 'Otro',
};

// ------------------------------------------------------ F9 · moderación

export function Moderation() {
  const [tab, setTab] = React.useState<'abierto' | 'todos'>('abierto');
  const reports = useLoad<any[]>(() => api.get(`/reports?status=${tab}`).then((r) => r.reports), [tab]);
  const [q, setQ] = React.useState('');
  const products = useLoad<any[]>(() => api.get(`/products?q=${encodeURIComponent(q)}`).then((r) => r.products), [q]);
  const [pause, setPause] = React.useState<{ id: string; title: string } | null>(null);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const toast = useToast();

  const resolve = async (id: string, status: 'resuelto' | 'descartado') => {
    try { await api.patch(`/reports/${id}`, { status }); toast(status === 'resuelto' ? 'Reporte resuelto' : 'Reporte descartado'); reports.reload(); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <>
      <PageHead title="Catálogo y reportes" subtitle="Revisá lo que reportan las personas y pausá publicaciones que no cumplen las reglas." />
      <ErrorLine error={error || reports.error || products.error} />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Reportes</h2>
            <Seg value={tab} onChange={setTab} options={[{ key: 'abierto', label: 'Abiertos' }, { key: 'todos', label: 'Todos' }]} />
          </div>
          {reports.data?.length === 0 && <p className="muted">No hay reportes abiertos.</p>}
          {reports.data?.map((r) => (
            <div key={r.id} className="stack" style={{ gap: 6, borderTop: '1px solid var(--line-2)', paddingTop: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{r.productTitle ? `Producto: ${r.productTitle}` : r.targetHandle ? `@${r.targetHandle}` : r.streamId ? 'Transmisión en vivo' : 'Reporte'}</strong>
                <Chip tone={r.status === 'abierto' ? 'red' : 'dim'}>{REPORT_REASON[r.reason] || r.reason || r.status}</Chip>
              </div>
              {r.text && <p className="small">{r.text}</p>}
              <div className="small muted">Por @{r.by || '—'} · {fechaHora(r.at)}</div>
              {r.status === 'abierto' && (
                <div className="row">
                  {r.productId && <button className="btn small danger" onClick={() => { setReason(''); setPause({ id: r.productId, title: r.productTitle }); }}>Pausar producto</button>}
                  <button className="btn small outline" onClick={() => resolve(r.id, 'resuelto')}>Marcar resuelto</button>
                  <button className="btn small ghost" onClick={() => resolve(r.id, 'descartado')}>Descartar</button>
                </div>
              )}
            </div>
          ))}
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>Buscar en el catálogo</h2>
          <input type="search" placeholder="Título del producto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto" />
          <table>
            <thead><tr><th>Producto</th><th>Vendedor</th><th className="r">Reportes</th><th /></tr></thead>
            <tbody>
              {products.data?.map((p) => (
                <tr key={p.id}>
                  <td>{p.title}{p.status === 'paused' && <> <Chip tone="dim">Pausado</Chip></>}</td>
                  <td className="small">{p.seller}</td>
                  <td className="r">{p.reports || ''}</td>
                  <td className="r">{p.status === 'active' && <button className="btn small outline" onClick={() => { setReason(''); setPause({ id: p.id, title: p.title }); }}>Pausar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      {pause && (
        <Confirm title={`Pausar «${pause.title}»`} confirmLabel="Pausar y avisar al vendedor" tone="danger" busy={busy} disabled={!reason.trim()} onCancel={() => setPause(null)}
          onConfirm={async () => {
            setBusy(true);
            try { await api.post(`/products/${pause.id}/pause`, { reason }); toast('Producto pausado'); setPause(null); products.reload(); }
            catch (e: any) { setError(e.message); setPause(null); } finally { setBusy(false); }
          }}>
          <p className="muted">Deja de verse en la tienda. El vendedor recibe el motivo y puede corregirlo y volver a publicarlo.</p>
          <label className="field"><span>Motivo</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></label>
        </Confirm>
      )}
    </>
  );
}

// ------------------------------------------------------ F10 · categorías

type Cat = { id: string; name: string; slug: string; icon: string | null; parentId: string | null; position: number; active: boolean; products: number };

export function Categories() {
  const { user } = useSession();
  const editable = user?.adminRole === 'admin';
  const { data, error, reload } = useLoad<Cat[]>(() => api.get('/categories').then((r) => r.categories));
  const [edit, setEdit] = React.useState<Partial<Cat> | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const toast = useToast();
  const roots = (data || []).filter((c) => !c.parentId);
  const children = (id: string) => (data || []).filter((c) => c.parentId === id);

  const move = async (list: Cat[], idx: number, dir: -1 | 1) => {
    const ids = list.map((c) => c.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    try { await api.put('/categories/order', { ids }); reload(); } catch (e: any) { setActionError(e.message); }
  };

  const rowFor = (c: Cat, list: Cat[], i: number, child = false) => (
    <tr key={c.id}>
      <td style={{ paddingLeft: child ? 40 : 14 }}>{child ? '↳ ' : ''}{child ? c.name : <strong>{c.name}</strong>}{c.icon && <span className="mono muted"> · {c.icon}</span>}</td>
      <td className="r">{c.products}</td>
      <td>{c.active ? <Chip tone="green">Visible</Chip> : <Chip tone="dim">Oculta</Chip>}</td>
      <td className="r">
        {editable && (
          <span className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
            <button className="btn small ghost" aria-label="Subir" onClick={() => move(list, i, -1)} disabled={i === 0}>↑</button>
            <button className="btn small ghost" aria-label="Bajar" onClick={() => move(list, i, 1)} disabled={i === list.length - 1}>↓</button>
            <button className="btn small outline" onClick={() => setEdit(c)}>Editar</button>
          </span>
        )}
      </td>
    </tr>
  );

  return (
    <>
      <PageHead title="Categorías" subtitle="Dos niveles: categoría y subcategoría. El orden es el de la portada.">
        {editable && <button className="btn primary" onClick={() => setEdit({ active: true })}>Nueva categoría</button>}
      </PageHead>
      <ErrorLine error={error || actionError} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th className="r">Productos</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {roots.map((c, i) => (
              <React.Fragment key={c.id}>
                {rowFor(c, roots, i)}
                {children(c.id).map((s, j, arr) => rowFor(s, arr, j, true))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <Empty>Todavía no hay categorías.</Empty>}
      </div>
      {edit && <CategoryModal cat={edit} roots={roots} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); toast('Categoría guardada'); reload(); }} />}
    </>
  );
}

function CategoryModal({ cat, roots, onClose, onSaved }: { cat: Partial<Cat>; roots: Cat[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState({ name: cat.name || '', icon: cat.icon || '', parentId: cat.parentId || '', active: cat.active !== false });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <Confirm title={cat.id ? 'Editar categoría' : 'Nueva categoría'} confirmLabel="Guardar" busy={busy} disabled={!form.name.trim()} onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        setError(null);
        const body = { ...form, parentId: form.parentId || null, icon: form.icon || null };
        try { cat.id ? await api.put(`/categories/${cat.id}`, body) : await api.post('/categories', body); onSaved(); }
        catch (e: any) { setError(e.message); } finally { setBusy(false); }
      }}>
      <label className="field"><span>Nombre</span><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={40} /></label>
      <label className="field"><span>Categoría padre</span>
        <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
          <option value="">Ninguna (categoría principal)</option>
          {roots.filter((r) => r.id !== cat.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      <label className="field"><span>Ícono (SF Symbol)</span><input type="text" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="tshirt" /><small>Nombre del ícono que usa la app, por ejemplo tshirt, watch, gamecontroller.</small></label>
      <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Visible en la app</label>
      <ErrorLine error={error} />
    </Confirm>
  );
}

// ---------------------------------------------- F11 · banners y destacados

const TARGET: Record<string, string> = { producto: 'Producto', categoria: 'Categoría', vendedor: 'Vendedor', vivo: 'Transmisión en vivo', link: 'Enlace' };

export function Banners() {
  const { user } = useSession();
  const editable = user?.adminRole === 'admin';
  const { data, error, reload } = useLoad<any[]>(() => api.get('/banners').then((r) => r.banners));
  const [edit, setEdit] = React.useState<any>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const toast = useToast();

  const move = async (idx: number, dir: -1 | 1) => {
    const ids = (data || []).map((b) => b.id);
    const j = idx + dir;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    try { await api.put('/banners/order', { ids }); reload(); } catch (e: any) { setActionError(e.message); }
  };
  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar este banner?')) return;
    try { await api.del(`/banners/${id}`); toast('Banner eliminado'); reload(); } catch (e: any) { setActionError(e.message); }
  };

  return (
    <>
      <PageHead title="Banners y destacados" subtitle="Lo que se ve primero en la portada de la app.">
        {editable && <button className="btn primary" onClick={() => setEdit({ active: true, targetType: 'categoria', cta: 'Ver colección' })}>Nuevo banner</button>}
      </PageHead>
      <ErrorLine error={error || actionError} />
      <div className="table-wrap" style={{ marginBottom: 20 }}>
        <table>
          <thead><tr><th>Banner</th><th>Destino</th><th>Vigencia</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {data?.map((b, i) => (
              <tr key={b.id}>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>{b.imageUrl && <img className="banner-img" src={b.imageUrl} alt="" />}<div><strong>{b.title}</strong><div className="small muted">{b.cta}</div></div></div></td>
                <td className="small">{TARGET[b.targetType]}<div className="mono muted" style={{ fontSize: 12 }}>{b.targetId}</div></td>
                <td className="small">{b.startsAt || b.endsAt ? `${fecha(b.startsAt)} – ${fecha(b.endsAt)}` : 'Siempre'}</td>
                <td>{b.active ? <Chip tone="green">Activo</Chip> : <Chip tone="dim">Inactivo</Chip>}</td>
                <td className="r">
                  {editable && (
                    <span className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                      <button className="btn small ghost" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button className="btn small ghost" aria-label="Bajar" disabled={i === data.length - 1} onClick={() => move(i, 1)}>↓</button>
                      <button className="btn small outline" onClick={() => setEdit(b)}>Editar</button>
                      <button className="btn small ghost" onClick={() => remove(b.id)}>Eliminar</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <Empty>Sin banners. La portada empieza por las categorías.</Empty>}
      </div>
      <Featured editable={editable} />
      {edit && <BannerModal banner={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); toast('Banner guardado'); reload(); }} />}
    </>
  );
}

const toLocalInput = (iso?: string | null) => (iso ? new Date(new Date(iso).getTime() - 4 * 3600_000).toISOString().slice(0, 16) : '');
const fromLocalInput = (v: string) => (v ? new Date(`${v}:00-04:00`).toISOString() : null);

function BannerModal({ banner, onClose, onSaved }: { banner: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState({
    title: banner.title || '', cta: banner.cta || '', imageKey: banner.imageKey || '', imageUrl: banner.imageUrl || '',
    targetType: banner.targetType, targetId: banner.targetId || '', startsAt: toLocalInput(banner.startsAt), endsAt: toLocalInput(banner.endsAt), active: banner.active !== false,
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Confirm title={banner.id ? 'Editar banner' : 'Nuevo banner'} confirmLabel="Guardar banner" busy={busy} disabled={!form.imageKey || !form.title.trim() || !form.targetId.trim()} onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        setError(null);
        const body = { ...form, startsAt: fromLocalInput(form.startsAt), endsAt: fromLocalInput(form.endsAt) };
        try { banner.id ? await api.put(`/banners/${banner.id}`, body) : await api.post('/banners', body); onSaved(); }
        catch (e: any) { setError(e.message); } finally { setBusy(false); }
      }}>
      {form.imageUrl && <img src={form.imageUrl} alt="" style={{ width: '100%', aspectRatio: '2.2 / 1', objectFit: 'cover', borderRadius: 14 }} />}
      <UploadButton folder="banners" label={form.imageKey ? 'Cambiar imagen' : 'Subir imagen (proporción 2.2 : 1)'} uploadFn={upload} onUploaded={(r) => { set('imageKey', r.key); set('imageUrl', r.url); }} />
      <label className="field"><span>Título</span><input type="text" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={60} /></label>
      <label className="field"><span>Texto del botón</span><input type="text" value={form.cta} onChange={(e) => set('cta', e.target.value)} maxLength={24} /></label>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <label className="field" style={{ flex: 1 }}><span>Lleva a</span>
          <select value={form.targetType} onChange={(e) => set('targetType', e.target.value)}>{Object.entries(TARGET).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="field" style={{ flex: 2 }}><span>{form.targetType === 'link' ? 'URL' : 'ID o slug'}</span><input type="text" value={form.targetId} onChange={(e) => set('targetId', e.target.value)} /></label>
      </div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <label className="field" style={{ flex: 1 }}><span>Desde (opcional)</span><input type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></label>
        <label className="field" style={{ flex: 1 }}><span>Hasta (opcional)</span><input type="datetime-local" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Activo</label>
      <ErrorLine error={error} />
    </Confirm>
  );
}

function Featured({ editable }: { editable: boolean }) {
  const { data, error, setData } = useLoad<{ products: { id: string; title: string }[]; sellers: { id: string; name: string }[] }>(() => api.get('/featured'));
  const [q, setQ] = React.useState('');
  const [kind, setKind] = React.useState<'producto' | 'vendedor'>('producto');
  const results = useLoad<{ id: string; label: string }[]>(async () => {
    if (!q.trim()) return [];
    if (kind === 'producto') return (await api.get(`/products?q=${encodeURIComponent(q)}`)).products.filter((p: any) => p.status === 'active').slice(0, 8).map((p: any) => ({ id: p.id, label: `${p.title} · ${p.seller}` }));
    return (await api.get(`/sellers?q=${encodeURIComponent(q)}&status=active`)).sellers.slice(0, 8).map((s: any) => ({ id: s.id, label: s.name }));
  }, [q, kind]);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const save = async (k: 'producto' | 'vendedor', ids: string[]) => {
    try { setData(await api.put(`/featured/${k}`, { ids })); } catch (e: any) { setActionError(e.message); }
  };
  if (!data) return <ErrorLine error={error} />;
  const lists = { producto: data.products.map((p) => ({ id: p.id, label: p.title })), vendedor: data.sellers.map((s) => ({ id: s.id, label: s.name })) };

  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>Destacados de la portada</h2>
      <ErrorLine error={actionError} />
      <div className="grid-2">
        {(['producto', 'vendedor'] as const).map((k) => (
          <div key={k} className="stack" style={{ gap: 6 }}>
            <strong className="small">{k === 'producto' ? 'Productos destacados' : 'Tiendas destacadas'}</strong>
            {lists[k].length === 0 && <p className="small muted">Ninguno.</p>}
            {lists[k].map((x, i) => (
              <div key={x.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small">{i + 1}. {x.label}</span>
                {editable && <button className="btn small ghost" onClick={() => save(k, lists[k].filter((y) => y.id !== x.id).map((y) => y.id))}>Quitar</button>}
              </div>
            ))}
          </div>
        ))}
      </div>
      {editable && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row">
            <Seg value={kind} onChange={setKind} options={[{ key: 'producto', label: 'Producto' }, { key: 'vendedor', label: 'Tienda' }]} />
            <input type="search" className="search" placeholder="Buscar para agregar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar para destacar" />
          </div>
          {results.data?.map((r) => (
            <div key={r.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span className="small">{r.label}</span>
              <button className="btn small outline" disabled={lists[kind].some((x) => x.id === r.id)} onClick={() => save(kind, [...lists[kind].map((x) => x.id), r.id])}>Agregar</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
