import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api';
import { useData } from '@/hooks';
import { shortTime } from '@/format';
import { NavBar, Group, Row, Avatar, Loading, EmptyCard } from '@/ui';
import { C, T } from '@/theme';

/** Mensajes del comprador: un hilo por tienda. */
export default function Mensajes() {
  const { data } = useData(() => api.threads().then((r) => r.threads), [], { events: ['thread:new'] });
  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Mensajes" />
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}>
        {!data ? <Loading /> : !data.length ? (
          <EmptyCard title="No tenés mensajes" body="Escribile a una tienda desde su perfil o desde un pedido." />
        ) : (
          <Group inset={72}>
            {data.map((t: any) => (
              <Row key={t.sellerId} minHeight={64} onPress={() => router.push(`/chat/${t.sellerId}`)}
                left={<Avatar initials={t.initials} bg={t.color} size={44} />}
                title={<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[T.headline, { flex: 1 }]} numberOfLines={1}>{t.name}</Text>
                  <Text style={T.footnote}>{shortTime(t.lastAt)}</Text>
                </View>}
                subtitle={t.lastText}
                right={t.unread ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.tint }} /> : undefined} />
            ))}
          </Group>
        )}
      </ScrollView>
    </View>
  );
}
