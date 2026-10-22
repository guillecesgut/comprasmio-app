# ComprasMío! — app iOS (Expo)

App nativa para compradores y vendedores, construida sobre el handoff de diseño de `../design/`
(ver `design/README.md`). Usa el backend de `../server/`: API REST, WebSocket y LiveKit.

**Stack:** Expo SDK 57 · React Native 0.86 · expo-router · SF Symbols (`expo-symbols`) ·
LiveKit (`@livekit/react-native`) · TypeScript estricto.

## Estado (v2: marketplace + vivos)

| Verificado | Cómo |
|---|---|
| Tipos | `npm run typecheck` sin errores |
| El JavaScript de iOS compila | `npx expo export --platform ios` |
| Flujos contra el servidor real | vista web de prueba con datos de ejemplo: compra con variantes → checkout → pago QR → mis compras; vendedor: pedidos, catálogo, editor, stock; vivo completo (armar, precio fijo, subasta, resumen) |

**Todavía no se ejecutó en un iPhone.** Diálogos nativos (`Alert.prompt`, hojas de acciones),
cámara y video solo se pueden probar en el dispositivo o en una build de EAS.

## Pantallas

| ID | Pantalla | Archivo |
|---|---|---|
| A1–A3 | Bienvenida, rol, crear cuenta / iniciar sesión | `app/(auth)/` |
| D1 | Inicio | `app/(buyer)/inicio.tsx` |
| D2 | Categoría | `app/categoria/[id].tsx` |
| D3/D4 | Buscar y resultados | `app/(buyer)/buscar.tsx` |
| D5 | Producto | `app/producto/[id].tsx` |
| D6 | Carrito | `app/(buyer)/carrito.tsx` |
| D7 | Checkout | `app/checkout.tsx` |
| D8 / D8b | Pago por QR / comprobante enviado | `app/pago/[id].tsx`, `app/pago/listo.tsx` |
| D9 | Tienda pública | `app/tienda/[slug].tsx` |
| D10 | Cuenta | `app/(buyer)/cuenta.tsx` |
| B6 / D11 | Mis compras / detalle | `app/compras/` |
| D12 / D13 | Recepción y reseña / reclamo | `app/pedido/recepcion/[id].tsx`, `app/pedido/reclamo/[id].tsx` |
| D14–D16b | Deseos, seguidos, direcciones | `app/deseos.tsx`, `app/seguidos.tsx`, `app/direcciones/` |
| B1 | Vivos | `app/(buyer)/vivos.tsx` |
| B2/B3 · B4 | Sala · catálogo del vivo | `app/vivo/[id].tsx`, `app/vivo/catalogo/[id].tsx` |
| B7 | Mensajes | `app/mensajes.tsx`, `app/chat/[sellerId].tsx` |
| C1 | Resumen del vendedor | `app/(seller)/resumen.tsx` |
| E1 / E2 / E3 | Catálogo / editor de producto / stock | `app/(seller)/catalogo.tsx`, `app/vendedor/producto.tsx`, `app/variante/[id].tsx` |
| E4 / E4b | Paquetes / editor | `app/vendedor/paquetes.tsx`, `app/vendedor/paquete.tsx` |
| E5 / E6 | Pedidos / detalle | `app/(seller)/pedidos.tsx`, `app/vendedor/pedidos/[id].tsx` |
| E7 / E8 | Cobros / datos para cobrar | `app/vendedor/cobros/` |
| E10 / E11 / E11b / E12 | Mi tienda / mi plan / Premium / reseñas | `app/vendedor/` , `app/plan/premium.tsx` |
| C8 | Mensajes del vendedor | `app/(seller)/mensajes.tsx`, `app/vendedor/mensajes/[buyerId].tsx` |
| E9 / C7 / C7b | Armar el vivo / al aire / fin | `app/transmitir/` |

Código compartido en `src/`: `api.ts` (REST + socket), `session.tsx` (sesión y badges),
`hooks.ts`, `live.tsx` (LiveKit), `ui.tsx` (componentes), `theme.ts` (tokens), `Thread.tsx`.

## Pendiente

- Notificaciones push (`expo-notifications`): hoy los avisos se ven dentro de la app.
- "Avisarme cuando salga" por lote (B4) y "Avisarme si vuelve" en productos agotados.
- Reordenar la cola arrastrando (E9): hoy con flechas ↑ ↓.
- Fotos arrastrables en el editor (E2): la portada se elige tocando la foto.

**Revisión de Apple — plan Premium.** El handoff cobra Premium por QR, fuera de la app. Apple
suele exigir su compra integrada cuando un pago desbloquea funciones *dentro* de la app (aquí,
transmitir). Antes de enviar a revisión conviene decidir entre: cobrar Premium solo desde la
web/panel sin mencionarlo en la app, ofrecerlo también por compra integrada, o consultar a
Apple. Las compras de productos físicos sí pueden pagarse por QR (guía 3.1.3(e)).

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
vendedor Premium `70000000` / `vender123`, vendedores Básico `70000001` y `70000002` / `vender123`.

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
