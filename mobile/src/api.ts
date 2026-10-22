import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

/**
 * Cliente de la API v2 (marketplace + vivos). Rutas:
 *  - /api/*        público (portada, catálogo, tiendas, vivos)
 *  - /api/me/*     comprador con sesión (carrito, pagos, pedidos, deseos…)
 *  - /api/seller/* panel del vendedor
 * Los montos llegan en bolivianos (número); el servidor guarda centavos.
 */
const TOKEN_KEY = 'comprasmio.token';

export const API_URL = String(
  process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || 'http://localhost:4000'
).replace(/\/$/, '');

/** "Bs 1.240" y, con centavos, "Bs 12,50". */
export const bs = (n: number | null | undefined) => {
  const v = Number(n || 0);
  const [int, dec] = Math.abs(v).toFixed(2).split('.');
  const body = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${v < 0 ? '−' : ''}Bs ${body}${dec !== '00' ? `,${dec}` : ''}`;
};

export const clock = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;

let token: string | null = null;
export const getToken = () => token;

export async function loadToken() {
  try {
    token = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    token = null;
  }
  return token;
}

export async function setToken(value: string | null) {
  token = value;
  // Si el llavero no está disponible (vista web de prueba), la sesión queda en memoria.
  try {
    if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* sin llavero */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
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

const get = <T = any>(p: string) => request<T>(p);
const post = <T = any>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) });
const put = <T = any>(p: string, body?: unknown) => request<T>(p, { method: 'PUT', body: JSON.stringify(body ?? {}) });
const patch = <T = any>(p: string, body?: unknown) => request<T>(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
const del = <T = any>(p: string) => request<T>(p, { method: 'DELETE' });
const qs = (params: Record<string, unknown>) => {
  const s = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return s ? `?${s}` : '';
};

/** Archivo local tal como lo entiende el FormData de React Native. */
export type Upload = { uri: string; name: string; type: string };

/** Sube un archivo al bucket y devuelve la clave para guardar en el recurso. */
export function upload(folder: string, file: Upload) {
  const form = new FormData();
  form.append('folder', folder);
  form.append('file', file as any);
  return request<{ key: string; url: string }>('/uploads', { method: 'POST', body: form });
}

export type ProductQuery = {
  q?: string; categoryId?: string; sellerId?: string; minPrice?: number; maxPrice?: number;
  freeShipping?: boolean; offers?: boolean; sort?: 'relevancia' | 'precio_asc' | 'precio_desc' | 'nuevos'; limit?: number; offset?: number;
};

export const api = {
  /* ------------------------------------------------------------ cuenta --- */
  config: () => get('/config'),
  signup: (payload: { name: string; phone: string; password: string; role: string }) => post('/auth/signup', payload),
  login: (phone: string, password: string) => post('/auth/login', { phone, password }),
  me: () => get('/auth/me'),
  updateMe: (payload: { name?: string; email?: string }) => patch('/auth/me', payload),
  changePassword: (current: string, next: string) => post('/auth/me/password', { current, next }),
  /** Requisito de Apple: borrar la cuenta desde la app. */
  deleteAccount: (password: string) => request('/auth/me', { method: 'DELETE', body: JSON.stringify({ password }) }),
  toggleBlock: (handle: string) => put(`/auth/me/blocked/${encodeURIComponent(handle)}`),
  report: (payload: { handle?: string; text?: string; streamId?: string; productId?: string; reason?: string }) => post('/auth/report', payload),

  /* ------------------------------------------------------------ público --- */
  home: () => get('/home'),
  categories: () => get('/categories'),
  products: (query: ProductQuery = {}) => get(`/products${qs(query)}`),
  product: (id: string) => get(`/products/${id}`),
  seller: (slug: string) => get(`/sellers/${slug}`),
  sellerReviews: (slug: string) => get(`/sellers/${slug}/reviews`),
  suggest: (q: string) => get(`/search/suggest${qs({ q })}`),
  trending: () => get('/search/trending'),
  searchCounts: (q: string) => get(`/search/counts${qs({ q })}`),
  searchSellers: (q: string) => get(`/search/sellers${qs({ q })}`),
  streams: (mode?: 'subasta' | 'fijo', q?: string) => get(`/streams${qs({ mode, q })}`),
  stream: (id: string) => get(`/streams/${id}`),

  /* --------------------------------------------------------- comprador --- */
  wishlist: () => get('/me/wishlist'),
  toggleWishlist: (productId: string) => put(`/me/wishlist/${productId}`),
  following: () => get('/me/following'),
  toggleFollow: (sellerId: string) => put(`/me/following/${sellerId}`),
  setFollowNotify: (sellerId: string, notify: boolean) => patch(`/me/following/${sellerId}`, { notify }),
  upcoming: () => get('/me/upcoming'),
  addresses: () => get('/me/addresses'),
  saveAddress: (payload: any, id?: string) => (id ? patch(`/me/addresses/${id}`, payload) : post('/me/addresses', payload)),
  deleteAddress: (id: string) => del(`/me/addresses/${id}`),
  cart: () => get('/me/cart'),
  addToCart: (variantId: string, qty = 1) => post('/me/cart/items', { variantId, qty }),
  setCartQty: (variantId: string, qty: number) => patch(`/me/cart/items/${variantId}`, { qty }),
  removeFromCart: (variantId: string) => del(`/me/cart/items/${variantId}`),
  checkout: (payload: { addressId?: string; phone?: string; delivery?: Record<string, 'envio' | 'retiro'> }) => post('/me/checkout', payload),
  payment: (id: string) => get(`/me/payments/${id}`),
  submitReceipt: (id: string, receiptKey: string) => post(`/me/payments/${id}/receipt`, { receiptKey }),
  orders: (filter?: string) => get(`/me/orders${qs({ filter })}`),
  order: (id: string) => get(`/me/orders/${id}`),
  confirmReceived: (id: string) => post(`/me/orders/${id}/confirm`),
  openClaim: (id: string, payload: { reason: string; description?: string; photoKeys?: string[] }) => post(`/me/orders/${id}/claim`, payload),
  review: (id: string, payload: { rating: number; comment?: string; photoKey?: string }) => post(`/me/orders/${id}/review`, payload),
  threads: () => get('/me/threads'),
  threadWithSeller: (sellerId: string, orderId?: string) => get(`/me/threads/${sellerId}${qs({ order: orderId })}`),
  messageSeller: (sellerId: string, text: string, orderId?: string) => post(`/me/threads/${sellerId}`, { text, orderId }),
  notifications: () => get('/me/notifications'),
  markNotificationsRead: (ids?: string[]) => post('/me/notifications/read', { ids }),
  badges: () => get('/me/badges'),
  bid: (streamId: string, amount: number) => post(`/me/streams/${streamId}/bid`, { amount }),
  buy: (streamId: string) => post(`/me/streams/${streamId}/buy`),
  chat: (streamId: string, text: string) => post(`/me/streams/${streamId}/chat`, { text }),
  liveToken: (streamId: string) =>
    get<{ url: string; token: string; room: string; role: 'broadcaster' | 'viewer' }>(`/me/streams/${streamId}/token`),

  /* ---------------------------------------------------------- vendedor --- */
  seller_: {
    summary: (period: 'hoy' | 'semana' | 'mes' = 'semana') => get(`/seller/summary${qs({ period })}`),
    products: (filter?: string, q?: string) => get(`/seller/products${qs({ filter, q })}`),
    product: (id: string) => get(`/seller/products/${id}`),
    saveProduct: (payload: any, id?: string) => (id ? put(`/seller/products/${id}`, payload) : post('/seller/products', payload)),
    setProductStatus: (id: string, status: 'active' | 'paused' | 'deleted') => patch(`/seller/products/${id}/status`, { status }),
    variantStock: (id: string) => get(`/seller/variants/${id}/stock`),
    adjustStock: (id: string, delta: number, reason: string, note?: string) => post(`/seller/variants/${id}/adjust`, { delta, reason, note }),
    bundles: () => get('/seller/bundles'),
    bundle: (id: string) => get(`/seller/bundles/${id}`),
    saveBundle: (payload: any, id?: string) => (id ? put(`/seller/bundles/${id}`, payload) : post('/seller/bundles', payload)),
    deleteBundle: (id: string) => del(`/seller/bundles/${id}`),
    orders: (filter?: string) => get(`/seller/orders${qs({ filter })}`),
    order: (id: string) => get(`/seller/orders/${id}`),
    advance: (id: string, to: 'preparando' | 'enviado', extra: { carrier?: string; tracking?: string } = {}) => post(`/seller/orders/${id}/advance`, { to, ...extra }),
    payouts: () => get('/seller/payouts'),
    payoutAccount: () => get('/seller/payout-account'),
    savePayoutAccount: (payload: any) => put('/seller/payout-account', payload),
    store: () => get('/seller/store'),
    saveStore: (payload: any) => put('/seller/store', payload),
    reviews: (stars?: number) => get(`/seller/reviews${qs({ stars })}`),
    replyReview: (id: string, text: string) => post(`/seller/reviews/${id}/reply`, { text }),
    threads: (q?: string) => get(`/seller/threads${qs({ q })}`),
    threadWithBuyer: (buyerId: string, orderId?: string) => get(`/seller/threads/${buyerId}${qs({ order: orderId })}`),
    messageBuyer: (buyerId: string, text: string, orderId?: string) => post(`/seller/threads/${buyerId}`, { text, orderId }),
    streams: () => get('/seller/streams'),
    setup: () => get('/seller/streams/setup'),
    startStream: (payload: { title?: string; entries: any[]; scheduledId?: string }) => post('/seller/streams', payload),
    scheduleStream: (title: string, at: string) => post('/seller/streams/schedule', { title, at }),
    reorderQueue: (streamId: string, reservationIds: string[]) => put(`/seller/streams/${streamId}/queue`, { reservationIds }),
    openNext: (streamId: string, reservationId?: string) => post(`/seller/streams/${streamId}/next`, { reservationId }),
    extend: (streamId: string, seconds = 30) => post(`/seller/streams/${streamId}/extend`, { seconds }),
    closeLot: (streamId: string) => del(`/seller/streams/${streamId}/lot`),
    endStream: (streamId: string) => post(`/seller/streams/${streamId}/end`),
    streamSummary: (streamId: string) => get(`/seller/streams/${streamId}/summary`),
  },
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

  /** Con conteo: dos pantallas pueden escuchar el mismo canal (sala + hoja del catálogo). */
  private refs = new Map<string, number>();

  subscribe(channel: string) {
    this.refs.set(channel, (this.refs.get(channel) || 0) + 1);
    if (!this.channels.has(channel)) {
      this.channels.add(channel);
      this.connect();
      this.send({ type: 'subscribe', channel });
    }
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const n = (this.refs.get(channel) || 1) - 1;
      this.refs.set(channel, n);
      if (n > 0) return;
      this.refs.delete(channel);
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
    this.refs.clear();
    this.ws?.close();
    this.ws = null;
  }
}

export const realtime = new Realtime();
