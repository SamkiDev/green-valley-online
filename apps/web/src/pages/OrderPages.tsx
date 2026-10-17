import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Clock, CreditCard, MapPin, PackageCheck, PackageX, Radio, Store as StoreIcon, Truck } from 'lucide-react';
import { api, ApiError, itemQty, type OrderDetail, type Tracking } from '../lib/api';
import { dateTime, rand, time, windowLabel } from '../lib/format';
import { Badge, DemoTag, EmptyState, ErrorState, LinkButton, Skeleton } from '../components/ui';
import { WhatsAppButton } from '../components/WhatsAppButton';

function NotFoundOrError({ error, retry }: { error: Error; retry: () => void }) {
  if (error instanceof ApiError && (error.status === 404 || error.status === 401 || error.status === 403))
    return <div className="container-page py-10"><EmptyState icon={PackageX} title="Order not found" action={<LinkButton to="/track" variant="secondary">My orders</LinkButton>}>Sign in with the account that placed this order.</EmptyState></div>;
  return <div className="container-page py-10"><ErrorState message={error.message} onRetry={retry} /></div>;
}

// ---- Order confirmation (/orders/:id) ----
export function OrderConfirmation() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api<OrderDetail>(`/orders/${id}`) });
  if (q.isPending) return <div className="container-page py-8"><Skeleton className="h-96" /></div>;
  if (q.isError) return <NotFoundOrError error={q.error} retry={() => q.refetch()} />;
  const o = q.data, paid = o.payment?.status === 'PAID', delivery = o.fulfilment === 'DELIVERY';

  return (
    <div className="container-page max-w-3xl py-6 md:py-10">
      <section className={`animate-rise rounded-3xl p-6 text-center md:p-10 ${paid ? 'bg-panel text-on-panel' : 'card'}`} aria-live="polite">
        {paid ? <CheckCircle2 className="mx-auto size-14 text-emerald-400" aria-hidden /> : <Clock className="mx-auto size-14 text-warn-text" aria-hidden />}
        <p className={`mt-3 text-sm font-bold uppercase tracking-[0.2em] ${paid ? 'text-emerald-300' : 'text-warn-text'}`}>{paid ? 'Order confirmed' : 'Awaiting payment'}</p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight md:text-5xl">#{o.orderNumber}</h1>
        <p className={`mt-3 ${paid ? 'text-on-panel-2' : 'text-ink-2'}`}>
          {paid ? `Thanks, ${o.contactName?.split(' ')[0] ?? 'there'}! ${o.store.name} is preparing your order.` : 'Your order is reserved. Complete payment to confirm it.'}
        </p>
        {paid && o.estimatedWindow && <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 font-semibold"><Clock className="size-4" aria-hidden /> Estimated delivery {windowLabel(o.estimatedWindow)} <span className="text-xs font-bold text-on-panel-2">DEMO ESTIMATE</span></p>}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {paid ? <LinkButton to={`/track/${o.id}`} size="lg">TRACK MY ORDER</LinkButton> : <LinkButton to={`/checkout/pay/${o.id}`} size="lg">Complete payment</LinkButton>}
          <LinkButton to="/shop" size="lg" variant={paid ? 'onPanel' : 'secondary'}>Keep shopping</LinkButton>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="card p-5" aria-labelledby="ful">
          <h2 id="ful" className="flex items-center gap-2 font-extrabold">{delivery ? <Truck className="size-5 text-ink-3" aria-hidden /> : <StoreIcon className="size-5 text-ink-3" aria-hidden />}{delivery ? 'Delivery' : 'Collection'}</h2>
          <p className="mt-2 text-ink-2">
            {delivery && o.address ? <>{o.address.street}<br />{o.address.area}, {o.address.city}<br />{o.address.province}, {o.address.postalCode}</> : <>Collect from {o.store.name}. We'll let you know when it's ready.</>}
          </p>
          <p className="mt-2 text-sm text-ink-3">{o.contactName} · {o.contactPhone}</p>
        </section>
        <section className="card p-5" aria-labelledby="payh">
          <h2 id="payh" className="flex items-center gap-2 font-extrabold"><CreditCard className="size-5 text-ink-3" aria-hidden /> Payment</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {paid ? <Badge tone="ok">Paid</Badge> : <Badge tone="warn">Not paid yet</Badge>}
            {o.payment?.provider === 'demo' && <DemoTag />}
          </div>
          {o.payment && <p className="mt-2 text-sm text-ink-2">{o.payment.method === 'EFT' ? 'EFT / Pay by Bank' : 'Card'} · Ref {o.payment.providerRef}<br />Payment ID {o.payment.id}</p>}
          <p className="mt-1 text-sm text-ink-3">Placed {dateTime(o.createdAt)}</p>
        </section>
      </div>

      <section className="card mt-4 p-5" aria-labelledby="items">
        <h2 id="items" className="font-extrabold">Items</h2>
        <ul className="mt-3 divide-y divide-line">
          {o.items.map(i => (
            <li key={i.id} className="flex justify-between gap-3 py-2.5">
              <span><span className="font-semibold">{i.nameSnapshot}</span> <span className="text-ink-3">· {itemQty(i)} @ {rand(i.unitPrice)}{i.product.soldByWeight ? '/kg' : ''}</span></span>
              <span className="shrink-0 font-semibold tabular-nums">{rand(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1.5 border-t border-line pt-3">
          <div className="flex justify-between"><dt className="text-ink-2">Subtotal</dt><dd className="tabular-nums">{rand(o.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-2">Delivery fee</dt><dd className="tabular-nums">{Number(o.deliveryFee) ? rand(o.deliveryFee) : 'Free'}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-lg"><dt className="font-extrabold">Total</dt><dd className="font-extrabold tabular-nums">{rand(o.total)}</dd></div>
        </dl>
        {o.items.some(i => i.product.soldByWeight) && <p className="mt-2 text-sm text-ink-3">Final price may vary slightly based on actual weighed quantity.</p>}
      </section>
    </div>
  );
}

// ---- Live tracking (/track/:id). Simulated: updates come from the driver portal, no GPS yet. ----
const DONE_STATES = ['DELIVERED', 'COLLECTED', 'CANCELLED'];

export function TrackingPage() {
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: ['tracking', id], queryFn: () => api<Tracking>(`/orders/${id}/tracking`),
    refetchInterval: query => (query.state.data && DONE_STATES.includes(query.state.data.status) ? false : 8000),
    refetchIntervalInBackground: false,
  });
  const store = useQuery({ queryKey: ['store', 'meat-market'], queryFn: () => api<{ config: { whatsapp?: string } }>('/stores/meat-market'), staleTime: 300_000 });
  if (q.isPending) return <div className="container-page py-8"><Skeleton className="h-96" /></div>;
  if (q.isError) return <NotFoundOrError error={q.error} retry={() => q.refetch()} />;
  const t = q.data;
  const currentIndex = t.steps.findIndex(s => s.key === t.current);
  const done = DONE_STATES.includes(t.status);

  return (
    <div className="container-page max-w-3xl py-6 md:py-10">
      <nav className="mb-4 text-sm text-ink-3" aria-label="Breadcrumb"><Link to="/track" className="hover:underline">My orders</Link> / <span className="text-ink-2">#{t.orderNumber}</span></nav>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-text">Tracking</p>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Order #{t.orderNumber}</h1>
        </div>
        {!done && <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink-2"><Radio className="size-4 animate-pulse text-brand-text" aria-hidden /> Live · updates automatically</span>}
      </header>

      {t.message && (
        <div className={`animate-rise mt-5 flex items-center gap-3 rounded-2xl p-4 text-lg font-bold ${t.status === 'DELIVERED' ? 'bg-ok-bg text-ok-text' : t.status === 'CANCELLED' ? 'bg-danger-bg text-danger-text' : 'bg-brand-soft text-brand-text'}`} role="status" aria-live="polite">
          {t.status === 'DELIVERED' ? <PackageCheck className="size-6 shrink-0" aria-hidden /> : <Truck className="size-6 shrink-0" aria-hidden />}{t.message}
        </div>
      )}

      {t.payment !== 'PAID' && t.status !== 'CANCELLED' && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warn-bg p-4 text-warn-text">
          <p className="font-semibold">This order hasn't been paid yet.</p>
          <LinkButton to={`/checkout/pay/${t.orderId}`} size="sm">Complete payment</LinkButton>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
        <section className="card p-5 sm:p-6" aria-labelledby="timeline">
          <h2 id="timeline" className="sr-only">Order progress</h2>
          <ol className="relative">
            {t.steps.map((s, i) => {
              const reached = !!s.at, current = i === currentIndex;
              return (
                <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0" aria-current={current ? 'step' : undefined}>
                  {i < t.steps.length - 1 && <span className={`absolute left-[11px] top-7 h-[calc(100%-1.5rem)] w-0.5 ${t.steps[i + 1].at ? 'bg-brand' : 'bg-line'}`} aria-hidden />}
                  <span className="relative z-10 mt-0.5 shrink-0">
                    {reached ? <CheckCircle2 className="size-6 text-brand-text" fill={current ? 'var(--brand-soft)' : 'none'} aria-hidden /> : <Circle className="size-6 text-line" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`font-bold ${reached ? 'text-ink' : 'text-ink-3'}`}>{s.label}{current && !done && <span className="ml-2 align-middle"><Badge tone="brand">Now</Badge></span>}</p>
                    <p className="text-sm text-ink-3">{s.at ? dateTime(s.at) : 'Pending'}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
        <aside className="space-y-4">
          {t.estimatedWindow && !done && (
            <div className="card p-5">
              <p className="flex items-center gap-2 font-extrabold"><Clock className="size-5 text-ink-3" aria-hidden /> Estimated arrival</p>
              <p className="mt-1 text-2xl font-extrabold">{windowLabel(t.estimatedWindow)}</p>
              <p className="mt-1 flex items-center gap-2 text-sm text-ink-3"><DemoTag>DEMO ESTIMATE</DemoTag></p>
            </div>
          )}
          <div className="card p-5">
            <p className="flex items-center gap-2 font-extrabold"><MapPin className="size-5 text-ink-3" aria-hidden /> {t.fulfilment === 'DELIVERY' ? 'Delivery' : 'Collection'}</p>
            <p className="mt-1 text-sm text-ink-2">Tracking is simulated in this demo: the driver updates each step from the driver portal. Live map tracking comes later.</p>
            <p className="mt-2 text-xs text-ink-3">Last checked {time(new Date(q.dataUpdatedAt).toISOString())}</p>
          </div>
          <WhatsAppButton number={store.data?.config.whatsapp} label="Need help?" message={`Hi, I have a question about order #${t.orderNumber}.`} className="w-full" />
          <LinkButton to={`/orders/${t.orderId}`} variant="secondary" className="w-full">Order details</LinkButton>
        </aside>
      </div>
    </div>
  );
}
