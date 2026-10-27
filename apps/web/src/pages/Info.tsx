// Smaller pages: Deals, About and Not Found.
import { Link } from 'react-router';
import { Compass, Tag } from 'lucide-react';
import { useProducts } from '../lib/queries';
import { ProductCard, ProductGridSkeleton } from '../components/ProductCard';
import { EmptyState, ErrorState, LinkButton, PageHeader } from '../components/ui';

export function Deals() {
  const packs = useProducts({ store: 'meat-market', category: 'Braai', sort: 'low' });
  return (
    <div className="container-page">
      <PageHeader title="Specials & value packs">The shop's specials board will appear here once published. Meanwhile, braai packs give the best value for groups.</PageHeader>
      <EmptyState icon={Tag} title="No specials published yet">Weekly specials (like wors, sausages and russians) will be listed here by the store.</EmptyState>
      <h2 className="mb-4 mt-10 text-2xl font-extrabold tracking-tight">Value packs</h2>
      {packs.isPending ? <ProductGridSkeleton n={4} /> : packs.isError ? <ErrorState message={packs.error.message} onRetry={() => packs.refetch()} /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">{packs.data.map(p => <ProductCard key={p.id} p={p} />)}</div>
      )}
    </div>
  );
}

export function About() {
  return (
    <div className="container-page max-w-3xl">
      <PageHeader title="Green Valley Online">Your local shopping centre, delivered to your door.</PageHeader>
      <div className="space-y-5 text-lg text-ink-2">
        <p>Green Valley Online brings the stores at the Green Valley shopping centre together in one place. Browse the shops you already know, order from your phone, and choose delivery to your door or collection from the store.</p>
        <p>The <Link to="/stores/meat-market" className="font-semibold text-brand-text underline">Green Valley Meat Market</Link> is the first store online, including bulk and wholesale orders. The Farm Stall, Bottle Liquors and Supermarket will follow.</p>
        <div className="card p-5 text-base">
          <p className="font-bold text-ink">This is a demo build</p>
          <p className="mt-1">Prices are demo prices, delivery fees are demo fees, and payments are simulated. No money is charged and no card details are collected.</p>
        </div>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="container-page py-10">
      <EmptyState icon={Compass} title="Page not found" action={<LinkButton to="/">Go home</LinkButton>}>The page you're looking for doesn't exist.</EmptyState>
    </div>
  );
}
