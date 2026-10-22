import React from 'react';
import { View, Text, ScrollView, Linking, RefreshControl, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { api, bs } from '@/api';
import { useData } from '@/hooks';
import { weekdayDate, shortDate } from '@/format';
import { NavBar, Group, Row, StatusChip, Chip, Notice, Btn, Loading, ErrorLine, SectionHeader, Sym, TotalLine } from '@/ui';
import { C, T, R, SOFT } from '@/theme';

const ACCOUNT: Record<string, [string, string, string]> = {
  verified: ['Verificados', SOFT.green.bg, SOFT.green.fg],
  pending: ['En revisión', SOFT.amber.bg, SOFT.amber.fg],
  rejected: ['Rechazados', SOFT.red.bg, SOFT.red.fg],
  missing: ['Sin cargar', SOFT.red.bg, SOFT.red.fg],
};

/** E7 · Cobros: lo que entra en el corte de esta semana, lo retenido y los pagos anteriores. */
export default function Cobros() {
  const { data: d, error, loading, reload } = useData(() => api.seller_.payouts(), [], { events: ['order:update'] });
  const [all, setAll] = React.useState(false);

  if (!d) return <View style={{ flex: 1, backgroundColor: C.groupedBg }}><NavBar title="Cobros" />{error ? <ErrorLine message={error} /> : <Loading />}</View>;
  const acc = ACCOUNT[d.accountStatus] || ACCOUNT.missing;
  const orders: any[] = d.thisWeek.orders;

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Cobros" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
        {d.accountStatus !== 'verified' && (
          <Notice tone="amber" icon="exclamationmark.triangle.fill" style={{ marginBottom: 12 }}
            action={<Btn title={d.accountStatus === 'missing' ? 'Cargar datos para cobrar' : 'Ver datos'} tone="tonal" height={36} style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/vendedor/cobros/datos')} />}>
            {d.accountStatus === 'missing' ? 'Todavía no cargaste tus datos para cobrar.' : d.accountStatus === 'rejected' ? 'Tus datos para cobrar fueron rechazados.' : 'Estamos revisando tus datos para cobrar.'}
          </Notice>
        )}

        {d.scheduled && (
          <View style={[styles.dark, { marginBottom: 12, backgroundColor: C.tint }]}>
            <Text style={{ color: '#DDF2EA', fontSize: 15 }}>Pago programado · {weekdayDate(d.scheduled.date)}</Text>
            <Text style={[{ color: C.white, fontSize: 32, fontWeight: '700' }, T.num]}>{bs(d.scheduled.net)}</Text>
            <Text style={{ color: '#DDF2EA', fontSize: 13 }}>{d.scheduled.orders} pedidos de la semana pasada</Text>
          </View>
        )}

        <View style={styles.dark}>
          <Text style={{ color: '#A9C3B9', fontSize: 15 }}>Próximo pago · {weekdayDate(d.thisWeek.payOn)}</Text>
          <Text style={{ color: '#A9C3B9', fontSize: 13 }}>Esta semana (corte el {weekdayDate(d.thisWeek.cutOn)})</Text>
          <Text style={[{ color: C.white, fontSize: 38, fontWeight: '700', marginTop: 4 }, T.num]}>{bs(d.thisWeek.net)}</Text>
          <View style={{ gap: 4, marginTop: 10 }}>
            <Line label="Ventas entregadas" value={bs(d.thisWeek.gross)} />
            <Line label="Comisión" value={`− ${bs(d.thisWeek.commission)}`} />
            <Line label="Neto" value={bs(d.thisWeek.net)} bold />
          </View>
        </View>
        <Text style={[T.footnote, { paddingHorizontal: 24, marginTop: 10 }]}>
          Te pagamos cada semana los pedidos entregados. Los pedidos en reclamo quedan retenidos hasta resolverse.
        </Text>

        <SectionHeader title={`Entra en este corte · ${orders.length} ${orders.length === 1 ? 'pedido' : 'pedidos'}`} />
        {orders.length ? (
          <Group>
            {(all ? orders : orders.slice(0, 5)).map((o) => (
              <Row key={o.id} title={<Text style={[T.body, { fontFamily: 'Menlo', fontSize: 15 }]}>{o.ref}</Text>} subtitle={`@${o.buyer}`}
                right={<Text style={[T.subhead, T.num]}>{bs(o.net)}</Text>} onPress={() => router.push(`/vendedor/pedidos/${o.id}`)} />
            ))}
            {orders.length > 5 && !all && <Row title={<Text style={{ color: C.tintText, fontSize: 16 }}>Ver los {orders.length}</Text>} onPress={() => setAll(true)} />}
          </Group>
        ) : <Text style={[T.footnote, { paddingHorizontal: 32 }]}>Todavía no hay pedidos entregados esta semana.</Text>}

        {d.held.orders.length > 0 && (
          <>
            <SectionHeader title={`Retenido · ${bs(d.held.total)}`} color={C.destructive} />
            <Group>
              {d.held.orders.map((o: any) => (
                <Row key={o.id} icon="lock.fill" iconColor={C.destructive} title={o.ref} subtitle={`@${o.buyer} · en reclamo`}
                  right={<Text style={[T.subhead, T.num]}>{bs(o.net)}</Text>} onPress={() => router.push(`/vendedor/pedidos/${o.id}`)} />
              ))}
            </Group>
          </>
        )}

        <SectionHeader title="Pagos anteriores" />
        {d.history.length ? (
          <Group>
            {d.history.map((p: any) => (
              <Row key={p.id} title={`Semana al ${shortDate(p.periodEnd)}`} subtitle={`${p.orders} pedidos · pagado el ${shortDate(p.date)}${p.operationNumber ? ` · Op. ${p.operationNumber}` : ''}`}
                right={<View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[T.subhead, T.num]}>{bs(p.net)}</Text>
                  <Chip label="Pagada" bg={C.tint} fg={C.white} />
                </View>}
                onPress={p.receiptUrl ? () => Linking.openURL(p.receiptUrl) : undefined} />
            ))}
          </Group>
        ) : <Text style={[T.footnote, { paddingHorizontal: 32 }]}>Acá vas a ver cada transferencia con su comprobante.</Text>}

        <Group style={{ marginTop: 24 }}>
          <Row icon="building.columns" title="Datos para cobrar" chevron onPress={() => router.push('/vendedor/cobros/datos')}
            right={<Chip label={acc[0]} bg={acc[1]} fg={acc[2]} />} />
        </Group>
      </ScrollView>
    </View>
  );
}

const Line = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
    <Text style={{ color: '#DDE7E3', fontSize: 15, fontWeight: bold ? '700' : '400' }}>{label}</Text>
    <Text style={[{ color: C.white, fontSize: 15, fontWeight: bold ? '700' : '400' }, T.num]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  dark: { backgroundColor: C.forest, borderRadius: R.card, marginHorizontal: 16, padding: 20 },
});
