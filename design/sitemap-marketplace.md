# Sitemap · ComprasMío! marketplace híbrido

Brief de diseño para **Claude Design**. Describe la parte nueva de la app (marketplace multivendedor, catálogo con variantes, pagos a través de la plataforma, liquidaciones semanales, planes y panel de administración) y los ajustes a las pantallas que ya existen.

- **Sistema visual:** el mismo del handoff iOS (`design/README.md`). Colores, tipografía, radios, materiales, íconos SF Symbols y tono de voz se mantienen. Este documento no redefine estilos: solo agrega pantallas, estados y componentes.
- **Plataformas:**
  - **App iOS** (Expo / React Native) para comprador y vendedor. Diseño mobile, 402 × 874 pt.
  - **Panel de administración web**, de escritorio primero (1440 px) y usable en tablet. Mismo lenguaje visual, adaptado a escritorio.
- **Idioma:** español de Bolivia con voseo, como el resto de la app. Moneda **Bs** con separador de miles con punto (`Bs 1.234`).
- **Regla de color de siempre:** verde = comprar / confirmar; ámbar = pujar / en vivo. Un solo CTA lleno por pantalla.

---

## 1. Qué cambia en el producto

| Antes | Ahora |
|---|---|
| App de transmisiones en vivo | **Marketplace** (catálogo permanente) **+ transmisiones en vivo** sobre el mismo catálogo |
| Producto con un modo fijo (subasta o precio fijo) | Producto de catálogo con **variantes** (talla, color…), cada una con precio y stock. El modo se elige **al cargarlo en un vivo** |
| El comprador paga al QR del vendedor y el vendedor verifica | **Modo plataforma:** el comprador paga al **QR de ComprasMío!**, la plataforma verifica y **liquida a cada vendedor una vez por semana**, con la comisión descontada |
| Un pedido = un producto | Un pedido por vendedor, con varios ítems. **Un carrito con varios vendedores se paga con una sola transferencia** |
| Todos los vendedores transmiten | **Plan Básico:** vende por catálogo con comisión. **Plan Premium:** monto fijo mensual, comisión más baja y transmisiones en vivo |
| Subasta de un producto por vez | Además, **paquetes**: varios productos o variantes combinados que se subastan juntos |
| No hay administración | **Panel web de administración**: pagos, liquidaciones, vendedores, reclamos, contenido, planes y configuración (incluido el QR de cobro) |

**Se mantiene igual:** cada subasta la inicia el vendedor a mano. Cuando un lote se vende, el siguiente no arranca solo; el vendedor lo muestra, conversa con la sala y toca **Iniciar subasta**.

---

## 2. Glosario de estados (usar estos textos exactos en chips y filtros)

### Pedido
| Clave | Texto en chip | Color del chip | Significado |
|---|---|---|---|
| `pendiente_pago` | Pendiente de pago | ámbar suave | El comprador todavía no subió el comprobante. Corre la ventana de pago |
| `pago_en_revision` | Pago en revisión | verde suave | Subió el comprobante; ComprasMío! lo está verificando |
| `pagado` | Pago confirmado | verde sólido | La plataforma confirmó el pago; el vendedor ya puede preparar el pedido |
| `preparando` | Preparando | gris | El vendedor está preparando el envío |
| `enviado` | Enviado | gris | En camino |
| `entregado` | Entregado | verde sólido | El comprador confirmó la recepción, o venció el plazo para confirmar |
| `en_reclamo` | En reclamo | rojo suave (`#F7DEDA` / `#9C2A1E`) | El comprador reportó un problema; el monto queda fuera de la liquidación |
| `cancelado` | Cancelado | gris claro | Cancelado o reembolsado |
| `vencido` | Venció el pago | gris claro | No se pagó a tiempo; el stock vuelve a estar disponible |

### Liquidación al vendedor (semanal)
| Clave | Texto | Significado |
|---|---|---|
| `acumulando` | Esta semana | Pedidos que van a entrar en el próximo corte |
| `programada` | Programada · lunes 3 nov | Corte hecho; la transferencia está pendiente |
| `pagada` | Pagada | ComprasMío! transfirió; tiene comprobante adjunto |
| `retenida` | Retenida | Monto apartado por un reclamo abierto |

### Stock de una variante
- **Disponible:** se puede comprar en el catálogo.
- **Apartado:** está en carritos con pago pendiente o en pedidos sin pagar (vence con la ventana de pago).
- **En vivo:** reservado para una transmisión activa.
- **Vendido:** pedidos pagados.

Fórmula que la interfaz debe reflejar: `disponible = stock − apartado − en vivo`.

### Plan del vendedor
- **Básico:** catálogo en el marketplace, comisión por venta (valor a definir, se ve como `X %`).
- **Premium:** monto fijo mensual (`Bs Y / mes`), comisión reducida (`Z %`), transmisiones en vivo, subastas y paquetes.

