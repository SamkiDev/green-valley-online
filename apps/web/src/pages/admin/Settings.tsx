// Stores & settings: activating a store, WhatsApp number, hours, delivery estimate and zone fees are data, not code.
import { useState, type FormEvent } from 'react';
import { Store as StoreIcon } from 'lucide-react';
import { api, ApiError, isSaPhone } from '../../lib/api';
import { Field, TextArea } from '../../components/Field';
import { Badge, Button, DemoTag, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { AdminHeader } from './AdminLayout';
import { useAdmin, useAdminMutation, type AdminStore } from './adminApi';

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
      {s.zones.length > 0 && (
        <div className="border-t border-line p-5">
          <h3 className="mb-3 flex items-center gap-2 font-extrabold">Delivery zones <DemoTag>DEMO FEES</DemoTag></h3>
          <ul className="space-y-2">{s.zones.map(z => <ZoneRow key={z.id} z={z} />)}</ul>
        </div>
      )}
    </section>
  );
}

function ZoneRow({ z }: { z: AdminStore['zones'][number] }) {
  const [fee, setFee] = useState(String(Number(z.fee)));
  const save = useAdminMutation(() => api(`/admin/zones/${z.id}`, { method: 'PUT', body: { fee: Number(fee) } }));
  const valid = fee !== '' && Number(fee) >= 0 && Number(fee) <= 5000;
  const id = `zone-${z.id}`;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3">
      <label htmlFor={id} className="font-semibold">{z.name}</label>
      <div className="flex items-center gap-2">
        <span className="text-ink-3">R</span>
        <input id={id} inputMode="decimal" className="field !min-h-10 !w-24 py-1.5 text-right" value={fee} onChange={e => setFee(e.target.value)} aria-invalid={!valid} />
        <Button size="sm" variant={valid && Number(fee) !== Number(z.fee) ? 'primary' : 'secondary'} disabled={!valid || Number(fee) === Number(z.fee)} busy={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button>
      </div>
      {save.isError && <p className="w-full text-sm text-danger-text" role="alert">{save.error.message}</p>}
    </li>
  );
}
