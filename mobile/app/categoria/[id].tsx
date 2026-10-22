import React from 'react';
import { View, Text, ScrollView, ActionSheetIOS, Alert, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '@/api';
import { useData, useToggleFav, setFav } from '@/hooks';
import { NavBar, Circle, ChipRow, FilterChip, ProductGrid, Loading, Btn } from '@/ui';
import { C, T } from '@/theme';

const SORTS = [
  { key: 'relevancia', label: 'Relevancia' }, { key: 'precio_asc', label: 'Precio ↑' },
  { key: 'precio_desc', label: 'Precio ↓' }, { key: 'nuevos', label: 'Más nuevos' },
] as const;
type Sort = (typeof SORTS)[number]['key'];

/** D2 · Categoría con subcategorías, orden y filtros. */
export default function Categoria() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const tree = useData(() => api.categories().then((r) => r.categories), []);
  const [sub, setSub] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<Sort>('relevancia');
  const [freeShipping, setFreeShipping] = React.useState(false);
  const [range, setRange] = React.useState<{ min?: number; max?: number }>({});
  const [products, setProducts] = React.useState<any[] | null>(null);
  const [total, setTotal] = React.useState(0);

  const all: any[] = (tree.data || []).flatMap((c: any) => [c, ...(c.children || [])]);
  const node = all.find((c) => c.id === id);
  const root = node?.parentId ? (tree.data || []).find((c: any) => c.id === node.parentId) : node;
  const children: any[] = root?.children || [];
  // Si se entró por una subcategoría, queda elegida.
  React.useEffect(() => { if (node?.parentId) setSub(node.id); }, [node?.id, node?.parentId]);
  const categoryId = sub || root?.id || id;

  React.useEffect(() => {
    setProducts(null);
    api.products({ categoryId, sort, freeShipping, minPrice: range.min, maxPrice: range.max, limit: 60 })
      .then((r) => { setProducts(r.items); setTotal(r.total); })
      .catch(() => setProducts([]));
  }, [categoryId, sort, freeShipping, range.min, range.max]);

  const toggleFav = useToggleFav(React.useCallback((pid: string, fav: boolean) => setProducts((l) => setFav(l || [], pid, fav)), []));

  const pickSort = () => ActionSheetIOS.showActionSheetWithOptions(
    { options: [...SORTS.map((s) => s.label), 'Cancelar'], cancelButtonIndex: SORTS.length },
    (i) => i < SORTS.length && setSort(SORTS[i].key)
  );
  const pickRange = () => Alert.prompt?.('Rango de precio', 'Escribí mínimo y máximo en Bs, separados por un guion (ej. 100-500). Dejalo vacío para quitarlo.', (text) => {
    const [a, b] = String(text || '').split('-').map((x) => Number(x.trim()) || undefined);
    setRange({ min: a, max: b });
  }, 'plain-text', range.min || range.max ? `${range.min || ''}-${range.max || ''}` : '', 'numbers-and-punctuation');

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar right={<Circle icon="magnifyingglass" size={40} onPress={() => router.navigate('/buscar')} label="Buscar" />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <Text style={[T.largeTitle, { paddingHorizontal: 20, paddingBottom: 12 }]}>{root?.name || 'Categoría'}</Text>
        {children.length > 0 && (
          <ChipRow style={{ marginBottom: 10 }}>
            <FilterChip label="Todo" active={!sub} onPress={() => setSub(null)} />
            {children.map((c) => <FilterChip key={c.id} label={c.name} active={sub === c.id} onPress={() => setSub(c.id)} />)}
          </ChipRow>
        )}
        <ChipRow style={{ marginBottom: 12 }}>
          <FilterChip label={SORTS.find((s) => s.key === sort)!.label} icon="arrow.up.arrow.down" onPress={pickSort} />
          <FilterChip label={range.min || range.max ? `Bs ${range.min || 0}–${range.max || '…'}` : 'Precio'} tone="green" active={!!(range.min || range.max)} onPress={pickRange} />
          <FilterChip label="Envío gratis" tone="green" active={freeShipping} onPress={() => setFreeShipping((v) => !v)} />
        </ChipRow>
        {products && <Text style={[T.footnote, { paddingHorizontal: 20, marginBottom: 10 }]}>{total} {total === 1 ? 'producto' : 'productos'}</Text>}
        {!products ? <Loading /> : products.length ? <ProductGrid products={products} onToggleFav={toggleFav} /> : (
          <View style={{ padding: 32, alignItems: 'center', gap: 12 }}>
            <Text style={[T.subhead, { color: C.secondary, textAlign: 'center' }]}>Todavía no hay productos en esta categoría.</Text>
            {(freeShipping || range.min || range.max) && <Btn title="Quitar filtros" tone="tonal" height={40} onPress={() => { setFreeShipping(false); setRange({}); }} />}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
