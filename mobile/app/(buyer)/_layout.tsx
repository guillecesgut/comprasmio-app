import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { useSession } from '@/session';
import { FloatingTabBar, type TabSpec } from '@/TabBar';
import { C } from '@/theme';

/**
 * TabComprador: Inicio · Buscar · Vivos · Carrito · Cuenta. Vivos lleva un punto
 * ámbar si hay transmisiones; Carrito, las unidades; Cuenta, los pagos pendientes.
 */
export default function BuyerLayout() {
  const { user, badges } = useSession();

  if (!user) return <Redirect href="/welcome" />;
  if (user.role === 'seller') return <Redirect href="/resumen" />;

  const tabs: TabSpec[] = [
    { name: 'inicio', label: 'Inicio', icon: 'house', iconActive: 'house.fill' },
    { name: 'buscar', label: 'Buscar', icon: 'magnifyingglass' },
    { name: 'vivos', label: 'Vivos', icon: 'dot.radiowaves.left.and.right', dot: badges.liveNow },
    { name: 'carrito', label: 'Carrito', icon: 'cart', iconActive: 'cart.fill' },
    { name: 'cuenta', label: 'Cuenta', icon: 'person', iconActive: 'person.fill' },
  ];

  return (
    <Tabs
      screenOptions={{ headerShown: false, animation: 'none', sceneStyle: { backgroundColor: C.groupedBg } }}
      tabBar={(props) => <FloatingTabBar {...props} tabs={tabs} />}
    >
      <Tabs.Screen name="inicio" />
      <Tabs.Screen name="buscar" />
      <Tabs.Screen name="vivos" />
      <Tabs.Screen name="carrito" options={{ tabBarBadge: badges.cartUnits || undefined }} />
      <Tabs.Screen name="cuenta" options={{ tabBarBadge: badges.pendingPayments || undefined }} />
    </Tabs>
  );
}
