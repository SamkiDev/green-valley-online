import { useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ArrowRight, ClipboardList } from 'lucide-react';
import { api } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { dateTime, rand } from '../../lib/format';
import { Badge, Button, DemoTag, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { AdminHeader } from './AdminLayout';
import { nextStatuses, ORDER_LABEL, ORDER_TONE, useAdmin, useAdminMutation, type AdminOrder, type InventoryRow, type OrderStatus, type Stats } from './adminApi';

const LIVE = 20_000; // dashboards refresh themselves

export function Overview() {
  const stats = useAdmin<Stats>('/stats', { refetchInterval: LIVE });
  const orders = useAdmin<AdminOrder[]>('/orders', { refetchInterval: LIVE });
  const inv = useAdmin<InventoryRow[]>('/inventory');
  const cards = stats.data && [
    { label: "Today's Sales", value: rand(stats.data.todaysSales), demo: true },
    { label: "Today's Orders", value: stats.data.todaysOrders },
    { label: 'Pending', value: stats.data.pending, hint: 'Awaiting payment or prep' },
    { label: 'Preparing', value: stats.data.preparing },
    { label: 'Out for Delivery', value: stats.data.outForDelivery },
    { label: 'Completed', value: stats.data.completedToday, hint: 'Delivered or collected today' },
  ];
  const alerts = inv.data?.filter(r => r.state !== 'IN_STOCK' && r.product.active) ?? [];
  return (
    <>
      <AdminHeader title="Overview">Live view of today's trading. Updates every 20 seconds.</AdminHeader>
      {stats.isError ? <ErrorState message={stats.error.message} onRetry={() => stats.refetch()} /> : (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {(cards ?? Array.from({ length: 6 }, () => null)).map((c, i) => c ? (
            <div key={c.label} className="card p-4">
              <dt className="flex items-center gap-1.5 text-sm font-semibold text-ink-2">{c.label}{c.demo && <DemoTag />}</dt>
              <dd className="mt-1 text-2xl font-extrabold tabular-nums">{c.value}</dd>
              {c.hint && <dd className="mt-0.5 text-xs text-ink-3">{c.hint}</dd>}
            </div>
          ) : <Skeleton key={i} className="h-24" />)}
        </dl>
      )}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card p-4 sm:p-5" aria-labelledby="recent">
          <div className="mb-3 flex items-center justify-between"><h2 id="recent" className="font-extrabold">Latest orders</h2><Link to="/admin/orders" className="flex items-center gap-1 text-sm font-semibold text-brand-text hover:underline">All orders <ArrowRight className="size-4" aria-hidden /></Link></div>
          {orders.isPending ? <Skeleton className="h-40" /> : orders.isError ? <ErrorState compact message={orders.error.message} onRetry={() => orders.refetch()} /> : orders.data.length === 0 ? <p className="text-ink-2">No orders yet.</p> : (
            <ul className="divide-y divide-line">
              {orders.data.slice(0, 6).map(o => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span><span className="font-bold">#{o.orderNumber}</span> <span className="text-sm text-ink-2">· {o.contactName ?? '—'} · {o.fulfilment === 'DELIVERY' ? o.area : 'Collection'}</span></span>
                  <span className="flex items-center gap-2"><Badge tone={ORDER_TONE[o.status]}>{ORDER_LABEL[o.status]}</Badge><span className="font-semibold tabular-nums">{rand(o.total)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-4 sm:p-5" aria-labelledby="stock">
          <div className="mb-3 flex items-center justify-between"><h2 id="stock" className="font-extrabold">Stock alerts</h2><Link to="/admin/inventory" className="text-sm font-semibold text-brand-text hover:underline">Inventory</Link></div>
          {inv.isPending ? <Skeleton className="h-40" /> : inv.isError ? <ErrorState compact message={inv.error.message} onRetry={() => inv.refetch()} /> : alerts.length === 0 ? <p className="text-ink-2">Everything is in stock.</p> : (
            <ul className="space-y-2">
              {alerts.slice(0, 8).map(r => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2"><AlertTriangle className={`size-4 ${r.state === 'OUT_OF_STOCK' ? 'text-danger-text' : 'text-warn-text'}`} aria-hidden />{r.product.name}</span>
                  <Badge tone={r.state === 'OUT_OF_STOCK' ? 'danger' : 'warn'}>{r.state === 'OUT_OF_STOCK' ? 'Out' : `${Number(r.quantity)}${r.product.soldByWeight ? ' kg' : ''} left`}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

const FILTERS: { key: string; label: string; match: (s: OrderStatus) => boolean }[] = [
  { key: 'active', label: 'Active', match: s => !['DELIVERED', 'COLLECTED', 'CANCELLED'].includes(s) },
  { key: 'pending', label: 'Pending', match: s => s === 'PLACED' || s === 'PAID' },
  { key: 'preparing', label: 'Preparing', match: s => ['PREPARING', 'PACKED', 'READY_FOR_COLLECTION'].includes(s) },
  { key: 'out', label: 'Out for delivery', match: s => s === 'OUT_FOR_DELIVERY' },
  { key: 'done', label: 'Completed', match: s => s === 'DELIVERED' || s === 'COLLECTED' },
  { key: 'cancelled', label: 'Cancelled', match: s => s === 'CANCELLED' },
  { key: 'all', label: 'All', match: () => true },
];

export function Orders() {
  const orders = useAdmin<AdminOrder[]>('/orders', { refetchInterval: LIVE });
  const drivers = useAdmin<{ id: string; name: string }[]>('/driver-options');
  const [filter, setFilter] = useState('active');
  const f = FILTERS.find(x => x.key === filter)!;
  const list = orders.data?.filter(o => f.match(o.status)) ?? [];
  const { data: me } = useMe();
  const [released, setReleased] = useState<string | null>(null);
  const release = useAdminMutation(() => api<{ checked: number; minutes: number }>('/admin/orders/release-unpaid', { method: 'POST' }));
  const unpaid = orders.data?.filter(o => o.status === 'PLACED').length ?? 0;
  return (
    <>
      <AdminHeader title="Orders" actions={me?.role === 'ADMIN' && unpaid > 0 && (
        <Button size="sm" variant="secondary" busy={release.isPending}
          onClick={() => release.mutate(undefined, { onSuccess: r => setReleased(`Checked ${r.checked} unpaid order${r.checked === 1 ? '' : 's'}. Orders unpaid for more than ${r.minutes} minutes were cancelled and their stock returned.`) })}>
          Release unpaid orders
        </Button>
      )}>Change status, assign drivers and follow every order. Delivery progress is updated by the driver. Unpaid orders are cancelled automatically after a while so their stock goes back on sale.</AdminHeader>
      {released && <p className="mb-3 rounded-xl bg-ok-bg p-3 text-sm font-semibold text-ok-text" role="status">{released}</p>}
      {release.isError && <p className="mb-3 rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{release.error.message}</p>}
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Filter orders">
        {FILTERS.map(x => (
          <button key={x.key} type="button" aria-pressed={filter === x.key} onClick={() => setFilter(x.key)}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition ${filter === x.key ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-2 hover:border-ink-3'}`}>
            {x.label}{orders.data && <span className="ml-1.5 opacity-70">{orders.data.filter(o => x.match(o.status)).length}</span>}
          </button>
        ))}
      </div>
      {orders.isPending ? <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
        : orders.isError ? <ErrorState message={orders.error.message} onRetry={() => orders.refetch()} />
        : list.length === 0 ? <EmptyState icon={ClipboardList} title="No orders here">Orders matching this filter will appear here.</EmptyState>
        : <div className="space-y-3">{list.map(o => <OrderCard key={o.id} o={o} drivers={drivers.data ?? []} />)}</div>}
    </>
  );
}

function OrderCard({ o, drivers }: { o: AdminOrder; drivers: { id: string; name: string }[] }) {
  const { data: me } = useMe();
  const next = nextStatuses(o);
  const setStatus = useAdminMutation((status: OrderStatus) => api(`/admin/orders/${o.id}/status`, { method: 'PATCH', body: { status } }));
  const assign = useAdminMutation((driverId: string | null) => api(`/admin/orders/${o.id}/driver`, { method: 'PATCH', body: { driverId } }));
  const canAssign = !!o.delivery && ['PENDING', 'READY_FOR_PICKUP', 'ASSIGNED'].includes(o.delivery.status) && o.status !== 'CANCELLED';
  const paid = o.payment?.status;
  const err = setStatus.error ?? assign.error;
  const onStatus = (s: OrderStatus) => {
    if (s === 'CANCELLED' && !window.confirm(`Cancel order #${o.orderNumber}? Stock will be returned${paid === 'PAID' ? ' and the demo payment marked refunded' : ''}.`)) return;
    setStatus.mutate(s);
  };

  return (
    <article className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-extrabold">#{o.orderNumber} <span className="text-sm font-semibold text-ink-3">· {dateTime(o.createdAt)}</span></p>
          <p className="text-ink-2">{o.contactName ?? 'Customer'}{o.contactPhone ? ` · ${o.contactPhone}` : ''}</p>
          <p className="text-sm text-ink-2">{o.fulfilment === 'DELIVERY' ? `Delivery · ${o.area ?? '—'}` : 'Collect in store'}{me?.role === 'ADMIN' ? ` · ${o.store.name}` : ''}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <p className="text-lg font-extrabold tabular-nums">{rand(o.total)}</p>
          <div className="flex flex-wrap justify-end gap-1.5">
            <Badge tone={ORDER_TONE[o.status]}>{ORDER_LABEL[o.status]}</Badge>
            <Badge tone={paid === 'PAID' ? 'ok' : paid === 'REFUNDED' ? 'neutral' : 'warn'}>{paid === 'PAID' ? 'Paid' : paid === 'REFUNDED' ? 'Refunded' : 'Unpaid'}</Badge>
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-2">{o.items.map(i => `${i.nameSnapshot} ${i.product.soldByWeight ? `${Number(i.quantity)} kg` : `× ${Number(i.quantity)}`}`).join(' · ')}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3">
        <div>
          <label htmlFor={`st-${o.id}`} className="mb-1 block text-xs font-semibold text-ink-3">Order status</label>
          <select id={`st-${o.id}`} className="field !min-h-10 !w-auto py-1.5 text-sm" value="" disabled={!next.length || setStatus.isPending} onChange={e => e.target.value && onStatus(e.target.value as OrderStatus)}>
            <option value="">{next.length ? 'Change to…' : 'No changes available'}</option>
            {next.map(s => <option key={s} value={s}>{ORDER_LABEL[s]}</option>)}
          </select>
        </div>
        {o.fulfilment === 'DELIVERY' && (
          <div>
            <label htmlFor={`dr-${o.id}`} className="mb-1 block text-xs font-semibold text-ink-3">Driver</label>
            {canAssign ? (
              <select id={`dr-${o.id}`} className="field !min-h-10 !w-auto py-1.5 text-sm" value={o.delivery?.driverId ?? ''} disabled={assign.isPending} onChange={e => assign.mutate(e.target.value || null)}>
                <option value="">Unassigned</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            ) : <p id={`dr-${o.id}`} className="min-h-10 py-2 text-sm font-semibold">{o.delivery?.driver?.user.name ?? (o.delivery ? 'Unassigned' : 'After payment')}{o.delivery && !canAssign && o.status !== 'CANCELLED' ? ` · ${o.delivery.status.replace(/_/g, ' ').toLowerCase()}` : ''}</p>}
          </div>
        )}
      </div>
      {err && <p className="mt-2 rounded-xl bg-danger-bg p-2.5 text-sm font-semibold text-danger-text" role="alert">{err.message}</p>}
    </article>
  );
}
