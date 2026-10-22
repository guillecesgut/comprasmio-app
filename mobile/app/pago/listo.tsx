import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, bs } from '@/api';
import { useData } from '@/hooks';
import { Btn, Group, Row, StatusChip, Sym, Loading } from '@/ui';
import { C, T } from '@/theme';

/** D8b · Comprobante enviado (reemplaza a D8; no se vuelve al QR). */
export default function Listo() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data: p } = useData(() => api.payment(id).then((r) => r.payment), [id]);
  const approved = p?.status === 'approved';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.groupedBg }} contentContainerStyle={{ paddingTop: insets.top + 48, paddingBottom: 40 }}>
      <View style={{ alignItems: 'center', paddingHorizontal: 32, gap: 10 }}>
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' }}>
          <Sym name="checkmark" size={40} color={C.white} weight="bold" />
        </View>
        <Text style={[T.title1, { textAlign: 'center' }]}>{approved ? 'Pago confirmado' : 'Recibimos tu comprobante'}</Text>
        <Text style={[T.body, { color: C.secondary, textAlign: 'center' }]}>
          {approved
            ? 'Los vendedores ya pueden preparar tu pedido.'
            : 'Lo verificamos en las próximas horas. Te avisamos cuando esté confirmado.'}
        </Text>
      </View>

      {!p ? <Loading /> : p.orders.length > 0 && (
        <>
          <Text style={[T.section, { paddingHorizontal: 32, paddingTop: 28, paddingBottom: 8 }]}>Pedidos generados</Text>
          <Group>
            {p.orders.map((o: any) => (
              <Row key={o.id} title={<Text style={[T.body, { fontFamily: 'Menlo' }]}>{o.ref}</Text>} subtitle={`${o.seller} · ${bs(o.total)}`}
                right={<StatusChip status={o.status} />} onPress={() => router.replace(`/compras/${o.id}`)} />
            ))}
          </Group>
        </>
      )}

      <View style={{ padding: 16, gap: 10, marginTop: 12 }}>
        <Btn title="Ver mis compras" onPress={() => router.replace('/compras')} />
        <Btn title="Seguir comprando" tone="tonal" onPress={() => router.replace('/inicio')} />
      </View>
    </ScrollView>
  );
}
