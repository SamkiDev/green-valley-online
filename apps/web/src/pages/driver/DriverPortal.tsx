// Driver portal: today's deliveries with one big action per card (ACCEPT → START → ARRIVED → DELIVERED).
// Each action sends the status the driver saw, so a double tap or a stale screen can't skip a step.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MapPin, PackageCheck, Phone, RotateCcw, Truck } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { dateTime, firstName, rand, time } from '../../lib/format';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '../../components/ui';

type DStatus = 'PENDING' | 'READY_FOR_PICKUP' | 'ASSIGNED' | 'OUT_FOR_DELIVERY' | 'ARRIVED' | 'DELIVERED';
type Delivery = {
  id: string; status: DStatus; mine: boolean; orderNumber: string; assignedAt: string | null; deliveredAt: string | null;
  order: {
    id: string; status: string; area: string | null; total: string; createdAt: string; contactName: string | null; contactPhone: string | null;
    address: { street: string; area: string; city: string; province: string; postalCode: string } | null;
    items: { nameSnapshot: string; quantity: string; product: { soldByWeight: boolean } }[];
  };
};

const ACTION: Partial<Record<DStatus, { label: string; variant: 'primary' | 'meat' | 'secondary' }>> = {
  PENDING: { label: 'ACCEPT DELIVERY', variant: 'primary' },
  READY_FOR_PICKUP: { label: 'ACCEPT DELIVERY', variant: 'primary' },
  ASSIGNED: { label: 'START DELIVERY', variant: 'primary' },
  OUT_FOR_DELIVERY: { label: 'ARRIVED', variant: 'primary' },
  ARRIVED: { label: 'DELIVERED', variant: 'meat' },
};
const STATUS_LABEL: Record<DStatus, string> = { PENDING: 'Waiting for a driver', READY_FOR_PICKUP: 'Ready for pickup', ASSIGNED: 'Accepted', OUT_FOR_DELIVERY: 'Out for delivery', ARRIVED: 'Arrived', DELIVERED: 'Delivered' };

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'GOOD MORNING' : h < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING'; };

export default function DriverPortal() {
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ['driver', 'mine'], queryFn: () => api<Delivery[]>('/deliveries/mine'), refetchInterval: 15_000 });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:py-10">
      <header className="mb-6">
        <p className="text-sm font-semibold text-ink-3">{new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">{greeting()}, {firstName(me?.name ?? '').toUpperCase()}</h1>
        {q.data && <p className="mt-1 text-ink-2">{q.data.filter(d => d.mine && d.status !== 'DELIVERED').length} active · {q.data.filter(d => !d.mine).length} available · {q.data.filter(d => d.status === 'DELIVERED').length} delivered today</p>}
      </header>

      {q.isPending ? <div className="space-y-3"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
        : q.isError ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : <Lists list={q.data} refreshing={q.isFetching} onRefresh={() => q.refetch()} />}
    </div>
  );
}

