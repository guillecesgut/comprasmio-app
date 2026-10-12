import React from 'react';
import { View, Text, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api, bs, realtime } from '@/api';
import { useSession } from '@/session';
import { HeaderActions } from '@/HeaderActions';
import { Screen, Segmented, Group, Row, SectionHeader, Press, ErrorLine } from '@/ui';
import { C, T, R } from '@/theme';

type Period = 'hoy' | 'semana' | 'mes';

const DAY_LETTER: Record<string, string> = { lun: 'L', mar: 'M', 'mié': 'M', jue: 'J', vie: 'V', 'sáb': 'S', dom: 'D' };

/**
 * C1 · Resumen (incluye Ventas). El servidor hoy calcula los totales sobre
 * todas las órdenes y el gráfico sobre los últimos 7 días: el selector
 * Hoy/Semana/Mes solo cambia el gráfico hasta que exista un filtro por período.
 */
export default function Resumen() {
  const { user } = useSession();
  const [data, setData] = React.useState<any>(null);
  const [review, setReview] = React.useState<any[]>([]);
  const [period, setPeriod] = React.useState<Period>('semana');
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [overview, { orders }] = await Promise.all([api.overview(), api.sellerOrders('en_revision')]);
      setData(overview);
      setReview(orders);
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

  const kpis = data?.kpis;
  const week: { day: string; total: number }[] = data?.week || [];
  const bars = period === 'hoy' ? week.slice(-1) : week;
  const max = Math.max(1, ...bars.map((d) => d.total));
  const byMode = data?.byMode || { auction: 0, fixed: 0 };
  const modeTotal = Math.max(1, byMode.auction + byMode.fixed);
  const reviewTotal = review.reduce((s, o) => s + o.total, 0);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.tint} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
        <Text style={[T.subhead, { color: C.secondary, flex: 1 }]} numberOfLines={1}>{user?.name}</Text>
        <HeaderActions />
      </View>
      <Text style={[T.largeTitle, { paddingHorizontal: 20, marginTop: 12 }]} accessibilityRole="header">Resumen</Text>

      <Segmented
        style={{ marginHorizontal: 16, marginTop: 12 }}
        value={period}
        onChange={setPeriod}
        options={[{ key: 'hoy', label: 'Hoy' }, { key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mes' }]}
      />
      <View style={{ paddingHorizontal: 20 }}><ErrorLine message={error} /></View>

      <View style={{ backgroundColor: C.forest, borderRadius: R.card, marginHorizontal: 16, marginTop: 14, padding: 18 }}>
        <Text style={{ color: '#B9CCC5', fontSize: 15 }}>Ingresos verificados</Text>
        <Text style={[{ color: C.white, fontSize: 38, fontWeight: '700', letterSpacing: -0.6, marginTop: 2 }, T.num]}>{bs(kpis?.revenue ?? 0)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 92, marginTop: 14 }}>
          {bars.map((d, i) => {
            const today = i === bars.length - 1;
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }} accessibilityLabel={`${d.day}: ${bs(d.total)}`}>
                <View style={{ width: '100%', height: Math.max(4, (d.total / max) * 70), borderRadius: 6, backgroundColor: today ? C.mint : '#1F6B59' }} />
                <Text style={{ color: '#B9CCC5', fontSize: 11 }}>{DAY_LETTER[d.day] || d.day}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 10 }}>
        <Press style={{ flex: 1 }} onPress={() => router.navigate({ pathname: '/ordenes', params: { estado: 'en_revision' } })} accessibilityRole="button">
          <View style={{ backgroundColor: C.surface, borderRadius: R.card, padding: 16 }}>
            <Text style={[T.subhead, { color: C.secondary }]}>Por verificar</Text>
            <Text style={[{ fontSize: 24, fontWeight: '700', color: C.bidText, marginTop: 4 }, T.num]}>{bs(reviewTotal)}</Text>
            <Text style={[T.footnote, { color: C.bidText, marginTop: 2 }]}>{review.length} {review.length === 1 ? 'comprobante' : 'comprobantes'}</Text>
          </View>
        </Press>
        <View style={{ flex: 1, backgroundColor: C.surface, borderRadius: R.card, padding: 16 }}>
          <Text style={[T.subhead, { color: C.secondary }]}>Ticket promedio</Text>
          <Text style={[{ fontSize: 24, fontWeight: '700', color: C.label, marginTop: 4 }, T.num]}>{bs(kpis?.averageTicket ?? 0)}</Text>
          <Text style={[T.footnote, { marginTop: 2 }]}>{kpis?.orders ?? 0} órdenes</Text>
        </View>
      </View>

      <SectionHeader title="Por forma de venta" />
      <Group>
        {(['auction', 'fixed'] as const).map((mode) => (
          <View key={mode} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={T.body}>{mode === 'auction' ? 'Subasta' : 'Precio fijo'}</Text>
              <Text style={[T.body, T.num, { fontWeight: '700' }]}>{bs(byMode[mode])}</Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: C.fill2, overflow: 'hidden' }}>
              <View style={{ height: 8, width: `${(byMode[mode] / modeTotal) * 100}%`, backgroundColor: mode === 'auction' ? C.bid : C.tint }} />
            </View>
          </View>
        ))}
      </Group>

      <SectionHeader title="Mejores compradores" />
      {(data?.topBuyers || []).length === 0 ? (
        <View style={{ backgroundColor: C.surface, borderRadius: R.card, marginHorizontal: 16, padding: 16 }}>
          <Text style={[T.subhead, { color: C.secondary }]}>Cuando vendas, tus compradores aparecen acá.</Text>
        </View>
      ) : (
        <Group>
          {data.topBuyers.map((b: any) => (
            <Row
              key={b.handle}
              title={<Text style={[T.body, { color: C.tintText, fontWeight: '600' }]}>@{b.handle}</Text>}
              right={
                <Text style={[T.subhead, T.num, { color: C.secondary }]}>
                  {b.orders} órdenes · <Text style={{ fontWeight: '700', color: C.label }}>{bs(b.spend)}</Text>
                </Text>
              }
            />
          ))}
        </Group>
      )}
    </Screen>
  );
}
