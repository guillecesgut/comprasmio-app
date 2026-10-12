import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { Room, RemoteTrack, LocalVideoTrack, VideoTrack } from 'livekit-client';
import { api } from './api';

/**
 * Port de `web/src/live.ts`. Igual que en la web, el video es opcional: sin
 * LiveKit configurado en el servidor, el estado queda en 'off' y la sala se
 * muestra con el bloque de color. Pujas, compras y chat van por el WebSocket.
 *
 * WebRTC es un módulo nativo que Expo Go no trae. Por eso LiveKit se carga
 * recién cuando hace falta y nunca dentro de Expo Go: ahí la app funciona
 * entera salvo el video. Para el video hace falta una development build.
 */
export type LiveStatus = 'off' | 'idle' | 'connecting' | 'live' | 'waiting' | 'error';

export const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type LiveKit = typeof import('livekit-client') & typeof import('@livekit/react-native');
let modules: LiveKit | null = null;

/** Carga diferida de LiveKit; solo se llama fuera de Expo Go. */
function lk(): LiveKit {
  if (!modules) {
    modules = { ...require('livekit-client'), ...require('@livekit/react-native') } as LiveKit;
  }
  return modules;
}

/** WebRTC para livekit-client: se llama una vez al arrancar (app/_layout). */
export function setupLive() {
  if (!IN_EXPO_GO) lk().registerGlobals();
}

const stopAudio = () => {
  if (!IN_EXPO_GO) lk().AudioSession.stopAudioSession();
};

export function useLiveAvailable() {
  const [available, setAvailable] = React.useState<boolean | null>(IN_EXPO_GO ? false : null);
  React.useEffect(() => {
    if (IN_EXPO_GO) return;
    api.config().then(({ live }) => setAvailable(live.configured)).catch(() => setAvailable(false));
  }, []);
  return available;
}

const friendlyError = (e: any) => {
  const msg = String(e?.message || '');
  if (/permission|denied|NotAllowed/i.test(msg))
    return 'Sin permiso de cámara o micrófono. Habilitalo en Ajustes → ComprasMío!.';
  if (e?.status === 503) return 'El video en vivo no está configurado en este servidor.';
  return msg || 'No pudimos conectar con el video.';
};

/** Video a pantalla completa. VideoView recibe el track de livekit-client. */
export function LiveVideo({ track, mirror, style }: { track: VideoTrack | null; mirror?: boolean; style?: StyleProp<ViewStyle> }) {
  if (!track || IN_EXPO_GO) return null;
  const { VideoView } = lk();
  return <VideoView videoTrack={track} objectFit="cover" mirror={mirror} style={StyleSheet.flatten([StyleSheet.absoluteFill, style])} />;
}

/* ----------------------------------------------------------- comprador --- */

export function useViewer(streamId: string, enabled: boolean) {
  const [status, setStatus] = React.useState<LiveStatus>('off');
  const [track, setTrack] = React.useState<VideoTrack | null>(null);

  React.useEffect(() => {
    if (!enabled || IN_EXPO_GO) return;
    const { Room, RoomEvent, Track, ConnectionState, AudioSession } = lk();
    let room: Room | null = null;
    let cancelled = false;

    const attach = (t: RemoteTrack) => {
      if (t.kind === Track.Kind.Video) {
        setTrack(t as VideoTrack);
        setStatus('live');
      }
      // El audio remoto suena solo en RN: no hace falta adjuntarlo a un elemento.
    };

    (async () => {
      setStatus('connecting');
      try {
        await AudioSession.startAudioSession();
        const grant = await api.liveToken(streamId);
        if (cancelled) return;

        room = new Room({ adaptiveStream: true });
        room.on(RoomEvent.TrackSubscribed, attach);
        room.on(RoomEvent.TrackUnsubscribed, (t) => {
          if (t.kind === Track.Kind.Video) {
            setTrack(null);
            setStatus('waiting');
          }
        });
        room.on(RoomEvent.ConnectionStateChanged, (state) => {
          if (state === ConnectionState.Disconnected) setStatus('waiting');
        });

        await room.connect(grant.url, grant.token);
        if (cancelled) return room.disconnect();

        const remoteVideo = [...room.remoteParticipants.values()]
          .flatMap((p) => [...p.trackPublications.values()])
          .find((pub) => pub.kind === Track.Kind.Video && pub.track);
        if (remoteVideo?.track) attach(remoteVideo.track as RemoteTrack);
        else setStatus('waiting');
      } catch {
        if (!cancelled) setStatus('off');
      }
    })();

    return () => {
      cancelled = true;
      room?.disconnect();
      stopAudio();
    };
  }, [streamId, enabled]);

  return { status, track };
}

/* ------------------------------------------------------------ vendedor --- */

export function useBroadcast(streamId: string) {
  const roomRef = React.useRef<Room | null>(null);
  const [status, setStatus] = React.useState<LiveStatus>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [muted, setMuted] = React.useState(false);
  const [facing, setFacing] = React.useState<'user' | 'environment'>('environment');
  const [track, setTrack] = React.useState<LocalVideoTrack | null>(null);

  const stop = React.useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setTrack(null);
    setStatus('idle');
    stopAudio();
  }, []);

  React.useEffect(() => stop, [stop]);

  const start = React.useCallback(async () => {
    if (IN_EXPO_GO) {
      setStatus('error');
      setError('El video no funciona en Expo Go. Usá una development build.');
      return;
    }
    const { Room, Track, AudioSession } = lk();
    setError(null);
    setStatus('connecting');
    try {
      const grant = await api.liveToken(streamId);
      if (grant.role !== 'broadcaster') throw new Error('Esta transmisión pertenece a otra cuenta de vendedor.');

      await AudioSession.startAudioSession();
      const room = new Room({ adaptiveStream: true, dynacast: true });
      await room.connect(grant.url, grant.token);
      roomRef.current = room;

      // Mostrando productos, la cámara trasera es la que tiene sentido.
      await room.localParticipant.setCameraEnabled(true, { facingMode: 'environment' });
      await room.localParticipant.setMicrophoneEnabled(true);

      const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
      setTrack((publication?.track as LocalVideoTrack) || null);
      setStatus('live');
    } catch (e: any) {
      setStatus('error');
      setError(friendlyError(e));
    }
  }, [streamId]);

  const toggleMute = React.useCallback(async () => {
    const participant = roomRef.current?.localParticipant;
    if (!participant) return;
    const next = !muted;
    await participant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [muted]);

  /** Cambia frontal/trasera sin cortar la publicación. */
  const flip = React.useCallback(async () => {
    if (!track) return;
    const next = facing === 'user' ? 'environment' : 'user';
    try {
      await track.restartTrack({ facingMode: next });
      setFacing(next);
    } catch {
      setError('Este dispositivo no permite cambiar de cámara.');
    }
  }, [facing, track]);

  return { status, error, muted, facing, track, start, stop, toggleMute, flip, setError };
}