---

## 3. Mapa general

```
App iOS
├── Acceso (A1–A3, existentes)
├── Comprador
│   ├── Tab Inicio (marketplace)                D1
│   ├── Tab Buscar                               D3
│   ├── Tab Vivos (antes "Inicio")               B1 ajustada
│   ├── Tab Carrito                              D6
│   ├── Tab Cuenta                               D10
│   └── Pantallas apiladas y hojas
│       ├── Categoría                            D2
│       ├── Resultados de búsqueda               D4
│       ├── Producto                             D5
│       ├── Perfil público del vendedor          D9
│       ├── Checkout                             D7
│       ├── Pago por QR de ComprasMío!           B5 rediseñada → D8
│       ├── Pedido enviado / confirmación        D8b
│       ├── Mis compras y detalle de pedido      B6 ajustada + D11
│       ├── Confirmar recepción · Reseña         D12
│       ├── Reportar un problema (reclamo)       D13
│       ├── Lista de deseos · Seguidos           D14 · D15
│       ├── Direcciones                          D16
│       └── Sala en vivo, catálogo del vivo      B2–B4 ajustadas
├── Vendedor
│   ├── Tab Resumen                              C1 ajustada
│   ├── Tab Catálogo (antes "Productos")         E1
│   ├── Tab Pedidos (antes "Órdenes")            E5
│   ├── Tab Mensajes (antes "Clientes")          C8
│   ├── Botón Transmitir (Premium)               C6 v2 → E9
│   └── Pantallas apiladas y hojas
│       ├── Editor de producto con variantes     E2 (reemplaza C3)
│       ├── Stock de una variante                E3
│       ├── Paquetes                             E4
│       ├── Detalle de pedido                    E6
│       ├── Cobros y liquidaciones               E7
│       ├── Datos para cobrar                    E8
│       ├── Armar la transmisión v2              E9 (reemplaza C6)
│       ├── Al aire                              C7 ajustada
│       ├── Mi tienda (perfil público editable)  E10
│       ├── Mi plan                              E11
│       └── Reseñas recibidas                    E12
└── Hoja Cuenta (común)                          existente, ampliada

Panel de administración (web)
├── Ingreso                                      F0
├── Inicio                                       F1
├── Pagos por verificar                          F2
├── Pedidos                                      F3
├── Liquidaciones semanales                      F4
├── Reclamos                                     F5
├── Vendedores                                   F6
├── Compradores                                  F7
├── Suscripciones                                F8
├── Catálogo y moderación                        F9
├── Categorías                                   F10
├── Banners y destacados                         F11
├── Planes y comisiones                          F12
├── Configuración (QR de cobro, corte semanal…)  F13
└── Equipo y registro de actividad               F14
```

---

## 4. Navegación

### Comprador · tab bar flotante (5 ítems)
`Inicio` (`house`) · `Buscar` (`magnifyingglass`) · `Vivos` (`dot.radiowaves.left.and.right`, con un punto ámbar cuando hay vivos activos) · `Carrito` (`bag`, badge con la cantidad de unidades) · `Cuenta` (`person.crop.circle`).
El botón circular separado de búsqueda del diseño actual desaparece: Buscar pasa a ser una tab.

### Vendedor · tab bar flotante (4 ítems + botón)
`Resumen` · `Catálogo` · `Pedidos` (badge: pedidos con pago confirmado por preparar) · `Mensajes`, y el botón circular **Transmitir** ámbar a la derecha.
- **Premium:** abre E9.
- **Básico:** se ve igual pero en gris, con candado; al tocarlo abre una hoja que explica Premium (E11). No se oculta: es el principal motivo para subir de plan.

### Panel web
Barra lateral fija con las secciones de F1 a F14 agrupadas así:
- **Operación:** Inicio, Pagos por verificar, Pedidos, Liquidaciones, Reclamos.
- **Personas:** Vendedores, Compradores, Suscripciones.
- **Contenido:** Catálogo, Categorías, Banners.
- **Ajustes:** Planes, Configuración, Equipo.

Los contadores en la barra lateral muestran lo pendiente: pagos por verificar, reclamos abiertos y liquidaciones por transferir.

---

## 5. Comprador · pantallas nuevas (serie D)

