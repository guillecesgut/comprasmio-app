import React from 'react';
import { Redirect, Tabs, router } from 'expo-router';
import { useSession } from '@/session';
import { FloatingTabBar, type TabSpec } from '@/TabBar';
import { C } from '@/theme';

const TABS: TabSpec[] = [
  { name: 'resumen', label: 'Resumen', icon: 'chart.bar', iconActive: 'chart.bar.fill' },
  { name: 'catalogo', label: 'Catálogo', icon: 'square.grid.2x2', iconActive: 'square.grid.2x2.fill' },
  { name: 'pedidos', label: 'Pedidos', icon: 'shippingbox', iconActive: 'shippingbox.fill' },
  { name: 'mensajes', label: 'Mensajes', icon: 'bubble.left.and.bubble.right', iconActive: 'bubble.left.and.bubble.right.fill' },
];

/**
 * TabVendedor: Resumen · Catálogo · Pedidos (badge = por preparar) · Mensajes + botón
 * Transmitir. Premium: ámbar, abre E9. Básico: gris con candado, abre E11b. Nunca se oculta.
 */
export default function SellerLayout() {
  const { user, badges } = useSession();

  if (!user) return <Redirect href="/welcome" />;
  if (user.role !== 'seller') return <Redirect href="/inicio" />;
  const premium = user.plan === 'premium';

  return (
    <Tabs
      screenOptions={{ headerShown: false, animation: 'none', sceneStyle: { backgroundColor: C.groupedBg } }}
      tabBar={(props) => (
        <FloatingTabBar
          {...props}
          tabs={TABS}
          extra={premium
            ? { icon: 'video.fill', label: 'Transmitir', tone: 'bid', onPress: () => router.push('/transmitir/armar') }
            : { icon: 'lock.fill', label: 'Transmitir (Premium)', tone: 'locked', onPress: () => router.push('/plan/premium') }}
        />
      )}
    >
      <Tabs.Screen name="resumen" />
      <Tabs.Screen name="catalogo" />
      <Tabs.Screen name="pedidos" options={{ tabBarBadge: badges.toPrepare || undefined }} />
      <Tabs.Screen name="mensajes" />
    </Tabs>
  );
}
