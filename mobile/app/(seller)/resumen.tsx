import React from 'react';
import { View, Text, RefreshControl, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { api, bs } from '@/api';
import { useSession } from '@/session';
import { useData } from '@/hooks';
import { weekdayDate } from '@/format';
import { Screen, Circle, Avatar, Segmented, Press, Group, Row, Sym, SectionHeader, ErrorLine, Skeleton, Notice, Btn, type SymbolName } from '@/ui';
import { C, T, R } from '@/theme';

type Period = 'hoy' | 'semana' | 'mes';
const PERIOD_LABEL: Record<Period, string> = { hoy: 'Ventas de hoy', semana: 'Ventas de la semana', mes: 'Ventas del mes' };

/** C1 · Resumen del vendedor. */
export default function Resumen() {
  const { user, badges } = useSession();
  const [period, setPeriod] = React.useState<Period>('semana');
  const { data: d, error, loading, reload } = useData(() => api.seller_.summary(period), [period], { events: ['order:new', 'order:update'] });
  const plan = useData(() => api.seller_.plan().then((r) => r.plan), []);
  const pay = useData(() => api.seller_.payouts(), []);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading && !!d} onRefresh={reload} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={T.footnote}>Tu tienda</Text>
          <Text style={T.title2} numberOfLines={1}>{d?.storeName || user?.name}</Text>
        </View>
        <Circle icon="bell" bg={C.white} badge={badges.unread} onPress={() => router.push('/notificaciones')} label="Avisos" />
        <Press onPress={() => router.push('/vendedor/cuenta')} accessibilityLabel="Tu cuenta"><Avatar initials={user?.initials || '?'} bg={C.bid} /></Press>
      </View>

      {pay.data?.accountStatus && pay.data.accountStatus !== 'verified' && (
        <Notice tone="amber" icon="banknote" style={{ marginTop: 14 }}
          action={<Btn title={pay.data.accountStatus === 'missing' ? 'Cargar datos' : 'Revisar datos'} tone="tonal" height={34} style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/vendedor/cobros/datos')} />}>
          {pay.data.accountStatus === 'missing' ? 'Cargá tus datos para cobrar: sin ellos no podemos transferirte.'
            : pay.data.accountStatus === 'rejected' ? 'Tus datos para cobrar fueron rechazados. Revisalos.'
              : 'Estamos revisando tus datos para cobrar.'}
        </Notice>
      )}
      {plan.data?.expiringSoon && (
        <Notice tone="amber" icon="crown.fill" style={{ marginTop: 10 }}
          action={<Btn title="Renovar" tone="tonal" height={34} style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/vendedor/plan')} />}>
          {`Tu Premium vence en ${plan.data.daysLeft} ${plan.data.daysLeft === 1 ? 'día' : 'días'}.`}
        </Notice>
      )}

      <Segmented style={{ marginHorizontal: 16, marginTop: 16 }} value={period} onChange={setPeriod}
        options={[{ key: 'hoy', label: 'Hoy' }, { key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mes' }]} />
      <View style={{ paddingHorizontal: 16 }}><ErrorLine message={error} /></View>

      {!d ? <View style={{ padding: 16, gap: 12 }}><Skeleton style={{ height: 220, borderRadius: 22 }} /><Skeleton style={{ height: 120, borderRadius: 22 }} /></View> : (
        <>
          <View style={styles.dark}>
            <Text style={{ color: '#A9C3B9', fontSize: 15 }}>{PERIOD_LABEL[period]}</Text>
            <Text style={[{ color: C.white, fontSize: 38, fontWeight: '700', letterSpacing: -0.5 }, T.num]}>{bs(d.sales.total)}</Text>
            <Text style={[{ color: '#A9C3B9', fontSize: 13 }, T.num]}>{d.sales.orders} {d.sales.orders === 1 ? 'pedido' : 'pedidos'}</Text>
            <Bars days={d.sales.days} />
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Legend color={C.mint} label={`Catálogo ${bs(d.sales.catalogo)}`} />
              <Legend color={C.bidLight} label={`En vivo ${bs(d.sales.vivo)}`} />
            </View>
          </View>

          <View style={styles.grid}>
            <Kpi icon="banknote" title="Próximo pago" value={bs(d.nextPayout.net)} sub={weekdayDate(d.nextPayout.date)} onPress={() => router.push('/vendedor/cobros')} />
            <Kpi icon="shippingbox" title="Por preparar" value={String(d.toPrepare)} sub={d.toPrepare === 1 ? 'pedido' : 'pedidos'} onPress={() => router.navigate('/pedidos')} />
            <Kpi icon="percent" title="Comisión del mes" value={bs(d.monthCommission.amount)} sub={`${d.monthCommission.pct} % · ${d.plan === 'premium' ? 'Premium' : 'Básico'}`} onPress={() => router.push('/vendedor/plan')} />
            <Kpi icon="star.fill" title="Reseñas" value={d.reviews.count ? `★ ${String(d.reviews.avg).replace('.', ',')}` : '—'}
              sub={d.reviews.unanswered ? `${d.reviews.unanswered} sin responder` : `${d.reviews.count} en total`} onPress={() => router.push('/vendedor/resenas')} />
          </View>
        </>
      )}

      <SectionHeader title="Mi tienda" />
      <Group inset={50}>
        <Row icon="banknote" title="Cobros y liquidaciones" chevron onPress={() => router.push('/vendedor/cobros')} />
        <Row icon="storefront" title="Mi tienda" chevron onPress={() => router.push('/vendedor/tienda')} />
        <Row icon="crown.fill" iconColor={C.bid} title="Mi plan" subtitle={plan.data ? (plan.data.plan === 'premium' ? 'Premium' : 'Básico') : undefined} chevron onPress={() => router.push('/vendedor/plan')} />
        <Row icon="star" title="Reseñas" chevron onPress={() => router.push('/vendedor/resenas')} />
        <Row icon="dot.radiowaves.left.and.right" iconColor={C.bid} title="Mis vivos" chevron onPress={() => router.push('/vendedor/vivos')} />
      </Group>
    </Screen>
  );
}

function Bars({ days }: { days: { day: string; catalogo: number; vivo: number }[] }) {
  const max = Math.max(1, ...days.map((x) => x.catalogo + x.vivo));
  const label = (iso: string) => (days.length <= 7 ? ['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(`${iso}T12:00:00Z`).getUTCDay()] : String(Number(iso.slice(8))));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: days.length > 14 ? 2 : 6, height: 110, marginVertical: 14 }}>
      {days.map((x, i) => (
        <View key={x.day} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <View style={{ width: '100%', justifyContent: 'flex-end', height: 88 }}>
            {x.vivo > 0 && <View style={{ height: (x.vivo / max) * 88, backgroundColor: C.bidLight, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />}
            <View style={{ height: Math.max(3, (x.catalogo / max) * 88), backgroundColor: x.catalogo ? C.mint : '#1F6B59', borderRadius: x.vivo ? 0 : 4 }} />
          </View>
          {(days.length <= 14 || i % 5 === 0) && <Text style={{ color: '#A9C3B9', fontSize: 10 }}>{label(x.day)}</Text>}
        </View>
      ))}
    </View>
  );
}

const Legend = ({ color, label }: { color: string; label: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: color }} />
    <Text style={[{ color: '#DDE7E3', fontSize: 13 }, T.num]}>{label}</Text>
  </View>
);

function Kpi({ icon, title, value, sub, onPress }: { icon: SymbolName; title: string; value: string; sub: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} style={styles.kpi}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Sym name={icon} size={15} color={C.tint} />
        <Text style={[T.footnote, { flex: 1 }]} numberOfLines={1}>{title}</Text>
      </View>
      <Text style={[{ fontSize: 24, fontWeight: '700', color: C.label }, T.num]} numberOfLines={1}>{value}</Text>
      <Text style={T.footnote} numberOfLines={1}>{sub}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  dark: { backgroundColor: C.forest, borderRadius: R.card, marginHorizontal: 16, marginTop: 16, padding: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, marginTop: 12 },
  kpi: { width: '47.8%', backgroundColor: C.white, borderRadius: R.card, padding: 16, gap: 4 },
});
