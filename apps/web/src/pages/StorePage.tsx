import { Link, useParams } from 'react-router';
import { ArrowRight, Clock, MessageCircle, MessageSquareText, ShieldAlert, Star, Store as StoreIcon, Truck } from 'lucide-react';
import { useStore } from '../lib/queries';
import { ApiError } from '../lib/api';
import { rand } from '../lib/format';
import { Badge, DemoTag, EmptyState, ErrorState, LinkButton, Skeleton } from '../components/ui';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { Reviews } from '../components/Reviews';

export default function StorePage() {
  const { slug = '' } = useParams();
  const q = useStore(slug);

  if (q.isPending) return <div className="container-page space-y-4 py-8"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404)
      return <div className="container-page py-10"><EmptyState icon={StoreIcon} title="Store not found" action={<LinkButton to="/stores" variant="secondary">See all stores</LinkButton>}>This store doesn't exist or has moved.</EmptyState></div>;
    return <div className="container-page py-10"><ErrorState message={q.error.message} onRetry={() => q.refetch()} /></div>;
  }

  const s = q.data, c = s.config, active = s.status === 'ACTIVE';
  return (
    <div className="container-page py-6 md:py-10">
      <nav className="mb-4 text-sm text-ink-3" aria-label="Breadcrumb"><Link to="/stores" className="hover:underline">Stores</Link> / <span className="text-ink-2">{s.name}</span></nav>

      <section className="overflow-hidden rounded-3xl bg-panel text-on-panel">
        <div className="flex h-1.5" aria-hidden><span className="flex-[3]" style={{ background: c.accent?.primary }} /><span className="flex-1" style={{ background: c.accent?.secondary }} /></div>
        <div className="flex flex-col gap-5 p-6 md:flex-row md:items-end md:justify-between md:p-10">
          <div>
            <div className="flex flex-wrap gap-2">
              {active ? <Badge tone="okSolid">● Open · Online</Badge> : <Badge tone="onPanel"><Clock className="size-3" aria-hidden /> Coming soon</Badge>}
              {s.ageRestricted && <Badge tone="warnSolid">{c.ageVerification?.minimumAge ?? 18}+ only</Badge>}
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight md:text-5xl">{s.name}</h1>
            <p className="mt-1 font-semibold text-on-panel-2">{s.category}</p>
            {s.description && <p className="mt-3 max-w-xl text-on-panel-2">{s.description}</p>}
          </div>
          {active && <LinkButton to={`/shop?store=${slug}`} size="lg" variant={slug === 'meat-market' ? 'meat' : 'primary'} className="shrink-0">SHOP NOW <ArrowRight className="size-5" aria-hidden /></LinkButton>}
        </div>
      </section>

      {s.ageRestricted && (
        <div className="mt-4 flex gap-3 rounded-2xl bg-warn-bg p-4 text-warn-text" role="note">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-bold">Age-restricted store</p>
            <p>Customers will need to confirm they are {c.ageVerification?.minimumAge ?? 18} or older before buying.{c.responsibleSaleMessage ? ` ${c.responsibleSaleMessage}` : ''}</p>
            {c.complianceNotice && <p className="mt-1">{c.complianceNotice}</p>}
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <section className="card p-5" aria-labelledby="hours">
          <h2 id="hours" className="flex items-center gap-2 font-extrabold"><Clock className="size-5 text-ink-3" aria-hidden /> Opening hours</h2>
          <p className="mt-2 text-ink-2">{c.hours || 'Opening hours will be published by the store soon.'}</p>
        </section>
        <section className="card p-5" aria-labelledby="delivery">
          <h2 id="delivery" className="flex items-center gap-2 font-extrabold"><Truck className="size-5 text-ink-3" aria-hidden /> Delivery &amp; collection</h2>
          {active && s.zones.length ? (
            <>
              <ul className="mt-2 space-y-1.5 text-ink-2">
                {s.zones.map(z => <li key={z.id} className="flex justify-between gap-3"><span>{z.name}</span><span className="font-semibold text-ink">{rand(z.fee)}</span></li>)}
                {c.collection !== false && <li className="flex justify-between gap-3"><span>Collect from store</span><span className="font-semibold text-ink">Free</span></li>}
              </ul>
              <p className="mt-3 flex items-center gap-2 text-sm text-ink-3"><DemoTag /> Demo delivery fees, set by the store.</p>
            </>
          ) : <p className="mt-2 text-ink-2">{active ? 'Collection from store only.' : 'Delivery opens when this store goes online.'}</p>}
        </section>
        <section className="card p-5" aria-labelledby="contact">
          <h2 id="contact" className="flex items-center gap-2 font-extrabold"><MessageCircle className="size-5 text-ink-3" aria-hidden /> Contact</h2>
          <p className="mt-2 text-ink-2">Questions about products, bulk orders or an order in progress?</p>
          <WhatsAppButton number={c.whatsapp} label="Chat with Green Valley" className="mt-3 w-full" />
        </section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {active ? <Reviews storeSlug={slug} title="Store reviews" /> : (
          <section aria-labelledby="reviews">
            <h2 id="reviews" className="mb-3 text-xl font-extrabold">Store reviews</h2>
            <EmptyState icon={Star} title="No reviews yet">Reviews open when this store goes online.</EmptyState>
          </section>
        )}
        <section aria-labelledby="qa">
          <h2 id="qa" className="mb-3 text-xl font-extrabold">Questions &amp; answers</h2>
          <EmptyState icon={MessageSquareText} title="Ask about a product">
            {active ? <>Questions are asked on each product page and answered by the store. <Link to={`/shop?store=${slug}`} className="font-semibold text-brand-text underline">Browse products</Link></> : 'Q&A opens when this store goes online.'}
          </EmptyState>
        </section>
      </div>
    </div>
  );
}
