import React from 'react';
import { View, Text, TextInput, RefreshControl, ActionSheetIOS, Alert, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { api, bs } from '@/api';
import { useSession } from '@/session';
import { useData } from '@/hooks';
import { Screen, Circle, Btn, ChipRow, FilterChip, Img, StatusChip, Chip, Press, Sym, EmptyCard, Loading, ErrorLine, useToast } from '@/ui';
import { C, T, R, SOFT } from '@/theme';

const FILTERS = [
  { key: 'todos', label: 'Todos' }, { key: 'activos', label: 'Activos' }, { key: 'sin_stock', label: 'Sin stock' },
  { key: 'pausados', label: 'Pausados' }, { key: 'en_vivo', label: 'En vivo' },
];

/** E1 · Catálogo del vendedor con barra de stock segmentada (disponible · apartado · en vivo). */
export default function Catalogo() {
  const { user } = useSession();
  const toast = useToast();
  const [filter, setFilter] = React.useState('todos');
  const [q, setQ] = React.useState('');
  const [query, setQuery] = React.useState('');
  const { data, error, loading, reload } = useData(() => api.seller_.products(filter, query || undefined), [filter, query], { events: ['order:new', 'order:update'] });
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const openStock = async (p: any) => {
    try {
      const { product } = await api.seller_.product(p.id);
      const vs = product.variants;
      if (vs.length === 1) return router.push(`/variante/${vs[0].id}`);
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Stock de…', options: [...vs.map((v: any) => `${v.label} · ${v.available} disp.`), 'Cancelar'], cancelButtonIndex: vs.length },
        (i) => i < vs.length && router.push(`/variante/${vs[i].id}`)
      );
    } catch (e: any) { setActionError(e.message); }
  };

  const actions = (p: any) => {
    const paused = p.status === 'paused';
    ActionSheetIOS.showActionSheetWithOptions(
      { title: p.title, options: ['Editar', paused ? 'Activar' : 'Pausar', 'Stock por variante', 'Borrar', 'Cancelar'], destructiveButtonIndex: 3, cancelButtonIndex: 4 },
      async (i) => {
        setActionError(null);
        try {
          if (i === 0) router.push({ pathname: '/vendedor/producto', params: { id: p.id } });
          if (i === 1) { await api.seller_.setProductStatus(p.id, paused ? 'active' : 'paused'); toast(paused ? 'Producto activo' : 'Producto pausado'); reload(); }
          if (i === 2) openStock(p);
          if (i === 3) Alert.alert('¿Borrar este producto?', 'Deja de verse en la tienda. Los pedidos ya hechos no cambian.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Borrar', style: 'destructive', onPress: () => api.seller_.setProductStatus(p.id, 'deleted').then(() => { toast('Producto borrado'); reload(); }).catch((e) => setActionError(e.message)) },
          ]);
        } catch (e: any) { setActionError(e.message); }
      }
    );
  };

  const items: any[] = data?.items || [];

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 10 }}>
        <Text style={[T.largeTitle, { flex: 1 }]}>Catálogo</Text>
        <Press onPress={() => router.push('/vendedor/paquetes')} style={styles.pill} accessibilityLabel="Paquetes">
          <Sym name="square.stack.3d.up" size={15} color={C.label} />
          <Text style={{ fontWeight: '600', color: C.label }}>Paquetes</Text>
        </Press>
        <Circle icon="plus" bg={C.tint} color={C.white} onPress={() => router.push('/vendedor/producto')} label="Nuevo producto" />
      </View>

      <View style={styles.search}>
        <Sym name="magnifyingglass" size={16} color={C.secondary} />
        <TextInput value={q} onChangeText={setQ} placeholder="Buscar en tu catálogo" placeholderTextColor={C.secondary} style={{ flex: 1, fontSize: 16, color: C.label }} />
      </View>
      <ChipRow style={{ marginBottom: 12 }}>
        {FILTERS.map((f) => <FilterChip key={f.key} label={f.label} count={data?.counts?.[f.key]} active={filter === f.key} onPress={() => setFilter(f.key)} />)}
      </ChipRow>
      <View style={{ paddingHorizontal: 16 }}><ErrorLine message={error || actionError} /></View>

      {!data ? <Loading /> : !items.length ? (
        <EmptyCard title={filter === 'todos' && !query ? 'Tu catálogo está vacío' : 'Nada por acá'}
          body={filter === 'todos' && !query ? 'Cargá tu primer producto. Aparece en el marketplace apenas lo guardes.' : 'Probá con otro filtro.'}
          action={filter === 'todos' && !query ? <Btn title="Cargar producto" onPress={() => router.push('/vendedor/producto')} /> : undefined} />
      ) : (
        <View style={styles.list}>
          {items.map((p, i) => {
            const s = p.stock;
            const total = Math.max(1, s.available + s.held + s.inLive);
            const soldOut = p.status === 'active' && s.available === 0 && s.inLive === 0;
            return (
              <Press key={p.id} onPress={() => router.push({ pathname: '/vendedor/producto', params: { id: p.id } })} onLongPress={() => actions(p)}
                style={[styles.row, i > 0 && styles.sep, p.status === 'paused' && { opacity: 0.5 }]}>
                <Img url={p.photoUrl} color={p.color} radius={12} style={{ width: 60, height: 60 }} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[T.headline, { flex: 1 }]} numberOfLines={1}>{p.title}</Text>
                    {p.status === 'paused' ? <Chip label="Pausado" bg={C.fill2} fg={C.secondary} />
                      : soldOut ? <Chip label="Sin stock" bg={SOFT.red.bg} fg={SOFT.red.fg} />
                        : s.inLive > 0 ? <Chip label="En vivo" bg={SOFT.amber.bg} fg={C.bidText} /> : null}
                  </View>
                  <Text style={[T.footnote, T.num]}>
                    {p.variantsCount} {p.variantsCount === 1 ? 'variante' : 'variantes'} · {p.minPrice === p.maxPrice ? bs(p.minPrice) : `${bs(p.minPrice)}–${bs(p.maxPrice).replace('Bs ', '')}`}
                  </Text>
                  <Press onPress={() => openStock(p)} accessibilityLabel="Ver stock" hitSlop={6}>
                    <View style={styles.bar}>
                      <View style={{ flex: s.available / total, backgroundColor: C.tint }} />
                      <View style={{ flex: s.held / total, backgroundColor: '#F2C9A8' }} />
                      <View style={{ flex: s.inLive / total, backgroundColor: C.bid }} />
                      {s.available + s.held + s.inLive === 0 && <View style={{ flex: 1, backgroundColor: C.fill }} />}
                    </View>
                    <Text style={[T.footnote, T.num, { fontSize: 12, marginTop: 3 }]}>
                      {s.available} {s.available === 1 ? 'disponible' : 'disponibles'}{s.held ? ` · ${s.held} ${s.held === 1 ? 'apartado' : 'apartados'}` : ''}{s.inLive ? ` · ${s.inLive} en vivo` : ''}
                    </Text>
                  </Press>
                </View>
                <Press onPress={() => actions(p)} hitSlop={10} accessibilityLabel="Acciones"><Sym name="ellipsis" size={18} color={C.secondary} /></Press>
              </Press>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pill: { height: 36, borderRadius: R.pill, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.white },
  search: { height: 40, borderRadius: R.pill, backgroundColor: C.fill, margin: 16, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  list: { backgroundColor: C.white, borderRadius: R.card, marginHorizontal: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.rowSeparator },
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: C.fill2, marginTop: 4 },
});
