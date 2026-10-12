import React from 'react';
import { View, Text, StyleSheet, Alert, AppState, ActionSheetIOS } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, bs, clock, realtime } from '@/api';
import { useBroadcast, useLiveAvailable, LiveVideo, IN_EXPO_GO } from '@/live';
import { useElapsed } from '@/format';
import { Circle, Btn, ModeChip, Placeholder, Sym, LivePill, ViewersPill, ErrorLine } from '@/ui';
import { C, T, R } from '@/theme';

/**
 * C7 · Al aire. Cámara de LiveKit a pantalla completa y un panel claro abajo
 * para leer las cifras con cualquier luz. Sin LiveKit configurado se puede
 * vender igual: la sala de los compradores muestra el bloque de color.
 */
export default function AlAire() {
  useKeepAwake(); // la pantalla no se apaga mientras transmitís
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const liveAvailable = useLiveAvailable();
  const cam = useBroadcast(id);

  const [lot, setLot] = React.useState<any>(null);
  const [queue, setQueue] = React.useState<any[]>([]);
  const [viewers, setViewers] = React.useState(0);
  const [messages, setMessages] = React.useState<any[]>([]);
  const [outcome, setOutcome] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [skipVideo, setSkipVideo] = React.useState(false);

  const onAir = cam.status === 'live' || skipVideo;
  const elapsed = useElapsed(onAir);

  React.useEffect(() => {
    api.stream(id).then(({ lot, messages, queue, stream }) => {
      setLot(lot);
      setMessages(messages);
      setQueue(queue || []);
      setViewers(stream.viewers);
    }).catch((e) => setError(e.message));

    const off = realtime.subscribe(`stream:${id}`);
    const listeners = [
      realtime.on('lot:update', (p) => p.streamId === id && setLot(p.lot)),
      realtime.on('lot:tick', (p) => p.streamId === id && setLot((l: any) => (l ? { ...l, timer: p.timer, price: p.price } : l))),
      realtime.on('lot:closed', (p) => {
        if (p.streamId !== id) return;
        setLot(null);
        setOutcome(p.outcome);
        if (p.outcome?.type === 'won') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }),
      realtime.on('chat:new', (p) => p.streamId === id && setMessages((m) => [...m.slice(-40), p.message])),
      realtime.on('stream:viewers', (p) => p.streamId === id && setViewers(p.viewers)),
      realtime.on('queue:update', (p) => p.streamId === id && setQueue(p.queue)),
    ];
    return () => { off(); listeners.forEach((s) => s()); };
  }, [id]);

  // En segundo plano iOS corta la cámara: avisar al volver.
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && cam.status === 'live')
        setError('Mientras la app estuvo en segundo plano, la sala no te vio. Ya volviste al aire.');
    });
    return () => sub.remove();
  }, [cam.status]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const end = () =>
    Alert.alert('¿Terminar el vivo?', lot ? 'El lote en el aire se cierra ahora.' : 'Tus compradores salen de la sala.', [
      { text: 'Seguir al aire', style: 'cancel' },
      {
        text: 'Terminar',
        style: 'destructive',
        onPress: async () => {
          cam.stop();
          await api.endStream(id).catch(() => {});
          router.back();
        },
      },
    ]);

  /** Sin cola: elegir a mano qué producto sale. */
  const pickProduct = async () => {
    const { products } = await api.products().catch(() => ({ products: [] as any[] }));
    const available = products.filter((p) => p.status !== 'sold');
    if (!available.length) return setError('No tenés productos disponibles. Creá uno desde Productos.');
    ActionSheetIOS.showActionSheetWithOptions(
      { title: '¿Qué vendés ahora?', options: [...available.map((p) => p.name), 'Cancelar'], cancelButtonIndex: available.length },
      (i) => i < available.length && run(() => api.openLot(id, available[i].id))
    );
  };

  const next = queue[0];
  const visible = messages.slice(-4);

  return (
    <View style={{ flex: 1, backgroundColor: '#2B2722' }}>
      <StatusBar style="light" />
      <LiveVideo track={cam.track} mirror={cam.facing === 'user'} />

      <View style={{ flex: 1, paddingTop: insets.top + 6 }}>
        {/* Arriba: estado, espectadores, terminar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }}>
          <LivePill label={onAir ? `AL AIRE · ${clock(elapsed)}` : 'PREPARANDO'} height={32} />
          <ViewersPill viewers={viewers} height={32} />
          <View style={{ flex: 1 }} />
          <Btn title="Terminar" tone="destructive" height={36} onPress={end} style={{ paddingHorizontal: 16 }} />
        </View>

        {/* Riel derecho */}
        {cam.status === 'live' && (
          <View style={{ position: 'absolute', right: 16, top: insets.top + 60, gap: 12 }}>
            <Circle icon="arrow.triangle.2.circlepath.camera" size={46} blur bg="rgba(0,0,0,.35)" color={C.white} onPress={cam.flip} label="Girar cámara" />
            <Circle
              icon={cam.muted ? 'mic.slash.fill' : 'mic.fill'} size={46} blur
              bg={cam.muted ? C.bid : 'rgba(0,0,0,.35)'} color={C.white} onPress={cam.toggleMute}
              label={cam.muted ? 'Activar micrófono' : 'Silenciar micrófono'}
            />
          </View>
        )}

        {/* Antes de salir al aire */}
        {!onAir && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
            <View style={{ backgroundColor: C.white, borderRadius: R.card, padding: 22, width: '100%', alignItems: 'center' }}>
              <Sym name="video.fill" size={30} color={C.bid} />
              <Text style={[T.title2, { marginTop: 10, textAlign: 'center' }]}>
                {liveAvailable === false ? (IN_EXPO_GO ? 'Video no disponible en Expo Go' : 'Falta configurar el video') : 'Necesitamos tu cámara'}
              </Text>
              <Text style={[T.subhead, { color: C.secondary, textAlign: 'center', marginTop: 6 }]}>
                {liveAvailable === false
                  ? `${IN_EXPO_GO ? 'Para transmitir hace falta una development build.' : 'El servidor no tiene LiveKit.'} Podés vender igual: la sala va a mostrar el bloque de color.`
                  : 'iOS te va a pedir permiso para la cámara y el micrófono. Se apagan cuando terminás.'}
              </Text>
              <ErrorLine message={cam.error} />
              {liveAvailable === false ? (
                <Btn title="Seguir sin video" tone="bid" onPress={() => setSkipVideo(true)} style={{ alignSelf: 'stretch', marginTop: 16 }} />
              ) : (
                <Btn
                  title={cam.status === 'error' ? 'Reintentar' : 'Salir al aire'}
                  tone="bid"
                  loading={cam.status === 'connecting' || liveAvailable === null}
                  onPress={cam.start}
                  style={{ alignSelf: 'stretch', marginTop: 16 }}
                />
              )}
            </View>
          </View>
        )}

        {onAir && <View style={{ flex: 1 }} />}

        {/* Chat superpuesto */}
        {onAir && (
          <View style={{ paddingHorizontal: 16, paddingRight: 80, gap: 6, marginBottom: 12 }}>
            {visible.map((m, i) => (
              <Text key={m.id} style={[styles.chat, { opacity: 0.45 + (0.55 * (i + 1)) / visible.length }]}>
                <Text style={{ fontWeight: '700', color: m.system ? C.bidLight : C.white }}>{m.handle}</Text> {m.text}
              </Text>
            ))}
          </View>
        )}

        {/* Panel claro */}
        {onAir && (
          <View style={[styles.panel, { marginBottom: Math.max(insets.bottom, 12) + 4 }]}>
            <BlurView intensity={60} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(250,247,242,.95)' }]} />
            <View style={{ padding: 18 }}>
              {lot ? (
                <LotPanel
                  lot={lot}
                  busy={busy}
                  onClose={() => run(() => api.closeLot(id))}
                  onExtend={() => run(() => api.extendLot(id, 30))}
                />
              ) : (
                <IdlePanel outcome={outcome} />
              )}

              <ErrorLine message={error} />

              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.separator, marginVertical: 14 }} />
              {next ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Placeholder color={next.grad} style={{ width: 38, height: 38 }} radius={10} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[T.footnote, T.num]}>SIGUE · {queue.length} en cola</Text>
                    <Text numberOfLines={1} style={[T.callout, { fontWeight: '600' }]}>{next.name}</Text>
                  </View>
                  <Btn
                    title={next.mode === 'fixed' ? 'Abrir oferta' : 'Iniciar subasta'}
                    tone={next.mode === 'fixed' ? 'tint' : 'bid'}
                    height={40}
                    disabled={!!lot}
                    loading={busy && !lot}
                    onPress={() => run(async () => { await api.nextInQueue(id); setOutcome(null); })}
                    style={{ paddingHorizontal: 16 }}
                  />
                </View>
              ) : (
                <Btn title="Elegir producto" tone="outline" height={40} disabled={!!lot} onPress={pickProduct} />
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function LotPanel({ lot, busy, onClose, onExtend }: { lot: any; busy: boolean; onClose: () => void; onExtend: () => void }) {
  const auction = lot.mode === 'auction';
  const urgent = auction && lot.timer <= 5;
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ModeChip mode={lot.mode} solid />
        <Text numberOfLines={1} style={[T.callout, { fontWeight: '600', flex: 1 }]}>{lot.productName}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={[{ fontSize: 32, fontWeight: '700', color: C.label, letterSpacing: -0.5 }, T.num]}>{bs(lot.price)}</Text>
          <Text style={[T.subhead, T.num, { color: C.secondary }]} numberOfLines={1}>
            {auction
              ? lot.leaderHandle ? `@${lot.leaderHandle} va ganando · ${lot.bids || 0} pujas` : 'Todavía sin pujas'
              : `${lot.sold} de ${lot.stock} vendidas · ${bs(lot.sold * lot.price)}`}
          </Text>
        </View>
        <Text style={[{ fontSize: 30, fontWeight: '600', color: urgent ? C.bidText : C.label }, T.num]}>
          {auction ? clock(lot.timer) : `${lot.stock - lot.sold} u.`}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Btn title={auction ? 'Cerrar lote' : 'Cerrar oferta'} tone="outline" height={46} flex disabled={busy} onPress={onClose} />
        {auction && <Btn title="+30 s" icon="plus" tone="tonal" height={46} flex disabled={busy} onPress={onExtend} />}
      </View>
    </>
  );
}

