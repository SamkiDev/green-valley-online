import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Heart, Info, MessageSquareText, PackageX, ShoppingBag } from 'lucide-react';
import { ApiError, api, available, stockState, type Product } from '../lib/api';
import { useProduct, useQA } from '../lib/queries';
import { useAddToCart, useCart } from '../lib/cart';
import { useMe } from '../lib/auth';
import { useFavourites } from '../lib/favourites';
import { lineTotal, rand, unitLabel } from '../lib/format';
import { ProductImage } from '../components/ProductImage';
import { Reviews } from '../components/Reviews';
import { AgeGate } from '../components/AgeGate';
import { Stepper, WeightPicker } from '../components/QuantityPicker';
import { Button, EmptyState, ErrorState, LinkButton, Skeleton, StockBadge } from '../components/ui';

const WEIGHT_NOTE = 'Final price may vary slightly based on actual weighed quantity.';

export default function ProductPage() {
  const { id = '' } = useParams();
  const q = useProduct(id);
  if (q.isPending) return <div className="container-page grid grid-cols-1 gap-6 py-8 md:grid-cols-2"><Skeleton className="aspect-[4/3]" /><div className="space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-6 w-1/3" /><Skeleton className="h-32" /></div></div>;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404)
      return <div className="container-page py-10"><EmptyState icon={PackageX} title="Product not available" action={<LinkButton to="/shop" variant="secondary">Back to shop</LinkButton>}>This product is no longer listed or the link is wrong.</EmptyState></div>;
    return <div className="container-page py-10"><ErrorState message={q.error.message} onRetry={() => q.refetch()} /></div>;
  }
  const p = q.data;
  return p.store?.ageRestricted ? <AgeGate slug={p.store.slug} storeName={p.store.name} config={p.store.config}><ProductView p={p} /></AgeGate> : <ProductView p={p} />;
}

