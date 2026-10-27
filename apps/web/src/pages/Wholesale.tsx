import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Truck } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useStore } from '../lib/queries';
import { Button, PageHeader } from '../components/ui';
import { Field, TextArea } from '../components/Field';
import { WhatsAppButton } from '../components/WhatsAppButton';

const EMPTY = { name: '', business: '', phone: '', email: '', products: '', quantity: '', preferredDate: '', notes: '' };
type Form = typeof EMPTY;

export default function Wholesale() {
  const [f, setF] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState(false);
  const store = useStore('meat-market');
  const send = useMutation({
    mutationFn: (b: Form) => api('/wholesale', { method: 'POST', body: { ...b, preferredDate: b.preferredDate || undefined, notes: b.notes || undefined } }),
  });

  const errors: Partial<Record<keyof Form, string>> = {};
  if (!f.name.trim()) errors.name = 'Please enter your name';
  if (!/^[+\d][\d\s-]{8,18}$/.test(f.phone.trim())) errors.phone = 'Enter a valid phone number';
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) errors.email = 'Enter a valid email address';
  if (!f.products.trim()) errors.products = 'Tell us which products you need';
  if (!f.quantity.trim()) errors.quantity = 'Give an estimated quantity';
  const serverErrors = send.error instanceof ApiError ? send.error.details : undefined;
  const show = (k: keyof Form) => (touched ? errors[k] : undefined) ?? serverErrors?.[k]?.[0];
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(s => ({ ...s, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault(); setTouched(true);
    if (Object.keys(errors).length) { document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return; }
    send.mutate(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])) as Form);
  };

  if (send.isSuccess) return (
    <div className="container-page py-10">
      <div className="card mx-auto flex max-w-lg flex-col items-center gap-3 p-8 text-center">
        <CheckCircle2 className="size-12 text-ok-text" aria-hidden />
        <h1 className="text-2xl font-extrabold">Quote request received</h1>
        <p className="text-ink-2">Thanks, {f.name.split(' ')[0]}. The Meat Market team will contact you at {f.email} or {f.phone} with a quote.</p>
        <Button variant="secondary" onClick={() => { setF(EMPTY); setTouched(false); send.reset(); }}>Send another request</Button>
      </div>
    </div>
  );

  return (
    <div className="container-page">
      <PageHeader eyebrow="Green Valley Meat Market" title="Bulk & Wholesale">Buying for a restaurant, event, business or large gathering? Tell us what you need and we'll send you a quote.</PageHeader>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <form onSubmit={submit} noValidate className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6" aria-label="Request a quote">
          <Field id="ws-name" label="Name" autoComplete="name" value={f.name} onChange={set('name')} error={show('name')} />
          <Field id="ws-business" label="Business name (optional)" autoComplete="organization" value={f.business} onChange={set('business')} error={show('business')} />
          <Field id="ws-phone" label="Phone" type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} error={show('phone')} />
          <Field id="ws-email" label="Email" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set('email')} error={show('email')} />
          <TextArea id="ws-products" label="Products required" className="sm:col-span-2" maxLength={500} placeholder="e.g. Boerewors, chicken wings, beef short ribs" value={f.products} onChange={set('products')} error={show('products')} />
          <Field id="ws-quantity" label="Estimated quantity" maxLength={100} placeholder="e.g. 20 kg of each" value={f.quantity} onChange={set('quantity')} error={show('quantity')} />
          <Field id="ws-date" label="Preferred date (optional)" type="date" min={new Date().toISOString().slice(0, 10)} value={f.preferredDate} onChange={set('preferredDate')} error={show('preferredDate')} />
          <TextArea id="ws-notes" label="Notes (optional)" className="sm:col-span-2" maxLength={500} value={f.notes} onChange={set('notes')} error={show('notes')} />
          {send.isError && !serverErrors && <p className="rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text sm:col-span-2" role="alert">{send.error.message}</p>}
          <Button type="submit" size="lg" variant="meat" className="sm:col-span-2" busy={send.isPending}>Request a quote</Button>
        </form>
        <aside className="card space-y-3 p-5">
          <span className="grid size-11 place-items-center rounded-xl bg-meat text-on-meat"><Truck className="size-5" aria-hidden /></span>
          <h2 className="text-lg font-extrabold">Prefer to chat?</h2>
          <p className="text-ink-2">Send us a message about your order size and dates.</p>
          <WhatsAppButton number={store.data?.config.whatsapp} label="Need help?" message="Hi Green Valley, I'd like a bulk quote." className="w-full" />
        </aside>
      </div>
    </div>
  );
}
