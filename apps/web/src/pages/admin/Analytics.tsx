// Single-series charts in the brand hue: no legend needed (the title names the series), thin bars with 4px rounded
// data-ends anchored to the baseline, 2px gaps, text in ink tokens, and a hover/focus tooltip on every bar.
// The top-products list doubles as the table view: every value is also printed as text.
import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { rand } from '../../lib/format';
import { DemoTag, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { AdminHeader } from './AdminLayout';
import { useAdmin, type Analytics as AnalyticsData } from './adminApi';

const RANGES = [7, 30, 90];

export function Analytics() {
  const [days, setDays] = useState(30);
  const q = useAdmin<AnalyticsData>(`/analytics?days=${days}`);
  return (
    <>
      <AdminHeader title="Analytics" actions={
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1" role="group" aria-label="Date range">
          {RANGES.map(r => <button key={r} type="button" aria-pressed={days === r} onClick={() => setDays(r)} className={`min-h-9 rounded-lg px-3 text-sm font-bold ${days === r ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'}`}>{r} days</button>)}
        </div>
      }>Paid orders only. <DemoTag>DEMO DATA</DemoTag></AdminHeader>
      {q.isPending ? <Skeleton className="h-80" /> : q.isError ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} /> : q.data.orders === 0 ? (
        <EmptyState icon={BarChart3} title="No paid orders in this period">Analytics appear once customers complete payment.</EmptyState>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[['Revenue', rand(q.data.revenue)], ['Paid orders', q.data.orders], ['Average order value', rand(q.data.averageOrderValue)]].map(([l, v]) => (
              <div key={l} className="card p-4"><dt className="text-sm font-semibold text-ink-2">{l}</dt><dd className="mt-1 text-2xl font-extrabold tabular-nums">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="card p-5" aria-labelledby="rev7"><h2 id="rev7" className="font-extrabold">Revenue, last 7 days</h2><DayBars data={q.data.last7Days} /></section>
            <section className="card p-5" aria-labelledby="top"><h2 id="top" className="font-extrabold">Top products by revenue</h2><TopProducts data={q.data.topProducts} /></section>
          </div>
        </>
      )}
    </>
  );
}

function DayBars({ data }: { data: AnalyticsData['last7Days'] }) {
  const max = Math.max(...data.map(d => d.revenue), 1);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="mt-4">
      <div className="relative flex h-48 items-end gap-0.5 border-b border-line" role="list" aria-label="Daily revenue">
        {[0.25, 0.5, 0.75].map(t => <span key={t} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line/60" style={{ bottom: `${t * 100}%` }} aria-hidden />)}
        {data.map((d, i) => {
          const label = new Date(d.date + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric' });
          return (
            <div key={d.date} role="listitem" tabIndex={0} aria-label={`${label}: ${rand(d.revenue)}`}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              className="relative flex h-full flex-1 cursor-default items-end justify-center px-1 outline-none sm:px-2">
              <div className={`w-full max-w-10 rounded-t-[4px] bg-brand transition-opacity ${hover !== null && hover !== i ? 'opacity-40' : ''}`} style={{ height: `${Math.max((d.revenue / max) * 100, d.revenue ? 2 : 0)}%` }} />
              {hover === i && (
                <span className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-panel px-2 py-1 text-xs font-semibold text-on-panel shadow-lg">{label} · {rand(d.revenue)}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-0.5 text-center text-xs text-ink-3" aria-hidden>
        {data.map(d => <span key={d.date} className="flex-1">{new Date(d.date + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'short' })}</span>)}
      </div>
    </div>
  );
}

function TopProducts({ data }: { data: AnalyticsData['topProducts'] }) {
  const max = Math.max(...data.map(d => d.revenue), 1);
  const [hover, setHover] = useState<string | null>(null);
  return (
    <ol className="mt-4 space-y-2.5">
      {data.map((p, i) => (
        <li key={p.productId} tabIndex={0} className="relative outline-none" onMouseEnter={() => setHover(p.productId)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p.productId)} onBlur={() => setHover(null)}
          aria-label={`${i + 1}. ${p.name}: ${rand(p.revenue)} from ${p.orders} orders`}>
          <div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate font-semibold">{p.name}</span><span className="shrink-0 tabular-nums text-ink-2">{rand(p.revenue)}</span></div>
          <div className="h-2.5 rounded-r-[4px] bg-surface-2"><div className={`h-full rounded-r-[4px] bg-brand transition-opacity ${hover && hover !== p.productId ? 'opacity-40' : ''}`} style={{ width: `${(p.revenue / max) * 100}%` }} /></div>
          {hover === p.productId && <span className="absolute -top-7 right-0 z-10 whitespace-nowrap rounded-lg bg-panel px-2 py-1 text-xs font-semibold text-on-panel shadow-lg">{p.orders} {p.orders === 1 ? 'order' : 'orders'} · {Number(p.quantity.toFixed(2))} sold</span>}
        </li>
      ))}
    </ol>
  );
}
