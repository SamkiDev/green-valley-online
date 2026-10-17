// Weight-based products pick 0.5 / 1 / 1.5 / 2 kg or a custom weight; other products use a +/- stepper.
import { Minus, Plus } from 'lucide-react';
import { useId, useState } from 'react';

export const WEIGHTS = [0.5, 1, 1.5, 2];
export const MIN_KG = 0.25;

// A usable custom weight, or 0 meaning "no valid weight chosen" (the parent disables Add to Cart).
function parseValid(raw: string, max: number) {
  const n = Number(raw.replace(',', '.'));
  return raw.trim() && Number.isFinite(n) && n >= MIN_KG && n <= max && Math.abs(n * 100 - Math.round(n * 100)) <= 1e-6 ? n : 0;
}

export function Stepper({ value, onChange, max, label }: { value: number; onChange: (n: number) => void; max: number; label: string }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-surface" role="group" aria-label={label}>
      <button type="button" className="grid size-11 place-items-center rounded-l-xl hover:bg-surface-2 disabled:opacity-40" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Decrease quantity"><Minus className="size-4" aria-hidden /></button>
      <span className="min-w-10 text-center font-bold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" className="grid size-11 place-items-center rounded-r-xl hover:bg-surface-2 disabled:opacity-40" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Increase quantity"><Plus className="size-4" aria-hidden /></button>
    </div>
  );
}

export function WeightPicker({ value, onChange, max }: { value: number; onChange: (kg: number) => void; max: number }) {
  const id = useId();
  const preset = WEIGHTS.includes(value);
  const [custom, setCustom] = useState(preset ? '' : String(value));
  const [customOpen, setCustomOpen] = useState(!preset);
  const customNum = Number(custom.replace(',', '.'));
  const customError = customOpen && custom !== ''
    ? !Number.isFinite(customNum) || customNum < MIN_KG ? `Minimum ${MIN_KG} kg`
      : customNum > max ? `Only ${max} kg available`
      : Math.abs(customNum * 100 - Math.round(customNum * 100)) > 1e-6 ? 'Use up to 2 decimals' : null
    : null;

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">Weight</legend>
      <div className="flex flex-wrap gap-2">
        {WEIGHTS.map(w => {
          const active = !customOpen && value === w;
          return (
            <button key={w} type="button" disabled={w > max} aria-pressed={active}
              onClick={() => { setCustomOpen(false); onChange(w); }}
              className={`min-h-11 min-w-16 rounded-xl border px-3 font-semibold transition disabled:opacity-40 ${active ? 'border-brand bg-brand-soft text-brand-text' : 'border-line bg-surface hover:border-ink-3'}`}>
              {w} kg
            </button>
          );
        })}
        <button type="button" aria-pressed={customOpen} onClick={() => { setCustomOpen(true); onChange(parseValid(custom, max)); }}
          className={`min-h-11 rounded-xl border px-3 font-semibold transition ${customOpen ? 'border-brand bg-brand-soft text-brand-text' : 'border-line bg-surface hover:border-ink-3'}`}>
          Custom
        </button>
      </div>
      {customOpen && (
        <div className="mt-3">
          <label htmlFor={id} className="mb-1 block text-sm text-ink-2">Custom weight (kg)</label>
          <div className="flex items-center gap-2">
            <input id={id} inputMode="decimal" className="field max-w-40" placeholder="e.g. 2.5" value={custom} aria-invalid={!!customError} aria-describedby={customError ? id + '-err' : undefined}
              onChange={e => { setCustom(e.target.value); onChange(parseValid(e.target.value, max)); }} />
            <span className="text-ink-3">kg</span>
          </div>
          {customError && <p id={id + '-err'} className="mt-1 text-sm text-danger-text">{customError}</p>}
        </div>
      )}
    </fieldset>
  );
}
