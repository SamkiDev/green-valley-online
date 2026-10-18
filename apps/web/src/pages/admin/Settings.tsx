// Stores & settings: activating a store, WhatsApp number, hours, delivery estimate and delivery zones are data, not code.
import { useState, type FormEvent } from 'react';
import { Plus, Store as StoreIcon } from 'lucide-react';
import { api, ApiError, isSaPhone } from '../../lib/api';
import { Field, TextArea } from '../../components/Field';
import { Badge, Button, DemoTag, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { AdminHeader } from './AdminLayout';
import { useAdmin, useAdminMutation, type AdminStore, type Zone } from './adminApi';

export function StoresSettings() {
  const q = useAdmin<AdminStore[]>('/stores');
  return (
    <>
      <AdminHeader title="Stores & settings">Open a store online, set its WhatsApp number and hours, and adjust delivery fees.</AdminHeader>
      {q.isPending ? <Skeleton className="h-64" /> : q.isError ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : q.data.length === 0 ? <EmptyState icon={StoreIcon} title="No stores" /> : <div className="space-y-4">{q.data.map(s => <StoreCard key={s.id} s={s} />)}</div>}
    </>
  );
}

function StoreCard({ s }: { s: AdminStore }) {
  const c = s.config;
  const [f, setF] = useState({ whatsapp: c.whatsapp ?? '', hours: c.hours ?? '', minMin: String(c.deliveryWindowMinutes?.[0] ?? ''), maxMin: String(c.deliveryWindowMinutes?.[1] ?? ''), complianceNotice: c.complianceNotice ?? '' });
  const [saved, setSaved] = useState(false);
  const active = s.status === 'ACTIVE';
  const status = useAdminMutation((next: string) => api(`/admin/stores/${s.id}`, { method: 'PATCH', body: { status: next } }));
  const save = useAdminMutation(() => api(`/admin/stores/${s.id}`, { method: 'PATCH', body: { config: {
    whatsapp: f.whatsapp.trim(), hours: f.hours.trim(),
    ...(f.minMin && f.maxMin ? { deliveryWindowMinutes: [Number(f.minMin), Number(f.maxMin)] } : {}),
    ...(s.ageRestricted ? { complianceNotice: f.complianceNotice.trim() } : {}),
  } } }));
  const errors: Record<string, string> = {};
  if (f.whatsapp.trim() && !isSaPhone(f.whatsapp)) errors.whatsapp = 'Enter a South African number, e.g. 082 123 4567';
  if ((f.minMin || f.maxMin) && !(Number(f.minMin) >= 5 && Number(f.maxMin) >= Number(f.minMin) && Number(f.maxMin) <= 1440)) errors.window = 'Use minutes, earliest before latest (5–1440)';
  const server = save.error instanceof ApiError ? save.error.details : undefined;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setSaved(false); setF(x => ({ ...x, [k]: e.target.value })); };
  const submit = (e: FormEvent) => { e.preventDefault(); if (!Object.keys(errors).length) save.mutate(undefined, { onSuccess: () => setSaved(true) }); };

  return (
    <section className="card overflow-hidden" aria-labelledby={`store-${s.id}`}>
      <div className="flex h-1.5" aria-hidden><span className="flex-[3]" style={{ background: c.accent?.primary }} /><span className="flex-1" style={{ background: c.accent?.secondary }} /></div>
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-0">
        <div>
          <h2 id={`store-${s.id}`} className="text-lg font-extrabold">{s.name}</h2>
          <p className="text-sm text-ink-3">{s.category} · {s._count.products} products{s.ageRestricted ? ' · age-restricted' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={active ? 'ok' : 'neutral'}>{active ? 'Open online' : 'Coming soon'}</Badge>
          <Button size="sm" variant={active ? 'secondary' : 'primary'} busy={status.isPending}
            onClick={() => window.confirm(active ? `Take ${s.name} offline? Customers will see "Coming soon".` : `Open ${s.name} online? Its active products become visible in the shop.`) && status.mutate(active ? 'COMING_SOON' : 'ACTIVE')}>
            {active ? 'Set to coming soon' : 'Open online'}
          </Button>
        </div>
      </div>
      {status.isError && <p className="mx-5 mt-3 rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{status.error.message}</p>}
      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <Field id={`wa-${s.id}`} label="WhatsApp number" type="tel" placeholder="Not set" value={f.whatsapp} onChange={set('whatsapp')} error={errors.whatsapp ?? server?.config?.[0]} hint="Used by the 'Chat with Green Valley' buttons." />
        <Field id={`hours-${s.id}`} label="Opening hours" placeholder="e.g. Mon–Fri 8:00–18:00, Sat 8:00–14:00" value={f.hours} onChange={set('hours')} />
        <fieldset>
          <legend className="mb-1 flex items-center gap-2 text-sm font-semibold">Delivery estimate (minutes after payment) <DemoTag>SHOWN TO CUSTOMERS</DemoTag></legend>
          <div className="flex items-center gap-2">
            <label htmlFor={`wmin-${s.id}`} className="sr-only">Earliest minutes</label>
            <input id={`wmin-${s.id}`} inputMode="numeric" className="field" placeholder="60" value={f.minMin} onChange={set('minMin')} aria-invalid={!!errors.window} />
            <span className="text-ink-3">to</span>
            <label htmlFor={`wmax-${s.id}`} className="sr-only">Latest minutes</label>
            <input id={`wmax-${s.id}`} inputMode="numeric" className="field" placeholder="120" value={f.maxMin} onChange={set('maxMin')} aria-invalid={!!errors.window} />
          </div>
          {errors.window && <p className="mt-1 text-sm text-danger-text">{errors.window}</p>}
        </fieldset>
        {s.ageRestricted && <TextArea id={`comp-${s.id}`} label="Compliance notice" className="sm:col-span-2" maxLength={500} placeholder="Shown on the store page. Leave blank until confirmed." value={f.complianceNotice} onChange={set('complianceNotice')} />}
        <div className="flex items-center justify-end gap-3 sm:col-span-2">
          {saved && <span className="text-sm font-semibold text-ok-text" role="status">Saved</span>}
          {save.isError && !server && <span className="text-sm font-semibold text-danger-text" role="alert">{save.error.message}</span>}
          <Button type="submit" busy={save.isPending}>Save settings</Button>
        </div>
      </form>
      <div className="border-t border-line p-5">
        <h3 className="flex items-center gap-2 font-extrabold">Delivery zones <DemoTag>DEMO FEES</DemoTag></h3>
        <p className="mb-3 text-sm text-ink-2">List the suburbs each zone covers. Checkout then picks the zone from the customer's suburb, and addresses outside every list are refused. Leave all lists empty to let customers choose a zone themselves.</p>
        <ul className="space-y-3">{s.zones.map(z => <ZoneEditor key={z.id} storeId={s.id} z={z} />)}</ul>
        <ZoneEditor storeId={s.id} />
      </div>
    </section>
  );
}

const splitSuburbs = (t: string) => t.split(/[,;\n]/).map(x => x.trim()).filter(Boolean);

// One zone (or a blank "add zone" form when z is missing): name, fee, suburbs, on/off.
function ZoneEditor({ storeId, z }: { storeId: string; z?: Zone }) {
  const initial = { name: z?.name ?? '', fee: z ? String(Number(z.fee)) : '', suburbs: (z?.suburbs ?? []).join(', '), active: z?.active ?? true };
  const [f, setF] = useState(initial);
  const [open, setOpen] = useState(!!z);
  const [saved, setSaved] = useState(false);
  const body = { name: f.name.trim(), fee: Number(f.fee), suburbs: splitSuburbs(f.suburbs), active: f.active };
  const save = useAdminMutation(() => z ? api(`/admin/zones/${z.id}`, { method: 'PUT', body }) : api(`/admin/stores/${storeId}/zones`, { method: 'POST', body }));
  const errors: Record<string, string> = {};
  if (!f.name.trim()) errors.name = 'Enter a zone name';
  if (f.fee === '' || !(Number(f.fee) >= 0 && Number(f.fee) <= 5000)) errors.fee = 'Enter a fee from R0 to R5000';
  if (body.suburbs.some(x => x.length < 2 || x.length > 60)) errors.suburbs = 'Each suburb must be 2 to 60 characters';
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const set = (k: 'name' | 'fee' | 'suburbs') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setSaved(false); setF(x => ({ ...x, [k]: e.target.value })); };
  const id = z?.id ?? `new-${storeId}`;
  if (!open) return <Button size="sm" variant="secondary" className="mt-3" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> Add zone</Button>;
  const Tag = z ? 'li' : 'div';
  return (
    <Tag className={`rounded-xl border border-line p-4 ${z ? '' : 'mt-3'}`}>
      <form noValidate className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]" aria-label={z ? `Edit ${z.name}` : 'Add delivery zone'}
        onSubmit={e => { e.preventDefault(); if (Object.keys(errors).length) return; save.mutate(undefined, { onSuccess: () => { setSaved(true); if (!z) { setF(initial); setOpen(false); } } }); }}>
        <Field id={`zn-${id}`} label="Zone name" placeholder="e.g. Zone 4 – Far East" value={f.name} onChange={set('name')} error={errors.name} />
        <Field id={`zf-${id}`} label="Fee (R)" inputMode="decimal" value={f.fee} onChange={set('fee')} error={errors.fee} />
        <TextArea id={`zs-${id}`} label="Suburbs (comma or one per line)" className="sm:col-span-2" rows={2} placeholder="e.g. Bedfordview, Edenvale, Primrose" value={f.suburbs} onChange={set('suburbs')} error={errors.suburbs} />
        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
          <label className="flex min-h-11 items-center gap-2 font-semibold"><input type="checkbox" className="size-5 accent-[var(--color-brand)]" checked={f.active} onChange={e => { setSaved(false); setF(x => ({ ...x, active: e.target.checked })); }} /> Delivering to this zone</label>
          <span className="flex items-center gap-2">
            {saved && !dirty && <span className="text-sm font-semibold text-ok-text" role="status">Saved</span>}
            {!z && <Button type="button" size="sm" variant="ghost" onClick={() => { setF(initial); setOpen(false); }}>Cancel</Button>}
            <Button type="submit" size="sm" disabled={!!z && !dirty} busy={save.isPending}>{z ? 'Save zone' : 'Add zone'}</Button>
          </span>
        </div>
      </form>
      {save.isError && <p className="mt-2 text-sm font-semibold text-danger-text" role="alert">{save.error.message}</p>}
    </Tag>
  );
}
