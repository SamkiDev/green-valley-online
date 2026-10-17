// Step 5: DEMO payment. No card or bank details are ever collected here; a real provider (Paystack, Payfast,
// Peach Payments) would take over on its own hosted page, behind the API's PaymentProvider interface.
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Landmark, Lock, PackageX, ShieldCheck } from 'lucide-react';
import { api, ApiError, itemQty, type OrderDetail, type PayResponse } from '../lib/api';
import { rand } from '../lib/format';
import { CheckoutSteps } from '../components/CheckoutSteps';
import { Button, EmptyState, ErrorState, LinkButton, PageHeader, Skeleton } from '../components/ui';

const METHODS = [
  { v: 'CARD', label: 'Card', sub: 'Visa, Mastercard', icon: CreditCard },
  { v: 'EFT', label: 'EFT / Pay by Bank', sub: 'Instant EFT from your bank', icon: Landmark },
] as const;

export default function Pay() {
  const { orderId = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const order = useQuery({ queryKey: ['order', orderId], queryFn: () => api<OrderDetail>(`/orders/${orderId}`) });
  const [method, setMethod] = useState<'CARD' | 'EFT'>('CARD');
  const pay = useMutation({
    mutationFn: () => api<PayResponse>(`/payments/${orderId}/pay`, { method: 'POST', body: { method } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['order', orderId] }); qc.invalidateQueries({ queryKey: ['orders'] }); nav(`/orders/${orderId}`, { replace: true }); },
  });

  if (order.isPending) return <div className="container-page"><PageHeader title="Payment" /><Skeleton className="h-72" /></div>;
  if (order.isError) {
    if (order.error instanceof ApiError && (order.error.status === 404 || order.error.status === 401))
      return <div className="container-page py-10"><EmptyState icon={PackageX} title="Order not found" action={<LinkButton to="/track" variant="secondary">My orders</LinkButton>}>Sign in with the account that placed this order.</EmptyState></div>;
    return <div className="container-page py-10"><ErrorState message={order.error.message} onRetry={() => order.refetch()} /></div>;
  }
  const o = order.data;
  if (o.payment?.status === 'PAID') return <Navigate to={`/orders/${o.id}`} replace />;
  if (o.status === 'CANCELLED') return <div className="container-page py-10"><EmptyState icon={PackageX} title="This order was cancelled">It can no longer be paid.</EmptyState></div>;

  return (
    <div className="container-page">
      <PageHeader eyebrow={`Order #${o.orderNumber}`} title="Payment" />
      <CheckoutSteps current={4} skipped={o.fulfilment === 'COLLECTION' ? [2] : []} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="card overflow-hidden" aria-labelledby="pay-h">
          <div className="flex items-center gap-2 bg-warn-bg px-5 py-3 text-sm font-bold text-warn-text" role="note">
            <ShieldCheck className="size-5 shrink-0" aria-hidden /> DEMO PAYMENT MODE · No real money is charged and no card details are collected.
          </div>
          <div className="space-y-5 p-5 sm:p-6">
            <h2 id="pay-h" className="text-xl font-extrabold">Choose how to pay</h2>
            <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <legend className="sr-only">Payment method</legend>
              {METHODS.map(({ v, label, sub, icon: Icon }) => (
                <label key={v} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${method === v ? 'border-brand bg-brand-soft' : 'border-line hover:border-ink-3'}`}>
                  <input type="radio" name="method" value={v} checked={method === v} onChange={() => setMethod(v)} className="mt-1 size-4 accent-[var(--brand)]" />
                  <span><span className="flex items-center gap-2 font-bold"><Icon className="size-5" aria-hidden />{label}</span><span className="text-sm text-ink-2">{sub}</span></span>
                </label>
              ))}
            </fieldset>
            <p className="flex gap-2 rounded-xl bg-surface-2 p-3 text-sm text-ink-2">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              When live payments are switched on, you'll complete {method === 'CARD' ? 'card' : 'bank'} payment on the payment provider's secure page. Green Valley Online never sees or stores your card details.
            </p>
            {pay.isError && <p className="rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{pay.error.message}</p>}
            <Button size="lg" className="w-full" onClick={() => pay.mutate()} busy={pay.isPending}>Pay Now · {rand(o.total)} <span className="rounded bg-black/15 px-1.5 py-px text-xs">DEMO</span></Button>
          </div>
        </section>
        <aside className="card space-y-3 p-5" aria-label="Order summary">
          <h2 className="font-extrabold">Order #{o.orderNumber}</h2>
          <ul className="space-y-1.5 text-sm">
            {o.items.map(i => <li key={i.id} className="flex justify-between gap-3"><span className="text-ink-2">{i.nameSnapshot} · {itemQty(i)}</span><span className="tabular-nums">{rand(i.lineTotal)}</span></li>)}
          </ul>
          <dl className="space-y-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-ink-2">Subtotal</dt><dd className="tabular-nums">{rand(o.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Delivery fee</dt><dd className="tabular-nums">{Number(o.deliveryFee) ? rand(o.deliveryFee) : 'Free'}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-base"><dt className="font-extrabold">Total</dt><dd className="font-extrabold tabular-nums">{rand(o.total)}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
