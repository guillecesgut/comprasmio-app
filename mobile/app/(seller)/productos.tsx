import React from 'react';
import { View, Text, Alert, RefreshControl, StyleSheet, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import { api, type Mode } from '@/api';
import { priceLine } from '@/format';
import { Screen, Circle, EmptyCard, Placeholder, ModeChip, Chip, Press, Sym, ErrorLine, useToast } from '@/ui';
import { C, T, R, MODE } from '@/theme';

type Filter = 'all' | Mode;

const FILTERS: { key: Filter; label: string; dot?: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'auction', label: 'Subasta', dot: MODE.auction.dot },
  { key: 'fixed', label: 'Precio fijo', dot: MODE.fixed.dot },
];

/** C2 · Productos. Tocar una fila edita; deslizar muestra Editar / Borrar. */
export default function Productos() {
  const toast = useToast();
  const [products, setProducts] = React.useState<any[] | null>(null);
  const [filter, setFilter] = React.useState<Filter>('all');
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const open = React.useRef<Swipeable | null>(null);

  const load = React.useCallback(async () => {
    try {
      const { products } = await api.products();
      setProducts(products);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useFocusEffect(React.useCallback(() => { load(); }, [load]));

  const remove = (product: any) => {
    Alert.alert(`¿Borrar "${product.name}" de tu catálogo?`, undefined, [
      { text: 'Cancelar', style: 'cancel', onPress: () => open.current?.close() },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteProduct(product.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setProducts((list) => list?.filter((p) => p.id !== product.id) ?? list);
            toast('Producto borrado');
          } catch (e: any) {
            setError(e.message);
          }
        },
      },
    ]);
  };

  const list = (products || []).filter((p) => filter === 'all' || p.mode === filter);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.tint} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16 }}>
        <Circle icon="plus" bg={C.tint} color={C.white} onPress={() => router.push('/producto/nuevo')} label="Nuevo producto" />
      </View>
      <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
        <Text style={T.largeTitle} accessibilityRole="header">Productos</Text>
        <Text style={[T.subhead, { color: C.secondary, marginTop: 2 }]}>
          {products?.length ?? 0} en tu catálogo · tocá una fila para editar o borrar
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 14, marginBottom: 14 }}>
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: active ? C.label : C.surface }}
            >
              {f.dot && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: f.dot }} />}
              <Text style={{ fontSize: 15, fontWeight: active ? '600' : '400', color: active ? C.white : C.label }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ paddingHorizontal: 20 }}><ErrorLine message={error} /></View>

      {products !== null && products.length === 0 ? (
        <EmptyCard
          title="No tenés productos todavía"
          body="Creá uno para subastarlo o venderlo a precio fijo en tu próxima transmisión."
          action={<Circle icon="plus" bg={C.tint} color={C.white} onPress={() => router.push('/producto/nuevo')} label="Nuevo producto" />}
        />
      ) : (
        <View style={{ backgroundColor: C.surface, borderRadius: R.card, marginHorizontal: 16, overflow: 'hidden' }}>
          {list.map((product, i) => {
            const sold = product.status === 'sold';
            let ref: Swipeable | null = null;
            return (
              <View key={product.id}>
                {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.rowSeparator, marginLeft: 84 }} />}
                <Swipeable
                  ref={(r) => { ref = r; }}
                  friction={2}
                  overshootRight={false}
                  onSwipeableWillOpen={() => { if (open.current && open.current !== ref) open.current.close(); open.current = ref; }}
                  renderRightActions={() => (
                    <View style={{ flexDirection: 'row', width: 150 }}>
                      <SwipeAction label="Editar" icon="pencil" bg="#8E877B" onPress={() => { ref?.close(); router.push(`/producto/${product.id}`); }} />
                      <SwipeAction label="Borrar" icon="trash" bg={C.destructive} onPress={() => remove(product)} />
                    </View>
                  )}
                >
                  <Press onPress={() => router.push(`/producto/${product.id}`)} style={{ backgroundColor: C.surface }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, opacity: sold ? 0.5 : 1 }}>
                      <Placeholder color={product.grad} style={{ width: 52, height: 52 }} radius={12} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={[T.callout, { fontWeight: '600' }]}>{product.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
                          {sold ? <Chip label="Vendido" bg={C.fill2} fg={C.secondary} /> : <ModeChip mode={product.mode} />}
                          <Text numberOfLines={1} style={[T.footnote, T.num, { flex: 1 }]}>{priceLine(product)}</Text>
                        </View>
                      </View>
                    </View>
                  </Press>
                </Swipeable>
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

function SwipeAction({ label, icon, bg, onPress }: { label: string; icon: 'pencil' | 'trash'; bg: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <Sym name={icon} size={20} color={C.white} />
      <Text style={{ color: C.white, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
