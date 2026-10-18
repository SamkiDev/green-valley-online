import { useState, type FormEvent } from 'react';
import { Copy, KeyRound, Plus, Truck, UserCog, Users, X } from 'lucide-react';
import { api, ApiError, isEmail, isSaPhone } from '../../lib/api';
import { dateTime, rand } from '../../lib/format';
import { Field } from '../../components/Field';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { AdminHeader } from './AdminLayout';
import { useAdmin, useAdminMutation, type Customer, type Driver, type Staff } from './adminApi';

// No email service yet, so forgotten passwords are reset here: the admin gets a one-time temporary password
// to share privately (WhatsApp or in person). The user is signed out everywhere and must choose a new password.
function usePasswordReset() {
  const [shown, setShown] = useState<{ name: string; email: string; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const reset = useAdminMutation((u: { id: string; name: string }) => api<{ name: string; email: string; temporaryPassword: string }>(`/admin/users/${u.id}/temporary-password`, { method: 'POST' }));
  const start = (u: { id: string; name: string }) => {
    if (!window.confirm(`Reset the password for ${u.name}? They will be signed out on every device and need the temporary password from you.`)) return;
    setCopied(false); reset.mutate(u, { onSuccess: setShown });
  };
  const panel = (
    <>
      {reset.isError && <p className="mb-3 rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{reset.error.message}</p>}
      {shown && (
        <div className="card mb-4 border-brand p-4" role="status">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold">Temporary password for {shown.name} ({shown.email})</p>
            <button type="button" onClick={() => setShown(null)} className="grid size-10 shrink-0 place-items-center rounded-xl hover:bg-surface-2" aria-label="Hide temporary password"><X className="size-5" aria-hidden /></button>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-surface-2 px-3 py-2 text-lg font-bold tracking-wide" data-testid="temp-password">{shown.temporaryPassword}</code>
            <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(shown.temporaryPassword).then(() => setCopied(true))}><Copy className="size-4" aria-hidden />{copied ? 'Copied' : 'Copy'}</Button>
          </p>
          <p className="mt-2 text-sm text-ink-2">Shown once. Share it privately; they will be asked to choose their own password when they sign in.</p>
        </div>
      )}
    </>
  );
  return { start, panel, busyFor: (id: string) => reset.isPending && reset.variables?.id === id };
}

function ResetButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return <Button size="sm" variant="secondary" busy={busy} onClick={onClick}><KeyRound className="size-4" aria-hidden /> Reset password</Button>;
}

