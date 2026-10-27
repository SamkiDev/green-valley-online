import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Package } from 'lucide-react';
import { api, type OrderSummary } from '../lib/api';
import { rand } from '../lib/format';
import { Badge, EmptyState, ErrorState, LinkButton, Skeleton } from './ui';
import { ReorderButton } from './ReorderButton';

export const STATUS: Record<string, { label: string; tone: 'neutral' | 'ok' | 'warn' | 'brand' | 'danger' }> = {
  PLACED: { label: 'Awaiting payment', tone: 'warn' }, PAID: { label: 'Paid', tone: 'brand' }, PREPARING: { label: 'Being prepared', tone: 'brand' },
  PACKED: { label: 'Packed', tone: 'brand' }, OUT_FOR_DELIVERY: { label: 'On the way', tone: 'brand' }, DELIVERED: { label: 'Delivered', tone: 'ok' },
  READY_FOR_COLLECTION: { label: 'Ready for collection', tone: 'brand' }, COLLECTED: { label: 'Collected', tone: 'ok' }, CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

/** The signed-in customer's orders, with Track, Complete payment and Order again actions. */
export function MyOrders() {
  const orders = useQuery({ queryKey: ['orders'], queryFn: () => api<OrderSummary[]>('/orders') });
  if (orders.isPending) return <Skeleton className="h-32" />;
  if (orders.isError) return <ErrorState message={orders.error.message} onRetry={() => orders.refetch()} />;
  if (orders.data.length === 0) return <EmptyState icon={Package} title="No orders yet" action={<LinkButton to="/shop">Start shopping <ArrowRight className="size-4" aria-hidden /></LinkButton>}>When you place an order it will show up here.</EmptyState>;
  return (
    <ul className="space-y-3">
      {orders.data.map(o => {
        const s = STATUS[o.status] ?? { label: o.status, tone: 'neutral' as const };
        const unpaid = o.status === 'PLACED' && o.payment?.status !== 'PAID';
        const done = o.status === 'DELIVERED' || o.status === 'COLLECTED';
        return (
          <li key={o.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <Link to={`/track/${o.id}`} className="font-extrabold hover:underline">#{o.orderNumber}</Link>
              <p className="text-sm text-ink-2">{new Date(o.createdAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })} · {o.items.length} {o.items.length === 1 ? 'item' : 'items'} · {o.fulfilment === 'DELIVERY' ? 'Delivery' : 'Collection'}</p>
              <div className="mt-1 flex items-center gap-2"><Badge tone={s.tone}>{s.label}</Badge><span className="font-bold tabular-nums">{rand(o.total)}</span></div>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              {unpaid ? <LinkButton to={`/checkout/pay/${o.id}`} size="sm">Complete payment</LinkButton> : <LinkButton to={`/track/${o.id}`} size="sm" variant="secondary">Track</LinkButton>}
              {done && <ReorderButton orderId={o.id} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
