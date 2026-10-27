import { Link } from 'react-router';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { stockState, type Product } from '../lib/api';
import { useAddToCart } from '../lib/cart';
import { rand, unitLabel } from '../lib/format';
import { ProductImage } from './ProductImage';
import { StockBadge } from './ui';

export function ProductCard({ p }: { p: Product }) {
  const addToCart = useAddToCart();
  const [added, setAdded] = useState(false);
  const state = stockState(p);
  const out = state === 'OUT_OF_STOCK';
  // Quick add uses the smallest sensible amount (1 kg or 1 item); the product page offers the full weight picker.
  const quick = () => { if (!addToCart(p.id, 1, p.store?.slug)) return; setAdded(true); setTimeout(() => setAdded(false), 1400); };
  return (
    <article className="card group flex flex-col overflow-hidden p-3 transition-shadow hover:shadow-[0_6px_24px_-12px_rgba(0,0,0,0.25)]">
      <Link to={`/product/${p.id}`} className="block rounded-xl" aria-label={p.name}>
        <ProductImage name={p.name} category={p.category.name} imageUrl={p.imageUrl} className="transition-transform duration-300 group-hover:scale-[1.015]" />
      </Link>
      <div className="flex flex-1 flex-col gap-1 px-1 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">{p.category.name}</span>
          <StockBadge state={state} />
        </div>
        <h3 className="font-bold leading-snug"><Link to={`/product/${p.id}`} className="inline-block py-0.5 hover:underline">{p.name}</Link></h3>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <p><span className="text-lg font-extrabold">{rand(p.price)}</span><span className="text-sm text-ink-3">{unitLabel(p.soldByWeight)}</span></p>
          <button type="button" onClick={quick} disabled={out}
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-on-brand transition active:scale-95 disabled:bg-surface-2 disabled:text-ink-3"
            aria-label={out ? `${p.name} is out of stock` : `Add ${p.soldByWeight ? '1 kg of ' : ''}${p.name} to cart`}>
            {added ? <Check className="size-5" aria-hidden /> : <Plus className="size-5" aria-hidden />}
          </button>
        </div>
      </div>
    </article>
  );
}

export function ProductGridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card p-3"><div className="aspect-[4/3] animate-pulse rounded-xl bg-surface-2" /><div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-surface-2" /><div className="mt-2 h-5 w-1/3 animate-pulse rounded bg-surface-2" /></div>
      ))}
    </div>
  );
}
