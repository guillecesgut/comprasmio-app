import http from 'node:http';
import { config } from './config.js';
import * as db from './db.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';
import * as hub from './realtime/hub.js';
import * as live from './services/live.js';
import { ensureAdmin } from './services/users.js';
import { startJobs } from './jobs.js';

db.connect(config.databaseUrl);
await migrate();
await live.recoverAfterRestart();
const adminId = await ensureAdmin({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, name: process.env.ADMIN_NAME });
if (adminId) console.log(`Panel           →  administrador ${process.env.ADMIN_EMAIL}`);

const server = http.createServer(createApp());
hub.attach(server, {
  onViewersChange(streamId, viewers) {
    hub.emit(`stream:${streamId}`, 'stream:viewers', { streamId, viewers });
    hub.emit('feed', 'stream:update', { streamId, viewers });
    live.trackViewers(streamId, viewers);
  },
});

const clock = live.startClock();
const stopJobs = config.runJobs ? startJobs() : () => {};

server.listen(config.port, () => {
  console.log(`ComprasMío! API →  ${config.publicUrl}/api`);
  console.log(`WebSocket       →  ${config.publicUrl.replace(/^http/, 'ws')}/ws`);
  console.log(`Archivos        →  ${config.storage.driver === 's3' ? `bucket ${config.storage.bucket}` : 'disco local (solo desarrollo)'}`);
  console.log(`Video en vivo   →  ${live.liveConfig().configured ? 'LiveKit configurado' : 'sin configurar'}`);
});

async function shutdown() {
  clearInterval(clock);
  stopJobs();
  server.close();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
