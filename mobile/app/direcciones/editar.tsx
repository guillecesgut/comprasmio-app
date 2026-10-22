import React from 'react';
import { View, Text, ScrollView, ActionSheetIOS, TextInput, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '@/api';
import { SheetHeader, Group, Row, Field, SwitchRow, Btn, ErrorLine, Sym } from '@/ui';
import { C, T } from '@/theme';

/** D16b · Nueva dirección / editar (hoja). */
export default function EditarDireccion() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [cities, setCities] = React.useState<string[]>([]);
  const [form, setForm] = React.useState({ label: 'Casa', city: '', zone: '', street: '', reference: '', phone: '', isDefault: false });
  const [otherCity, setOtherCity] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    api.config().then((c) => setCities(c.cities || [])).catch(() => {});
    if (id) api.addresses().then(({ addresses }) => {
      const a = addresses.find((x: any) => x.id === id);
      if (a) setForm({ label: a.label, city: a.city, zone: a.zone || '', street: a.street, reference: a.reference || '', phone: a.phone || '', isDefault: a.isDefault });
    }).catch(() => {});
  }, [id]);

  const pickCity = () => ActionSheetIOS.showActionSheetWithOptions(
    { title: 'Ciudad', options: [...cities, 'Otra', 'Cancelar'], cancelButtonIndex: cities.length + 1 },
    (i) => {
      if (i < cities.length) { setOtherCity(false); set('city', cities[i]); }
      else if (i === cities.length) { setOtherCity(true); set('city', ''); }
    }
  );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.saveAddress(form, id);
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const ok = form.city.trim() && form.zone.trim() && form.street.trim();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.groupedBg }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <SheetHeader title={id ? 'Editar dirección' : 'Nueva dirección'} onClose={() => router.back()} />
      <Group>
        <Field label="Nombre" value={form.label} onChangeText={(v) => set('label', v)} placeholder="Casa, Trabajo…" maxLength={30} />
        {otherCity ? (
          <Field label="Ciudad" value={form.city} onChangeText={(v) => set('city', v)} placeholder="Escribí tu ciudad" autoFocus />
        ) : (
          <Row title="Ciudad" onPress={pickCity} right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[T.body, { color: form.city ? C.label : C.tertiary }]}>{form.city || 'Elegí'}</Text>
            <Sym name="chevron.up.chevron.down" size={13} color={C.tertiary} />
          </View>} />
        )}
        <Field label="Zona o barrio" value={form.zone} onChangeText={(v) => set('zone', v)} placeholder="Equipetrol" />
        <Field label="Calle y número" value={form.street} onChangeText={(v) => set('street', v)} placeholder="Calle Los Pinos #123" />
        <Field label="Referencia" value={form.reference} onChangeText={(v) => set('reference', v)} placeholder="Portón verde, al lado de la farmacia" />
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.secondary }}>Teléfono</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[T.body, { color: C.secondary }]}>+591</Text>
            <TextInput value={form.phone} onChangeText={(v) => set('phone', v.replace(/\D/g, ''))} keyboardType="phone-pad" maxLength={10}
              placeholder="7XXXXXXX" placeholderTextColor={C.tertiary} style={{ flex: 1, fontSize: 17, color: C.label }} />
          </View>
        </View>
      </Group>
      <Group style={{ marginTop: 16 }}>
        <SwitchRow title="Usar como predeterminada" value={form.isDefault} onChange={(v) => set('isDefault', v)} />
      </Group>
      <View style={{ padding: 16, gap: 8 }}>
        <ErrorLine message={error} />
        <Btn title="Guardar" disabled={!ok} loading={busy} onPress={save} />
      </View>
    </ScrollView>
  );
}
