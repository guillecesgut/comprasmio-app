import React from 'react';
import { View, Text, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api, realtime } from '@/api';
import { useSession } from '@/session';
import { Screen, LargeTitle, Group, Row, Avatar, SectionHeader, EmptyCard, Press, thousands } from '@/ui';
import { C, T, R } from '@/theme';

/**
 * B8 · Favoritos. Hoy el servidor guarda favoritos por transmisión y solo
 * expone las que están en vivo, así que la sección "Sin transmisión" del
 * handoff (con "Próximo vivo") queda para cuando exista ese dato.
 */
export default function Favoritos() {
  const { favorites } = useSession();
  const [streams, setStreams] = React.useState<any[] | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    const { streams } = await api.streams('all').catch(() => ({ streams: [] as any[] }));
    setStreams(streams);
  }, []);

  useFocusEffect(React.useCallback(() => { load(); }, [load]));

  React.useEffect(() => {
    const off = realtime.subscribe('feed');
    const stop = realtime.on('stream:ended', ({ streamId }) => setStreams((s) => s?.filter((x) => x.id !== streamId) ?? s));
    return () => { off(); stop(); };
  }, []);

  const live = (streams || []).filter((s) => favorites.includes(s.id));
  const offline = favorites.length - live.length;

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.tint} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <LargeTitle title="Favoritos" subtitle="Los vendedores que seguís" style={{ paddingTop: 52 }} />

      {streams !== null && favorites.length === 0 ? (
        <EmptyCard title="Sin favoritos todavía" body="Tocá el corazón en cualquier vivo para tenerlo a mano acá." />
      ) : (
        <>
          {live.length > 0 && (
            <>
              <SectionHeader title="En vivo ahora" color={C.bidText} style={{ paddingTop: 8 }} />
              <Group inset={78}>
                {live.map((stream) => (
                  <Row
                    key={stream.id}
                    minHeight={74}
                    onPress={() => router.push(`/vivo/${stream.id}`)}
                    left={<Avatar initials={stream.seller?.initials || '?'} size={50} bg={stream.grad || C.forest} ring={C.bid} />}
                    title={<Text numberOfLines={1} style={[T.callout, { fontWeight: '600' }]}>{stream.seller?.name}</Text>}
                    subtitle={
                      <Text numberOfLines={1} style={[{ fontSize: 13, color: C.bidText, marginTop: 2 }, T.num]}>
                        {stream.title} · {thousands(stream.viewers)}
                      </Text>
                    }
                    right={
                      <Press onPress={() => router.push(`/vivo/${stream.id}`)} style={{ backgroundColor: C.bid, borderRadius: R.pill, paddingHorizontal: 14, height: 32, justifyContent: 'center' }}>
                        <Text style={{ color: C.white, fontWeight: '600', fontSize: 14 }}>Entrar</Text>
                      </Press>
                    }
                  />
                ))}
              </Group>
            </>
          )}
          {offline > 0 && (
            <>
              <SectionHeader title="Sin transmisión" />
              <View style={{ backgroundColor: C.surface, borderRadius: R.card, marginHorizontal: 16, padding: 16 }}>
                <Text style={[T.subhead, { color: C.secondary }]}>
                  {offline === 1 ? 'Un vivo que seguís terminó.' : `${offline} vivos que seguís terminaron.`} Te avisamos acá cuando vuelvan.
                </Text>
              </View>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
