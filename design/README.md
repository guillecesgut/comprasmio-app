# Handoff: ComprasMío! — app iOS (Expo / React Native)

## Overview
ComprasMío! es un marketplace de **subastas en vivo + compra a precio fijo** para Bolivia (español con voseo, moneda `Bs 1.234`, pago **solo por QR** con comprobante). Hoy existe como webapp (`ComprasMio-Web/`: Vite + React + Express + WebSocket + LiveKit). Este paquete define el **rediseño completo como app nativa iOS**, para implementarse con **Expo (React Native)** y publicarse en App Store. El backend actual (`server/`) se reutiliza tal cual: mismas rutas REST, mismo socket, mismos tokens de LiveKit.

Dos roles, dos apps dentro de un mismo binario (el rol se elige al registrarse y es definitivo):
- **Comprador**: Inicio (vivos), Sala en vivo, Pago QR, Compras, Mensajes, Favoritos.
- **Vendedor**: Resumen, Productos, Órdenes, Clientes, Transmitir (armar cola + salir al aire).

## About the Design Files
Los archivos de este paquete son **referencias de diseño hechas en HTML**: prototipos que muestran el aspecto y el comportamiento esperados. **No son código de producción para copiar.** La tarea es **recrearlos en React Native con Expo** usando componentes nativos (expo-router, NativeTabs, sheets nativos, SF Symbols vía `expo-symbols`, etc.). Toda la lógica simulada del prototipo (bots que pujan, verificación automática a los 5 s) debe reemplazarse por el backend real (ver *State Management*).

Para abrirlos: servir la carpeta con cualquier servidor estático (`npx serve .`) y abrir los `.dc.html` en el navegador (dependen de `support.js` e `ios-frame.jsx` en la misma carpeta).

## Fidelity
**High-fidelity.** Colores, tipografía, radios, espaciados, copy y flujos son finales. Recrear pixel-perfect con primitivas nativas. Excepciones explícitas:
- Los **íconos** del HTML usan Material Symbols Rounded como sustituto → en la app usar **SF Symbols** (tabla de equivalencias abajo).
- Las **imágenes** son placeholders a rayas → reemplazar por fotos de producto / video real.
- El marco de iPhone (status bar, Dynamic Island) es del mock; no se implementa.

---

## Arquitectura recomendada

```
app/
  _layout.tsx                 # SessionProvider, theme, socket, fonts
  (auth)/welcome.tsx          # A1
  (auth)/role.tsx             # A2
  (auth)/auth.tsx             # A3 (segmented signup/login)
  (buyer)/_layout.tsx         # NativeTabs: index, favoritos, compras + search role
  (buyer)/index.tsx           # B1 Inicio
  (buyer)/favoritos.tsx       # B8
  (buyer)/compras/index.tsx   # B6
  (buyer)/compras/[sellerId].tsx  # B7 Mensajes (stack push)
  (seller)/_layout.tsx        # NativeTabs: resumen, productos, ordenes, clientes + botón Transmitir
  (seller)/index.tsx          # C1
  (seller)/productos.tsx      # C2
  (seller)/ordenes.tsx        # C4
  (seller)/clientes/index.tsx # C8
  (seller)/clientes/[buyerId].tsx # hilo (mismo componente que B7)
  vivo/[id].tsx               # B2/B3 — presentation: 'fullScreenModal'
  vivo/[id]/catalogo.tsx      # B4 — formSheet, detents [0.55]
  pago/[orderId].tsx          # B5 — formSheet, detents [1], grabber
  producto/nuevo.tsx          # C3 — formSheet [1]  (también /producto/[id] para editar)
  comprobante/[orderId].tsx   # C5 — formSheet [1]
  transmitir/armar.tsx        # C6 — formSheet [1]
  transmitir/[id].tsx         # C7 — fullScreenModal, sin gesto de cierre
  cuenta.tsx                  # hoja de cuenta — formSheet [0.45]
```

Rutas por rol: si `user.role === 'seller'` → `(seller)`, si no → `(buyer)`. Sin sesión → `(auth)`. Mientras se resuelve la sesión, splash con el logomark (no mostrar tabs de un rol antes de saber cuál es — ya lo hace `App.tsx` web).

### Librerías
| Necesidad | Paquete |
|---|---|
| Navegación, tabs Liquid Glass | `expo-router` (NativeTabs) |
| Sheets con detents | `expo-router` `presentation: 'formSheet'`, `sheetAllowedDetents`, `sheetGrabberVisible: true` |
| Video en vivo (ver / publicar) | `@livekit/react-native` + `@livekit/react-native-webrtc` → **requiere development build** (no Expo Go) |
| Íconos | `expo-symbols` (SF Symbols) |
| Blur / vidrio | `expo-blur` (`BlurView`, intensity 60–80, tint `systemChromeMaterial` / `dark`) |
| Hápticos | `expo-haptics` |
| Guardar QR en Fotos | `expo-media-library` (+ `expo-file-system` para escribir el PNG base64) |
| Comprobante | `expo-image-picker` (Fotos / Cámara) y `expo-document-picker` (PDF) |
| Notificaciones | `expo-notifications` (APNs) |
| Pantalla encendida al transmitir | `expo-keep-awake` |
| Live Activity / Dynamic Island | target WidgetKit con `@bacons/apple-targets` + ActivityKit (Swift) |
| Build / publicación | EAS Build + EAS Submit |

