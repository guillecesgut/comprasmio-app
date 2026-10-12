import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
// Solo el peso del logotipo: importar el paquete entero empaqueta los 18 pesos.
import { PublicSans_700Bold } from '@expo-google-fonts/public-sans/700Bold';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setupLive } from '@/live';
import { SessionProvider, useSession } from '@/session';
import { ToastProvider } from '@/ui';
import { C, R } from '@/theme';

// WebRTC para livekit-client: tiene que correr antes de crear cualquier Room (no en Expo Go).
setupLive();
SplashScreen.preventAutoHideAsync().catch(() => {});

/** formSheet con detents: el formato de hoja nativa de iOS que pide el handoff. */
const sheet = (detents: number[] = [1], bg: string = C.white) => ({
  presentation: 'formSheet' as const,
  sheetAllowedDetents: detents,
  sheetGrabberVisible: true,
  sheetCornerRadius: R.sheet,
  headerShown: false,
  contentStyle: { backgroundColor: bg },
});

function Navigator() {
  const { loading } = useSession();
  const [fontsLoaded] = useFonts({ PublicSans_700Bold });

  // No mostrar tabs de un rol antes de saber cuál es: el splash queda hasta resolver la sesión.
  React.useEffect(() => {
    if (!loading && fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [loading, fontsLoaded]);
  if (loading || !fontsLoaded) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.groupedBg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(buyer)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(seller)" options={{ animation: 'fade' }} />

      {/* Sala y transmisión: pantalla completa, fondo negro. */}
      <Stack.Screen name="vivo/[id]" options={{ presentation: 'fullScreenModal', contentStyle: { backgroundColor: C.black } }} />
      <Stack.Screen
        name="transmitir/[id]"
        options={{ presentation: 'fullScreenModal', gestureEnabled: false, contentStyle: { backgroundColor: C.black } }}
      />

      {/* Hojas. */}
      <Stack.Screen name="catalogo/[id]" options={sheet([0.55])} />
      <Stack.Screen name="pago/[orderId]" options={sheet([1], C.groupedBg)} />
      <Stack.Screen name="producto/[id]" options={sheet([1], C.groupedBg)} />
      <Stack.Screen name="comprobante/[orderId]" options={sheet([1], C.groupedBg)} />
      <Stack.Screen name="transmitir/armar" options={sheet([1], C.groupedBg)} />
      <Stack.Screen name="cuenta" options={sheet([0.5, 1], C.groupedBg)} />
      <Stack.Screen name="notificaciones" options={sheet([0.6, 1], C.groupedBg)} />

      {/* Hilos de chat: push normal. */}
      <Stack.Screen name="mensajes/[sellerId]" options={{ contentStyle: { backgroundColor: C.white } }} />
      <Stack.Screen name="cliente/[buyerId]" options={{ contentStyle: { backgroundColor: C.white } }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <ToastProvider>
            <StatusBar style="dark" />
            <Navigator />
          </ToastProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
