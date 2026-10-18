// Shown after signing in with a temporary password (reset by an admin, or a new staff account):
// the user picks their own password before doing anything else.
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { api } from '../lib/api';
import { Field } from './Field';
import { Button } from './ui';

export function ChooseNewPassword({ name }: { name: string }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [touched, setTouched] = useState(false);
  const change = useMutation({ mutationFn: () => api('/account/password', { method: 'POST', body: { current: f.current, next: f.next } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }) });
  const errors: Partial<Record<keyof typeof f, string>> = {};
  if (!f.current) errors.current = 'Enter the temporary password you were given';
  if (f.next.length < 8) errors.next = 'Use at least 8 characters';
  else if (f.next === f.current) errors.next = 'Choose a password different from the temporary one';
  if (f.confirm !== f.next) errors.confirm = "The passwords don't match";
  const show = (k: keyof typeof f) => (touched ? errors[k] : undefined);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { change.reset(); setF(s => ({ ...s, [k]: e.target.value })); };
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!Object.keys(errors).length) change.mutate(); };
  return (
    <div className="mx-auto max-w-md px-4 py-10 md:py-16">
      <KeyRound className="size-8 text-brand-text" aria-hidden />
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Choose your own password</h1>
      <p className="mt-1 text-ink-2">Hi {name.split(' ')[0]}, you signed in with a temporary password. Pick a new one to continue.</p>
      <form onSubmit={submit} noValidate className="card mt-6 space-y-4 p-6" aria-label="Choose a new password">
        <Field id="cnp-current" label="Temporary password" type="password" autoComplete="current-password" value={f.current} onChange={set('current')} error={show('current')} />
        <Field id="cnp-next" label="New password" type="password" autoComplete="new-password" value={f.next} onChange={set('next')} error={show('next')} hint="At least 8 characters" />
        <Field id="cnp-confirm" label="Repeat new password" type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} error={show('confirm')} />
        {change.isError && <p className="rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{change.error.message}</p>}
        <Button type="submit" size="lg" className="w-full" busy={change.isPending}>Save password and continue</Button>
      </form>
    </div>
  );
}
