import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { router, type Href } from 'expo-router';
import { api, realtime } from '@/api';
import { SheetHeader, Group, Row, Sym, type SymbolName } from '@/ui';
import { ago } from '@/format';
import { C, T } from '@/theme';

const ICON: Record<string, { name: SymbolName; color: string }> = {
  pago_por_verificar: { name: 'doc.text', color: C.bid },
  pago_verificado: { name: 'checkmark.circle.fill', color: C.tint },
  mensaje: { name: 'bubble.left.fill', color: C.forest },
};

/** Los avisos guardan rutas de la web; acá se traducen a las de la app. */
function appRoute(link?: string): Href | null {
  if (!link) return null;
  const [path, query = ''] = link.split('?');
  const params = new URLSearchParams(query);
  if (path === '/compras') return '/compras';
  if (path.startsWith('/mensajes/')) return `/mensajes/${path.split('/')[2]}`;
  if (path === '/vender/ordenes') return '/ordenes';
  if (path === '/vender/clientes') return params.get('cliente') ? `/cliente/${params.get('cliente')}` : '/clientes';
  if (path.startsWith('/vender')) return '/resumen';
  return null;
}

export default function Notificaciones() {
  const [items, setItems] = React.useState<any[] | null>(null);

  React.useEffect(() => {
    api.notifications()
      .then(({ notifications, unread }) => {
        setItems(notifications);
        // Abrir el panel cuenta como haberlas visto.
        if (unread > 0) api.markNotificationsRead().catch(() => {});
      })
      .catch(() => setItems([]));
    const offs = [
      realtime.on('notification:new', ({ notification }) => setItems((list) => [notification, ...(list || [])])),
      realtime.on('notification:update', ({ notification }) =>
        setItems((list) => [notification, ...(list || []).filter((n) => n.id !== notification.id)])),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  const go = (item: any) => {
    const route = appRoute(item.link);
    router.back();
    if (route) router.push(route);
  };

  return (
    <View style={{ flex: 1 }}>
      <SheetHeader title="Notificaciones" onClose={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {items !== null && items.length === 0 ? (
          <Text style={[T.subhead, { color: C.secondary, textAlign: 'center', padding: 32 }]}>No tenés notificaciones todavía.</Text>
        ) : (
          <Group inset={56}>
            {(items || []).map((item) => {
              const icon = ICON[item.kind] || ICON.mensaje;
              return (
                <Row
                  key={item.id}
                  minHeight={64}
                  onPress={() => go(item)}
                  left={
                    <View style={{ width: 28, alignItems: 'center' }}>
                      <Sym name={icon.name} size={22} color={icon.color} />
                    </View>
                  }
                  title={
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text numberOfLines={1} style={[T.callout, { fontWeight: item.read ? '400' : '600', flex: 1 }]}>{item.title}</Text>
                      <Text style={T.footnote}>{ago(item.at)}</Text>
                    </View>
                  }
                  subtitle={`${item.count > 1 ? `${item.count} mensajes · ` : ''}${item.body}`}
                />
              );
            })}
          </Group>
        )}
      </ScrollView>
    </View>
  );
}
