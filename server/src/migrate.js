import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, tx } from './db.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Aplica en orden los archivos de migrations/ que todavía no se aplicaron. Cada archivo corre
 * en su propia transacción: si falla, la base queda como estaba. Se llama al arrancar.
 */
export async function migrate({ log = console.log } = {}) {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  // Un solo proceso migra a la vez, aunque arranquen dos instancias juntas.
  await query('SELECT pg_advisory_lock(424242)');
  try {
    const done = new Set((await query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
      await tx(async (c) => {
        await c.query(sql);
        await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
      });
      log(`Migración aplicada → ${file}`);
    }
  } finally {
    await query('SELECT pg_advisory_unlock(424242)');
  }
}
