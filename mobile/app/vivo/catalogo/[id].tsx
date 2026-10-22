import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, realtime } from '@/api';
import { queueSub } from '@/queue';
import { SheetHeader, Img, ModeChip, Loading } from '@/ui';
import { C, T } from '@/theme';

/** B4 · Catálogo del vivo (hoja ½): variantes y paquetes en el orden de salida. */
export default function CatalogoVivo() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const [queue, setQueue] = React.useState<any[] | null>(null);

  React.useEffect(() => {
    api.stream(id).then((r) => setQueue(r.queue)).catch(() => setQueue([]));
    const off = realtime.subscribe(`stream:${id}`);
    const stop = realtime.on('queue:update', (p) => p.streamId === id && setQueue(p.queue));
    return () => { off(); stop(); };
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <SheetHeader title="Catálogo del vivo" subtitle={queue ? `${queue.length} ${queue.length === 1 ? 'lote' : 'lotes'}` : undefined} onClose={() => router.back()} />
      {!queue ? <Loading /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {queue.map((r) => {
            const onAir = r.status === 'on_air';
            return (
              <View key={r.reservationId} style={[styles.row, onAir && { backgroundColor: '#FBF3EC' }, r.status === 'done' && { opacity: 0.55 }]}>
                <Text style={[T.footnote, T.num, { width: 22 }]}>{r.position}</Text>
                <Img url={r.photoUrl} color={r.color} radius={10} style={{ width: 48, height: 48 }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={T.headline} numberOfLines={1}>{r.title}</Text>
                  {r.label && <Text style={T.footnote} numberOfLines={1}>{r.label}</Text>}
                  <Text style={[T.footnote, T.num, { color: onAir ? C.bidText : C.secondary, fontWeight: onAir ? '600' : '400' }]}>{queueSub(r)}</Text>
                </View>
                <ModeChip mode={r.kind === 'paquete' ? 'paquete' : r.mode} />
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.rowSeparator },
});