### D1 · Inicio (marketplace)
Primera tab del comprador con sesión iniciada.
- **Encabezado:** logomark, campana y avatar, como en B1. Debajo, un campo de búsqueda pill que al tocarlo lleva a la tab Buscar.
- **Banner principal:** carrusel horizontal, radio 26, con indicador de páginas. Lo cargan los administradores (F11): imagen, título corto y destino (producto, categoría, vendedor o vivo).
- **Categorías:** fila horizontal de íconos circulares con nombre (Relojes, Ropa, Electrónica, Hogar, Coleccionables…) y "Ver todas".
- **En vivo ahora:** fila horizontal de tarjetas 3:4 con pill EN VIVO y espectadores. Solo se muestra si hay vivos; lleva a la sala (B2). Es el único lugar con ámbar en esta pantalla.
- **Destacados:** grid de 2 columnas de tarjetas de producto (definición en D-componentes).
- **Ofertas:** fila horizontal de productos con precio anterior tachado.
- **Vendedores destacados:** tarjetas con avatar, nombre, reputación, cantidad de productos y botón Seguir.
- **Recién llegados:** grid infinito al final.
- **Estados:**
  - Cargando: esqueletos de tarjetas.
  - Sin conexión: aviso arriba con reintento.
  - Sin vivos: la fila "En vivo ahora" no aparece.

### D2 · Categoría
- Título grande con el nombre de la categoría y chips de subcategorías.
- Barra de orden y filtros: Relevancia · Precio ↑↓ · Más nuevos; filtro de rango de precio y "Envío gratis".
- Grid de productos de 2 columnas, con el contador "128 productos".
- Vacío: "Todavía no hay productos en esta categoría."

### D3 · Buscar (tab)
- Campo de búsqueda con foco al entrar.
- Sin texto escrito: búsquedas recientes (borrables), categorías populares y "Buscado ahora".
- Al escribir: sugerencias de productos, vendedores y categorías.

### D4 · Resultados de búsqueda
- Segmentado: **Productos | Vendedores | Vivos**.
- Productos: grid de 2 columnas con filtros, igual que D2.
- Vendedores: lista con avatar, reputación y Seguir.
- Vivos: vivos activos que coinciden con la búsqueda.
- Vacío: "No encontramos «zapatillas rojas». Probá con otra palabra o mirá las categorías."

### D5 · Producto
- **Galería** a pantalla completa en ancho, 1:1, deslizable, con contador "1/5" y zoom al tocar.
- Botones circulares sobre la foto: volver, compartir y corazón (lista de deseos).
- **Bloque de precio:** precio grande (tabular), precio anterior tachado si hay oferta, y chip "Envío gratis" o "Envío a convenir".
- **Selector de variantes:** chips por atributo (Talla: S M L · Color: círculos de color). Las variantes agotadas se muestran tachadas y deshabilitadas. Al elegir una, se actualizan el precio, el stock ("Quedan 3") y la foto.
- **Cantidad:** stepper que no supera el disponible.
- **Tarjeta del vendedor:** avatar, nombre, reputación ("★ 98 % · 312 ventas"), insignia "Vendedor verificado" si corresponde, botones Seguir e Ir a la tienda (D9). Si el vendedor está en vivo, una pill ámbar "En vivo ahora · Entrar".
- **Descripción** expandible, **detalles** (categoría, estado, envío) y **reseñas** (promedio, 3 reseñas recientes y Ver todas).
- **Respaldo de la compra:** texto corto y fijo: "Pagás a ComprasMío! y le pagamos al vendedor. Si hay un problema con tu pedido, lo resolvemos con vos." (no prometer reembolso automático).
- **Barra inferior fija:** precio total y dos botones, **Agregar al carrito** (tonal) y **Comprar ahora** (verde lleno).
- **Estados:**
  - Variante sin elegir: los botones dicen "Elegí una talla".
  - Sin stock: "Agotado" con la opción "Avisarme si vuelve".
  - Producto en un vivo: aviso "Parte de este stock está en un vivo ahora" con link a la sala.

### D6 · Carrito (tab)
- **Agrupado por vendedor:** cada grupo es una tarjeta con el nombre del vendedor, sus ítems (foto, nombre, variante, stepper de cantidad, precio, quitar) y el subtotal con el envío de ese vendedor.
- Avisos por ítem: "Solo quedan 2" o "Ya no hay stock de esta variante" (con Quitar).
- **Resumen fijo abajo:** subtotal, envíos, total y botón **Continuar** (verde).
- Texto de apoyo: "Pagás todo junto con una sola transferencia. Cada vendedor prepara su parte."
- Vacío: ilustración simple de bolsa, "Tu carrito está vacío" y botón Explorar.

### D7 · Checkout
Pantalla apilada, no hoja.
- **Entrega:** dirección elegida (D16) con Cambiar, o "Retiro en persona" si el vendedor lo permite; teléfono de contacto.
- **Resumen por vendedor:** tarjetas compactas con ítems, envío y subtotal.
- **Total a pagar** grande.
- **Ventana de pago:** "Tenés 15 minutos para pagar y subir el comprobante. Mientras tanto te guardamos el stock." (el tiempo se configura en F13).
- Botón **Ir a pagar · Bs 1.240** (verde).