function ProductView({ p }: { p: Product }) {
  const cart = useCart();
  const addTo = useAddToCart();
  const nav = useNavigate();
  const fav = useFavourites();
  const state = stockState(p);
  const stock = available(p);
  const inCart = cart.quantityOf(p.id);
  const room = Math.max(0, Math.floor((stock - inCart) * 100) / 100); // what can still be added
  const out = state === 'OUT_OF_STOCK';
  const [qty, setQty] = useState(p.soldByWeight ? Math.min(1, room) || 0.5 : 1);
  const [added, setAdded] = useState(false);
  const tooMuch = qty > room;
  const disabled = out || tooMuch || qty <= 0;
  const estimate = qty > 0 ? rand(lineTotal(p.price, qty)) : '—';

  const addToCart = () => { if (!addTo(p.id, qty, p.store?.slug)) return; setAdded(true); setTimeout(() => setAdded(false), 1800); };
  const buyNow = () => { if (addTo(p.id, qty, p.store?.slug)) nav('/cart'); };

  return (
    <div className="container-page pb-28 pt-4 md:pb-10 md:pt-8">
      <nav className="mb-4 text-sm text-ink-3" aria-label="Breadcrumb">
        <Link to={`/shop?store=${p.store?.slug ?? 'meat-market'}`} className="hover:underline">{p.store?.name ?? 'Shop'}</Link> / <Link to={`/shop?store=${p.store?.slug ?? 'meat-market'}&category=${p.category.name}`} className="hover:underline">{p.category.name}</Link> / <span className="text-ink-2">{p.name}</span>
      </nav>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10">
        <ProductImage name={p.name} category={p.category.name} imageUrl={p.imageUrl} size="lg" className="md:sticky md:top-24" />
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-ink-3">{p.category.name}{p.store ? ` · ${p.store.name}` : ''}</p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">{p.name}</h1>
            </div>
            <button type="button" onClick={() => fav.toggle(p.id)} aria-pressed={fav.has(p.id)} aria-label={fav.has(p.id) ? 'Remove from favourites' : 'Add to favourites'}
              className={`grid size-11 shrink-0 place-items-center rounded-xl border transition ${fav.has(p.id) ? 'border-meat bg-meat-soft text-meat-text' : 'border-line bg-surface text-ink-2 hover:border-ink-3'}`}>
              <Heart className="size-5" fill={fav.has(p.id) ? 'currentColor' : 'none'} aria-hidden />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p><span className="text-3xl font-extrabold">{rand(p.price)}</span><span className="text-lg text-ink-3">{unitLabel(p.soldByWeight)}</span></p>
            <StockBadge state={state} />
            {p.isDemo && <span className="text-sm text-ink-3">Demo price</span>}
          </div>
          <p className="mt-4 text-lg text-ink-2">{p.description}</p>

          <div className="card mt-6 space-y-5 p-5">
            {out ? (
              <p className="flex items-center gap-2 font-semibold text-danger-text"><PackageX className="size-5" aria-hidden /> Out of stock right now. Check back soon.</p>
            ) : room <= 0 ? (
              <p className="font-semibold text-ink-2">You already have all available stock in your cart. <Link to="/cart" className="text-brand-text underline">View cart</Link></p>
            ) : (
              <>
                {p.soldByWeight ? <WeightPicker value={qty} onChange={setQty} max={room} />
                  : <div><p className="mb-2 text-sm font-semibold">Quantity</p><Stepper value={qty} onChange={setQty} max={Math.floor(room)} label="Quantity" /></div>}
                <div className="flex items-baseline justify-between gap-3 border-t border-line pt-4">
                  <span className="text-ink-2">{p.soldByWeight ? 'Estimated price' : 'Price'}</span>
                  <span className="text-2xl font-extrabold tabular-nums">{estimate}</span>
                </div>
                {p.soldByWeight && <p className="flex gap-2 text-sm text-ink-2"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{WEIGHT_NOTE}</p>}
                {tooMuch && <p className="text-sm font-semibold text-danger-text" role="alert">Only {room}{p.soldByWeight ? ' kg' : ''} more available.</p>}
                {state === 'LOW_STOCK' && !tooMuch && <p className="text-sm font-semibold text-warn-text">Low stock: order soon.</p>}
                <div className="hidden gap-3 md:flex">
                  <Button size="lg" className="flex-1" onClick={addToCart} disabled={disabled}>{added ? <><Check className="size-5" aria-hidden /> Added</> : <><ShoppingBag className="size-5" aria-hidden /> Add to cart</>}</Button>
                  <Button size="lg" variant="secondary" className="flex-1" onClick={buyNow} disabled={disabled}>Buy now</Button>
                </div>
              </>
            )}
            {inCart > 0 && <p className="text-sm text-ink-2">In your cart: <span className="font-semibold">{p.soldByWeight ? `${inCart} kg` : inCart}</span> · <Link to="/cart" className="font-semibold text-brand-text underline">View cart</Link></p>}
          </div>

          <ProductQA productId={p.id} />
          <div className="mt-8"><Reviews productId={p.id} /></div>
        </div>
      </div>

      {/* Sticky mobile purchase bar, above the bottom navigation */}
      {!out && room > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface/95 p-3 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-ink-3">{qty <= 0 ? 'Enter a weight' : p.soldByWeight ? `${qty} kg · estimated` : `${qty} × ${p.name}`}</p>
              <p className="text-lg font-extrabold tabular-nums">{estimate}</p>
            </div>
            <Button onClick={addToCart} disabled={disabled} className="shrink-0">{added ? <><Check className="size-5" aria-hidden /> Added</> : 'Add to cart'}</Button>
            <Button variant="secondary" onClick={buyNow} disabled={disabled} className="shrink-0">Buy now</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductQA({ productId }: { productId: string }) {
  const qa = useQA(productId);
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const ask = useMutation({
    mutationFn: () => api(`/products/${productId}/questions`, { method: 'POST', body: { text: text.trim() } }),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['qa', productId] }); },
  });
  const tooShort = text.trim().length > 0 && text.trim().length < 3;

  return (
    <section className="mt-8" aria-labelledby="qa-heading">
      <h2 id="qa-heading" className="mb-3 text-xl font-extrabold">Questions &amp; answers</h2>
      {qa.isPending ? <Skeleton className="h-24" /> : qa.isError ? <ErrorState compact message={qa.error.message} onRetry={() => qa.refetch()} /> : qa.data.length === 0 ? (
        <p className="text-ink-2">No questions yet. Be the first to ask.</p>
      ) : (
        <ul className="space-y-3">
          {qa.data.map(item => (
            <li key={item.id} className="card p-4">
              <p className="font-semibold">Q: {item.text}</p>
              {item.answers.length ? item.answers.map((a, i) => <p key={i} className="mt-2 text-ink-2"><span className="font-semibold text-brand-text">Store:</span> {a.text}</p>)
                : <p className="mt-2 text-sm text-ink-3">Waiting for the store to answer.</p>}
            </li>
          ))}
        </ul>
      )}

      {me?.role === 'CUSTOMER' ? (
        <form className="mt-4 space-y-2" onSubmit={e => { e.preventDefault(); if (text.trim().length >= 3) ask.mutate(); }}>
          <label htmlFor="ask-question" className="block text-sm font-semibold">Ask a question</label>
          <textarea id="ask-question" className="field min-h-24" maxLength={300} value={text} onChange={e => setText(e.target.value)} aria-invalid={tooShort} placeholder="e.g. Is this suitable for a potjie?" />
          {tooShort && <p className="text-sm text-danger-text">Please write at least 3 characters.</p>}
          {ask.isError && <p className="text-sm text-danger-text" role="alert">{ask.error.message}</p>}
          {ask.isSuccess && <p className="text-sm text-ok-text" role="status">Thanks! The store will answer soon.</p>}
          <Button type="submit" variant="secondary" busy={ask.isPending} disabled={text.trim().length < 3}><MessageSquareText className="size-4" aria-hidden /> Submit question</Button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-ink-2"><Link to="/account" className="font-semibold text-brand-text underline">Sign in</Link> to ask the store a question.</p>
      )}
    </section>
  );
}
