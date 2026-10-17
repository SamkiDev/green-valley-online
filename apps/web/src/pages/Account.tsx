import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, LogOut, MapPin, Package, Plus, Trash2, UserRound } from 'lucide-react';
import { useAuthActions, useMe } from '../lib/auth';
import { api, ApiError, isSaPhone, PROVINCES } from '../lib/api';
import { useFavourites } from '../lib/favourites';
import { Button, EmptyState, ErrorState, LinkButton, PageHeader, Skeleton } from '../components/ui';
import { Field } from '../components/Field';
import { MyOrders } from '../components/OrdersList';
import { ProductCard, ProductGridSkeleton } from '../components/ProductCard';

const ROLE_LABEL = { CUSTOMER: 'Customer', STORE_STAFF: 'Store staff', DRIVER: 'Driver', ADMIN: 'Admin' } as const;

export default function Account() {
  const me = useMe();
  const { logout } = useAuthActions();
  if (me.isPending) return <div className="container-page"><PageHeader title="Account" /><Skeleton className="h-48 max-w-md" /></div>;
  if (me.isError) return <div className="container-page"><PageHeader title="Account" /><ErrorState message={me.error.message} onRetry={() => me.refetch()} /></div>;
  if (!me.data) return <AuthForms />;

  const customer = me.data.role === 'CUSTOMER';
  const tabs = customer ? TABS : TABS.filter(t => t.key === 'profile');
  return (
    <div className="container-page">
      <PageHeader eyebrow="Account" title={`Hello, ${me.data.name.split(' ')[0]}`}>Signed in as {ROLE_LABEL[me.data.role]}{customer ? '' : '. Use the staff portal for your work.'}</PageHeader>
      <AccountTabs tabs={tabs} />
      <Button variant="secondary" className="mt-8" busy={logout.isPending} onClick={() => logout.mutate()}><LogOut className="size-4" aria-hidden /> Sign out</Button>
      {logout.isError && <p className="mt-2 text-sm text-danger-text" role="alert">{logout.error.message}</p>}
    </div>
  );
}

const TABS = [
  { key: 'profile', label: 'My profile', icon: UserRound },
  { key: 'orders', label: 'My orders', icon: Package },
  { key: 'addresses', label: 'Saved addresses', icon: MapPin },
  { key: 'favourites', label: 'Favourites', icon: Heart },
] as const;

