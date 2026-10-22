import React from 'react';
import { AppState } from 'react-native';
import { api, setToken, loadToken, realtime } from './api';

type Badges = { cartUnits: number; pendingPayments: number; unread: number; liveNow: boolean; toPrepare: number };

type Session = {
  user: any | null;
  loading: boolean;
  online: boolean;
  badges: Badges;
  refreshBadges: () => void;
  refreshUser: () => Promise<void>;
  login: (phone: string, password: string) => Promise<any>;
  signup: (payload: { name: string; phone: string; password: string; role: string }) => Promise<any>;
  logout: () => Promise<void>;
  toggleBlock: (handle: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
};

const EMPTY: Badges = { cartUnits: 0, pendingPayments: 0, unread: 0, liveNow: false, toPrepare: 0 };
const Ctx = React.createContext<Session>(null as any);
export const useSession = () => React.useContext(Ctx);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [online, setOnline] = React.useState(false);
  const [badges, setBadges] = React.useState<Badges>(EMPTY);
  const userRef = React.useRef<any>(null);
  userRef.current = user;

  /** Badges de las tab bars: carrito, pagos pendientes y avisos (comprador); por preparar (vendedor). */
  const refreshBadges = React.useCallback(() => {
    const u = userRef.current;
    if (!u) return;
    api.streams().then(({ streams }) => setBadges((b) => ({ ...b, liveNow: streams.length > 0 }))).catch(() => {});
    if (u.role === 'seller') {
      api.seller_.orders('por_preparar').then(({ counts }) => setBadges((b) => ({ ...b, toPrepare: counts.por_preparar || 0 }))).catch(() => {});
      api.notifications().then(({ unread }) => setBadges((b) => ({ ...b, unread }))).catch(() => {});
    } else {
      api.badges().then((r) => setBadges((b) => ({ ...b, ...r }))).catch(() => {});
    }
  }, []);

  const adopt = React.useCallback(async (u: any) => {
    setUser(u);
    userRef.current = u;
    realtime.reset();
    realtime.connect();
    realtime.subscribe('feed');
    if (u?.sellerId) realtime.subscribe(`seller:${u.sellerId}`);
    refreshBadges();
  }, [refreshBadges]);

  React.useEffect(() => {
    const offs = [
      realtime.on('connection', ({ online }) => setOnline(online)),
      ...['order:new', 'order:update', 'payment:update', 'notification:new', 'notification:read', 'auction:won', 'purchase:done', 'stream:started', 'stream:ended']
        .map((type) => realtime.on(type, refreshBadges)),
    ];
    // iOS corta el socket en segundo plano; al volver se reconecta enseguida.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        realtime.resume();
        refreshBadges();
      }
    });

    (async () => {
      try {
        if (await loadToken()) {
          const { user } = await api.me();
          await adopt(user);
        }
      } catch {
        await setToken(null);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      offs.forEach((off) => off());
      sub.remove();
    };
  }, [adopt, refreshBadges]);

  const value: Session = {
    user,
    loading,
    online,
    badges,
    refreshBadges,
    async refreshUser() {
      const { user } = await api.me();
      setUser(user);
    },
    async login(phone, password) {
      const { token, user } = await api.login(phone, password);
      await setToken(token);
      await adopt(user);
      return user;
    },
    async signup(payload) {
      const { token, user } = await api.signup(payload);
      await setToken(token);
      await adopt(user);
      return user;
    },
    async logout() {
      await setToken(null);
      realtime.reset();
      setUser(null);
      setBadges(EMPTY);
    },
    async toggleBlock(handle) {
      const { user } = await api.toggleBlock(handle);
      setUser(user);
    },
    async deleteAccount(password) {
      await api.deleteAccount(password);
      await value.logout();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Recarga una pantalla cuando vuelve a estar en foco (al volver de una hoja o de otra tab). */
export { useFocusEffect } from 'expo-router';
