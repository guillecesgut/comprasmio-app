import React from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, bs, realtime } from '@/api';
import { Screen, LargeTitle, EmptyCard, Placeholder, StatusChip, Btn, Circle, Sym, ErrorLine, useToast } from '@/ui';
import { ago } from '@/format';
import { C, T, R } from '@/theme';

const TABS = [
  { key: 'todas', label: 'Todas' },
  { key: 'en_revision', label: 'En revisión' },
  { key: 'pendiente_pago', label: 'Sin pagar' },
  { key: 'verificado', label: 'Verificadas' },
  { key: 'enviado', label: 'Enviadas' },
] as const;

/** C4 · Órdenes. Verificá el comprobante antes de despachar. */
export default function Ordenes() {
  const { estado } = useLocalSearchParams<{ estado?: string }>();
  const toast = useToast();
  const [tab, setTab] = React.useState<string>('todas');
  const [orders, setOrders] = React.useState<any[] | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  // Desde "Por verificar" en Resumen llega ya filtrado.
  React.useEffect(() => { if (estado) setTab(estado); }, [estado]);

  const load = React.useCallback(async () => {
    try {
      const { orders } = await api.sellerOrders();
      setOrders(orders);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useFocusEffect(React.useCallback(() => { load(); }, [load]));
  React.useEffect(() => {
    const offs = ['order:new', 'order:update'].map((t) => realtime.on(t, load));
    return () => offs.forEach((off) => off());
  }, [load]);

  const ship = async (order: any) => {
    setBusyId(order.id);
    try {
      await api.shipOrder(order.id);
      toast(`Marcada como enviada · @${order.buyerHandle}`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const all = orders || [];
  const count = (key: string) => (key === 'todas' ? all.length : all.filter((o) => o.status === key).length);
  const list = tab === 'todas' ? all : all.filter((o) => o.status === tab);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.tint} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <LargeTitle title="Órdenes" style={{ paddingTop: 52 }} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: active ? C.label : C.surface }}
            >
              <Text style={{ fontSize: 15, fontWeight: active ? '600' : '400', color: active ? C.white : C.label }}>{t.label}</Text>
              <Text style={[{ fontSize: 13, color: active ? 'rgba(255,255,255,.7)' : C.secondary }, T.num]}>{count(t.key)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={[T.footnote, { paddingHorizontal: 32, marginTop: 10, marginBottom: 12 }]}>Verificá el comprobante antes de despachar.</Text>
      <View style={{ paddingHorizontal: 20 }}><ErrorLine message={error} /></View>

      {orders !== null && list.length === 0 ? (
        <EmptyCard title="No hay órdenes en este filtro" body="Las compras de tus vivos aparecen acá apenas alguien gana un lote o compra a precio fijo." />
      ) : (
        <View style={{ gap: 10 }}>
          {list.map((order) => (
            <View key={order.id} style={{ backgroundColor: C.surface, borderRadius: R.card, marginHorizontal: 16, padding: 14 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Placeholder color={order.grad} style={{ width: 52, height: 52 }} radius={12} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Text numberOfLines={1} style={[T.callout, { fontWeight: '600', flex: 1 }]}>{order.productName}</Text>
                    <Text style={[T.callout, T.num, { fontWeight: '700' }]}>{bs(order.total)}</Text>
                  </View>
                  <Text numberOfLines={1} style={[T.footnote, { marginTop: 2 }]}>@{order.buyerHandle} · {order.ref} · {ago(order.createdAt)}</Text>
                  <View style={{ marginTop: 6 }}><StatusChip status={order.status} /></View>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <Circle
                  icon="bubble.left" bg={C.fill2} size={40} label={`Escribir a @${order.buyerHandle}`}
                  onPress={() => router.push(`/cliente/${order.buyerId}?orden=${order.id}`)}
                />
                {order.status === 'en_revision' && (
                  <Btn title="Revisar y verificar" height={40} flex onPress={() => router.push(`/comprobante/${order.id}`)} />
                )}
                {order.status === 'verificado' && (
                  <Btn title="Marcar enviado" tone="outlineTint" height={40} flex loading={busyId === order.id} onPress={() => ship(order)} />
                )}
                {order.status === 'pendiente_pago' && <Text style={[T.subhead, { color: C.secondary }]}>Esperando comprobante…</Text>}
                {order.status === 'enviado' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Sym name="shippingbox.fill" size={16} color={C.secondary} />
                    <Text style={[T.subhead, { color: C.secondary }]}>En camino</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
