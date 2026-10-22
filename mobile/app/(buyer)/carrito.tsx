import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, bs } from '@/api';
import { useSession } from '@/session';
import { useData } from '@/hooks';
import { LargeTitle, Btn, Press, Avatar, Img, Sym, Stepper, Chip, EmptyCard, Loading, ErrorLine, TotalLine } from '@/ui';
import { C, T, R, SOFT } from '@/theme';

/** D6 · Carrito: una tarjeta por vendedor, un solo pago al final. */
export default function Carrito() {
  const insets = useSafeAreaInsets();
  const { refreshBadges } = useSession();
  const { data, error, reload, setData } = useData(() => api.cart(), [], { events: ['stock:update'] });
  const [actionError, setActionError] = React.useState<string | null>(null);

  const apply = async (fn: () => Promise<any>) => {
    setActionError(null);
    try {
      setData(await fn());
      refreshBadges();
    } catch (e: any) {
      setActionError(e.message);
      reload();
    }
  };

  const groups: any[] = data?.groups || [];
  const usable = groups.some((g) => g.items.some((i: any) => !i.unavailable));

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 300 }}>
        <LargeTitle title="Carrito" subtitle={data?.units ? `${data.units} ${data.units === 1 ? 'producto' : 'productos'} · ${data.sellersCount} ${data.sellersCount === 1 ? 'vendedor' : 'vendedores'}` : undefined} />
        <View style={{ paddingHorizontal: 16 }}><ErrorLine message={error || actionError} /></View>
        {!data ? <Loading /> : !groups.length ? (
          <EmptyCard title="Tu carrito está vacío" body="Agregá productos del catálogo o de tus tiendas favoritas."
            action={<Btn title="Explorar" onPress={() => router.navigate('/inicio')} />} />
        ) : (
          <View style={{ gap: 14 }}>
            {groups.map((g) => (
              <View key={g.seller.id} style={styles.card}>
                <Press onPress={() => router.push(`/tienda/${g.seller.slug}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 }}>
                  <Avatar initials={g.seller.initials} bg={g.seller.color} size={28} />
                  <Text style={[T.headline, { flex: 1 }]} numberOfLines={1}>{g.seller.name}</Text>
                  <Sym name="chevron.forward" size={13} color={C.tertiary} weight="semibold" />
                </Press>
                {g.items.map((i: any) => (
                  <View key={i.variantId} style={[styles.item, i.unavailable && { opacity: 0.5 }]}>
                    <Press onPress={() => router.push(`/producto/${i.productId}`)}>
                      <Img url={i.photoUrl} color={i.color} radius={12} style={{ width: 64, height: 64 }} />
                    </Press>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: '600', color: C.label }}>{i.title}</Text>
                      {i.label !== 'Única' && <Text style={T.footnote}>{i.label}</Text>}
                      <Text style={[{ fontSize: 15, fontWeight: '700', color: C.tintText }, T.num]}>{bs(i.price)}</Text>
                      {i.warning && !i.unavailable && <Chip label={i.warning} bg={SOFT.amber.bg} fg={SOFT.amber.fg} />}
                    </View>
                    {i.unavailable ? (
                      <Press onPress={() => apply(() => api.removeFromCart(i.variantId).then(() => api.cart()))} style={styles.remove}>
                        <Text style={{ color: SOFT.red.fg, fontWeight: '600', fontSize: 14 }}>Quitar</Text>
                      </Press>
                    ) : (
                      <Stepper small value={i.qty} max={i.available} onChange={(n) => apply(() => api.setCartQty(i.variantId, n).then(() => api.cart()))}
                        onRemove={() => apply(() => api.removeFromCart(i.variantId).then(() => api.cart()))} />
                    )}
                  </View>
                ))}
                <View style={{ padding: 14, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.rowSeparator }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[T.subhead, { color: C.secondary }]}>Envío</Text>
                    <Text style={[T.subhead, { color: g.shipping === 'Envío gratis' ? C.tintText : C.label }]}>{g.shipping}</Text>
                  </View>
                  <TotalLine label="Subtotal" value={g.subtotal} />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {usable && (
        <View style={[styles.bar, { bottom: Math.max(insets.bottom - 6, 12) + 74 }]}>
          <TotalLine label="Productos" value={data.products} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[T.subhead, { color: C.secondary }]}>Envíos</Text>
            <Text style={T.subhead}>Se coordinan con cada vendedor</Text>
          </View>
          <TotalLine label="Total" value={data.total} big />
          <Text style={T.footnote}>Pagás todo junto con una sola transferencia. Cada vendedor prepara su parte.</Text>
          <Btn title="Continuar" onPress={() => router.push('/checkout')} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.white, borderRadius: R.card, marginHorizontal: 16, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.rowSeparator },
  remove: { height: 32, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: SOFT.red.bg, justifyContent: 'center' },
  bar: { position: 'absolute', left: 12, right: 12, backgroundColor: 'rgba(255,255,255,.97)', borderRadius: 26, padding: 16, gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: C.separator },
});
