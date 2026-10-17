import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Category, type StoreConfig } from '../../lib/api';

export type OrderStatus = 'PLACED' | 'PAID' | 'PREPARING' | 'PACKED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'READY_FOR_COLLECTION' | 'COLLECTED' | 'CANCELLED';
export type Stats = { todaysSales: number; todaysOrders: number; pending: number; preparing: number; outForDelivery: number; completedToday: number };
export type AdminOrder = {
  id: string; orderNumber: string; status: OrderStatus; fulfilment: 'DELIVERY' | 'COLLECTION'; total: string; createdAt: string;
  contactName: string | null; contactPhone: string | null; area: string | null; store: { name: string };
  items: { id: string; nameSnapshot: string; quantity: string; lineTotal: string; product: { soldByWeight: boolean } }[];
  payment: { status: string; method: string; providerRef: string | null } | null;
  delivery: { id: string; status: string; driverId: string | null; driver: { user: { name: string } } | null } | null;
};
export type AdminProduct = {
  id: string; storeId: string; name: string; description: string; price: string; soldByWeight: boolean; imageUrl: string | null; active: boolean;
  category: Category; inventory: { quantity: string; lowThreshold: string } | null; store: { name: string; slug: string };
};
export type InventoryRow = { id: string; productId: string; quantity: string; lowThreshold: string; state: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'; product: { id: string; name: string; active: boolean; soldByWeight: boolean; category: { name: string } } };
export type Customer = { id: string; name: string; email: string; phone: string | null; active: boolean; createdAt: string; orders: number; spent: number; lastOrderAt: string | null };
export type Driver = {
  id: string; vehicle: string | null; user: { id: string; name: string; email: string; phone: string | null; active: boolean };
  active: { id: string; orderNumber: string; area: string | null; status: string }[]; delivered: number;
  history: { id: string; orderNumber: string; area: string | null; deliveredAt: string | null }[];
};
export type AdminStore = { id: string; slug: string; name: string; category: string; description: string | null; status: string; ageRestricted: boolean; config: StoreConfig; zones: { id: string; name: string; fee: string; active: boolean }[]; _count: { products: number } };
export type Analytics = { days: number; orders: number; revenue: number; averageOrderValue: number; topProducts: { productId: string; name: string; revenue: number; quantity: number; orders: number }[]; last7Days: { date: string; revenue: number }[] };
export type Wholesale = { id: string; name: string; business: string; phone: string; email: string; products: string; quantity: string; preferredDate: string | null; notes: string | null; createdAt: string };
export type Question = { id: string; text: string; createdAt: string; product: { name: string }; customer: { user: { name: string } } | null; answers: { id: string; text: string; createdAt: string }[] };

export const useAdmin = <T,>(path: string, opts: { refetchInterval?: number; enabled?: boolean } = {}) =>
  useQuery({ queryKey: ['admin', path], queryFn: () => api<T>('/admin' + path), ...opts });

// Mutations refresh every admin query afterwards, so all panels stay consistent.
export function useAdminMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }); qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['stores'] }); } });
}

export const ORDER_LABEL: Record<OrderStatus, string> = {
  PLACED: 'Awaiting payment', PAID: 'Paid', PREPARING: 'Preparing', PACKED: 'Packed', OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered', READY_FOR_COLLECTION: 'Ready for collection', COLLECTED: 'Collected', CANCELLED: 'Cancelled',
};
export const ORDER_TONE: Record<OrderStatus, 'neutral' | 'ok' | 'warn' | 'danger' | 'brand'> = {
  PLACED: 'warn', PAID: 'brand', PREPARING: 'brand', PACKED: 'brand', OUT_FOR_DELIVERY: 'brand', DELIVERED: 'ok', READY_FOR_COLLECTION: 'brand', COLLECTED: 'ok', CANCELLED: 'danger',
};
// Mirrors the server's allowed transitions; the server is still the one that decides.
export function nextStatuses(o: Pick<AdminOrder, 'status' | 'fulfilment' | 'delivery'>): OrderStatus[] {
  const collect = o.fulfilment === 'COLLECTION';
  const driverLeft = !!o.delivery && ['OUT_FOR_DELIVERY', 'ARRIVED', 'DELIVERED'].includes(o.delivery.status);
  const map: Partial<Record<OrderStatus, OrderStatus[]>> = {
    PLACED: ['CANCELLED'], PAID: ['PREPARING', 'CANCELLED'],
    PREPARING: collect ? ['PACKED', 'READY_FOR_COLLECTION', 'CANCELLED'] : ['PACKED', 'CANCELLED'],
    PACKED: collect ? ['READY_FOR_COLLECTION', 'CANCELLED'] : ['CANCELLED'],
    READY_FOR_COLLECTION: ['COLLECTED', 'CANCELLED'],
  };
  return (map[o.status] ?? []).filter(s => !(s === 'CANCELLED' && driverLeft));
}
