// Live map of the driver's last shared position (OpenStreetMap tiles via Leaflet).
// Only rendered while the order is on the road; the API stops sending a position after delivery.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import type { DriverLocation } from '../lib/api';

const pin = L.divIcon({
  className: '',
  html: '<span style="display:grid;place-items:center;width:34px;height:34px;border-radius:9999px;background:#166534;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.35);color:#fff;font:700 13px/1 sans-serif">GV</span>',
  iconSize: [34, 34], iconAnchor: [17, 17],
});

function minutesAgo(iso: string) {
  const m = Math.round((Date.now() - +new Date(iso)) / 60_000);
  return m <= 0 ? 'just now' : m === 1 ? '1 minute ago' : `${m} minutes ago`;
}

export function DriverMap({ location }: { location: NonNullable<DriverLocation> }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const circle = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([location.lat, location.lng], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map.current);
    return () => { map.current?.remove(); map.current = null; marker.current = null; circle.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map.current) return;
    const ll: L.LatLngExpression = [location.lat, location.lng];
    if (!marker.current) marker.current = L.marker(ll, { icon: pin, title: 'Your driver', keyboard: false }).addTo(map.current);
    else marker.current.setLatLng(ll);
    if (location.accuracy && location.accuracy < 500) {
      if (!circle.current) circle.current = L.circle(ll, { radius: location.accuracy, color: '#166534', weight: 1, fillOpacity: 0.12 }).addTo(map.current);
      else circle.current.setLatLng(ll).setRadius(location.accuracy);
    }
    map.current.panTo(ll, { animate: true });
  }, [location.lat, location.lng, location.accuracy]);

  return (
    <section className="card overflow-hidden" aria-labelledby="map-h">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h2 id="map-h" className="flex items-center gap-2 font-extrabold"><MapPin className="size-5 text-brand-text" aria-hidden /> Your driver</h2>
        <p className={`text-sm ${location.stale ? 'font-semibold text-warn-text' : 'text-ink-3'}`}>Location updated {minutesAgo(location.at)}{location.stale ? ' · may be out of date' : ''}</p>
      </div>
      <div ref={el} className="h-64 w-full bg-surface-2 md:h-80" role="img" aria-label={`Map showing your driver's last known position, updated ${minutesAgo(location.at)}`} />
    </section>
  );
}
