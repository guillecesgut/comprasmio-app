import React from 'react';
import { View, Text, TextInput, RefreshControl, useWindowDimensions, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradientMask } from '@/Gradient';
import { api, bs, realtime, type Mode } from '@/api';
import { useSession } from '@/session';
import { HeaderActions } from '@/HeaderActions';
import {
  Screen, Logomark, Segmented, Sym, Press, Placeholder, ModeChip, EmptyCard, ErrorLine, LivePill, ViewersPill, thousands,
} from '@/ui';
import { C, T, R, MODE } from '@/theme';

type Filter = 'all' | Mode;

const FILTERS: { key: Filter; label: string; dot?: string }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'auction', label: 'Subastas', dot: MODE.auction.dot },
  { key: 'fixed', label: 'Precio fijo', dot: MODE.fixed.dot },
];

/** B1 · Inicio (comprador). */
export default function Inicio() {
  const { buscar } = useLocalSearchParams<{ buscar?: string }>();
  const { favorites, toggleFavorite } = useSession();
  const { width } = useWindowDimensions();
  const searchRef = React.useRef<TextInput>(null);

  const [filter, setFilter] = React.useState<Filter>('all');
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [streams, setStreams] = React.useState<any[] | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // El botón de búsqueda de la tab bar trae acá y abre el teclado.
  React.useEffect(() => {
    if (buscar) setTimeout(() => searchRef.current?.focus(), 250);
  }, [buscar]);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = React.useCallback(async () => {
    try {
      const { streams } = await api.streams(filter, debounced || undefined);
      setStreams(streams);
      setError(null);
    } catch (e: any) {
      setError(e.message);
      setStreams((s) => s || []);
    }
  }, [filter, debounced]);

  React.useEffect(() => { load(); }, [load]);

  // El feed respira: espectadores y precios se mueven sin recargar.
  React.useEffect(() => {
    const off = realtime.subscribe('feed');
    const listeners = [
      realtime.on('stream:update', ({ stream }) =>
        setStreams((current) => current?.map((s) => (s.id === stream.id ? { ...s, ...stream } : s)) ?? current)),
      realtime.on('stream:started', () => load()),
      realtime.on('stream:ended', ({ streamId }) => setStreams((current) => current?.filter((s) => s.id !== streamId) ?? current)),
    ];
    return () => { off(); listeners.forEach((stop) => stop()); };
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const list = streams || [];
  const showFeatured = filter === 'all' && !debounced && list.length > 0;
  const featured = showFeatured ? [...list].sort((a, b) => b.viewers - a.viewers)[0] : null;
  const rest = featured ? list.filter((s) => s.id !== featured.id) : list;
  const cardWidth = (width - 32 - 12) / 2;

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.tint} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
        <Logomark size={30} />
        <HeaderActions />
      </View>

      <Text style={[T.largeTitle, { paddingHorizontal: 20, marginTop: 12 }]} accessibilityRole="header">En vivo ahora</Text>

      <View style={styles.search}>
        <Sym name="magnifyingglass" size={17} color={C.secondary} />
        <TextInput
          ref={searchRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar productos, vendedores…"
          placeholderTextColor={C.secondary}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Buscar transmisiones"
          style={{ flex: 1, fontSize: 17, color: C.label }}
        />
      </View>

      <Segmented options={FILTERS} value={filter} onChange={setFilter} style={{ marginHorizontal: 16, marginTop: 12 }} />

      <View style={{ paddingHorizontal: 4 }}><ErrorLine message={error} /></View>

      {featured && <Featured stream={featured} />}

      {streams !== null && (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 26, marginBottom: 12 }}>
          <Text style={T.title2}>{debounced ? 'Resultados' : 'Para vos'}</Text>
          <Text style={[T.subhead, { color: C.secondary }]}>{list.length} {list.length === 1 ? 'transmisión' : 'transmisiones'}</Text>
        </View>
      )}

      {streams !== null && list.length === 0 ? (
        <EmptyCard title="Nada con ese filtro" body="Probá con otra búsqueda: los vivos entran y salen todo el día." />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, columnGap: 12, rowGap: 18 }}>
          {rest.map((stream) => (
            <StreamCard
              key={stream.id}
              stream={stream}
              width={cardWidth}
              favorite={favorites.includes(stream.id)}
              onFavorite={() => toggleFavorite(stream.id)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function Featured({ stream }: { stream: any }) {
  return (
    <Press onPress={() => router.push(`/vivo/${stream.id}`)} accessibilityRole="button" accessibilityLabel={`${stream.title}, de ${stream.seller?.name}. Entrar al vivo`}>
      <Placeholder strong color={stream.grad || C.forest} radius={R.featured} style={{ height: 236, marginHorizontal: 16, marginTop: 18 }}>
        <LinearGradientMask from="rgba(5,30,24,0)" to="rgba(5,30,24,.85)" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: '35%' }} />
        <View style={{ flexDirection: 'row', gap: 8, padding: 14 }}>
          <LivePill />
          <ViewersPill viewers={stream.viewers} />
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 13, color: '#C7DDD5' }} numberOfLines={1}>
            {stream.seller?.name} · ★ {Math.round(stream.seller?.rating ?? 100)} %
          </Text>
          <Text style={[T.title2, { color: C.white, marginTop: 2 }]} numberOfLines={1}>{stream.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <Text style={[{ fontSize: 15, color: C.white }, T.num]}>
              Desde <Text style={{ fontWeight: '700', fontSize: 17 }}>{bs(stream.price)}</Text>
            </Text>
            <View style={{ backgroundColor: C.white, borderRadius: R.pill, paddingHorizontal: 16, height: 34, justifyContent: 'center' }}>
              <Text style={{ color: C.tintText, fontWeight: '600', fontSize: 15 }}>Entrar</Text>
            </View>
          </View>
        </View>
      </Placeholder>
    </Press>
  );
}

function StreamCard({ stream, width, favorite, onFavorite }: { stream: any; width: number; favorite: boolean; onFavorite: () => void }) {
  const mode: Mode = stream.mode;
  const note = mode === 'fixed' ? `${stream.stock ?? 0} u.` : 'inicial';

  return (
    <Press
      onPress={() => router.push(`/vivo/${stream.id}`)}
      style={{ width }}
      accessibilityRole="button"
      accessibilityLabel={`${stream.title}, ${stream.seller?.name}, ${bs(stream.price)}`}
    >
      <Placeholder color={stream.grad || C.tint} radius={R.stream} style={{ width, aspectRatio: 3 / 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,.42)', borderRadius: R.pill, paddingHorizontal: 8, height: 24 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.bidLight }} />
            <Text style={[{ color: C.white, fontSize: 12, fontWeight: '600' }, T.num]}>{thousands(stream.viewers)}</Text>
          </View>
          <Press
            onPress={onFavorite}
            hitSlop={8}
            accessibilityLabel={favorite ? 'Dejar de seguir' : 'Seguir vendedor'}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,.32)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Sym name={favorite ? 'heart.fill' : 'heart'} size={16} color={favorite ? C.bidLight : C.white} />
          </Press>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ padding: 8 }}><ModeChip mode={mode} solid /></View>
      </Placeholder>
      <Text style={[T.footnote, { marginTop: 8 }]} numberOfLines={1}>{stream.seller?.name}</Text>
      <Text style={{ fontSize: 15, fontWeight: '600', color: C.label, marginTop: 1 }} numberOfLines={2}>{stream.title}</Text>
      <Text style={[{ marginTop: 3 }, T.num]}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: C.tintText }}>{bs(stream.price)}</Text>
        <Text style={{ fontSize: 13, color: C.secondary }}>  {note}</Text>
      </Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, borderRadius: R.pill,
    backgroundColor: C.fill, marginHorizontal: 16, marginTop: 10, paddingHorizontal: 14,
  },
});
