// Corre las pruebas con un Postgres local efímero: `npm test`.
// Cada archivo de test/ crea su propia base dentro de este servidor (ver test/helpers.js).
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startLocalPg } from './local-pg.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, '.pgtest');
fs.rmSync(dir, { recursive: true, force: true });

const port = 54400 + Math.floor(Math.random() * 500);
const pg = await startLocalPg({ dir, port });

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(path.join(root, 'test')).filter((f) => f.endsWith('.test.js')).map((f) => path.join('test', f));

const child = spawn(process.execPath, ['--test', '--test-concurrency=4', ...files], {
  cwd: root,
  stdio: 'inherit',
  // Archivos siempre en disco: las pruebas nunca escriben en el bucket de server/.env.
  env: {
    ...process.env, TEST_PG_URL: pg.url('postgres'), RUN_JOBS: 'false', NODE_ENV: 'test',
    STORAGE_DRIVER: 'local', STORAGE_LOCAL_DIR: process.env.STORAGE_LOCAL_DIR || path.join(os.tmpdir(), 'comprasmio-test-uploads'),
  },
});
const code = await new Promise((resolve) => child.on('exit', resolve));
await pg.stop();
try {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
} catch {
  // Si Windows todavía tiene algún archivo tomado, se borra en la próxima corrida.
}
process.exit(code ?? 1);
