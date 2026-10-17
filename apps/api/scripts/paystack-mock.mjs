// Tests the Paystack integration without a Paystack account: a mock Paystack API on :4999 and a second API
// instance on :4001 configured with PAYMENT_PROVIDER=paystack. Needs the database running. Run: npm run test:paystack
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const SECRET = 'sk_test_mock_only';
const API = 'http://localhost:4001/api';
let pass = 0, failN = 0;
const ok = (c, label, extra = '') => { c ? pass++ : failN++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  -> ' + extra : ''}`); };

// ---- mock Paystack ----
const tx = new Map(); // reference -> { amount, currency, status }
let overrideAmount = null;
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c)).on('end', () => {
    const send = (code, j) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (req.headers.authorization !== `Bearer ${SECRET}`) return send(401, { status: false, message: 'Invalid key' });
    if (req.method === 'POST' && req.url === '/transaction/initialize') {
      const b = JSON.parse(body);
      tx.set(b.reference, { amount: b.amount, currency: b.currency, status: 'pending', callback: b.callback_url });
      return send(200, { status: true, data: { authorization_url: `https://checkout.paystack.test/${b.reference}`, reference: b.reference } });
    }
    const m = req.url.match(/^\/transaction\/verify\/(.+)$/);
    if (req.method === 'GET' && m) {
      const t = tx.get(decodeURIComponent(m[1])); if (!t) return send(404, { status: false, message: 'Not found' });
      return send(200, { status: true, data: { status: t.status, amount: overrideAmount ?? t.amount, currency: t.currency } });
    }
    send(404, { status: false, message: 'Unknown route' });
  });
}).listen(4999);

// ---- API instance using Paystack ----
const startApi = (key) => spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
  env: { ...process.env, PORT: '4001', PAYMENT_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: key, PAYSTACK_BASE_URL: 'http://localhost:4999', ALLOW_LIVE_PAYMENTS: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const live = startApi('sk_live_should_be_refused');
let liveErr = ''; live.stderr.on('data', d => (liveErr += d));
const liveCode = await new Promise(r => live.on('exit', r));
ok(liveCode !== 0 && /Refusing a live Paystack key/.test(liveErr), 'live keys are refused unless explicitly allowed');

const api = startApi(SECRET);
let apiOut = ''; api.stdout.on('data', d => (apiOut += d)); api.stderr.on('data', d => (apiOut += d));
for (let i = 0; i < 60 && !/API on :4001/.test(apiOut); i++) await new Promise(r => setTimeout(r, 500));

try {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { s: r.status, j: await r.json().catch(() => null) };
  };
  ok((await call('GET', '/payments/config')).j?.mode === 'test', 'provider reports Paystack test mode');
  await call('POST', '/auth/register', { email: `paystack-${Date.now()}@demo.local`, password: 'test-password-1', name: 'Paystack Tester' });
  const store = (await call('GET', '/stores/meat-market')).j;
  const prod = (await call('GET', '/products?q=braai%20pack')).j.find(p => p.name === 'Braai Pack');
  const order = async () => (await call('POST', '/orders', { storeSlug: 'meat-market', fulfilment: 'DELIVERY', zoneId: store.zones[0].id,
    address: { street: '1 Test Road', area: 'Test Area', city: 'Johannesburg', province: 'Gauteng', postalCode: '2000' },
    contact: { firstName: 'Pay', lastName: 'Tester', phone: '082 000 0000', email: 'pay-tester@demo.local' }, items: [{ productId: prod.id, quantity: 1 }] })).j;

  // 1. Happy path: redirect, customer pays, return page verifies.
  const o1 = await order();
  let r = await call('POST', `/payments/${o1.id}/pay`, { method: 'CARD' });
  ok(r.s === 200 && r.j.status === 'PENDING' && r.j.redirectUrl?.startsWith('https://checkout.paystack.test/'), 'pay returns a Paystack checkout link', r.j?.redirectUrl);
  const ref1 = r.j.redirectUrl.split('/').pop();
  ok(tx.get(ref1)?.amount === Math.round(Number(o1.total) * 100) && tx.get(ref1)?.currency === 'ZAR', 'amount sent in cents, in rand', `${tx.get(ref1)?.amount} ${tx.get(ref1)?.currency}`);
  r = await call('POST', `/payments/${o1.id}/verify`);
  ok(r.j?.status === 'PENDING', 'not paid until Paystack confirms');
  tx.get(ref1).status = 'success';
  r = await call('POST', `/payments/${o1.id}/verify`);
  const t1 = (await call('GET', `/orders/${o1.id}/tracking`)).j;
  ok(r.j?.status === 'PAID' && t1.payment === 'PAID' && t1.current === 'PREPARING', 'verified payment confirms the order');
  ok((await call('POST', `/payments/${o1.id}/verify`)).j?.status === 'PAID', 'verifying again is harmless');

  // 2. Amount mismatch is refused.
  const o2 = await order();
  r = await call('POST', `/payments/${o2.id}/pay`, { method: 'CARD' });
  const ref2 = r.j.redirectUrl.split('/').pop(); tx.get(ref2).status = 'success'; overrideAmount = 100;
  r = await call('POST', `/payments/${o2.id}/verify`); overrideAmount = null;
  ok(r.j?.status === 'FAILED' && (await call('GET', `/orders/${o2.id}`)).j.status === 'PLACED', 'a payment for the wrong amount is rejected');

  // 3. Webhook: signed with the secret key over the raw body.
  const o3 = await order();
  r = await call('POST', `/payments/${o3.id}/pay`, { method: 'EFT' });
  const ref3 = r.j.redirectUrl.split('/').pop();
  const evt = JSON.stringify({ event: 'charge.success', data: { reference: ref3, amount: tx.get(ref3).amount, currency: 'ZAR' } });
  r = await call('POST', '/payments/webhooks/paystack', evt, { 'x-paystack-signature': 'bad' });
  ok(r.s === 401, 'webhook with a bad signature is rejected');
  r = await call('POST', '/payments/webhooks/paystack', evt, { 'x-paystack-signature': crypto.createHmac('sha512', SECRET).update(evt).digest('hex') });
  ok(r.s === 200 && (await call('GET', `/orders/${o3.id}`)).j.payment.status === 'PAID', 'signed webhook confirms the payment');
} finally {
  api.kill(); mock.close();
}
console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
