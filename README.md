# ComprasMío! — marketplace + compras en vivo

Marketplace boliviano con catálogo y transmisiones en vivo sobre el **mismo stock**.
Moneda `Bs 1.234`, español de Bolivia.

- **Catálogo**: productos con variantes (talla, color…), carrito con varios vendedores y un
  solo pago.
- **Vivos** (abiertos a todos los vendedores): el vendedor carga variantes o paquetes; mientras dura el vivo,
  esas unidades salen del catálogo. Subasta por unidad o precio fijo, y cada lote lo inicia
  el vendedor a mano. Lo que no se vende vuelve al catálogo al terminar.
- **Modo plataforma**: el comprador paga al QR de ComprasMío!, el equipo verifica el
  comprobante en el panel y a los vendedores se les paga **cada semana** lo entregado,
  menos la comisión. Los pedidos en reclamo quedan retenidos.

| Carpeta | Qué es |
|---|---|
| `server/` | API (Express + PostgreSQL), WebSocket y LiveKit |
| `web/` | Panel de administración del equipo (Vite + React) |
| `mobile/` | App de compradores y vendedores (Expo, iOS) — ver `mobile/README.md` |
| `design/` | Handoffs de diseño |

---

## Arrancar en local

Hacen falta Node 20+ y tres terminales.

```bash
# 1 · base de datos (PostgreSQL local en el puerto 54329; la primera vez la crea)
cd server
npm install
npm run db
```

```bash
# 2 · API + panel  →  http://localhost:4000
cd server
npm run seed      # categorías, QR de prueba y cuentas de ejemplo
npm run dev
```

```bash
# 3 · app (Expo)
cd mobile
npm install
npx expo start
```

El panel se sirve compilado desde el mismo servidor (`cd web && npm install && npm run build`).
Para trabajar en el panel con recarga en vivo: `cd web && npm run dev` → http://localhost:5173.

Cuentas que crea `npm run seed`:

| Rol | Usuario | Contraseña |
|---|---|---|
| Panel (admin) | `admin@comprasmio.bo` | `comprasmio-admin` |
| Compradora | `71234567` | `comprar123` |
| Vendedores | `70000000`, `70000001`, `70000002` | `vender123` |

Pruebas del servidor: `cd server && npm test` (levanta su propio PostgreSQL temporal).

## Panel de administración

Roles: **Administración** (todo), **Pagos** (pagos, pedidos, liquidaciones, reclamos,
y **Moderación** (catálogo, reportes, compradores, categorías, banners).

- **Pagos por verificar**: comprobante al lado; "Aprobar pago de Bs X" o rechazar con motivo.
- **Liquidaciones**: semana de lunes a domingo, pago el lunes (configurable). Generar el corte,
  exportar CSV para el banco, marcar pagada subiendo el comprobante de la transferencia.
  Solo se paga a cuentas con datos verificados.
- **Configuración y QR**: el QR de cobro se sube, se revisa y se activa; se puede volver a uno
  anterior. Ventanas de pago, días de entrega automática, día de corte y de pago.
- **Comisión**: un solo porcentaje (10 % por defecto) sobre lo vendido en catálogo y vivos, sin cuota fija ni planes. Se puede poner una comisión especial a un vendedor.
- **Registro de cambios**: quién hizo qué; no se puede editar.

## Desplegar en Render

`render.yaml` crea un servicio web (API + panel + WebSocket en la misma URL) y una base
PostgreSQL. Los datos ya **no** se pierden al redeployar, como pasaba en la v1.

1. En Cloudflare → **R2**: creá un bucket (por ejemplo `comprasmio`) y un token de API con
   permiso de lectura y escritura sobre ese bucket. Anotá el endpoint
   (`https://<cuenta>.r2.cloudflarestorage.com`), el Access Key ID y el Secret.
2. En Render: **New → Blueprint** con este repositorio. Completá las variables que pide:

   | Variable | Valor |
   |---|---|
   | `PUBLIC_URL` | la URL del servicio, p. ej. `https://comprasmio.onrender.com` |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | primera cuenta del panel (contraseña de 10+ caracteres) |
   | `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` | los de R2 |
   | `LIVEKIT_*` | opcional, para el video |

   `JWT_SECRET`, `FILE_SIGNING_SECRET` y `DATABASE_URL` los completa Render solo.
3. Al terminar el deploy, entrá a la URL con el email del admin → **Configuración y QR** →
   subí y activá el QR de cobro. Sin QR activo nadie puede pagar.
4. **Migrar las cuentas de la v1** (mismo celular y contraseña; los pedidos viejos no se
   migran porque se pagaron directo al vendedor). Desde tu PC, con la *External Database
   URL* que muestra Render en la base:

   ```bash
   cd server
   DATABASE_URL="postgres://…render.com/comprasmio" npm run import:v1 data/comprasmio.json
   ```

Limitaciones del plan gratuito: el servicio se duerme tras ~15 min sin tráfico (el primer
pedido tarda ~1 min) y la base PostgreSQL gratuita **vence a los 30 días** — para usuarios
reales pasá la base a un plan pago antes de esa fecha.

## Video en vivo (LiveKit)

Opcional: sin configurar, todo funciona y la sala muestra el bloque de color. Creá un
proyecto gratuito en LiveKit Cloud y cargá `LIVEKIT_URL`, `LIVEKIT_API_KEY` y
`LIVEKIT_API_SECRET` (en `server/.env` para desarrollo; ver `server/.env.example`).
`npm run check` las prueba. Solo el dueño del vivo recibe permiso de publicar; lo decide el
servidor.

**Los archivos `.env` nunca se suben a git ni se comparten.**