Permisos (`app.json → ios.infoPlist`): `NSCameraUsageDescription` ("Para transmitir en vivo y fotografiar comprobantes"), `NSMicrophoneUsageDescription` ("Para que la sala te escuche durante el vivo"), `NSPhotoLibraryAddUsageDescription` ("Para guardar el código QR de pago"), `NSPhotoLibraryUsageDescription` ("Para adjuntar el comprobante de tu transferencia"). `UIBackgroundModes: ["audio", "voip"]` si se quiere seguir oyendo el vivo con la app en segundo plano / PiP.

---

## Design Tokens

### Color
| Token | Hex | Uso |
|---|---|---|
| `tint` / Verde Mercado | `#0E7C66` | Color de marca y tinte global. Comprar ya, confirmar, botón primario, check, tab activo |
| `tintText` / Verde texto | `#0A6350` | Texto verde sobre claro (precios, links, tab activo label) |
| `forest` / Verde Bosque | `#0A3B31` | Tarjeta KPI oscura, avatar propio, fondo sala |
| `bid` / Ámbar Puja | `#AE5115` | **Solo** subasta y "en vivo": botón ¡Mío!, pill EN VIVO, badges, botón Transmitir |
| `bidText` | `#8E4211` | Texto ámbar sobre claro |
| `bidLight` / Ámbar claro | `#E9A23B` | Solo sobre oscuro: reloj urgente, punto del logo, corazón activo |
| `mint` | `#7FD8B8` | "Vas ganando", progreso de stock, barra destacada (sobre oscuro) |
| `groupedBg` | `#F4F2EE` | Fondo de pantallas (systemGroupedBackground) |
| `surface` | `#FFFFFF` | Celdas / tarjetas |
| `fill` | `#E6E1D8` | Segmented control, search field, botones circulares en sheets |
| `fill2` | `#F2EEE7` | Botón tonal (Ya tengo cuenta), botones circulares claros |
| `separator` | `#E4DCD0` (filas `#EEE8DF`) | Hairline 0.5 px |
| `label` | `#201F1B` | Texto principal |
| `secondaryLabel` | `#6B6455` | Texto secundario (≥4.5:1 sobre blanco) |
| `tertiary` | `#B0A797` | Chevrons, íconos decorativos |
| `destructive` | `#D23B2C` | Borrar, Terminar vivo |
| Chips de estado | ver tabla Estados |

Estados de orden (fondo / texto):
- `pendiente` "Pendiente de pago" → `#FBE9DC` / `#8E4211`
- `en_revision` "En revisión" → `#E4F0EA` / `#0A4A3C`
- `verificado` "Verificado" → `#0E7C66` / `#FFFFFF`
- `enviado` "Enviado" → `#EDE8E0` / `#4C463C`

Chips de forma de venta: Subasta `#FBE9DC`/`#8E4211` (sólido sobre foto: `#AE5115`/blanco); Precio fijo `#E4F0EA`/`#0A4A3C` (sólido: `#0E7C66`/blanco).

Regla: **verde = comprar/confirmar, ámbar = pujar/en vivo**. Nunca un botón ámbar y uno verde llenos juntos; un solo CTA lleno por pantalla.

### Tipografía
Sistema (SF Pro) con Dynamic Type. **Public Sans Bold** solo para el logotipo (`ComprasMío` + `!` en `#AE5115`), tracking −3 %.
| Estilo | Tamaño / interlínea | Peso | Uso |
|---|---|---|---|
| Large Title | 34 / 41, tracking −0.4 | 700 | Títulos de tab |
| Title 1 | 28 / 34 | 700 | Títulos de sheet ("¿Qué vendés hoy?") |
| Title 2 | 22 / 28 | 600 | Títulos de sheet / sección ("Para vos") |
| Headline | 17 / 22 | 600 | Botones, títulos de celda |
| Body | 17 / 22 | 400 | Celdas de formulario |
| Callout | 16 / 21 | 400–600 | Títulos de fila en listas, burbujas de chat |
| Subhead | 15 / 20 | 400 | Secundarios |
| Footnote | 13 / 18 | 400–600 | Encabezados de sección (MAYÚSCULAS, tracking +0.03em, 600), notas |
| Caption 1 | 12 / 16 | 600 | Chips |
| Caption 2 | 10 / 13 | 500–600 | Labels de tab |
| Precio sala | 36, tracking −0.6 | 700 | Precio en dock del vivo |
| Reloj | 30 | 600 | Cuenta atrás, `fontVariant: ['tabular-nums']` |

