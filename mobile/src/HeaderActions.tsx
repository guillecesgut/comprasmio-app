import React from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api, realtime } from './api';
import { useSession } from './session';
import { Circle, Avatar, Press } from './ui';
import { C } from './theme';
import { initialsOf } from './format';

/** Campana (notificaciones) + avatar (hoja Cuenta), arriba a la derecha de cada tab. */
export function HeaderActions() {
  const { user, online } = useSession();
  const [unread, setUnread] = React.useState(0);

  const load = React.useCallback(() => {
    api.notifications().then(({ unread }) => setUnread(unread)).catch(() => {});
  }, []);

  useFocusEffect(load);

  React.useEffect(() => {
    const offs = [
      realtime.on('notification:new', () => setUnread((n) => n + 1)),
      realtime.on('notification:read', ({ unread }) => setUnread(unread)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  const seller = user?.role === 'seller';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {!online && (
        <View
          accessibilityLabel="Sin conexión con el servidor"
          style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.destructive, marginRight: 2 }}
        />
      )}
      <Circle
        icon={unread > 0 ? 'bell.badge.fill' : 'bell'}
        color={unread > 0 ? C.bid : C.label}
        onPress={() => router.push('/notificaciones')}
        label={unread > 0 ? `Notificaciones: ${unread} sin leer` : 'Notificaciones'}
      />
      <Press onPress={() => router.push('/cuenta')} accessibilityRole="button" accessibilityLabel="Tu cuenta">
        <Avatar
          initials={user?.initials || initialsOf(user?.name)}
          size={44}
          bg={seller ? C.bidLight : C.forest}
          fg={seller ? C.forest : C.white}
        />
      </Press>
    </View>
  );
}
