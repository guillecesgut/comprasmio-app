# ComprasMío! — imagen única: la API (server/) y el panel del equipo compilado (web/), que la API sirve en la raíz.
# La app de compradores y vendedores (mobile/) no va aquí: se publica con Expo.
# Se construye desde la raíz del repositorio:  docker build -t comprasmio .

FROM node:22-bookworm-slim AS web
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web ./
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY --from=web /build/web/dist ./web/dist
# Carpeta de archivos con STORAGE_DRIVER=local: al montar un volumen aquí hereda el dueño `node`.
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 4000
CMD ["node", "server/src/index.js"]
