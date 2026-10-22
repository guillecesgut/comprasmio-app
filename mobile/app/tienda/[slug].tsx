import React from 'react';
import { View, Text, ScrollView, Share, Linking, TextInput, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api';
import { useSession } from '@/session';
import { useData, useToggleFav, setFav } from '@/hooks';
import { whenLabel } from '@/format';
import { LinearGradientLike } from '@/Shade';
import { Circle, Img, Avatar, Sym, Btn, Segmented, ProductGrid, Loading, ErrorLine, Press, Group, Row, FilterChip, LivePill } from '@/ui';
import { C, T, R } from '@/theme';

type Tab = 'productos' | 'resenas' | 'vivos';

/** D9 · Perfil público del vendedor. `preview=1` lo abre en vista previa desde E10. */
export default function Tienda() {
  const { slug = '', preview } = useLocalSearchParams<{ slug: string; preview?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { data: s, error, setData } = useData(() => api.seller(slug).then((r) => r.seller), [slug]);
  const [tab, setTab] = React.useState<Tab>('productos');
  const [q, setQ] = React.useState('');
  const [products, setProducts] = React.useState<any[] | null>(null);
  const reviews = useData(() => (s ? api.sellerReviews(s.slug).then((r) => r.reviews) : Promise.resolve([])), [s?.id]);

  React.useEffect(() => {
    if (!s) return;
    const t = setTimeout(() => api.products({ sellerId: s.id, q: q.trim() || undefined, limit: 60 }).then((r) => setProducts(r.items)).catch(() => setProducts([])), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [s?.id, q]);

  const toggleFav = useToggleFav(React.useCallback((id: string, fav: boolean) => setProducts((l) => setFav(l || [], id, fav)), []));

  if (!s) {
    return (
      <View style={{ flex: 1, backgroundColor: C.groupedBg, paddingTop: insets.top + 60 }}>
        {error ? <View style={{ padding: 16 }}><ErrorLine message={error} /></View> : <Loading />}
        <View style={{ position: 'absolute', top: insets.top + 6, left: 16 }}><Circle icon="chevron.backward" onPress={() => router.back()} label="Volver" /></View>
      </View>
    );
  }

  const follow = async () => {
    setData({ ...s, following: !s.following, followers: s.followers + (s.following ? -1 : 1) });
    await api.toggleFollow(s.id).catch(() => {});
  };
  const socials: [string, string, any][] = [
    ['tiktok', 'TikTok', 'music.note'], ['instagram', 'Instagram', 'camera'], ['whatsapp', 'WhatsApp', 'phone'],
  ];
  const openSocial = (k: string, v: string) => {
    const handle = v.replace(/^@/, '');
    const url = k === 'tiktok' ? `https://www.tiktok.com/@${handle}` : k === 'instagram' ? `https://instagram.com/${handle}` : `https://wa.me/${v.replace(/\D/g, '')}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.groupedBg }} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <Img url={s.coverUrl} color={s.color} radius={0} style={{ height: 200 }}>
        <LinearGradientLike from={0} opacity={0.25} />
        <View style={{ position: 'absolute', top: insets.top + 6, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Circle icon="chevron.backward" blur bg="rgba(0,0,0,.3)" color={C.white} onPress={() => router.back()} label="Volver" />
          <Circle icon="square.and.arrow.up" blur bg="rgba(0,0,0,.3)" color={C.white} label="Compartir"
            onPress={() => Share.share({ message: `${s.name} en ComprasMío!: comprasmio.bo/${s.slug}` })} />
        </View>
      </Img>

      <View style={{ paddingHorizontal: 16, marginTop: -42, gap: 8 }}>
        <View style={{ borderWidth: 4, borderColor: C.groupedBg, borderRadius: 46, alignSelf: 'flex-start' }}>
          {s.avatarUrl ? <Img url={s.avatarUrl} radius={42} style={{ width: 84, height: 84 }} /> : <Avatar initials={s.initials} bg={s.color} size={84} />}
        </View>
        <Text style={T.title1}>{s.name} {s.verified && <Sym name="checkmark.seal.fill" size={20} color={C.tint} />}</Text>
        <Text style={[T.subhead, T.num, { color: C.secondary }]}>★ {s.ratingPct ?? 100} % · {s.salesCount} ventas · {s.followers} seguidores{s.city ? ` · ${s.city}` : ''}</Text>
        {preview ? (
          <View style={{ backgroundColor: C.fill2, borderRadius: 14, padding: 10 }}><Text style={T.footnote}>Vista previa: así ven tu tienda los compradores.</Text></View>
        ) : user && user.sellerId !== s.id ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Btn flex height={44} title={s.following ? 'Siguiendo' : 'Seguir'} tone={s.following ? 'tonal' : 'tint'} icon={s.following ? 'checkmark' : undefined} onPress={follow} />
            <Btn flex height={44} title="Mensaje" tone="tonal" icon="bubble.left" onPress={() => router.push(`/chat/${s.id}`)} />
          </View>
        ) : null}
      </View>

      {s.live && (
        <Press onPress={() => router.push(`/vivo/${s.live.streamId}`)} style={styles.live}>
          <LivePill />
          <Text style={{ flex: 1, color: C.white, fontWeight: '600' }} numberOfLines={1}>{s.live.title}</Text>
          <Text style={{ color: C.white, fontWeight: '700' }}>Entrar</Text>
        </Press>
      )}

      {!!s.bio && <Text style={[T.subhead, { color: C.label2, paddingHorizontal: 16, marginTop: 14 }]}>{s.bio}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 12 }}>
        {socials.filter(([k]) => s.socials?.[k]).map(([k, label, icon]) => (
          <FilterChip key={k} label={label} icon={icon} onPress={() => openSocial(k, s.socials[k])} />
        ))}
      </View>

      <Segmented style={{ marginHorizontal: 16, marginTop: 18 }} value={tab} onChange={setTab}
        options={[{ key: 'productos', label: 'Productos' }, { key: 'resenas', label: 'Reseñas' }, { key: 'vivos', label: 'Próximos vivos' }]} />

      {tab === 'productos' && (
        <>
          <View style={styles.search}>
            <Sym name="magnifyingglass" size={16} color={C.secondary} />
            <TextInput value={q} onChangeText={setQ} placeholder={`Buscar en ${s.name}`} placeholderTextColor={C.secondary} style={{ flex: 1, fontSize: 16, color: C.label }} />
          </View>
          {!products ? <Loading /> : products.length ? <ProductGrid products={products} onToggleFav={user ? toggleFav : undefined} /> : (
            <Text style={[T.subhead, { color: C.secondary, textAlign: 'center', marginTop: 24 }]}>{q ? 'No hay productos con esa palabra.' : 'Esta tienda todavía no publicó productos.'}</Text>
          )}
        </>
      )}

      {tab === 'resenas' && (
        <View style={{ padding: 16, gap: 10 }}>
          {(reviews.data || []).length === 0 && <Text style={[T.subhead, { color: C.secondary, textAlign: 'center' }]}>Todavía no hay reseñas.</Text>}
          {(reviews.data || []).map((r: any, i: number) => (
            <View key={i} style={{ backgroundColor: C.white, borderRadius: R.card, padding: 14, gap: 6 }}>
              <Text style={{ color: C.bidLight }}>{'★'.repeat(r.rating)}<Text style={{ color: C.fill }}>{'★'.repeat(5 - r.rating)}</Text></Text>
              {!!r.comment && <Text style={T.subhead}>{r.comment}</Text>}
              <Text style={T.footnote}>{r.buyer}{r.product ? ` · ${r.product}` : ''}</Text>
              {!!r.reply && <Text style={[T.footnote, { color: C.label2 }]}>Respuesta: {r.reply}</Text>}
            </View>
          ))}
        </View>
      )}

      {tab === 'vivos' && (
        <View style={{ marginTop: 16 }}>
          {s.upcoming.length ? (
            <Group>{s.upcoming.map((u: any) => <Row key={u.id} icon="calendar" title={u.title} subtitle={whenLabel(u.at)} />)}</Group>
          ) : (
            <Text style={[T.subhead, { color: C.secondary, textAlign: 'center', paddingHorizontal: 32 }]}>
              No hay vivos programados. {s.following ? 'Te avisamos cuando salga al aire.' : 'Seguí la tienda para enterarte.'}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  live: { marginHorizontal: 16, marginTop: 14, backgroundColor: C.bid, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  search: { height: 40, borderRadius: R.pill, backgroundColor: C.fill, margin: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
});
