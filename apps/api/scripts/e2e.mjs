// Stage 1 end-to-end check against a running API. Run on a freshly reset demo DB: npm run db:reset, npm run dev, npm run test:e2e
const BASE = process.env.API_BASE || "http://localhost:4000/api";
let pass = 0, failN = 0;
const ok = (cond, label, extra = '') => { cond ? pass++ : failN++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  -> ' + extra : ''}`); };

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let j = null; try { j = await r.json(); } catch {}
    return { s: r.status, j };
  };
}

const anon = client(), cust = client(), drv = client(), admin = client();

let r = await anon('GET', '/stores');
ok(r.s === 200 && r.j.length === 4, 'GET /stores returns 4 stores', r.j?.map(s => `${s.name} [${s.status}]`).join(', '));
r = await anon('GET', '/stores/meat-market');
ok(r.s === 200 && r.j.zones.length === 3, 'GET /stores/meat-market with 3 zones', r.j?.zones?.map(z => `${z.name} R${z.fee}`).join('; '));
const zone1 = r.j.zones.find(z => z.name.startsWith('Zone 1'));

r = await anon('GET', '/products?q=braai');
ok(r.s === 200 && r.j.length > 0, 'search "braai"', r.j?.map(p => p.name).join(', '));
r = await anon('GET', '/products?max=300&inStock=1');
ok(r.s === 200 && r.j.every(p => Number(p.price) <= 300 && Number(p.inventory.quantity) > 0), 'filter under R300, in stock', `${r.j?.length} products`);
const all = (await anon('GET', '/products')).j;
const P = n => all.find(p => p.name === n);
r = await anon('GET', '/products/' + P('Beef Short Ribs').id);
ok(r.s === 200 && r.j.soldByWeight && Number(r.j.price) === 109.99, 'GET product detail (Beef Short Ribs R109.99/kg)');

r = await anon('POST', '/orders', { storeSlug: 'meat-market', fulfilment: 'COLLECTION', items: [{ productId: P('Braai Pack').id, quantity: 1 }] });
ok(r.s === 401, 'orders require login (401)');

const email = `e2e-${Date.now()}@demo.local`;
r = await cust('POST', '/auth/register', { email, password: 'test-password-1', name: 'E2E Demo Customer', phone: '0110000000' });
ok(r.s === 201 && r.j.role === 'CUSTOMER', 'register customer');
r = await cust('POST', '/auth/register', { email, password: 'test-password-1', name: 'Dup' });
ok(r.s === 409, 'duplicate registration rejected (409)');
r = await cust('POST', '/auth/register', { email: 'bad', password: 'x', name: '' });
ok(r.s === 400 && r.j.details, 'invalid registration -> 400 with field errors', Object.keys(r.j?.details || {}).join(','));
r = await cust('GET', '/auth/me');
ok(r.s === 200 && r.j?.role === 'CUSTOMER', '/auth/me returns session user');

const address = { street: '12 Demo Street', area: 'Demo Area', city: 'Johannesburg', province: 'Gauteng', postalCode: '2000' };
const contact = { firstName: 'E2E', lastName: 'Customer', phone: '011 000 0000', email: 'e2e-contact@demo.local' };
r = await cust('POST', '/orders', { storeSlug: 'meat-market', fulfilment: 'DELIVERY', zoneId: zone1.id, address: { ...address, postalCode: '20' }, contact: { ...contact, phone: '12345' }, items: [{ productId: P('Braai Pack').id, quantity: 1 }] });
ok(r.s === 400 && r.j.details?.contact && r.j.details?.address, 'bad phone and postal code rejected', Object.keys(r.j?.details || {}).join(','));
r = await cust('POST', '/orders', { storeSlug: 'meat-market', fulfilment: 'COLLECTION', items: [{ productId: P('Braai Pack').id, quantity: 1 }] });
ok(r.s === 400, 'order without contact details rejected');
r = await cust('POST', '/orders', { storeSlug: 'meat-market', fulfilment: 'DELIVERY', zoneId: zone1.id, address, contact, items: [{ productId: P('Braai Pack').id, quantity: 1.5 }] });
ok(r.s === 400, 'fractional qty for per-item product rejected', r.j?.error);
r = await cust('POST', '/orders', { storeSlug: 'meat-market', fulfilment: 'DELIVERY', zoneId: zone1.id, address, contact, items: [{ productId: P('T-Bone Steak').id, quantity: 1 }] });
ok(r.s === 409, 'out-of-stock product rejected (409)', r.j?.error);
r = await cust('POST', '/orders', { storeSlug: 'meat-market', fulfilment: 'DELIVERY', address, contact, items: [{ productId: P('Braai Pack').id, quantity: 1 }] });
ok(r.s === 400, 'delivery without zone rejected', r.j?.error);

