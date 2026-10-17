import { Link, useLocation, useNavigate } from 'react-router';
import type { ReorderNotice } from '../lib/reorder';
import { AlertTriangle, ArrowRight, Info, ShoppingBag, Store, Trash2, Truck } from 'lucide-react';
import { useCart, useForceCollection } from '../lib/cart';
import { useProducts, useStore } from '../lib/queries';
import { available, type Product } from '../lib/api';
import { lineTotal, rand, unitLabel } from '../lib/format';
import { ProductImage } from '../components/ProductImage';
import { Stepper } from '../components/QuantityPicker';
import { Button, DemoTag, EmptyState, ErrorState, LinkButton, PageHeader, Skeleton } from '../components/ui';

const CART_WEIGHTS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];

export default function Cart() {
  const cart = useCart();
  const nav = useNavigate();
  const notice = (useLocation().state as { reorder?: ReorderNotice } | null)?.reorder;
  const products = useProducts({ store: cart.storeSlug });
  const store = useStore(cart.storeSlug);
  useForceCollection(store.data && store.data.zones.length === 0);

  if (cart.lines.length === 0)
    return (
      <div className="container-page">
        <PageHeader title="Your cart" />
        <EmptyState icon={ShoppingBag} title="Your cart is empty" action={<LinkButton to="/shop">Start shopping <ArrowRight className="size-4" aria-hidden /></LinkButton>}>Add braai packs, fresh cuts and more from the Meat Market.</EmptyState>
      </div>
    );

  if (products.isPending || store.isPending) return <div className="container-page"><PageHeader title="Your cart" /><div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-48" /></div></div>;
  if (products.isError || store.isError)
    return <div className="container-page"><PageHeader title="Your cart" /><ErrorState message={(products.error ?? store.error)!.message} onRetry={() => { products.refetch(); store.refetch(); }} /></div>;

  const byId = new Map(products.data.map(p => [p.id, p]));
  const rows = cart.lines.map(l => ({ line: l, p: byId.get(l.productId) }));
  const valid = rows.filter((r): r is { line: typeof r.line; p: Product } => !!r.p);
  const problems = rows.filter(r => !r.p || available(r.p) < r.line.quantity);
  const subtotal = Math.round(valid.reduce((s, r) => s + lineTotal(r.p.price, r.line.quantity), 0) * 100) / 100;

  const zones = store.data.zones;
  const delivery = cart.fulfilment === 'DELIVERY';
  const zone = zones.find(z => z.id === cart.zoneId);
  const fee = delivery ? (zone ? Number(zone.fee) : null) : 0;
  const total = fee === null ? null : Math.round((subtotal + fee) * 100) / 100;
  const hasWeighed = valid.some(r => r.p.soldByWeight);
  const canCheckout = problems.length === 0 && valid.length > 0 && (!delivery || !!zone);

  return (
    <div className="container-page">
      <PageHeader title="Your cart">{cart.count} {cart.count === 1 ? 'item' : 'items'} from {store.data.name}</PageHeader>
      {notice && (
        <div className={`mb-4 rounded-2xl p-4 ${notice.skipped.length ? 'bg-warn-bg text-warn-text' : 'bg-ok-bg text-ok-text'}`} role="status">
          <p className="font-bold">{notice.added.length ? `Added ${notice.added.length} ${notice.added.length === 1 ? 'item' : 'items'} from your past order.` : 'Nothing from that order could be added.'}</p>
          {notice.skipped.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm">{notice.skipped.map(x => <li key={x.name}>{x.name}: {x.reason}</li>)}</ul>}
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <section aria-label="Cart items" className="space-y-3">
          {problems.length > 0 && (
            <div className="flex gap-3 rounded-2xl bg-warn-bg p-4 text-warn-text" role="alert">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
              <p>Some items need attention before checkout: reduce the quantity or remove them.</p>
            </div>
          )}
          {rows.map(({ line, p }) => p ? (
            <CartRow key={line.productId} p={p} quantity={line.quantity} />
          ) : (
            <article key={line.productId} className="card flex items-center justify-between gap-3 p-4">
              <p className="text-ink-2">This product is no longer available.</p>
              <Button variant="ghost" size="sm" onClick={() => cart.remove(line.productId)}><Trash2 className="size-4" aria-hidden /> Remove</Button>
            </article>
          ))}
          <Button variant="ghost" size="sm" onClick={() => cart.clear()} className="text-ink-2"><Trash2 className="size-4" aria-hidden /> Empty cart</Button>
        </section>

        <aside className="card space-y-5 p-5 lg:sticky lg:top-24" aria-label="Order summary">
          <fieldset>
            <legend className="mb-2 font-extrabold">How would you like it?</legend>
            <div className="grid grid-cols-2 gap-2">
              {([['DELIVERY', 'Delivery', Truck], ['COLLECTION', 'Collect in store', Store]] as const).filter(([v]) => v === 'COLLECTION' || zones.length > 0).map(([v, label, Icon]) => (
                <button key={v} type="button" aria-pressed={cart.fulfilment === v} onClick={() => cart.setFulfilment(v)}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-sm font-semibold transition ${cart.fulfilment === v ? 'border-brand bg-brand-soft text-brand-text' : 'border-line hover:border-ink-3'}`}>
                  <Icon className="size-5" aria-hidden />{label}
                </button>
              ))}
            </div>
          </fieldset>
          {delivery && (
            <div>
              <label htmlFor="zone" className="mb-1 flex items-center gap-2 text-sm font-semibold">Delivery zone <DemoTag /></label>
              <select id="zone" className="field" value={cart.zoneId ?? ''} onChange={e => cart.setZone(e.target.value || null)} aria-invalid={!zone}>
                <option value="">Choose your area…</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name} · {rand(z.fee)}</option>)}
              </select>
              {!zone && <p className="mt-1 text-sm text-ink-2">Choose a zone to see your delivery fee.</p>}
            </div>
          )}
          <dl className="space-y-2 border-t border-line pt-4">
            <div className="flex justify-between"><dt className="text-ink-2">Subtotal{hasWeighed ? ' (estimated)' : ''}</dt><dd className="font-semibold tabular-nums">{rand(subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Delivery fee</dt><dd className="font-semibold tabular-nums">{fee === null ? '—' : fee === 0 ? 'Free' : rand(fee)}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-lg"><dt className="font-extrabold">Total</dt><dd className="font-extrabold tabular-nums">{total === null ? '—' : rand(total)}</dd></div>
          </dl>
          {hasWeighed && <p className="flex gap-2 text-sm text-ink-2"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />Final price may vary slightly based on actual weighed quantity.</p>}
          <Button size="lg" className="w-full" disabled={!canCheckout} onClick={() => nav('/checkout')}>CHECKOUT <ArrowRight className="size-5" aria-hidden /></Button>
          {!canCheckout && <p className="text-center text-sm text-ink-2">{problems.length ? 'Fix the highlighted items to continue.' : delivery && !zone ? 'Choose a delivery zone to continue.' : ''}</p>}
          <Link to="/shop" className="block text-center text-sm font-semibold text-brand-text hover:underline">Continue shopping</Link>
        </aside>
      </div>
    </div>
  );
}

function CartRow({ p, quantity }: { p: Product; quantity: number }) {
  const cart = useCart();
  const stock = available(p);
  const over = stock < quantity;
  const weights = Array.from(new Set([...CART_WEIGHTS.filter(w => w <= stock), quantity])).sort((a, b) => a - b);
  return (
    <article className={`card flex gap-3 p-3 sm:gap-4 sm:p-4 ${over ? 'border-warn-text' : ''}`}>
      <Link to={`/product/${p.id}`} className="w-24 shrink-0 sm:w-28"><ProductImage name={p.name} category={p.category.name} imageUrl={p.imageUrl} size="sm" /></Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-bold leading-snug"><Link to={`/product/${p.id}`} className="hover:underline">{p.name}</Link></h3>
            <p className="text-sm text-ink-3">{rand(p.price)}{unitLabel(p.soldByWeight)}</p>
          </div>
          <p className="shrink-0 font-extrabold tabular-nums">{rand(lineTotal(p.price, quantity))}</p>
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          {p.soldByWeight ? (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <span className="sr-only">Weight for {p.name}</span>
              <select className="field !min-h-11 !w-auto py-1" value={quantity} onChange={e => cart.setQuantity(p.id, Number(e.target.value))}>
                {weights.map(w => <option key={w} value={w}>{w} kg</option>)}
              </select>
            </label>
          ) : (
            <Stepper value={quantity} onChange={n => cart.setQuantity(p.id, n)} max={Math.max(quantity, Math.floor(stock))} label={`Quantity for ${p.name}`} />
          )}
          <button type="button" onClick={() => cart.remove(p.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={`Remove ${p.name}`}>
            <Trash2 className="size-4" aria-hidden /> Remove
          </button>
        </div>
        {over && <p className="text-sm font-semibold text-warn-text" role="alert">{stock <= 0 ? 'Out of stock: please remove.' : `Only ${stock}${p.soldByWeight ? ' kg' : ''} available.`}</p>}
      </div>
    </article>
  );
}
