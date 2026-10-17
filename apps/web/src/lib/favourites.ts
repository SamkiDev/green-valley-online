// Favourites are kept in this browser until account favourites are added (Stage 5).
import { useCallback, useSyncExternalStore } from 'react';
import { load, save } from './storage';

const KEY = 'gv-favourites-v1';
const listeners = new Set<() => void>();
let ids: string[] = load<string[]>(KEY, []);

const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const snapshot = () => ids;

export function useFavourites() {
  const list = useSyncExternalStore(subscribe, snapshot);
  const toggle = useCallback((id: string) => {
    ids = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
    save(KEY, ids); listeners.forEach(l => l());
  }, []);
  return { ids: list, has: (id: string) => list.includes(id), toggle };
}
