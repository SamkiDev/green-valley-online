// Payment providers. The server never receives or stores card numbers: real gateways use their own hosted pages.
// Choose with PAYMENT_PROVIDER=demo|paystack. Add Payfast or Peach Payments by implementing PaymentProvider.
import crypto from 'node:crypto';

export type StartInput = { orderId: string; reference: string; amountCents: number; email: string; method: 'CARD' | 'EFT'; returnUrl: string };
export type StartResult =
  | { kind: 'done'; status: 'PAID' | 'FAILED' } // settled immediately (demo)
  | { kind: 'redirect'; url: string }; // customer pays on the provider's page, then returns
export type VerifyResult = { status: 'PAID' | 'FAILED' | 'PENDING'; amountCents?: number; currency?: string };

export interface PaymentProvider {
  name: string;
  mode: 'demo' | 'test' | 'live';
  start(i: StartInput): Promise<StartResult>;
  verify?(reference: string): Promise<VerifyResult>;
  /** Checks a webhook's signature against the raw request body. */
  webhookValid?(rawBody: Buffer, signature: string | undefined): boolean;
}

export const DemoProvider: PaymentProvider = {
  name: 'demo', mode: 'demo',
  async start() { return { kind: 'done', status: 'PAID' }; },
};

// ---- Paystack (https://paystack.com/docs/api/transaction) ----
function paystack(secret: string): PaymentProvider {
  const base = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co'; // overridable for tests
  const call = async (path: string, init?: RequestInit) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15_000);
    try {
      const r = await fetch(base + path, { ...init, signal: ctl.signal, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' } });
      const j: any = await r.json().catch(() => null);
      if (!r.ok || !j?.status) throw Object.assign(new Error(`Paystack: ${j?.message ?? r.status}`), { status: 502 });
      return j.data;
    } finally { clearTimeout(t); }
  };
  return {
    name: 'paystack', mode: secret.startsWith('sk_live_') ? 'live' : 'test',
    async start(i) {
      const data = await call('/transaction/initialize', { method: 'POST', body: JSON.stringify({
        email: i.email, amount: i.amountCents, currency: 'ZAR', reference: i.reference, callback_url: i.returnUrl,
        metadata: { orderId: i.orderId, preferredMethod: i.method },
      }) });
      return { kind: 'redirect', url: data.authorization_url };
    },
    async verify(reference) {
      const d = await call(`/transaction/verify/${encodeURIComponent(reference)}`);
      const status = d.status === 'success' ? 'PAID' : ['failed', 'abandoned', 'reversed'].includes(d.status) ? 'FAILED' : 'PENDING';
      return { status, amountCents: d.amount, currency: d.currency };
    },
    webhookValid(raw, signature) {
      if (!signature) return false;
      const expected = crypto.createHmac('sha512', secret).update(raw).digest('hex');
      return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    },
  };
}

function choose(): PaymentProvider {
  const which = (process.env.PAYMENT_PROVIDER || 'demo').toLowerCase();
  if (which === 'demo') return DemoProvider;
  if (which === 'paystack') {
    const key = process.env.PAYSTACK_SECRET_KEY ?? '';
    if (!/^sk_(test|live)_/.test(key)) throw new Error('PAYMENT_PROVIDER=paystack needs PAYSTACK_SECRET_KEY (sk_test_...) in .env');
    if (key.startsWith('sk_live_') && process.env.ALLOW_LIVE_PAYMENTS !== 'true') throw new Error('Refusing a live Paystack key: set ALLOW_LIVE_PAYMENTS=true only when you really mean to take money');
    return paystack(key);
  }
  throw new Error(`Unknown PAYMENT_PROVIDER "${which}"`);
}

export const provider: PaymentProvider = choose();
