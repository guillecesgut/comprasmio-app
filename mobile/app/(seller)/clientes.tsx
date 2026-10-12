import React from 'react';
import { View, Text, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api, realtime } from '@/api';
import { Screen, LargeTitle, Group, Row, Avatar, EmptyCard } from '@/ui';
import { initialsOf, shortTime } from '@/format';
import { C, T } from '@/theme';

/**
 * C8 · Clientes. El punto verde marca los hilos cuyo último mensaje es del
 * comprador (esperan respuesta): el servidor todavía no guarda "leído".
 */
export default function Clientes() {
  const [customers, setCustomers] = React.useState<any[] | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    const { customers } = await api.customers().catch(() => ({ customers: [] as any[] }));
    // Los hilos con actividad reciente primero.
    setCustomers([...customers].sort((a, b) => (b.lastMessage?.at || b.lastOrderAt).localeCompare(a.lastMessage?.at || a.lastOrderAt)));
  }, []);

  useFocusEffect(React.useCallback(() => { load(); }, [load]));
  React.useEffect(() => realtime.on('thread:new', load), [load]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.tint} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <LargeTitle title="Clientes" subtitle="Cada fila abre el chat con ese comprador" style={{ paddingTop: 52 }} />

      {customers !== null && customers.length === 0 ? (
        <EmptyCard title="Todavía no tenés clientes" body="Quien compre en tus vivos aparece acá con un chat directo." />
      ) : (
        <Group inset={72}>
          {(customers || []).map((c) => {
            const last = c.lastMessage;
            const waiting = last?.from === 'buyer';
            return (
              <Row
                key={c.id}
                minHeight={68}
                onPress={() => router.push(`/cliente/${c.id}`)}
                left={<Avatar initials={initialsOf(c.name)} size={44} />}
                title={
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text numberOfLines={1} style={[T.callout, { fontWeight: '600', flex: 1 }]}>@{c.handle}</Text>
                    <Text style={T.footnote}>{shortTime(last?.at || c.lastOrderAt)}</Text>
                  </View>
                }
                subtitle={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <Text numberOfLines={1} style={[T.subhead, { color: C.secondary, flex: 1 }]}>
                      {last ? `${last.from === 'seller' ? 'Vos: ' : ''}${last.text}` : `${c.orders} ${c.orders === 1 ? 'orden' : 'órdenes'}`}
                    </Text>
                    {waiting && <View accessibilityLabel="Espera respuesta" style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.tint }} />}
                  </View>
                }
              />
            );
          })}
        </Group>
      )}
    </Screen>
  );
}