const stockBefore = Number((await anon('GET', '/products/' + P('Boerewors').id)).j.inventory.quantity);
r = await cust('POST', '/orders', { storeSlug: 'meat-market', fulfilment: 'DELIVERY', zoneId: zone1.id, address, contact, subtotal: 1, total: 1, // client totals must be ignored
  items: [{ productId: P('Family Braai Pack').id, quantity: 1 }, { productId: P('Boerewors').id, quantity: 1.5 }, { productId: P('Chicken Wings').id, quantity: 1 }] });
const expectSub = 749.97; // 549.99 + 134.99 (1.5 kg x 89.99 = 134.985, half-up) + 64.99
ok(r.s === 201 && Number(r.j.subtotal) === expectSub && Number(r.j.deliveryFee) === 40 && Number(r.j.total) === Math.round((expectSub + 40) * 100) / 100,
  'order created with server-computed totals', `${r.j?.orderNumber} subtotal R${r.j?.subtotal} fee R${r.j?.deliveryFee} total R${r.j?.total}`);
const order = r.j;
const stockAfter = Number((await anon('GET', '/products/' + P('Boerewors').id)).j.inventory.quantity);
ok(Math.abs(stockBefore - 1.5 - stockAfter) < 1e-9, 'stock decremented (Boerewors kg)', `${stockBefore} -> ${stockAfter}`);

r = await cust('POST', `/payments/${order.id}/pay`, { method: 'CARD', cardNumber: '4111111111111111' });
ok(r.s === 200 && r.j.status === 'PAID' && r.j.demo === true, 'demo payment succeeds (card fields ignored)', `${r.j?.paymentId} ${r.j?.providerRef} ${r.j?.orderNumber}`);
r = await cust('POST', `/payments/${order.id}/pay`, { method: 'CARD' });
ok(r.s === 409, 'second payment rejected (409)');

r = await cust('GET', `/orders/${order.id}`);
ok(r.s === 200 && r.j.payment.status === 'PAID' && r.j.estimatedWindow, 'order detail for confirmation page', `status ${r.j?.status}, window ${r.j?.estimatedWindow?.from} - ${r.j?.estimatedWindow?.to}`);

const track = async () => (await cust('GET', `/orders/${order.id}/tracking`)).j;
let t = await track();
ok(t.current === 'PREPARING' && t.steps.length === 8, 'tracking after payment: PREPARING', t.steps.map(s => `${s.label}${s.at ? ' ✓' : ''}`).join(' | '));

ok((await cust('GET', '/deliveries/mine')).s === 403, 'customer cannot use driver routes (403)');
ok((await cust('GET', '/admin/stats')).s === 403, 'customer cannot use admin routes (403)');

r = await drv('POST', '/auth/login', { email: 'driver1@demo.local', password: 'demo-password-1' });
ok(r.s === 200 && r.j.role === 'DRIVER', 'driver login', r.j?.name);
r = await drv('GET', '/deliveries/mine');
const del = r.j?.find(d => d.orderId === order.id);
ok(r.s === 200 && del && del.driverId === null, 'driver sees unassigned delivery', `${del?.orderNumber} ${del?.order?.area} ${del?.order?.customer?.user?.name}`);

