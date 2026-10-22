import React from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Keyboard } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api';
import { useToggleFav, setFav } from '@/hooks';
import { Sym, Press, Segmented, ProductGrid, Group, Row, Avatar, Btn, Loading, ChipRow, FilterChip, Img } from '@/ui';
import { LiveCard } from '@/LiveCard';
import { C, T, R } from '@/theme';

const RECENT_KEY = 'comprasmio.recent-searches';
type Tab = 'productos' | 'vendedores' | 'vivos';
const SORTS = [
  { key: 'relevancia', label: 'Relevancia' }, { key: 'precio_asc', label: 'Precio ↑' },
  { key: 'precio_desc', label: 'Precio ↓' }, { key: 'nuevos', label: 'Más nuevos' },
] as const;

/** D3 · Buscar (recientes, tendencias, sugerencias) → D4 · Resultados. */
export default function Buscar() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const input = React.useRef<TextInput>(null);
  const [text, setText] = React.useState(params.q || '');
  const [query, setQuery] = React.useState(params.q || '');
  const [recent, setRecent] = React.useState<string[]>([]);
  const [trending, setTrending] = React.useState<string[]>([]);
  const [suggest, setSuggest] = React.useState<any>(null);

  React.useEffect(() => {
    SecureStore.getItemAsync(RECENT_KEY).then((v) => setRecent(v ? JSON.parse(v) : [])).catch(() => {});
    api.trending().then((r) => setTrending(r.queries || [])).catch(() => {});
  }, []);

  React.useEffect(() => { if (params.q) { setText(params.q); setQuery(params.q); } }, [params.q]);

  // Sugerencias mientras se escribe (con una pequeña espera).
  React.useEffect(() => {
    if (!text.trim() || text === query) { setSuggest(null); return; }
    const t = setTimeout(() => api.suggest(text.trim()).then(setSuggest).catch(() => {}), 220);
    return () => clearTimeout(t);
  }, [text, query]);

  const saveRecent = (list: string[]) => {
    setRecent(list);
    SecureStore.setItemAsync(RECENT_KEY, JSON.stringify(list)).catch(() => {});
  };

  const submit = (q: string) => {
    const clean = q.trim();
    if (!clean) return;
    Keyboard.dismiss();
    setText(clean);
    setQuery(clean);
    setSuggest(null);
    saveRecent([clean, ...recent.filter((r) => r.toLowerCase() !== clean.toLowerCase())].slice(0, 8));
  };

  const clear = () => {
    setText('');
    setQuery('');
    setSuggest(null);
    input.current?.focus();
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg, paddingTop: insets.top + 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8 }}>
        <View style={styles.field}>
          <Sym name="magnifyingglass" size={17} color={C.secondary} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => submit(text)}
            placeholder="Buscar productos o tiendas"
            placeholderTextColor={C.secondary}
            returnKeyType="search"
            autoFocus={!params.q}
            autoCorrect={false}
            style={{ flex: 1, fontSize: 17, color: C.label }}
            accessibilityLabel="Buscar"
          />
          {!!text && <Pressable onPress={clear} hitSlop={8} accessibilityLabel="Borrar"><Sym name="xmark.circle.fill" size={17} color={C.tertiary} /></Pressable>}
        </View>
        {(!!text || !!query) && <Pressable onPress={() => { Keyboard.dismiss(); setText(''); setQuery(''); }}><Text style={{ fontSize: 17, color: C.tintText }}>Cancelar</Text></Pressable>}
      </View>

      {suggest ? (
        <Suggestions data={suggest} onPick={submit} />
      ) : query ? (
        <Results query={query} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 }}>
          {recent.length > 0 && (
            <>
              <View style={styles.sectionRow}>
                <Text style={T.section}>Recientes</Text>
                <Pressable onPress={() => saveRecent([])}><Text style={{ color: C.tintText, fontSize: 15 }}>Borrar</Text></Pressable>
              </View>
              <Group>
                {recent.map((r) => (
                  <Row key={r} icon="clock.arrow.circlepath" iconColor={C.tertiary} title={r} onPress={() => submit(r)}
                    right={<Pressable hitSlop={10} onPress={() => saveRecent(recent.filter((x) => x !== r))} accessibilityLabel={`Borrar ${r}`}><Sym name="xmark" size={13} color={C.tertiary} /></Pressable>} />
                ))}
              </Group>
            </>
          )}
          {trending.length > 0 && (
            <>
              <View style={styles.sectionRow}><Text style={T.section}>Buscado ahora</Text></View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
                {trending.map((q) => <FilterChip key={q} label={q} icon="chart.line.uptrend.xyaxis" onPress={() => submit(q)} />)}
              </View>
            </>
          )}
          {!recent.length && !trending.length && (
            <Text style={[T.subhead, { color: C.secondary, textAlign: 'center', marginTop: 48, paddingHorizontal: 40 }]}>Buscá por producto, marca o tienda.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Suggestions({ data, onPick }: { data: any; onPick: (q: string) => void }) {
  const empty = !data.products.length && !data.sellers.length && !data.categories.length;
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 }}>
      {empty && <Text style={[T.subhead, { color: C.secondary, padding: 24 }]}>Sin sugerencias. Tocá Buscar para ver resultados.</Text>}
      {data.products.length > 0 && (
        <>
          <View style={styles.sectionRow}><Text style={T.section}>Productos</Text></View>
          <Group>{data.products.map((p: any) => <Row key={p.id} icon="magnifyingglass" iconColor={C.tertiary} title={p.title} onPress={() => onPick(p.title)} />)}</Group>
        </>
      )}
      {data.sellers.length > 0 && (
        <>
          <View style={styles.sectionRow}><Text style={T.section}>Vendedores</Text></View>
          <Group>{data.sellers.map((s: any) => <Row key={s.id} left={<Avatar initials={s.initials} bg={s.color} size={30} />} title={s.name} chevron onPress={() => router.push(`/tienda/${s.slug}`)} />)}</Group>
        </>
      )}
      {data.categories.length > 0 && (
        <>
          <View style={styles.sectionRow}><Text style={T.section}>Categorías</Text></View>
          <Group>{data.categories.map((c: any) => <Row key={c.id} icon={(c.icon || 'square.grid.2x2') as any} title={c.name} chevron onPress={() => router.push(`/categoria/${c.id}`)} />)}</Group>
        </>
      )}
    </ScrollView>
  );
}

