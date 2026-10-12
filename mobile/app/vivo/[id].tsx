import React from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Animated, Share, ActionSheetIOS, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, bs, clock, realtime } from '@/api';
import { useSession } from '@/session';
import { useViewer, useLiveAvailable, LiveVideo } from '@/live';
import { Circle, Sym, Press, Placeholder, Avatar, LivePill, ViewersPill, useToast } from '@/ui';
import { C, T, R } from '@/theme';

const URGENT_AT = 5; // últimos segundos: reloj ámbar y halo pulsante en el CTA

/** B2 · Sala en vivo (subasta) y B3 · (precio fijo). */
export default function Sala() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, favorites, toggleFavorite, toggleBlock } = useSession();

  const [stream, setStream] = React.useState<any>(null);
  const [lot, setLot] = React.useState<any>(null);
  const [queue, setQueue] = React.useState<any[]>([]);
  const [messages, setMessages] = React.useState<any[]>([]);
  const [lastOutcome, setLastOutcome] = React.useState<any>(null);
  const [draft, setDraft] = React.useState('');
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [ended, setEnded] = React.useState(false);

  const liveAvailable = useLiveAvailable();
  const video = useViewer(id, liveAvailable === true && !!user);
  const userRef = React.useRef(user);
  userRef.current = user;
  const lotRef = React.useRef(lot);
  lotRef.current = lot;

  React.useEffect(() => {
    let alive = true;
    api.stream(id)
      .then(({ stream, lot, messages, queue }) => {
        if (!alive) return;
        setStream(stream);
        setLot(lot);
        setMessages(messages);
        setQueue(queue || []);
      })
      .catch((e) => setNotice(e.message));

    const off = realtime.subscribe(`stream:${id}`);
    const listeners = [
      realtime.on('lot:update', (p) => {
        if (p.streamId !== id) return;
        // Te superaron: un toque suave para que lo sientas sin mirar.
        const me = userRef.current?.id;
        const prev = lotRef.current;
        if (me && prev?.leaderId === me && p.lot?.leaderId && p.lot.leaderId !== me) Haptics.selectionAsync();
        setLot(p.lot);
        setLastOutcome(null);
      }),
      realtime.on('lot:tick', (p) => p.streamId === id && setLot((l: any) => (l ? { ...l, timer: p.timer, price: p.price } : l))),
      realtime.on('lot:closed', (p) => {
        if (p.streamId !== id) return;
        setLot(null);
        setLastOutcome(p.outcome);
      }),
      realtime.on('chat:new', (p) => {
        if (p.streamId !== id) return;
        setMessages((m) => [...m.slice(-60), p.message]);
        // Compras de otros en precio fijo: toast arriba.
        const m = p.message;
        if (m.system && /^Compró/.test(m.text) && m.handle !== userRef.current?.handle) toast(`@${m.handle} compró 1 unidad`);
      }),
      realtime.on('stream:viewers', (p) => p.streamId === id && setStream((s: any) => (s ? { ...s, viewers: p.viewers } : s))),
      realtime.on('queue:update', (p) => p.streamId === id && setQueue(p.queue)),
      realtime.on('auction:won', ({ order }) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.push(`/pago/${order.id}?ganaste=1`);
      }),
      realtime.on('purchase:done', ({ order }) => router.push(`/pago/${order.id}`)),
      realtime.on('stream:ended', (p) => (!p?.streamId || p.streamId === id) && setEnded(true)),
    ];
    return () => {
      alive = false;
      off();
      listeners.forEach((stop) => stop());
    };
  }, [id, toast]);

  const requireLogin = () => {
    Alert.alert('Iniciá sesión', 'Necesitás una cuenta para pujar, comprar o comentar.');
  };

  const send = async () => {
    if (!user) return requireLogin();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await api.chat(id, text).catch((e) => setNotice(e.message));
  };

  const bid = async () => {
    if (!user) return requireLogin();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    try {
      const { lot: updated } = await api.bid(id, lot.price + lot.increment);
      setLot(updated);
      setNotice(null);
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };

  const buy = async () => {
    if (!user) return requireLogin();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    try {
      const { order } = await api.buy(id);
      router.push(`/pago/${order.id}`);
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };

  const follow = () => {
    if (!user || !stream) return requireLogin();
    const was = favorites.includes(stream.id);
    toggleFavorite(stream.id);
    if (!was) toast(`Ahora seguís a ${stream.seller?.name}`);
  };

  /** Moderación (requisito de App Store para chat en vivo): reportar o bloquear. */
  const moderate = (message: any) => {
    if (!user || message.system || message.handle === user.handle) return;
    const blocked = (user.blocked || []).includes(message.handle);
    const report = () =>
      api.report({ handle: message.handle, text: message.text, streamId: id })
        .then(() => toast('Gracias. Revisamos el reporte.'))
        .catch((e) => setNotice(e.message));
    const block = () =>
      toggleBlock(message.handle)
        .then(() => toast(blocked ? `Desbloqueaste a @${message.handle}` : `Bloqueaste a @${message.handle}`))
        .catch((e) => setNotice(e.message));
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `@${message.handle}`,
        message: message.text,
        options: ['Reportar mensaje', blocked ? 'Desbloquear' : 'Bloquear usuario', 'Cancelar'],
        destructiveButtonIndex: [0, 1],
        cancelButtonIndex: 2,
      },
      (i) => (i === 0 ? report() : i === 1 ? block() : undefined)
    );
  };

  if (!stream) {
    return (
      <View style={{ flex: 1, backgroundColor: C.forest, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style="light" />
        <Text style={{ color: C.white, opacity: 0.7 }}>{notice || 'Cargando la sala…'}</Text>
        <View style={{ position: 'absolute', top: insets.top + 8, left: 16 }}>
          <Circle icon="chevron.down" bg="rgba(0,0,0,.3)" color={C.white} onPress={() => router.back()} label="Cerrar sala" />
        </View>
      </View>
    );
  }

  const favorite = favorites.includes(stream.id);
  const blocked: string[] = user?.blocked || [];
  const visible = messages.filter((m) => !blocked.includes(m.handle)).slice(-5);
  const isFixed = lot ? lot.mode === 'fixed' : stream.mode === 'fixed';

  return (
    <View style={{ flex: 1, backgroundColor: C.black }}>
      <StatusBar style="light" />

      {/* Fondo: video de LiveKit, o el bloque de color del vivo mientras tanto. */}
      <Placeholder strong color={stream.grad || C.forest} radius={0} style={StyleSheet.absoluteFill}>
        {video.status !== 'live' && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {!!stream.tag && video.status !== 'connecting' && video.status !== 'waiting' && (
              <Text style={{ color: 'rgba(255,255,255,.82)', fontWeight: '700', fontSize: 18, letterSpacing: 1.4, textAlign: 'center' }}>{stream.tag}</Text>
            )}
            {video.status === 'connecting' && <Text style={styles.hint}>Conectando con el video…</Text>}
            {video.status === 'waiting' && <Text style={styles.hint}>El vendedor todavía no abrió su cámara</Text>}
          </View>
        )}
      </Placeholder>
      <LiveVideo track={video.track} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, paddingTop: insets.top + 6 }}>
          {/* Barra superior */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }}>
            <Circle icon="chevron.down" blur bg="rgba(0,0,0,.3)" color={C.white} onPress={() => router.back()} label="Cerrar sala" />
            <LivePill height={30} />
            <ViewersPill viewers={stream.viewers} height={30} />
            <View style={{ flex: 1 }} />
            {queue.length > 0 && (
              <Press onPress={() => router.push(`/catalogo/${id}`)} accessibilityLabel={`Catálogo, ${queue.length} productos`}>
                <View style={styles.catalog}>
                  <Sym name="shippingbox" size={16} color={C.white} />
                  <Text style={{ color: C.white, fontWeight: '600', fontSize: 15 }}>Catálogo</Text>
                  <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                    <Text style={[{ fontSize: 12, fontWeight: '700', color: C.forest }, T.num]}>{queue.length}</Text>
                  </View>
                </View>
              </Press>
            )}
          </View>

          {/* Vendedor */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginTop: 12 }}>
            <Avatar initials={stream.seller?.initials || '?'} size={38} bg={C.bidLight} fg={C.forest} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.white, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{stream.seller?.name}</Text>
              <Text style={[{ color: C.bidLight, fontSize: 12 }, T.num]}>★ {Math.round(stream.seller?.rating ?? 100)} %</Text>
            </View>
            {user && (
              <Press
                onPress={follow}
                style={{
                  height: 34, paddingHorizontal: 14, borderRadius: R.pill, justifyContent: 'center',
                  borderWidth: favorite ? 0 : 1.5, borderColor: 'rgba(255,255,255,.6)',
                  backgroundColor: favorite ? 'rgba(255,255,255,.2)' : 'transparent',
                }}
              >
                <Text style={{ color: C.white, fontWeight: '600', fontSize: 14 }}>{favorite ? '✓ Siguiendo' : 'Seguir'}</Text>
              </Press>
            )}
          </View>

          <View style={{ flex: 1 }} />

          {/* Chat superpuesto + riel derecho */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, gap: 12 }}>
            <View style={{ flex: 1, gap: 6 }}>
              {visible.map((m, i) => (
                <Press key={m.id} onLongPress={() => moderate(m)} delayLongPress={350} style={{ opacity: 0.4 + (0.6 * (i + 1)) / visible.length }}>
                  <ChatLine message={m} mine={m.handle === user?.handle} />
                </Press>
              ))}
            </View>
            <View style={{ gap: 12 }}>
              <Circle icon={favorite ? 'heart.fill' : 'heart'} size={48} blur bg="rgba(0,0,0,.3)" color={favorite ? C.bidLight : C.white} onPress={follow} label="Seguir" />
              <Circle
                icon="square.and.arrow.up" size={48} blur bg="rgba(0,0,0,.3)" color={C.white} label="Compartir"
                onPress={() => Share.share({ message: `${stream.title} — en vivo en ComprasMío!`, url: `comprasmio://vivo/${id}` })}
              />
            </View>
          </View>

          {/* Composer */}
          <View style={styles.composer}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={user ? 'Escribí un comentario…' : 'Entrá para comentar'}
              placeholderTextColor="rgba(255,255,255,.55)"
              style={{ flex: 1, color: C.white, fontSize: 16, paddingHorizontal: 16 }}
              returnKeyType="send"
              onSubmitEditing={send}
              maxLength={240}
              accessibilityLabel="Comentario"
            />
            <Circle icon="arrow.up" size={34} bg={draft.trim() ? C.tint : 'rgba(255,255,255,.18)'} color={C.white} onPress={send} label="Enviar comentario" />
          </View>
        </View>

        <Dock
          lot={lot}
          fixed={isFixed}
          userId={user?.id}
          busy={busy}
          notice={ended ? 'La transmisión terminó.' : notice}
          outcome={lastOutcome}
          onBid={bid}
          onBuy={buy}
          bottom={Math.max(insets.bottom, 12) + 8}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