export function Customers() {
  const q = useAdmin<Customer[]>('/customers');
  const pw = usePasswordReset();
  const toggle = useAdminMutation((c: Customer) => api(`/admin/users/${c.id}/active`, { method: 'PATCH', body: { active: !c.active } }));
  return (
    <>
      <AdminHeader title="Customers">Private customer details. Visible to admins only.</AdminHeader>
      {pw.panel}
      {toggle.isError && <p className="mb-3 rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{toggle.error.message}</p>}
      {q.isPending ? <Skeleton className="h-64" /> : q.isError ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : q.data.length === 0 ? <EmptyState icon={Users} title="No customers yet" /> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[54rem] text-left text-sm">
              <thead className="border-b border-line text-ink-3"><tr><th className="p-3 font-semibold">Customer</th><th className="p-3 font-semibold">Contact</th><th className="p-3 text-right font-semibold">Orders</th><th className="p-3 text-right font-semibold">Paid total</th><th className="p-3 font-semibold">Last order</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-line">
                {q.data.map(c => (
                  <tr key={c.id}>
                    <td className="p-3"><p className="font-bold">{c.name}</p><p className="text-ink-3">Joined {new Date(c.createdAt).toLocaleDateString('en-ZA')}</p>{!c.active && <Badge tone="neutral" className="mt-1">Disabled</Badge>}</td>
                    <td className="p-3 text-ink-2">{c.email}<br />{c.phone ?? '—'}</td>
                    <td className="p-3 text-right tabular-nums">{c.orders}</td>
                    <td className="p-3 text-right font-semibold tabular-nums">{rand(c.spent)}</td>
                    <td className="p-3 text-ink-2">{c.lastOrderAt ? dateTime(c.lastOrderAt) : '—'}</td>
                    <td className="p-3"><div className="flex justify-end gap-2">
                      <ResetButton busy={pw.busyFor(c.id)} onClick={() => pw.start(c)} />
                      <Button size="sm" variant="ghost" busy={toggle.isPending && toggle.variables?.id === c.id}
                        onClick={() => window.confirm(c.active ? `Disable ${c.name}? They are signed out and can't sign in until enabled again.` : `Enable ${c.name}?`) && toggle.mutate(c)}>{c.active ? 'Disable' : 'Enable'}</Button>
                    </div></td>
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
  const pw = usePasswordReset();
  return (
    <>
      <AdminHeader title="Drivers" actions={!adding && <Button onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden /> Add driver</Button>}>Drivers sign in at /driver. Disabled drivers can't sign in or be assigned.</AdminHeader>
      {adding && <AddDriver onClose={() => setAdding(false)} />}
      {pw.panel}
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
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" busy={toggle.isPending && toggle.variables?.id === d.id} onClick={() => toggle.mutate(d)}>{d.user.active ? 'Disable' : 'Enable'}</Button>
                  <ResetButton busy={pw.busyFor(d.user.id)} onClick={() => pw.start(d.user)} />
                </div>
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

export function StaffAccounts() {
  const q = useAdmin<Staff[]>('/staff');
  const stores = useAdmin<{ id: string; name: string }[]>('/stores');
  const [adding, setAdding] = useState(false);
  const pw = usePasswordReset();
  const toggle = useAdminMutation((st: Staff) => api(`/admin/users/${st.user.id}/active`, { method: 'PATCH', body: { active: !st.user.active } }));
  return (
    <>
      <AdminHeader title="Store staff" actions={!adding && <Button onClick={() => setAdding(true)} disabled={!stores.data}><Plus className="size-4" aria-hidden /> Add staff member</Button>}>
        Staff sign in at /admin and see only their own store. Their answers to customer questions wait for your approval.
      </AdminHeader>
      {adding && stores.data && <AddStaff stores={stores.data} onClose={() => setAdding(false)} />}
      {pw.panel}
      {toggle.isError && <p className="mb-3 rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{toggle.error.message}</p>}
      {q.isPending ? <Skeleton className="h-64" /> : q.isError ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : q.data.length === 0 ? <EmptyState icon={UserCog} title="No staff accounts yet">Add the people who pack orders and update stock in each store.</EmptyState> : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {q.data.map(st => (
              <li key={st.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-bold">{st.user.name}</p><p className="text-sm text-ink-2">{st.user.email}{st.user.phone ? ` · ${st.user.phone}` : ''}</p><p className="text-sm text-ink-3">{st.store.name}</p></div>
                  <Badge tone={st.user.active ? 'ok' : 'neutral'}>{st.user.active ? 'Active' : 'Disabled'}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" busy={toggle.isPending && toggle.variables?.id === st.id} onClick={() => toggle.mutate(st)}>{st.user.active ? 'Disable' : 'Enable'}</Button>
                  <ResetButton busy={pw.busyFor(st.user.id)} onClick={() => pw.start(st.user)} />
                </div>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}

function AddStaff({ stores, onClose }: { stores: { id: string; name: string }[]; onClose: () => void }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', storeId: stores[0]?.id ?? '', password: '' });
  const [touched, setTouched] = useState(false);
  const save = useAdminMutation(() => api('/admin/staff', { method: 'POST', body: { name: f.name.trim(), email: f.email.trim(), password: f.password, storeId: f.storeId, ...(f.phone.trim() ? { phone: f.phone.trim() } : {}) } }));
  const errors: Partial<Record<keyof typeof f, string>> = {};
  if (!f.name.trim()) errors.name = 'Enter a name';
  if (!isEmail(f.email)) errors.email = 'Enter a valid email';
  if (f.phone.trim() && !isSaPhone(f.phone)) errors.phone = 'Enter a South African number';
  if (f.password.length < 8) errors.password = 'At least 8 characters';
  const server = save.error instanceof ApiError ? save.error.details : undefined;
  const show = (k: keyof typeof f) => (touched ? errors[k] : undefined) ?? server?.[k]?.[0];
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(s => ({ ...s, [k]: e.target.value }));
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!Object.keys(errors).length) save.mutate(undefined, { onSuccess: onClose }); };
  return (
    <form onSubmit={submit} noValidate className="card mb-5 space-y-4 p-5" aria-label="Add staff member">
      <div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">Add staff member</h2><button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl hover:bg-surface-2" aria-label="Close form"><X className="size-5" aria-hidden /></button></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="as-name" label="Full name" autoComplete="off" value={f.name} onChange={set('name')} error={show('name')} />
        <Field id="as-email" label="Email (sign-in)" type="email" autoComplete="off" value={f.email} onChange={set('email')} error={show('email')} />
        <Field id="as-phone" label="Phone (optional)" type="tel" value={f.phone} onChange={set('phone')} error={show('phone')} />
        <div>
          <label htmlFor="as-store" className="mb-1 block text-sm font-semibold">Store</label>
          <select id="as-store" className="field" value={f.storeId} onChange={set('storeId')}>{stores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}</select>
        </div>
        <Field id="as-password" label="First-time password" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} error={show('password')} hint="Share it privately. They choose their own password at first sign-in." />
      </div>
      {save.isError && !server && <p className="rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{save.error.message}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" busy={save.isPending}>Add staff member</Button></div>
    </form>
  );
}
