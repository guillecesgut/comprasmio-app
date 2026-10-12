import React from 'react';
import { Redirect, Tabs, router } from 'expo-router';
import { api, realtime } from '@/api';
import { useSession } from '@/session';
import { FloatingTabBar, type TabSpec } from '@/TabBar';
import { C } from '@/theme';

const TABS: TabSpec[] = [
  { name: 'inicio', label: 'Inicio', icon: 'house', iconActive: 'house.fill' },
  { name: 'favoritos', label: 'Favoritos', icon: 'heart', iconActive: 'heart.fill' },
  { name: 'compras', label: 'Compras', icon: 'bag', iconActive: 'bag.fill' },
];

export default function BuyerLayout() {
  const { user } = useSession();
  const [pending, setPending] = React.useState(0);

  // Badge de Compras: órdenes que todavía esperan el comprobante.
  React.useEffect(() => {
    if (!user) return;
    const load = () =>
      api.orders().then(({ orders }) => setPending(orders.filter((o) => o.status === 'pendiente_pago').length)).catch(() => {});
    load();
    const offs = ['order:update', 'auction:won', 'purchase:done'].map((type) => realtime.on(type, load));
    return () => offs.forEach((off) => off());
  }, [user]);

  if (!user) return <Redirect href="/welcome" />;
  if (user.role === 'seller') return <Redirect href="/resumen" />;

  return (
    <Tabs
      screenOptions={{ headerShown: false, animation: 'none', sceneStyle: { backgroundColor: C.groupedBg } }}
      tabBar={(props) => (
        <FloatingTabBar
          {...props}
          tabs={TABS}
          extra={{
            icon: 'magnifyingglass',
            label: 'Buscar',
            tone: 'glass',
            onPress: () => router.navigate({ pathname: '/inicio', params: { buscar: String(Date.now()) } }),
          }}
        />
      )}
    >
      <Tabs.Screen name="inicio" />
      <Tabs.Screen name="favoritos" />
      <Tabs.Screen name="compras" options={{ tabBarBadge: pending || undefined }} />
    </Tabs>
  );
}
