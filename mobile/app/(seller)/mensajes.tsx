import React from 'react';
import { View, Text, TextInput, RefreshControl, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api';
import { useData } from '@/hooks';
import { shortTime } from '@/format';
import { Screen, LargeTitle, Group, Row, Avatar, StatusChip, Sym, EmptyCard, Loading } from '@/ui';
import { C, T, R } from '@/theme';

/** C8 · Mensajes del vendedor: un hilo por comprador con su último pedido. */
export default function Mensajes() {
  const [q, setQ] = React.useState('');
  const [query, setQuery] = React.useState('');
  React.useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { data, loading, reload } = useData(() => api.seller_.threads(query || undefined).then((r) => r.threads), [query], { events: ['thread:new'] });

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} />}>
      <LargeTitle title="Mensajes" />
      <View style={styles.search}>
        <Sym name="magnifyingglass" size={16} color={C.secondary} />
        <TextInput value={q} onChangeText={setQ} placeholder="Buscar comprador o pedido" placeholderTextColor={C.secondary} style={{ flex: 1, fontSize: 16, color: C.label }} />
      </View>
      {!data ? <Loading /> : !data.length ? (
        <EmptyCard title="Sin mensajes" body="Cuando un comprador te escriba o te compre, la conversación aparece acá." />
      ) : (
        <Group inset={72}>
          {data.map((t: any) => (
            <Row key={t.buyerId} minHeight={72} onPress={() => router.push(`/vendedor/mensajes/${t.buyerId}`)}
              left={<Avatar initials={t.initials} size={44} />}
              title={<View style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={[T.headline, { flex: 1 }]} numberOfLines={1}>@{t.handle}</Text>
                <Text style={T.footnote}>{shortTime(t.lastAt)}</Text>
              </View>}
              subtitle={<View style={{ gap: 4, marginTop: 2 }}>
                <Text style={T.footnote} numberOfLines={1}>{t.lastFromMe ? 'Vos: ' : ''}{t.lastText}</Text>
                {t.order && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[T.footnote, { fontSize: 12 }]}>{t.order.ref}</Text><StatusChip status={t.order.status} />
                </View>}
              </View>}
              right={t.unread ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.tint }} /> : undefined} />
          ))}
        </Group>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { height: 40, borderRadius: R.pill, backgroundColor: C.fill, marginHorizontal: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
});
