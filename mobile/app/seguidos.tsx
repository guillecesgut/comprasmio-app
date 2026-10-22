import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api';
import { useData } from '@/hooks';
import { whenLabel } from '@/format';
import { NavBar, Group, Row, Avatar, Img, Btn, Sym, Loading, EmptyCard, SectionHeader } from '@/ui';
import { C } from '@/theme';

/** D15 · Vendedores que sigo: en vivo arriba; campana para avisos de cada tienda. */
export default function Seguidos() {
  const { data, setData } = useData(() => api.following().then((r) => r.sellers), [], { events: ['stream:started', 'stream:ended'] });
  const list: any[] = data || [];
  const live = list.filter((s) => s.live);

  const toggleNotify = async (s: any) => {
    setData((l: any) => l.map((x: any) => (x.id === s.id ? { ...x, notify: !x.notify } : x)));
    await api.setFollowNotify(s.id, !s.notify).catch(() => {});
  };
  const avatar = (s: any, ring?: string) =>
    s.avatarUrl ? <Img url={s.avatarUrl} radius={22} style={{ width: 44, height: 44 }} /> : <Avatar initials={s.initials} bg={s.color} size={44} ring={ring} />;

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Vendedores que sigo" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {!data ? <Loading /> : !list.length ? (
          <View style={{ marginTop: 16 }}><EmptyCard title="Todavía no seguís a ninguna tienda" body="Seguí tiendas para enterarte de sus vivos y novedades." /></View>
        ) : (
          <>
            {live.length > 0 && (
              <>
                <SectionHeader title="En vivo ahora" color={C.bidText} style={{ paddingTop: 8 }} />
                <Group>
                  {live.map((s) => (
                    <Row key={s.id} left={avatar(s, C.bid)} title={s.name} subtitle={s.live.title}
                      right={<Btn title="Entrar" tone="bid" height={34} onPress={() => router.push(`/vivo/${s.live.streamId}`)} />} />
                  ))}
                </Group>
              </>
            )}
            <SectionHeader title="Siguiendo" style={live.length ? undefined : { paddingTop: 8 }} />
            <Group>
              {list.map((s) => (
                <Row key={s.id} left={avatar(s)} title={s.name} onPress={() => router.push(`/tienda/${s.slug}`)}
                  subtitle={s.live ? 'En vivo ahora' : s.nextLiveAt ? `Próximo vivo: ${whenLabel(s.nextLiveAt)}` : 'Solo catálogo'}
                  right={
                    <Pressable onPress={() => toggleNotify(s)} hitSlop={8} accessibilityLabel={s.notify ? 'Desactivar avisos' : 'Activar avisos'}
                      style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: s.notify ? '#E4F0EA' : C.fill2 }}>
                      <Sym name={s.notify ? 'bell.fill' : 'bell.slash'} size={16} color={s.notify ? C.tintText : C.secondary} />
                    </Pressable>
                  } />
              ))}
            </Group>
          </>
        )}
      </ScrollView>
    </View>
  );
}
