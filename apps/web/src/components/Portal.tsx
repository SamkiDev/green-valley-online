// Shell for the staff-facing portals (driver, admin). No customer navigation or Vallerie here.
// The role check below only decides what to show; the API enforces roles on every request.
import { Suspense, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Outlet, ScrollRestoration } from 'react-router';
import { LogOut, Moon, ShieldAlert, Sun } from 'lucide-react';
import { useAuthActions, useMe } from '../lib/auth';
import { useTheme } from '../lib/theme';
import type { Me } from '../lib/api';
import { Logo } from './Layout';
import { Field } from './Field';
import { Button, ErrorState, Skeleton } from './ui';

type Role = NonNullable<Me>['role'];

export function PortalLayout({ label }: { label: string }) {
  const { theme, toggle } = useTheme();
  const { data: me } = useMe();
  const { logout } = useAuthActions();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 md:px-6">
          <Logo className="text-[1.05rem]" />
          <span className="rounded-md bg-panel px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-on-panel">{label}</span>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={toggle} className="grid size-11 place-items-center rounded-xl hover:bg-surface-2" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
            </button>
            {me && (
              <Button variant="ghost" onClick={() => logout.mutate()} busy={logout.isPending} aria-label="Sign out"><LogOut className="size-4" aria-hidden /><span className="hidden sm:inline">Sign out</span></Button>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="flex-1"><Suspense fallback={<div className="mx-auto max-w-md px-4 py-10"><Skeleton className="h-64" /></div>}><Outlet /></Suspense></main>
      <ScrollRestoration />
    </div>
  );
}

export function RequireRole({ roles, title, children }: { roles: Role[]; title: string; children: ReactNode }) {
  const me = useMe();
  if (me.isPending) return <div className="mx-auto max-w-md px-4 py-10"><Skeleton className="h-64" /></div>;
  if (me.isError) return <div className="mx-auto max-w-md px-4 py-10"><ErrorState message={me.error.message} onRetry={() => me.refetch()} /></div>;
  if (!me.data) return <PortalLogin title={title} />;
  if (!roles.includes(me.data.role))
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <ShieldAlert className="size-8 text-warn-text" aria-hidden />
          <h1 className="text-xl font-extrabold">No access</h1>
          <p className="text-ink-2">You're signed in as {me.data.name}, which can't use the {title.toLowerCase()}.</p>
          <Link to="/" className="font-semibold text-brand-text hover:underline">Go to the shop</Link>
        </div>
      </div>
    );
  return <>{children}</>;
}

function PortalLogin({ title }: { title: string }) {
  const { login } = useAuthActions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const emailErr = touched && !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Enter your email address' : undefined;
  const pwErr = touched && !password ? 'Enter your password' : undefined;
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (/^\S+@\S+\.\S+$/.test(email.trim()) && password) login.mutate({ email: email.trim(), password }); };
  return (
    <div className="mx-auto max-w-md px-4 py-10 md:py-16">
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-1 text-ink-2">Sign in with your staff account.</p>
      <form onSubmit={submit} noValidate className="card mt-6 space-y-4 p-6">
        <Field id="portal-email" label="Email" type="email" autoComplete="username" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} error={emailErr} />
        <Field id="portal-password" label="Password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} error={pwErr} />
        {login.isError && <p className="rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{login.error.message}</p>}
        <Button type="submit" size="lg" className="w-full" busy={login.isPending}>Sign in</Button>
      </form>
    </div>
  );
}
