import React from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, useWindowDimensions, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { LinearGradientLike } from '@/Shade';
import { LiveCard } from '@/LiveCard';
import { api } from '@/api';
import { useSession } from '@/session';
import { useData, useToggleFav, setFav } from '@/hooks';
import {
  Screen, Logomark, Wordmark, Circle, Avatar, Sym, Press, Img, ProductCard, ProductGrid, Skeleton,
  Btn, Notice,
} from '@/ui';
import { C, T, R } from '@/theme';

/** D1 · Inicio del marketplace. */
export default function Inicio() {
  const { user, badges } = useSession();
  const { data, error, loading, reload, setData } = useData(() => api.home(), [], { events: ['stream:started', 'stream:ended'] });

  const toggleFav = useToggleFav(React.useCallback((id: string, fav: boolean) => {
    setData((d: any) => d && { ...d, featured: setFav(d.featured, id, fav), offers: setFav(d.offers, id, fav), recent: setFav(d.recent, id, fav) });
  }, [setData]));

  const toggleFollow = async (s: any) => {
    setData((d: any) => d && { ...d, sellers: d.sellers.map((x: any) => (x.id === s.id ? { ...x, following: !x.following } : x)) });
    await api.toggleFollow(s.id).catch(() => reload());
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} />}>
      {/* Header: logo, campana y avatar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 }}>
        <Logomark size={30} />
        <Wordmark size={19} />
        <View style={{ flex: 1 }} />
        <Circle icon="bell" bg={C.white} badge={badges.unread} onPress={() => router.push('/notificaciones')} label="Avisos" />
        <Press onPress={() => router.navigate('/cuenta')} accessibilityLabel="Tu cuenta">
          <Avatar initials={user?.initials || '?'} size={44} />
        </Press>
      </View>

      {/* Search pill no editable → tab Buscar */}
      <Press onPress={() => router.navigate('/buscar')} accessibilityRole="search" style={styles.search}>
        <Sym name="magnifyingglass" size={17} color={C.secondary} />
        <Text style={{ fontSize: 17, color: C.secondary }}>Buscar productos o tiendas</Text>
      </Press>

      {error && !data && (
        <Notice tone="amber" icon="wifi.slash" style={{ marginTop: 12 }} action={<Btn title="Reintentar" tone="tonal" height={36} onPress={reload} style={{ alignSelf: 'flex-start' }} />}>
          {error}
        </Notice>
      )}

      {!data ? <HomeSkeleton /> : (
        <>
          <Banners banners={data.banners} />

          {data.categories.length > 0 && (
            <>
              <Text style={styles.h2}>Categorías</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}>
                {data.categories.map((c: any) => (
                  <Press key={c.id} onPress={() => router.push(`/categoria/${c.id}`)} style={{ width: 62, alignItems: 'center', gap: 6 }}>
                    <View style={styles.catCircle}><Sym name={(c.icon || 'square.grid.2x2') as any} size={26} color={C.tint} /></View>
                    <Text numberOfLines={1} style={{ fontSize: 12, color: C.label }}>{c.name}</Text>
                  </Press>
                ))}
              </ScrollView>
            </>
          )}

          {data.live.length > 0 && (
            <>
              <Text style={[styles.h2, { color: C.bidText }]}>En vivo ahora</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                {data.live.map((s: any) => <LiveCard key={s.id} stream={s} width={124} />)}
              </ScrollView>
            </>
          )}

          {data.featured.length > 0 && (
            <>
              <Text style={styles.h2}>Destacados</Text>
              <ProductGrid products={data.featured.slice(0, 6)} onToggleFav={toggleFav} />
            </>
          )}

          {data.offers.length > 0 && (
            <>
              <Text style={styles.h2}>Ofertas</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                {data.offers.map((p: any) => <ProductCard key={p.id} product={p} width={140} onToggleFav={toggleFav} />)}
              </ScrollView>
            </>
          )}

          {data.sellers.length > 0 && (
            <>
              <Text style={styles.h2}>Vendedores destacados</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                {data.sellers.map((s: any) => (
                  <Press key={s.id} onPress={() => router.push(`/tienda/${s.slug}`)} style={styles.sellerCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {s.avatarUrl ? <Img url={s.avatarUrl} radius={22} style={{ width: 44, height: 44 }} /> : <Avatar initials={s.initials} bg={s.color} size={44} />}
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={T.headline}>{s.name} {s.verified && <Sym name="checkmark.seal.fill" size={14} color={C.tint} />}</Text>
                        <Text style={[T.footnote, T.num]}>★ {s.ratingPct ?? 100} % · {s.salesCount} ventas</Text>
                      </View>
                    </View>
                    <Btn title={s.following ? 'Siguiendo' : 'Seguir'} tone="tonal" height={36} onPress={() => toggleFollow(s)} icon={s.following ? 'checkmark' : undefined} />
                  </Press>
                ))}
              </ScrollView>
            </>
          )}

          {data.recent.length > 0 && (
            <>
              <Text style={styles.h2}>Recién llegados</Text>
              <ProductGrid products={data.recent} onToggleFav={toggleFav} />
            </>
          )}

          {!data.featured.length && !data.recent.length && (
            <Text style={[T.subhead, { color: C.secondary, textAlign: 'center', marginTop: 40, paddingHorizontal: 32 }]}>
              Todavía no hay productos publicados. Volvé pronto.
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}

function Banners({ banners }: { banners: any[] }) {
  const { width } = useWindowDimensions();
  const [page, setPage] = React.useState(0);
  if (!banners.length) return null;
  const w = width - 32;
  const open = (b: any) => {
    const to: Record<string, string> = { producto: `/producto/${b.targetId}`, categoria: `/categoria/${b.targetId}`, vendedor: `/tienda/${b.targetId}`, vivo: `/vivo/${b.targetId}` };
    if (to[b.targetType]) router.push(to[b.targetType] as any);
  };
  return (
    <View style={{ marginTop: 16 }}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} snapToInterval={w + 10} decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (w + 10)))}>
        {banners.map((b) => (
          <Pressable key={b.id} onPress={() => open(b)} accessibilityRole="link" accessibilityLabel={b.title}>
            <Img url={b.imageUrl} color={C.forest} radius={26} style={{ width: w, height: 184 }}>
              <LinearGradientLike />
              <View style={{ position: 'absolute', left: 18, right: 18, bottom: 16, gap: 10 }}>
                <Text style={{ color: C.white, fontSize: 22, fontWeight: '700' }} numberOfLines={2}>{b.title}</Text>
                <View style={{ alignSelf: 'flex-start', backgroundColor: C.white, borderRadius: R.pill, paddingHorizontal: 14, height: 32, justifyContent: 'center' }}>
                  <Text style={{ fontWeight: '600', color: C.label }}>{b.cta}</Text>
                </View>
              </View>
            </Img>
          </Pressable>
        ))}
      </ScrollView>
      {banners.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 }}>
          {banners.map((b, i) => (
            <View key={b.id} style={{ width: i === page ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? C.label : C.unchecked }} />
          ))}
        </View>
      )}
    </View>
  );
}

function HomeSkeleton() {
  return (
    <View style={{ padding: 16, gap: 16 }}>
      <Skeleton style={{ height: 184, borderRadius: 26 }} />
      <View style={{ flexDirection: 'row', gap: 14 }}>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} style={{ width: 62, height: 62, borderRadius: 31 }} />)}</View>
      <View style={{ flexDirection: 'row', gap: 12 }}><Skeleton style={{ flex: 1, aspectRatio: 1 }} /><Skeleton style={{ flex: 1, aspectRatio: 1 }} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  search: { height: 40, borderRadius: R.pill, backgroundColor: C.fill, marginHorizontal: 16, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  h2: { ...T.title2, paddingHorizontal: 20, marginTop: 24, marginBottom: 12 },
  catCircle: { width: 62, height: 62, borderRadius: 31, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  sellerCard: { width: 220, backgroundColor: C.white, borderRadius: R.card, padding: 14, gap: 12 },
});
