import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { Home, LayoutGrid, Menu, Moon, ShoppingBag, Store, Sun, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCart } from '../lib/cart';
import { useMe } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { firstName } from '../lib/format';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/shop', label: 'Shop' },
  { to: '/stores', label: 'Stores' },
  { to: '/deals', label: 'Deals' },
  { to: '/track', label: 'Track Order' },
  { to: '/about', label: 'About' },
];

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-extrabold tracking-tight ${className}`} aria-label="Green Valley Online home">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--brand)" />
        <path d="M9 21c0-7 5-11 14-11-1 8-5 13-11 13-1.2 0-2.2-.3-3-.8" fill="none" stroke="var(--on-brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 23c3-4 6-6 9-7.5" fill="none" stroke="var(--on-brand)" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className="leading-none">Green Valley<span className="text-brand-text"> Online</span></span>
    </Link>
  );
}

function CartLink({ className = '' }: { className?: string }) {
  const { count } = useCart();
  return (
    <Link to="/cart" className={`relative grid size-11 place-items-center rounded-xl hover:bg-surface-2 ${className}`} aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}>
      <ShoppingBag className="size-5" aria-hidden />
      {count > 0 && <span className="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full bg-meat px-1 text-[0.7rem] font-bold leading-5 text-on-meat">{count}</span>}
    </Link>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" onClick={toggle} className="grid size-11 place-items-center rounded-xl hover:bg-surface-2" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
      {theme === 'dark' ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const { data: me } = useMe();
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
      <div className="container-page flex h-16 items-center gap-2">
        <button type="button" className="-ml-2 grid size-11 place-items-center rounded-xl hover:bg-surface-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="mobile-menu">
          <Menu className="size-5" aria-hidden />
        </button>
        <Logo className="text-[1.05rem]" />
        <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `rounded-lg px-3 py-2 text-[0.95rem] font-semibold transition-colors ${isActive ? 'text-brand-text' : 'text-ink-2 hover:text-ink'}`}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Link to="/account" className="hidden min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink sm:flex">
            <User className="size-5" aria-hidden /><span className="max-w-28 truncate">{me ? firstName(me.name) : 'Account'}</span>
          </Link>
          <CartLink />
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="animate-rise absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-surface p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <Logo />
              <button type="button" className="grid size-11 place-items-center rounded-xl hover:bg-surface-2" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" aria-hidden /></button>
            </div>
            <nav className="mt-6 flex flex-col gap-1" aria-label="Main">
              {[...NAV, { to: '/wholesale', label: 'Bulk & Wholesale' }, { to: '/cart', label: 'Cart' }, { to: '/account', label: me ? `Account (${firstName(me.name)})` : 'Account' }].map(n => (
                <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : undefined} className={({ isActive }) => `rounded-xl px-3 py-3 text-lg font-semibold ${isActive ? 'bg-brand-soft text-brand-text' : 'hover:bg-surface-2'}`}>{n.label}</NavLink>
              ))}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

function BottomNav() {
  const { count } = useCart();
  const items = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/shop', label: 'Shop', icon: LayoutGrid },
    { to: '/stores', label: 'Stores', icon: Store },
    { to: '/cart', label: 'Cart', icon: ShoppingBag, badge: count },
    { to: '/account', label: 'Account', icon: User },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Quick">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ to, label, icon: Icon, end, badge }) => (
          <li key={to}>
            <NavLink to={to} end={end} className={({ isActive }) => `relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.72rem] font-semibold ${isActive ? 'text-brand-text' : 'text-ink-2'}`}>
              <Icon className="size-5" aria-hidden />
              {label}
              {!!badge && <span className="absolute left-1/2 top-1.5 ml-2 grid min-w-4 place-items-center rounded-full bg-meat px-1 text-[0.62rem] font-bold leading-4 text-on-meat" aria-label={`${badge} items`}>{badge}</span>}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="container-page grid grid-cols-1 gap-8 py-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-ink-2">Your local shopping centre, delivered to your door.</p>
        </div>
        <nav aria-label="Shop" className="flex flex-col gap-2 text-ink-2">
          <span className="font-bold text-ink">Shop</span>
          <Link className="hover:text-ink" to="/shop">All products</Link>
          <Link className="hover:text-ink" to="/stores">Stores</Link>
          <Link className="hover:text-ink" to="/deals">Deals</Link>
          <Link className="hover:text-ink" to="/wholesale">Bulk &amp; Wholesale</Link>
        </nav>
        <nav aria-label="Help" className="flex flex-col gap-2 text-ink-2">
          <span className="font-bold text-ink">Help</span>
          <Link className="hover:text-ink" to="/track">Track Order</Link>
          <Link className="hover:text-ink" to="/about">About</Link>
          <Link className="hover:text-ink" to="/account">Account</Link>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="container-page py-4 text-sm text-ink-3">Demo build: prices are demo prices and payments are simulated. No real money is processed.</p>
      </div>
    </footer>
  );
}

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3">Skip to content</a>
      <div className="bg-panel text-on-panel-2">
        <p className="container-page py-1.5 text-center text-xs font-medium"><span className="font-bold text-on-panel">DEMO</span> · Demo prices and simulated payments. Nothing is charged.</p>
      </div>
      <Header />
      <main id="main" className="flex-1"><Outlet /></main>
      <Footer />
      <div className="h-16 lg:hidden" aria-hidden />
      <BottomNav />
      <ScrollRestoration />
    </div>
  );
}
