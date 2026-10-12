import React from 'react';
import { View, Text, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api, bs, clock, realtime } from '@/api';
import { Screen, LargeTitle, Group, Row, SectionHeader, EmptyCard, Placeholder, StatusChip, Btn, Circle } from '@/ui';
import { useCountdown } from '@/format';
import { C, T, R } from '@/theme';

/** B6 · Compras. */
export default function Compras() {
  const [orders, setOrders] = React.useState<any[] | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    const { orders } = await api.orders().catch(() => ({ orders: [] as any[] }));
    setOrders(orders);
  }, []);

  useFocusEffect(React.useCallback(() => { load(); }, [load]));

  // Cuando el vendedor verifica un pago, la fila cambia sola.
  React.useEffect(() => {
    const offs = [
      realtime.on('order:update', ({ order }) => setOrders((list) => list?.map((o) => (o.id === order.id ? order : o)) ?? list)),
      realtime.on('auction:won', load),
      realtime.on('purchase:done', load),
    ];
    return () => offs.forEach((off) => off());
  }, [load]);

  const pending = (orders || []).filter((o) => o.status === 'pendiente_pago');
  const previous = (orders || []).filter((o) => o.status !== 'pendiente_pago');

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.tint} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <LargeTitle title="Compras" subtitle="Todo se paga por transferencia QR" style={{ paddingTop: 52 }} />

      {orders !== null && orders.length === 0 && (
        <EmptyCard
          title="Todavía no compraste nada"
          body="Entrá a un vivo y comprá al toque, o pujá por un lote."
          action={<Btn title="Ver transmisiones" onPress={() => router.navigate('/inicio')} height={46} />}
        />
      )}

      <View style={{ gap: 12 }}>
        {pending.map((order) => <PendingCard key={order.id} order={order} />)}
      </View>

      {previous.length > 0 && (
        <>
          <SectionHeader title="Anteriores" />
          <Group inset={92}>
            {previous.map((order) => (
              <Row
                key={order.id}
                minHeight={72}
                chevron
                onPress={() => router.push(`/mensajes/${order.sellerId}?orden=${order.id}`)}
                left={<Placeholder color={order.grad} style={{ width: 48, height: 48 }} />}
                title={
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text numberOfLines={1} style={[T.callout, { fontWeight: '600', flex: 1 }]}>{order.productName}</Text>
                    <Text style={[T.callout, T.num]}>{bs(order.total)}</Text>
                  </View>
                }
                subtitle={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
                    <StatusChip status={order.status} />
                    <Text numberOfLines={1} style={[T.footnote, { flex: 1 }]}>{order.sellerName}</Text>
                  </View>
                }
              />
            ))}
          </Group>
        </>
      )}
    </Screen>
  );
}

function PendingCard({ order }: { order: any }) {
  const left = useCountdown(order.createdAt);
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: R.card, marginHorizontal: 16, padding: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Placeholder color={order.grad} style={{ width: 60, height: 60 }} radius={14} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Text numberOfLines={1} style={[T.callout, { fontWeight: '600', flex: 1 }]}>{order.productName}</Text>
            <Text style={[T.callout, T.num, { fontWeight: '700', color: C.tintText }]}>{bs(order.total)}</Text>
          </View>
          <Text numberOfLines={1} style={[T.footnote, { marginTop: 2 }]}>{order.sellerName} · {order.ref}</Text>
          <View style={{ marginTop: 6 }}>
            <StatusChip status="pendiente_pago" suffix={left > 0 ? clock(left) : 'vencido'} />
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <Btn title="Pagar ahora" tone="bid" height={40} flex onPress={() => router.push(`/pago/${order.id}`)} />
        <Circle icon="bubble.left" bg={C.fill2} size={40} label="Escribir al vendedor" onPress={() => router.push(`/mensajes/${order.sellerId}?orden=${order.id}`)} />
      </View>
    </View>
  );
}
