// Postgres local para desarrollo y pruebas, sin instalar nada: usa los binarios del paquete
// `embedded-postgres` (devDependency). Se lanza directo con initdb/postgres porque la librería
// espera mensajes en inglés y en un Windows en español se queda esperando.
//
// Uso como script:  node scripts/local-pg.js            → levanta en el puerto 54329 (Ctrl+C para cerrar)
// Uso como módulo:  const pg = await startLocalPg({ dir, port }); ...; await pg.stop();
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const USER = 'comprasmio';
const PASSWORD = 'comprasmio';

function binDir() {
  const platformPkg = {
    win32: '@embedded-postgres/windows-x64',
    darwin: process.arch === 'arm64' ? '@embedded-postgres/darwin-arm64' : '@embedded-postgres/darwin-x64',
    linux: process.arch === 'arm64' ? '@embedded-postgres/linux-arm64' : '@embedded-postgres/linux-x64',
  }[process.platform];
  // El paquete no exporta package.json: se busca la carpeta en node_modules.
  const serverRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  return path.join(serverRoot, 'node_modules', ...platformPkg.split('/'), 'native', 'bin');
}

const exe = (name) => path.join(binDir(), process.platform === 'win32' ? `${name}.exe` : name);

function waitForPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => { socket.end(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`Postgres no respondió en el puerto ${port}`));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

export async function startLocalPg({ dir, port = 54329, quiet = true } = {}) {
  const dataDir = dir || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata');
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    fs.mkdirSync(dataDir, { recursive: true });
    const pwfile = path.join(os.tmpdir(), `cm-pw-${process.pid}`);
    fs.writeFileSync(pwfile, PASSWORD);
    const init = spawnSync(exe('initdb'), ['-D', dataDir, '-U', USER, `--pwfile=${pwfile}`, '--auth=password', '-E', 'UTF8', '--locale=C'], { encoding: 'utf8' });
    fs.rmSync(pwfile, { force: true });
    if (init.status !== 0) throw new Error(`initdb falló: ${init.stderr || init.stdout}`);
  }

  const child = spawn(exe('postgres'), ['-D', dataDir, '-p', String(port), '-c', 'listen_addresses=127.0.0.1', '-c', 'fsync=off'], {
    stdio: quiet ? 'ignore' : 'inherit',
  });
  await waitForPort(port);
  const url = (db = 'postgres') => `postgres://${USER}:${PASSWORD}@127.0.0.1:${port}/${db}`;
  // El puerto abre antes de que acepte conexiones ("the database system is starting up").
  const { default: pg } = await import('pg');
  for (let attempt = 0; ; attempt++) {
    const client = new pg.Client({ connectionString: url() });
    try {
      await client.connect();
      await client.end();
      break;
    } catch (err) {
      await client.end().catch(() => {});
      if (attempt > 100) throw err;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return {
    url,
    port,
    async stop() {
      if (child.exitCode !== null) return;
      const exited = new Promise((resolve) => child.once('exit', resolve));
      // pg_ctl cierra también los procesos hijos; matar solo el principal deja archivos tomados en Windows.
      spawnSync(exe('pg_ctl'), ['-D', dataDir, 'stop', '-m', 'fast', '-w'], { stdio: 'ignore' });
      await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))]);
      if (child.exitCode === null) child.kill();
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.LOCAL_PG_PORT || 54329);
  const pg = await startLocalPg({ port, quiet: false });
  // La primera vez crea la base de la app para que `npm run seed` y `npm run dev` funcionen sin más pasos.
  const { default: pgLib } = await import('pg');
  const admin = new pgLib.Client({ connectionString: pg.url('postgres') });
  await admin.connect();
  const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = 'comprasmio'`);
  if (!exists.rowCount) await admin.query('CREATE DATABASE comprasmio');
  await admin.end();
  console.log(`Postgres local listo → ${pg.url('comprasmio')}`);
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
