// Cart lives in the browser (works for guests). It stores only product IDs and quantities:
// names, prices and stock are always read fresh from the API, and the server recomputes totals at checkout.
// An order comes from one store, so the cart belongs to one store at a time.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { load, save } from './storage';

export type CartLine = { productId: string; quantity: number };
export type Fulfilment = 'DELIVERY' | 'COLLECTION';
type CartState = { storeSlug: string; lines: CartLine[]; fulfilment: Fulfilment; zoneId: string | null };

type CartApi = CartState & {
  count: number;
  /** Returns false (and changes nothing) if the cart holds another store's items, unless `replace` is set. */
  add: (productId: string, quantity: number, storeSlug?: string, opts?: { replace?: boolean }) => boolean;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  setFulfilment: (f: Fulfilment) => void;
  setZone: (zoneId: string | null) => void;
  quantityOf: (productId: string) => number;
};

const KEY = 'gv-cart-v1';
export const DEFAULT_STORE = 'meat-market';
const initial: CartState = { storeSlug: DEFAULT_STORE, lines: [], fulfilment: 'DELIVERY', zoneId: null };
const round2 = (n: number) => Math.round(n * 100) / 100;
const valid = (s: unknown): s is CartState => !!s && Array.isArray((s as CartState).lines);

const Ctx = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(() => { const s = load<CartState>(KEY, initial); return valid(s) ? { ...initial, ...s } : initial; });
  const ref = useRef(state); ref.current = state;
  useEffect(() => save(KEY, state), [state]);
  // Keep tabs in step: a change made in another tab replaces this tab's copy.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key !== KEY || !e.newValue) return; try { const s = JSON.parse(e.newValue); if (valid(s)) setState({ ...initial, ...s }); } catch { /* ignore */ } };
    window.addEventListener('storage', onStorage); return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((productId: string, quantity: number, storeSlug = DEFAULT_STORE, opts?: { replace?: boolean }) => {
    const cur = ref.current;
    if (cur.lines.length && cur.storeSlug !== storeSlug && !opts?.replace) return false;
    setState(prev => {
      const s = prev.storeSlug !== storeSlug ? { ...prev, storeSlug, lines: [], zoneId: null } : prev; // new store, new cart
      const existing = s.lines.find(l => l.productId === productId);
      const lines = existing
        ? s.lines.map(l => (l.productId === productId ? { ...l, quantity: round2(l.quantity + quantity) } : l))
        : [...s.lines, { productId, quantity: round2(quantity) }];
      return { ...s, lines };
    });
    return true;
  }, []);
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

/** Add to cart, asking before replacing another store's cart. Returns whether the item was added. */
export function useAddToCart() {
  const cart = useCart();
  return useCallback((productId: string, quantity: number, storeSlug = DEFAULT_STORE) => {
    if (cart.add(productId, quantity, storeSlug)) return true;
    if (!window.confirm('Your cart has items from another store. Orders are placed one store at a time.\n\nEmpty your cart and add this item instead?')) return false;
    return cart.add(productId, quantity, storeSlug, { replace: true });
  }, [cart]);
}

/** Stores without delivery zones only offer collection; switch the cart to collection for them. */
export function useForceCollection(noDelivery: boolean | undefined) {
  const cart = useCart();
  useEffect(() => { if (noDelivery && cart.fulfilment === 'DELIVERY') cart.setFulfilment('COLLECTION'); }, [noDelivery, cart]);
}
