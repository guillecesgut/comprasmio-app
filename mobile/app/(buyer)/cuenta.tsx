import React from 'react';
import { View, Text, Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api';
import { useSession } from '@/session';
import { Screen, LargeTitle, Group, Row, Avatar, Badge, SectionHeader, Sym, type SymbolName } from '@/ui';
import { C, T } from '@/theme';

/** Ícono en tile de color 30 (D10). */
function Tile({ icon, bg }: { icon: SymbolName; bg: string }) {
  return (
    <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Sym name={icon} size={16} color={C.white} />
    </View>
  );
}

/** D10 · Cuenta. */
export default function Cuenta() {
  const { user, badges, logout } = useSession();
  const [support, setSupport] = React.useState<{ whatsapp?: string; email?: string }>({});
  React.useEffect(() => { api.config().then((c) => setSupport(c.support || {})).catch(() => {}); }, []);

  const help = () => {
    if (support.whatsapp) Linking.openURL(`https://wa.me/${support.whatsapp.replace(/\D/g, '')}`);
    else if (support.email) Linking.openURL(`mailto:${support.email}`);
    else Alert.alert('Ayuda', 'Escribinos desde el chat de cualquier pedido y te respondemos.');
  };

  const confirmLogout = () => Alert.alert('¿Cerrar sesión?', undefined, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Cerrar sesión', style: 'destructive', onPress: () => logout() },
  ]);

  return (
    <Screen>
      <LargeTitle title="Cuenta" />
      <Group>
        <Row minHeight={76} left={<Avatar initials={user?.initials || '?'} size={56} />} title={<Text style={T.title2}>{user?.name}</Text>}
          subtitle={`+591 ${user?.phone || ''}`} chevron onPress={() => router.push('/datos')} />
      </Group>

      <SectionHeader title="Compras" />
      <Group inset={58}>
        <Row left={<Tile icon="bag.fill" bg={C.tint} />} title="Mis compras" chevron onPress={() => router.push('/compras')}
          right={badges.pendingPayments ? <Badge count={badges.pendingPayments} /> : undefined} />
        <Row left={<Tile icon="heart.fill" bg={C.bid} />} title="Lista de deseos" chevron onPress={() => router.push('/deseos')} />
        <Row left={<Tile icon="storefront" bg={C.forest} />} title="Vendedores que sigo" chevron onPress={() => router.push('/seguidos')} />
        <Row left={<Tile icon="bubble.left.and.bubble.right.fill" bg="#4C463C" />} title="Mensajes" chevron onPress={() => router.push('/mensajes')} />
      </Group>

      <SectionHeader title="Datos" />
      <Group inset={58}>
        <Row left={<Tile icon="person.fill" bg="#6B6455" />} title="Datos personales" chevron onPress={() => router.push('/datos')} />
        <Row left={<Tile icon="mappin.and.ellipse" bg={C.tint} />} title="Direcciones" chevron onPress={() => router.push('/direcciones')} />
        <Row left={<Tile icon="bell.fill" bg={C.bid} />} title="Notificaciones" chevron onPress={() => router.push('/notificaciones')}
          right={badges.unread ? <Badge count={badges.unread} /> : undefined} />
      </Group>

      <SectionHeader title="Ayuda" />
      <Group inset={58}>
        <Row left={<Tile icon="qrcode" bg={C.forest} />} title="Cómo funciona el pago" chevron onPress={() => router.push('/ayuda/pago')} />
        <Row left={<Tile icon="exclamationmark.bubble" bg="#9C2A1E" />} title="Reclamos" chevron onPress={() => router.push({ pathname: '/compras', params: { filter: 'en_reclamo' } })} />
        <Row left={<Tile icon="questionmark.circle.fill" bg="#6B6455" />} title="Hablar con soporte" chevron onPress={help} />
        <Row left={<Tile icon="doc.text.fill" bg="#6B6455" />} title="Términos y privacidad" chevron onPress={() => router.push('/ayuda/terminos')} />
      </Group>

      <Group style={{ marginTop: 28 }}>
        <Row title="Cerrar sesión" onPress={confirmLogout} />
        <Row title="Borrar cuenta" destructive onPress={() => router.push('/borrar-cuenta')} />
      </Group>
    </Screen>
  );
}
