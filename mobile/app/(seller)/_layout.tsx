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
 * Transmitir ámbar, que abre E9. Todos los vendedores pueden transmitir.
 */
export default function SellerLayout() {
  const { user, badges } = useSession();

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
      <Tabs.Screen name="catalogo" />
      <Tabs.Screen name="pedidos" options={{ tabBarBadge: badges.toPrepare || undefined }} />
      <Tabs.Screen name="mensajes" />
    </Tabs>
  );
}
