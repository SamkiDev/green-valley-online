// Where Paystack sends the customer back. Nothing in this URL is trusted: the API asks Paystack directly.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { EmptyState, LinkButton } from '../components/ui';

type Verify = { status: 'PAID' | 'FAILED' | 'PENDING'; orderId: string };

export default function PaymentReturn() {
  const [params] = useSearchParams();
  const orderId = params.get('orderId') ?? '';
  const nav = useNavigate();
  const qc = useQueryClient();
  const [state, setState] = useState<'checking' | 'failed' | 'pending' | 'error'>('checking');
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (!orderId || started.current) return;
    started.current = true;
    (async () => {
      // Paystack can take a few seconds to settle; check up to 5 times.
      for (let i = 0; i < 5; i++) {
        try {
          const r = await api<Verify>(`/payments/${orderId}/verify`, { method: 'POST' });
          if (r.status === 'PAID') { qc.invalidateQueries(); nav(`/orders/${orderId}`, { replace: true }); return; }
          if (r.status === 'FAILED') { setState('failed'); return; }
        } catch (e) { setError((e as Error).message); setState('error'); return; }
        await new Promise(res => setTimeout(res, 2000));
      }
      setState('pending');
    })();
  }, [orderId, nav, qc]);

  if (!orderId) return <div className="container-page py-10"><EmptyState icon={XCircle} title="Missing order" action={<LinkButton to="/track">Track Order</LinkButton>}>This link is incomplete.</EmptyState></div>;
  return (
    <div className="container-page py-10">
      {state === 'checking' ? (
        <div className="card mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center" role="status">
          <Loader2 className="size-10 animate-spin text-brand-text" aria-hidden />
          <h1 className="text-xl font-extrabold">Confirming your payment…</h1>
          <p className="text-ink-2">Please keep this page open.</p>
        </div>
      ) : (
        <EmptyState icon={XCircle}
          title={state === 'failed' ? 'Payment not completed' : state === 'pending' ? 'Payment still processing' : "We couldn't confirm your payment"}
          action={<div className="flex flex-wrap justify-center gap-2"><LinkButton to={`/checkout/pay/${orderId}`}>Try again</LinkButton><LinkButton to={`/track/${orderId}`} variant="secondary">View order</LinkButton></div>}>
          {state === 'failed' ? 'Your payment was declined or cancelled. No money was taken for this attempt.'
            : state === 'pending' ? "Paystack hasn't confirmed it yet. Your order will update as soon as it does."
            : error}
        </EmptyState>
      )}
    </div>
  );
}
