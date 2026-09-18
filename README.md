# ComprasMío! — compras en vivo

Webapp de compras en vivo: comprador y vendedor comparten una sola aplicación web, con
backend en tiempo real. Todo en español boliviano, moneda `Bs 1.234`.

Dos formas de vender conviven en la misma transmisión y el mismo catálogo:

| | Subasta | Precio fijo |
|---|---|---|
| Color | ámbar `#AE5115` | verde `#0E7C66` |
| Quién pone el precio | la sala | el vendedor |
| Cierre | cronómetro en 0 | se agota el stock |
| Sin venta | si no llega al precio mínimo | — |

Pago: **solo QR**. El comprador descarga el código, paga desde su banco y adjunta el comprobante.
El vendedor lo verifica en el panel y el cambio llega al comprador al instante.

---

## Arrancar

Hacen falta tres terminales. El backend primero: los otros dos lo necesitan.

```bash
# 1 · backend  →  http://localhost:4000
cd server
npm install
npm run seed        # datos de ejemplo (--reset para rehacerlos)
npm run dev

# 2 · web (comprador + vendedor)  →  http://localhost:5173
cd web
npm install
npm run dev
```

Para dejar la base local con solo dos cuentas puntuales en vez del catálogo de ejemplo
completo (útil antes de mostrarle el proyecto a alguien), pará el servidor y corré
`node server/reset-keep-users.mjs` — ver la cabecera de ese archivo para los detalles.

Una sola aplicación web sirve a compradores y vendedores:

| Ruta | Para quién |
|---|---|
| `/` | feed de transmisiones en vivo |
| `/vivo/:id` | sala: pujar, comprar, chatear |
| `/compras` | órdenes y pago por QR |
| `/vender` | panel del vendedor |
| `/vender/transmitir/:id` | cámara al aire |

`vite.config.ts` usa `host: true`, así que desde el celular podés abrir `http://TU_IP:5173`
mientras la web corre en tu computadora.

## Desplegar en un servidor gratuito de prueba (Render)

Para que un grupo de gente pruebe la webapp por internet, sin depender de tu computadora
prendida ni de un túnel, el camino más simple es desplegar **un solo servicio** en
[Render](https://render.com): el mismo servidor Express sirve la API, el WebSocket y el
build de la web, los tres en la misma URL. `server/src/index.js` ya detecta si existe
`web/dist` y lo sirve solo; no hace falta un segundo hosting para el frontend.

1. Subí este repositorio a GitHub (privado o público).
2. En Render: **New → Blueprint**, conectá el repositorio. Render encuentra `render.yaml`
   en la raíz y preconfigura todo — build, start command, y un `JWT_SECRET` generado solo.
3. Si vas a usar video en vivo, completá `LIVEKIT_URL`, `LIVEKIT_API_KEY` y
   `LIVEKIT_API_SECRET` en el paso de variables de entorno del asistente. Si los dejás
   vacíos, la plataforma funciona igual sin cámara.
4. **Deploy**. La primera build tarda unos minutos (instala e compila la web). Al terminar,
   Render te da una URL tipo `https://comprasmio.onrender.com` — esa es la que compartís.

### Cuentas de arranque, sin Shell

El plan gratuito de Render no incluye acceso a una consola (**Shell**) para correr un
script a mano — eso es de los planes pagos. Y como tampoco tiene disco persistente, cada
vez que subís código nuevo la base arranca vacía. La solución: `server/src/bootstrap.js`
arma las cuentas solo, leyendo variables de entorno, cada vez que el servidor detecta que
no hay ningún usuario.

En el panel del servicio en Render → **Environment**, agregá:

| Variable | Ejemplo |
|---|---|
| `SEED_SELLER_PHONE` | `77326694` |
| `SEED_SELLER_PASSWORD` | la que quieras |
| `SEED_SELLER_NAME` | `Relojería Andina` |
| `SEED_BUYER_PHONE` | `75580800` |
| `SEED_BUYER_PASSWORD` | la que quieras |
| `SEED_BUYER_NAME` | `Ana Quispe` |

Guardá — Render reinicia el servicio solo. Al arrancar con la base vacía, crea esas dos
cuentas (vendedor y compradora) y no vuelve a tocarlas mientras haya datos: un reinicio
posterior con las mismas variables no las duplica ni las pisa.

Si dejás esas seis variables sin completar, el servidor arranca realmente vacío, sin
crear ninguna cuenta — para eso no hace falta hacer nada.

**Las limitaciones del plan gratuito, para que no sorprendan a mitad de una prueba:**

- **Se duerme sin tráfico.** Tras ~15 minutos sin visitas, el servicio se apaga y el
  primer pedido que llega después tarda 30–50 segundos en despertarlo. Ideal: entrar vos
  a la URL un minuto antes de que arranque la sesión de prueba, para que ya esté despierto.
- **Los datos no están garantizados entre despliegues.** El plan gratuito no incluye disco
  persistente: si Render reinicia el contenedor (por ejemplo, al subir código nuevo), la
  base de datos JSON vuelve a estar vacía — las cuentas de arranque de arriba resuelven
  justo esto. Para algo que tiene que sobrevivir días con catálogo y órdenes reales, hace
  falta el disco persistente de un plan pago o mover los datos a una base real (Postgres).
- **Una sola instancia, sin autoescalado.** De sobra para un grupo focal; no es el mismo
  plan que usarías con usuarios reales y simultáneos de a cientos.

## Video en vivo (LiveKit)

El video es **opcional**: sin configurar, la plataforma funciona igual y la sala muestra el
bloque de color en lugar de la cámara. Para activarlo, creá una cuenta gratuita en LiveKit
Cloud y copiá `server/.env.example` como `server/.env`:

```
LIVEKIT_URL=wss://tu-proyecto.livekit.cloud
LIVEKIT_API_KEY=API...
LIVEKIT_API_SECRET=...
```

Verificá las credenciales antes de arrancar:

```bash
npm run check
```

Comprueba la forma de los tres valores y los prueba contra LiveKit. Reiniciá el servidor:
al arrancar tiene que decir `Video en vivo → LiveKit configurado`.

El servidor emite un token por persona y por sala, y decide ahí los permisos: solo el dueño
de la transmisión recibe `canPublish`. Si esa decisión estuviera en el cliente, cualquiera
podría pedir permiso de publicación y aparecer en el vivo ajeno.

**El archivo `.env` nunca se sube a git ni se comparte.** Contiene secretos.

**La cámara necesita HTTPS.** Los navegadores solo dan `getUserMedia` en contexto seguro.
`localhost` está exento, pero para transmitir desde el celular en la red local hace falta
un certificado. Para probar rápido, `npx vite --https` o un túnel como `npx localtunnel --port 5173`.

### Cuentas de prueba

| Rol | Celular | Contraseña |
|---|---|---|
| Compradora | `71234567` | `comprar123` |
| Vendedor (Relojería Andina) | `70000000` | `vender123` |

Los otros cinco vendedores del feed van de `70000001` a `70000005`, misma contraseña.

### Compradores simulados

Por defecto hay bots que pujan y compran para que la sala tenga movimiento. Entran por las mismas
funciones del motor que una persona:

```bash
DEMO_BOTS=0 npm run dev
```
