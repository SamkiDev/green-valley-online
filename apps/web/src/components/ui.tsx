import { Link, type LinkProps } from 'react-router';
import { AlertTriangle, Loader2, RotateCcw, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { type StockState } from '../lib/api';

type Variant = 'primary' | 'meat' | 'secondary' | 'ghost' | 'onPanel';
type Size = 'sm' | 'md' | 'lg';
const base = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold tracking-tight transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:brightness-110',
  meat: 'bg-meat text-on-meat hover:brightness-110',
  secondary: 'bg-surface text-ink border border-line hover:border-ink-3',
  ghost: 'text-ink hover:bg-surface-2',
  onPanel: 'bg-transparent text-on-panel border border-white/30 hover:border-white/70',
};
const sizes: Record<Size, string> = { sm: 'min-h-9 px-3 text-sm', md: 'min-h-11 px-4 text-[0.95rem]', lg: 'min-h-12 px-5 text-base' };
export const btn = (v: Variant = 'primary', s: Size = 'md', extra = '') => `${base} ${variants[v]} ${sizes[s]} ${extra}`;

export function Button({ variant = 'primary', size = 'md', className = '', busy, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean }) {
  return (
    <button className={btn(variant, size, className)} disabled={busy || rest.disabled} aria-busy={busy || undefined} {...rest}>
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
export function LinkButton({ variant = 'primary', size = 'md', className = '', ...rest }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={btn(variant, size, className)} {...rest} />;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-ink-3">
      <Loader2 className="size-5 animate-spin" aria-hidden /> <span className="text-sm">{label}…</span>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}

export function ErrorState({ message, onRetry, compact }: { message: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <div role="alert" className={`card flex flex-col items-center text-center ${compact ? 'gap-2 p-4' : 'gap-3 p-8'}`}>
      <AlertTriangle className="size-6 text-danger-text" aria-hidden />
      <p className="max-w-md text-ink-2">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}><RotateCcw className="size-4" aria-hidden /> Try again</Button>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-ink-2"><Icon className="size-6" aria-hidden /></span>
      <h3 className="text-lg font-bold">{title}</h3>
      {children && <div className="max-w-md text-ink-2">{children}</div>}
      {action}
    </div>
  );
}

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'brand' | 'meat' | 'meatSolid' | 'okSolid' | 'warnSolid' | 'onPanel';
export function Badge({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-surface-2 text-ink-2', ok: 'bg-ok-bg text-ok-text', warn: 'bg-warn-bg text-warn-text',
    danger: 'bg-danger-bg text-danger-text', brand: 'bg-brand-soft text-brand-text', meat: 'bg-meat-soft text-meat-text',
    // Solid tones for use on the dark feature panels
    meatSolid: 'bg-meat text-on-meat', okSolid: 'bg-emerald-400 text-emerald-950', warnSolid: 'bg-amber-300 text-amber-950', onPanel: 'bg-white/10 text-on-panel-2',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}>{children}</span>;
}

export function StockBadge({ state }: { state: StockState }) {
  if (state === 'OUT_OF_STOCK') return <Badge tone="danger">Out of stock</Badge>;
  if (state === 'LOW_STOCK') return <Badge tone="warn">Low stock</Badge>;
  return <Badge tone="ok">In stock</Badge>;
}

export function DemoTag({ children = 'DEMO' }: { children?: ReactNode }) {
  return <span className="rounded-md border border-dashed border-ink-3 px-1.5 py-px text-[0.65rem] font-bold tracking-wider text-ink-2">{children}</span>;
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="pb-6 pt-6 md:pt-10">
      {eyebrow && <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-brand-text">{eyebrow}</p>}
      <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{title}</h1>
      {children && <div className="mt-2 max-w-2xl text-ink-2">{children}</div>}
    </header>
  );
}
