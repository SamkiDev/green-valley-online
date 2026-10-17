// Favourites: saved to the customer's account when signed in, otherwise kept on this device.
// Device favourites are merged into the account the first time the customer signs in.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { load, save } from './storage';
import { api, type Product } from './api';
import { useMe } from './auth';

const KEY = 'gv-favourites-v1';
const listeners = new Set<() => void>();
let local: string[] = load<string[]>(KEY, []);
const setLocal = (ids: string[]) => { local = ids; save(KEY, ids); listeners.forEach(l => l()); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };

export type FavouriteProduct = Product & { available: boolean };

export function useFavourites() {
  const { data: me } = useMe();
  const signedIn = me?.role === 'CUSTOMER';
  const qc = useQueryClient();
  const localIds = useSyncExternalStore(subscribe, () => local);
  const server = useQuery({ queryKey: ['favourites'], queryFn: () => api<FavouriteProduct[]>('/account/favourites'), enabled: signedIn, staleTime: 60_000 });

  // One-time merge of device favourites into the account.
  useEffect(() => {
    if (!signedIn || !local.length) return;
    const ids = local; setLocal([]);
    api('/account/favourites/merge', { method: 'POST', body: { productIds: ids } }).then(() => qc.invalidateQueries({ queryKey: ['favourites'] })).catch(() => setLocal(ids));
  }, [signedIn, qc]);

  const toggleServer = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api(`/account/favourites/${id}`, { method: on ? 'PUT' : 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['favourites'] }),
  });

  const ids = signedIn ? (server.data ?? []).map(p => p.id) : localIds;
  const pending = toggleServer.isPending ? toggleServer.variables : undefined;
  const has = (id: string) => (pending?.id === id ? pending.on : ids.includes(id));
  const toggle = useCallback((id: string) => {
    if (signedIn) toggleServer.mutate({ id, on: !ids.includes(id) });
    else setLocal(local.includes(id) ? local.filter(x => x !== id) : [...local, id]);
  }, [signedIn, ids, toggleServer]);

  return { ids, has, toggle, signedIn, products: server.data, isLoading: signedIn && server.isPending, error: server.error };
}
