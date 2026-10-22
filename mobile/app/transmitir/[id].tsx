import React from 'react';
import { View, Text, StyleSheet, Alert, AppState } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, bs, clock, realtime } from '@/api';
import { useBroadcast, useLiveAvailable, LiveVideo, IN_EXPO_GO } from '@/live';
import { useElapsed } from '@/format';
import { Circle, Btn, ModeChip, Img, Sym, LivePill, ViewersPill, ErrorLine, Press } from '@/ui';
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
          await api.seller_.endStream(id).catch(() => {});
          router.replace(`/transmitir/fin/${id}`);
        },
      },
    ]);

  // Lo que falta salir: si el lote al aire es la unidad 1 de 3, quedan las otras 2 de esa misma fila.
  const pending = queue.filter((q) => q.status !== 'done' && (q.status === 'on_air' ? q.mode === 'subasta' && q.remaining > 1 : q.remaining > 0));
  const next = pending[0];
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
                  onClose={() => run(() => api.seller_.closeLot(id))}
                  onExtend={() => run(() => api.seller_.extend(id, 30))}
                />
              ) : (
                <IdlePanel outcome={outcome} />
              )}

              <ErrorLine message={error} />

              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.separator, marginVertical: 14 }} />
              {next ? (
                <Press onPress={() => router.push(`/vivo/catalogo/${id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Img url={next.photoUrl} color={next.color} style={{ width: 38, height: 38 }} radius={10} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[T.footnote, T.num]}>SIGUE · {pending.length} en cola</Text>
                    <Text numberOfLines={1} style={[T.callout, { fontWeight: '600' }]}>{next.title}{next.kind === 'paquete' ? ' · Paquete' : next.label ? ` · ${next.label}` : ''}</Text>
                  </View>
                  {/* "Iniciar subasta" queda al 40 % mientras hay lote: el siguiente nunca arranca solo. */}
                  <Btn
                    title={next.mode === 'fijo' ? 'Abrir oferta' : 'Iniciar subasta'}
                    tone={next.mode === 'fijo' ? 'tint' : 'bid'}
                    height={40}
                    disabled={!!lot}
                    loading={busy && !lot}
                    onPress={() => run(async () => { await api.seller_.openNext(id); setOutcome(null); })}
                    style={{ paddingHorizontal: 16 }}
                  />
                </Press>
              ) : (
                <View style={{ gap: 8 }}>
                  <Text style={[T.subhead, { color: C.secondary }]}>No quedan lotes en la cola.</Text>
                  {!lot && <Btn title="Terminar y ver el resumen" tone="outline" height={40} onPress={end} />}
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function LotPanel({ lot, busy, onClose, onExtend }: { lot: any; busy: boolean; onClose: () => void; onExtend: () => void }) {
  const auction = lot.mode === 'subasta';
  const bundle = lot.kind === 'paquete';
  const urgent = auction && lot.timer <= 5;
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ModeChip mode={bundle ? 'paquete' : lot.mode} solid />
        <Text numberOfLines={1} style={[T.callout, { fontWeight: '600', flex: 1 }]}>{lot.title}{lot.label && !bundle ? ` · ${lot.label}` : ''}</Text>
        {auction && <Text style={[T.footnote, T.num]}>{bundle ? lot.label : lot.unitTotal > 1 ? `Unidad ${lot.unitIndex} de ${lot.unitTotal}` : lot.lotNo}</Text>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={[{ fontSize: 32, fontWeight: '700', color: C.label, letterSpacing: -0.5 }, T.num]}>{bs(lot.price)}</Text>
          <Text style={[T.subhead, T.num, { color: C.secondary }]} numberOfLines={1}>
            {auction
              ? lot.leaderHandle ? `@${lot.leaderHandle} va ganando · ${lot.bids} ${lot.bids === 1 ? 'puja' : 'pujas'}` : 'Todavía sin pujas'
              : `${lot.sold} de ${lot.stock} vendidas · ${bs(lot.sold * lot.price)}`}
          </Text>
        </View>
        <Text style={[{ fontSize: 30, fontWeight: '600', color: urgent ? C.bidText : C.label }, T.num]}>
          {auction ? clock(lot.timer) : `${lot.left} u.`}
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
    outcome.type === 'won' ? `@${outcome.winnerHandle} se llevó ${outcome.title} por ${bs(outcome.price)}.`
      : outcome.type === 'no_sale' ? (outcome.hadBids ? `La puja llegó a ${bs(outcome.price)} y tu mínimo era ${bs(outcome.min)}. La unidad vuelve a tu catálogo al terminar.` : 'Nadie pujó. La unidad vuelve a tu catálogo al terminar.')
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
