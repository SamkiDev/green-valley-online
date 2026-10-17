import { useState, type FormEvent } from 'react';
import { Plus, Truck, Users, X } from 'lucide-react';
import { api, ApiError, isEmail, isSaPhone } from '../../lib/api';
import { dateTime, rand } from '../../lib/format';
import { Field } from '../../components/Field';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { AdminHeader } from './AdminLayout';
import { useAdmin, useAdminMutation, type Customer, type Driver } from './adminApi';

export function Customers() {
  const q = useAdmin<Customer[]>('/customers');
  return (
    <>
      <AdminHeader title="Customers">Private customer details. Visible to admins only.</AdminHeader>
      {q.isPending ? <Skeleton className="h-64" /> : q.isError ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : q.data.length === 0 ? <EmptyState icon={Users} title="No customers yet" /> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-line text-ink-3"><tr><th className="p-3 font-semibold">Customer</th><th className="p-3 font-semibold">Contact</th><th className="p-3 text-right font-semibold">Orders</th><th className="p-3 text-right font-semibold">Paid total</th><th className="p-3 font-semibold">Last order</th></tr></thead>
              <tbody className="divide-y divide-line">
                {q.data.map(c => (
                  <tr key={c.id}>
                    <td className="p-3"><p className="font-bold">{c.name}</p><p className="text-ink-3">Joined {new Date(c.createdAt).toLocaleDateString('en-ZA')}</p></td>
                    <td className="p-3 text-ink-2">{c.email}<br />{c.phone ?? '—'}</td>
                    <td className="p-3 text-right tabular-nums">{c.orders}</td>
                    <td className="p-3 text-right font-semibold tabular-nums">{rand(c.spent)}</td>
                    <td className="p-3 text-ink-2">{c.lastOrderAt ? dateTime(c.lastOrderAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </>
  );
}

export function Drivers() {
  const q = useAdmin<Driver[]>('/drivers', { refetchInterval: 30_000 });
  const [adding, setAdding] = useState(false);
  const toggle = useAdminMutation((d: Driver) => api(`/admin/users/${d.user.id}/active`, { method: 'PATCH', body: { active: !d.user.active } }));
  return (
    <>
      <AdminHeader title="Drivers" actions={!adding && <Button onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden /> Add driver</Button>}>Drivers sign in at /driver. Disabled drivers can't sign in or be assigned.</AdminHeader>
      {adding && <AddDriver onClose={() => setAdding(false)} />}
      {toggle.isError && <p className="mb-3 rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{toggle.error.message}</p>}
      {q.isPending ? <Skeleton className="h-64" /> : q.isError ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : q.data.length === 0 ? <EmptyState icon={Truck} title="No drivers yet">Add a driver to start assigning deliveries.</EmptyState> : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {q.data.map(d => (
              <li key={d.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-bold">{d.user.name}</p><p className="text-sm text-ink-2">{d.user.email}{d.user.phone ? ` · ${d.user.phone}` : ''}</p><p className="text-sm text-ink-3">{d.vehicle ?? 'No vehicle set'}</p></div>
                  <Badge tone={d.user.active ? 'ok' : 'neutral'}>{d.user.active ? 'Active' : 'Disabled'}</Badge>
                </div>
                <p className="mt-3 text-sm font-semibold">On the road: {d.active.length ? d.active.map(a => `#${a.orderNumber} (${a.status.replace(/_/g, ' ').toLowerCase()})`).join(', ') : 'none'}</p>
                <p className="text-sm text-ink-2">{d.delivered} delivered{d.history.length ? ` · last: ${d.history.map(h => `#${h.orderNumber}`).join(', ')}` : ''}</p>
                <Button size="sm" variant="secondary" className="mt-3" busy={toggle.isPending && toggle.variables?.id === d.id} onClick={() => toggle.mutate(d)}>{d.user.active ? 'Disable' : 'Enable'}</Button>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}

function AddDriver({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', vehicle: '', password: '' });
  const [touched, setTouched] = useState(false);
  const save = useAdminMutation(() => api('/admin/drivers', { method: 'POST', body: { name: f.name.trim(), email: f.email.trim(), password: f.password, ...(f.phone.trim() ? { phone: f.phone.trim() } : {}), ...(f.vehicle.trim() ? { vehicle: f.vehicle.trim() } : {}) } }));
  const errors: Partial<Record<keyof typeof f, string>> = {};
  if (!f.name.trim()) errors.name = 'Enter a name';
  if (!isEmail(f.email)) errors.email = 'Enter a valid email';
  if (f.phone.trim() && !isSaPhone(f.phone)) errors.phone = 'Enter a South African number';
  if (f.password.length < 8) errors.password = 'At least 8 characters';
  const server = save.error instanceof ApiError ? save.error.details : undefined;
  const show = (k: keyof typeof f) => (touched ? errors[k] : undefined) ?? server?.[k]?.[0];
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(s => ({ ...s, [k]: e.target.value }));
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!Object.keys(errors).length) save.mutate(undefined, { onSuccess: onClose }); };
  return (
    <form onSubmit={submit} noValidate className="card mb-5 space-y-4 p-5" aria-label="Add driver">
      <div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">Add driver</h2><button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl hover:bg-surface-2" aria-label="Close form"><X className="size-5" aria-hidden /></button></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="ad-name" label="Full name" autoComplete="off" value={f.name} onChange={set('name')} error={show('name')} />
        <Field id="ad-email" label="Email (sign-in)" type="email" autoComplete="off" value={f.email} onChange={set('email')} error={show('email')} />
        <Field id="ad-phone" label="Phone (optional)" type="tel" value={f.phone} onChange={set('phone')} error={show('phone')} />
        <Field id="ad-vehicle" label="Vehicle (optional)" value={f.vehicle} onChange={set('vehicle')} />
        <Field id="ad-password" label="Temporary password" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} error={show('password')} hint="Share it with the driver privately." />
      </div>
      {save.isError && !server && <p className="rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{save.error.message}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" busy={save.isPending}>Add driver</Button></div>
    </form>
  );
}
