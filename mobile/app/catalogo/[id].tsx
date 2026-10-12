import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, bs, realtime, type Mode } from '@/api';
import { SheetHeader, Placeholder, ModeChip } from '@/ui';
import { C, T } from '@/theme';

/**
 * B4 · Catálogo del vivo (hoja ~55 %). El aviso push por producto ("avisarme
 * cuando salga") necesita un endpoint nuevo en el servidor: queda pendiente.
 */
export default function Catalogo() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const [lot, setLot] = React.useState<any>(null);
  const [queue, setQueue] = React.useState<any[]>([]);

  React.useEffect(() => {
    api.stream(id).then(({ lot, queue }) => { setLot(lot); setQueue(queue || []); }).catch(() => {});
    const offs = [
      realtime.on('queue:update', (p) => p.streamId === id && setQueue(p.queue)),
      realtime.on('lot:update', (p) => p.streamId === id && setLot(p.lot)),
      realtime.on('lot:closed', (p) => p.streamId === id && setLot(null)),
    ];
    return () => offs.forEach((off) => off());
  }, [id]);

  const rows = [
    ...(lot ? [{ id: `lot-${lot.lotNo}`, name: lot.productName, grad: lot.grad, mode: lot.mode, onAir: true }] : []),
    ...queue,
  ];

  return (
    <View style={{ flex: 1 }}>
      <SheetHeader title="Catálogo de este vivo" subtitle="Salen al aire en este orden." onClose={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {rows.map((product: any, i) => (
          <View key={product.id}>
            {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.rowSeparator, marginLeft: 92 }} />}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: product.onAir ? '#FBF3EC' : 'transparent' }}>
              <Text style={[{ width: 18, textAlign: 'right', fontSize: 15, fontWeight: '600', color: product.onAir ? C.bid : C.tertiary }, T.num]}>{i + 1}</Text>
              <Placeholder color={product.grad || C.tint} style={{ width: 48, height: 48 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: C.label }}>{product.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <ModeChip mode={product.mode as Mode} />
                  <Text style={[T.footnote, T.num, product.onAir && { color: C.bidText, fontWeight: '600' }]}>
                    {product.onAir ? 'En el aire' : product.mode === 'fixed' ? `${bs(product.price)} · ${product.stock} u.` : `Desde ${bs(product.start)}`}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ))}
        {rows.length === 0 && (
          <Text style={[T.subhead, { color: C.secondary, textAlign: 'center', padding: 24 }]}>El vendedor todavía no cargó productos.</Text>
        )}
      </ScrollView>
    </View>
  );
}
