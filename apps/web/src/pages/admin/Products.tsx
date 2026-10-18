import { useState, type FormEvent } from 'react';
import { Boxes, Camera, ImagePlus, Images, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { api, apiUpload, ApiError } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { useCategories, useStores } from '../../lib/queries';
import { rand, unitLabel } from '../../lib/format';
import { Field, TextArea } from '../../components/Field';
import { ProductImage } from '../../components/ProductImage';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { AdminHeader } from './AdminLayout';
import { useAdmin, useAdminMutation, type AdminProduct, type InventoryRow } from './adminApi';
import { useRef } from 'react';
import { ImportProducts } from './ImportProducts';

type Draft = { id?: string; storeId: string; name: string; description: string; price: string; categoryId: string; soldByWeight: boolean; quantity: string; lowThreshold: string; imageUrl: string; active: boolean };

export function Products() {
  const products = useAdmin<AdminProduct[]>('/products');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const remove = useAdminMutation((id: string) => api(`/admin/products/${id}`, { method: 'DELETE' }));
  const toggle = useAdminMutation((p: AdminProduct) => api(`/admin/products/${p.id}`, { method: 'PATCH', body: { active: !p.active } }));
  const list = (products.data ?? []).filter(p => !q.trim() || `${p.name} ${p.category.name}`.toLowerCase().includes(q.trim().toLowerCase()));
  const startNew = () => setEditing({ storeId: '', name: '', description: '', price: '', categoryId: '', soldByWeight: true, quantity: '0', lowThreshold: '5', imageUrl: '', active: true });
  const startEdit = (p: AdminProduct) => setEditing({ id: p.id, storeId: p.storeId, name: p.name, description: p.description, price: String(Number(p.price)), categoryId: p.category.id, soldByWeight: p.soldByWeight, quantity: String(Number(p.inventory?.quantity ?? 0)), lowThreshold: String(Number(p.inventory?.lowThreshold ?? 5)), imageUrl: p.imageUrl ?? '', active: p.active });

  return (
    <>
      <AdminHeader title="Products" actions={<Button onClick={startNew}><Plus className="size-4" aria-hidden /> Add product</Button>}>Prices are per kg for weighed products. Unavailable products stay here but are hidden from the shop.</AdminHeader>
      {editing && <ProductForm draft={editing} onClose={() => setEditing(null)} />}
      <BulkPhotos />
      <ImportProducts />
      <div className="relative mb-4 max-w-md">
        <label htmlFor="prod-search" className="sr-only">Search products</label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-3" aria-hidden />
        <input id="prod-search" type="search" className="field pl-11" placeholder="Search products" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {(remove.error || toggle.error) && <p className="mb-3 rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{(remove.error ?? toggle.error)!.message}</p>}
      {products.isPending ? <Skeleton className="h-64" /> : products.isError ? <ErrorState message={products.error.message} onRetry={() => products.refetch()} />
        : list.length === 0 ? <EmptyState icon={Package} title={q ? 'No matching products' : 'No products yet'}>{q ? 'Try another search.' : 'Add your first product.'}</EmptyState> : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {list.map(p => (
              <li key={p.id} className={`card flex gap-3 p-3 ${p.active ? '' : 'opacity-70'}`}>
                <div className="w-20 shrink-0"><ProductImage name={p.name} category={p.category.name} imageUrl={p.imageUrl} size="sm" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold leading-snug">{p.name}</p>
                    <p className="shrink-0 font-extrabold tabular-nums">{rand(p.price)}<span className="text-sm font-normal text-ink-3">{unitLabel(p.soldByWeight)}</span></p>
                  </div>
                  <p className="text-sm text-ink-3">{p.category.name} · Stock {Number(p.inventory?.quantity ?? 0)}{p.soldByWeight ? ' kg' : ''}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {!p.active && <Badge>Unavailable</Badge>}
                    <Button size="sm" variant="secondary" onClick={() => startEdit(p)}><Pencil className="size-3.5" aria-hidden /> Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggle.mutate(p)} busy={toggle.isPending && toggle.variables?.id === p.id}>{p.active ? 'Mark unavailable' : 'Make available'}</Button>
                    <Button size="sm" variant="ghost" className="text-danger-text" aria-label={`Delete ${p.name}`} busy={remove.isPending && remove.variables === p.id}
                      onClick={() => window.confirm(`Delete "${p.name}"? It disappears from the shop and this list; past orders keep it.`) && remove.mutate(p.id)}>
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                  <PhotoControls p={p} />
                </div>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}

function ProductForm({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const { data: me } = useMe();
  const stores = useStores();
  const cats = useCategories();
  const [d, setD] = useState(draft);
  const [touched, setTouched] = useState(false);
  const save = useAdminMutation(() => {
    const body = {
      name: d.name.trim(), description: d.description.trim(), price: Number(d.price), categoryId: d.categoryId, soldByWeight: d.soldByWeight,
      quantity: Number(d.quantity), lowThreshold: Number(d.lowThreshold), imageUrl: d.imageUrl.trim() || null, active: d.active,
      ...(d.id ? {} : me?.role === 'ADMIN' ? { storeId: d.storeId } : {}),
    };
    return d.id ? api(`/admin/products/${d.id}`, { method: 'PATCH', body }) : api('/admin/products', { method: 'POST', body });
  });
  const errors: Partial<Record<keyof Draft, string>> = {};
  if (!d.name.trim()) errors.name = 'Enter a product name';
  if (!(Number(d.price) > 0)) errors.price = 'Enter a price above R0';
  if (!d.categoryId) errors.categoryId = 'Choose a category';
  if (!d.id && me?.role === 'ADMIN' && !d.storeId) errors.storeId = 'Choose a store';
  if (d.quantity === '' || !(Number(d.quantity) >= 0)) errors.quantity = 'Enter 0 or more';
  if (d.lowThreshold === '' || !(Number(d.lowThreshold) >= 0)) errors.lowThreshold = 'Enter 0 or more';
  if (d.imageUrl.trim() && !/^https?:\/\/\S+$/.test(d.imageUrl.trim())) errors.imageUrl = 'Use a full https:// link';
  const server = save.error instanceof ApiError ? save.error.details : undefined;
  const show = (k: keyof Draft) => (touched ? errors[k] : undefined) ?? server?.[k]?.[0];
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setD(s => ({ ...s, [k]: e.target.value }));
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!Object.keys(errors).length) save.mutate(undefined, { onSuccess: onClose }); };

  return (
    <form onSubmit={submit} noValidate className="card mb-5 space-y-4 p-5" aria-label={d.id ? 'Edit product' : 'Add product'}>
      <div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">{d.id ? `Edit ${draft.name}` : 'Add product'}</h2><button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl hover:bg-surface-2" aria-label="Close form"><X className="size-5" aria-hidden /></button></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="pf-name" label="Name" value={d.name} onChange={set('name')} error={show('name')} />
        <div>
          <label htmlFor="pf-cat" className="mb-1 block text-sm font-semibold">Category</label>
          <select id="pf-cat" className="field" value={d.categoryId} onChange={set('categoryId')} aria-invalid={!!show('categoryId')}>
            <option value="">Choose…</option>{cats.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {show('categoryId') && <p className="mt-1 text-sm text-danger-text">{show('categoryId')}</p>}
        </div>
        {!d.id && me?.role === 'ADMIN' && (
          <div>
            <label htmlFor="pf-store" className="mb-1 block text-sm font-semibold">Store</label>
            <select id="pf-store" className="field" value={d.storeId} onChange={set('storeId')} aria-invalid={!!show('storeId')}>
              <option value="">Choose…</option>{stores.data?.map(s => <option key={s.id} value={s.id}>{s.name}{s.status !== 'ACTIVE' ? ' (coming soon)' : ''}</option>)}
            </select>
            {show('storeId') && <p className="mt-1 text-sm text-danger-text">{show('storeId')}</p>}
          </div>
        )}
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Sold</legend>
          <div className="grid grid-cols-2 gap-2">
            {([[true, 'By weight (per kg)'], [false, 'Per item']] as const).map(([v, l]) => (
              <label key={l} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${d.soldByWeight === v ? 'border-brand bg-brand-soft text-brand-text' : 'border-line'}`}>
                <input type="radio" name="pf-sold" value={v ? 'weight' : 'item'} checked={d.soldByWeight === v} onChange={() => setD(s => ({ ...s, soldByWeight: v }))} className="accent-[var(--brand)]" />{l}
              </label>
            ))}
          </div>
        </fieldset>
        <Field id="pf-price" label={`Price (R${d.soldByWeight ? ' per kg' : ' each'})`} inputMode="decimal" value={d.price} onChange={set('price')} error={show('price')} />
        <Field id="pf-qty" label={`Stock (${d.soldByWeight ? 'kg' : 'items'})`} inputMode="decimal" value={d.quantity} onChange={set('quantity')} error={show('quantity')} />
        <Field id="pf-low" label="Low-stock alert at" inputMode="decimal" value={d.lowThreshold} onChange={set('lowThreshold')} error={show('lowThreshold')} />
        <Field id="pf-img" label="Image link (optional)" type="url" value={d.imageUrl} onChange={set('imageUrl')} error={show('imageUrl')} hint="Or upload a photo from the product card after saving." />
        <TextArea id="pf-desc" label="Description" className="sm:col-span-2" maxLength={500} value={d.description} onChange={set('description')} />
        <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" className="size-4 accent-[var(--brand)]" checked={d.active} onChange={e => setD(s => ({ ...s, active: e.target.checked }))} /> Available in the shop</label>
      </div>
      {save.isError && !server && <p className="rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{save.error.message}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" busy={save.isPending}>{d.id ? 'Save changes' : 'Add product'}</Button></div>
    </form>
  );
}

export function Inventory() {
  const inv = useAdmin<InventoryRow[]>('/inventory');
  return (
    <>
      <AdminHeader title="Inventory">Sorted by urgency. Update stock after a delivery or a stock count.</AdminHeader>
      {inv.isPending ? <Skeleton className="h-64" /> : inv.isError ? <ErrorState message={inv.error.message} onRetry={() => inv.refetch()} />
        : inv.data.length === 0 ? <EmptyState icon={Boxes} title="No products yet" /> : (
          <ul className="card divide-y divide-line">{inv.data.map(r => <StockRow key={r.id} r={r} />)}</ul>
        )}
    </>
  );
}

function StockRow({ r }: { r: InventoryRow }) {
  const [val, setVal] = useState(String(Number(r.quantity)));
  const save = useAdminMutation(() => api(`/admin/products/${r.productId}`, { method: 'PATCH', body: { quantity: Number(val) } }));
  const valid = val !== '' && Number(val) >= 0;
  const dirty = valid && Number(val) !== Number(r.quantity);
  const id = `stock-${r.id}`;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-bold">{r.product.name}{!r.product.active && <span className="ml-2 text-sm font-normal text-ink-3">(unavailable)</span>}</p>
        <p className="text-sm text-ink-3">{r.product.category.name} · alert at {Number(r.lowThreshold)}{r.product.soldByWeight ? ' kg' : ''}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={r.state === 'OUT_OF_STOCK' ? 'danger' : r.state === 'LOW_STOCK' ? 'warn' : 'ok'}>{r.state === 'OUT_OF_STOCK' ? 'OUT OF STOCK' : r.state === 'LOW_STOCK' ? 'LOW STOCK' : 'IN STOCK'}</Badge>
        <label htmlFor={id} className="sr-only">Stock for {r.product.name}</label>
        <input id={id} inputMode="decimal" className="field !min-h-10 !w-24 py-1.5 text-right" value={val} onChange={e => setVal(e.target.value)} aria-invalid={!valid} />
        <span className="w-6 text-sm text-ink-3">{r.product.soldByWeight ? 'kg' : ''}</span>
        <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} busy={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button>
      </div>
      {save.isError && <p className="w-full text-sm text-danger-text" role="alert">{save.error.message}</p>}
    </li>
  );
}

// Per-product photo: take one with the phone camera or pick a file. The API resizes it and strips metadata.
function PhotoControls({ p }: { p: AdminProduct }) {
  const camera = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const upload = useAdminMutation((f: File) => { const fd = new FormData(); fd.append('image', f); return apiUpload(`/admin/products/${p.id}/image`, fd); });
  const remove = useAdminMutation(() => api(`/admin/products/${p.id}/image`, { method: 'DELETE' }));
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload.mutate(f); };
  const err = upload.error ?? remove.error;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={pick} />
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={pick} />
      <Button size="sm" variant="ghost" onClick={() => camera.current?.click()} busy={upload.isPending} aria-label={`Take a photo of ${p.name}`}><Camera className="size-3.5" aria-hidden /> Take photo</Button>
      <Button size="sm" variant="ghost" onClick={() => file.current?.click()} disabled={upload.isPending} aria-label={`Upload a photo of ${p.name}`}><ImagePlus className="size-3.5" aria-hidden /> Upload</Button>
      {p.imageUrl && <Button size="sm" variant="ghost" className="text-ink-3" busy={remove.isPending} onClick={() => window.confirm(`Remove the photo of ${p.name}?`) && remove.mutate(undefined)}>Remove photo</Button>}
      {err && <p className="w-full text-sm text-danger-text" role="alert">{err.message}</p>}
    </div>
  );
}

type BulkResult = { matched: number; results: { file: string; product?: string; ok: boolean; error?: string }[] };
// Bulk upload: name each file after its product ("Beef Mince.jpg", "beef-mince.png") and they are matched automatically.
function BulkPhotos() {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const upload = useAdminMutation((files: File[]) => { const fd = new FormData(); files.forEach(f => fd.append('images', f)); return apiUpload<BulkResult>('/admin/products/images/bulk', fd); });
  return (
    <section className="card mb-4 p-4" aria-labelledby="bulk-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="bulk-h" className="flex items-center gap-2 font-extrabold"><Images className="size-5 text-ink-3" aria-hidden /> Bulk photo upload</h2>
        <Button size="sm" variant="secondary" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Hide' : 'Upload many photos'}</Button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-ink-2">Name each photo after its product, e.g. <span className="font-semibold">Beef Mince.jpg</span> or <span className="font-semibold">beef-short-ribs.png</span>. Up to 50 photos, 8 MB each.</p>
          <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) upload.mutate(fs); }} />
          <Button onClick={() => input.current?.click()} busy={upload.isPending}><ImagePlus className="size-4" aria-hidden /> Choose photos</Button>
          {upload.isError && <p className="text-sm font-semibold text-danger-text" role="alert">{upload.error.message}</p>}
          {upload.data && (
            <div role="status">
              <p className="font-semibold">{upload.data.matched} of {upload.data.results.length} photos matched to products.</p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {upload.data.results.map(r => <li key={r.file} className={r.ok ? 'text-ok-text' : 'text-danger-text'}>{r.ok ? '✓' : '✕'} {r.file}{r.ok ? ` → ${r.product}` : `: ${r.error}`}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