function ChatLine({ message, mine }: { message: any; mine: boolean }) {
  if (message.system) {
    const amount = String(message.text).replace(/^Pujó /, '').replace(/^Compró /, 'compró ');
    const text = /^Pujó/.test(message.text)
      ? mine ? `Vos pujaste ${amount}` : `@${message.handle} pujó ${amount}`
      : mine ? `Vos ${amount}` : `@${message.handle} ${amount}`;
    return (
      <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(174,81,21,.55)', borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
        <Text style={[{ color: C.white, fontSize: 14, fontWeight: '600' }, T.num]}>{text}</Text>
      </View>
    );
  }
  return (
    <Text style={styles.chat}>
      <Text style={{ fontWeight: '700', color: message.seller ? '#A8D8C6' : C.white }}>{mine ? 'Vos' : message.handle}</Text>{' '}
      {message.text}
    </Text>
  );
}

function Dock({ lot, fixed, userId, busy, notice, outcome, onBid, onBuy, bottom }: any) {
  const halo = React.useRef(new Animated.Value(0)).current;
  const isAuction = lot?.mode === 'auction';
  const urgent = isAuction && lot.timer <= URGENT_AT && lot.timer > 0;

  React.useEffect(() => {
    if (!urgent) return halo.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(halo, { toValue: 1, duration: 450, useNativeDriver: false }),
      Animated.timing(halo, { toValue: 0, duration: 450, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [urgent, halo]);

  const tint = fixed ? 'rgba(30,24,18,.62)' : 'rgba(8,28,23,.62)';

  return (
    <View style={[styles.dock, { marginBottom: bottom }]}>
      <BlurView intensity={50} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />

      {!lot ? (
        <View style={{ padding: 20 }}>
          {outcome && <OutcomeBand outcome={outcome} />}
          <Text style={{ color: C.white, fontSize: 17, fontWeight: '600' }}>
            {outcome ? 'Sigue el próximo producto' : 'El vendedor todavía no puso un lote en el aire'}
          </Text>
          <Text style={{ color: '#B9CCC5', fontSize: 14, marginTop: 4 }}>Quedate en la sala: el próximo producto aparece acá.</Text>
          {!!notice && <Text style={styles.notice}>{notice}</Text>}
        </View>
      ) : (
        <View style={{ padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>{isAuction ? 'PUJA ACTUAL' : 'PRECIO FIJO'}</Text>
              <Text style={[{ color: C.white, fontSize: 36, fontWeight: '700', letterSpacing: -0.6 }, T.num]}>{bs(lot.price)}</Text>
              <LeaderLine lot={lot} userId={userId} />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.eyebrow}>QUEDAN</Text>
              {isAuction ? (
                <Text style={[{ fontSize: 30, fontWeight: '600', color: urgent ? C.bidLight : C.white }, T.num]} accessibilityLabel={`Quedan ${lot.timer} segundos`}>
                  {clock(lot.timer)}
                </Text>
              ) : (
                <Text style={[{ fontSize: 30, fontWeight: '600', color: C.white }, T.num]}>{lot.stock - lot.sold} u.</Text>
              )}
              <Text style={[{ color: '#B9CCC5', fontSize: 13 }, T.num]}>{isAuction ? `Lote ${lot.lotNo}` : `de ${lot.stock}`}</Text>
            </View>
          </View>

          {!isAuction && (
            <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.16)', marginTop: 12, overflow: 'hidden' }}>
              <View style={{ height: 4, width: `${lot.stock ? ((lot.stock - lot.sold) / lot.stock) * 100 : 0}%`, backgroundColor: C.mint }} />
            </View>
          )}

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,.18)', marginVertical: 14 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Placeholder color={lot.grad || C.tint} style={{ width: 40, height: 40 }} radius={10} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.white, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{lot.productName}</Text>
              <Text style={[{ color: '#B9CCC5', fontSize: 13 }, T.num]} numberOfLines={1}>
                {isAuction ? `Sube de a ${bs(lot.increment)}` : 'Lo compra quien llega primero'}
              </Text>
            </View>
          </View>

          {!!notice && <Text style={styles.notice}>{notice}</Text>}

          <Cta lot={lot} userId={userId} busy={busy} onBid={onBid} onBuy={onBuy} halo={halo} urgent={urgent} />
        </View>
      )}
    </View>
  );
}

function LeaderLine({ lot, userId }: { lot: any; userId?: string }) {
  if (lot.mode === 'fixed') {
    return <Text style={{ color: '#B9CCC5', fontSize: 15, marginTop: 2 }}>{lot.lastBuyerHandle ? `Última compra: @${lot.lastBuyerHandle}` : 'Lo compra quien llega primero'}</Text>;
  }
  const leader = lot.leaderId && lot.leaderId === userId;
  return (
    <Text style={{ color: leader ? C.mint : '#B9CCC5', fontSize: 15, fontWeight: leader ? '600' : '400', marginTop: 2 }}>
      {leader ? 'Vas ganando' : lot.leaderHandle ? `@${lot.leaderHandle} va ganando` : 'Todavía nadie pujó'}
    </Text>
  );
}

function Cta({ lot, userId, busy, onBid, onBuy, halo, urgent }: any) {
  if (lot.mode === 'fixed') {
    const left = lot.stock - lot.sold;
    return (
      <Press
        onPress={onBuy}
        disabled={busy || left <= 0}
        style={[styles.cta, { backgroundColor: C.tint, opacity: left <= 0 ? 0.45 : 1 }]}
        accessibilityRole="button"
      >
        <Text style={[styles.ctaText, T.num]}>{left > 0 ? `Comprar ya · ${bs(lot.price)}` : 'Agotado'}</Text>
      </Press>
    );
  }
  const leading = lot.leaderId && lot.leaderId === userId;
  const borderColor = halo.interpolate({ inputRange: [0, 1], outputRange: ['rgba(233,162,59,0)', 'rgba(233,162,59,.45)'] });
  return (
    // Halo de 6 pt por fuera del botón, sin mover el layout: margen negativo igual al borde.
    <Animated.View
      style={{
        borderRadius: R.pill, borderWidth: urgent ? 6 : 0, borderColor,
        marginHorizontal: urgent ? -6 : 0, marginTop: urgent ? 10 : 16, marginBottom: urgent ? -6 : 0,
      }}
    >
      <Press
        onPress={onBid}
        disabled={busy || leading}
        style={[styles.cta, { marginTop: 0, backgroundColor: C.bid, opacity: leading ? 0.55 : 1 }]}
        accessibilityRole="button"
        accessibilityHint="Puja el siguiente monto"
      >
        <Text style={[styles.ctaText, T.num]}>
          {leading ? `Vas ganando · ${bs(lot.price)}` : `¡Mío! · ${bs(lot.price + lot.increment)}`}
        </Text>
      </Press>
    </Animated.View>
  );
}

function OutcomeBand({ outcome }: { outcome: any }) {
  const text =
    outcome.type === 'won' ? `@${outcome.winnerHandle} se lo llevó por ${bs(outcome.price)}`
      : outcome.type === 'no_sale' ? 'El lote cerró sin alcanzar el precio mínimo'
        : 'La oferta se cerró';
  return (
    <View style={{ backgroundColor: 'rgba(255,255,255,.12)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12 }}>
      <Text style={[{ color: C.white, fontSize: 14, fontWeight: '500' }, T.num]}>{text} · sigue el próximo</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { color: 'rgba(255,255,255,.75)', fontSize: 15 },
  catalog: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: 'rgba(0,0,0,.35)' },
  chat: {
    color: C.white, fontSize: 15, lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,.45)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  composer: {
    flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: R.pill, marginHorizontal: 16, marginTop: 12,
    marginBottom: 10, paddingRight: 5, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,.3)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,.14)',
  },
  dock: {
    marginHorizontal: 10, borderRadius: R.dock, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,.14)',
  },
  eyebrow: { color: '#B9CCC5', fontSize: 12, fontWeight: '600', letterSpacing: 0.6 },
  notice: { color: C.bidLight, fontSize: 14, fontWeight: '500', marginTop: 12 },
  cta: { height: 56, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  ctaText: { color: C.white, fontSize: 18, fontWeight: '700' },
});