Todos los precios, relojes y contadores: `fontVariant: ['tabular-nums']`.

### Espaciado, radios, sombras
- Margen lateral de pantalla: **16** (contenido de lista) / **20** (títulos). Encabezados de sección con sangría **32**.
- Gap entre tarjetas: 10–12. Gap grid de vivos: 18 vertical × 12 horizontal.
- Padding de celda: 12–16 vertical × 16 horizontal; alto de fila de formulario **50–52**.
- Radios: listas agrupadas / tarjetas **22** (formulario de auth 26); tarjeta de vivo **18**; destacado **26**; thumbnails 10–14; sheets **38** (esquinas superiores); dock de la sala **34**; **todos los botones y chips: pill (999)**.
- Botón primario: alto **54** (56 en la sala), radio pill, 17/600. Secundario: 40–46. Botón circular: **44** (mínimo táctil). Tab bar: alto **62**.
- Sombras: solo en la tab bar flotante y el botón Transmitir (`0 8 28 rgba(0,0,0,.08)`; Transmitir `rgba(174,81,21,.35)`) y toasts (`0 8 28 rgba(0,0,0,.16)`). Nada más tiene sombra — jerarquía por superficie y hairlines.

### Materiales
- Tab bar flotante (iOS 26 Liquid Glass): `rgba(255,255,255,.8)` + blur 24 + saturate 180 %, borde 0.5 `rgba(0,0,0,.08)`. Con NativeTabs esto lo da el sistema.
- Controles sobre video: `rgba(0,0,0,.3)` + blur 20.
- Dock de la sala: `rgba(8,28,23,.62)` (subasta) / `rgba(30,24,18,.62)` (precio fijo) + blur 30, borde 0.5 `rgba(255,255,255,.14)`.
- Panel del vendedor al aire: `rgba(250,247,242,.95)` + blur 30 (claro para leer cifras con cualquier luz).

### Íconos (Material → SF Symbol)
home→`house.fill` · favorite→`heart` / `heart.fill` · shopping_bag→`bag` / `bag.fill` · search→`magnifyingglass` · notifications→`bell` · notifications_active→`bell.badge.fill` · arrow_back_ios_new→`chevron.backward` · keyboard_arrow_down→`chevron.down` · chevron_right→`chevron.forward` · visibility→`eye` · inventory_2→`shippingbox` · ios_share→`square.and.arrow.up` · picture_in_picture_alt→`pip.enter` · videocam→`video.fill` · bar_chart→`chart.bar.fill` · receipt_long→`list.bullet.rectangle` · group→`person.2.fill` · add→`plus` · close→`xmark` · check→`checkmark` · check_circle→`checkmark.circle.fill` · radio_button_unchecked→`circle` · timer→`timer` · emoji_events→`trophy.fill` · download→`arrow.down.to.line` · photo_library→`photo.on.rectangle` · photo_camera→`camera` · folder→`folder` · chat_bubble→`bubble.left.fill` · call→`phone` · arrow_upward→`arrow.up` · edit→`pencil` · delete→`trash` · add_photo_alternate→`photo.badge.plus` · unfold_more→`chevron.up.chevron.down` · drag_handle→`line.3.horizontal` · flip_camera_ios→`arrow.triangle.2.circlepath.camera` · mic / mic_off→`mic.fill` / `mic.slash.fill` · flashlight_on→`flashlight.on.fill` · local_shipping→`shippingbox.fill` · receipt→`doc.text` · logout→`rectangle.portrait.and.arrow.right`.

---

## Screens / Views
Referencias: `ComprasMio iOS.dc.html` (lienzo estático con anotaciones, IDs A1…C8) y `ComprasMio Prototipo.dc.html` (todo navegable). Lienzo del mock: iPhone 402 × 874 pt; contenido arranca en y = 62 (bajo status bar).

### A1 · Bienvenida
- Fondo blanco. Imagen hero 16 pt de margen, alto 430, radio 34 (foto: vendedora en vivo).
- Bloque texto (padding 28): logomark 34 pt + wordmark 21; título "Subastas y compras en vivo." (34/700); bajada "Pujá, comprá al toque y pagá por QR. Tu dinero, siempre a la vista." (17, secondary).
- Abajo (padding 24, 50 inferior): "Crear cuenta" (primario verde) y "Ya tengo cuenta" (tonal `#F2EEE7`, texto label). Gap 12.

### A2 · ¿Qué querés hacer?
- Back circular 44. Large title + "Elegí con qué cuenta vas a entrar."
- Lista agrupada (radio 26) con 2 filas de selección única: icono 44 radio 12 (verde `bag.fill` / ámbar `video.fill`), título 17/600 "Quiero comprar" / "Quiero vender", sub 14 "Entrá a los vivos, pujá y comprá al toque." / "Transmití en vivo y cobrá por QR.", trailing `checkmark.circle.fill` (verde o ámbar según rol) o `circle` `#C9C1B5`.
- Footnote "Esta elección es definitiva: cada rol tiene su propia app."
- CTA "Continuar como comprador|vendedor".

