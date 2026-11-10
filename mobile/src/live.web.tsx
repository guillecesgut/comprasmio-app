import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { Room, RoomEvent, Track, ConnectionState, type RemoteTrack, type LocalVideoTrack, type VideoTrack } from 'livekit-client';
import { api } from './api';

/**
 * Versión para navegador de `live.tsx` (Metro la elige sola en web por la
 * extensión `.web.tsx`). Misma interfaz: las pantallas no cambian.
 * Aquí WebRTC ya viene en el navegador, así que se usa livekit-client directo
 * y el video se pinta en un <video>. Requiere HTTPS (o localhost) para la cámara.
 */
export type LiveStatus = 'off' | 'idle' | 'connecting' | 'live' | 'waiting' | 'error';

/** En el navegador sí hay WebRTC: el video funciona. */
export const IN_EXPO_GO = false;

export function setupLive() {}

export function useLiveAvailable() {
  const [available, setAvailable] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    api.config().then(({ live }) => setAvailable(live.configured)).catch(() => setAvailable(false));
  }, []);
  return available;
}

const friendlyError = (e: any) => {
  const msg = String(e?.message || '');
  if (/permission|denied|NotAllowed/i.test(msg))
    return 'Sin permiso de cámara o micrófono. Habilitalo en los permisos del navegador.';
  if (/secure|https/i.test(msg)) return 'La cámara solo funciona en una dirección segura (HTTPS).';
  if (e?.status === 503) return 'El video en vivo no está configurado en este servidor.';
  return msg || 'No pudimos conectar con el video.';
};

/** Video a pantalla completa en un elemento <video>. */
export function LiveVideo({ track, mirror, style }: { track: VideoTrack | null; mirror?: boolean; style?: StyleProp<ViewStyle> }) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  if (!track) return null;
  return React.createElement('video', {
    ref,
    autoPlay: true,
    playsInline: true, // iOS Safari: sin esto abre el video a pantalla completa
    muted: true, // el audio va por un <audio> aparte; así el video siempre arranca
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: mirror ? 'scaleX(-1)' : undefined,
      ...(style as object),
    },
  });
}

/* ----------------------------------------------------------- comprador --- */

export function useViewer(streamId: string, enabled: boolean) {
  const [status, setStatus] = React.useState<LiveStatus>('off');
  const [track, setTrack] = React.useState<VideoTrack | null>(null);

  React.useEffect(() => {
    if (!enabled) return;
    let room: Room | null = null;
    let cancelled = false;
    const audioEls: HTMLMediaElement[] = [];

    const attach = (t: RemoteTrack) => {
      if (t.kind === Track.Kind.Video) {
        setTrack(t as VideoTrack);
        setStatus('live');
      } else if (t.kind === Track.Kind.Audio) {
        audioEls.push(t.attach() as HTMLMediaElement);
      }
    };

    (async () => {
      setStatus('connecting');
      try {
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
        // La entrada a la sala fue un toque del usuario: el navegador permite sonido.
        await room.startAudio().catch(() => {});

        const remote = [...room.remoteParticipants.values()].flatMap((p) => [...p.trackPublications.values()]);
        remote.filter((pub) => pub.track).forEach((pub) => attach(pub.track as RemoteTrack));
        if (!remote.some((pub) => pub.kind === Track.Kind.Video && pub.track)) setStatus('waiting');
      } catch {
        if (!cancelled) setStatus('off');
      }
    })();

    return () => {
      cancelled = true;
      room?.disconnect();
      audioEls.forEach((el) => el.remove());
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
  }, []);

  React.useEffect(() => stop, [stop]);

  const start = React.useCallback(async () => {
    setError(null);
    setStatus('connecting');
    try {
      const grant = await api.liveToken(streamId);
      if (grant.role !== 'broadcaster') throw new Error('Esta transmisión pertenece a otra cuenta de vendedor.');

      const room = new Room({ adaptiveStream: true, dynacast: true });
      await room.connect(grant.url, grant.token);
      roomRef.current = room;

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
