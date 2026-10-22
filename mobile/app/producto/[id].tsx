import React from 'react';
import { View, Text, ScrollView, Pressable, Share, StyleSheet, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { api, bs } from '@/api';
import { useSession } from '@/session';
import { useData } from '@/hooks';
import { Circle, Img, Chip, Stepper, Btn, BottomBar, Avatar, Sym, Press, Notice, Group, Row, Loading, ErrorLine, useToast } from '@/ui';
import { C, T, R, SOFT } from '@/theme';

/** Paleta aproximada para pintar los círculos de color cuando el atributo es "Color". */
const COLOR_HEX: Record<string, string> = {
  negro: '#201F1B', blanco: '#FFFFFF', natural: '#E8DCC4', crudo: '#EDE3CF', gris: '#9A958C', rojo: '#C8372D', azul: '#2A5BA8',
  verde: '#0E7C66', amarillo: '#E9C23B', rosado: '#E8A3B5', rosa: '#E8A3B5', marrón: '#7A5233', cafe: '#7A5233', café: '#7A5233',
  dorado: '#C9A44A', plateado: '#C0C0C0', beige: '#D9C7A7', naranja: '#E07B2E', morado: '#6B4C9A', celeste: '#8EC5E8',
};
const isColorAttr = (name: string) => /^colou?r$/i.test(name.trim());

/** D5 · Producto. */
export default function Producto() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const { user, refreshBadges } = useSession();
  const { data, error, setData } = useData(() => api.product(id).then((r) => r.product), [id]);
  const [picked, setPicked] = React.useState<Record<string, string>>({});
  const [qty, setQty] = React.useState(1);
  const [page, setPage] = React.useState(0);
  const [busy, setBusy] = React.useState<'cart' | 'buy' | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const p = data;
  const attrs: { name: string; values: string[] }[] = p?.attributes || [];
  const variants: any[] = p?.variants || [];
  const single = variants.length === 1;

  // Producto sin atributos o con una sola variante: queda elegida.
  const variant = React.useMemo(() => {
    if (!p) return null;
    if (single) return variants[0];
    if (!attrs.length) return null;
    if (attrs.some((a) => !picked[a.name])) return null;
    return variants.find((v) => attrs.every((a) => String(v.options?.[a.name]) === picked[a.name])) || null;
  }, [p, picked, single, attrs, variants]);

  React.useEffect(() => { setQty(1); }, [variant?.id]);

  if (!p) {
    return (
      <View style={{ flex: 1, backgroundColor: C.groupedBg, paddingTop: insets.top + 60 }}>
        {error ? <View style={{ padding: 16 }}><ErrorLine message={error} /></View> : <Loading />}
        <View style={{ position: 'absolute', top: insets.top + 6, left: 16 }}><Circle icon="chevron.backward" onPress={() => router.back()} label="Volver" /></View>
      </View>
    );
  }

  /** ¿Hay alguna variante con stock que tenga este valor, con lo ya elegido en los otros atributos? */
  const valueAvailable = (attr: string, value: string) =>
    variants.some((v) => String(v.options?.[attr]) === value && v.available > 0 &&
      attrs.every((a) => a.name === attr || !picked[a.name] || String(v.options?.[a.name]) === picked[a.name]));

  const prices = variants.map((v) => v.price);
  const minPrice = Math.min(...prices);
  const price = variant ? variant.price : minPrice;
  const discount = p.compareAt && p.compareAt > price ? Math.round((1 - price / p.compareAt) * 100) : 0;
  const totalAvailable = variants.reduce((s, v) => s + v.available, 0);
  const soldOut = variant ? variant.available === 0 : totalAvailable === 0;
  const missing = attrs.find((a) => !picked[a.name]);
  const free = p.shippingOptions.includes('envio_gratis');
  const photos: string[] = p.photos.length ? p.photos : [null as any];

  const toggleFav = async () => {
    if (!user) return;
    setData({ ...p, favorite: !p.favorite });
    try {
      const r = await api.toggleWishlist(p.id);
      setData((d: any) => ({ ...d, favorite: r.favorite }));
      toast(r.favorite ? 'Guardado en tu lista de deseos' : 'Quitado de tu lista de deseos');
    } catch { setData((d: any) => ({ ...d, favorite: p.favorite })); }
  };

  const follow = async () => {
    setData({ ...p, seller: { ...p.seller, following: !p.seller.following } });
    await api.toggleFollow(p.seller.id).catch(() => {});
  };

  const add = async (thenCheckout: boolean) => {
    if (!variant) return;
    setBusy(thenCheckout ? 'buy' : 'cart');
    setActionError(null);
    try {
      await api.addToCart(variant.id, qty);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshBadges();
      if (thenCheckout) router.push('/checkout');
      else toast('Agregado al carrito');
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const ctaLabel = soldOut ? 'Agotado' : !variant && missing ? `Elegí ${/^[aeiou]/i.test(missing.name) ? 'un' : 'una'} ${missing.name.toLowerCase()}` : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
        {/* Galería 1:1 */}
        <View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
            {photos.map((url, i) => <Img key={i} url={url} color={p.color} radius={0} style={{ width, height: width }} />)}
          </ScrollView>
          {photos.length > 1 && (
            <View style={styles.counter}><Text style={[{ color: C.white, fontSize: 13, fontWeight: '600' }, T.num]}>{page + 1}/{photos.length}</Text></View>
          )}
          <View style={[styles.floating, { top: insets.top + 6 }]}>
            <Circle icon="chevron.backward" bg="rgba(255,255,255,.85)" onPress={() => router.back()} label="Volver" />
            <View style={{ flex: 1 }} />
            <Circle icon="square.and.arrow.up" bg="rgba(255,255,255,.85)" label="Compartir"
              onPress={() => Share.share({ message: `${p.title} · ${bs(price)} en ComprasMío!`, url: `comprasmio://producto/${p.id}` })} />
            {user && <Circle icon={p.favorite ? 'heart.fill' : 'heart'} color={p.favorite ? C.bid : C.label} bg="rgba(255,255,255,.85)" onPress={toggleFav} label="Lista de deseos" />}
          </View>
        </View>

        <View style={{ padding: 16, gap: 8 }}>
          <Text style={T.title2}>{p.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <Text style={[{ fontSize: 30, fontWeight: '700', letterSpacing: -0.4, color: C.label }, T.num]}>
              {!variant && Math.max(...prices) > minPrice ? `Desde ${bs(minPrice)}` : bs(price)}
            </Text>
            {discount > 0 && (
              <>
                <Text style={[{ fontSize: 17, color: C.secondary, textDecorationLine: 'line-through' }, T.num]}>{bs(p.compareAt)}</Text>
                <Chip label={`−${discount} %`} bg={C.label} fg={C.white} />
              </>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {free && <Chip label="Envío gratis" bg={SOFT.green.bg} fg={SOFT.green.fg} />}
            {p.shippingOptions.includes('retiro') && <Chip label="Retiro en persona" bg={C.fill2} fg="#4C463C" />}
            {p.condition === 'usado' && <Chip label="Usado" bg={C.fill2} fg="#4C463C" />}
          </View>
        </View>

        {/* Selectores de variante */}
        {!single && attrs.map((a) => (
          <View key={a.name} style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
            <Text style={T.headline}>{a.name}{picked[a.name] ? <Text style={{ fontWeight: '400', color: C.secondary }}> · {picked[a.name]}</Text> : null}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {a.values.map((value) => {
                const active = picked[a.name] === value;
                const ok = valueAvailable(a.name, value);
                const select = () => { Haptics.selectionAsync(); setPicked((x) => ({ ...x, [a.name]: active ? '' : value })); };
                if (isColorAttr(a.name)) {
                  const hex = COLOR_HEX[value.toLowerCase()] || C.fill;
                  return (
                    <Pressable key={value} onPress={select} accessibilityLabel={`${value}${ok ? '' : ', sin stock'}`} accessibilityState={{ selected: active }}
                      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: active ? C.tint : 'transparent', padding: 2, opacity: ok ? 1 : 0.35 }}>
                      <View style={{ flex: 1, borderRadius: 20, backgroundColor: hex, borderWidth: 2, borderColor: C.white }} />
                    </Pressable>
                  );
                }
                return (
                  <Pressable key={value} onPress={select} accessibilityState={{ selected: active, disabled: !ok }}
                    style={{ minWidth: 52, height: 40, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: active ? SOFT.green.bg : C.white, borderWidth: active ? 2 : 1, borderColor: active ? C.tint : C.separator, borderStyle: ok ? 'solid' : 'dashed' }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: ok ? C.label : C.tertiary, textDecorationLine: ok ? 'none' : 'line-through' }}>{value}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {variant && !soldOut && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16 }}>
            <View>
              <Text style={T.headline}>Cantidad</Text>
              {variant.available <= 5 && <Text style={[T.footnote, { color: C.bidText }]}>quedan {variant.available}</Text>}
            </View>
            <Stepper value={qty} max={variant.available} onChange={setQty} />
          </View>
        )}

        {p.inLiveNow && (
          <Notice tone="amber" icon="dot.radiowaves.left.and.right" style={{ marginBottom: 12 }}
            action={<Btn title="Ir a la sala" tone="bid" height={36} onPress={() => router.push(`/vivo/${p.inLiveNow.streamId}`)} style={{ alignSelf: 'flex-start' }} />}>
            Parte del stock está en un vivo ahora mismo.
          </Notice>
        )}

        {/* Vendedor */}
        <Group>
          <Row minHeight={64} onPress={() => router.push(`/tienda/${p.seller.slug}`)}
            left={p.seller.avatarUrl ? <Img url={p.seller.avatarUrl} radius={22} style={{ width: 44, height: 44 }} /> : <Avatar initials={p.seller.initials} bg={p.seller.color} size={44} />}
            title={<Text style={T.headline}>{p.seller.name} {p.seller.verified && <Sym name="checkmark.seal.fill" size={14} color={C.tint} />}</Text>}
            subtitle={`★ ${p.seller.ratingPct ?? 100} % · ${p.seller.salesCount} ventas`} chevron />
          {p.seller.liveStreamId && (
            <Press onPress={() => router.push(`/vivo/${p.seller.liveStreamId}`)} style={{ backgroundColor: SOFT.amber.bg, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, height: 46 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.bid }} />
              <Text style={{ flex: 1, color: C.bidText, fontWeight: '600' }}>En vivo ahora</Text>
              <Text style={{ color: C.bidText, fontWeight: '600' }}>Entrar</Text>
            </Press>
          )}
          <View style={{ flexDirection: 'row', gap: 10, padding: 12 }}>
            {user && <Btn flex title={p.seller.following ? 'Siguiendo' : 'Seguir'} tone="tonal" height={40} icon={p.seller.following ? 'checkmark' : undefined} onPress={follow} />}
            <Btn flex title="Ir a la tienda" tone="tonal" height={40} onPress={() => router.push(`/tienda/${p.seller.slug}`)} />
          </View>
        </Group>

        <Notice tone="green" icon="checkmark.shield.fill" style={{ marginTop: 12 }}>
          Pagás a ComprasMío! y le pagamos al vendedor. Si hay un problema con tu pedido, lo resolvemos con vos.
        </Notice>

        {!!p.description && (
          <View style={{ padding: 16, gap: 6 }}>
            <Text style={T.title2}>Descripción</Text>
            <Text style={[T.body, { color: C.label2 }]}>{p.description}</Text>
          </View>
        )}

        <Group style={{ marginTop: p.description ? 0 : 16 }}>
          <Row title="Estado" right={<Text style={T.subhead}>{p.condition === 'usado' ? 'Usado' : 'Nuevo'}</Text>} />
          {p.category && <Row title="Categoría" right={<Text style={T.subhead}>{p.category.name}</Text>} onPress={() => router.push(`/categoria/${p.category.id}`)} />}
          {variant?.sku && <Row title="SKU" right={<Text style={T.subhead}>{variant.sku}</Text>} />}
          <Row title="Entrega" right={<Text style={T.subhead}>{[free ? 'Envío gratis' : p.shippingOptions.includes('a_convenir') ? 'Envío a convenir' : null, p.shippingOptions.includes('retiro') ? 'Retiro' : null].filter(Boolean).join(' · ')}</Text>} />
        </Group>

        {p.reviews.count > 0 && (
          <View style={{ padding: 16, gap: 10 }}>
            <Text style={T.title2}>Reseñas · ★ {p.reviews.avg} ({p.reviews.count})</Text>
            {p.reviews.recent.map((r: any) => (
              <View key={r.id} style={{ backgroundColor: C.white, borderRadius: R.card, padding: 14, gap: 6 }}>
                <Text style={{ color: C.bidLight, fontSize: 15 }}>{'★'.repeat(r.rating)}<Text style={{ color: C.fill }}>{'★'.repeat(5 - r.rating)}</Text></Text>
                {!!r.comment && <Text style={T.subhead}>{r.comment}</Text>}
                <Text style={T.footnote}>{r.buyer}</Text>
                {!!r.reply && <Text style={[T.footnote, { color: C.label2 }]}>Respuesta del vendedor: {r.reply}</Text>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <BottomBar>
        <ErrorLine message={actionError} />
        {variant && !soldOut && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={T.footnote} numberOfLines={1}>Total · {qty} u.{variant.label !== 'Única' ? ` · ${variant.label}` : ''}</Text>
            <Text style={[T.headline, T.num, { color: C.tintText }]}>{bs(variant.price * qty)}</Text>
          </View>
        )}
        {!user ? (
          <Btn title="Entrá para comprar" onPress={() => router.push('/welcome')} />
        ) : ctaLabel ? (
          <Btn title={ctaLabel} disabled height={50} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn flex height={50} title="Agregar al carrito" tone="tonal" textStyle={{ color: C.tintText }} style={{ backgroundColor: SOFT.green.bg }}
              loading={busy === 'cart'} onPress={() => add(false)} />
            <Btn flex height={50} title="Comprar ahora" loading={busy === 'buy'} onPress={() => add(true)} />
          </View>
        )}
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  floating: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 8 },
  counter: { position: 'absolute', right: 16, bottom: 14, backgroundColor: 'rgba(0,0,0,.45)', borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3 },
});
