// Shares the driver's phone location while a delivery is on the road (out for delivery or arrived).
// Stops automatically when nothing is on the road. The driver can pause it at any time.
import { useEffect, useRef, useState } from 'react';
import { LocateFixed, LocateOff } from 'lucide-react';
import { api } from '../../lib/api';
import { time } from '../../lib/format';
import { Button } from '../../components/ui';

type Status = 'idle' | 'waiting' | 'sharing' | 'paused' | 'denied' | 'unavailable' | 'insecure' | 'unsupported';
const PREF = 'gv-driver-share-location';
const MIN_GAP_MS = 15_000;

export function LocationSharing({ deliveryIds }: { deliveryIds: string[] }) {
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; } });
  const [status, setStatus] = useState<Status>('idle');
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const lastSentRef = useRef(0);
  const key = deliveryIds.join(',');

  useEffect(() => {
    if (!key) { setStatus('idle'); return; }
    if (!enabled) { setStatus('paused'); return; }
    if (!window.isSecureContext) { setStatus('insecure'); return; }
    if (!('geolocation' in navigator)) { setStatus('unsupported'); return; }
    setStatus('waiting');
    const ids = key.split(',');
    const watch = navigator.geolocation.watchPosition(
      pos => {
        setStatus('sharing');
        if (Date.now() - lastSentRef.current < MIN_GAP_MS) return;
        lastSentRef.current = Date.now();
        const body = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) };
        Promise.all(ids.map(id => api(`/deliveries/${id}/location`, { method: 'POST', body }).catch(() => null))).then(() => setLastSent(new Date()));
      },
      err => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [key, enabled]);

  if (!key) return null;
  const toggle = () => { const next = !enabled; setEnabled(next); try { localStorage.setItem(PREF, next ? 'on' : 'off'); } catch { /* ignore */ } };
  const message: Record<Status, string> = {
    idle: '', waiting: 'Finding your location…',
    sharing: `Your customer can see your position on their tracking page${lastSent ? ` · last sent ${time(lastSent.toISOString())}` : ''}.`,
    paused: 'Paused. Customers see the step updates only.',
    denied: 'Location is blocked for this site. Allow location in your browser settings to share it.',
    unavailable: "Can't get a GPS fix right now. It will keep trying.",
    insecure: 'Location sharing needs a secure (https) connection.',
    unsupported: "This browser can't share location.",
  };
  const on = status === 'sharing' || status === 'waiting';
  return (
    <div className={`card flex flex-wrap items-center justify-between gap-3 p-4 ${on ? 'border-brand' : ''}`} role="status">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${on ? 'bg-brand-soft text-brand-text' : 'bg-surface-2 text-ink-3'}`}>{on ? <LocateFixed className="size-5" aria-hidden /> : <LocateOff className="size-5" aria-hidden />}</span>
        <div className="min-w-0"><p className="font-bold">Live location {on ? 'on' : 'off'}</p><p className="text-sm text-ink-2">{message[status]}</p></div>
      </div>
      <Button size="sm" variant="secondary" onClick={toggle}>{enabled ? 'Pause sharing' : 'Share my location'}</Button>
    </div>
  );
}
