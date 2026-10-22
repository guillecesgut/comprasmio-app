import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { api, realtime } from '@/api';
import { useSession } from '@/session';
import { NavBar, Group, Row, Sym, Loading, EmptyCard, type SymbolName } from '@/ui';
import { ago } from '@/format';
import { C, T } from '@/theme';

const ICON: Record<string, { name: SymbolName; color: string }> = {
  pago_confirmado: { name: 'checkmark.circle.fill', color: C.tint },
  pago_rechazado: { name: 'exclamationmark.triangle.fill', color: C.bid },
  pedido_nuevo: { name: 'bag.fill', color: C.tint },
  pedido: { name: 'shippingbox.fill', color: C.forest },
  reclamo: { name: 'exclamationmark.bubble.fill', color: C.destructive },
  liquidacion: { name: 'banknote.fill', color: C.tint },
  plan: { name: 'crown.fill', color: C.bid },
  mensaje: { name: 'bubble.left.fill', color: C.forest },
  vivo: { name: 'dot.radiowaves.left.and.right', color: C.bid },
  resena: { name: 'star.fill', color: C.bidLight },
};

/** Los avisos guardan rutas que en la app existen tal cual, salvo el catálogo del vendedor (tab). */
const appRoute = (link?: string) => (!link ? null : link === '/vendedor/catalogo' ? '/catalogo' : link);

export default function Notificaciones() {
  const { refreshBadges } = useSession();
  const [items, setItems] = React.useState<any[] | null>(null);

  React.useEffect(() => {
    api.notifications()
      .then(({ notifications, unread }) => {
        setItems(notifications);
        if (unread > 0) api.markNotificationsRead().then(refreshBadges).catch(() => {});
      })
      .catch(() => setItems([]));
    return realtime.on('notification:new', ({ notification }) => notification && setItems((list) => [notification, ...(list || [])]));
  }, [refreshBadges]);

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Avisos" />
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}>
        {!items ? <Loading /> : !items.length ? (
          <EmptyCard title="Sin avisos" body="Acá te contamos cuando se confirme un pago, se envíe un pedido o una tienda salga en vivo." />
        ) : (
          <Group inset={50}>
            {items.map((n) => {
              const icon = ICON[n.kind] || { name: 'bell.fill' as SymbolName, color: C.secondary };
              const to = appRoute(n.link);
              return (
                <Row key={n.id} icon={icon.name} iconColor={icon.color} onPress={to ? () => router.push(to as any) : undefined}
                  title={<Text style={[T.body, { fontWeight: n.read ? '400' : '600' }]} numberOfLines={2}>{n.title}{n.count > 1 ? ` (${n.count})` : ''}</Text>}
                  subtitle={[n.body, ago(n.at)].filter(Boolean).join(' · ')}
                  right={!n.read ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.tint }} /> : <Sym name="chevron.forward" size={13} color={C.tertiary} />} />
              );
            })}
          </Group>
        )}
      </ScrollView>
    </View>
  );
}
