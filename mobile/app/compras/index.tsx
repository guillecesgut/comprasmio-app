import React from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, bs, clock } from '@/api';
import { useData } from '@/hooks';
import { useCountdown, shortDate } from '@/format';
import { NavBar, ChipRow, FilterChip, Img, StatusChip, Btn, Press, Sym, Loading, EmptyCard, ErrorLine } from '@/ui';
import { C, T, R } from '@/theme';

const FILTERS = [
  { key: 'todos', label: 'Todos' }, { key: 'pago_en_revision', label: 'Pago en revisión' }, { key: 'en_camino', label: 'En camino' },
  { key: 'entregados', label: 'Entregados' }, { key: 'en_reclamo', label: 'En reclamo' },
];

/** B6 · Mis compras: pendientes de pago arriba con cuenta atrás, después la lista filtrable. */
export default function Compras() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = React.useState(params.filter || 'todos');
  const { data, error, loading, reload } = useData(() => api.orders(filter), [filter], { events: ['order:update', 'payment:update'] });

  // Varios pedidos pendientes pueden compartir un pago: una tarjeta por pago.
  const pendingByPayment: any[] = [];
  for (const o of data?.pending || []) {
    const g = pendingByPayment.find((x) => x.paymentId === o.paymentId);
    if (g) { g.orders.push(o); g.total += o.total; } else pendingByPayment.push({ paymentId: o.paymentId, expiresAt: o.paymentExpiresAt, orders: [o], total: o.total });
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Mis compras" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} />}>
        <View style={{ paddingHorizontal: 16 }}><ErrorLine message={error} /></View>
        {pendingByPayment.map((g) => <PendingCard key={g.paymentId} group={g} />)}
        <ChipRow style={{ marginVertical: 12 }}>
          {FILTERS.map((f) => <FilterChip key={f.key} label={f.label} count={data?.counts?.[f.key]} active={filter === f.key} onPress={() => setFilter(f.key)} />)}
        </ChipRow>
        {!data ? <Loading /> : data.items.length === 0 ? (
          <EmptyCard title="No hay compras acá" body={filter === 'todos' ? 'Cuando compres algo, lo vas a seguir desde esta pantalla.' : 'Probá con otro filtro.'}
            action={filter === 'todos' ? <Btn title="Explorar" onPress={() => router.navigate('/inicio')} /> : undefined} />
        ) : (
          <View style={styles.list}>
            {data.items.map((o: any, i: number) => (
              <Press key={o.id} onPress={() => router.push(`/compras/${o.id}`)} style={[styles.row, i > 0 && styles.sep]}>
                <Img url={o.photoUrl} color={o.color} radius={12} style={{ width: 56, height: 56 }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={T.headline} numberOfLines={1}>{o.seller.name}</Text>
                    <Text style={[T.headline, T.num]}>{bs(o.total)}</Text>
                  </View>
                  <Text style={T.footnote} numberOfLines={1}>{o.ref} · {o.units} {o.units === 1 ? 'producto' : 'productos'} · {shortDate(o.createdAt)}</Text>
                  <StatusChip status={o.status} />
                </View>
                <Sym name="chevron.forward" size={13} color={C.tertiary} weight="semibold" />
              </Press>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function PendingCard({ group }: { group: any }) {
  const left = useCountdown(group.expiresAt);
  return (
    <View style={styles.pending}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <StatusChip status="pendiente_pago" />
        <Text style={[{ color: C.bidText, fontWeight: '700' }, T.num]}>{left > 0 ? clock(left) : 'Venciendo…'}</Text>
      </View>
      <Text style={T.headline}>{group.orders.map((o: any) => o.seller.name).join(' · ')}</Text>
      <Text style={T.footnote}>{group.orders.map((o: any) => o.title).join(', ')}</Text>
      <Btn title={`Pagar ahora · ${bs(group.total)}`} height={44} onPress={() => router.push(`/pago/${group.paymentId}`)} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: C.white, borderRadius: R.card, marginHorizontal: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.rowSeparator },
  pending: { backgroundColor: C.white, borderRadius: R.card, marginHorizontal: 16, marginTop: 10, padding: 16, gap: 8, borderWidth: 1.5, borderColor: '#FBE9DC' },
});
