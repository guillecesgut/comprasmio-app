import pg from 'pg';
import crypto from 'node:crypto';

// bigint y numeric llegan como string por defecto; acá son conteos y promedios chicos.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

let pool = null;

export function connect(url) {
  const needsSsl = /render\.com|neon\.tech|sslmode=require/.test(url) && !/sslmode=disable/.test(url);
  pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX || 10),
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
  pool.on('error', (err) => console.error('[db] conexión caída', err.message));
  return pool;
}

export const getPool = () => {
  if (!pool) throw new Error('La base no está conectada (db.connect).');
  return pool;
};

export async function close() {
  await pool?.end();
  pool = null;
}

/** `q` puede ser el pool o un cliente dentro de una transacción. */
export const query = (text, params, q = getPool()) => q.query(text, params);
export const one = async (text, params, q) => (await query(text, params, q)).rows[0] || null;
export const many = async (text, params, q) => (await query(text, params, q)).rows;

/**
 * Ejecuta `fn(client)` dentro de una transacción. Ante un conflicto de serialización o un
 * deadlock reintenta: pasa cuando dos compras pelean la última unidad al mismo tiempo.
 */
export async function tx(fn, { retries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      client.onCommit = [];
      const result = await fn(client);
      await client.query('COMMIT');
      // Efectos que solo deben ocurrir si la transacción se confirmó (avisos por socket, borrar archivos).
      for (const effect of client.onCommit) {
        await Promise.resolve().then(effect).catch((e) => console.error('[db] efecto posterior', e.message));
      }
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (attempt < retries && (err.code === '40001' || err.code === '40P01')) continue;
      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * Ejecuta `effect` cuando la transacción `q` se confirme (o ya mismo si `q` no es una
 * transacción). Para avisos por socket y notificaciones: nunca avisar de algo que se deshizo.
 */
export function afterCommit(q, effect) {
  if (q && Array.isArray(q.onCommit)) q.onCommit.push(effect);
  else Promise.resolve().then(effect).catch((e) => console.error('[db] efecto posterior', e.message));
}

/** IDs de texto con prefijo, como en la v1: usr_…, prd_… */
export const id = (prefix) => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;

/** Error con status HTTP para responder al cliente con un mensaje claro. */
export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
export const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };
