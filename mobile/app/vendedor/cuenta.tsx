import React from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/session';
import { NavBar, Group, Row, Avatar, Badge } from '@/ui';
import { C, T } from '@/theme';

/** Cuenta del vendedor (desde el avatar de C1). */
export default function CuentaVendedor() {
  const { user, badges, logout } = useSession();
  const confirmLogout = () => Alert.alert('¿Cerrar sesión?', undefined, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Cerrar sesión', style: 'destructive', onPress: () => logout() },
  ]);
  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Cuenta" />
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 40, gap: 20 }}>
        <Group>
          <Row minHeight={72} left={<Avatar initials={user?.initials || '?'} bg={C.bid} size={52} />} title={<Text style={T.title2}>{user?.name}</Text>} subtitle={`+591 ${user?.phone || ''}`} />
        </Group>
        <Group inset={50}>
          <Row icon="storefront" title="Mi tienda" chevron onPress={() => router.push('/vendedor/tienda')} />
          <Row icon="banknote" title="Cobros y datos bancarios" chevron onPress={() => router.push('/vendedor/cobros')} />
          <Row icon="crown.fill" iconColor={C.bid} title="Mi plan" chevron onPress={() => router.push('/vendedor/plan')} />
          <Row icon="bell" title="Avisos" chevron onPress={() => router.push('/notificaciones')} right={badges.unread ? <Badge count={badges.unread} /> : undefined} />
        </Group>
        <Group inset={50}>
          <Row icon="person" title="Datos personales y contraseña" chevron onPress={() => router.push('/datos')} />
          <Row icon="qrcode" title="Cómo funciona el pago" chevron onPress={() => router.push('/ayuda/pago')} />
          <Row icon="doc.text" title="Términos y privacidad" chevron onPress={() => router.push('/ayuda/terminos')} />
        </Group>
        <Group>
          <Row title="Cerrar sesión" onPress={confirmLogout} />
          <Row title="Borrar cuenta" destructive onPress={() => router.push('/borrar-cuenta')} />
        </Group>
      </ScrollView>
    </View>
  );
}