function AccountTabs({ tabs }: { tabs: readonly (typeof TABS)[number][] }) {
  const [params, setParams] = useSearchParams();
  const active = tabs.find(t => t.key === params.get('tab'))?.key ?? tabs[0].key;
  return (
    <>
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0" role="tablist" aria-label="Account sections">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" role="tab" id={`tab-${key}`} aria-selected={active === key} aria-controls={`panel-${key}`} onClick={() => setParams({ tab: key }, { replace: true })}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 font-semibold transition ${active === key ? 'border-brand bg-brand-soft text-brand-text' : 'border-line bg-surface text-ink-2 hover:border-ink-3'}`}>
            <Icon className="size-4" aria-hidden />{label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} className="max-w-4xl">
        {active === 'profile' && <Profile />}
        {active === 'orders' && <MyOrders />}
        {active === 'addresses' && <Addresses />}
        {active === 'favourites' && <Favourites />}
      </div>
    </>
  );
}

function Profile() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: me?.name ?? '', phone: me?.phone ?? '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [touched, setTouched] = useState({ profile: false, pw: false });
  const save = useMutation({ mutationFn: () => api('/account/profile', { method: 'PATCH', body: { name: f.name.trim(), phone: f.phone.trim() } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }) });
  const change = useMutation({ mutationFn: () => api('/account/password', { method: 'POST', body: pw }), onSuccess: () => setPw({ current: '', next: '' }) });
  const nameErr = touched.profile && !f.name.trim() ? 'Enter your name' : undefined;
  const phoneErr = touched.profile && f.phone.trim() && !isSaPhone(f.phone) ? 'Enter a South African number, e.g. 082 123 4567' : undefined;
  const curErr = touched.pw && !pw.current ? 'Enter your current password' : undefined;
  const nextErr = touched.pw && pw.next.length < 8 ? 'Use at least 8 characters' : undefined;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <form className="card space-y-4 p-5" noValidate aria-label="Your details" onSubmit={(e: FormEvent) => { e.preventDefault(); setTouched(t => ({ ...t, profile: true })); if (f.name.trim() && (!f.phone.trim() || isSaPhone(f.phone))) save.mutate(); }}>
        <h2 className="text-lg font-extrabold">Your details</h2>
        <Field id="pr-name" label="Full name" autoComplete="name" value={f.name} onChange={e => { save.reset(); setF(s => ({ ...s, name: e.target.value })); }} error={nameErr} />
        <Field id="pr-email" label="Email" value={me?.email ?? ''} readOnly disabled hint="Contact the store to change your sign-in email." />
        <Field id="pr-phone" label="Phone" type="tel" autoComplete="tel" value={f.phone} onChange={e => { save.reset(); setF(s => ({ ...s, phone: e.target.value })); }} error={phoneErr} />
        {save.isError && <p className="text-sm font-semibold text-danger-text" role="alert">{save.error.message}</p>}
        <div className="flex items-center gap-3"><Button type="submit" busy={save.isPending}>Save details</Button>{save.isSuccess && <span className="text-sm font-semibold text-ok-text" role="status">Saved</span>}</div>
      </form>
      <form className="card space-y-4 p-5" noValidate aria-label="Change password" onSubmit={(e: FormEvent) => { e.preventDefault(); setTouched(t => ({ ...t, pw: true })); if (pw.current && pw.next.length >= 8) change.mutate(); }}>
        <h2 className="text-lg font-extrabold">Change password</h2>
        <Field id="pr-current" label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={e => { change.reset(); setPw(s => ({ ...s, current: e.target.value })); }} error={curErr} />
        <Field id="pr-next" label="New password" type="password" autoComplete="new-password" value={pw.next} onChange={e => { change.reset(); setPw(s => ({ ...s, next: e.target.value })); }} error={nextErr} hint="At least 8 characters" />
        {change.isError && <p className="text-sm font-semibold text-danger-text" role="alert">{change.error.message}</p>}
        <div className="flex items-center gap-3"><Button type="submit" variant="secondary" busy={change.isPending}>Change password</Button>{change.isSuccess && <span className="text-sm font-semibold text-ok-text" role="status">Password changed</span>}</div>
      </form>
    </div>
  );
}

type SavedAddress = { id: string; label: string | null; street: string; area: string; city: string; province: string; postalCode: string };
const EMPTY_ADDRESS = { label: '', street: '', area: '', city: 'Johannesburg', province: 'Gauteng', postalCode: '' };

function Addresses() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['addresses'], queryFn: () => api<SavedAddress[]>('/account/addresses') });
  const [adding, setAdding] = useState(false);
  const [a, setA] = useState(EMPTY_ADDRESS);
  const [touched, setTouched] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['addresses'] });
  const add = useMutation({ mutationFn: () => api('/account/addresses', { method: 'POST', body: { ...a, label: a.label.trim() || undefined } }), onSuccess: () => { refresh(); setAdding(false); setA(EMPTY_ADDRESS); setTouched(false); } });
  const remove = useMutation({ mutationFn: (id: string) => api(`/account/addresses/${id}`, { method: 'DELETE' }), onSuccess: refresh });
  const errs: Record<string, string> = {};
  if (a.street.trim().length < 3) errs.street = 'Enter the street address';
  if (a.area.trim().length < 2) errs.area = 'Enter the suburb or area';
  if (a.city.trim().length < 2) errs.city = 'Enter the city';
  if (!/^\d{4}$/.test(a.postalCode.trim())) errs.postalCode = 'Use a 4-digit postal code';
  const show = (k: string) => (touched ? errs[k] : undefined);
  const set = (k: keyof typeof a) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setA(s => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      {list.isPending ? <Skeleton className="h-24" /> : list.isError ? <ErrorState message={list.error.message} onRetry={() => list.refetch()} /> : list.data.length === 0 && !adding ? (
        <EmptyState icon={MapPin} title="No saved addresses" action={<Button onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden /> Add an address</Button>}>Save an address here or at checkout to deliver faster next time.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {list.data.map(x => (
            <li key={x.id} className="card flex items-start justify-between gap-3 p-4">
              <div><p className="font-bold">{x.label || x.street}</p><p className="text-sm text-ink-2">{x.street}, {x.area}<br />{x.city}, {x.province} {x.postalCode}</p></div>
              <Button size="sm" variant="ghost" aria-label={`Remove ${x.label || x.street}`} busy={remove.isPending && remove.variables === x.id} onClick={() => remove.mutate(x.id)}><Trash2 className="size-4" aria-hidden /></Button>
            </li>
          ))}
        </ul>
      )}
      {remove.isError && <p className="text-sm text-danger-text" role="alert">{remove.error.message}</p>}
      {list.data && list.data.length > 0 && !adding && <Button variant="secondary" onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden /> Add an address</Button>}
      {adding && (
        <form noValidate className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2" aria-label="Add an address" onSubmit={(e: FormEvent) => { e.preventDefault(); setTouched(true); if (!Object.keys(errs).length) add.mutate(); }}>
          <Field id="ad-label" label="Label (optional)" placeholder="e.g. Home, Work" value={a.label} onChange={set('label')} />
          <Field id="ad-street" label="Street address" autoComplete="address-line1" value={a.street} onChange={set('street')} error={show('street')} />
          <Field id="ad-area" label="Suburb / area" autoComplete="address-level3" value={a.area} onChange={set('area')} error={show('area')} />
          <Field id="ad-city" label="City" autoComplete="address-level2" value={a.city} onChange={set('city')} error={show('city')} />
          <div>
            <label htmlFor="ad-province" className="mb-1 block text-sm font-semibold">Province</label>
            <select id="ad-province" className="field" value={a.province} onChange={set('province')}>{PROVINCES.map(p => <option key={p}>{p}</option>)}</select>
          </div>
          <Field id="ad-postal" label="Postal code" inputMode="numeric" maxLength={4} value={a.postalCode} onChange={set('postalCode')} error={show('postalCode')} />
          {add.isError && <p className="text-sm font-semibold text-danger-text sm:col-span-2" role="alert">{add.error.message}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" busy={add.isPending}>Save address</Button></div>
        </form>
      )}
    </div>
  );
}

function Favourites() {
  const fav = useFavourites();
  if (fav.isLoading) return <ProductGridSkeleton n={4} />;
  if (fav.error) return <ErrorState message={fav.error.message} />;
  const items = fav.products ?? [];
  if (items.length === 0) return <EmptyState icon={Heart} title="No favourites yet" action={<LinkButton to="/shop">Browse products</LinkButton>}>Tap the heart on a product to save it here.</EmptyState>;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
      {items.map(p => (
        <div key={p.id} className="relative">
          {p.available ? <ProductCard p={p} /> : <div className="card p-4 opacity-70"><p className="font-bold">{p.name}</p><p className="text-sm text-ink-3">Not available right now</p></div>}
          <button type="button" onClick={() => fav.toggle(p.id)} className="absolute right-5 top-5 grid size-10 place-items-center rounded-full bg-surface/90 text-meat-text shadow" aria-label={`Remove ${p.name} from favourites`}>
            <Heart className="size-5" fill="currentColor" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

function AuthForms() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const { login, register } = useAuthActions();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [touched, setTouched] = useState(false);
  const m = mode === 'login' ? login : register;
  const serverErrors = m.error instanceof ApiError ? m.error.details : undefined;

  const errors: Partial<Record<keyof typeof f, string>> = {};
  if (mode === 'register' && !f.name.trim()) errors.name = 'Please enter your name';
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) errors.email = 'Enter a valid email address';
  if (mode === 'register' && f.phone && !/^[+\d][\d\s-]{8,18}$/.test(f.phone.trim())) errors.phone = 'Enter a valid phone number';
  if (mode === 'register' ? f.password.length < 8 : !f.password) errors.password = mode === 'register' ? 'Use at least 8 characters' : 'Enter your password';
  const show = (k: keyof typeof f) => (touched ? errors[k] : undefined) ?? serverErrors?.[k]?.[0];

  const submit = (e: FormEvent) => {
    e.preventDefault(); setTouched(true);
    if (Object.keys(errors).length) return;
    const done = { onSuccess: () => next && next.startsWith('/') && nav(next) };
    if (mode === 'login') login.mutate({ email: f.email.trim(), password: f.password }, done);
    else register.mutate({ name: f.name.trim(), email: f.email.trim(), password: f.password, ...(f.phone.trim() ? { phone: f.phone.trim() } : {}) }, done);
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(s => ({ ...s, [k]: e.target.value }));

  return (
    <div className="container-page">
      <PageHeader eyebrow="Account" title={mode === 'login' ? 'Sign in' : 'Create your account'}>Track orders, reorder favourites and check out faster.</PageHeader>
      <div className="card max-w-md p-5 sm:p-6">
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-surface-2 p-1" role="tablist" aria-label="Sign in or register">
          {(['login', 'register'] as const).map(k => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setTouched(false); login.reset(); register.reset(); }}
              className={`min-h-10 rounded-lg text-sm font-bold transition ${mode === k ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'}`}>{k === 'login' ? 'Sign in' : 'Register'}</button>
          ))}
        </div>
        <form onSubmit={submit} noValidate className="space-y-4">
          {mode === 'register' && <Field id="acc-name" label="Full name" autoComplete="name" value={f.name} onChange={set('name')} error={show('name')} />}
          <Field id="acc-email" label="Email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={set('email')} error={show('email')} />
          {mode === 'register' && <Field id="acc-phone" label="Phone (optional)" type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={set('phone')} error={show('phone')} />}
          <Field id="acc-password" label="Password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} error={show('password')} hint={mode === 'register' ? 'At least 8 characters' : undefined} />
          {m.isError && !serverErrors && <p className="rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{m.error.message}</p>}
          <Button type="submit" size="lg" className="w-full" busy={m.isPending}>{mode === 'login' ? 'Sign in' : 'Create account'}</Button>
        </form>
      </div>
      <p className="mt-4 text-sm text-ink-3">Just browsing? <LinkButton to="/shop" variant="ghost" size="sm">Continue shopping</LinkButton></p>
    </div>
  );
}