const expect = [['ASSIGNED', 'DRIVER_ASSIGNED', null], ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'Your order is on the way.'], ['ARRIVED', 'ARRIVED', 'Your driver has arrived.'], ['DELIVERED', 'DELIVERED', 'Order delivered.']];
for (const [ds, step, msg] of expect) {
  r = await drv('POST', `/deliveries/${del.id}/advance`);
  t = await track();
  ok(r.s === 200 && r.j.status === ds && t.current === step && t.message === msg, `driver -> ${ds}; tracking shows ${step}`, `message: ${t.message}`);
}
ok(t.status === 'DELIVERED' && t.steps.every(s => s.at), 'all 8 tracking steps have timestamps');
r = await drv('POST', `/deliveries/${del.id}/advance`);
ok(r.s === 409, 'no transition after DELIVERED (409)');

r = await admin('POST', '/auth/login', { email: 'admin@demo.local', password: 'demo-password-1' });
ok(r.s === 200 && r.j.role === 'ADMIN', 'admin login');
r = await admin('GET', '/admin/stats');
ok(r.s === 200 && r.j.todaysOrders >= 1 && r.j.todaysSales > 0, 'admin stats', JSON.stringify(r.j));
r = await anon('POST', '/auth/login', { email: 'admin@demo.local', password: 'wrong-password' });
ok(r.s === 401, 'wrong password rejected (401)');

r = await anon('POST', '/wholesale', { name: 'Demo Buyer', business: 'Demo Restaurant', phone: '0110000000', email: 'buyer@demo.local', products: 'Boerewors, Chicken Wings', quantity: '20 kg each', preferredDate: '2026-11-01', notes: 'Demo request' });
ok(r.s === 201, 'wholesale quote request stored');
r = await admin('GET', '/admin/wholesale');
ok(r.s === 200 && r.j.length >= 1, 'admin can read wholesale requests');

r = await cust('POST', '/ai/chat', { message: 'I am having a braai for 8 people. What would you recommend?', history: [] });
ok((r.s === 200 && r.j.reply) || (r.s === 503 && r.j.reply === 'Vallerie is temporarily unavailable. You can continue shopping normally.'), `AI chat route (${r.s})`, (r.j?.reply || '').slice(0, 400));

// ---- Stage 4: admin dashboard and driver rules ----
const placeAndPay = async (fulfilment, items) => {
  const o = await cust('POST', '/orders', { storeSlug: 'meat-market', fulfilment, ...(fulfilment === 'DELIVERY' ? { zoneId: zone1.id, address } : {}), contact, items });
  await cust('POST', `/payments/${o.j.id}/pay`, { method: 'EFT' }); return o.j;
};
const setStatus = (id, s) => admin('PATCH', `/admin/orders/${id}/status`, { status: s });

r = await admin('GET', '/admin/stats');
ok(r.s === 200 && ['todaysSales', 'todaysOrders', 'pending', 'preparing', 'outForDelivery', 'completedToday'].every(k => k in r.j), 'stats has all six dashboard cards', JSON.stringify(r.j));

const col = await placeAndPay('COLLECTION', [{ productId: P('Braai Pack').id, quantity: 1 }]);
ok((await setStatus(col.id, 'PACKED')).s === 200, 'collection order: PREPARING -> PACKED');
ok((await setStatus(col.id, 'READY_FOR_COLLECTION')).s === 200, 'collection order: PACKED -> READY_FOR_COLLECTION');
ok((await setStatus(col.id, 'COLLECTED')).s === 200, 'collection order: -> COLLECTED');
r = await setStatus(col.id, 'PREPARING');
ok(r.s === 409, 'invalid transition rejected (COLLECTED -> PREPARING)', r.j?.error);

const wingsBefore = Number((await anon('GET', '/products/' + P('Chicken Wings').id)).j.inventory.quantity);
const can = await placeAndPay('DELIVERY', [{ productId: P('Chicken Wings').id, quantity: 2 }]);
r = await setStatus(can.id, 'CANCELLED');
const wingsAfter = Number((await anon('GET', '/products/' + P('Chicken Wings').id)).j.inventory.quantity);
const canDetail = (await cust('GET', `/orders/${can.id}`)).j;
ok(r.s === 200 && wingsAfter === wingsBefore && canDetail.payment.status === 'REFUNDED', 'cancel restores stock and marks demo payment refunded', `stock ${wingsBefore} -> ${wingsAfter}, payment ${canDetail.payment.status}`);
r = await drv('GET', '/deliveries/mine');
ok(!r.j.some(d => d.orderId === can.id), 'cancelled delivery no longer offered to drivers');

