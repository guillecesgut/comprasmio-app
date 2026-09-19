const TOKEN_KEY = 'comprasmio.token';

export const bs = (n: number) =>
  'Bs ' + Math.round(n || 0).toLocaleString('es-BO').replace(/,/g, '.');

export const clock = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;

export const MODE = {
  auction: { label: 'SUBASTA', accent: 'var(--orange)', cta: 'Pujar', verb: 'Iniciar subasta' },
  fixed: { label: 'PRECIO FIJO', accent: 'var(--green)', cta: 'Comprar', verb: 'Poner en venta' },
} as const;

export type Mode = keyof typeof MODE;

export const STATUS_TABS = [
  { key: 'todas', label: 'Todas' },
  { key: 'en_revision', label: 'Pago en revisión' },
  { key: 'verificado', label: 'Pago verificado' },
  { key: 'enviado', label: 'Enviado' },
] as const;

let token = localStorage.getItem(TOKEN_KEY);
export const getToken = () => token;
export function setToken(value: string | null) {
  token = value;
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError((data as any)?.error || 'No pudimos conectar con el servidor.', res.status);
  return data as T;
}

const body = (payload: unknown) => JSON.stringify(payload);

export const api = {
  /** Qué capacidades tiene el servidor (hoy: si el video en vivo está configurado). */
  config: () => request<{ live: { url: string; configured: boolean } }>('/api/config'),

  /** Credenciales para entrar al video de una sala. */
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

  /* ------------------------------------------------------ comprador --- */
  streams: (mode: 'all' | Mode = 'all', q?: string) => {
    const params = new URLSearchParams();
    if (mode !== 'all') params.set('mode', mode);
    if (q) params.set('q', q);
    return request<{ streams: any[]; count: number }>(`/api/streams?${params}`);
  },
  stream: (id: string) => request<{ stream: any; lot: any; messages: any[]; queue: any[] }>(`/api/streams/${id}`),
  bid: (id: string, amount: number) =>
    request<{ lot: any }>(`/api/streams/${id}/bid`, { method: 'POST', body: body({ amount }) }),
  buy: (id: string) => request<{ order: any; lot: any }>(`/api/streams/${id}/buy`, { method: 'POST' }),
  chat: (id: string, text: string) =>
    request<{ message: any }>(`/api/streams/${id}/chat`, { method: 'POST', body: body({ text }) }),

  orders: () => request<{ orders: any[] }>('/api/orders'),
  paymentQr: (id: string) =>
    request<{ qr: string; bank: string; account: string; holder: string; total: number; ref: string }>(
      `/api/orders/${id}/qr`
    ),
  uploadReceipt: (id: string, file: File) => {
    const form = new FormData();
    form.append('receipt', file);
    return request<{ order: any }>(`/api/orders/${id}/receipt`, { method: 'POST', body: form });
  },

  favorites: () => request<{ favorites: string[] }>('/api/seller/favorites'),
  toggleFavorite: (streamId: string) =>
    request<{ favorites: string[] }>(`/api/seller/favorites/${streamId}`, { method: 'PUT' }),

  /** Info pública de un vendedor, para el encabezado del chat. */
  sellerInfo: (sellerId: string) => request<{ seller: any }>(`/api/sellers/${sellerId}`),  /** Chat directo con un vendedor puntual, para coordinar la entrega. */
  threadWith: (sellerId: string) => request<{ thread: any[] }>(`/api/threads/${sellerId}`),
  messageSeller: (sellerId: string, text: string) =>
    request<{ message: any }>(`/api/threads/${sellerId}`, { method: 'POST', body: body({ text }) }),

  /* --------------------------------------------------- notificaciones --- */
  notifications: () =>
    request<{ notifications: any[]; unread: number }>('/api/notifications'),
  /** Sin ids marca todas como leídas. */
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
  /** Arma la fila de productos a subastar. No abre ninguno: eso lo dispara el vendedor con nextInQueue. */
  setQueue: (streamId: string, productIds: string[]) =>
    request<{ queue: any[] }>(`/api/streams/${streamId}/queue`, { method: 'POST', body: body({ productIds }) }),
  /** Saca el siguiente producto de la cola y lo pone en el aire, a pedido del vendedor. */
  nextInQueue: (streamId: string) =>
    request<{ lot: any }>(`/api/streams/${streamId}/queue/next`, { method: 'POST' }),
  closeLot: (streamId: string) => request<{ outcome: any }>(`/api/streams/${streamId}/lot`, { method: 'DELETE' }),
  endStream: (streamId: string) => request<{ ok: true }>(`/api/streams/${streamId}/end`, { method: 'POST' }),
};

/* ------------------------------------------------------------ socket --- */

type Handler = (payload: any) => void;

/**
 * Un socket para toda la aplicación. Se resuscribe solo al reconectar:
 * en el navegador la conexión se cae al dormir la pestaña o cambiar de red.
 */
class Realtime {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private channels = new Set<string>();
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    const base = location.origin.replace(/^http/, 'ws');
    this.ws = new WebSocket(`${base}/ws${token ? `?token=${token}` : ''}`);

    this.ws.onopen = () => {
      this.retry = 0;
      for (const channel of this.channels) this.send({ type: 'subscribe', channel });
      this.emit('connection', { online: true });
    };
    this.ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);
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

  /** Al cambiar de sesión el token del socket queda viejo: hay que rehacerlo. */
  reset() {
    this.channels.clear();
    this.ws?.close();
    this.ws = null;
  }
}

export const realtime = new Realtime();
