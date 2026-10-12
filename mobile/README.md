# ComprasMío! — app iOS (Expo)

App nativa para compradores y vendedores, construida sobre el handoff de diseño de `../design/`
(ver `design/README.md`). Usa **el mismo backend** que la web (`../server/`): API REST,
WebSocket y LiveKit.

**Stack:** Expo SDK 57 · React Native 0.86 · expo-router · SF Symbols (`expo-symbols`) ·
LiveKit (`@livekit/react-native`) · TypeScript estricto.

## Estado

| Verificado | Cómo |
|---|---|
| Tipos | `npm run typecheck` sin errores |
| Dependencias alineadas con el SDK | `npm run doctor` → 21/21 |
| El JavaScript de iOS compila | `npx expo export --platform ios` |
| Endpoints nuevos del servidor | prueba contra una copia del servidor con datos de ejemplo |

**Todavía no se ejecutó en un iPhone ni en el simulador** (hace falta una Mac o una build de EAS).
Es el próximo paso, y lo más probable es que aparezcan ajustes visuales al verla en un dispositivo.

## Pantallas

| ID | Pantalla | Archivo |
|---|---|---|
| A1–A3 | Bienvenida, rol, crear cuenta / iniciar sesión | `app/(auth)/` |
| B1 | Inicio | `app/(buyer)/inicio.tsx` |
| B2/B3 | Sala en vivo (subasta / precio fijo) | `app/vivo/[id].tsx` |
| B4 | Catálogo del vivo (hoja) | `app/catalogo/[id].tsx` |
| B5 | Pago por QR (hoja) | `app/pago/[orderId].tsx` |
| B6 | Compras | `app/(buyer)/compras.tsx` |
| B7 | Mensajes con el vendedor | `app/mensajes/[sellerId].tsx` |
| B8 | Favoritos | `app/(buyer)/favoritos.tsx` |
| C1 | Resumen | `app/(seller)/resumen.tsx` |
| C2 | Productos (deslizar: editar / borrar) | `app/(seller)/productos.tsx` |
| C3 | Nuevo / editar producto (hoja) | `app/producto/[id].tsx` |
| C4 | Órdenes | `app/(seller)/ordenes.tsx` |
| C5 | Revisar comprobante (hoja) | `app/comprobante/[orderId].tsx` |
| C6 | Armar la transmisión (hoja) | `app/transmitir/armar.tsx` |
| C7 | Al aire | `app/transmitir/[id].tsx` |
| C8 | Clientes + hilo | `app/(seller)/clientes.tsx`, `app/cliente/[buyerId].tsx` |
| — | Cuenta (cerrar sesión, **borrar cuenta**) · Notificaciones | `app/cuenta.tsx`, `app/notificaciones.tsx` |

El código compartido vive en `src/`: `api.ts` (REST + socket), `session.tsx`, `live.tsx`
(LiveKit), `ui.tsx` (componentes del sistema visual), `theme.ts` (tokens), `TabBar.tsx`,
`Thread.tsx` (chat comprador ↔ vendedor).

## Cambios en el servidor para la app

- `DELETE /api/auth/me` — borrar la cuenta pidiendo la contraseña (requisito de Apple).
- `PUT /api/auth/me/blocked/:handle` y `POST /api/auth/report` — bloquear y reportar en el
  chat de la sala (requisito de Apple para contenido de usuarios). Los reportes quedan en la
  colección `reports` de la base para revisión manual.
- `POST /api/streams/:id/lot/extend` — botón "+30 s" del vendedor (tope de 5 min).
- Las subastas cuentan pujas (`lot.bids`) y `/api/seller/customers` trae el último mensaje.

## Lo que el handoff pide y no está (necesita backend nuevo)

- Notificaciones push (`expo-notifications` + registrar el token del dispositivo).
- Live Activity / Dynamic Island (B9): target de WidgetKit en Swift + pushes de ActivityKit.
- "Avisarme cuando salga" por producto (B4) y "Próximo vivo" de favoritos sin transmisión (B8).
- Fotos de producto (C3): hoy se muestran las rayas de color del prototipo.
- Reordenar la cola arrastrando (C6): el orden es el de los toques.
- Picture in Picture y linterna en la sala/transmisión.
- Filtro por período (Hoy / Semana / Mes) en Resumen: hoy solo cambia el gráfico.

## Desarrollo

```bash
cd mobile
npm install
npm run typecheck
```

### Probar rápido en Expo Go (sin Mac)

Todo funciona en Expo Go salvo el video en vivo: dentro de Expo Go, LiveKit no se carga y la
sala muestra el bloque de color.

1. `cd server && npm run dev` (backend en el puerto 4000).
2. En `mobile/.env.local`, `EXPO_PUBLIC_API_URL=http://<IP de tu PC>:4000`.
3. `npm run start:go` y escaneá el QR con la cámara del iPhone (misma red Wi-Fi que la PC).

### Development build (con video)

El video en vivo usa WebRTC (módulo nativo), así que hace falta una *development build*.

```bash
npm install -g eas-cli
eas login
eas init
npm run build:dev
```

Instalá en el iPhone la build que te da EAS y corré `npm start`. En `eas.json`, perfil
`development`, poné en `EXPO_PUBLIC_API_URL` la IP de tu PC en la red local (el celular no
conoce `localhost`). El servidor tiene que estar corriendo (`cd server && npm run dev`).

Cuentas de prueba (con `npm run seed` en el servidor): compradora `71234567` / `comprar123`,
vendedor `70000000` / `vender123`.

## Publicar en la App Store

Requisitos: cuenta de **Apple Developer** (USD 99/año) y una cuenta de Expo. EAS compila en la
nube: no hace falta una Mac.

1. Cambiá `ios.bundleIdentifier` en `app.config.ts` por tu identificador.
2. Poné la URL pública del backend en `EXPO_PUBLIC_API_URL` de los perfiles `preview` y
   `production` de `eas.json`. **Tiene que ser HTTPS** (iOS bloquea HTTP).
3. Compilá y subí:
   ```bash
   npm run build:ios
   npm run submit:ios
   ```
4. En App Store Connect completá ficha, capturas, **URL de política de privacidad** y la
   información para la revisión:
   - Cuentas de prueba de compradora y vendedor.
   - Nota: el pago es por transferencia QR de **bienes físicos**, fuera de la app, por lo que
     no aplica la compra integrada de Apple (guía 3.1.3(e)).
   - Dónde está el borrado de cuenta (hoja Cuenta) y la moderación (mantener presionado un
     mensaje en la sala → Reportar / Bloquear).

Íconos: `assets/icon.png` (1024, opaco), `assets/splash.png` y `assets/adaptive-icon.png`,
generados con la geometría del APP ICON del Brand Kit.