### A3 · Crear cuenta / Iniciar sesión
- Back + segmented (alto 36, fondo `#E6E1D8`, segmento activo blanco 600) "Crear cuenta | Iniciar sesión".
- Título 28/700 "Creá tu cuenta" / "Hola de nuevo". En signup, línea de rol (ícono + "Cuenta de comprador" verde / "Cuenta de vendedor" ámbar).
- Formulario agrupado: Nombre (solo signup) · Celular con prefijo fijo "+591" · Contraseña. Label fijo 104 pt + campo.
- `textContentType`: `name`, `telephoneNumber`, `newPassword`/`password`; `keyboardType: 'phone-pad'`.
- Validación: nombre ≥ 2 car., celular ≥ 8 dígitos, contraseña ≥ 6. Botón al 45 % de opacidad hasta ser válido.
- Footnote signup: "Te mandamos los avisos de tus pujas y pagos a este número."
- API: `POST /api/auth/signup {name, phone, password, role}` · `POST /api/auth/login {phone, password}` → guardar `token` en `expo-secure-store` (no AsyncStorage).

### B1 · Inicio (comprador)
- Header: logomark 30 a la izquierda; a la derecha botones circulares 44 blancos: campana (notificaciones) y avatar (iniciales sobre `#0A3B31`) → abre hoja Cuenta.
- Large title "En vivo ahora". Search field pill 40 (`#E6E1D8`) "Buscar productos, vendedores…" → en nativo usar `headerSearchBarOptions` o el rol `search` de NativeTabs.
- Segmented "Todo | ● Subastas | ● Precio fijo" (puntos 7 pt ámbar/verde).
- **Destacado** (solo con filtro Todo y sin búsqueda): tarjeta 236 alto, radio 26, video/foto full-bleed; arriba pills "EN VIVO" (ámbar, 12/700, tracking .04em) y "👁 1.204"; abajo gradiente a `rgba(5,30,24,.85)` con vendedor · rating (13 `#C7DDD5`), título 22/600, "Desde Bs 850" y pill blanca "Entrar".
- Encabezado "Para vos" (22/600) + "12 transmisiones" (15 secondary).
- Grid 2 columnas de tarjetas: imagen 3:4 radio 18 con pill de espectadores (top-left, `rgba(0,0,0,.42)`, punto `#E9A23B`), corazón (top-right, círculo 32 `rgba(0,0,0,.32)`; activo `heart.fill` `#E9A23B`), chip de modo (bottom-left sólido). Debajo: vendedor 13 secondary, título 15/600, precio 15/700 `#0A6350` + nota 13 ("inicial" | "8 u.").
- Vacío: tarjeta "Nada con ese filtro" + "Probá con otra búsqueda: los vivos entran y salen todo el día."
- Datos: `GET /api/streams?mode=&q=`; socket canal `feed`: `stream:update` (merge), `stream:started` (refetch), `stream:ended` (quitar). Pull-to-refresh.

### B2 · Sala en vivo — subasta
`presentation: 'fullScreenModal'`, fondo negro, video LiveKit a pantalla completa (`objectFit: cover`). Status bar clara.
- **Top bar** (y 62, ±16): `chevron.down` 44 (cerrar) · pill "EN VIVO" ámbar · pill espectadores · spacer · pill "Catálogo (n)" con contador blanco → abre B4.
- **Vendedor** (y 118): avatar 38, nombre 15/600, rating 12 `#E9A23B` ("★ 98 % · 312 ventas"), pill "Seguir" (borde blanco 60 %) / "✓ Siguiendo" (fondo blanco 20 %).
- **Riel derecho** (círculos 48): corazón (seguir), compartir (`Share`), PiP.
- **Chat overlay** (izquierda, máx. 5 mensajes, opacidad creciente .4→1, text-shadow): `**handle** texto`; mensajes del vendedor con handle `#A8D8C6`; eventos de puja como pill ámbar `@marcoq pujó Bs 900`.
- **Composer** pill 44 vidrio: "Escribí un comentario…" + botón enviar 34.
- **Dock** (bottom 24, ±10, radio 34, vidrio oscuro):
  - Izquierda: "PUJA ACTUAL" (12/600 tracking .05em `#B9CCC5`), precio 36/700, línea de estado: "Vas ganando" (`#7FD8B8`) / "@handle va ganando" / "Todavía nadie pujó".
  - Derecha: "QUEDAN", reloj 30/600 (blanco; **`#E9A23B` en los últimos 5 s**), "Lote 3 de 6".
  - Fila de producto (separador superior): thumb 40, nombre 15/600, "Envío a convenir · sube de a Bs 50".
  - Si el lote cerró: banda `rgba(255,255,255,.12)` "@x se lo llevó por Bs 900 · sigue el próximo".
  - CTA 56 pill ámbar: **"¡Mío! · Bs 900"** (precio + incremento). Si vas ganando: "Vas ganando · Bs 900" al 55 %. Últimos 5 s: halo `0 0 0 6px rgba(233,162,59,.45)` pulsante.