function Lists({ list, refreshing, onRefresh }: { list: Delivery[]; refreshing: boolean; onRefresh: () => void }) {
  const active = list.filter(d => d.mine && d.status !== 'DELIVERED');
  const available = list.filter(d => !d.mine);
  const done = list.filter(d => d.status === 'DELIVERED');
  return (
    <div className="space-y-8">
      <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={onRefresh} busy={refreshing}><RotateCcw className="size-4" aria-hidden /> Refresh</Button></div>
      <Section title="My deliveries" empty="No active deliveries. Accept one below when it's ready.">{active.map(d => <DeliveryCard key={d.id} d={d} />)}</Section>
      <Section title="Available to accept" empty="No unassigned deliveries right now.">{available.map(d => <DeliveryCard key={d.id} d={d} />)}</Section>
      {done.length > 0 && (
        <section aria-labelledby="done-h">
          <h2 id="done-h" className="mb-3 text-lg font-extrabold">Delivered today</h2>
          <ul className="card divide-y divide-line">
            {done.map(d => (
              <li key={d.id} className="flex items-center justify-between gap-3 p-4">
                <span><span className="font-bold">#{d.orderNumber}</span> <span className="text-ink-2">· {d.order.area ?? '—'}</span></span>
                <span className="flex items-center gap-1.5 text-sm text-ok-text"><CheckCircle2 className="size-4" aria-hidden />{d.deliveredAt ? time(d.deliveredAt) : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-lg font-extrabold">{title} <span className="text-ink-3">({children.length})</span></h2>
      {children.length ? <div className="space-y-3">{children}</div> : <EmptyState icon={Truck} title="Nothing here">{empty}</EmptyState>}
    </section>
  );
}

function DeliveryCard({ d }: { d: Delivery }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const action = d.mine || d.status === 'PENDING' || d.status === 'READY_FOR_PICKUP' ? ACTION[d.status] : undefined;
  const advance = useMutation({
    mutationFn: () => api(`/deliveries/${d.id}/advance`, { method: 'POST', body: { from: d.status } }),
    onSettled: () => { setConfirming(false); qc.invalidateQueries({ queryKey: ['driver'] }); },
  });
  const press = () => { if (d.status === 'ARRIVED' && !confirming) { setConfirming(true); return; } advance.mutate(); };
  const a = d.order.address;
  const stale = advance.error instanceof ApiError && advance.error.status === 409;

  return (
    <article className={`card overflow-hidden ${d.status === 'OUT_FOR_DELIVERY' || d.status === 'ARRIVED' ? 'ring-2 ring-brand' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <p className="text-lg font-extrabold">#{d.orderNumber}</p>
        <Badge tone={d.status === 'ARRIVED' || d.status === 'OUT_FOR_DELIVERY' ? 'brand' : d.status === 'PENDING' ? 'warn' : 'neutral'}>{STATUS_LABEL[d.status]}</Badge>
      </div>
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-ink-3">Customer</p>
          <p className="font-bold">{d.order.contactName ?? 'Customer'}</p>
          {d.order.contactPhone && (
            <a href={`tel:${d.order.contactPhone.replace(/[\s-]/g, '')}`} className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 font-semibold hover:border-ink-3">
              <Phone className="size-4" aria-hidden /> {d.order.contactPhone}
            </a>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-3">Deliver to</p>
          <p className="flex gap-1.5 font-bold"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{d.order.area ?? '—'}</p>
          {a && <p className="text-ink-2">{a.street}, {a.city} {a.postalCode}</p>}
        </div>
        <div className="sm:col-span-2">
          <p className="text-sm font-semibold text-ink-3">{d.order.items.length} {d.order.items.length === 1 ? 'item' : 'items'} · {rand(d.order.total)} (paid)</p>
          <p className="text-ink-2">{d.order.items.map(i => `${i.nameSnapshot} ${i.product.soldByWeight ? `${Number(i.quantity)} kg` : `× ${Number(i.quantity)}`}`).join(', ')}</p>
          <p className="mt-1 text-xs text-ink-3">Ordered {dateTime(d.order.createdAt)}</p>
        </div>
      </div>
      {action && (
        <div className="border-t border-line p-4">
          {advance.isError && <p className={`mb-3 rounded-xl p-3 text-sm font-semibold ${stale ? 'bg-warn-bg text-warn-text' : 'bg-danger-bg text-danger-text'}`} role="alert">{advance.error.message}</p>}
          <Button size="lg" variant={confirming ? 'meat' : action.variant} className="w-full text-lg" onClick={press} busy={advance.isPending}>
            {d.status === 'ARRIVED' ? <PackageCheck className="size-5" aria-hidden /> : <Truck className="size-5" aria-hidden />}
            {confirming ? 'TAP AGAIN TO CONFIRM DELIVERED' : action.label}
          </Button>
          {confirming && <button type="button" onClick={() => setConfirming(false)} className="mt-2 w-full min-h-10 text-sm font-semibold text-ink-2 hover:text-ink">Cancel</button>}
        </div>
      )}
    </article>
  );
}
