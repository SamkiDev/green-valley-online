// Tells the team when a paid order comes in while the dashboard is open on any admin page:
// a pop-up, a flashing tab title (useful when the tab is in the background) and, if switched on, a short chime.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Bell, BellOff, X } from 'lucide-react';
import { load, save } from '../../lib/storage';
import { rand } from '../../lib/format';
import { useAdmin, type AdminOrder } from './adminApi';

const SOUND_KEY = 'gv-order-sound';

function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((hz, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = hz; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.start(t); o.stop(t + 0.32);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch { /* audio blocked or unsupported */ }
}

export function NewOrderAlerts() {
  // Keep checking while the tab is in the background: that is when the alert matters most.
  const orders = useAdmin<AdminOrder[]>('/orders', { refetchInterval: 20_000, refetchIntervalInBackground: true });
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<AdminOrder[]>([]);
  const [sound, setSound] = useState(() => load(SOUND_KEY, false));

  useEffect(() => {
    if (!orders.data) return;
    const paid = orders.data.filter(o => o.payment?.status === 'PAID'); // paid orders move straight on to PREPARING
    if (seen.current === null) { seen.current = new Set(paid.map(o => o.id)); return; } // first load: no alert for what is already there
    const added = paid.filter(o => !seen.current!.has(o.id));
    paid.forEach(o => seen.current!.add(o.id));
    if (!added.length) return;
    setFresh(f => [...added, ...f].slice(0, 5));
    if (sound) chime();
  }, [orders.data, sound]);

  // Flash the tab title until the alert is dismissed.
  useEffect(() => {
    if (!fresh.length) return;
    const original = document.title;
    const label = `(${fresh.length}) New order`;
    let on = false;
    const timer = setInterval(() => { on = !on; document.title = on ? label : original; }, 1200);
    return () => { clearInterval(timer); document.title = original; };
  }, [fresh.length]);

  const toggleSound = () => { const next = !sound; setSound(next); save(SOUND_KEY, next); if (next) chime(); };

  return (
    <>
      <button type="button" onClick={toggleSound} aria-pressed={sound}
        className="mt-2 hidden min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink lg:flex">
        {sound ? <Bell className="size-5" aria-hidden /> : <BellOff className="size-5" aria-hidden />}
        {sound ? 'Order chime on' : 'Order chime off'}
      </button>
      <div className="fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-96" aria-live="polite">
        {fresh.map(o => (
          <div key={o.id} role="status" className="card flex w-full items-start gap-3 border-brand p-4 shadow-lg">
            <Bell className="mt-0.5 size-5 shrink-0 text-brand-text" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">New paid order #{o.orderNumber}</p>
              <p className="text-sm text-ink-2">{o.contactName ?? 'Customer'} · {o.fulfilment === 'DELIVERY' ? `Delivery to ${o.area ?? '—'}` : 'Collection'} · {rand(o.total)}</p>
              <Link to="/admin/orders" onClick={() => setFresh([])} className="mt-1 inline-block text-sm font-semibold text-brand-text underline">Open orders</Link>
            </div>
            <button type="button" onClick={() => setFresh(f => f.filter(x => x.id !== o.id))} className="grid size-10 shrink-0 place-items-center rounded-xl hover:bg-surface-2" aria-label={`Dismiss alert for order ${o.orderNumber}`}><X className="size-5" aria-hidden /></button>
          </div>
        ))}
      </div>
    </>
  );
}