const asg = await placeAndPay('DELIVERY', [{ productId: P('Pork Chops').id, quantity: 1 }]);
const drivers = (await admin('GET', '/admin/drivers')).j;
r = await admin('PATCH', `/admin/orders/${asg.id}/driver`, { driverId: drivers[0].id });
ok(r.s === 200, 'admin assigns a driver', drivers[0].user.name);
const myDel = (await drv('GET', '/deliveries/mine')).j.find(d => d.orderId === asg.id);
ok(myDel?.mine && myDel.status === 'ASSIGNED', "assigned delivery shows as the driver's own");
r = await drv('POST', `/deliveries/${myDel.id}/advance`, { from: 'PENDING' });
ok(r.s === 409, 'stale action rejected (double tap protection)', r.j?.error);
r = await drv('POST', `/deliveries/${myDel.id}/advance`, { from: 'ASSIGNED' });
const asgTrack = (await cust('GET', `/orders/${asg.id}/tracking`)).j;
ok(r.s === 200 && r.j.status === 'OUT_FOR_DELIVERY' && asgTrack.steps.find(s => s.key === 'PACKED').at, 'driver starts delivery; packed step filled in', asgTrack.current);
r = await admin('PATCH', `/admin/orders/${asg.id}/driver`, { driverId: null });
ok(r.s === 409, 'cannot reassign once the driver has left');

const staff = client();
await staff('POST', '/auth/login', { email: 'staff@demo.local', password: 'demo-password-1' });
ok((await staff('GET', '/admin/orders')).s === 200, 'store staff can see orders');
ok((await staff('GET', '/admin/customers')).s === 403, 'store staff cannot see customers (403)');
ok((await drv('GET', '/admin/orders')).s === 403, 'driver cannot use admin routes (403)');

const cats = (await anon('GET', '/categories')).j;
const meatStore = (await anon('GET', '/stores/meat-market')).j;
r = await admin('POST', '/admin/products', { storeId: meatStore.id, name: 'E2E Russians', description: 'Test product', price: 59.99, categoryId: cats[0].id, soldByWeight: false, quantity: 12 });
const newId = r.j?.id;
ok(r.s === 201, 'admin creates a product');
ok((await anon('GET', '/products?q=E2E%20Russians')).j.length === 1, 'new product appears in the shop');
await admin('PATCH', `/admin/products/${newId}`, { active: false });
ok((await anon('GET', '/products?q=E2E%20Russians')).j.length === 0, 'unavailable product hidden from the shop');
r = await admin('DELETE', `/admin/products/${newId}`);
ok(r.s === 200 && !(await admin('GET', '/admin/products')).j.some(p => p.id === newId), 'deleted product hidden from admin list (soft delete)');
r = await admin('POST', '/admin/products', { storeId: meatStore.id, name: '', price: -1, categoryId: '', soldByWeight: false });
ok(r.s === 400 && r.j.details, 'invalid product rejected with field errors', Object.keys(r.j?.details || {}).join(','));

r = await admin('GET', '/admin/analytics');
ok(r.s === 200 && r.j.averageOrderValue > 0 && r.j.topProducts.length > 0, 'analytics: AOV and top products', `AOV R${r.j?.averageOrderValue}, top ${r.j?.topProducts?.[0]?.name}`);
r = await admin('PATCH', `/admin/stores/${meatStore.id}`, { config: { whatsapp: '12' } });
ok(r.s === 400, 'invalid WhatsApp number rejected');
const adminMe = (await admin('GET', '/auth/me')).j;
ok((await admin('PATCH', `/admin/users/${adminMe.id}/active`, { active: false })).s === 400, 'admin cannot disable own account');

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
