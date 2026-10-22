import React from 'react';
import { View, Text, ScrollView, Alert, ActionSheetIOS, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { api, bs } from '@/api';
import { useData } from '@/hooks';
import { Collage } from '@/Collage';
import { NavBar, Circle, Notice, Press, EmptyCard, Btn, Loading, ErrorLine, useToast } from '@/ui';
import { C, T, R } from '@/theme';

/** E4 · Paquetes (Premium): siempre por subasta; al cargarlos en un vivo se apartan todas sus piezas. */
export default function Paquetes() {
  const toast = useToast();
  const { data, error, reload } = useData(() => api.seller_.bundles().then((r) => r.bundles), []);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const actions = (b: any) => ActionSheetIOS.showActionSheetWithOptions(
    { title: b.name, options: ['Editar', 'Borrar', 'Cancelar'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
    (i) => {
      if (i === 0) router.push({ pathname: '/vendedor/paquete', params: { id: b.id } });
      if (i === 1) Alert.alert('¿Borrar este paquete?', 'Las piezas siguen en tu catálogo.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: () => api.seller_.deleteBundle(b.id).then(() => { toast('Paquete borrado'); reload(); }).catch((e) => setActionError(e.message)) },
      ]);
    }
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Paquetes" right={<Circle icon="plus" size={40} bg={C.tint} color={C.white} onPress={() => router.push('/vendedor/paquete')} label="Nuevo paquete" />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Notice tone="amber" icon="square.stack.3d.up" style={{ marginTop: 4, marginBottom: 12 }}>
          Al cargar un paquete en un vivo se apartan todas sus piezas. Se venden siempre por subasta.
        </Notice>
        <View style={{ paddingHorizontal: 16 }}><ErrorLine message={error || actionError} /></View>
        {!data ? <Loading /> : !data.length ? (
          <EmptyCard title="Sin paquetes" body="Combiná productos de tu catálogo para subastarlos juntos en un vivo."
            action={<Btn title="Armar paquete" onPress={() => router.push('/vendedor/paquete')} />} />
        ) : (
          <View style={styles.list}>
            {data.map((b: any, i: number) => (
              <Press key={b.id} onPress={() => actions(b)} style={[styles.row, i > 0 && styles.sep]}>
                <Collage bundle={b} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={T.headline} numberOfLines={1}>{b.name}</Text>
                  <Text style={T.footnote}>{b.pieces.length} productos · {b.available} {b.available === 1 ? 'disponible' : 'disponibles'}</Text>
                  {b.suggestedStart ? <Text style={[T.footnote, T.num]}>Inicial sugerido {bs(b.suggestedStart)}</Text> : null}
                  {b.limitedBy && <Text style={[T.footnote, { color: C.bidText }]}>Limitado por {b.limitedBy}</Text>}
                </View>
              </Press>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: C.white, borderRadius: R.card, marginHorizontal: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.rowSeparator },
});
