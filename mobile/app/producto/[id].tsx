import React from 'react';
import { View, Text, TextInput, ScrollView, Keyboard, ActionSheetIOS, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type Mode } from '@/api';
import { Btn, Circle, Group, Row, Segmented, SectionHeader, Sym, ErrorLine, useToast } from '@/ui';
import { C, T, MODE } from '@/theme';

const CATEGORIES = ['Relojes', 'Accesorios', 'Ropa', 'Electrónica', 'General'];
const digits = (v: string) => v.replace(/[^0-9]/g, '');

/**
 * C3 · Nuevo / editar producto (`/producto/nuevo` o `/producto/<id>`).
 * La fila de fotos del handoff queda pendiente: el servidor todavía no
 * guarda imágenes de producto.
 */
export default function Producto() {
  const { id = 'nuevo' } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const isNew = id === 'nuevo';

  const [loaded, setLoaded] = React.useState(isNew);
  const [name, setName] = React.useState('');
  const [category, setCategory] = React.useState('Relojes');
  const [mode, setMode] = React.useState<Mode>('auction');
  const [start, setStart] = React.useState('');
  const [min, setMin] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [stock, setStock] = React.useState('');
  const [shipping, setShipping] = React.useState<'free' | 'arranged'>('arranged');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isNew) return;
    api.products()
      .then(({ products }) => {
        const p = products.find((x) => x.id === id);
        if (!p) return setError('Ese producto ya no está en tu catálogo.');
        setName(p.name);
        setCategory(p.category || 'General');
        setMode(p.mode);
        setStart(p.start ? String(p.start) : '');
        setMin(p.min ? String(p.min) : '');
        setPrice(p.price ? String(p.price) : '');
        setStock(p.stock ? String(p.stock) : '');
        setShipping(p.shipping === 'free' ? 'free' : 'arranged');
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, [id, isNew]);

  // Qué falta para poder guardar, en el orden del formulario: se muestra sobre el botón.
  const missing: string[] = [];
  if (!name.trim()) missing.push('el nombre');
  if (mode === 'fixed') {
    if (!(Number(price) > 0)) missing.push('el precio');
    if (!(Number(stock) > 0)) missing.push('las unidades');
  } else {
    if (!(Number(start) > 0)) missing.push('el precio inicial');
    if (min === '') missing.push('el precio mínimo');
  }
  const minTooLow = mode === 'auction' && min !== '' && Number(start) > 0 && Number(min) < Number(start);
  const valid = loaded && missing.length === 0 && !minTooLow;
  const hint = !loaded
    ? null
    : missing.length
      ? `Falta ${missing.length > 1 ? `${missing.slice(0, -1).join(', ')} y ${missing[missing.length - 1]}` : missing[0]}.`
      : minTooLow
        ? 'El precio mínimo tiene que ser igual o mayor al inicial.'
        : null;

  // En una hoja (formSheet) KeyboardAvoidingView mide mal el teclado y el botón
  // de abajo quedaba tapado: se sube el pie con la altura real del teclado.
  const insets = useSafeAreaInsets();
  const [keyboard, setKeyboard] = React.useState(0);
  React.useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboard(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    const payload = { name: name.trim(), category, mode, shipping, start, min, price, stock };
    try {
      if (isNew) await api.createProduct(payload);
      else await api.updateProduct(id, payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast(isNew ? 'Producto creado' : 'Cambios guardados');
      router.back();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const pickCategory = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title: 'Categoría', options: [...CATEGORIES, 'Cancelar'], cancelButtonIndex: CATEGORIES.length },
      (i) => i < CATEGORIES.length && setCategory(CATEGORIES[i])
    );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <Circle icon="xmark" bg={C.fill} onPress={() => router.back()} label="Cerrar" />
        <Text style={[T.headline, { flex: 1, textAlign: 'center' }]}>{isNew ? 'Nuevo producto' : 'Editar producto'}</Text>
        <View style={{ opacity: valid && !busy ? 1 : 0.45 }}>
          <Circle icon="checkmark" bg={C.tint} color={C.white} onPress={save} label="Guardar producto" />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Group style={{ marginTop: 12 }} inset={16}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nombre del producto"
            placeholderTextColor={C.tertiary}
            style={styles.field}
            accessibilityLabel="Nombre del producto"
          />
          <Row
            title="Categoría"
            onPress={pickCategory}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[T.body, { color: C.secondary }]}>{category}</Text>
                <Sym name="chevron.up.chevron.down" size={13} color={C.secondary} />
              </View>
            }
          />
        </Group>

        <SectionHeader title="Forma de venta" />
        <Segmented
          style={{ marginHorizontal: 16 }}
          value={mode}
          onChange={setMode}
          options={[
            { key: 'auction', label: 'Subasta', dot: MODE.auction.dot },
            { key: 'fixed', label: 'Precio fijo', dot: MODE.fixed.dot },
          ]}
        />

        <Group style={{ marginTop: 12 }} inset={16}>
          {mode === 'auction' ? (
            <>
              <MoneyRow label="Precio inicial" unit="Bs" value={start} onChange={setStart} />
              <MoneyRow label="Precio mínimo" unit="Bs" value={min} onChange={setMin} />
            </>
          ) : (
            <>
              <MoneyRow label="Precio" unit="Bs" value={price} onChange={setPrice} />
              <MoneyRow label="Unidades" unit="u." value={stock} onChange={setStock} />
            </>
          )}
        </Group>
        <Text style={[T.footnote, { paddingHorizontal: 32, marginTop: 8 }]}>
          {mode === 'auction'
            ? 'El mínimo solo lo ves vos. Si la puja no llega, el lote cierra sin venta.'
            : 'Se vende hasta agotar las unidades durante el vivo.'}
        </Text>

        <SectionHeader title="Envío" />
        <Group inset={16}>
          {([
            { key: 'free', title: 'Envío gratis', sub: 'Lo asumís vos' },
            { key: 'arranged', title: 'A convenir', sub: 'Se coordina por chat' },
          ] as const).map((o) => (
            <Row
              key={o.key}
              minHeight={64}
              title={o.title}
              subtitle={o.sub}
              onPress={() => { Haptics.selectionAsync(); setShipping(o.key); }}
              right={shipping === o.key ? <Sym name="checkmark" size={18} color={C.tint} weight="semibold" /> : null}
            />
          ))}
        </Group>

      </ScrollView>

      {/* Pie fijo: siempre visible, por encima del teclado. */}
      <View style={{ paddingHorizontal: 24, paddingTop: 10, paddingBottom: keyboard ? keyboard + 10 : Math.max(insets.bottom, 16) + 4, borderTopWidth: 0.5, borderTopColor: C.separator, backgroundColor: C.groupedBg }}>
        {error ? <ErrorLine message={error} /> : hint && <Text style={[T.footnote, { textAlign: 'center', marginBottom: 8 }]}>{hint}</Text>}
        <Btn
          title={isNew ? 'Crear producto' : 'Guardar cambios'}
          disabled={!valid}
          loading={busy}
          onPress={save}
          style={{ marginTop: error ? 10 : 0 }}
        />
      </View>
    </View>
  );
}

function MoneyRow({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 16 }}>
      <Text style={[T.body, { flex: 1 }]}>{label}</Text>
      <Text style={[T.body, { color: C.secondary, marginRight: 12 }]}>{unit}</Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(digits(v))}
        placeholder="0"
        placeholderTextColor={C.tertiary}
        keyboardType="number-pad"
        accessibilityLabel={`${label} en ${unit}`}
        style={[T.body, T.num, { minWidth: 90, textAlign: 'right', paddingVertical: 14 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { fontSize: 17, color: C.label, paddingHorizontal: 16, paddingVertical: 15 },
});