- Hápticos: `impactAsync(Medium)` al pujar; `notificationAsync(Success)` al ganar; `selectionAsync` al ser superado.
- Al ganar (`auction:won`) se presenta automáticamente B5.
- API: `GET /api/streams/:id` (stream, lot, messages, queue) · `POST /api/streams/:id/bid {amount: price+increment}` · `POST /api/streams/:id/chat` · `GET /api/streams/:id/token` (LiveKit viewer). Socket canal `stream:<id>`: `lot:update`, `lot:tick {timer, price}`, `lot:closed {outcome}`, `chat:new`, `stream:viewers`, `queue:update`, `auction:won {order}`, `purchase:done {order}`, `stream:ended`.
- Sin video (`videoStatus !== 'live'`): mostrar el bloque de color del stream y el texto "Conectando con el video…" / "El vendedor todavía no abrió su cámara".

### B3 · Sala en vivo — precio fijo
Igual que B2 con: label "PRECIO FIJO", sub "Lo compra quien llega primero", derecha "QUEDAN 5 u. / de 8", barra de progreso 4 pt (`#7FD8B8` sobre blanco 16 %), envío en `#7FD8B8` si es gratis, dock con tinte cálido, **CTA verde "Comprar ya · Bs 320"** (o "Agotado"). Compras de otros llegan como toast blanco arriba ("✓ @luciam compró 1 aguayo"). API: `POST /api/streams/:id/buy`.

### B4 · Catálogo del vivo (sheet ~55 %)
Sheet blanco radio 38, grabber. Título "Catálogo de este vivo" (22/600) + "Salen al aire en este orden." + cerrar 36. Filas: número (ámbar si está en el aire), thumb 48, nombre 16/600, chip de modo + "Desde Bs 600" / "Bs 90 · 12 u." / "En el aire" (ámbar). Fila actual con fondo `#FBF3EC`. Campana por fila → suscribir aviso push cuando ese producto salga (requiere endpoint nuevo).

### B5 · Pago por QR (sheet completo)
Sheet `#F4F2EE`, se abre solo al ganar / comprar.
1. Encabezado: "🏆 ¡Ganaste el lote!" (13/600 verde; para precio fijo "✓ Compra reservada") + "Pagá tu compra" 22/600 + cerrar.
2. Banner ámbar suave `#FBE9DC`: ícono timer + "Tenés **4:32** para pagar. Si no, el lote puede volver a subasta." (cuenta atrás de 5:00).
3. Resumen agrupado: producto + monto · Envío ("Envío gratis" / "A convenir") · **Total** 24/700 verde.
4. Tarjeta QR: imagen QR 116 (de `GET /api/orders/:id/qr` → `qr` data-URI), banco, titular, cuenta, ref; botón contorno "Guardar en Fotos" → `MediaLibrary.saveToLibraryAsync` (resuelve el problema de Safari documentado en `Pay.tsx`).
5. "COMPROBANTE": lista con "Elegir de Fotos" / "Sacar foto" / "Archivos (PDF)". Una vez elegido → tarjeta verde "Comprobante listo · IMG_2048.jpg" + "Cambiar".
6. Footer fijo: "Confirmar pago · Bs 900" (deshabilitado 45 % hasta adjuntar) → `POST /api/orders/:id/receipt` (multipart `receipt`) → navegar al hilo con el vendedor (B7).

### B6 · Compras
Large title + "Todo se paga por transferencia QR". Arriba, **tarjetas de pendientes** (una por orden `pendiente_pago`): thumb 60, producto, total verde, "vendedor · #ref", chip "Pendiente de pago · 4:32", botones "Pagar ahora" (ámbar 40) + chat circular. Luego sección "ANTERIORES" en lista agrupada con chip de estado y chevron → hilo. Badge en el tab con nº de pendientes. Socket `order:update` actualiza filas en vivo.

### B7 · Mensajes (comprador ↔ vendedor)
Nav compacta: back, avatar 32 + nombre centrado, botón llamar. Tarjeta fijada con la orden (thumb, "Producto · Bs 900", ref, chip de estado). Burbujas radio 20, max 76 %: propias `#0E7C66`/blanco a la derecha, ajenas `#EFEBE4` a la izquierda. Composer: "+" (adjuntar foto), campo pill con borde `#E4DCD0` "Escribile a …", enviar circular verde (40 % si vacío). `KeyboardAvoidingView`. API: `GET/POST /api/threads/:sellerId`; socket `thread:new`.

