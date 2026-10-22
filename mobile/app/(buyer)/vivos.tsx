import React from 'react';
import { View, Text, RefreshControl, Pressable } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api';
import { useData } from '@/hooks';
import { whenLabel } from '@/format';
import { Screen, LargeTitle, Segmented, Group, Row, Avatar, Sym, Img, LivePill, ViewersPill, ModeChip, Press, EmptyCard, SectionHeader } from '@/ui';
import { LinearGradientLike } from '@/Shade';
import { LiveCard } from '@/LiveCard';
import { C, T, R } from '@/theme';

type Filter = 'todo' | 'subasta' | 'fijo';

/** B1 · Vivos: destacado, filtro por modo, próximos vivos de los que sigo y grilla "Para vos". */
export default function Vivos() {
  const [filter, setFilter] = React.useState<Filter>('todo');
  const live = useData(() => api.streams(filter === 'todo' ? undefined : filter), [filter], { events: ['stream:started', 'stream:ended', 'stream:update'] });
  const upcoming = useData(() => api.upcoming().then((r) => r.streams), []);
  const streams: any[] = live.data?.streams || [];
  const [hero, ...rest] = streams;

  const toggleNotify = async (s: any) => {
    upcoming.setData((l: any) => l.map((x: any) => (x.id === s.id ? { ...x, notify: !x.notify } : x)));
    await api.setFollowNotify(s.seller.id, !s.notify).catch(() => upcoming.reload());
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={live.loading && !!live.data} onRefresh={() => { live.reload(); upcoming.reload(); }} />}>
      <LargeTitle title="Vivos" />
      <Segmented style={{ marginHorizontal: 16 }} value={filter} onChange={setFilter}
        options={[{ key: 'todo', label: 'Todo' }, { key: 'subasta', label: 'Subastas' }, { key: 'fijo', label: 'Precio fijo' }]} />

      {hero && (
        <Press onPress={() => router.push(`/vivo/${hero.id}`)} style={{ marginHorizontal: 16, marginTop: 16 }} accessibilityLabel={`${hero.seller.name} en vivo`}>
          <Img url={hero.photoUrl} color={hero.color} radius={26} style={{ height: 230 }}>
            <LinearGradientLike />
            <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 8 }}>
              <LivePill /><ViewersPill viewers={hero.viewers} />
            </View>
            <View style={{ position: 'absolute', left: 16, right: 16, bottom: 14, gap: 6 }}>
              <ModeChip mode={hero.mode} solid />
              <Text style={{ color: C.white, fontSize: 22, fontWeight: '700' }} numberOfLines={2}>{hero.title}</Text>
              <Text style={{ color: 'rgba(255,255,255,.85)', fontSize: 14 }}>{hero.seller.name} · ★ {hero.seller.ratingPct ?? 100} %</Text>
            </View>
          </Img>
        </Press>
      )}

      {(upcoming.data || []).length > 0 && (
        <>
          <SectionHeader title="Próximos vivos de los que seguís" />
          <Group>
            {upcoming.data.map((s: any) => (
              <Row key={s.id} left={<Avatar initials={s.seller.initials} bg={s.seller.color} size={40} />} title={s.seller.name}
                subtitle={`${whenLabel(s.at)} · ${s.title}`}
                right={
                  <Pressable onPress={() => toggleNotify(s)} hitSlop={8} accessibilityLabel={s.notify ? 'Desactivar aviso' : 'Avisarme'}
                    style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: s.notify ? '#E4F0EA' : C.fill2 }}>
                    <Sym name={s.notify ? 'bell.fill' : 'bell'} size={16} color={s.notify ? C.tintText : C.label} />
                  </Pressable>
                } />
            ))}
          </Group>
        </>
      )}

      {rest.length > 0 && (
        <>
          <Text style={[T.title2, { paddingHorizontal: 20, marginTop: 24, marginBottom: 12 }]}>Para vos</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 }}>
            {rest.map((s) => <View key={s.id} style={{ width: '47.8%' }}><LiveCard stream={s} /></View>)}
          </View>
        </>
      )}

      {live.data && !streams.length && (
        <View style={{ marginTop: 24 }}>
          <EmptyCard title="Nadie está transmitiendo ahora" body="Seguí a tus tiendas favoritas y te avisamos cuando salgan al aire." />
        </View>
      )}
    </Screen>
  );
}
