import React from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActionSheetIOS, Alert, Switch, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, upload } from '@/api';
import { pickFromLibrary, takePhoto } from '@/pickers';
import { SheetHeader, Group, Row, Field, Segmented, SwitchRow, FilterChip, Btn, BottomBar, Img, Sym, Loading, ErrorLine, SectionHeader, useToast } from '@/ui';
import { C, T, R, SOFT } from '@/theme';

type Attr = { name: string; values: string[] };
type Variant = { id?: string; options: Record<string, string>; price: string; stock: string; sku: string; active: boolean };
type Photo = { key: string; url: string };

const keyOf = (options: Record<string, string>, attrs: Attr[]) => attrs.map((a) => `${a.name}=${options[a.name] ?? ''}`).join('|');

/** Todas las combinaciones de valores de los atributos. */
function combinations(attrs: Attr[]): Record<string, string>[] {
  const usable = attrs.filter((a) => a.name.trim() && a.values.length);
  return usable.reduce<Record<string, string>[]>((acc, a) => acc.flatMap((o) => a.values.map((v) => ({ ...o, [a.name]: v }))), [{}]);
}

const SHIPPING = [
  { key: 'envio_gratis', label: 'Envío gratis' }, { key: 'a_convenir', label: 'A convenir' }, { key: 'retiro', label: 'Retiro en persona' },
];

