import type { InputHTMLAttributes } from 'react';

// Labelled input with inline validation. `id` must be unique on the page and contain no spaces.
export function Field({ id, label, error, hint, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string; hint?: string }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">{label}</label>
      <input id={id} className="field" aria-invalid={!!error} aria-describedby={describedBy} {...rest} />
      {error ? <p id={`${id}-error`} className="mt-1 text-sm text-danger-text">{error}</p>
        : hint ? <p id={`${id}-hint`} className="mt-1 text-sm text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function TextArea({ id, label, error, className = '', ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { id: string; label: string; error?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">{label}</label>
      <textarea id={id} className="field min-h-24" aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} {...rest} />
      {error && <p id={`${id}-error`} className="mt-1 text-sm text-danger-text">{error}</p>}
    </div>
  );
}
