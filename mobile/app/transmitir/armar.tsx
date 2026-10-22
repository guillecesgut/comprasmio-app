import React from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api, bs } from '@/api';
import { useSession } from '@/session';
import { Collage } from '@/Collage';
import { SheetHeader, Img, Stepper, Segmented, Btn, BottomBar, Notice, EmptyCard, Loading, ErrorLine, Sym, ModeChip } from '@/ui';
import { C, T, R } from '@/theme';

type Entry = {
  key: string; kind: 'variante' | 'paquete'; variantId?: string; bundleId?: string; title: string; label?: string;
  photoUrl?: string | null; color?: string; available: number; qty: number; mode: 'subasta' | 'fijo';
  startPrice: string; minPrice: string; price: string; catalogPrice: number; bundle?: any;
};

const lotsOf = (e: Entry) => (e.mode === 'fijo' ? 1 : e.qty);
const money = (v: string) => v.replace(/[^\d.,]/g, '').replace(',', '.');

/** E9 · Armar la transmisión: paso 1 "¿Qué vendés hoy?", paso 2 "Ordená la cola". */
export default function Armar() {
  const { user } = useSession();
  const [setup, setSetup] = React.useState<any>(null);
  const [step, setStep] = React.useState<1 | 2>(1);
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState<string | null>(null);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [title, setTitle] = React.useState(`${user?.name || 'Mi tienda'} en vivo`);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.seller_.setup().then(setSetup).catch((e) => { setError(e.message); setSetup({ products: [], bundles: [] }); });
  }, []);

  const find = (key: string) => entries.find((e) => e.key === key);
  const upsert = (e: Entry) => setEntries((l) => (l.some((x) => x.key === e.key) ? l.map((x) => (x.key === e.key ? e : x)) : [...l, e]));
  const remove = (key: string) => setEntries((l) => l.filter((x) => x.key !== key));
  const patch = (key: string, p: Partial<Entry>) => setEntries((l) => l.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const toggleVariant = (p: any, v: any) => {
    Haptics.selectionAsync();
    const key = `v:${v.id}`;
    if (find(key)) return remove(key);
    upsert({
      key, kind: 'variante', variantId: v.id, title: p.title, label: v.label !== 'Única' ? v.label : undefined, photoUrl: p.photoUrl, color: p.color,
      available: v.available, qty: Math.min(1, v.available), mode: 'subasta', startPrice: String(Math.max(1, Math.round(v.price * 0.6))), minPrice: '', price: String(v.price), catalogPrice: v.price,
    });
  };
  const toggleBundle = (b: any) => {
    Haptics.selectionAsync();
    const key = `b:${b.id}`;
    if (find(key)) return remove(key);
    upsert({
      key, kind: 'paquete', bundleId: b.id, title: b.name, label: `Paquete · ${b.pieces.length} productos`, photoUrl: b.photoUrl, color: b.pieces[0]?.color,
      available: b.available, qty: 1, mode: 'subasta', startPrice: b.suggestedStart ? String(b.suggestedStart) : '', minPrice: '', price: '', catalogPrice: 0, bundle: b,
    });
  };

  const totalLots = entries.reduce((s, e) => s + lotsOf(e), 0);
  const units = entries.reduce((s, e) => s + e.qty, 0);
  const invalid = entries.find((e) => e.mode === 'subasta' && !(Number(e.startPrice) > 0))
    || entries.find((e) => e.mode === 'subasta' && e.minPrice && Number(e.minPrice) < Number(e.startPrice))
    || entries.find((e) => e.mode === 'fijo' && !(Number(e.price) > 0));

  const move = (i: number, d: -1 | 1) => setEntries((l) => {
    const j = i + d;
    if (j < 0 || j >= l.length) return l;
    const c = [...l];
    [c[i], c[j]] = [c[j], c[i]];
    Haptics.selectionAsync();
    return c;
  });

  const goLive = async () => {
    setBusy(true);
    setError(null);
    try {
      const { streamId } = await api.seller_.startStream({
        title: title.trim(),
        entries: entries.map((e) => ({
          variantId: e.variantId, bundleId: e.bundleId, qty: e.qty, mode: e.mode,
          startPrice: e.mode === 'subasta' ? Number(e.startPrice) : undefined,
          minPrice: e.mode === 'subasta' && e.minPrice ? Number(e.minPrice) : undefined,
          price: e.mode === 'fijo' ? Number(e.price) : undefined,
        })),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.dismiss();
      router.push(`/transmitir/${streamId}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (!setup) return <View style={{ flex: 1, backgroundColor: C.groupedBg }}><SheetHeader title="¿Qué vendés hoy?" onClose={() => router.back()} /><Loading /></View>;
  const products = setup.products.filter((p: any) => !q.trim() || p.title.toLowerCase().includes(q.trim().toLowerCase()));

  if (step === 2) {
    return (
      <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 220 }} keyboardShouldPersistTaps="handled">
          <SheetHeader eyebrow="Paso 2 de 2" eyebrowColor={C.bidText} title="Ordená la cola" subtitle="Ningún lote arranca solo: vos iniciás cada uno." onClose={() => setStep(1)} />
          <View style={[styles.card, { padding: 14 }]}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.secondary }}>Título del vivo</Text>
            <TextInput value={title} onChangeText={setTitle} maxLength={80} style={{ fontSize: 17, color: C.label, paddingVertical: 4 }} />
          </View>
          <View style={[styles.card, { marginTop: 12 }]}>
            {entries.map((e, i) => (
              <View key={e.key} style={[styles.qrow, i > 0 && styles.sep]}>
                <Text style={[T.headline, T.num, { width: 22, color: C.secondary }]}>{i + 1}</Text>
                {e.kind === 'paquete' ? <Collage bundle={e.bundle} size={44} /> : <Img url={e.photoUrl} color={e.color} radius={10} style={{ width: 44, height: 44 }} />}
                <View style={{ flex: 1 }}>
                  <Text style={T.headline} numberOfLines={1}>{e.title}{e.label && e.kind === 'variante' ? ` · ${e.label}` : ''}</Text>
                  <Text style={[T.footnote, T.num, { color: e.mode === 'fijo' ? C.tintText : C.bidText }]}>
                    {e.mode === 'fijo' ? `Precio fijo · ${bs(Number(e.price))} · ${e.qty} u.` : `${e.kind === 'paquete' ? 'Paquete' : 'Subasta'} · desde ${bs(Number(e.startPrice))}${e.qty > 1 ? ` · ${e.qty} lotes` : ''}`}
                  </Text>
                </View>
                <View style={{ gap: 4 }}>
                  <Pressable onPress={() => move(i, -1)} disabled={i === 0} hitSlop={6} accessibilityLabel="Subir" style={{ opacity: i === 0 ? 0.3 : 1 }}><Sym name="chevron.up" size={16} color={C.label} /></Pressable>
                  <Pressable onPress={() => move(i, 1)} disabled={i === entries.length - 1} hitSlop={6} accessibilityLabel="Bajar" style={{ opacity: i === entries.length - 1 ? 0.3 : 1 }}><Sym name="chevron.down" size={16} color={C.label} /></Pressable>
                </View>
              </View>
            ))}
          </View>
          <Notice tone="amber" icon="lock.fill" style={{ marginTop: 12 }}>
            {`Vas a apartar ${units} ${units === 1 ? 'unidad' : 'unidades'} de ${entries.filter((e) => e.kind === 'variante').length} productos${entries.some((e) => e.kind === 'paquete') ? ` y ${entries.filter((e) => e.kind === 'paquete').length} paquetes` : ''}. Mientras dure el vivo no se venden en el catálogo; lo que no vendas vuelve al terminar.`}
          </Notice>
        </ScrollView>
        <BottomBar>
          <ErrorLine message={error} />
          <Btn title={`Salir al aire con ${totalLots} ${totalLots === 1 ? 'lote' : 'lotes'}`} tone="bid" icon="video.fill" loading={busy} disabled={!title.trim()} onPress={goLive} />
        </BottomBar>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 200 }} keyboardShouldPersistTaps="handled">
        <SheetHeader eyebrow="Paso 1 de 2" eyebrowColor={C.bidText} size="title1" title="¿Qué vendés hoy?" onClose={() => router.back()} />
        <View style={styles.search}>
          <Sym name="magnifyingglass" size={16} color={C.secondary} />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar en tu catálogo" placeholderTextColor={C.secondary} style={{ flex: 1, fontSize: 16, color: C.label }} />
        </View>

        {!setup.products.length && !setup.bundles.length ? (
          <EmptyCard title="No tenés productos con stock" body="Cargá productos (o reponé stock) para armar tu vivo."
            action={<Btn title="Cargar producto" onPress={() => { router.back(); router.push('/vendedor/producto'); }} />} />
        ) : (
          <View style={styles.card}>
            {products.map((p: any, i: number) => {
              const expanded = open === p.id || p.variants.some((v: any) => find(`v:${v.id}`));
              const picked = p.variants.filter((v: any) => find(`v:${v.id}`)).length;
              return (
                <View key={p.id} style={i > 0 ? styles.sep : undefined}>
                  <Pressable onPress={() => (p.variants.length === 1 ? toggleVariant(p, p.variants[0]) : setOpen(open === p.id ? null : p.id))} style={styles.prow}>
                    <Img url={p.photoUrl} color={p.color} radius={10} style={{ width: 48, height: 48 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={T.headline} numberOfLines={1}>{p.title}</Text>
                      <Text style={T.footnote}>{p.variants.length === 1 ? `${p.variants[0].available} ${p.variants[0].available === 1 ? 'disponible' : 'disponibles'} · ${bs(p.variants[0].price)}` : `${p.variants.length} variantes${picked ? ` · ${picked} elegidas` : ''}`}</Text>
                    </View>
                    {p.variants.length === 1
                      ? <Sym name={find(`v:${p.variants[0].id}`) ? 'checkmark.circle.fill' : 'circle'} size={24} color={find(`v:${p.variants[0].id}`) ? C.tint : C.unchecked} />
                      : <Sym name={expanded ? 'chevron.up' : 'chevron.down'} size={15} color={C.tertiary} />}
                  </Pressable>
                  {p.variants.length > 1 && expanded && p.variants.map((v: any) => (
                    <Pressable key={v.id} onPress={() => toggleVariant(p, v)} style={[styles.prow, { paddingLeft: 76 }]}>
                      <Text style={[T.subhead, { flex: 1 }]}>{v.label} · {v.available} disp. · {bs(v.price)}</Text>
                      <Sym name={find(`v:${v.id}`) ? 'checkmark.circle.fill' : 'circle'} size={22} color={find(`v:${v.id}`) ? C.tint : C.unchecked} />
                    </Pressable>
                  ))}
                  {p.variants.filter((v: any) => find(`v:${v.id}`)).map((v: any) => <EntryConfig key={v.id} e={find(`v:${v.id}`)!} patch={patch} />)}
                </View>
              );
            })}
          </View>
        )}

        {setup.bundles.length > 0 && (
          <>
            <Text style={[T.section, { paddingHorizontal: 32, paddingTop: 24, paddingBottom: 8 }]}>Paquetes · siempre por subasta</Text>
            <View style={styles.card}>
              {setup.bundles.map((b: any, i: number) => {
                const e = find(`b:${b.id}`);
                return (
                  <View key={b.id} style={i > 0 ? styles.sep : undefined}>
                    <Pressable onPress={() => toggleBundle(b)} style={styles.prow}>
                      <Collage bundle={b} size={48} />
                      <View style={{ flex: 1 }}>
                        <Text style={T.headline} numberOfLines={1}>{b.name}</Text>
                        <Text style={T.footnote}>{b.pieces.length} productos · {b.available} {b.available === 1 ? 'disponible' : 'disponibles'}</Text>
                      </View>
                      <Sym name={e ? 'checkmark.circle.fill' : 'circle'} size={24} color={e ? C.tint : C.unchecked} />
                    </Pressable>
                    {e && <EntryConfig e={e} patch={patch} />}
                  </View>
                );
              })}
            </View>
          </>
        )}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Btn title="Armar paquete" tone="tonal" height={40} icon="square.stack.3d.up" onPress={() => router.push('/vendedor/paquete')} />
        </View>
      </ScrollView>
      <BottomBar>
        <ErrorLine message={error} />
        {invalid && <Text style={[T.footnote, { color: C.bidText, textAlign: 'center' }]}>
          {invalid.mode === 'fijo' ? `Falta el precio de ${invalid.title}.` : invalid.minPrice && Number(invalid.minPrice) < Number(invalid.startPrice) ? `El mínimo de ${invalid.title} no puede ser menor al inicial.` : `Falta el precio inicial de ${invalid.title}.`}
        </Text>}
        <Btn title={entries.length ? `Siguiente · ordenar ${totalLots} ${totalLots === 1 ? 'lote' : 'lotes'}` : 'Elegí qué vendés'} disabled={!entries.length || !!invalid} onPress={() => setStep(2)} />
      </BottomBar>
    </View>
  );
}

/** Configuración de una variante o paquete elegido: cantidad, modo y precios. */
function EntryConfig({ e, patch }: { e: Entry; patch: (key: string, p: Partial<Entry>) => void }) {
  const field = (label: string, value: string, key: 'startPrice' | 'minPrice' | 'price', placeholder?: string) => (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: C.secondary }}>{label}</Text>
      <TextInput value={value} onChangeText={(v) => patch(e.key, { [key]: money(v) } as any)} keyboardType="decimal-pad" placeholder={placeholder}
        placeholderTextColor={C.tertiary} style={styles.input} />
    </View>
  );
  return (
    <View style={styles.config}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={[T.subhead, { flex: 1, fontWeight: '600' }]} numberOfLines={1}>{e.label && e.kind === 'variante' ? e.label : e.kind === 'paquete' ? 'Paquetes' : 'Cantidad'}</Text>
        <Stepper small value={e.qty} min={1} max={e.available} onChange={(n) => patch(e.key, { qty: n })} />
      </View>
      {e.kind === 'variante' ? (
        <Segmented value={e.mode} onChange={(m) => patch(e.key, { mode: m })}
          options={[{ key: 'subasta', label: 'Subasta', dot: C.bid }, { key: 'fijo', label: 'Precio fijo', dot: C.tint }]} />
      ) : <ModeChip mode="paquete" />}
      {e.mode === 'subasta' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {field('Inicial (Bs)', e.startPrice, 'startPrice')}
          {field('Mínimo (opcional)', e.minPrice, 'minPrice', 'Igual al inicial')}
        </View>
      ) : field('Precio (Bs)', e.price, 'price', String(e.catalogPrice))}
      <Text style={T.footnote}>{e.mode === 'subasta' ? (e.qty > 1 ? `Cada unidad es un lote: ${e.qty} subastas seguidas.` : 'Un lote en subasta.') : `Una oferta con ${e.qty} ${e.qty === 1 ? 'unidad' : 'unidades'} para toda la sala.`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.white, borderRadius: R.card, marginHorizontal: 16, overflow: 'hidden' },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.rowSeparator },
  prow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  qrow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  config: { backgroundColor: '#FBF7F2', marginHorizontal: 12, marginBottom: 10, borderRadius: 16, padding: 12, gap: 10 },
  input: { height: 38, borderRadius: 10, backgroundColor: C.white, paddingHorizontal: 10, fontSize: 16, color: C.label, borderWidth: StyleSheet.hairlineWidth, borderColor: C.separator },
  search: { height: 40, borderRadius: R.pill, backgroundColor: C.fill, margin: 16, marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
});