/** E2 · Editor de producto (hoja). La forma de venta (subasta/precio fijo) se decide al armar el vivo. */
export default function EditorProducto() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const toast = useToast();
  const [loaded, setLoaded] = React.useState(!id);
  const [categories, setCategories] = React.useState<any[]>([]);
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [uploading, setUploading] = React.useState(0);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [condition, setCondition] = React.useState<'nuevo' | 'usado'>('nuevo');
  const [compareAt, setCompareAt] = React.useState('');
  const [shipping, setShipping] = React.useState<string[]>(['envio_gratis']);
  const [hasVariants, setHasVariants] = React.useState(false);
  const [attrs, setAttrs] = React.useState<Attr[]>([]);
  const [variants, setVariants] = React.useState<Record<string, Variant>>({});
  const [single, setSingle] = React.useState<Variant>({ options: {}, price: '', stock: '1', sku: '', active: true });
  const [samePrice, setSamePrice] = React.useState(false);
  const [sharedPrice, setSharedPrice] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Valores que ya existían al abrir: una combinación de esos valores que el producto no tenía
  // arranca desactivada (no la ofrecía); las que usan valores nuevos arrancan activas.
  const [initialValues, setInitialValues] = React.useState<Record<string, string[]>>({});

  React.useEffect(() => {
    api.categories().then((r) => setCategories(r.categories)).catch(() => {});
    if (!id) {
      api.seller_.store().then(({ store }) => store.deliveryOptions?.length && setShipping(store.deliveryOptions)).catch(() => {});
      return;
    }
    api.seller_.product(id).then(({ product: p }) => {
      setTitle(p.title); setDescription(p.description || ''); setCategoryId(p.categoryId); setCondition(p.condition);
      setCompareAt(p.compareAt ? String(p.compareAt) : ''); setShipping(p.shippingOptions); setPhotos(p.photos);
      const a: Attr[] = p.attributes || [];
      if (a.length) {
        setHasVariants(true);
        setAttrs(a);
        setInitialValues(Object.fromEntries(a.map((x) => [x.name, x.values])));
        const map: Record<string, Variant> = {};
        for (const v of p.variants) map[keyOf(v.options, a)] = { id: v.id, options: v.options, price: String(v.price), stock: String(v.stock), sku: v.sku || '', active: true };
        setVariants(map);
      } else {
        const v = p.variants[0];
        setSingle({ id: v.id, options: {}, price: String(v.price), stock: String(v.stock), sku: v.sku || '', active: true });
      }
      setLoaded(true);
    }).catch((e) => { setError(e.message); setLoaded(true); });
  }, [id]);

  const combos = combinations(attrs);
  const fresh = (o: Record<string, string>): Variant => ({
    options: o, price: '', stock: '0', sku: '',
    active: !Object.keys(initialValues).length || attrs.some((a) => !(initialValues[a.name] || []).includes(o[a.name])),
  });
  const rows: Variant[] = combos.map((o) => variants[keyOf(o, attrs)] || fresh(o));
  const setRow = (o: Record<string, string>, patch: Partial<Variant>) => {
    const k = keyOf(o, attrs);
    setVariants((m) => ({ ...m, [k]: { ...(m[k] || fresh(o)), ...patch } }));
  };
  const labelOf = (o: Record<string, string>) => attrs.filter((a) => a.values.length).map((a) => o[a.name]).join(' · ');

  // Qué falta (barra fija).
  const missing: string[] = [];
  if (!title.trim()) missing.push('el nombre');
  if (hasVariants) {
    if (!combos.length || !attrs.some((a) => a.values.length)) missing.push('los valores de las variantes');
    const noPrice = samePrice ? (Number(sharedPrice) > 0 ? 0 : 1) : rows.filter((v) => v.active && !(Number(v.price) > 0)).length;
    if (noPrice) missing.push(samePrice ? 'el precio' : `el precio de ${noPrice} variante${noPrice === 1 ? '' : 's'}`);
  } else if (!(Number(single.price) > 0)) missing.push('el precio');
  if (!shipping.length) missing.push('cómo se entrega');
  const missingText = missing.length ? `Falta ${missing.length > 1 ? `${missing.slice(0, -1).join(', ')} y ${missing.at(-1)}` : missing[0]}.` : null;

  const addPhotos = async (how: 'library' | 'camera') => {
    setError(null);
    try {
      const picked = how === 'library' ? await pickFromLibrary({ multiple: 8 - photos.length }) : [await takePhoto()].filter(Boolean) as any[];
      if (!picked?.length) return;
      setUploading((n) => n + picked.length);
      for (const f of picked) {
        try {
          const r = await upload('products', f);
          setPhotos((p) => [...p, r].slice(0, 8));
        } finally {
          setUploading((n) => n - 1);
        }
      }
    } catch (e: any) { setError(e.message); }
  };
  const photoActions = (i: number) => ActionSheetIOS.showActionSheetWithOptions(
    { options: ['Usar como portada', 'Quitar', 'Cancelar'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
    (k) => {
      if (k === 0) setPhotos((p) => [p[i], ...p.filter((_, n) => n !== i)]);
      if (k === 1) setPhotos((p) => p.filter((_, n) => n !== i));
    }
  );

  const roots = categories;
  const category = roots.flatMap((c) => [c, ...(c.children || [])]).find((c) => c.id === categoryId);
  const pickCategory = () => ActionSheetIOS.showActionSheetWithOptions(
    { title: 'Categoría', options: [...roots.map((c) => c.name), 'Cancelar'], cancelButtonIndex: roots.length },
    (i) => {
      if (i >= roots.length) return;
      const root = roots[i];
      const kids = root.children || [];
      if (!kids.length) return setCategoryId(root.id);
      ActionSheetIOS.showActionSheetWithOptions(
        { title: root.name, options: [`Todo ${root.name}`, ...kids.map((c: any) => c.name), 'Cancelar'], cancelButtonIndex: kids.length + 1 },
        (j) => { if (j === 0) setCategoryId(root.id); else if (j <= kids.length) setCategoryId(kids[j - 1].id); }
      );
    }
  );

  const addAttr = () => Alert.prompt('Nuevo atributo', 'Por ejemplo: Talla, Color, Ancho.', (name) => {
    const n = String(name || '').trim();
    if (n && !attrs.some((a) => a.name.toLowerCase() === n.toLowerCase())) setAttrs((a) => [...a, { name: n, values: [] }]);
  });
  const addValue = (ai: number) => Alert.prompt(`Valor de ${attrs[ai].name}`, 'Podés separar varios con comas (S, M, L).', (text) => {
    const vals = String(text || '').split(',').map((v) => v.trim()).filter(Boolean);
    setAttrs((a) => a.map((x, i) => (i === ai ? { ...x, values: [...new Set([...x.values, ...vals])] } : x)));
  });
  const removeValue = (ai: number, v: string) => setAttrs((a) => a.map((x, i) => (i === ai ? { ...x, values: x.values.filter((y) => y !== v) } : x)));
  const removeAttr = (ai: number) => Alert.alert(`¿Quitar ${attrs[ai].name}?`, 'Se borran las combinaciones con ese atributo.', [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Quitar', style: 'destructive', onPress: () => setAttrs((a) => a.filter((_, i) => i !== ai)) },
  ]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const usableAttrs = attrs.filter((a) => a.values.length);
      const payload = {
        title: title.trim(), description, categoryId, condition, compareAt: compareAt ? Number(compareAt) : null, shippingOptions: shipping,
        photoKeys: photos.map((p) => p.key),
        attributes: hasVariants ? usableAttrs : [],
        variants: hasVariants
          ? rows.filter((v) => v.id || v.active).map((v) => ({ id: v.id, options: v.options, label: labelOf(v.options), price: Number(samePrice ? sharedPrice : v.price), stock: Number(v.stock) || 0, sku: v.sku || null, active: v.active }))
          : [{ id: single.id, options: {}, price: Number(single.price), stock: Number(single.stock) || 0, sku: single.sku || null, active: true }],
      };
      await api.seller_.saveProduct(payload, id);
      toast(id ? 'Producto guardado' : 'Producto publicado');
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <View style={{ flex: 1, backgroundColor: C.groupedBg }}><SheetHeader title="Editar producto" onClose={() => router.back()} /><Loading /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 200 }} keyboardShouldPersistTaps="handled">
        <SheetHeader title={id ? 'Editar producto' : 'Nuevo producto'} onClose={() => router.back()} />

        {/* Fotos */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
          {photos.length < 8 && (
            <Pressable onPress={() => ActionSheetIOS.showActionSheetWithOptions({ options: ['Elegir de Fotos', 'Sacar foto', 'Cancelar'], cancelButtonIndex: 2 }, (i) => i < 2 && addPhotos(i === 0 ? 'library' : 'camera'))}
              style={styles.addPhoto} accessibilityLabel="Agregar fotos">
              <Sym name="camera" size={24} color={C.tintText} />
              <Text style={[T.footnote, { color: C.tintText, fontWeight: '600' }]}>{uploading ? 'Subiendo…' : `${photos.length} de 8`}</Text>
            </Pressable>
          )}
          {photos.map((p, i) => (
            <Pressable key={p.key} onPress={() => photoActions(i)} accessibilityLabel={i === 0 ? 'Portada' : `Foto ${i + 1}`}>
              <Img url={p.url} radius={14} style={{ width: 96, height: 96 }}>
                {i === 0 && <View style={styles.cover}><Text style={{ color: C.white, fontSize: 11, fontWeight: '700' }}>Portada</Text></View>}
              </Img>
            </Pressable>
          ))}
        </ScrollView>

        <Group style={{ marginTop: 16 }}>
          <Field label="Nombre" value={title} onChangeText={setTitle} maxLength={120} placeholder="Chompa de alpaca tejida a mano" />
          <Row title="Categoría" onPress={pickCategory} right={<Text style={[T.body, { color: category ? C.label : C.tertiary }]} numberOfLines={1}>{category?.name || 'Elegí'}</Text>} />
          <View style={{ padding: 12 }}>
            <Segmented value={condition} onChange={setCondition} options={[{ key: 'nuevo', label: 'Nuevo' }, { key: 'usado', label: 'Usado' }]} />
          </View>
          <Field label="Descripción" value={description} onChangeText={setDescription} multiline maxLength={4000} placeholder="Medidas, material, estado, qué incluye…" />
        </Group>

        <SectionHeader title="Variantes" />
        <Group>
          <SwitchRow title="Este producto tiene variantes" subtitle="Talla, color, ancho… cada combinación con su precio y stock." value={hasVariants}
            onChange={(v) => { setHasVariants(v); if (v && !attrs.length) setAttrs([{ name: 'Talla', values: [] }]); }} />
        </Group>

        {!hasVariants ? (
          <Group style={{ marginTop: 12 }}>
            <Field label="Precio (Bs)" value={single.price} onChangeText={(v) => setSingle((s) => ({ ...s, price: v.replace(/[^\d.,]/g, '').replace(',', '.') }))} keyboardType="decimal-pad" placeholder="0" />
            <Field label="Stock" value={single.stock} onChangeText={(v) => setSingle((s) => ({ ...s, stock: v.replace(/\D/g, '') }))} keyboardType="number-pad" />
            <Field label="SKU (opcional)" value={single.sku} onChangeText={(v) => setSingle((s) => ({ ...s, sku: v }))} autoCapitalize="characters" />
          </Group>
        ) : (
          <>
            {attrs.map((a, ai) => (
              <View key={a.name} style={[styles.card, { marginTop: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[T.headline, { flex: 1 }]}>{a.name}</Text>
                  <Pressable onPress={() => removeAttr(ai)} hitSlop={8}><Text style={{ color: C.destructive }}>Quitar</Text></Pressable>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {a.values.map((v) => <FilterChip key={v} label={`${v}  ✕`} onPress={() => removeValue(ai, v)} />)}
                  <FilterChip label="+ valor" tone="green" active onPress={() => addValue(ai)} />
                </View>
              </View>
            ))}
            <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
              <Btn title="Agregar atributo" tone="tonal" height={40} icon="plus" onPress={addAttr} />
            </View>

            {combos.length > 0 && attrs.some((a) => a.values.length) && (
              <>
                <Group style={{ marginTop: 12 }}>
                  <SwitchRow title="Mismo precio para todas" value={samePrice} onChange={setSamePrice} />
                  {samePrice && <Field label="Precio (Bs)" value={sharedPrice} onChangeText={(v) => setSharedPrice(v.replace(/[^\d.,]/g, '').replace(',', '.'))} keyboardType="decimal-pad" />}
                </Group>
                <SectionHeader title={`Combinaciones · ${combos.length}`} />
                <Group>
                  {rows.map((v) => {
                    const needsPrice = v.active && !samePrice && !(Number(v.price) > 0);
                    return (
                      <View key={keyOf(v.options, attrs)} style={[styles.combo, !v.active && { opacity: 0.5 }]}>
                        <Text style={[T.subhead, { flex: 1.3, fontWeight: '600' }]} numberOfLines={2}>{labelOf(v.options)}</Text>
                        {!samePrice && (
                          <TextInput value={v.price} onChangeText={(x) => setRow(v.options, { price: x.replace(/[^\d.,]/g, '').replace(',', '.') })} keyboardType="decimal-pad"
                            placeholder="Bs" placeholderTextColor={C.tertiary} accessibilityLabel="Precio"
                            style={[styles.cell, needsPrice && { backgroundColor: SOFT.amber.bg }]} />
                        )}
                        <TextInput value={v.stock} onChangeText={(x) => setRow(v.options, { stock: x.replace(/\D/g, '') })} keyboardType="number-pad"
                          placeholder="Stock" placeholderTextColor={C.tertiary} accessibilityLabel="Stock" style={styles.cell} />
                        <Switch value={v.active} onValueChange={(x) => setRow(v.options, { active: x })} trackColor={{ true: C.tint }} />
                      </View>
                    );
                  })}
                </Group>
              </>
            )}
          </>
        )}

        <SectionHeader title="Oferta (opcional)" />
        <Group>
          <Field label="Precio anterior (Bs)" value={compareAt} onChangeText={(v) => setCompareAt(v.replace(/[^\d.,]/g, '').replace(',', '.'))} keyboardType="decimal-pad"
            hint="Se muestra tachado junto al precio actual." />
        </Group>

        <SectionHeader title="Envío · podés elegir varios" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
          {SHIPPING.map((s) => (
            <FilterChip key={s.key} label={s.label} tone="green" active={shipping.includes(s.key)}
              onPress={() => setShipping((x) => (x.includes(s.key) ? x.filter((y) => y !== s.key) : [...x, s.key]))} />
          ))}
        </View>
      </ScrollView>

      <BottomBar>
        <ErrorLine message={error} />
        {missingText && <Text style={[T.footnote, { color: C.bidText, textAlign: 'center' }]}>{missingText}</Text>}
        <Btn title="Guardar producto" disabled={!!missingText || uploading > 0} loading={busy} onPress={save} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  addPhoto: { width: 96, height: 96, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.tint, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: SOFT.green.bg },
  cover: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,.55)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  card: { backgroundColor: C.white, borderRadius: R.card, marginHorizontal: 16, padding: 14, gap: 10 },
  combo: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  cell: { flex: 1, height: 36, borderRadius: 10, backgroundColor: C.fill2, paddingHorizontal: 10, fontSize: 15, color: C.label },
});
