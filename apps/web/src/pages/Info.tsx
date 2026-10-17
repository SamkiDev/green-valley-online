// Smaller pages: Deals, Track Order (order list), About and Not Found.
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Compass, Package, Tag } from 'lucide-react';
import { api, type OrderSummary } from '../lib/api';
import { useMe } from '../lib/auth';
import { useProducts } from '../lib/queries';
import { rand } from '../lib/format';
import { ProductCard, ProductGridSkeleton } from '../components/ProductCard';
import { Badge, EmptyState, ErrorState, LinkButton, PageHeader, Skeleton } from '../components/ui';

export function Deals() {
  const packs = useProducts({ store: 'meat-market', category: 'Braai', sort: 'low' });
  return (
    <div className="container-page">
      <PageHeader eyebrow="Deals" title="Specials & value packs">The shop's specials board will appear here once published. Meanwhile, braai packs give the best value for groups.</PageHeader>
      <EmptyState icon={Tag} title="No specials published yet">Weekly specials (like wors, sausages and russians) will be listed here by the store.</EmptyState>
      <h2 className="mb-4 mt-10 text-2xl font-extrabold tracking-tight">Value packs</h2>
      {packs.isPending ? <ProductGridSkeleton n={4} /> : packs.isError ? <ErrorState message={packs.error.message} onRetry={() => packs.refetch()} /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">{packs.data.map(p => <ProductCard key={p.id} p={p} />)}</div>
      )}
    </div>
  );
}

const STATUS: Record<string, { label: string; tone: 'neutral' | 'ok' | 'warn' | 'brand' | 'danger' }> = {
  PLACED: { label: 'Awaiting payment', tone: 'warn' }, PAID: { label: 'Paid', tone: 'brand' }, PREPARING: { label: 'Being prepared', tone: 'brand' },
  PACKED: { label: 'Packed', tone: 'brand' }, OUT_FOR_DELIVERY: { label: 'On the way', tone: 'brand' }, DELIVERED: { label: 'Delivered', tone: 'ok' },
  READY_FOR_COLLECTION: { label: 'Ready for collection', tone: 'brand' }, COLLECTED: { label: 'Collected', tone: 'ok' }, CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

export function Track() {
  const me = useMe();
  const signedIn = me.data?.role === 'CUSTOMER';
  const orders = useQuery({ queryKey: ['orders'], queryFn: () => api<OrderSummary[]>('/orders'), enabled: signedIn });
  return (
    <div className="container-page">
      <PageHeader eyebrow="Orders" title="Track your order">See where your order is, from the counter to your door.</PageHeader>
      {me.isPending ? <Skeleton className="h-32" /> : !me.data ? (
        <EmptyState icon={Package} title="Sign in to see your orders" action={<LinkButton to="/account?next=/track">Sign in</LinkButton>}>Your order numbers and live status appear here after checkout.</EmptyState>
      ) : !signedIn ? (
        <EmptyState icon={Package} title="Customer orders only">Order tracking is for customer accounts.</EmptyState>
      ) : orders.isPending ? <Skeleton className="h-32" /> : orders.isError ? <ErrorState message={orders.error.message} onRetry={() => orders.refetch()} /> : orders.data.length === 0 ? (
        <EmptyState icon={Package} title="No orders yet" action={<LinkButton to="/shop">Start shopping <ArrowRight className="size-4" aria-hidden /></LinkButton>}>When you place an order it will show up here.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {orders.data.map(o => {
            const s = STATUS[o.status] ?? { label: o.status, tone: 'neutral' as const };
            return (
              <li key={o.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <Link to={`/track/${o.id}`} className="font-extrabold hover:underline">#{o.orderNumber}</Link>
                  <p className="text-sm text-ink-2">{new Date(o.createdAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })} · {o.items.length} {o.items.length === 1 ? 'item' : 'items'} · {o.fulfilment === 'DELIVERY' ? 'Delivery' : 'Collection'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={s.tone}>{s.label}</Badge><span className="font-bold tabular-nums">{rand(o.total)}</span>
                  {o.status === 'PLACED' && o.payment?.status !== 'PAID'
                    ? <LinkButton to={`/checkout/pay/${o.id}`} size="sm">Complete payment</LinkButton>
                    : <LinkButton to={`/track/${o.id}`} size="sm" variant="secondary">Track</LinkButton>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function About() {
  return (
    <div className="container-page max-w-3xl">
      <PageHeader eyebrow="About" title="Green Valley Online">Your local shopping centre, delivered to your door.</PageHeader>
      <div className="space-y-5 text-lg text-ink-2">
        <p>Green Valley Online brings the stores at the Green Valley shopping centre together in one place. Browse the shops you already know, order from your phone, and choose delivery to your door or collection from the store.</p>
        <p>The <Link to="/stores/meat-market" className="font-semibold text-brand-text underline">Green Valley Meat Market</Link> is the first store online, including bulk and wholesale orders. The Farm Stall, Bottle Liquors and Supermarket will follow.</p>
        <div className="card p-5 text-base">
          <p className="font-bold text-ink">This is a demo build</p>
          <p className="mt-1">Prices are demo prices, delivery fees are demo fees, and payments are simulated. No money is charged and no card details are collected.</p>
        </div>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="container-page py-10">
      <EmptyState icon={Compass} title="Page not found" action={<LinkButton to="/">Go home</LinkButton>}>The page you're looking for doesn't exist.</EmptyState>
    </div>
  );
}
