import React from 'react';
import { View, ScrollView, ActionSheetIOS, Alert } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api';
import { useData } from '@/hooks';
import { NavBar, Circle, Group, Row, Chip, Loading, EmptyCard, Btn, ErrorLine } from '@/ui';
import { C, SOFT } from '@/theme';

/** D16 · Direcciones. Tocar una fila ofrece Editar · Borrar · Predeterminada. */
export default function Direcciones() {
  const { data, error, reload } = useData(() => api.addresses().then((r) => r.addresses), []);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const options = (a: any) => ActionSheetIOS.showActionSheetWithOptions(
    { title: a.label, options: ['Editar', ...(a.isDefault ? [] : ['Usar como predeterminada']), 'Borrar', 'Cancelar'], destructiveButtonIndex: a.isDefault ? 1 : 2, cancelButtonIndex: a.isDefault ? 2 : 3 },
    async (i) => {
      const action = ['edit', ...(a.isDefault ? [] : ['default']), 'delete'][i];
      try {
        if (action === 'edit') router.push({ pathname: '/direcciones/editar', params: { id: a.id } });
        if (action === 'default') { await api.saveAddress({ ...a, isDefault: true }, a.id); reload(); }
        if (action === 'delete') Alert.alert('¿Borrar esta dirección?', undefined, [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Borrar', style: 'destructive', onPress: () => api.deleteAddress(a.id).then(reload).catch((e) => setActionError(e.message)) },
        ]);
      } catch (e: any) { setActionError(e.message); }
    }
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Direcciones" right={<Circle icon="plus" size={40} onPress={() => router.push('/direcciones/editar')} label="Nueva dirección" />} />
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}>
        <ErrorLine message={error || actionError} />
        {!data ? <Loading /> : !data.length ? (
          <EmptyCard title="No tenés direcciones" body="Agregá dónde querés recibir tus compras."
            action={<Btn title="Agregar dirección" onPress={() => router.push('/direcciones/editar')} />} />
        ) : (
          <Group>
            {data.map((a: any) => (
              <Row key={a.id} icon={/trabajo|oficina/i.test(a.label) ? 'briefcase' : 'house'} onPress={() => options(a)}
                title={a.label} subtitle={[a.street, a.zone, a.city].filter(Boolean).join(', ')}
                right={a.isDefault ? <Chip label="Predeterminada" bg={SOFT.green.bg} fg={SOFT.green.fg} /> : undefined} />
            ))}
          </Group>
        )}
      </ScrollView>
    </View>
  );
}
