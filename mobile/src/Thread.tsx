import React from 'react';
import { View, Text, TextInput, FlatList, KeyboardAvoidingView, Platform, StyleSheet, ActionSheetIOS } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, bs, realtime } from './api';
import { useSession } from './session';
import { Circle, Avatar, Img, StatusChip, ErrorLine, Press, useToast } from './ui';
import { C, T, R } from './theme';

/**
 * Hilo comprador ↔ vendedor (B7 y su vista desde C8): una sola charla por par, con
 * el último pedido fijado arriba (abre D11 o E6). Long-press: Reportar · Bloquear.
 */
export function Thread({ side, buyerId, sellerId, orderId }: { side: 'buyer' | 'seller'; buyerId?: string; sellerId?: string; orderId?: string }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { toggleBlock, user } = useSession();
  const [data, setData] = React.useState<any>(null);
  const [messages, setMessages] = React.useState<any[] | null>(null);
  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const list = React.useRef<FlatList>(null);

  const load = React.useCallback(() => {
    const req = side === 'buyer' ? api.threadWithSeller(sellerId!, orderId) : api.seller_.threadWithBuyer(buyerId!, orderId);
    req.then((d) => { setData(d); setMessages(d.messages); }).catch((e) => { setError(e.message); setMessages([]); });
  }, [side, buyerId, sellerId, orderId]);

  React.useEffect(() => {
    load();
    const offs = [
      realtime.on('thread:new', ({ message }) => {
        const b = message.buyerId || message.buyer_id;
        const s = message.sellerId || message.seller_id;
        const mine = side === 'buyer' ? s === sellerId : b === buyerId;
        if (!mine) return;
        const m = { ...message, sender: message.sender, at: message.at };
        setMessages((l) => (l?.some((x) => x.id === m.id) ? l : [...(l || []), m]));
      }),
      realtime.on('order:update', () => load()),
    ];
    return () => offs.forEach((off) => off());
  }, [load, side, buyerId, sellerId]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      const { message } = side === 'buyer'
        ? await api.messageSeller(sellerId!, text, data?.order?.id)
        : await api.seller_.messageBuyer(buyerId!, text, data?.order?.id);
      setMessages((l) => (l?.some((x) => x.id === message.id) ? l : [...(l || []), message]));
    } catch (e: any) {
      setDraft(text);
      setError(e.message);
    }
  };

  const other = side === 'buyer' ? data?.seller : data?.buyer;
  const otherHandle = side === 'seller' ? data?.buyer?.handle : null;

  const moderate = (m: any) => {
    if (m.sender === side || m.sender === 'system') return;
    const handle = otherHandle;
    const blocked = handle && (user?.blocked || []).includes(handle);
    ActionSheetIOS.showActionSheetWithOptions(
      { message: m.text, options: ['Reportar mensaje', ...(handle ? [blocked ? 'Desbloquear' : 'Bloquear'] : []), 'Cancelar'], destructiveButtonIndex: [0, 1], cancelButtonIndex: handle ? 2 : 1 },
      (i) => {
        if (i === 0) api.report({ handle: handle || undefined, text: m.text, reason: 'mensaje' }).then(() => toast('Gracias. Revisamos el reporte.')).catch((e) => setError(e.message));
        if (i === 1 && handle) toggleBlock(handle).then(() => toast(blocked ? 'Desbloqueado' : 'Bloqueado')).catch((e) => setError(e.message));
      }
    );
  };

  const order = data?.order;
  const openOrder = () => order && router.push(side === 'buyer' ? `/compras/${order.id}` : `/vendedor/pedidos/${order.id}`);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.white }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.nav, { paddingTop: insets.top + 6 }]}>
        <Circle icon="chevron.backward" bg={C.fill2} onPress={() => router.back()} label="Volver" />
        <Press style={{ flex: 1, alignItems: 'center', gap: 2 }} onPress={side === 'buyer' && other ? () => router.push(`/tienda/${other.slug}`) : undefined}>
          {other?.avatarUrl ? <Img url={other.avatarUrl} radius={16} style={{ width: 32, height: 32 }} /> : <Avatar initials={other?.initials || '?'} size={32} bg={other?.color || C.forest} />}
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.label }} numberOfLines={1}>{side === 'seller' ? `@${other?.handle || ''}` : other?.name || ''}</Text>
        </Press>
        <View style={{ width: 44 }} />
      </View>

      {order && (
        <Press onPress={openOrder} style={styles.pinned}>
          <Img url={order.photoUrl} color={order.color} radius={10} style={{ width: 40, height: 40 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[{ fontSize: 15, fontWeight: '600', color: C.label }, T.num]}>{order.title} · {bs(order.total)}</Text>
            <Text style={T.footnote}>{order.ref}</Text>
          </View>
          <StatusChip status={order.status} />
        </Press>
      )}

      <FlatList
        ref={list}
        data={messages || []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
        keyboardDismissMode="interactive"
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={messages === null ? undefined : (
          <Text style={[T.subhead, { color: C.secondary, textAlign: 'center', marginTop: 40 }]}>Todavía no hay mensajes. Escribí para coordinar la entrega.</Text>
        )}
        renderItem={({ item }) => {
          if (item.sender === 'system') {
            return <Text style={[T.footnote, { textAlign: 'center', paddingHorizontal: 24, marginVertical: 4 }]}>{item.text}</Text>;
          }
          const mine = item.sender === side;
          return (
            <Press onLongPress={() => moderate(item)} delayLongPress={350} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={{ fontSize: 16, lineHeight: 21, color: mine ? C.white : C.label }}>{item.text}</Text>
            </Press>
          );
        }}
      />
      <View style={{ paddingHorizontal: 16 }}><ErrorLine message={error} /></View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10) }}>
        <TextInput value={draft} onChangeText={setDraft} placeholder={side === 'buyer' ? 'Escribile al vendedor…' : 'Escribile al comprador…'}
          placeholderTextColor={C.tertiary} multiline maxLength={1000} style={styles.input} accessibilityLabel="Mensaje" />
        <View style={{ opacity: draft.trim() ? 1 : 0.4 }}>
          <Circle icon="arrow.up" size={40} bg={C.tint} color={C.white} onPress={send} label="Enviar mensaje" />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.separator },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 12, padding: 10, borderRadius: R.card, backgroundColor: C.groupedBg },
  bubble: { maxWidth: '76%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  mine: { alignSelf: 'flex-end', backgroundColor: C.tint },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#EFEBE4' },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, borderWidth: 1, borderColor: C.separator, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 16, color: C.label },
});
