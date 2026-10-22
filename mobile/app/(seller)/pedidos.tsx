import React from 'react';
import { View, Text, RefreshControl, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { api, bs } from '@/api';
import { useSession } from '@/session';
import { useData } from '@/hooks';
import { askShip } from '@/sellerActions';
import { ago } from '@/format';
import { Screen, LargeTitle, ChipRow, FilterChip, StatusChip, Chip, Btn, Circle, Press, Img, Notice, EmptyCard, Loading, ErrorLine, useToast } from '@/ui';
import { C, T, R, CHANNEL } from '@/theme';

const FILTERS = [
  { key: 'por_preparar', label: 'Por preparar' }, { key: 'enviados', label: 'Enviados' }, { key: 'en_reclamo', label: 'En reclamo' },
  { key: 'pendientes', label: 'Pendientes' }, { key: 'entregados', label: 'Entregados' },
];

/** E5 · Pedidos del vendedor. ComprasMío! verifica los pagos; el vendedor prepara y envía. */
export default function Pedidos() {
  const { refreshBadges } = useSession();
  const toast = useToast();
  const [filter, setFilter] = React.useState('por_preparar');
  const { data, error, loading, reload } = useData(() => api.seller_.orders(filter), [filter], { events: ['order:new', 'order:update'] });
  const [actionError, setActionError] = React.useState<string | null>(null);
  const after = (msg: string) => () => { toast(msg); reload(); refreshBadges(); };

  const action = (o: any) => {
    if (o.status === 'pagado') return <Btn title="Marcar como preparando" height={40} flex onPress={() => api.seller_.advance(o.id, 'preparando').then(after('Pedido en preparación')).catch((e) => setActionError(e.message))} />;
    if (o.status === 'preparando') return <Btn title="Marcar enviado" height={40} flex onPress={() => askShip(o, after('Pedido enviado'), setActionError)} />;
    if (o.status === 'enviado') return <Text style={[T.footnote, { flex: 1 }]}>Esperando confirmación del comprador</Text>;
    if (o.status === 'en_reclamo') return <Btn title="Ver reclamo" tone="tonal" height={40} flex onPress={() => router.push(`/vendedor/pedidos/${o.id}`)} />;
    if (o.status === 'pendiente_pago') return <Text style={[T.footnote, { flex: 1 }]}>El comprador todavía no pagó</Text>;
    if (o.status === 'pago_en_revision') return <Text style={[T.footnote, { flex: 1 }]}>ComprasMío! está verificando el pago</Text>;
    return <View style={{ flex: 1 }} />;
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} />}>
      <LargeTitle title="Pedidos" />
      <ChipRow style={{ marginBottom: 12 }}>
        {FILTERS.map((f) => <FilterChip key={f.key} label={f.label} count={data?.counts?.[f.key]} active={filter === f.key} onPress={() => setFilter(f.key)} />)}
      </ChipRow>
      <Notice tone="green" icon="checkmark.shield.fill" style={{ marginBottom: 12 }}>ComprasMío! verifica los pagos. Vos preparás y enviás los pedidos con pago confirmado.</Notice>
      <View style={{ paddingHorizontal: 16 }}><ErrorLine message={error || actionError} /></View>
      {!data ? <Loading /> : !data.items.length ? (
        <EmptyCard title="Nada por acá" body={filter === 'por_preparar' ? 'Cuando entre un pedido con pago confirmado, aparece acá.' : 'No hay pedidos en este estado.'} />
      ) : (
        <View style={{ gap: 12 }}>
          {data.items.map((o: any) => (
            <Press key={o.id} onPress={() => router.push(`/vendedor/pedidos/${o.id}`)} style={styles.card}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Img url={o.photoUrl} color={o.color} radius={12} style={{ width: 52, height: 52 }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[T.headline, { fontFamily: 'Menlo', fontSize: 15 }]}>{o.ref}</Text>
                    <Text style={[T.headline, T.num]}>{bs(o.total)}</Text>
                  </View>
                  <Text style={T.footnote} numberOfLines={1}>@{o.buyer.handle} · {o.units} {o.units === 1 ? 'ítem' : 'ítems'} · {ago(o.createdAt)}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <StatusChip status={o.status} />
                    <Chip label={(CHANNEL[o.channel] || CHANNEL.catalogo).label} bg={(CHANNEL[o.channel] || CHANNEL.catalogo).bg} fg={(CHANNEL[o.channel] || CHANNEL.catalogo).fg} />
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {action(o)}
                <Circle icon="bubble.left" size={40} bg={C.fill2} onPress={() => router.push(`/vendedor/mensajes/${o.buyer.id}?order=${o.id}`)} label="Chat con el comprador" />
              </View>
            </Press>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.white, borderRadius: R.card, marginHorizontal: 16, padding: 14, gap: 12 },
});
