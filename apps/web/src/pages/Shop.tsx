import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Search, SearchX, X } from 'lucide-react';
import { useCategories, useProducts, type ProductFilters } from '../lib/queries';
import { parseSearch, rand } from '../lib/format';
import { ProductCard, ProductGridSkeleton } from '../components/ProductCard';
import { Button, ErrorState, EmptyState, PageHeader } from '../components/ui';

const PRICE_CAPS = [100, 200, 300, 500];
const SORTS = [{ v: 'popular', l: 'Most popular' }, { v: 'low', l: 'Price: low to high' }, { v: 'high', l: 'Price: high to low' }] as const;

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const ids = { search: useId(), price: useId(), sort: useId() };
  const rawQ = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const maxParam = Number(params.get('max')) || undefined;
  const inStock = params.get('stock') === '1';
  const sort = (params.get('sort') as ProductFilters['sort']) || 'popular';

  // "under R300" typed into search becomes a price cap; the rest is the text query.
  const parsed = parseSearch(rawQ);
  const max = maxParam ?? parsed.max;
  const filters: ProductFilters = { store: 'meat-market', q: parsed.text || undefined, category: category || undefined, max, inStock, sort };
  const products = useProducts(filters);
  const categories = useCategories();

  const [draft, setDraft] = useState(rawQ);
  useEffect(() => setDraft(rawQ), [rawQ]);
  useEffect(() => {
    if (draft === rawQ) return;
    const t = setTimeout(() => update({ q: draft.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [draft]); // only re-run when the typed text changes

  function update(next: Record<string, string | null>) {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(next)) v ? p.set(k, v) : p.delete(k);
      return p;
    }, { replace: true });
  }
  const anyFilter = !!(rawQ || category || maxParam || inStock);

  return (
    <div className="container-page">
      <PageHeader eyebrow="Green Valley Meat Market" title="Shop">Fresh cuts, chicken and braai packs. Weighed items are priced per kg. <span className="text-ink-3">Demo prices.</span></PageHeader>

      <div className="sticky top-16 z-30 -mx-4 space-y-3 border-b border-line bg-bg/95 px-4 pb-3 pt-1 backdrop-blur md:-mx-6 md:px-6">
        <form role="search" onSubmit={e => { e.preventDefault(); update({ q: draft.trim() || null }); }} className="relative">
          <label htmlFor={ids.search} className="sr-only">Search products</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-3" aria-hidden />
          <input id={ids.search} type="search" value={draft} onChange={e => setDraft(e.target.value)} placeholder='Try "braai", "boerewors" or "under R300"' className="field pl-11 pr-11" enterKeyHint="search" />
          {draft && <button type="button" onClick={() => { setDraft(''); update({ q: null }); }} className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-ink-3 hover:text-ink" aria-label="Clear search"><X className="size-4" aria-hidden /></button>}
        </form>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Category">
          {[{ id: '', name: 'All' }, ...(categories.data ?? [])].map(c => {
            const active = category === (c.id ? c.name : '');
            return (
              <button key={c.name} type="button" aria-pressed={active} onClick={() => update({ category: c.id ? c.name : null })}
                className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition ${active ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-2 hover:border-ink-3'}`}>
                {c.name}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={ids.price} className="sr-only">Maximum price</label>
          <select id={ids.price} className="field !w-auto min-w-0 text-sm" value={maxParam ?? ''} onChange={e => update({ max: e.target.value || null })}>
            <option value="">Any price</option>
            {PRICE_CAPS.map(c => <option key={c} value={c}>Under {rand(c).replace('.00', '')}</option>)}
          </select>
          <label htmlFor={ids.sort} className="sr-only">Sort by</label>
          <select id={ids.sort} className="field !w-auto min-w-0 text-sm" value={sort} onChange={e => update({ sort: e.target.value === 'popular' ? null : e.target.value })}>
            {SORTS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
          </select>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-semibold">
            <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={inStock} onChange={e => update({ stock: e.target.checked ? '1' : null })} /> In stock only
          </label>
          {anyFilter && <Button variant="ghost" size="sm" onClick={() => { setDraft(''); setParams({}, { replace: true }); }}>Clear all</Button>}
        </div>
      </div>

      <div className="pt-5" aria-live="polite">
        {products.isPending ? <ProductGridSkeleton /> : products.isError ? <ErrorState message={products.error.message} onRetry={() => products.refetch()} /> : products.data.length === 0 ? (
          <EmptyState icon={SearchX} title="No products match" action={anyFilter ? <Button variant="secondary" onClick={() => { setDraft(''); setParams({}, { replace: true }); }}>Clear filters</Button> : undefined}>
            {parsed.text ? <>Nothing found for “{parsed.text}”{max ? ` under ${rand(max)}` : ''}. Try another word, like “chicken” or “braai”.</> : 'Try removing a filter.'}
          </EmptyState>
        ) : (
          <>
            <p className={`mb-3 text-sm text-ink-3 transition-opacity ${products.isFetching ? 'opacity-50' : ''}`}>
              {products.data.length} {products.data.length === 1 ? 'product' : 'products'}{parsed.text ? ` for “${parsed.text}”` : ''}{max ? ` under ${rand(max)}` : ''}
            </p>
            <div className={`grid grid-cols-2 gap-3 transition-opacity md:grid-cols-3 md:gap-4 lg:grid-cols-4 ${products.isFetching ? 'opacity-60' : ''}`}>
              {products.data.map(p => <ProductCard key={p.id} p={p} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
