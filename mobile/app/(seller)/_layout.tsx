import React from 'react';
import { Redirect, Tabs, router } from 'expo-router';
import { api, realtime } from '@/api';
import { useSession } from '@/session';
import { FloatingTabBar, type TabSpec } from '@/TabBar';
import { C } from '@/theme';

const TABS: TabSpec[] = [
  { name: 'resumen', label: 'Resumen', icon: 'chart.bar', iconActive: 'chart.bar.fill' },
  { name: 'productos', label: 'Productos', icon: 'archivebox', iconActive: 'archivebox.fill' },
  { name: 'ordenes', label: 'Órdenes', icon: 'list.bullet.rectangle', iconActive: 'list.bullet.rectangle.fill' },
  { name: 'clientes', label: 'Clientes', icon: 'person.2', iconActive: 'person.2.fill' },
];

export default function SellerLayout() {
  const { user } = useSession();
  const [review, setReview] = React.useState(0);

  // Badge de Órdenes: comprobantes esperando verificación.
  React.useEffect(() => {
    if (user?.role !== 'seller') return;
    const load = () => api.sellerOrders('en_revision').then(({ orders }) => setReview(orders.length)).catch(() => {});
    load();
    const offs = ['order:new', 'order:update'].map((type) => realtime.on(type, load));
    return () => offs.forEach((off) => off());
  }, [user]);

  if (!user) return <Redirect href="/welcome" />;
  if (user.role !== 'seller') return <Redirect href="/inicio" />;

  return (
    <Tabs
      screenOptions={{ headerShown: false, animation: 'none', sceneStyle: { backgroundColor: C.groupedBg } }}
      tabBar={(props) => (
        <FloatingTabBar
          {...props}
          tabs={TABS}
          extra={{ icon: 'video.fill', label: 'Transmitir', tone: 'bid', onPress: () => router.push('/transmitir/armar') }}
        />
      )}
    >
      <Tabs.Screen name="resumen" />
      <Tabs.Screen name="productos" />
      <Tabs.Screen name="ordenes" options={{ tabBarBadge: review || undefined }} />
      <Tabs.Screen name="clientes" />
    </Tabs>
  );
}