function IdlePanel({ outcome }: { outcome: any }) {
  if (!outcome) {
    return (
      <>
        <Text style={T.headline}>Estás al aire</Text>
        <Text style={[T.subhead, { color: C.secondary, marginTop: 4 }]}>Saludá a la sala y abrí el primer producto cuando quieras.</Text>
      </>
    );
  }
  const title = outcome.type === 'won' ? 'Lote vendido' : outcome.type === 'no_sale' ? 'Sin venta' : 'Oferta cerrada';
  const body =
    outcome.type === 'won' ? `@${outcome.winnerHandle} se llevó ${outcome.productName} por ${bs(outcome.price)}.`
      : outcome.type === 'no_sale' ? `La puja llegó a ${bs(outcome.price)} y tu mínimo era ${bs(outcome.min)}.`
        : `Vendiste ${outcome.sold} u. por ${bs(outcome.revenue)}.`;
  return (
    <>
      <Text style={[T.headline, { color: outcome.type === 'won' ? C.tintText : C.label }]}>{title}</Text>
      <Text style={[T.subhead, T.num, { color: C.secondary, marginTop: 4 }]}>{body}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  chat: {
    color: C.white, fontSize: 15, lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,.45)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  panel: { marginHorizontal: 10, borderRadius: R.dock, overflow: 'hidden' },
});
