import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { LogOut, Package, UserRound } from 'lucide-react';
import { useAuthActions, useMe } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Button, ErrorState, LinkButton, PageHeader, Skeleton } from '../components/ui';
import { Field } from '../components/Field';

const ROLE_LABEL = { CUSTOMER: 'Customer', STORE_STAFF: 'Store staff', DRIVER: 'Driver', ADMIN: 'Admin' } as const;

export default function Account() {
  const me = useMe();
  const { logout } = useAuthActions();
  if (me.isPending) return <div className="container-page"><PageHeader title="Account" /><Skeleton className="h-48 max-w-md" /></div>;
  if (me.isError) return <div className="container-page"><PageHeader title="Account" /><ErrorState message={me.error.message} onRetry={() => me.refetch()} /></div>;
  if (!me.data) return <AuthForms />;

  return (
    <div className="container-page">
      <PageHeader eyebrow="Account" title={`Hello, ${me.data.name.split(' ')[0]}`}>Signed in as {ROLE_LABEL[me.data.role]}.</PageHeader>
      <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
        <Link to="/track" className="card flex items-center gap-4 p-5 hover:border-ink-3">
          <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand-text"><Package className="size-5" aria-hidden /></span>
          <span><span className="block font-bold">My orders</span><span className="text-sm text-ink-2">Status and tracking</span></span>
        </Link>
        <div className="card flex items-center gap-4 p-5">
          <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-ink-2"><UserRound className="size-5" aria-hidden /></span>
          <span><span className="block font-bold">Profile, addresses &amp; favourites</span><span className="text-sm text-ink-2">Coming in a later build</span></span>
        </div>
      </div>
      <Button variant="secondary" className="mt-6" busy={logout.isPending} onClick={() => logout.mutate()}><LogOut className="size-4" aria-hidden /> Sign out</Button>
      {logout.isError && <p className="mt-2 text-sm text-danger-text" role="alert">{logout.error.message}</p>}
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
