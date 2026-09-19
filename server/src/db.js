import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'comprasmio.json');

const EMPTY = {
  users: [],
  sellers: [],
  products: [],
  streams: [],
  orders: [],
  messages: [],
  threads: [],
  notifications: [],
  meta: { orderSeq: 10482, lotSeq: 4 },
};

let db = structuredClone(EMPTY);
let writeTimer = null;

export function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
    } catch {
      console.warn('[db] archivo corrupto, se reinicia');
      db = structuredClone(EMPTY);
    }
  }
  return db;
}

/** Escritura diferida: las pujas llegan cada pocos ms y no queremos un fsync por evento. */
export function persist() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }, 250);
}

export function flush() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

export function reset() {
  db = structuredClone(EMPTY);
  flush();
  return db;
}

export const get = () => db;

export const id = (prefix) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Referencia visible para el comprador: #SM-10482 */
export function nextOrderRef() {
  db.meta.orderSeq += 1;
  persist();
  return `#SM-${db.meta.orderSeq}`;
}

/** Número de lote dentro de una transmisión: #004 (subasta) / #F-217 (precio fijo) */
export function nextLotNo(mode) {
  db.meta.lotSeq += 1;
  return mode === 'fixed'
    ? `#F-${200 + db.meta.lotSeq}`
    : `#${String(db.meta.lotSeq).padStart(3, '0')}`;
}

export const find = (col, fn) => db[col].find(fn);
export const filter = (col, fn) => db[col].filter(fn);

export function insert(col, row) {
  db[col].push(row);
  persist();
  return row;
}

export function update(col, matchId, patch) {
  const row = db[col].find((r) => r.id === matchId);
  if (!row) return null;
  Object.assign(row, patch);
  persist();
  return row;
}

export function remove(col, matchId) {
  const i = db[col].findIndex((r) => r.id === matchId);
  if (i === -1) return false;
  db[col].splice(i, 1);
  persist();
  return true;
}