### B8 · Favoritos
Large title + "Los vendedores que seguís". Sección "EN VIVO AHORA" (encabezado ámbar): avatar 50 con anillo ámbar (2.5 blanco + 2 `#AE5115`), nombre, "título · espectadores" ámbar, pill "Entrar". Sección "SIN TRANSMISIÓN": avatar sin anillo, "Próximo vivo: jueves 20:00", campana toggle. API: `GET /api/seller/favorites`, `PUT /api/seller/favorites/:streamId`.

### B9 · Live Activity + Dynamic Island (nuevo)
Lock screen: tarjeta con thumb, "Relojería Andina · Lote 3", producto, reloj ámbar, "Vas ganando / Bs 900" y botón interactivo "Pujar Bs 950" (App Intent). Dynamic Island compacta: logomark + reloj. Se inicia al pujar por primera vez; el servidor la actualiza con push de ActivityKit en cada `lot:tick`/`lot:update`. **Requiere trabajo de backend** (enviar pushes APNs con token de la actividad).

### Hoja Cuenta
Sheet ~45 %: avatar 72, nombre 22/600, "Comprador · +591 71234567", lista: Notificaciones · **Cerrar sesión** (rojo) → borrar token, `realtime.reset()`, volver a A1.

### C1 · Resumen (vendedor, incluye Ventas)
Header: nombre de la tienda (15 secondary), campana, avatar ámbar. Large title "Resumen". Segmented "Hoy | Semana | Mes". Grid 2 col:
- Tarjeta ancho completo `#0A3B31`: "Ingresos verificados", **Bs 12.480** 38/700, gráfico de barras 7 columnas (barras `#1F6B59`, día actual `#7FD8B8`, radio 6).
- "Por verificar" **Bs 1.350** ámbar + "3 comprobantes" → toca → Órdenes filtradas "En revisión".
- "Ticket promedio" Bs 271 + "46 órdenes".
Secciones: "POR FORMA DE VENTA" (barras 8 pt ámbar/verde con montos), "MEJORES COMPRADORES". API: `GET /api/seller/overview`, `GET /api/orders/seller/summary`.

### Tab bar vendedor
NativeTabs: Resumen · Productos · Órdenes (badge = órdenes `en_revision`) · Clientes. **Botón Transmitir** circular 62 ámbar (`video.fill`) separado a la derecha, en el lugar donde iOS 26 pone la búsqueda → abre C6.

### C2 · Productos
Botón "+" circular verde arriba a la derecha → C3. Large title, "24 en tu catálogo", chips "Todos | ● Subasta | ● Precio fijo" (activo `#201F1B`/blanco). Lista agrupada: thumb 52, nombre, chip de modo + "Desde Bs 600 · mín. Bs 750" / "Bs 90 · 12 u.". Vendidos al 50 % con chip "Vendido". **Swipe actions nativas**: Editar (`#8E877B`) / Borrar (`#D23B2C`) → Borrar confirma con `Alert` ("¿Borrar "X" de tu catálogo?"). API: `GET/POST/PATCH/DELETE /api/products`.

### C3 · Nuevo / Editar producto (sheet)
Barra: cerrar (izq.) · "Nuevo producto" · check verde (der., 45 % hasta válido). Fila de fotos: tile punteado 84 "Fotos" + miniaturas 84 radio 16. Agrupado: nombre · Categoría (menú pull-down: Relojes, Accesorios, Ropa, Electrónica, General). "FORMA DE VENTA" segmented Subasta/Precio fijo. Campos dependientes:
- Subasta: "Precio inicial Bs" + "Precio mínimo Bs" + nota "El mínimo solo lo ves vos. Si la puja no llega, el lote cierra sin venta."
- Precio fijo: "Precio Bs" + "Unidades u." + nota "Se vende hasta agotar las unidades durante el vivo."
"ENVÍO": "Envío gratis — Lo asumís vos" / "A convenir — Se coordina por chat" (check verde). Teclado `number-pad`. Válido = nombre + precio > 0.

### C4 · Órdenes
Large title. Chips horizontales con contador: Todas · En revisión · Sin pagar · Verificadas · Enviadas. Nota "Verificá el comprobante antes de despachar." Tarjetas: thumb, producto, total, "@comprador · #ref · hace 3 min", chip de estado, acciones según estado:
- `en_revision` → "Revisar y verificar" (verde) → C5
- `verificado` → "Marcar enviado" (contorno verde) → `POST /api/orders/:id/ship`
- `pendiente_pago` → texto "Esperando comprobante…"
- `enviado` → "🚚 En camino"
Siempre: chat circular → hilo con el comprador. Socket `order:new`, `order:update`.

### C5 · Revisar comprobante (sheet)
"#CM-2048 · @marcoq" + "Revisar comprobante". Imagen del comprobante alto 360 radio 22 (pinch-to-zoom; tap → visor pantalla completa). Agrupado: Monto esperado (bold) · Producto · Subido. Footer: **"Verificar pago de Bs 900"** (repite el monto) → `POST /api/orders/:id/verify` + `notificationAsync(Success)`; link "Escribir a @marcoq".

