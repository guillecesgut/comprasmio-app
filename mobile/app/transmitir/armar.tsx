import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, bs } from '@/api';
import { useSession } from '@/session';
import { SheetHeader, Placeholder, Press, Btn, EmptyCard, ErrorLine } from '@/ui';
import { C, T, R, MODE } from '@/theme';

/**
 * C6 · ¿Qué vendés hoy? El orden en que se tocan los productos es el orden de
 * la cola. Ningún lote se abre solo: el vendedor saluda y arranca cuando quiere.
 */
export default function Armar() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [products, setProducts] = React.useState<any[] | null>(null);
  const [order, setOrder] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.products()
      .then(({ products }) => setProducts(products.filter((p) => p.status !== 'sold')))
      .catch((e) => { setError(e.message); setProducts([]); });
  }, []);

  const toggle = (id: string) => {
    Haptics.selectionAsync();
    setOrder((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  };

  const goLive = async () => {
    setBusy(true);
    setError(null);
    try {
      const { stream } = await api.startStream({ title: `${user?.name} en vivo` });
      if (order.length) await api.setQueue(stream.id, order);
      router.dismiss();
      router.push(`/transmitir/${stream.id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <SheetHeader size="title1" title="¿Qué vendés hoy?" subtitle="Tocá en el orden en que van a salir." onClose={() => router.back()} />

        {products !== null && products.length === 0 ? (
          <EmptyCard
            title="Todavía no tenés productos"
            body="Creá al menos uno para armar tu vivo."
            action={<Btn title="Crear producto" height={46} onPress={() => { router.back(); router.push('/producto/nuevo'); }} />}
          />
        ) : (
          <View style={{ backgroundColor: C.surface, borderRadius: R.card, marginHorizontal: 16, overflow: 'hidden' }}>
            {(products || []).map((p, i) => {
              const position = order.indexOf(p.id);
              const selected = position >= 0;
              const m = MODE[p.mode as 'auction' | 'fixed'];
              return (
                <View key={p.id}>
                  {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.rowSeparator, marginLeft: 108 }} />}
                  <Press
                    onPress={() => toggle(p.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${p.name}${selected ? `, sale en el lugar ${position + 1}` : ''}`}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 }}>
                      <View style={{
                        width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: selected ? C.tint : 'transparent', borderWidth: selected ? 0 : 1.5, borderColor: C.unchecked,
                      }}>
                        {selected && <Text style={[{ color: C.white, fontWeight: '700', fontSize: 14 }, T.num]}>{position + 1}</Text>}
                      </View>
                      <Placeholder color={p.grad} style={{ width: 44, height: 44 }} radius={10} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={[T.callout, { fontWeight: '600' }]}>{p.name}</Text>
                        <Text numberOfLines={1} style={[{ fontSize: 14, color: m.softFg, marginTop: 2 }, T.num]}>
                          {m.label} · {p.mode === 'fixed' ? `${bs(p.price)} · ${p.stock} u.` : `desde ${bs(p.start)}`}
                        </Text>
                      </View>
                    </View>
                  </Press>
                </View>
              );
            })}
          </View>
        )}
        <View style={{ paddingHorizontal: 32 }}><ErrorLine message={error} /></View>
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 4, borderTopWidth: 0.5, borderTopColor: C.separator }}>
        <Btn
          title={order.length ? `Salir al aire con ${order.length} producto${order.length === 1 ? '' : 's'}` : 'Elegí al menos un producto'}
          icon="video.fill"
          tone="bid"
          disabled={order.length === 0}
          loading={busy}
          onPress={goLive}
        />
      </View>
    </View>
  );
}