### D8 · Pago por QR de ComprasMío! (rediseño de B5)
Hoja completa. Ahora el QR es **de la plataforma**, no del vendedor, y no trae el monto: el comprador lo escribe en su app del banco.
1. Encabezado: "Pagá tu compra" con el contador regresivo de la ventana de pago (banner ámbar suave).
2. **QR de ComprasMío!**, la imagen que carga el administrador en F13, con el nombre del banco, el titular y el número de cuenta.
3. **Monto exacto** grande con botón Copiar.
4. **Código de referencia** (ej. `CM-48211`) en mono con botón Copiar e instrucción: "Escribilo en la glosa o el concepto de la transferencia."
5. Botón contorno **Guardar QR en Fotos**.
6. Sección COMPROBANTE: Elegir de Fotos / Sacar foto / Archivos (PDF), igual que B5.
7. Pie fijo: **Ya pagué · Enviar comprobante** (verde, deshabilitado hasta adjuntar).
- **Estados:**
  - Ventana vencida: "El tiempo para pagar terminó. Liberamos el stock; podés volver a intentarlo." con el botón Volver al carrito.
  - QR no configurado (error del sistema): "No pudimos cargar los datos de pago. Intentá de nuevo en unos minutos."

### D8b · Comprobante enviado
- Check grande verde y "Recibimos tu comprobante".
- "Lo verificamos en las próximas horas. Te avisamos cuando esté confirmado."
- Lista de los pedidos generados (uno por vendedor) con el chip "Pago en revisión".
- Botones: Ver mis compras y Seguir comprando.

### D9 · Perfil público del vendedor (tienda)
- Portada (imagen ancha) con avatar superpuesto, nombre, insignia de verificado, reputación, cantidad de seguidores, Seguir y Mensaje.
- Si está en vivo: banner ámbar "En vivo ahora" que lleva a la sala.
- Descripción corta, redes (TikTok, Instagram, WhatsApp) y "Vende en ComprasMío! desde 2026".
- Segmentado: **Productos | Reseñas | Próximos vivos**.
- Productos: buscador interno, chips de categorías del vendedor y grid de 2 columnas.
- Botón compartir: genera el link de la tienda para la biografía de TikTok o Instagram.

### D10 · Cuenta (tab)
Lista agrupada:
- Encabezado: avatar, nombre y teléfono.
- **Compras:** Mis compras (B6) · Lista de deseos (D14) · Vendedores que sigo (D15).
- **Datos:** Datos personales · Direcciones (D16) · Notificaciones.
- **Ayuda:** Cómo funciona el pago · Reclamos (D13) · Términos y privacidad.
- Cerrar sesión · Borrar cuenta (rojo, como en la hoja Cuenta actual).

### D11 · Detalle de pedido (comprador)
- Encabezado: referencia `CM-48211`, vendedor y fecha.
- **Línea de tiempo vertical** con los estados del glosario: Pagado → Preparando → Enviado → Entregado, con fecha y hora en cada paso alcanzado.
- Ítems, envío, total y comprobante adjunto (ver).
- **Acciones según estado:**
  - `pendiente_pago`: Pagar ahora (abre D8).
  - `enviado`: **Confirmar que lo recibí** (verde) y "Tengo un problema" (link).
  - `entregado`: Calificar (D12).
  - `en_reclamo`: estado del reclamo y chat con soporte.
- Botón Mensaje al vendedor (reutiliza B7).

### D12 · Confirmar recepción y reseña (hoja)
- "¿Recibiste todo bien?" con dos opciones: **Sí, todo bien** / **Tengo un problema** (lleva a D13).
- Al confirmar: estrellas del 1 al 5, comentario opcional y foto opcional. Enviar.

### D13 · Reportar un problema (reclamo)
- Motivo: No llegó · Llegó dañado · No es lo que compré · Otro.
- Descripción y fotos.
- Aviso: "Mientras revisamos tu caso, el pago a este vendedor queda retenido."
- Enviar → el pedido pasa a `en_reclamo`. Se ve en D11 y en el panel (F5).

### D14 · Lista de deseos
Grid de productos guardados con el corazón activo. Si el precio bajó o volvió el stock, chip "Bajó de precio" o "Volvió". Vacío: "Guardá productos con el corazón para verlos acá."

### D15 · Vendedores que sigo
Lista con avatar, nombre, indicador EN VIVO si aplica y próximo vivo programado. Reutiliza el estilo de B8.

### D16 · Direcciones
Lista de direcciones (Casa, Trabajo…) con la predeterminada marcada; agregar o editar con ciudad, zona o barrio, calle, referencia y teléfono.