### C6 · Armar la transmisión (sheet)
"¿Qué vendés hoy?" 28/700 + "Tocá en el orden en que van a salir." Lista de productos no vendidos: círculo 26 (vacío con borde `#C9C1B5`; seleccionado verde con número de orden), thumb 44, nombre, sub ámbar/verde según modo. Reordenable (drag handle) en la versión nativa. Footer ámbar "🎥 Salir al aire con 3 productos" (45 % sin selección). Al confirmar: permisos cámara + micrófono → `POST /api/streams {title}` → `POST /api/streams/:id/queue {productIds}` → C7.

### C7 · Al aire (vendedor)
Full-screen, cámara a pantalla completa (LiveKit publish con `canPublish`). Top: pill "AL AIRE · 24:08" ámbar, espectadores, "Terminar" rojo (confirmar con `Alert`). Riel derecho (46): girar cámara, micrófono (ámbar si silenciado), linterna, chat. Chat overlay izquierda. **Panel claro** inferior (radio 34):
- Con lote: chip de modo + nombre; precio 32/700; "@marcoq va ganando · 14 pujas" / "3 de 8 vendidas · Bs 960"; reloj 30 (ámbar ≤ 5 s) o "5 u."; botones "Cerrar lote|oferta" (contorno) + "+30 s" (tonal, solo subasta).
- Sin lote: resultado del último ("Lote vendido — @x se llevó … por Bs …" / "Sin venta — La puja llegó a Bs X y tu mínimo era Bs Y." / "Oferta cerrada — Vendiste N u. …") o "Estás al aire".
- Fila "SIGUE · 2 en cola" + nombre + "Iniciar subasta" (ámbar) / "Abrir oferta" (verde); 40 % mientras hay lote activo.
`expo-keep-awake` activo. Si la app pasa a segundo plano, advertir que la sala deja de ver la cámara. API: `POST /api/streams/:id/queue/next`, `DELETE /api/streams/:id/lot`, `POST /api/streams/:id/end`. (Nota: "+30 s" requiere endpoint nuevo.)

### C8 · Clientes
Large title + "Cada fila abre el chat con ese comprador". Lista: avatar 44, @handle, hora del último mensaje, preview ("Vos: …" si es propio), punto verde 10 si no leído. Toca → hilo (mismo componente que B7, vista vendedor). API: `GET /api/seller/customers`, `GET/POST /api/seller/customers/:id/thread`.

---

## Interactions & Behavior
- **Toasts**: pill blanca 95 % con blur, arriba centrada (y 58), ícono check verde, 14/600 `#0A3B31`, 2.6 s. Usar para confirmaciones ("Pago verificado · @marcoq ya lo ve", "QR guardado en Fotos", "Ahora seguís a …").
- **Presión**: todos los botones `opacity .7–.75` o `scale(.97–.98)` al presionar (Pressable).
- **Tabs**: cambio sin animación (nativo). Badges ámbar 18 pt.
- **Sheets**: grabber 36×5 `#D4CCBF`; backdrop `rgba(0,0,0,.4)` tocable para cerrar (excepto pago con comprobante a medio subir).
- **Swipe de filas**: 150 pt de acciones, transición 250 ms ease.
- **Sala**: el chat se recorta a los últimos 5; transición de `box-shadow` .3 s en el CTA; progreso de stock `width .4s`.
- **Anti-sniping** (ya en servidor): pujas en los últimos segundos extienden el reloj (el prototipo lleva a 8 s).
- **Cerrar sala**: swipe down o `chevron.down`; vuelve al tab de origen.
- **Errores**: mensajes del servidor (`ApiError.message`) en línea ámbar dentro del dock o en toast; sin conexión → punto rojo en header (como `offline-dot` web).
- **Vacíos**: copy exacto en cada pantalla (ver prototipo).

## State Management
- `SessionContext`: `user {id, name, phone, role, handle}`, `token` (SecureStore), `favorites: string[]`, `online`.
- `Realtime` (reusar la clase de `web/src/api.ts`, cambiando la URL base por `EXPO_PUBLIC_API_URL` → `wss://…/ws?token=`). Reconectar en `AppState` → `active`.
- Sala: `stream`, `lot {mode, price, increment, timer, leaderId, leaderHandle, stock, sold, lotNo, productName}`, `messages[]`, `queue[]`, `payOrder`, `notice`, `busy`.
- Pago: `payment {qr, bank, account, holder, total, ref}`, `receipt (uri, name, mime)`, `busy`, cuenta atrás derivada de `order.createdAt + 5 min`.
- Vendedor: `pendingCount` (en_revision) para el badge, `refreshKey` al recibir `order:new` / `order:update`, broadcast `{status, muted, lot, outcome, queue, viewers}`.
- Recomendado: TanStack Query para REST + invalidación desde eventos del socket.

