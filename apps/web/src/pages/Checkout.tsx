// Checkout: 1 details → 2 delivery or collection → 3 address (delivery only) → 4 review & place order → 5 payment (/checkout/pay/:id).
// The server re-validates everything and recomputes prices, fees and totals; nothing here is trusted.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, LogIn, MapPin, ShieldAlert, ShoppingBag, Store as StoreIcon, Truck, UserRound } from 'lucide-react';
import { api, ApiError, available, isEmail, isSaPhone, PROVINCES, type OrderDetail, type Product } from '../lib/api';
import { useMe } from '../lib/auth';
import { useCart, useForceCollection } from '../lib/cart';
import { rememberGuestOrder } from '../lib/guestOrders';
import { useProducts, useStore } from '../lib/queries';
import { lineTotal, qtyLabel, rand } from '../lib/format';
import { CheckoutSteps } from '../components/CheckoutSteps';
import { Field } from '../components/Field';
import { Button, DemoTag, EmptyState, ErrorState, LinkButton, PageHeader, Skeleton } from '../components/ui';
import { ConsentCheckbox } from './Legal';

type Contact = { firstName: string; lastName: string; phone: string; email: string };
type Address = { street: string; area: string; city: string; province: string; postalCode: string };
type SavedAddress = Address & { id: string; label: string | null };
const DRAFT_KEY = 'gv-checkout-draft';
const emptyAddress: Address = { street: '', area: '', city: 'Johannesburg', province: 'Gauteng', postalCode: '' };
const normSuburb = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function loadDraft(): { contact?: Contact; address?: Address } {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; }
}

export default function Checkout() {
  const me = useMe();
  const cart = useCart();
  const [asGuest, setAsGuest] = useState(false);
  if (me.isPending) return <Shell><Skeleton className="h-64" /></Shell>;
  if (me.isError) return <Shell><ErrorState message={me.error.message} onRetry={() => me.refetch()} /></Shell>;
  if (cart.lines.length === 0) return <Shell><EmptyState icon={ShoppingBag} title="Your cart is empty" action={<LinkButton to="/shop">Start shopping</LinkButton>}>Add products to your cart before checking out.</EmptyState></Shell>;
  if (me.data && me.data.role !== 'CUSTOMER')
    return <Shell><EmptyState icon={LogIn} title="Checkout is for customers">You're signed in with a staff account. Sign out to order as a customer.</EmptyState></Shell>;
  if (!me.data && !asGuest)
    return (
      <Shell>
        <div className="grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><LogIn className="size-5" aria-hidden /> Sign in</h2>
            <p className="flex-1 text-ink-2">Track your order, save addresses and order again in one tap.</p>
            <LinkButton to="/account?next=/checkout">Sign in or create an account</LinkButton>
          </section>
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><UserRound className="size-5" aria-hidden /> Check out as a guest</h2>
            <p className="flex-1 text-ink-2">No account needed. Track your order with its number and your email.</p>
            <Button variant="secondary" onClick={() => setAsGuest(true)}>Continue as guest</Button>
          </section>
        </div>
      </Shell>
    );
  return <CheckoutFlow guest={!me.data} defaults={{ name: me.data?.name ?? '', email: me.data?.email ?? '', phone: me.data?.phone ?? '' }} />;
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="container-page"><PageHeader eyebrow="Checkout" title="Checkout" />{children}</div>;
}

