import type { ExpoConfig } from 'expo/config';

/**
 * Configuración de la app nativa. La URL del backend se fija en tiempo de
 * compilación (EXPO_PUBLIC_API_URL): en desarrollo apunta a la IP de tu PC,
 * en producción a la URL pública (por ejemplo, la de Render).
 *
 * Antes de la primera build para la App Store:
 *  - Cambiá `ios.bundleIdentifier` por uno tuyo (debe coincidir con el
 *    identificador registrado en App Store Connect).
 *  - Corré `eas init` para que EAS complete `extra.eas.projectId`.
 */
const config: ExpoConfig = {
  name: 'ComprasMío!',
  slug: 'comprasmio',
  scheme: 'comprasmio',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'bo.comprasmio.app',
    buildNumber: '1',
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSCameraUsageDescription:
        'ComprasMío! usa la cámara para que transmitas tus productos en vivo y fotografíes tu comprobante de pago.',
      NSMicrophoneUsageDescription:
        'ComprasMío! usa el micrófono para que tus compradores te escuchen durante la transmisión en vivo.',
      NSPhotoLibraryUsageDescription:
        'ComprasMío! accede a tus fotos para que adjuntes el comprobante de tu transferencia.',
      NSPhotoLibraryAddUsageDescription:
        'ComprasMío! guarda el código QR de pago en tus fotos para que pagues desde la app de tu banco.',
      // Seguir oyendo el vivo con la app en segundo plano.
      UIBackgroundModes: ['audio', 'voip'],
    },
  },
  android: {
    package: 'bo.comprasmio.app',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0E7C66' },
    permissions: ['CAMERA', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    // Splash: fondo blanco con el logomark (handoff → App Store checklist).
    ['expo-splash-screen', { image: './assets/splash.png', imageWidth: 120, resizeMode: 'contain', backgroundColor: '#FFFFFF' }],
    '@livekit/react-native-expo-plugin',
    '@config-plugins/react-native-webrtc',
    [
      'expo-image-picker',
      {
        photosPermission:
          'ComprasMío! accede a tus fotos para que adjuntes el comprobante de tu transferencia.',
        cameraPermission: 'ComprasMío! usa la cámara para fotografiar tu comprobante de pago.',
      },
    ],
    [
      'expo-media-library',
      {
        savePhotosPermission:
          'ComprasMío! guarda el código QR de pago en tus fotos para que pagues desde la app de tu banco.',
        isAccessMediaLocationEnabled: false,
      },
    ],
    ['expo-build-properties', { ios: { deploymentTarget: '16.4' } }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    // eas: { projectId: '...' }  ← lo completa `eas init`
  },
};

export default config;
