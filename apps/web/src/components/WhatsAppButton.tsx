// Uses the store's configured WhatsApp number. Until an admin sets one, the button says so instead of linking anywhere.
import { MessageCircle } from 'lucide-react';
import { btn } from './ui';

export function WhatsAppButton({ number, label = 'Chat with Green Valley', message, className = '' }: { number?: string; label?: string; message?: string; className?: string }) {
  const digits = (number ?? '').replace(/\D/g, '');
  if (!digits) {
    return (
      <span className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 text-sm font-semibold text-ink-3 ${className}`}>
        <MessageCircle className="size-4" aria-hidden /> WhatsApp number not set up yet
      </span>
    );
  }
  const href = `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={btn('secondary', 'md', className)}>
      <MessageCircle className="size-4" aria-hidden /> {label}
    </a>
  );
}
