import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, bs } from '@/api';
import { useData } from '@/hooks';
import { Group, Row, Img, ModeChip, Btn, Loading, ErrorLine, SectionHeader } from '@/ui';
import { C, T, R } from '@/theme';

/** Resultado de cada lote para el resumen ("Oferta cerrada · 6 de 6", "@x se lo llevó", "Sin venta…"). */
function result(r: any) {
  if (r.mode === 'fijo') return { text: `Oferta cerrada · ${r.committed} de ${r.qty}`, back: r.qty - r.committed };
  const sold = r.results.filter((x: any) => x.status === 'sold');
  const noSale = r.results.filter((x: any) => x.status === 'no_sale');
  if (sold.length && r.qty === 1) return { text: `@${sold[0].winner} se lo llevó · ${bs(sold[0].price)}`, back: 0 };
  if (sold.length) return { text: `${sold.length} de ${r.qty} vendidas`, back: r.qty - r.committed };
  if (noSale.length) return { text: `Sin venta · llegó a ${bs(noSale[noSale.length - 1].price)}, mín. ${bs(r.min)}`, back: r.qty };
  return { text: 'No salió al aire', back: r.qty };
}

/** C7b · Fin del vivo: lo vendido, lo que volvió al catálogo y KPIs. */
export default function FinDelVivo() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data: s, error } = useData(() => api.seller_.streamSummary(id).then((r) => r.summary), [id]);
  const hours = s ? Math.floor(s.durationMin / 60) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.groupedBg }} contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 40 }}>
      {!s ? (error ? <ErrorLine message={error} /> : <Loading />) : (
        <>
          <View style={{ paddingHorizontal: 20, gap: 6 }}>
            <Text style={T.footnote}>{s.title}</Text>
            <Text style={T.title1}>Vivo terminado · {hours ? `${hours} h ` : ''}{s.durationMin % 60} min</Text>
            <Text style={[T.body, { color: C.secondary }]}>
              Vendiste {s.sold} de {s.reserved}.{s.returned ? ` ${s.returned === 1 ? 'La restante volvió' : `Las ${s.returned} restantes volvieron`} a tu catálogo.` : ''}
            </Text>
          </View>

          <View style={styles.grid}>
            <View style={[styles.kpi, { width: '100%', backgroundColor: C.forest }]}>
              <Text style={{ color: '#A9C3B9' }}>Ventas del vivo</Text>
              <Text style={[{ color: C.white, fontSize: 32, fontWeight: '700' }, T.num]}>{bs(s.orders.total)}</Text>
              <Text style={{ color: '#A9C3B9', fontSize: 13 }}>{s.orders.count} pedidos{s.orders.pendingPayments ? ` · ${s.orders.pendingPayments} pagos pendientes` : ''}</Text>
            </View>
            <View style={styles.kpi}><Text style={T.footnote}>Espectadores máx.</Text><Text style={[T.title2, T.num]}>{s.peakViewers}</Text></View>
            <View style={styles.kpi}><Text style={T.footnote}>Nuevos seguidores</Text><Text style={[T.title2, T.num]}>{s.newFollowers}</Text></View>
          </View>

          <SectionHeader title="Lotes" />
          <Group inset={74}>
            {s.lots.map((r: any) => {
              const res = result(r);
              return (
                <Row key={r.reservationId} left={<Img url={r.photoUrl} color={r.color} radius={10} style={{ width: 46, height: 46 }} />}
                  title={r.title} subtitle={`${res.text}${res.back > 0 && s.status === 'ended' ? ` · volvió${res.back > 1 ? `n ${res.back}` : ''}` : ''}`}
                  right={<ModeChip mode={r.kind === 'paquete' ? 'paquete' : r.mode} />} />
              );
            })}
          </Group>

          <View style={{ padding: 16, gap: 10 }}>
            <Btn title="Ver pedidos del vivo" tone="tonal" onPress={() => router.replace('/pedidos')} />
            <Btn title="Listo" onPress={() => router.replace('/resumen')} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 },
  kpi: { width: '47.8%', backgroundColor: C.white, borderRadius: R.card, padding: 16, gap: 4 },
});
