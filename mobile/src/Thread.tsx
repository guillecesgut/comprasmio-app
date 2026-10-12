import React from 'react';
import { View, Text, TextInput, FlatList, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, bs, realtime } from './api';
import { Circle, Avatar, Placeholder, StatusChip, ErrorLine } from './ui';
import { C, T, R } from './theme';

/**
 * Hilo comprador ↔ vendedor (B7 y su vista desde Clientes). Es una sola
 * charla continua por par comprador-vendedor, no una por compra.
 */
export function Thread({ title, initials, avatarBg, side, orderId, fetchThread, sendMessage, belongs, placeholder }: {
  title: string;
  initials: string;
  avatarBg?: string;
  /** Quién soy en este hilo: mis burbujas van a la derecha, en verde. */
  side: 'buyer' | 'seller';
  orderId?: string;
  fetchThread: () => Promise<{ thread: any[] }>;
  sendMessage: (text: string) => Promise<{ message: any }>;
  /** Si un mensaje que llega por el socket es de este hilo. */
  belongs: (message: any) => boolean;
  placeholder: string;
}) {
  const insets = useSafeAreaInsets();
  const [thread, setThread] = React.useState<any[] | null>(null);
  const [order, setOrder] = React.useState<any>(null);
  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const list = React.useRef<FlatList>(null);
  const belongsRef = React.useRef(belongs);
  belongsRef.current = belongs;

  React.useEffect(() => {
    fetchThread().then(({ thread }) => setThread(thread)).catch((e) => { setError(e.message); setThread([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (orderId) api.order(orderId).then(({ order }) => setOrder(order)).catch(() => {});
    const offs = [
      realtime.on('thread:new', ({ message }) => {
        if (!belongsRef.current(message)) return;
        setThread((t) => (t?.some((m) => m.id === message.id) ? t : [...(t || []), message]));
      }),
      realtime.on('order:update', ({ order: updated }) => setOrder((o: any) => (o && o.id === updated.id ? updated : o))),
    ];
    return () => offs.forEach((off) => off());
  }, [orderId]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      const { message } = await sendMessage(text);
      setThread((t) => (t?.some((m) => m.id === message.id) ? t : [...(t || []), message]));
    } catch (e: any) {
      setDraft(text);
      setError(e.message);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.white }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.nav(insets.top)}>
        <Circle icon="chevron.backward" bg={C.fill2} onPress={() => router.back()} label="Volver" />
        <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
          <Avatar initials={initials} size={32} bg={avatarBg} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.label }} numberOfLines={1}>{title}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {order && (
        <View style={styles.pinned}>
          <Placeholder color={order.grad} style={{ width: 40, height: 40 }} radius={10} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[{ fontSize: 15, fontWeight: '600', color: C.label }, T.num]}>{order.productName} · {bs(order.total)}</Text>
            <Text style={T.footnote}>{order.ref}</Text>
          </View>
          <StatusChip status={order.status} />
        </View>
      )}

      <FlatList
        ref={list}
        data={thread || []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
        keyboardDismissMode="interactive"
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          thread === null ? null : (
            <Text style={[T.subhead, { color: C.secondary, textAlign: 'center', marginTop: 40 }]}>Todavía no hay mensajes. Escribí para coordinar la entrega.</Text>
          )
        }
        renderItem={({ item }) => {
          const mine = item.from === side;
          return (
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={{ fontSize: 16, lineHeight: 21, color: mine ? C.white : C.label }}>{item.text}</Text>
            </View>
          );
        }}
      />
      <View style={{ paddingHorizontal: 16 }}><ErrorLine message={error} /></View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10) }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={C.tertiary}
          multiline
          maxLength={500}
          style={styles.input}
          accessibilityLabel="Mensaje"
        />
        <View style={{ opacity: draft.trim() ? 1 : 0.4 }}>
          <Circle icon="arrow.up" size={40} bg={C.tint} color={C.white} onPress={send} label="Enviar mensaje" />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = {
  nav: (top: number) => ({
    paddingTop: top + 6, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row' as const, alignItems: 'center' as const,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.separator,
  }),
  pinned: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, margin: 12, padding: 10,
    borderRadius: R.card, backgroundColor: C.groupedBg,
  },
  bubble: { maxWidth: '76%' as const, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  mine: { alignSelf: 'flex-end' as const, backgroundColor: C.tint },
  theirs: { alignSelf: 'flex-start' as const, backgroundColor: '#EFEBE4' },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, borderWidth: 1, borderColor: C.separator,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 16, color: C.label,
  },
};
