// Age gate for age-restricted stores (e.g. Green Valley Bottle Liquors). Self-declared on the website;
// the order also needs a confirmation at checkout and the driver or store checks ID on handover.
// The minimum age and any messages come from the store's settings, not from code.
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import type { StoreConfig } from '../lib/api';
import { Button } from './ui';

const key = (slug: string) => `gv-age-ok-${slug}`;
const confirmed = (slug: string) => { try { return sessionStorage.getItem(key(slug)) === '1'; } catch { return false; } };

export function AgeGate({ slug, storeName, config, children }: { slug: string; storeName: string; config?: StoreConfig; children: ReactNode }) {
  const min = config?.ageVerification?.minimumAge ?? 18;
  const [ok, setOk] = useState(() => confirmed(slug));
  const [dob, setDob] = useState('');
  const [result, setResult] = useState<'under' | 'invalid' | null>(null);
  if (ok) return <>{children}</>;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const d = new Date(dob + 'T00:00:00'), now = new Date();
    if (!dob || isNaN(+d) || d > now || d.getFullYear() < 1900) { setResult('invalid'); return; }
    let age = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
    if (age < min) { setResult('under'); return; }
    try { sessionStorage.setItem(key(slug), '1'); } catch { /* ignore */ }
    setOk(true);
  };

  return (
    <div className="container-page py-10">
      <div className="card mx-auto max-w-md p-6 text-center" role="dialog" aria-labelledby="age-title" aria-modal="false">
        <ShieldAlert className="mx-auto size-10 text-warn-text" aria-hidden />
        <h1 id="age-title" className="mt-3 text-2xl font-extrabold">{storeName} is for ages {min}+</h1>
        {result === 'under' ? (
          <>
            <p className="mt-2 text-ink-2">Sorry, you need to be {min} or older to shop at {storeName}.</p>
            <Link to="/stores" className="mt-4 inline-block font-semibold text-brand-text hover:underline">Browse other stores</Link>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="mt-4 space-y-3 text-left">
            <label htmlFor="age-dob" className="block text-sm font-semibold">Your date of birth</label>
            <input id="age-dob" type="date" className="field" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={e => { setDob(e.target.value); setResult(null); }} aria-invalid={result === 'invalid'} aria-describedby="age-help" />
            <p id="age-help" className={`text-sm ${result === 'invalid' ? 'text-danger-text' : 'text-ink-3'}`}>{result === 'invalid' ? 'Enter a valid date of birth.' : 'We only use this to check your age. It is not saved.'}</p>
            <Button type="submit" size="lg" className="w-full">Continue</Button>
            <p className="text-center text-sm text-ink-3">ID is checked on delivery or collection.{config?.responsibleSaleMessage ? ` ${config.responsibleSaleMessage}` : ''}</p>
          </form>
        )}
      </div>
    </div>
  );
}
