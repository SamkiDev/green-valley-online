import { Link } from 'react-router';
import { ArrowRight, Beef, Drumstick, Flame, Ham, Truck, Utensils } from 'lucide-react';
import { useProducts, useStore, useStores } from '../lib/queries';
import { rand } from '../lib/format';
import { ProductCard, ProductGridSkeleton } from '../components/ProductCard';
import { Badge, DemoTag, ErrorState, LinkButton } from '../components/ui';
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
        <p className="font-semibold leading-snug text-on-panel">{s.name}</p>
        <p className="text-sm text-on-panel-2">{s.category}</p>
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
          <div>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">Your local shopping centre, delivered to your door.</h1>
            <p className="mt-5 max-w-xl text-lg text-on-panel-2">
              Order from the Green Valley Meat Market in Johannesburg for delivery or collection. The Farm Stall, Bottle Liquors and Supermarket are coming soon.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton to="/shop" size="lg" variant="primary">Shop the Meat Market <ArrowRight className="size-5" aria-hidden /></LinkButton>
              <LinkButton to="/stores" size="lg" variant="onPanel">See all stores</LinkButton>
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
      <section className="container-page mt-12 md:mt-16" aria-labelledby="meat-heading">
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

      <DeliveryFacts />
    </>
  );
}

// What a customer needs to know before ordering, read from the Meat Market's own settings (zones, fees, times).
function DeliveryFacts() {
  const store = useStore('meat-market');
  if (!store.data) return null;
  const fees = store.data.zones.map(z => Number(z.fee)).sort((a, b) => a - b);
  const win = store.data.config.deliveryWindowMinutes;
  const hours = store.data.config.hours;
  const facts = [
    { term: 'Delivery', detail: fees.length ? `${rand(fees[0])} to ${rand(fees[fees.length - 1])}, depending on your area` : 'Collection only for now', demo: fees.length > 0 },
    { term: 'Delivery time', detail: win ? `About ${win[0]} to ${win[1]} minutes after payment` : 'Confirmed by the store after you order', demo: !!win },
    { term: 'Collection', detail: hours ? `Free, from the Meat Market counter (${hours})` : 'Free, from the Meat Market counter', demo: false },
    { term: 'Paying', detail: 'Card or EFT at checkout, then follow your order live', demo: false },
  ];
  return (
    <section className="container-page mt-12 md:mt-16" aria-labelledby="delivery-heading">
      <div className="card p-5 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="delivery-heading" className="text-xl font-extrabold tracking-tight md:text-2xl">Delivery and collection</h2>
          <LinkButton to="/stores/meat-market" variant="ghost" size="sm">Store hours and contact <ArrowRight className="size-4" aria-hidden /></LinkButton>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(f => (
            <div key={f.term}>
              <dt className="flex items-center gap-2 text-sm font-semibold text-ink-3">{f.term}{f.demo && <DemoTag />}</dt>
              <dd className="mt-1 font-semibold">{f.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
