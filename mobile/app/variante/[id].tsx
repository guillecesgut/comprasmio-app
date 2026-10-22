import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '@/api';
import { useData } from '@/hooks';
import { ago } from '@/format';
import { SheetHeader, Group, Row, Stepper, Segmented, Btn, Loading, ErrorLine, SectionHeader, useToast } from '@/ui';
import { C, T, R, SOFT } from '@/theme';

const MOVES: Record<string, string> = {
  alta: 'Alta del producto', reposicion: 'Reposición', correccion: 'Corrección', perdida: 'Pérdida', venta: 'Venta',
  apartado: 'Apartado por un pedido', pedido_vencido: 'Pedido vencido (vuelve)', pedido_cancelado: 'Pedido cancelado (vuelve)',
  reserva_vivo: 'Reservado para un vivo', devolucion_vivo: 'Devuelto al terminar el vivo',
};
type Reason = 'reposicion' | 'correccion' | 'perdida';

/** E3 · Stock de una variante: disponible = stock − apartado − en vivo; ajustes con motivo. */
export default function StockVariante() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const { data: v, error, setData } = useData(() => api.seller_.variantStock(id).then((r) => r.variant), [id]);
  const [delta, setDelta] = React.useState(0);
  const [reason, setReason] = React.useState<Reason>('reposicion');
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  if (!v) return <View style={{ flex: 1 }}><SheetHeader title="Stock" onClose={() => router.back()} />{error ? <ErrorLine message={error} /> : <Loading />}</View>;

  const save = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const { variant } = await api.seller_.adjustStock(id, reason === 'reposicion' ? Math.abs(delta) : reason === 'perdida' ? -Math.abs(delta) : delta, reason);
      setData(variant);
      setDelta(0);
      toast('Stock actualizado');
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const boxes: [string, number, string, string][] = [
    ['Disponible', v.available, SOFT.green.bg, SOFT.green.fg], ['Apartado', v.held, C.fill2, '#4C463C'],
    ['En vivo', v.inLive, SOFT.amber.bg, C.bidText], ['Vendido', v.sold, C.fill2, '#4C463C'],
  ];
  const min = reason === 'correccion' ? -(v.stock - v.held - v.inLive) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.groupedBg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <SheetHeader eyebrow={v.title} title={v.label === 'Única' ? 'Stock' : v.label} onClose={() => router.back()} />
      <View style={styles.grid}>
        {boxes.map(([label, n, bg, fg]) => (
          <View key={label} style={[styles.box, { backgroundColor: bg }]}>
            <Text style={[{ fontSize: 28, fontWeight: '700', color: fg }, T.num]}>{n}</Text>
            <Text style={{ fontSize: 13, color: fg }}>{label}</Text>
          </View>
        ))}
      </View>
      <Text style={[T.footnote, T.num, { paddingHorizontal: 20, marginTop: 10 }]}>
        Disponible = stock {v.stock} − apartado {v.held} − en vivo {v.inLive}
      </Text>

      <SectionHeader title="Ajustar stock" />
      <Group>
        <View style={{ padding: 12 }}>
          <Segmented value={reason} onChange={(r) => { setReason(r); setDelta(0); }}
            options={[{ key: 'reposicion', label: 'Reposición' }, { key: 'correccion', label: 'Corrección' }, { key: 'perdida', label: 'Pérdida' }]} />
        </View>
        <Row title={reason === 'reposicion' ? 'Unidades que entran' : reason === 'perdida' ? 'Unidades perdidas' : 'Sumar o restar'}
          right={<Stepper value={delta} min={reason === 'correccion' ? min : 0} max={reason === 'perdida' ? v.available : 999} onChange={setDelta} />} />
        <Row title="Stock después del ajuste" right={<Text style={[T.headline, T.num]}>{v.stock + (reason === 'perdida' ? -Math.abs(delta) : delta)}</Text>} />
      </Group>
      <View style={{ padding: 16, gap: 8 }}>
        <ErrorLine message={actionError} />
        <Btn title="Guardar ajuste" disabled={delta === 0} loading={busy} onPress={save} />
      </View>

      <SectionHeader title="Movimientos" />
      <Group>
        {v.movements.map((m: any, i: number) => (
          <Row key={i} title={MOVES[m.kind] || m.kind} subtitle={[m.ref && !String(m.ref).startsWith('str_') ? m.ref : null, m.note, ago(m.at)].filter(Boolean).join(' · ')}
            right={<Text style={[T.headline, T.num, { color: m.qty > 0 ? C.tintText : C.label }]}>{m.qty > 0 ? `+${m.qty}` : m.qty}</Text>} />
        ))}
      </Group>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  box: { width: '48%', borderRadius: R.card, padding: 16, gap: 2 },
});
