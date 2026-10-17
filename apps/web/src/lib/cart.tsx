// Cart lives in the browser for now (works for guests). It stores only product IDs and quantities:
// names, prices and stock are always read fresh from the API, and the server recomputes totals at checkout.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { load, save } from './storage';

export type CartLine = { productId: string; quantity: number };
export type Fulfilment = 'DELIVERY' | 'COLLECTION';
type CartState = { storeSlug: string; lines: CartLine[]; fulfilment: Fulfilment; zoneId: string | null };

type CartApi = CartState & {
  count: number;
  add: (productId: string, quantity: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  setFulfilment: (f: Fulfilment) => void;
  setZone: (zoneId: string | null) => void;
  quantityOf: (productId: string) => number;
};

const KEY = 'gv-cart-v1';
const initial: CartState = { storeSlug: 'meat-market', lines: [], fulfilment: 'DELIVERY', zoneId: null };
const round2 = (n: number) => Math.round(n * 100) / 100;

const Ctx = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(() => {
    const s = load<CartState>(KEY, initial);
    return Array.isArray(s?.lines) ? { ...initial, ...s } : initial;
  });
  useEffect(() => save(KEY, state), [state]);

  const add = useCallback((productId: string, quantity: number) => setState(s => {
    const existing = s.lines.find(l => l.productId === productId);
    const lines = existing
      ? s.lines.map(l => (l.productId === productId ? { ...l, quantity: round2(l.quantity + quantity) } : l))
      : [...s.lines, { productId, quantity: round2(quantity) }];
    return { ...s, lines };
  }), []);
  const setQuantity = useCallback((productId: string, quantity: number) => setState(s => ({
    ...s, lines: quantity <= 0 ? s.lines.filter(l => l.productId !== productId) : s.lines.map(l => (l.productId === productId ? { ...l, quantity: round2(quantity) } : l)),
  })), []);
  const remove = useCallback((productId: string) => setState(s => ({ ...s, lines: s.lines.filter(l => l.productId !== productId) })), []);
  const clear = useCallback(() => setState(s => ({ ...s, lines: [] })), []);
  const setFulfilment = useCallback((fulfilment: Fulfilment) => setState(s => ({ ...s, fulfilment })), []);
  const setZone = useCallback((zoneId: string | null) => setState(s => ({ ...s, zoneId })), []);

  const value = useMemo<CartApi>(() => ({
    ...state, add, setQuantity, remove, clear, setFulfilment, setZone,
    count: state.lines.length,
    quantityOf: (id: string) => state.lines.find(l => l.productId === id)?.quantity ?? 0,
  }), [state, add, setQuantity, remove, clear, setFulfilment, setZone]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used inside CartProvider');
  return c;
}