function CheckoutFlow({ guest, defaults }: { guest: boolean; defaults: { name: string; email: string; phone: string } }) {
  const cart = useCart();
  const nav = useNavigate();
  const qc = useQueryClient();
  const products = useProducts({ store: cart.storeSlug });
  const store = useStore(cart.storeSlug);
  useForceCollection(store.data && store.data.zones.length === 0);
  const draft = useMemo(loadDraft, []);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState<Record<number, boolean>>({});
  const [contact, setContact] = useState<Contact>(draft.contact ?? (() => {
    const [first = '', ...rest] = defaults.name.trim().split(/\s+/);
    return { firstName: first, lastName: rest.join(' '), phone: defaults.phone, email: defaults.email };
  })());
  const [address, setAddress] = useState<Address>(draft.address ?? emptyAddress);
  const [ageOk, setAgeOk] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [consent, setConsent] = useState(false);
  const [consentTouched, setConsentTouched] = useState(false);
  const saved = useQuery({ queryKey: ['addresses'], queryFn: () => api<SavedAddress[]>('/account/addresses'), enabled: !guest });
  const pickedSaved = saved.data?.find(a => (['street', 'area', 'city', 'province', 'postalCode'] as const).every(k => a[k] === address[k]));
  useEffect(() => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ contact, address })); } catch { /* ignore */ } }, [contact, address]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [step]);

  const delivery = cart.fulfilment === 'DELIVERY';
  const place = useMutation({
    mutationFn: () => api<OrderDetail & { guestToken?: string }>('/orders', { method: 'POST', body: {
      storeSlug: cart.storeSlug, fulfilment: cart.fulfilment, zoneId: delivery ? cart.zoneId : undefined,
      contact: { ...contact, firstName: contact.firstName.trim(), lastName: contact.lastName.trim(), email: contact.email.trim(), phone: contact.phone.trim() },
      address: delivery ? Object.fromEntries(Object.entries(address).map(([k, v]) => [k, v.trim()])) : undefined,
      items: cart.lines.map(l => ({ productId: l.productId, quantity: l.quantity })),
      ...(store.data?.ageRestricted ? { ageConfirmed: ageOk } : {}),
      ...(!guest && delivery && saveAddress && !pickedSaved ? { saveAddress: true } : {}),
      ...(guest ? { acceptPrivacy: consent } : {}),
    } }),
    onSuccess: order => {
      if (order.guestToken) rememberGuestOrder({ id: order.id, orderNumber: order.orderNumber, token: order.guestToken });
      cart.clear();
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['orders'] });
      nav(`/checkout/pay/${order.id}`, { replace: true });
    },
  });

  if (products.isPending || store.isPending) return <Shell><Skeleton className="h-64" /></Shell>;
  if (products.isError || store.isError) return <Shell><ErrorState message={(products.error ?? store.error)!.message} onRetry={() => { products.refetch(); store.refetch(); }} /></Shell>;

  const byId = new Map(products.data.map(p => [p.id, p]));
  const rows = cart.lines.map(l => ({ l, p: byId.get(l.productId) })).filter((r): r is { l: typeof r.l; p: Product } => !!r.p);
  const cartProblem = rows.length !== cart.lines.length || rows.some(r => available(r.p) < r.l.quantity);
  // When the store lists suburbs per zone, the zone (and fee) comes from the customer's suburb.
  const bySuburb = store.data.zones.some(z => z.suburbs?.length);
  const suburbZone = bySuburb && address.area.trim() ? store.data.zones.find(z => z.suburbs?.some(x => normSuburb(x) === normSuburb(address.area))) : undefined;
  const zone = bySuburb ? suburbZone : store.data.zones.find(z => z.id === cart.zoneId);
  const subtotal = Math.round(rows.reduce((s, r) => s + lineTotal(r.p.price, r.l.quantity), 0) * 100) / 100;
  const fee = delivery ? Number(zone?.fee ?? 0) : 0;

  const contactErrors: Partial<Record<keyof Contact, string>> = {};
  if (!contact.firstName.trim()) contactErrors.firstName = 'Enter your first name';
  if (!contact.lastName.trim()) contactErrors.lastName = 'Enter your surname';
  if (!isSaPhone(contact.phone)) contactErrors.phone = 'Enter a South African number, e.g. 082 123 4567';
  if (!isEmail(contact.email)) contactErrors.email = 'Enter a valid email address';
  const addressErrors: Partial<Record<keyof Address, string>> = {};
  if (address.street.trim().length < 3) addressErrors.street = 'Enter your street address';
  if (address.area.trim().length < 2) addressErrors.area = 'Enter your suburb or area';
  if (address.city.trim().length < 2) addressErrors.city = 'Enter your city';
  if (!PROVINCES.includes(address.province as (typeof PROVINCES)[number])) addressErrors.province = 'Choose a province';
  if (!/^\d{4}$/.test(address.postalCode.trim())) addressErrors.postalCode = 'Use a 4-digit postal code';
  if (bySuburb && !addressErrors.area && !suburbZone) addressErrors.area = `We don't deliver to ${address.area.trim()} yet. Check the spelling, or go back and choose collection.`;
  const fulfilmentError = delivery && !bySuburb && !zone ? 'Choose your delivery zone' : undefined;

  const ageRequired = !!store.data.ageRestricted, minAge = store.data.config.ageVerification?.minimumAge ?? 18;
  const stepValid = [Object.keys(contactErrors).length === 0 && (!ageRequired || ageOk), !fulfilmentError, !delivery || Object.keys(addressErrors).length === 0];
  const next = (e?: FormEvent) => {
    e?.preventDefault();
    setTouched(t => ({ ...t, [step]: true }));
    if (!stepValid[step]) { setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0); return; }
    if (step === 2 && bySuburb && suburbZone) cart.setZone(suburbZone.id); // the suburb decides the zone the server checks
    setStep(s => (s === 1 && !delivery ? 3 : s + 1));
  };
  const back = () => setStep(s => (s === 3 && !delivery ? 1 : s - 1));
  const err = <T extends string>(errs: Partial<Record<T, string>>, k: T) => (touched[step] ? errs[k] : undefined);
  const setC = (k: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement>) => setContact(c => ({ ...c, [k]: e.target.value }));
  const setA = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setAddress(a => ({ ...a, [k]: e.target.value }));

  const nav2 = (
    <div className="flex flex-wrap-reverse items-center justify-between gap-3 border-t border-line pt-5">
      {step > 0 ? <Button type="button" variant="ghost" onClick={back}><ArrowLeft className="size-4" aria-hidden /> Back</Button> : <Link to="/cart" className="font-semibold text-brand-text hover:underline">Back to cart</Link>}
      <Button type="submit" size="lg">Continue <ArrowRight className="size-5" aria-hidden /></Button>
    </div>
  );

  return (
    <div className="container-page">
      <PageHeader eyebrow="Checkout" title="Checkout" />
      <CheckoutSteps current={step} skipped={delivery ? [] : [2]} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="card p-5 sm:p-6">
          {step === 0 && (
            <form onSubmit={next} noValidate className="space-y-5" aria-labelledby="s0">
              <h2 id="s0" className="text-xl font-extrabold">Your details</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="co-first" label="First name" autoComplete="given-name" value={contact.firstName} onChange={setC('firstName')} error={err(contactErrors, 'firstName')} />
                <Field id="co-last" label="Surname" autoComplete="family-name" value={contact.lastName} onChange={setC('lastName')} error={err(contactErrors, 'lastName')} />
                <Field id="co-phone" label="Phone" type="tel" inputMode="tel" autoComplete="tel" value={contact.phone} onChange={setC('phone')} error={err(contactErrors, 'phone')} hint="The store and driver use this to reach you" />
                <Field id="co-email" label="Email" type="email" inputMode="email" autoComplete="email" value={contact.email} onChange={setC('email')} error={err(contactErrors, 'email')} hint={guest ? 'You can track your order with your order number and this email.' : undefined} />
              </div>
              {ageRequired && (
                <div className="rounded-2xl bg-warn-bg p-4 text-warn-text">
                  <p className="flex items-center gap-2 font-bold"><ShieldAlert className="size-5" aria-hidden /> Age-restricted order</p>
                  <label className="mt-2 flex items-start gap-3 font-semibold">
                    <input type="checkbox" className="mt-1 size-4 accent-[var(--brand)]" checked={ageOk} onChange={e => setAgeOk(e.target.checked)} aria-invalid={!!(touched[0] && !ageOk)} />
                    I confirm I am {minAge} or older, and whoever receives this order will show ID.
                  </label>
                  {touched[0] && !ageOk && <p className="mt-1 text-sm">Please confirm your age to continue.</p>}
                  {store.data.config.responsibleSaleMessage && <p className="mt-2 text-sm">{store.data.config.responsibleSaleMessage}</p>}
                </div>
              )}
              {nav2}
            </form>
          )}

          {step === 1 && (
            <form onSubmit={next} noValidate className="space-y-5" aria-labelledby="s1">
              <h2 id="s1" className="text-xl font-extrabold">Delivery or collection</h2>
              <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <legend className="sr-only">Fulfilment</legend>
                {([['DELIVERY', 'Delivery', `To your door, from ${store.data.name.replace('Green Valley ', 'the ')}`, Truck], ['COLLECTION', 'Collect from store', 'Pick up at Green Valley · free', StoreIcon]] as const).filter(([v]) => v === 'COLLECTION' || store.data.zones.length > 0).map(([v, title, sub, Icon]) => (
                  <label key={v} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${cart.fulfilment === v ? 'border-brand bg-brand-soft' : 'border-line hover:border-ink-3'}`}>
                    <input type="radio" name="fulfilment" value={v} checked={cart.fulfilment === v} onChange={() => cart.setFulfilment(v)} className="mt-1 size-4 accent-[var(--brand)]" />
                    <span><span className="flex items-center gap-2 font-bold"><Icon className="size-5" aria-hidden />{title}</span><span className="text-sm text-ink-2">{sub}</span></span>
                  </label>
                ))}
              </fieldset>
              {store.data.zones.length === 0 && <p className="text-sm text-ink-2">{store.data.name} offers collection from the store only for now.</p>}
              {delivery && bySuburb && (
                <div className="rounded-2xl bg-surface-2 p-4 text-sm text-ink-2">
                  <p>Your delivery zone and fee are set from your suburb on the next step.</p>
                  <details className="mt-2">
                    <summary className="cursor-pointer font-semibold text-ink">Where we deliver</summary>
                    <ul className="mt-2 space-y-1">{store.data.zones.filter(z => z.suburbs?.length).map(z => <li key={z.id}><span className="font-semibold">{z.name} · {rand(z.fee)}:</span> {z.suburbs!.join(', ')}</li>)}</ul>
                  </details>
                </div>
              )}
              {delivery && !bySuburb && (
                <div>
                  <label htmlFor="co-zone" className="mb-1 flex items-center gap-2 text-sm font-semibold">Delivery zone <DemoTag /></label>
                  <select id="co-zone" className="field" value={cart.zoneId ?? ''} onChange={e => cart.setZone(e.target.value || null)} aria-invalid={!!(touched[1] && fulfilmentError)} aria-describedby="co-zone-help">
                    <option value="">Choose your area…</option>
                    {store.data.zones.map(z => <option key={z.id} value={z.id}>{z.name} · {rand(z.fee)}</option>)}
                  </select>
                  <p id="co-zone-help" className={`mt-1 text-sm ${touched[1] && fulfilmentError ? 'text-danger-text' : 'text-ink-3'}`}>{touched[1] && fulfilmentError ? fulfilmentError : 'Demo zones and fees. The store confirms the final zone for your address.'}</p>
                </div>
              )}
              {nav2}
            </form>
          )}

          {step === 2 && (
            <form onSubmit={next} noValidate className="space-y-5" aria-labelledby="s2">
              <h2 id="s2" className="text-xl font-extrabold">Delivery address</h2>
              {!!saved.data?.length && (
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">Saved addresses</legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {saved.data.map(a => (
                      <label key={a.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm transition ${pickedSaved?.id === a.id ? 'border-brand bg-brand-soft' : 'border-line hover:border-ink-3'}`}>
                        <input type="radio" name="saved-address" value={a.id} checked={pickedSaved?.id === a.id} onChange={() => setAddress({ street: a.street, area: a.area, city: a.city, province: a.province, postalCode: a.postalCode })} className="mt-1 size-4 accent-[var(--brand)]" />
                        <span><span className="block font-bold">{a.label || a.street}</span><span className="text-ink-2">{a.street}, {a.area}, {a.city} {a.postalCode}</span></span>
                      </label>
                    ))}
                  </div>
                  <button type="button" className="mt-2 min-h-10 text-sm font-semibold text-brand-text hover:underline" onClick={() => setAddress(emptyAddress)}>Use a new address</button>
                </fieldset>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="co-street" label="Street address" className="sm:col-span-2" autoComplete="address-line1" value={address.street} onChange={setA('street')} error={err(addressErrors, 'street')} />
                <Field id="co-area" label="Suburb / area" autoComplete="address-level3" value={address.area} onChange={setA('area')} error={err(addressErrors, 'area')}
                  hint={bySuburb && suburbZone ? `${suburbZone.name} · delivery ${rand(suburbZone.fee)}` : undefined} />
                <Field id="co-city" label="City" autoComplete="address-level2" value={address.city} onChange={setA('city')} error={err(addressErrors, 'city')} />
                <div>
                  <label htmlFor="co-province" className="mb-1 block text-sm font-semibold">Province</label>
                  <select id="co-province" className="field" autoComplete="address-level1" value={address.province} onChange={setA('province')} aria-invalid={!!err(addressErrors, 'province')}>
                    {PROVINCES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <Field id="co-postal" label="Postal code" inputMode="numeric" autoComplete="postal-code" maxLength={4} value={address.postalCode} onChange={setA('postalCode')} error={err(addressErrors, 'postalCode')} />
              </div>
              {!guest && !pickedSaved && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-4 accent-[var(--brand)]" checked={saveAddress} onChange={e => setSaveAddress(e.target.checked)} /> Save this address for next time</label>}
              {nav2}
            </form>
          )}

          {step === 3 && (
            <section aria-labelledby="s3" className="space-y-5">
              <h2 id="s3" className="text-xl font-extrabold">Review your order</h2>
              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <ReviewBlock title="Contact" onEdit={() => setStep(0)}>{contact.firstName} {contact.lastName}<br />{contact.phone}<br />{contact.email}</ReviewBlock>
                <ReviewBlock title={delivery ? 'Delivery to' : 'Collection'} onEdit={() => setStep(delivery ? 2 : 1)}>
                  {delivery ? <>{address.street}<br />{address.area}, {address.city}<br />{address.province}, {address.postalCode}<br /><span className="text-ink-3">{zone?.name}</span></> : <>Collect from {store.data.name}</>}
                </ReviewBlock>
              </dl>
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {rows.map(({ l, p }) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <span className="min-w-0"><span className="font-semibold">{p.name}</span> <span className="text-ink-3">· {p.soldByWeight ? qtyLabel(l.quantity, true) : `× ${l.quantity}`}</span></span>
                    <span className="shrink-0 font-semibold tabular-nums">{rand(lineTotal(p.price, l.quantity))}</span>
                  </li>
                ))}
              </ul>
              {guest && <ConsentCheckbox id="co-consent" checked={consent} onChange={setConsent} error={consentTouched && !consent ? 'Please accept the privacy policy and terms to place your order' : undefined} />}
              {cartProblem && <p className="rounded-xl bg-warn-bg p-3 text-sm font-semibold text-warn-text" role="alert">Some items are no longer available in that quantity. <Link to="/cart" className="underline">Update your cart</Link>.</p>}
              {place.isError && (
                <p className="rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">
                  {place.error.message}{place.error instanceof ApiError && place.error.status === 409 && <> <Link to="/cart" className="underline">Update your cart</Link>.</>}
                </p>
              )}
              <div className="flex flex-wrap-reverse items-center justify-between gap-3 border-t border-line pt-5">
                <Button type="button" variant="ghost" onClick={back}><ArrowLeft className="size-4" aria-hidden /> Back</Button>
                <Button size="lg" onClick={() => { setConsentTouched(true); if (!guest || consent) place.mutate(); }} busy={place.isPending} disabled={cartProblem}>Place order & pay <ArrowRight className="size-5" aria-hidden /></Button>
              </div>
              <p className="text-sm text-ink-3">Placing your order reserves the stock. You'll pay on the next screen.</p>
            </section>
          )}
        </div>

        <aside className="card space-y-3 p-5 lg:sticky lg:top-24" aria-label="Order summary">
          <h2 className="font-extrabold">Order summary</h2>
          <p className="flex items-center gap-2 text-sm text-ink-2">{delivery ? <Truck className="size-4" aria-hidden /> : <MapPin className="size-4" aria-hidden />}{delivery ? (zone ? zone.name : 'Delivery: zone not chosen') : 'Collect from store'}</p>
          <dl className="space-y-2 border-t border-line pt-3">
            <div className="flex justify-between"><dt className="text-ink-2">{rows.length} {rows.length === 1 ? 'item' : 'items'}</dt><dd className="font-semibold tabular-nums">{rand(subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Delivery fee</dt><dd className="font-semibold tabular-nums">{delivery ? (zone ? rand(fee) : '—') : 'Free'}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-lg"><dt className="font-extrabold">Total</dt><dd className="font-extrabold tabular-nums">{delivery && !zone ? '—' : rand(subtotal + fee)}</dd></div>
          </dl>
          {rows.some(r => r.p.soldByWeight) && <p className="text-xs text-ink-3">Final price may vary slightly based on actual weighed quantity.</p>}
        </aside>
      </div>
    </div>
  );
}

function ReviewBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="mb-1 flex items-center justify-between"><dt className="font-bold">{title}</dt><button type="button" onClick={onEdit} className="min-h-9 rounded-lg px-2 text-sm font-semibold text-brand-text hover:underline">Edit</button></div>
      <dd className="text-ink-2">{children}</dd>
    </div>
  );
}
