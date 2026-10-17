import { Check } from 'lucide-react';

export const CHECKOUT_STEPS = ['Your details', 'Delivery or collection', 'Address', 'Review', 'Payment'] as const;

export function CheckoutSteps({ current, skipped = [] }: { current: number; skipped?: number[] }) {
  return (
    <nav aria-label="Checkout progress" className="mb-6">
      <p className="mb-2 text-sm font-semibold text-ink-2 md:hidden">Step {current + 1} of {CHECKOUT_STEPS.length}: {CHECKOUT_STEPS[current]}</p>
      <ol className="flex gap-1.5 md:gap-2">
        {CHECKOUT_STEPS.map((label, i) => {
          const done = i < current, active = i === current, skip = skipped.includes(i);
          return (
            <li key={label} className="flex-1" aria-current={active ? 'step' : undefined}>
              <div className={`h-1.5 rounded-full ${done || active ? 'bg-brand' : 'bg-surface-2'} ${skip ? 'opacity-40' : ''}`} />
              <p className={`mt-2 hidden items-center gap-1 text-sm font-semibold md:flex ${active ? 'text-ink' : done ? 'text-brand-text' : 'text-ink-3'}`}>
                {done && <Check className="size-4" aria-hidden />}{label}{skip && <span className="font-normal"> (not needed)</span>}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