### D · Componentes nuevos del comprador
- **Tarjeta de producto (grid):** foto 1:1 con radio 18, corazón arriba a la derecha, chip "Envío gratis" u "Oferta −20 %" abajo a la izquierda. Debajo: nombre (2 líneas), precio en verde texto, precio anterior tachado y vendedor con reputación (1 línea). Si está agotada: foto al 50 % y chip "Agotado".
- **Tarjeta de producto (fila horizontal):** versión compacta de 140 de ancho.
- **Chip de variante:** pill con estados normal, seleccionado (borde verde) y agotado (tachado).
- **Stepper de cantidad:** − 1 + en pill `fill`.
- **Fila de ítem del carrito.**
- **Línea de tiempo de pedido.**

---

## 6. Comprador · pantallas existentes que cambian

| ID | Cambio |
|---|---|
| A1–A3 | Sin cambios. Al registrarse como vendedor se crea en plan Básico. |
| B1 | Pasa a ser la **tab Vivos**. Mismo contenido; se agrega la fila "Próximos vivos" de vendedores seguidos. |
| B2 / B3 | Al ganar o comprar en el vivo, el pedido va al flujo de pago de la plataforma (D8). Si el lote es un **paquete**, el dock muestra "Paquete · 3 productos" y la fila de producto se expande para ver qué incluye. |
| B4 | El catálogo del vivo muestra también los paquetes (miniaturas apiladas + "3 productos"). |
| B5 | Reemplazada por D8. |
| B6 | Mis compras con filtros por estado del glosario; cada fila abre D11. Los pedidos pendientes de pago siguen arriba con su contador. |
| B7 | Mensajes con el vendedor: sin cambios; la tarjeta fijada del pedido usa los estados nuevos. |
| B8 | Pasa a ser D15. |
| Hoja Cuenta | Su contenido pasa a D10. |

---

## 7. Vendedor · pantallas nuevas (serie E)

### E1 · Catálogo (tab, reemplaza C2)
- Título grande, "86 productos" y botón **+**.
- Buscador y chips: Todos · Activos · Sin stock · Pausados · En vivo.
- Fila de producto: miniatura, nombre, cantidad de variantes ("3 variantes"), precio o rango ("Bs 90–120"), **barra de stock** (disponible / apartado / en vivo, en verde, ámbar suave y ámbar) y "48 disponibles".
- Acciones al deslizar: Editar · Pausar · Borrar.
- Botón secundario arriba: **Paquetes** (E4), solo Premium.
- Vacío: "Cargá tu primer producto. Aparece en el marketplace apenas lo guardes."

### E2 · Editor de producto con variantes (hoja completa, reemplaza C3)
- **Fotos:** hasta 8, arrastrables para ordenar; la primera es la portada.
- Nombre, **categoría y subcategoría** (selector), descripción y estado (Nuevo / Usado).
- **Variantes:**
  - Interruptor "Este producto tiene variantes". Apagado: un solo precio y stock.
  - Encendido: el vendedor define atributos (Talla, Color u otro) y sus valores, y se genera una **tabla de variantes** con columnas: combinación · precio · stock · SKU opcional · activa.
  - En la tabla, poder aplicar el mismo precio a todas.
- **Oferta (opcional):** precio anterior para mostrar el descuento.
- **Envío:** Gratis / A convenir / Retiro en persona (selección múltiple).
- Ya **no** se elige subasta o precio fijo: eso se decide al armar un vivo.
- Barra fija abajo: **Guardar producto**. Indica qué falta, igual que el arreglo hecho en C3: "Falta el nombre y el precio de 2 variantes."

### E3 · Stock de una variante (hoja)
- Cuatro cifras grandes: **Disponible · Apartado · En vivo · Vendido**.
- Ajustar stock (+/− con motivo: Reposición, Corrección, Pérdida).
- Historial de movimientos: venta, reserva para vivo, devolución al terminar el vivo, ajuste manual, pedido vencido.

### E4 · Paquetes (Premium)
- Lista de paquetes: miniaturas apiladas, nombre ("Combo 3 relojes vintage"), "3 productos · 1 disponible" y precio sugerido.
- **Editor de paquete:**
  - Nombre y foto opcional (por defecto, collage de las fotos de sus productos).
  - Agregar variantes del catálogo con cantidad.
  - Cantidad de paquetes a armar (limitada por el stock de cada componente) y precio inicial sugerido.
- Aviso: "Al cargar un paquete en un vivo se apartan todas sus piezas."
- Los paquetes también se pueden armar dentro de E9.

### E5 · Pedidos (tab, reemplaza C4)
- Chips con contador: **Por preparar** (pagados) · Enviados · Entregados · En reclamo · Pendientes de pago · Todos.
- Aviso fijo: "ComprasMío! verifica los pagos. Vos preparás y enviás los pedidos con pago confirmado."
- Tarjeta de pedido: referencia, comprador, cantidad de ítems, total, canal (Catálogo / En vivo / Subasta) y chip de estado.
- Acciones según estado:
  - `pagado`: **Marcar como preparando** / **Marcar enviado**.
  - `enviado`: "Esperando confirmación del comprador".
  - `en_reclamo`: Ver reclamo.
