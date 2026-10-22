import React from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, bs, upload, type Upload } from '@/api';
import { pickFromLibrary } from '@/pickers';
import { SheetHeader, Group, Row, Field, Stepper, Btn, BottomBar, Img, Sym, Loading, ErrorLine, SectionHeader, useToast } from '@/ui';
import { C, T, R } from '@/theme';

type Piece = { variantId: string; title: string; label: string; qty: number; available: number; photoUrl?: string | null; color?: string; price: number };

/** E4b · Editor de paquete: piezas con cantidad, tope por la pieza más escasa y precio inicial sugerido. */
export default function EditorPaquete() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const toast = useToast();
  const [catalog, setCatalog] = React.useState<any[] | null>(null);
  const [name, setName] = React.useState('');
  const [pieces, setPieces] = React.useState<Piece[]>([]);
  const [start, setStart] = React.useState('');
  const [photo, setPhoto] = React.useState<{ file?: Upload; url?: string | null; key?: string | null }>({});
  const [q, setQ] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.seller_.setup().then((r) => setCatalog(r.products)).catch((e) => { setError(e.message); setCatalog([]); });
    if (id) api.seller_.bundle(id).then(({ bundle: b }) => {
      setName(b.name);
      setStart(b.suggestedStart ? String(b.suggestedStart) : '');
      setPhoto({ url: b.photoUrl });
      setPieces(b.pieces.map((p: any) => ({ variantId: p.variantId, title: p.title, label: p.label, qty: p.qty, available: p.available, photoUrl: p.photoUrl, color: p.color, price: p.price })));
    }).catch((e) => setError(e.message));
  }, [id]);

  const maxBundles = pieces.length ? Math.min(...pieces.map((p) => Math.floor(p.available / p.qty))) : 0;
  const limiting = pieces.find((p) => Math.floor(p.available / p.qty) === maxBundles);
  const catalogValue = pieces.reduce((s, p) => s + p.price * p.qty, 0);
  const totalUnits = pieces.reduce((s, p) => s + p.qty, 0);
  const ok = name.trim() && (pieces.length >= 2 || totalUnits >= 2);

  const results = (catalog || []).flatMap((p: any) => p.variants.map((v: any) => ({ ...v, title: p.title, photoUrl: p.photoUrl, color: p.color })))
    .filter((v: any) => !pieces.some((x) => x.variantId === v.id) && (!q.trim() || v.title.toLowerCase().includes(q.trim().toLowerCase())));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const photoKey = photo.file ? (await upload('bundles', photo.file)).key : undefined;
      await api.seller_.saveBundle({ name: name.trim(), pieces: pieces.map((p) => ({ variantId: p.variantId, qty: p.qty })), suggestedStart: start ? Number(start) : null, photoKey }, id);
      toast('Paquete guardado');
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!catalog) return <View style={{ flex: 1, backgroundColor: C.groupedBg }}><SheetHeader title="Paquete" onClose={() => router.back()} /><Loading /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 180 }} keyboardShouldPersistTaps="handled">
        <SheetHeader title={id ? 'Editar paquete' : 'Nuevo paquete'} onClose={() => router.back()} />
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, alignItems: 'center' }}>
          <Pressable onPress={async () => { try { const r = await pickFromLibrary({ square: true }); if (r) setPhoto({ file: r[0], url: r[0].uri }); } catch (e: any) { setError(e.message); } }}>
            {photo.url ? <Img url={photo.url} radius={14} style={{ width: 80, height: 80 }} /> : (
              <View style={styles.photo}><Sym name="photo" size={22} color={C.tintText} /><Text style={[T.footnote, { fontSize: 11 }]}>Foto propia</Text></View>
            )}
          </Pressable>
          <Text style={[T.footnote, { flex: 1 }]}>Si no subís foto, armamos un collage con las piezas.</Text>
        </View>
        <Group style={{ marginTop: 12 }}>
          <Field label="Nombre" value={name} onChangeText={setName} maxLength={80} placeholder="Combo relojes vintage" />
        </Group>

        <SectionHeader title={`Piezas · ${pieces.length}`} />
        <Group inset={72}>
          {pieces.map((p) => (
            <Row key={p.variantId} left={<Img url={p.photoUrl} color={p.color} radius={10} style={{ width: 44, height: 44 }} />}
              title={p.title} subtitle={`${p.label !== 'Única' ? `${p.label} · ` : ''}${p.available} disponibles`}
              right={<Stepper small value={p.qty} max={p.available} onChange={(n) => setPieces((l) => l.map((x) => (x.variantId === p.variantId ? { ...x, qty: n } : x)))}
                onRemove={() => setPieces((l) => l.filter((x) => x.variantId !== p.variantId))} />} />
          ))}
          <Row icon="plus.circle.fill" title="Agregar del catálogo" onPress={() => setAdding((a) => !a)} />
        </Group>

        {adding && (
          <View style={[styles.card, { marginTop: 10 }]}>
            <TextInput value={q} onChangeText={setQ} placeholder="Buscar producto" placeholderTextColor={C.secondary} style={styles.search} autoFocus />
            {results.slice(0, 20).map((v: any) => (
              <Row key={v.id} left={<Img url={v.photoUrl} color={v.color} radius={10} style={{ width: 40, height: 40 }} />}
                title={v.title} subtitle={`${v.label !== 'Única' ? `${v.label} · ` : ''}${v.available} disp. · ${bs(v.price)}`}
                onPress={() => { setPieces((l) => [...l, { variantId: v.id, title: v.title, label: v.label, qty: 1, available: v.available, photoUrl: v.photoUrl, color: v.color, price: v.price }]); setQ(''); }} />
            ))}
            {!results.length && <Text style={[T.footnote, { padding: 12 }]}>No hay más productos con stock disponible.</Text>}
          </View>
        )}

        {pieces.length > 0 && (
          <>
            <SectionHeader title="Paquetes a armar" />
            <Group>
              <Row title={`Máx. ${maxBundles}`} subtitle={limiting && maxBundles <= 1 ? `Solo queda${limiting.available === 1 ? '' : 'n'} ${limiting.available} ${limiting.title}` : 'Lo limita la pieza más escasa'} />
              <Row title="Valor en catálogo" right={<Text style={[T.subhead, T.num]}>{bs(catalogValue)}</Text>} />
            </Group>
          </>
        )}

        <SectionHeader title="Precio inicial sugerido" />
        <Group>
          <Field label="Bs" value={start} onChangeText={(v) => setStart(v.replace(/[^\d.,]/g, '').replace(',', '.'))} keyboardType="decimal-pad"
            placeholder={catalogValue ? String(Math.round(catalogValue * 0.6)) : '0'} hint="Lo podés cambiar al armar el vivo." />
        </Group>
      </ScrollView>
      <BottomBar>
        <ErrorLine message={error} />
        {!ok && <Text style={[T.footnote, { textAlign: 'center', color: C.bidText }]}>{!name.trim() ? 'Falta el nombre.' : 'Un paquete necesita al menos dos piezas.'}</Text>}
        <Btn title="Guardar paquete" disabled={!ok} loading={busy} onPress={save} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: 80, height: 80, borderRadius: 14, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', gap: 2 },
  card: { backgroundColor: C.white, borderRadius: R.card, marginHorizontal: 16, overflow: 'hidden' },
  search: { height: 40, borderRadius: R.pill, backgroundColor: C.fill, margin: 12, paddingHorizontal: 14, fontSize: 16, color: C.label },
});
