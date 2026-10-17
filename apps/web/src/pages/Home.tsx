import { Link } from 'react-router';
import { ArrowRight, Beef, ClipboardList, Drumstick, Flame, Ham, MapPin, PackageCheck, Search, Truck, Utensils } from 'lucide-react';
import { useProducts, useStores } from '../lib/queries';
import { ProductCard, ProductGridSkeleton } from '../components/ProductCard';
import { Badge, ErrorState, LinkButton } from '../components/ui';
import type { Store } from '../lib/api';

const MEAT_CATEGORIES = [
  { name: 'Beef', icon: Beef }, { name: 'Chicken', icon: Drumstick }, { name: 'Pork', icon: Ham },
  { name: 'Lamb', icon: Utensils }, { name: 'Braai', icon: Flame },
];

function StoreRow({ s }: { s: Store }) {
  const active = s.status === 'ACTIVE';
  return (
    <li className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-3">
      <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: s.config.accent?.primary ?? '#888' }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-on-panel">{s.name}</p>
        <p className="truncate text-sm text-on-panel-2">{s.category}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${active ? 'bg-emerald-400 text-emerald-950' : 'bg-white/10 text-on-panel-2'}`}>{active ? 'Open online' : 'Coming soon'}</span>
    </li>
  );
}

export default function Home() {
  const stores = useStores();
  const popular = useProducts({ sort: 'popular' });

  return (
    <>
      {/* Hero */}
      <section className="bg-panel text-on-panel">
        <div className="container-page grid grid-cols-1 gap-10 py-12 md:py-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center lg:py-20">
          <div className="animate-rise">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-on-panel-2"><MapPin className="size-4" aria-hidden /> Green Valley, Johannesburg</p>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">Your local shopping centre, delivered to your door.</h1>
            <p className="mt-5 max-w-xl text-lg text-on-panel-2">Shop fresh meat, produce, groceries and more from businesses you already know.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton to="/shop" size="lg" variant="primary">SHOP NOW <ArrowRight className="size-5" aria-hidden /></LinkButton>
              <LinkButton to="/stores" size="lg" variant="onPanel">EXPLORE STORES</LinkButton>
              <LinkButton to="/wholesale" size="lg" variant="onPanel">BULK &amp; WHOLESALE</LinkButton>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-on-panel-2">Stores at Green Valley</p>
            {stores.isPending ? (
              <ul className="space-y-2">{[0, 1, 2, 3].map(i => <li key={i} className="h-[3.75rem] animate-pulse rounded-xl bg-white/[0.06]" />)}</ul>
            ) : stores.isError ? (
              <p className="text-on-panel-2">Store list unavailable right now. <button className="font-semibold text-on-panel underline" onClick={() => stores.refetch()}>Try again</button></p>
            ) : (
              <ul className="space-y-2">{stores.data.map(s => <StoreRow key={s.id} s={s} />)}</ul>
            )}
          </div>
        </div>
      </section>

      {/* Meat Market feature */}
      <section className="container-page mt-10 md:mt-14" aria-labelledby="meat-heading">
        <div className="overflow-hidden rounded-3xl bg-panel text-on-panel">
          <div className="h-1.5 bg-meat" aria-hidden />
          <div className="grid grid-cols-1 gap-8 p-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:p-10">
            <div>
              <Badge tone="meatSolid">Flagship store · Open online</Badge>
              <h2 id="meat-heading" className="mt-4 text-3xl font-extrabold tracking-tight md:text-4xl">Green Valley Meat Market</h2>
              <p className="mt-3 max-w-lg text-on-panel-2">Fresh cuts, braai packs and boerewors, priced per kg or per pack. Order for the family, or buy in bulk for your business or event.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <LinkButton to="/shop" variant="meat" size="lg">Shop the Meat Market <ArrowRight className="size-5" aria-hidden /></LinkButton>
                <LinkButton to="/stores/meat-market" variant="onPanel" size="lg">Store info</LinkButton>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-3 lg:grid-cols-5">
                {MEAT_CATEGORIES.map(({ name, icon: Icon }) => (
                  <li key={name}>
                    <Link to={`/shop?category=${name}`} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-sm font-semibold transition hover:border-white/40">
                      <Icon className="size-6 text-red-300" aria-hidden />{name}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link to="/wholesale" className="group flex items-center gap-4 rounded-xl border border-red-400/30 bg-red-500/10 p-4 transition hover:border-red-300/60">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-meat text-on-meat"><Truck className="size-5" aria-hidden /></span>
                <span className="flex-1">
                  <span className="block font-bold">Bulk &amp; Wholesale</span>
                  <span className="block text-sm text-on-panel-2">Restaurants, events and large gatherings: request a quote.</span>
                </span>
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Popular products */}
      <section className="container-page mt-12 md:mt-16" aria-labelledby="popular-heading">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 id="popular-heading" className="text-2xl font-extrabold tracking-tight md:text-3xl">Popular picks</h2>
            <p className="mt-1 text-ink-2">Braai favourites and everyday cuts. <span className="text-ink-3">Demo prices.</span></p>
          </div>
          <Link to="/shop" className="hidden shrink-0 items-center gap-1 font-semibold text-brand-text hover:underline sm:flex">View all <ArrowRight className="size-4" aria-hidden /></Link>
        </div>
        {popular.isPending ? <ProductGridSkeleton /> : popular.isError ? <ErrorState message={popular.error.message} onRetry={() => popular.refetch()} /> : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {popular.data.slice(0, 8).map(p => <ProductCard key={p.id} p={p} />)}
          </div>
        )}
        <LinkButton to="/shop" variant="secondary" className="mt-5 w-full sm:hidden">View all products</LinkButton>
      </section>

      {/* How it works */}
      <section className="container-page mt-12 md:mt-16" aria-labelledby="how-heading">
        <h2 id="how-heading" className="sr-only">How it works</h2>
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
          {[
            { icon: Search, title: 'Choose', body: 'Browse stores and products you already know, with live stock.' },
            { icon: ClipboardList, title: 'Order', body: 'Pick delivery or collection, then pay at checkout.' },
            { icon: PackageCheck, title: 'Track', body: 'Follow your order from the counter to your door.' },
          ].map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="card flex items-start gap-4 p-5">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-text"><Icon className="size-6" aria-hidden /></span>
              <div>
                <p className="text-sm font-bold text-ink-3">Step {i + 1}</p>
                <h3 className="text-lg font-extrabold">{title}</h3>
                <p className="mt-1 text-ink-2">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
