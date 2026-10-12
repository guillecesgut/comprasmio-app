import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

/**
 * Misma API que la web (`web/src/api.ts`), adaptada a la app nativa:
 *  - No hay `location.origin`: la URL del backend viene de EXPO_PUBLIC_API_URL.
 *  - El token vive en el llavero de iOS (SecureStore), no en localStorage.
 *  - Los archivos se suben como { uri, name, type }, que es lo que entiende
 *    el FormData de React Native.
 */
const TOKEN_KEY = 'comprasmio.token';

export const API_URL = String(
  process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || 'http://localhost:4000'
).replace(/\/$/, '');

/** Rutas relativas del servidor (comprobantes en /uploads) a URL absoluta. */
export const absolute = (path?: string | null) =>
  !path ? undefined : /^(https?:|data:)/.test(path) ? path : `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;

export const bs = (n: number) =>
  'Bs ' + Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export const clock = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;

export type Mode = 'auction' | 'fixed';

export const STATUS_TABS = [
  { key: 'todas', label: 'Todas' },
  { key: 'en_revision', label: 'En revisión' },
  { key: 'verificado', label: 'Verificado' },
  { key: 'enviado', label: 'Enviado' },
] as const;

let token: string | null = null;
export const getToken = () => token;

/** Se llama una vez al arrancar, antes de cualquier pedido autenticado. */
export async function loadToken() {
  token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  return token;
}

export async function setToken(value: string | null) {
  token = value;
  if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
  else await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...((options.headers as Record<string, string>) || {}),
      },
    });
  } catch {
    throw new ApiError('Sin conexión. Revisá tu internet e intentá de nuevo.', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError((data as any)?.error || 'No pudimos conectar con el servidor.', res.status);
  return data as T;
}

const body = (payload: unknown) => JSON.stringify(payload);

export type Upload = { uri: string; name: string; type: string };

export const api = {
  config: () => request<{ live: { url: string; configured: boolean } }>('/api/config'),
  liveToken: (streamId: string) =>
    request<{ url: string; token: string; room: string; role: 'broadcaster' | 'viewer' }>(
      `/api/streams/${streamId}/token`
    ),

  /* ---------------------------------------------------------- cuenta --- */
  signup: (payload: { name: string; phone: string; password: string; role: string }) =>
    request<{ token: string; user: any }>('/api/auth/signup', { method: 'POST', body: body(payload) }),
  login: (phone: string, password: string) =>
    request<{ token: string; user: any }>('/api/auth/login', { method: 'POST', body: body({ phone, password }) }),
  me: () => request<{ user: any }>('/api/auth/me'),
  updateMe: (payload: { name?: string; address?: string }) =>
    request<{ user: any }>('/api/auth/me', { method: 'PATCH', body: body(payload) }),
  /** Requisito de Apple: borrar la cuenta desde la app. */
  deleteAccount: (password: string) =>
    request<{ ok: true }>('/api/auth/me', { method: 'DELETE', body: body({ password }) }),
  toggleBlock: (handle: string) =>
    request<{ user: any }>(`/api/auth/me/blocked/${encodeURIComponent(handle)}`, { method: 'PUT' }),
  report: (payload: { handle: string; text?: string; streamId?: string; reason?: string }) =>
    request<{ ok: true }>('/api/auth/report', { method: 'POST', body: body(payload) }),

  /* ------------------------------------------------------ comprador --- */
  streams: (mode: 'all' | Mode = 'all', q?: string) => {
    const params: string[] = [];
    if (mode !== 'all') params.push(`mode=${mode}`);
    if (q) params.push(`q=${encodeURIComponent(q)}`);
    return request<{ streams: any[]; count: number }>(`/api/streams?${params.join('&')}`);
  },
  stream: (id: string) => request<{ stream: any; lot: any; messages: any[]; queue: any[] }>(`/api/streams/${id}`),
  bid: (id: string, amount: number) =>
    request<{ lot: any }>(`/api/streams/${id}/bid`, { method: 'POST', body: body({ amount }) }),
  buy: (id: string) => request<{ order: any; lot: any }>(`/api/streams/${id}/buy`, { method: 'POST' }),
  chat: (id: string, text: string) =>
    request<{ message: any }>(`/api/streams/${id}/chat`, { method: 'POST', body: body({ text }) }),

  orders: () => request<{ orders: any[] }>('/api/orders'),
  order: (id: string) => request<{ order: any }>(`/api/orders/${id}`),
  paymentQr: (id: string) =>
    request<{ qr: string; bank: string; account: string; holder: string; total: number; ref: string }>(
      `/api/orders/${id}/qr`
    ),
  uploadReceipt: (id: string, file: Upload) => {
    const form = new FormData();
    form.append('receipt', file as any); // RN acepta { uri, name, type } como archivo
    return request<{ order: any }>(`/api/orders/${id}/receipt`, { method: 'POST', body: form });
  },

  favorites: () => request<{ favorites: string[] }>('/api/seller/favorites'),
  toggleFavorite: (streamId: string) =>
    request<{ favorites: string[] }>(`/api/seller/favorites/${streamId}`, { method: 'PUT' }),

  sellerInfo: (sellerId: string) => request<{ seller: any }>(`/api/sellers/${sellerId}`),
  threadWith: (sellerId: string) => request<{ thread: any[] }>(`/api/threads/${sellerId}`),
  messageSeller: (sellerId: string, text: string) =>
    request<{ message: any }>(`/api/threads/${sellerId}`, { method: 'POST', body: body({ text }) }),

  /* --------------------------------------------------- notificaciones --- */
  notifications: () => request<{ notifications: any[]; unread: number }>('/api/notifications'),
  markNotificationsRead: (ids?: string[]) =>
    request<{ unread: number }>('/api/notifications/read', { method: 'POST', body: body({ ids }) }),

  /* ------------------------------------------------------- vendedor --- */
  overview: () => request<any>('/api/seller/overview'),
  products: () => request<{ products: any[] }>('/api/products'),
  createProduct: (payload: Record<string, unknown>) =>
    request<{ product: any }>('/api/products', { method: 'POST', body: body(payload) }),
  updateProduct: (id: string, payload: Record<string, unknown>) =>
    request<{ product: any }>(`/api/products/${id}`, { method: 'PATCH', body: body(payload) }),
  deleteProduct: (id: string) => request<{ ok: true }>(`/api/products/${id}`, { method: 'DELETE' }),

  sellerOrders: (status?: string) =>
    request<{ orders: any[] }>(`/api/orders/seller/list${status && status !== 'todas' ? `?status=${status}` : ''}`),
  verifyOrder: (id: string) => request<{ order: any }>(`/api/orders/${id}/verify`, { method: 'POST' }),
  shipOrder: (id: string) => request<{ order: any }>(`/api/orders/${id}/ship`, { method: 'POST' }),
  summary: () => request<{ summary: any }>('/api/orders/seller/summary'),
  customers: () => request<{ customers: any[] }>('/api/seller/customers'),
  thread: (id: string) => request<{ thread: any[] }>(`/api/seller/customers/${id}/thread`),
  sendMessage: (id: string, text: string) =>
    request<{ message: any }>(`/api/seller/customers/${id}/thread`, { method: 'POST', body: body({ text }) }),

  startStream: (payload: { title: string }) =>
    request<{ stream: any }>('/api/streams', { method: 'POST', body: body(payload) }),
  openLot: (streamId: string, productId: string) =>
    request<{ lot: any }>(`/api/streams/${streamId}/lot`, { method: 'POST', body: body({ productId }) }),
  setQueue: (streamId: string, productIds: string[]) =>
    request<{ queue: any[] }>(`/api/streams/${streamId}/queue`, { method: 'POST', body: body({ productIds }) }),
  nextInQueue: (streamId: string) =>
    request<{ lot: any }>(`/api/streams/${streamId}/queue/next`, { method: 'POST' }),
  extendLot: (streamId: string, seconds = 30) =>
    request<{ lot: any }>(`/api/streams/${streamId}/lot/extend`, { method: 'POST', body: body({ seconds }) }),
  closeLot: (streamId: string) => request<{ outcome: any }>(`/api/streams/${streamId}/lot`, { method: 'DELETE' }),
  endStream: (streamId: string) => request<{ ok: true }>(`/api/streams/${streamId}/end`, { method: 'POST' }),
};

/* ------------------------------------------------------------ socket --- */

type Handler = (payload: any) => void;

/**
 * Un socket para toda la app. En iOS la conexión se corta cada vez que la app
 * pasa a segundo plano: `resume()` (llamado desde AppState) la rehace al volver.
 */
class Realtime {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private channels = new Set<string>();
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    const base = API_URL.replace(/^http/, 'ws');
    this.ws = new WebSocket(`${base}/ws${token ? `?token=${token}` : ''}`);

    this.ws.onopen = () => {
      this.retry = 0;
      for (const channel of this.channels) this.send({ type: 'subscribe', channel });
      this.emit('connection', { online: true });
    };
    this.ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(String(event.data));
        this.emit(type, payload);
      } catch {
        /* trama inválida */
      }
    };
    this.ws.onclose = () => {
      this.emit('connection', { online: false });
      this.scheduleReconnect();
    };
    this.ws.onerror = () => this.ws?.close();
  }

  private scheduleReconnect() {
    if (this.timer) return;
    const delay = Math.min(1000 * 2 ** this.retry++, 15000);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }

  /** Al volver del segundo plano: reconectar ya, sin esperar el backoff. */
  resume() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.retry = 0;
    this.connect();
  }

  private send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  subscribe(channel: string) {
    this.channels.add(channel);
    this.connect();
    this.send({ type: 'subscribe', channel });
    return () => {
      this.channels.delete(channel);
      this.send({ type: 'unsubscribe', channel });
    };
  }

  on(type: string, handler: Handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  private emit(type: string, payload: any) {
    this.handlers.get(type)?.forEach((h) => h(payload));
  }

  reset() {
    this.channels.clear();
    this.ws?.close();
    this.ws = null;
  }
}

export const realtime = new Realtime();