## Backend: lo que ya existe vs. lo nuevo
Existe (sin cambios): auth, streams, bid/buy/chat, orders + QR + receipt, verify/ship, products CRUD, queue/next, lot open/close, end, favorites, threads, notifications, LiveKit tokens.
Nuevo para la versión iOS:
1. Registro de **push token** (`POST /api/devices {expoPushToken}`) y envío en `auction:won`, `outbid`, `order:update`, `thread:new`, "salió en vivo" de un favorito.
2. **ActivityKit** push para Live Activity (B9).
3. "Avisarme cuando salga" por producto (B4) y "Próximo vivo" programado (B8).
4. `POST /api/streams/:id/lot/extend {seconds:30}` (C7 "+30 s").
5. Reordenar cola (C6 drag).
6. Servir el backend por **HTTPS/WSS** (requisito de iOS ATS).

## App Store — checklist
- Bundle ID, íconos (1024 sin transparencia: tile `#0E7C66` con bolsa blanca y punto `#E9A23B`, ver Brand Kit), splash `#FFFFFF` con logomark.
- Cuenta de prueba para revisión (compradora 71234567 / vendedor 70000000) y nota explicando el pago QR fuera de la app (no son bienes digitales → **no aplica IAP**).
- Borrado de cuenta dentro de la app (requisito de Apple) — añadir en hoja Cuenta.
- Moderación de chat en vivo: reportar/bloquear usuario (requisito para contenido generado por usuarios) — añadir en long-press de mensaje.
- Si se agrega login con Google/Facebook, también "Iniciar sesión con Apple".

## Assets
- Logomark y wordmark: ver `ComprasMio Brand Kit.dc.html` (bolsa con asa + punto ámbar; construir como SVG o PNG @1x/2x/3x).
- Fuente del logo: Public Sans Bold (Google Fonts, OFL) vía `expo-font`, solo para el wordmark.
- Imágenes: todas placeholder; usar fotos reales de producto y el video de LiveKit.
- Íconos: SF Symbols (ver tabla).

## Screenshots
Capturas @2x (804 × 1748 px, iPhone 402 × 874 pt) en `screenshots/`, tomadas del prototipo navegable. Ante cualquier duda entre README y captura, **manda la captura** para lo visual y el README para medidas y comportamiento.

| Archivo | Pantalla |
|---|---|
| `A1-bienvenida.png` | A1 Bienvenida |
| `A2-rol.png` | A2 ¿Qué querés hacer? |
| `A3-crear-cuenta.png` | A3 Crear cuenta (formulario completo) |
| `B1-inicio.png` | B1 Inicio con destacado y grid |
| `B2-sala-subasta.png` | B2 Sala subasta — usuario va ganando, pujas en el chat |
| `B3-sala-precio-fijo.png` | B3 Sala precio fijo |
| `B4-catalogo.png` | B4 Catálogo (sheet ½) sobre la sala |
| `B5-pago-qr.png` | B5 Pago QR (sin comprobante aún) |
| `B6-compras.png` | B6 Compras con orden pendiente |
| `B7-mensajes.png` | B7 Hilo con vendedor + orden fijada |
| `B8-favoritos.png` | B8 Favoritos |
| `C1-resumen.png` | C1 Resumen del vendedor |
| `C2-productos.png` | C2 Productos |
| `C3-nuevo-producto.png` | C3 Nuevo producto (sheet, vacío) |
| `C4-ordenes.png` | C4 Órdenes filtradas "En revisión" |
| `C5-revisar-comprobante.png` | C5 Revisar comprobante (sheet) |
| `C6-armar-transmision.png` | C6 Armar transmisión con 3 seleccionados |
| `C7-al-aire.png` | C7 Al aire con lote de subasta activo |
| `C8-clientes.png` | C8 Clientes |

Notas para leer las capturas: los íconos son Material Symbols (usar SF Symbols, ver tabla); las áreas a rayas son placeholders de foto/video; la tab bar flotante la dibuja el sistema con NativeTabs. B9 (Live Activity) solo está en `ComprasMio iOS.dc.html`.

## Files
- `ComprasMio Prototipo.dc.html` — **prototipo navegable completo** (comprador + vendedor, subasta en vivo simulada, pago, verificación, transmisión). Panel "Ir a" para saltar a cada pantalla.
- `ComprasMio iOS.dc.html` — lienzo de las 20 pantallas con anotaciones de kit nativo (IDs A1–C8) y sistema visual.
- `ComprasMio Brand Kit.dc.html` — brand kit (logo, paleta y su razonamiento, tipografía, tono de voz).
- `ios-frame.jsx`, `support.js` — necesarios para abrir los HTML; no forman parte del diseño.
- Código fuente de referencia (no incluido, en el repo del cliente): `ComprasMio-Web/web/src/{App.tsx, api.ts, live.ts, buyer/*, seller/*}` y `ComprasMio-Web/server/src/*`.
