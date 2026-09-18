import React from 'react';
import { api, setToken, getToken, realtime } from './api';

type Session = {
  user: any | null;
  loading: boolean;
  favorites: string[];
  online: boolean;
  login: (phone: string, password: string) => Promise<any>;
  signup: (payload: { name: string; phone: string; password: string; role: string }) => Promise<any>;
  logout: () => void;
  toggleFavorite: (streamId: string) => Promise<void>;
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
    // El vendedor escucha su propio canal para ver entrar los pedidos al instante.
    if (user?.sellerId) realtime.subscribe(`seller:${user.sellerId}`);
    const { favorites } = await api.favorites().catch(() => ({ favorites: [] as string[] }));
    setFavorites(favorites);
  }, []);

  React.useEffect(() => {
    const off = realtime.on('connection', ({ online }) => setOnline(online));
    if (!getToken()) {
      setLoading(false);
      return off;
    }
    api.me()
      .then(({ user }) => adopt(user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
    return off;
  }, [adopt]);

  const value: Session = {
    user,
    loading,
    favorites,
    online,
    async login(phone, password) {
      const { token, user } = await api.login(phone, password);
      setToken(token);
      await adopt(user);
      return user;
    },
    async signup(payload) {
      const { token, user } = await api.signup(payload);
      setToken(token);
      await adopt(user);
      return user;
    },
    logout() {
      setToken(null);
      realtime.reset();
      setUser(null);
      setFavorites([]);
    },
    async toggleFavorite(streamId) {
      const previous = favorites;
      // Optimista: el corazón responde al instante y se revierte si el servidor falla.
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
