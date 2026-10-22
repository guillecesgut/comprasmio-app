/** Cliente de la API para el panel. El token vive en localStorage y vence a las 12 h. */
const TOKEN_KEY = 'comprasmio.admin.token';

let token: string | null = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {
  token = null;
}

export const getToken = () => token;
export function setToken(value: string | null) {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sin almacenamiento: la sesión dura lo que la pestaña */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;
export const handleUnauthorized = (fn: () => void) => { onUnauthorized = fn; };

/** Rutas del panel: todo vive en /api/admin salvo la sesión y las subidas. */
const url = (path: string) => (/^\/(auth|uploads)(\/|$)/.test(path) ? `/api${path}` : `/api/admin${path}`);

export async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const isForm = options.body instanceof FormData;
  const res = await fetch(url(path), {
    ...options,
    headers: {
      ...(isForm || !options.body ? {} : { 'content-type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && token) onUnauthorized?.();
  if (!res.ok) throw new ApiError(data?.error || 'No pudimos conectar con el servidor.', res.status);
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>(p),
  post: <T = any>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T = any>(p: string, body?: unknown) => request<T>(p, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: <T = any>(p: string, body?: unknown) => request<T>(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T = any>(p: string) => request<T>(p, { method: 'DELETE' }),
};

/** Sube un archivo a una carpeta del bucket y devuelve su clave. */
export async function upload(folder: string, file: File): Promise<{ key: string; url: string }> {
  const form = new FormData();
  form.append('folder', folder);
  form.append('file', file);
  return request('/uploads', { method: 'POST', body: form });
}

/** Descarga un archivo de la API (por ejemplo el CSV de liquidaciones) con la sesión. */
export async function download(path: string, fallbackName: string) {
  const res = await fetch(url(path), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError('No pudimos generar el archivo.', res.status);
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// --------------------------------------------------------------- formato ---

export const bs = (n: number | null | undefined) =>
  n == null ? '—' : `Bs ${Number(n).toLocaleString('es-BO', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

const TZ = 'America/La_Paz';
export const fecha = (iso?: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '—';
export const fechaHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('es-BO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—';
export function diaSemana(iso?: string | null) {
  if (!iso) return '—';
  const s = new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function hace(iso?: string | null) {
  if (!iso) return '—';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

// ---------------------------------------------------------------- socket ---

type Handler = (payload: any) => void;
const handlers = new Map<string, Set<Handler>>();
let ws: WebSocket | null = null;
let retry = 0;

export function connectSocket() {
  if (!token || (ws && ws.readyState <= 1)) return;
  ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/ws?token=${token}`);
  ws.onopen = () => { retry = 0; ws?.send(JSON.stringify({ type: 'subscribe', channel: 'admin' })); };
  ws.onmessage = (e) => {
    try {
      const { type, payload } = JSON.parse(e.data);
      handlers.get(type)?.forEach((h) => h(payload));
    } catch { /* trama inválida */ }
  };
  ws.onclose = () => {
    ws = null;
    if (token) setTimeout(connectSocket, Math.min(1000 * 2 ** retry++, 15000));
  };
}
export function onSocket(type: string, handler: Handler) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(handler);
  return () => { handlers.get(type)?.delete(handler); };
}
export function closeSocket() {
  const s = ws;
  ws = null;
  s?.close();
}

/** Avisa a la barra lateral que cambió algo (aprobación, reclamo resuelto) para actualizar los contadores. */
export const notifyChanged = () => window.dispatchEvent(new Event('admin:changed'));
