import React from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { api, bs } from '@/api';
import { useData } from '@/hooks';
import { SheetHeader, Btn, Sym } from '@/ui';
import { C, T } from '@/theme';

/** E11b · Un vendedor Básico toca Transmitir. */
export default function PremiumSheet() {
  const { data: p } = useData(() => api.seller_.plan().then((r) => r.plan), []);
  const benefits = [
    'Transmisiones en vivo dentro de la app',
    'Subastas por unidad y paquetes',
    'Precio fijo para toda la sala',
    p ? `Comisión ${p.premiumPct} % en vez de ${p.basicoPct} %` : 'Comisión reducida',
  ];
  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <SheetHeader eyebrow="Premium" eyebrowIcon="crown.fill" eyebrowColor={C.bidText} title="Transmitir es parte de Premium"
        subtitle="Vendé en vivo a toda la sala, con subastas y paquetes." onClose={() => router.back()} />
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        {benefits.map((b) => (
          <View key={b} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Sym name="checkmark.circle.fill" size={20} color={C.tint} />
            <Text style={T.body}>{b}</Text>
          </View>
        ))}
        {p && <Text style={[T.headline, { marginTop: 8 }]}>{bs(p.premiumPrice)} / mes · se paga por QR</Text>}
      </View>
      <View style={{ padding: 16, gap: 8, marginTop: 8 }}>
        <Btn title="Ver cómo pasar a Premium" tone="bid" onPress={() => router.replace('/vendedor/plan')} />
        <Btn title="Ahora no" tone="plain" onPress={() => router.back()} />
      </View>
    </View>
  );
}
