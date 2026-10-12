import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Logomark, Wordmark, Placeholder } from '@/ui';
import { C, T } from '@/theme';

/** A1 · Bienvenida. */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.white, paddingTop: insets.top + 8 }}>
      {/* Hero: foto de una vendedora en vivo (placeholder hasta tener la foto final). */}
      <Placeholder color={C.tint} radius={34} style={{ marginHorizontal: 16, flex: 1, maxHeight: 430 }} />

      <View style={{ paddingHorizontal: 28, paddingTop: 28 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Logomark size={34} />
          <Wordmark size={21} />
        </View>
        <Text style={[T.largeTitle, { marginTop: 16 }]}>Subastas y compras en vivo.</Text>
        <Text style={[T.body, { color: C.secondary, marginTop: 8 }]}>
          Pujá, comprá al toque y pagá por QR. Tu dinero, siempre a la vista.
        </Text>
      </View>

      <View style={{ flex: 1, minHeight: 16 }} />
      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 16) + 18, gap: 12 }}>
        <Btn title="Crear cuenta" onPress={() => router.push('/role')} />
        <Btn title="Ya tengo cuenta" tone="tonal" onPress={() => router.push({ pathname: '/auth', params: { mode: 'login' } })} />
      </View>
    </View>
  );
}
