import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // host: true expone el servidor en la red local para probar desde el celular.
    host: true,
    port: 5173,
    // Vite bloquea por defecto cualquier dominio que no reconoce, para que una
    // página maliciosa no pueda apuntar tu navegador a tu propio servidor de
    // desarrollo. Cada punto inicial habilita cualquier subdominio aleatorio
    // que el túnel genere en cada corrida. ".loca.lt" es de `npx localtunnel`;
    // ".trycloudflare.com" es de `cloudflared tunnel --url ...`.
    allowedHosts: ['.loca.lt', '.trycloudflare.com'],
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
});