/** D4 · Resultados con Productos | Vendedores | Vivos y filtros. */
function Results({ query }: { query: string }) {
  const [tab, setTab] = React.useState<Tab>('productos');
  const [counts, setCounts] = React.useState({ products: 0, sellers: 0, streams: 0 });
  const [sort, setSort] = React.useState<(typeof SORTS)[number]['key']>('relevancia');
  const [freeShipping, setFreeShipping] = React.useState(false);
  const [offers, setOffers] = React.useState(false);
  const [products, setProducts] = React.useState<any[] | null>(null);
  const [sellers, setSellers] = React.useState<any[] | null>(null);
  const [streams, setStreams] = React.useState<any[] | null>(null);

  React.useEffect(() => {
    api.searchCounts(query).then(setCounts).catch(() => {});
    api.searchSellers(query).then((r) => setSellers(r.sellers)).catch(() => setSellers([]));
    api.streams(undefined, query).then((r) => setStreams(r.streams)).catch(() => setStreams([]));
  }, [query]);

  React.useEffect(() => {
    setProducts(null);
    api.products({ q: query, sort, freeShipping, offers, limit: 40 }).then((r) => setProducts(r.items)).catch(() => setProducts([]));
  }, [query, sort, freeShipping, offers]);

  const toggleFav = useToggleFav(React.useCallback((id: string, fav: boolean) => setProducts((l) => setFav(l || [], id, fav)), []));
  const follow = async (s: any) => {
    setSellers((l) => (l || []).map((x) => (x.id === s.id ? { ...x, following: !x.following } : x)));
    await api.toggleFollow(s.id).catch(() => {});
  };
  const cycleSort = () => setSort(SORTS[(SORTS.findIndex((s) => s.key === sort) + 1) % SORTS.length].key);
  const total = counts.products + counts.sellers + counts.streams;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 }}>
      <Segmented
        style={{ marginHorizontal: 16, marginTop: 4 }}
        value={tab}
        onChange={setTab}
        options={[
          { key: 'productos', label: `Productos · ${counts.products}` },
          { key: 'vendedores', label: `Vendedores · ${counts.sellers}` },
          { key: 'vivos', label: `Vivos · ${counts.streams}`, dot: counts.streams ? C.bid : undefined },
        ]}
      />
      {total === 0 && products && products.length === 0 ? (
        <Text style={[T.subhead, { color: C.secondary, textAlign: 'center', marginTop: 48, paddingHorizontal: 32 }]}>
          No encontramos «{query}». Probá con otra palabra o mirá las categorías.
        </Text>
      ) : tab === 'productos' ? (
        <>
          <ChipRow style={{ marginVertical: 12 }}>
            <FilterChip label={SORTS.find((s) => s.key === sort)!.label} icon="arrow.up.arrow.down" onPress={cycleSort} />
            <FilterChip label="Envío gratis" tone="green" active={freeShipping} onPress={() => setFreeShipping((v) => !v)} />
            <FilterChip label="Ofertas" tone="green" active={offers} onPress={() => setOffers((v) => !v)} />
          </ChipRow>
          {!products ? <Loading /> : products.length ? <ProductGrid products={products} onToggleFav={toggleFav} /> : (
            <Text style={[T.subhead, { color: C.secondary, textAlign: 'center', marginTop: 24 }]}>No hay productos con esos filtros.</Text>
          )}
        </>
      ) : tab === 'vendedores' ? (
        <Group style={{ marginTop: 12 }}>
          {(sellers || []).map((s) => (
            <Row key={s.id} onPress={() => router.push(`/tienda/${s.slug}`)}
              left={s.avatarUrl ? <Img url={s.avatarUrl} radius={22} style={{ width: 44, height: 44 }} /> : <Avatar initials={s.initials} bg={s.color} size={44} />}
              title={<Text style={T.headline}>{s.name} {s.verified && <Sym name="checkmark.seal.fill" size={14} color={C.tint} />}</Text>}
              subtitle={`★ ${s.ratingPct ?? 100} % · ${s.salesCount} ventas`}
              right={<Btn title={s.following ? 'Siguiendo' : 'Seguir'} tone="tonal" height={34} onPress={() => follow(s)} />} />
          ))}
        </Group>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 }}>
          {(streams || []).map((s) => <View key={s.id} style={{ width: '47%' }}><LiveCard stream={s} /></View>)}
          {streams?.length === 0 && <Text style={[T.subhead, { color: C.secondary }]}>Nadie está transmitiendo «{query}» ahora.</Text>}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, height: 40, borderRadius: R.pill, backgroundColor: C.fill, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 32, paddingTop: 20, paddingBottom: 8 },
});