- El vendedor **ya no** verifica comprobantes. C5 deja de ser una pantalla del vendedor y pasa al panel (F2).

### E6 · Detalle de pedido (vendedor)
- Ítems con variante, cantidad y precio.
- Datos de entrega del comprador: dirección y teléfono, con Copiar.
- Línea de tiempo (la misma de D11).
- Desglose: total del pedido − comisión (`X %`) = **neto para vos**.
- Liquidación asociada: "Entra en el pago del lunes 3 nov" o "Retenido por reclamo".
- Acciones: Marcar enviado (con número de seguimiento opcional) y Mensaje al comprador.

### E7 · Cobros y liquidaciones
- **Tarjeta principal** (verde bosque, estilo KPI de C1):
  - "Próximo pago · lunes 3 nov".
  - Monto neto grande.
  - Desglose: ventas Bs 4.200 − comisión Bs 420 = **Bs 3.780**.
- Aviso: "Te pagamos cada semana los pedidos entregados. Los pedidos en reclamo quedan retenidos hasta resolverse."
- **Esta semana:** lista de pedidos que van a entrar en el corte, con su neto.
- **Retenido:** pedidos en reclamo, con su monto.
- **Historial de pagos:** fila por semana con fecha, monto neto, chip `pagada` y "Ver comprobante" (la imagen de la transferencia que subió el administrador).
- Link a E8 si faltan los datos para cobrar.

### E8 · Datos para cobrar
- Banco, tipo de cuenta, número, titular y CI o NIT del titular.
- Opcional: imagen del QR personal del vendedor para recibir el pago.
- Aviso: "Revisamos estos datos antes del primer pago. Si los cambiás, el próximo pago puede demorar."
- Estado: "Verificados" / "En revisión".

### E9 · Armar la transmisión v2 (reemplaza C6, Premium)
Hoja completa en dos pasos.
1. **Elegir qué vender**
   - Buscador del catálogo; cada fila se expande para mostrar sus variantes con su disponible.
   - Por variante: **cantidad a cargar** (stepper, máximo el disponible) y **modo**: Subasta (ámbar) o Precio fijo (verde).
     - Subasta: precio inicial y mínimo; las unidades se rematan de a una, una por lote.
     - Precio fijo: precio en el vivo, por defecto el del catálogo.
   - Sección **Paquetes:** agregar paquetes existentes o "Armar paquete" en el momento. Los paquetes siempre van por subasta.
2. **Ordenar la cola**
   - Lista arrastrable con número de orden, igual que C6, que mezcla variantes y paquetes.
   - Resumen: "Vas a apartar 50 unidades de 6 productos y 2 paquetes. Mientras dure el vivo no se venden en el catálogo."
- CTA ámbar: **Salir al aire con 8 lotes**.

### E10 · Mi tienda (editar perfil público)
Portada, avatar, nombre de la tienda, descripción, redes, ciudad y opciones de entrega. Vista previa de cómo se ve D9 y botón **Copiar link de mi tienda**.

### E11 · Mi plan
- Plan actual con su chip (Básico / Premium), comisión actual y, si es Premium, el vencimiento: "Activo hasta el 30 nov".
- **Comparación** en dos columnas: Básico vs Premium (comisión, transmisiones en vivo, subastas, paquetes, insignia de tienda Premium, destacado en "En vivo ahora").
- Calculadora simple: "Con tus ventas del último mes, en Premium habrías pagado Bs N menos de comisión."
- **Cómo pasar a Premium** (el pago se hace fuera de la tienda de apps): datos para transferir el monto mensual al QR de ComprasMío!, con la referencia `PREMIUM-<tienda>`, y subir el comprobante. El plan se activa cuando el administrador lo verifica (F8). Sin botón de compra dentro de la app.
- Estados: Pago de plan en revisión · Por vencer en 5 días · Vencido (las transmisiones se bloquean y el catálogo sigue activo con la comisión Básica).

### E12 · Reseñas recibidas
Promedio, distribución por estrellas y lista con producto, comentario y fotos. Opción de responder una vez por reseña.

---

## 8. Vendedor · pantallas existentes que cambian

