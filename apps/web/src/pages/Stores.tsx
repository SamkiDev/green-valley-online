import { Link } from 'react-router';
import { ArrowRight, Clock } from 'lucide-react';
import { useStores } from '../lib/queries';
import { Badge, ErrorState, LinkButton, PageHeader, Skeleton } from '../components/ui';
import type { Store } from '../lib/api';

export function StoreCard({ s }: { s: Store }) {
  const active = s.status === 'ACTIVE';
  const accent = s.config.accent;
  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="flex h-2" aria-hidden>
        <span className="flex-[3]" style={{ background: accent?.primary }} />
        <span className="flex-1" style={{ background: accent?.secondary }} />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {active ? <Badge tone="ok">● Open · Online</Badge> : <Badge><Clock className="size-3" aria-hidden /> Coming soon</Badge>}
          {s.ageRestricted && <Badge tone="warn">{s.config.ageVerification?.minimumAge ?? 18}+ only</Badge>}
        </div>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight"><Link to={`/stores/${s.slug}`} className="hover:underline">{s.name}</Link></h2>
          <p className="text-sm font-semibold text-ink-3">{s.category}</p>
        </div>
        {s.description && <p className="text-ink-2">{s.description}</p>}
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {active ? (
            <LinkButton to="/shop" variant={s.slug === 'meat-market' ? 'meat' : 'primary'}>SHOP NOW <ArrowRight className="size-4" aria-hidden /></LinkButton>
          ) : (
            <span className="inline-flex min-h-11 items-center rounded-xl bg-surface-2 px-4 text-[0.95rem] font-semibold text-ink-2">Opening online soon</span>
          )}
          <LinkButton to={`/stores/${s.slug}`} variant="secondary">Store info</LinkButton>
        </div>
      </div>
    </article>
  );
}

export default function Stores() {
  const stores = useStores();
  return (
    <div className="container-page">
      <PageHeader eyebrow="Green Valley" title="Stores">Every store in the centre, one checkout. More stores are coming online soon.</PageHeader>
      {stores.isPending ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-60" />)}</div>
      ) : stores.isError ? <ErrorState message={stores.error.message} onRetry={() => stores.refetch()} /> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{stores.data.map(s => <StoreCard key={s.id} s={s} />)}</div>
      )}
    </div>
  );
}
