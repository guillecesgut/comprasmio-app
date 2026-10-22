import React from 'react';
import { useFocusEffect } from 'expo-router';
import { api, realtime } from './api';
import { useToast } from './ui';

/**
 * Carga datos de la API con estado de error y recarga. Vuelve a cargar al volver
 * a la pantalla (`focus`) y cuando llega alguno de los eventos de socket indicados.
 */
export function useData<T = any>(fn: () => Promise<T>, deps: React.DependencyList = [], opts: { focus?: boolean; events?: string[] } = {}) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const fnRef = React.useRef(fn);
  fnRef.current = fn;
  const first = React.useRef(true);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { reload(); }, deps);

  useFocusEffect(React.useCallback(() => {
    if (first.current) { first.current = false; return; }
    if (opts.focus !== false) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]));

  React.useEffect(() => {
    if (!opts.events?.length) return;
    const offs = opts.events.map((t) => realtime.on(t, () => reload()));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, (opts.events || []).join()]);

  return { data, error, loading, reload, setData };
}

/** Marca o desmarca un producto en una lista ya cargada. */
export const setFav = (list: any[] | undefined, id: string, favorite: boolean) =>
  (list || []).map((p) => (p.id === id ? { ...p, favorite } : p));

/** Corazón de ProductoCard: optimista, con toast; `apply` actualiza el estado local. */
export function useToggleFav(apply: (id: string, favorite: boolean) => void) {
  const toast = useToast();
  return React.useCallback(async (p: any) => {
    apply(p.id, !p.favorite);
    try {
      const r = await api.toggleWishlist(p.id);
      apply(p.id, r.favorite);
      toast(r.favorite ? 'Guardado en tu lista de deseos' : 'Quitado de tu lista de deseos');
    } catch (e: any) {
      apply(p.id, !!p.favorite);
      toast(e.message);
    }
  }, [apply, toast]);
}