| ID | Cambio |
|---|---|
| C1 Resumen | KPIs nuevos: **Ventas de la semana**, **Próximo pago** (neto, fecha), **Pedidos por preparar**, **Comisión del mes**. La tarjeta "Por verificar" desaparece porque verifica la plataforma. El gráfico separa Catálogo / En vivo. |
| C2 Productos | Reemplazada por E1. |
| C3 Nuevo producto | Reemplazada por E2. |
| C4 Órdenes | Reemplazada por E5. |
| C5 Revisar comprobante | Pasa al panel (F2). |
| C6 Armar transmisión | Reemplazada por E9. |
| C7 Al aire | La cola muestra variantes y paquetes. El panel del lote indica "Unidad 3 de 10" o "Paquete · 3 productos". Al terminar el vivo, un resumen: "Vendiste 32 de 50. Las 18 restantes volvieron a tu catálogo." **El inicio manual de cada subasta se mantiene.** |
| C8 Clientes | Pasa a ser la tab Mensajes: los mismos hilos, con chip del último pedido. |

---

## 9. Panel de administración web (serie F)

Diseño de escritorio. Tablas densas pero legibles, filtros arriba, panel lateral de detalle al seleccionar una fila. Las cifras de dinero en tabular y alineadas a la derecha. Los montos que mueven dinero (aprobar pago, marcar liquidación pagada, reembolsar) siempre piden confirmación con el monto escrito en el botón: **"Aprobar pago de Bs 1.240"**.

### F0 · Ingreso
Email y contraseña de administrador (no usa el celular de la app) y segundo paso con código.

### F1 · Inicio
- Tarjetas: **Pagos por verificar** (cantidad y monto, el más antiguo con su antigüedad: "hace 3 h") · **Próxima liquidación** (fecha, total a transferir, cantidad de vendedores) · **Reclamos abiertos** · **Ventas de la semana** (total vendido, comisiones).
- Gráfico de ventas por día con Catálogo / En vivo.
- Lista "Requiere atención": pagos con más de 2 h sin verificar, reclamos con más de 48 h y planes Premium por vencer.

### F2 · Pagos por verificar
- **Cola** ordenada por antigüedad: referencia, comprador, monto esperado, cantidad de pedidos y vendedores, hora de envío del comprobante y tiempo en espera.
- **Detalle al lado:**
  - Imagen del comprobante con zoom.
  - Lo que hay que comparar con la imagen: **monto esperado** y **código de referencia**.
  - Pedidos que cubre ese pago, uno por vendedor.
  - Acciones:
    - **Aprobar pago de Bs X**: los pedidos pasan a `pagado` y se avisa a vendedores y comprador.
    - **Rechazar**, con motivo: monto distinto, comprobante ilegible, no llegó a la cuenta. El comprador recibe el aviso y puede reenviar mientras siga la ventana.
- Filtros: Pendientes · Aprobados · Rechazados · Vencidos.
- También aparecen acá los **pagos de plan Premium** (referencia `PREMIUM-…`), marcados como tales.

### F3 · Pedidos
Tabla de todos los pedidos con filtros por estado, vendedor, canal y fecha. Detalle con línea de tiempo, pago, ítems y comisión. Acciones de excepción: cancelar con reembolso y cambiar el estado manualmente, siempre con motivo y registro.

### F4 · Liquidaciones semanales
- **Encabezado:** periodo de la semana (lunes a domingo), fecha de pago configurada (F13) y botón **Generar corte de la semana**.
- **Tabla por vendedor:**
  - Columnas: pedidos incluidos, ventas, comisión, retenido por reclamos, **neto a transferir** y datos bancarios con Copiar.
  - Estado de cada fila: `programada` / `pagada`.
- **Detalle de un vendedor:** pedidos incluidos y excluidos, con el motivo: no entregado, en reclamo, pago posterior al corte.
- **Marcar como pagada:** subir el comprobante de la transferencia (imagen o PDF), fecha y número de operación. El vendedor lo ve en E7.
- Exportar a Excel o CSV la lista de transferencias de la semana.
- Historial de semanas anteriores con su total.
- Criterio que la pantalla explica: "Entran los pedidos con pago confirmado y entregados hasta el domingo. Los pedidos en reclamo quedan para la semana en que se resuelvan."

### F5 · Reclamos
- Lista con estado: Abierto · Esperando al vendedor · Resuelto a favor del comprador · Resuelto a favor del vendedor.
- Detalle: motivo, fotos, chat del pedido, línea de tiempo y monto retenido.
- Acciones: pedir información, **Reembolsar al comprador** (monto total o parcial, con comprobante de la devolución) o **Liberar al vendedor** (el monto entra en la próxima liquidación).

### F6 · Vendedores
- Tabla: tienda, plan, reputación, ventas del mes, estado (Activo · Pendiente de verificación · Suspendido).
- Ficha del vendedor:
  - Datos e identidad (CI) y datos bancarios con su verificación.
  - Plan y comisión, con la opción de una comisión especial.
  - Productos, pedidos, liquidaciones y reclamos.
