import React from 'react';
import { api, setToken, getToken, handleUnauthorized, connectSocket, closeSocket } from './api';

export type AdminUser = { id: string; name: string; email: string; role: string; adminRole: 'admin' | 'pagos' | 'moderador' };

type Session = {
  user: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (...roles: string[]) => boolean;
};

const Ctx = React.createContext<Session>(null as any);
export const useSession = () => React.useContext(Ctx);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AdminUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  const logout = React.useCallback(() => {
    setToken(null);
    closeSocket();
    setUser(null);
  }, []);

  React.useEffect(() => {
    handleUnauthorized(logout);
    if (!getToken()) { setLoading(false); return; }
    api.get('/auth/me')
      .then(({ user }) => {
        if (user.role !== 'admin') throw new Error('no admin');
        setUser(user);
        connectSocket();
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [logout]);

  const value: Session = {
    user,
    loading,
    async login(email, password) {
      const { token, user } = await api.post('/auth/login', { email, password });
      if (user.role !== 'admin') throw new Error('Esta cuenta no es del equipo de ComprasMío!.');
      setToken(token);
      setUser(user);
      connectSocket();
    },
    logout,
    can: (...roles) => Boolean(user && (user.adminRole === 'admin' || roles.includes(user.adminRole))),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
