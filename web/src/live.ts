import React from 'react';
import { Room, RoomEvent, Track, ConnectionState, type RemoteTrack } from 'livekit-client';
import { api } from './api';

export type LiveStatus = 'off' | 'idle' | 'connecting' | 'live' | 'waiting' | 'error';

/**
 * El video es opcional en toda la plataforma: si el servidor no tiene LiveKit
 * configurado, el estado queda en 'off' y la interfaz muestra el bloque de color.
 * Nada más deja de funcionar — pujas, compras y chat van por el WebSocket propio.
 */
export function useLiveAvailable() {
  const [available, setAvailable] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    api.config()
      .then(({ live }) => setAvailable(live.configured))
      .catch(() => setAvailable(false));
  }, []);
  return available;
}

const friendlyError = (e: any) => {
  const name = e?.name || '';
  if (name === 'NotAllowedError')
    return 'Bloqueaste el permiso de cámara. Habilitalo desde el candado en la barra de direcciones.';
  if (name === 'NotFoundError') return 'No encontramos ninguna cámara conectada.';
  if (name === 'NotReadableError') return 'Otra aplicación está usando la cámara. Cerrala y probá de nuevo.';
  if (e?.message?.includes('503') || e?.status === 503)
    return 'El video en vivo no está configurado en este servidor.';
  return e?.message || 'No pudimos conectar con el video.';
};

/* ------------------------------------------------------------ vendedor --- */

export function useBroadcast(streamId: string) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const roomRef = React.useRef<Room | null>(null);
  const [status, setStatus] = React.useState<LiveStatus>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [muted, setMuted] = React.useState(false);
  const [facing, setFacing] = React.useState<'user' | 'environment'>('environment');

  const stop = React.useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setStatus('idle');
  }, []);

  React.useEffect(() => stop, [stop]);

  const start = React.useCallback(async () => {
    setError(null);
    setStatus('connecting');
    try {
      const grant = await api.liveToken(streamId);
      if (grant.role !== 'broadcaster')
        throw new Error('Esta transmisión pertenece a otra cuenta de vendedor.');

      const room = new Room({ adaptiveStream: true, dynacast: true });
      await room.connect(grant.url, grant.token);
      roomRef.current = room;

      // El permiso del navegador se pide acá, con un gesto del usuario de por medio.
      // setCameraEnabled (a diferencia de enableCameraAndMicrophone) sí acepta
      // facingMode, que es lo que decide frontal vs. trasera. Para este tipo de
      // transmisión — mostrando productos — la trasera es la que tiene sentido.
      await room.localParticipant.setCameraEnabled(true, { facingMode: 'environment' });
      await room.localParticipant.setMicrophoneEnabled(true);

      const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (publication?.track && videoRef.current) publication.track.attach(videoRef.current);

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

  /** Cambiar entre cámara frontal y trasera sin cortar la publicación. */
  const flip = React.useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = facing === 'user' ? 'environment' : 'user';
    const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = publication?.track;
    if (!track) return;
    try {
      // restartTrack reemplaza el dispositivo de captura sin cortar la publicación:
      // el comprador del otro lado no ve un corte, solo el cambio de encuadre.
      await track.restartTrack({ facingMode: next });
      setFacing(next);
    } catch {
      setError('Este dispositivo no permite cambiar de cámara.');
    }
  }, [facing]);

  return { videoRef, status, error, muted, start, stop, toggleMute, flip, setError };
}

/* ----------------------------------------------------------- comprador --- */

export function useViewer(streamId: string, enabled: boolean) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [status, setStatus] = React.useState<LiveStatus>('off');

  React.useEffect(() => {
    if (!enabled) return;
    let room: Room | null = null;
    let cancelled = false;

    const attach = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video && videoRef.current) {
        track.attach(videoRef.current);
        setStatus('live');
      }
      if (track.kind === Track.Kind.Audio) track.attach();
    };

    (async () => {
      setStatus('connecting');
      try {
        const grant = await api.liveToken(streamId);
        if (cancelled) return;

        room = new Room({ adaptiveStream: true });
        room.on(RoomEvent.TrackSubscribed, attach);
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach();
          setStatus('waiting');
        });
        room.on(RoomEvent.ConnectionStateChanged, (state) => {
          if (state === ConnectionState.Disconnected) setStatus('waiting');
        });

        await room.connect(grant.url, grant.token);
        if (cancelled) return room.disconnect();

        // Si el vendedor todavía no publicó, esperamos en lugar de mostrar error.
        const hasVideo = [...room.remoteParticipants.values()].some((p) =>
          [...p.trackPublications.values()].some((pub) => pub.kind === Track.Kind.Video)
        );
        setStatus(hasVideo ? 'live' : 'waiting');
      } catch {
        // Sin video la sala sigue siendo usable: se puja y se compra igual.
        if (!cancelled) setStatus('off');
      }
    })();

    return () => {
      cancelled = true;
      room?.disconnect();
    };
  }, [streamId, enabled]);

  return { videoRef, status };
}
