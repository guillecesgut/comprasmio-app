import React from 'react';
import { View, Text, Alert } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/session';
import { Avatar, Group, Row, useToast } from '@/ui';
import { initialsOf } from '@/format';
import { C, T } from '@/theme';

/** Hoja Cuenta: cerrar sesión y borrar la cuenta (requisito de Apple 5.1.1(v)). */
export default function Cuenta() {
  const { user, logout, deleteAccount } = useSession();
  const toast = useToast();
  const seller = user?.role === 'seller';

  const signOut = async () => {
    await logout();
    router.dismissAll();
    router.replace('/welcome');
  };

  const remove = () =>
    Alert.prompt(
      'Borrar tu cuenta',
      'Se borran tu perfil, tus mensajes y, si vendés, tu catálogo. No se puede deshacer. Escribí tu contraseña para confirmar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async (password?: string) => {
            try {
              await deleteAccount(password || '');
              router.dismissAll();
              router.replace('/welcome');
            } catch (e: any) {
              toast(e.message);
            }
          },
        },
      ],
      'secure-text'
    );

  return (
    <View style={{ flex: 1, paddingTop: 28 }}>
      <View style={{ alignItems: 'center', gap: 6, paddingBottom: 20 }}>
        <Avatar initials={user?.initials || initialsOf(user?.name)} size={72} bg={seller ? C.bidLight : C.forest} fg={seller ? C.forest : C.white} />
        <Text style={T.title2}>{user?.name}</Text>
        <Text style={[T.subhead, { color: C.secondary }]}>{seller ? 'Vendedor' : 'Comprador'} · +591 {user?.phone}</Text>
      </View>
      <Group inset={50}>
        <Row icon="bell" title="Notificaciones" chevron onPress={() => router.push('/notificaciones')} />
        <Row icon="rectangle.portrait.and.arrow.right" title="Cerrar sesión" destructive onPress={signOut} />
      </Group>
      <Group style={{ marginTop: 16 }}>
        <Row icon="trash" title="Borrar cuenta" destructive onPress={remove} />
      </Group>
    </View>
  );
}
