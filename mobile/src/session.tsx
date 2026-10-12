import React from 'react';
import { AppState } from 'react-native';
import { api, setToken, loadToken, realtime } from './api';

type Session = {
  user: any | null;
  loading: boolean;
  favorites: string[];
  online: boolean;
  login: (phone: string, password: string) => Promise<any>;
  signup: (payload: { name: string; phone: string; password: string; role: string }) => Promise<any>;
  logout: () => Promise<void>;
  toggleFavorite: (streamId: string) => Promise<void>;
  toggleBlock: (handle: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
};

const Ctx = React.createContext<Session>(null as any);
export const useSession = () => React.useContext(Ctx);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [favorites, setFavorites] = React.useState<string[]>([]);
  const [online, setOnline] = React.useState(false);

  const adopt = React.useCallback(async (user: any) => {
    setUser(user);
    realtime.reset();
    realtime.connect();
    if (user?.sellerId) realtime.subscribe(`seller:${user.sellerId}`);
    const { favorites } = await api.favorites().catch(() => ({ favorites: [] as string[] }));
    setFavorites(favorites);
  }, []);

  React.useEffect(() => {
    const off = realtime.on('connection', ({ online }) => setOnline(online));
    // iOS corta el socket en segundo plano; al volver se reconecta enseguida.
    const sub = AppState.addEventListener('change', (state) => state === 'active' && realtime.resume());

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
      off();
      sub.remove();
    };
  }, [adopt]);

  const value: Session = {
    user,
    loading,
    favorites,
    online,
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
      setFavorites([]);
    },
    async toggleBlock(handle) {
      const { user } = await api.toggleBlock(handle);
      setUser(user);
    },
    async deleteAccount(password) {
      await api.deleteAccount(password);
      await value.logout();
    },
    async toggleFavorite(streamId) {
      const previous = favorites;
      setFavorites(previous.includes(streamId) ? previous.filter((id) => id !== streamId) : [...previous, streamId]);
      try {
        const { favorites } = await api.toggleFavorite(streamId);
        setFavorites(favorites);
      } catch {
        setFavorites(previous);
      }
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
