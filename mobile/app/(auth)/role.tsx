import React from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Circle, Group, Row, Sym, type SymbolName } from '@/ui';
import { C, T, R } from '@/theme';

type Role = 'buyer' | 'seller';

const OPTIONS: { key: Role; title: string; sub: string; color: string; icon: SymbolName }[] = [
  { key: 'buyer', title: 'Quiero comprar', sub: 'Entrá a los vivos, pujá y comprá al toque.', color: C.tint, icon: 'bag.fill' },
  { key: 'seller', title: 'Quiero vender', sub: 'Transmití en vivo y cobrá por QR.', color: C.bid, icon: 'video.fill' },
];

/** A2 · ¿Qué querés hacer? */
export default function RolePicker() {
  const insets = useSafeAreaInsets();
  const [role, setRole] = React.useState<Role>('buyer');

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Circle icon="chevron.backward" onPress={() => router.back()} label="Volver" />
      </View>
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 }}>
        <Text style={T.largeTitle}>¿Qué querés hacer?</Text>
        <Text style={[T.body, { color: C.secondary, marginTop: 6 }]}>Elegí con qué cuenta vas a entrar.</Text>
      </View>

      <Group radius={R.authCard} inset={72}>
        {OPTIONS.map((o) => {
          const selected = role === o.key;
          return (
            <Row
              key={o.key}
              minHeight={76}
              onPress={() => { Haptics.selectionAsync(); setRole(o.key); }}
              left={
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: o.color, alignItems: 'center', justifyContent: 'center' }}>
                  <Sym name={o.icon} size={20} color={C.white} />
                </View>
              }
              title={<Text style={{ fontSize: 17, fontWeight: '600', color: C.label }}>{o.title}</Text>}
              subtitle={<Text style={{ fontSize: 14, color: C.secondary, marginTop: 2 }}>{o.sub}</Text>}
              right={<Sym name={selected ? 'checkmark.circle.fill' : 'circle'} size={24} color={selected ? o.color : C.unchecked} />}
            />
          );
        })}
      </Group>

      <Text style={[T.footnote, { paddingHorizontal: 32, marginTop: 10 }]}>
        Esta elección es definitiva: cada rol tiene su propia app.
      </Text>

      <View style={{ flex: 1 }} />
      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 16) + 18 }}>
        <Btn
          title={`Continuar como ${role === 'buyer' ? 'comprador' : 'vendedor'}`}
          tone={role === 'buyer' ? 'tint' : 'bid'}
          onPress={() => router.push({ pathname: '/auth', params: { mode: 'signup', role } })}
        />
      </View>
    </View>
  );
}