- Acciones: verificar identidad, verificar datos bancarios, suspender o reactivar, y otorgar la insignia "Vendedor verificado".

### F7 · Compradores
Tabla con pedidos, monto gastado, reclamos abiertos y reportes recibidos. Acciones: bloquear o desbloquear.

### F8 · Suscripciones
Lista de vendedores Premium con su vencimiento; pagos de plan por verificar (también en F2); activar o renovar el plan manualmente y aviso de vencimientos de la semana.

### F9 · Catálogo y moderación
Buscar cualquier producto; productos reportados o con fotos dudosas; pausar un producto con motivo (se le avisa al vendedor). Incluye los reportes del chat de las salas en vivo y de usuarios bloqueados, que hoy se guardan en `reports`.

### F10 · Categorías
Árbol de categorías y subcategorías con ícono, orden arrastrable y cantidad de productos. Crear, renombrar y desactivar.

### F11 · Banners y destacados
- **Banners del inicio (D1):** imagen (con guías de recorte para mobile), título corto, destino (producto, categoría, vendedor, vivo o link), fechas de inicio y fin, y orden. Vista previa en un teléfono.
- **Productos y vendedores destacados:** elegir y ordenar los que aparecen en D1.

### F12 · Planes y comisiones
Valores de cada plan: comisión del Básico, precio mensual y comisión del Premium, y qué incluye cada uno (los textos que ve el vendedor en E11). Los cambios rigen desde la fecha indicada y no afectan pedidos ya creados.

### F13 · Configuración
- **QR de cobro de ComprasMío!** (el que ven los compradores en D8):
  - Vista previa grande del QR vigente con banco, titular y número de cuenta.
  - **Subir nuevo QR** (imagen PNG o JPG) con sus datos: banco, titular y cuenta.
  - Antes de activarlo: vista previa de cómo se verá en D8 y confirmación "Activar este QR". Desde ese momento, todos los pagos nuevos lo usan.
  - **Historial de QR:** cada QR con fechas de uso, quién lo cambió y la opción de volver a uno anterior.
  - Aviso: "Los compradores que ya están pagando con el QR anterior pueden terminar su pago."
- **Pagos:** ventana de pago en minutos (por defecto 15), formato del código de referencia.
- **Liquidaciones:** día de corte (por defecto domingo), día de pago (por defecto lunes) y monto mínimo para liquidar (lo que no lo alcanza pasa a la semana siguiente).
- **Pedidos:** días para que un pedido enviado se dé por entregado si el comprador no confirma (por defecto 5).
- **Datos de contacto y soporte** que se muestran en la app.

### F14 · Equipo y registro de actividad
Usuarios del panel con rol (Administrador · Operador de pagos · Moderador). El registro de actividad muestra quién aprobó cada pago, quién marcó cada liquidación, quién cambió el QR y quién resolvió cada reclamo.

---

## 10. Flujos clave (para prototipar)

### Compra por catálogo con varios vendedores
D5 Agregar al carrito → D6 Carrito (2 vendedores) → D7 Checkout → D8 Pago por QR de ComprasMío! (una transferencia) → D8b Comprobante enviado → F2 el operador aprueba → los pedidos pasan a `pagado` → E5 cada vendedor marca Enviado → D11 el comprador confirma la recepción (D12) → F4 entra en la liquidación semanal → E7 el vendedor ve su pago con comprobante.

### Compra en vivo
B2 ¡Mío! o Comprar ya → D8 Pago (mismo flujo) → igual que arriba.

### Vivo con paquetes (Premium)
E4 Armar paquete → E9 Cargar variantes y paquetes (se apartan del catálogo) → C7 Al aire: el vendedor toca Iniciar subasta en cada lote → al terminar, lo no vendido vuelve al catálogo y se ve el resumen.

### Reclamo
D11 "Tengo un problema" → D13 → el pedido pasa a `en_reclamo` y el monto se retiene → F5 el administrador decide → reembolso al comprador o liberación al vendedor en la próxima liquidación.

### Cambio de QR de cobro
F13 Subir nuevo QR → vista previa → Activar → D8 muestra el nuevo QR en todos los pagos nuevos.

### Pasar a Premium
E11 Cómo pasar a Premium → transferencia con la referencia `PREMIUM-…` → comprobante → F2 / F8 se aprueba → el botón Transmitir se habilita.

---

## 11. Pantallas a priorizar en el diseño

Primera tanda (lo necesario para el marketplace básico): **D1, D5, D6, D7, D8, D8b, D11, E1, E2, E5, E7, F2, F4, F13.**
Segunda tanda: D2–D4, D9, D10, D12–D16, E3, E6, E8, E10–E12, F1, F3, F5–F12, F14.
Tercera tanda (vivos v2): E4, E9 y los ajustes de B2–B4 y C7.
