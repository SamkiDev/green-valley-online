// Track Order: find any order by number + email (works for guests), see orders placed on this device as a guest,
// and, when signed in, the customer's own orders.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api, ApiError, isEmail } from '../lib/api';
import { useMe } from '../lib/auth';
import { guestOrders, rememberGuestOrder } from '../lib/guestOrders';
import { Field } from '../components/Field';
import { MyOrders } from '../components/OrdersList';
import { Button, PageHeader, Skeleton } from '../components/ui';

export default function TrackOrder() {
  const me = useMe();
  const device = guestOrders();
  return (
    <div className="container-page">
      <PageHeader eyebrow="Orders" title="Track your order">See where your order is, from the counter to your door.</PageHeader>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-6">
          {me.isPending ? <Skeleton className="h-32" /> : me.data?.role === 'CUSTOMER' ? (
            <section aria-labelledby="mine"><h2 id="mine" className="mb-3 text-xl font-extrabold">My orders</h2><MyOrders /></section>
          ) : !me.data && (
            <p className="card p-4 text-ink-2"><Link to="/account?next=/track" className="font-semibold text-brand-text underline">Sign in</Link> to see all your orders and order again.</p>
          )}
          {device.length > 0 && (
            <section aria-labelledby="device">
              <h2 id="device" className="mb-3 text-xl font-extrabold">Guest orders on this device</h2>
              <ul className="card divide-y divide-line">
                {device.map(g => (
                  <li key={g.id} className="flex items-center justify-between gap-3 p-4">
                    <span><span className="font-bold">#{g.orderNumber}</span> <span className="text-sm text-ink-3">· {new Date(g.at).toLocaleDateString('en-ZA')}</span></span>
                    <Link to={`/track/${g.id}`} className="font-semibold text-brand-text hover:underline">Track</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <LookupForm />
      </div>
    </div>
  );
}

function LookupForm() {
  const nav = useNavigate();
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const lookup = useMutation({
    mutationFn: () => api<{ orderId: string; token: string }>('/orders/lookup', { method: 'POST', body: { orderNumber: orderNumber.trim().toUpperCase(), email: email.trim() } }),
    onSuccess: r => { rememberGuestOrder({ id: r.orderId, orderNumber: orderNumber.trim().toUpperCase().replace('#', ''), token: r.token }); nav(`/track/${r.orderId}`); },
  });
  const numErr = touched && !/^#?GV\d{5,}$/i.test(orderNumber.trim()) ? 'Use your order number, e.g. GV10284' : undefined;
  const emailErr = touched && !isEmail(email) ? 'Enter the email used at checkout' : undefined;
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (/^#?GV\d{5,}$/i.test(orderNumber.trim()) && isEmail(email)) lookup.mutate(); };
  const server = lookup.error instanceof ApiError ? lookup.error.details : undefined;
  return (
    <form onSubmit={submit} noValidate className="card space-y-4 p-5 lg:sticky lg:top-24" aria-labelledby="find">
      <h2 id="find" className="flex items-center gap-2 text-lg font-extrabold"><Search className="size-5" aria-hidden /> Find an order</h2>
      <Field id="lk-number" label="Order number" placeholder="GV10284" autoCapitalize="characters" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} error={numErr ?? server?.orderNumber?.[0]} />
      <Field id="lk-email" label="Email used at checkout" type="email" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} error={emailErr ?? server?.email?.[0]} />
      {lookup.isError && !server && <p className="rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{lookup.error.message}</p>}
      <Button type="submit" className="w-full" busy={lookup.isPending}>Track order</Button>
    </form>
  );
}
