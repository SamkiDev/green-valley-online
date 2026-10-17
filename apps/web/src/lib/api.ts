import { tokenFor } from './guestOrders';
// Thin client for the Green Valley API. All requests go to /api (proxied to the backend in dev).
// Money fields arrive as strings (Postgres decimals); convert with Number() only for display.

export type StoreConfig = {
  accent?: { primary: string; secondary: string };
  whatsapp?: string;
  hours?: string;
  wholesale?: boolean;
  delivery?: boolean;
  collection?: boolean;
  deliveryWindowMinutes?: [number, number];
  ageVerification?: { required: boolean; minimumAge: number };
  responsibleSaleMessage?: string;
  complianceNotice?: string;
};
export type Store = {
  id: string; slug: string; name: string; category: string; description: string | null;
  status: 'ACTIVE' | 'COMING_SOON' | string; ageRestricted: boolean; config: StoreConfig;
};
export type Zone = { id: string; name: string; fee: string };
export type StoreDetail = Store & { zones: Zone[] };
export type Category = { id: string; name: string };
export type Product = {
  id: string; storeId: string; name: string; description: string; price: string; soldByWeight: boolean;
  imageUrl: string | null; popularity: number; isDemo: boolean; category: Category;
  inventory: { quantity: string; lowThreshold: string } | null;
  store?: { slug: string; name: string; ageRestricted: boolean; config?: StoreConfig };
};
export type QA = { id: string; text: string; createdAt: string; answers: { text: string }[] };
export type Me = { id: string; name: string; role: 'CUSTOMER' | 'STORE_STAFF' | 'DRIVER' | 'ADMIN'; email: string; phone: string | null } | null;
export type OrderItem = { id: string; productId: string; nameSnapshot: string; unitPrice: string; quantity: string; lineTotal: string; product: { soldByWeight: boolean } };
export const itemQty = (i: OrderItem) => (i.product.soldByWeight ? `${Number(i.quantity)} kg` : `× ${Number(i.quantity)}`);
export type Window = { from: string; to: string; demo: boolean } | null;
export type OrderDetail = {
  id: string; orderNumber: string; status: string; fulfilment: 'DELIVERY' | 'COLLECTION'; createdAt: string;
  subtotal: string; deliveryFee: string; total: string; contactName: string | null; contactPhone: string | null; contactEmail: string | null;
  area: string | null; address: { street: string; area: string; city: string; province: string; postalCode: string } | null;
  items: OrderItem[]; payment: { id: string; status: string; method: string; provider: string; providerRef: string | null; createdAt: string } | null;
  store: { slug: string; name: string; config: StoreConfig; ageRestricted: boolean }; estimatedWindow: Window; guest: boolean;
};
export type Tracking = {
  orderId: string; orderNumber: string; status: string; fulfilment: 'DELIVERY' | 'COLLECTION'; payment: string;
  steps: { key: string; label: string; at: string | null }[]; current: string; message: string | null;
  estimatedWindow: Window; deliveryStatus: string | null; simulated: boolean;
};
export type ChatMsg = { role: 'user' | 'assistant'; content: string };
export type ChatProduct = Pick<Product, 'id' | 'name' | 'price' | 'soldByWeight' | 'category' | 'imageUrl' | 'inventory'>;
export type ChatResponse = { reply: string; products?: ChatProduct[]; error?: string };
export type PayResponse = { paymentId: string; providerRef: string; orderId: string; orderNumber: string; status: 'PAID' | 'FAILED'; demo: boolean };

export const PROVINCES = ['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Free State', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape'] as const;
export const isSaPhone = (v: string) => /^(\+27|0)\d{9}$/.test(v.replace(/[\s-]/g, ''));
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
export type OrderSummary = {
  id: string; orderNumber: string; status: string; fulfilment: 'DELIVERY' | 'COLLECTION'; total: string; createdAt: string;
  items: { id: string; nameSnapshot: string; quantity: string }[]; payment: { status: string } | null; delivery: { status: string } | null;
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: Record<string, string[]>) { super(message); }
}

export const NETWORK_ERROR = "We can't reach Green Valley Online right now. Check your connection and try again.";

export async function api<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let res: Response;
  const headers: Record<string, string> = {};
  if (init?.body !== undefined) headers['Content-Type'] = 'application/json';
  // Guest orders: attach the order's access token if this device holds one.
  const orderId = path.match(/^\/(?:orders|payments)\/([a-z0-9]{20,})/)?.[1];
  const token = orderId && tokenFor(orderId);
  if (token) headers['X-Order-Token'] = token;
  try {
    res = await fetch('/api' + path, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
      signal: init?.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, NETWORK_ERROR);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 503 && data?.reply) throw new ApiError(503, data.reply); // e.g. Vallerie's fallback message
    const msg = res.status === 429 ? 'Too many requests. Please wait a moment and try again.'
      : res.status >= 500 && !data?.error ? 'Something went wrong on our side. Please try again.'
      : data?.error || `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, data?.details);
  }
  return data as T;
}

export type StockState = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
export function stockState(p: Pick<Product, 'inventory'>): StockState {
  const q = Number(p.inventory?.quantity ?? 0), low = Number(p.inventory?.lowThreshold ?? 5);
  return q <= 0 ? 'OUT_OF_STOCK' : q <= low ? 'LOW_STOCK' : 'IN_STOCK';
}
export const available = (p: Pick<Product, 'inventory'>) => Number(p.inventory?.quantity ?? 0);
