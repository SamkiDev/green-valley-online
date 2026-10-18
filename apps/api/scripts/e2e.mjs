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
ok(r.s === 400 && r.j.details?.contact, 'guest order without contact details rejected (400)');

const email = `e2e-${Date.now()}@demo.local`;
r = await cust('POST', '/auth/register', { email, password: 'test-password-1', name: 'E2E Demo Customer', phone: '0110000000', acceptPrivacy: true });
ok(r.s === 201 && r.j.role === 'CUSTOMER', 'register customer');
r = await cust('POST', '/auth/register', { email, password: 'test-password-1', name: 'Dup', acceptPrivacy: true });
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
r = await admin('PATCH', `/admin/products/${newId}`, { quantity: 30 });
ok(r.s === 200 && Number((await anon('GET', `/products/${newId}`)).j.inventory.quantity) === 30, 'stock-only update (inventory screen) works');
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

// ---- Stage 5: guest checkout ----
const guest = client();
r = await guest('POST', '/orders', { storeSlug: 'meat-market', fulfilment: 'DELIVERY', zoneId: zone1.id, address, contact: { ...contact, email: 'guest@demo.local' }, acceptPrivacy: true, items: [{ productId: P('Braai Pack').id, quantity: 1 }] });
const gOrder = r.j; const gHdr = { 'X-Order-Token': gOrder?.guestToken };
ok(r.s === 201 && !!gOrder.guestToken && !gOrder.customerId, 'guest places an order and gets an access token', gOrder?.orderNumber);
ok((await guest('GET', `/orders/${gOrder.id}`)).s === 404, 'guest order hidden without its token');
ok((await cust('GET', `/orders/${gOrder.id}`)).s === 404, "other customers can't see a guest order");
const gfetch = (method, path, body) => fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...gHdr }, body: body && JSON.stringify(body) }).then(async x => ({ s: x.status, j: await x.json() }));
ok((await gfetch('GET', `/orders/${gOrder.id}`)).j.guest === true, 'guest order readable with its token');
r = await gfetch('POST', `/payments/${gOrder.id}/pay`, { method: 'CARD' });
ok(r.s === 200 && r.j.status === 'PAID', 'guest pays with the token');
ok((await gfetch('GET', `/orders/${gOrder.id}/tracking`)).j.current === 'PREPARING', 'guest tracking works');
r = await anon('POST', '/orders/lookup', { orderNumber: '#' + gOrder.orderNumber, email: 'GUEST@demo.local' });
ok(r.s === 200 && r.j.token === gOrder.guestToken, 'lookup by order number + email returns the same token');
ok((await anon('POST', '/orders/lookup', { orderNumber: gOrder.orderNumber, email: 'wrong@demo.local' })).s === 404, 'lookup with the wrong email fails');
ok((await admin('POST', '/orders', { storeSlug: 'meat-market', fulfilment: 'COLLECTION', contact, items: [{ productId: P('Braai Pack').id, quantity: 1 }] })).s === 403, 'staff accounts cannot place orders');

// ---- Stage 5: account ----
r = await cust('PATCH', '/account/profile', { name: 'E2E Renamed', phone: '083 111 2222' });
ok(r.s === 200 && r.j.name === 'E2E Renamed', 'profile update');
ok((await cust('PATCH', '/account/profile', { name: 'X', phone: '123' })).s === 400, 'profile rejects a bad phone number');
ok((await cust('POST', '/account/password', { current: 'wrong-password', next: 'new-password-9' })).s === 400, 'password change needs the current password');
ok((await cust('POST', '/account/password', { current: 'test-password-1', next: 'new-password-9' })).s === 200, 'password changed');
ok((await client()('POST', '/auth/login', { email, password: 'new-password-9' })).s === 200, 'new password works for sign in');
r = await cust('POST', '/account/addresses', { ...address, label: 'Home' });
const savedAddr = r.j;
ok(r.s === 201 && (await cust('GET', '/account/addresses')).j.length === 1, 'save an address');
await cust('POST', '/orders', { storeSlug: 'meat-market', fulfilment: 'DELIVERY', zoneId: zone1.id, address: { ...address, street: '99 Other Street' }, saveAddress: true, contact, items: [{ productId: P('Braai Pack').id, quantity: 1 }] });
ok((await cust('GET', '/account/addresses')).j.length === 2, 'checkout can save a new address');
await cust('DELETE', `/account/addresses/${savedAddr.id}`);
ok((await cust('GET', '/account/addresses')).j.length === 1, 'remove a saved address');
await cust('PUT', `/account/favourites/${P('Lamb Chops').id}`);
await cust('POST', '/account/favourites/merge', { productIds: [P('Lamb Chops').id, P('Pork Ribs').id, 'not-a-real-id'] });
r = await cust('GET', '/account/favourites');
ok(r.j.length === 2 && r.j.some(p => p.name === 'Pork Ribs'), 'favourites saved and merged', r.j.map(p => p.name).join(', '));
await cust('DELETE', `/account/favourites/${P('Pork Ribs').id}`);
ok((await cust('GET', '/account/favourites')).j.length === 1, 'remove a favourite');

// ---- Stage 5: order again ----
r = await cust('POST', `/orders/${order.id}/reorder`);
ok(r.s === 200 && r.j.storeSlug === 'meat-market' && r.j.items.length === 3, 'order again lists the past items', r.j.items?.map(i => `${i.name}:${i.available ? 'ok' : i.reason}`).join(', '));
await admin('PATCH', `/admin/products/${P('Chicken Wings').id}`, { active: false });
r = await cust('POST', `/orders/${order.id}/reorder`);
ok(r.j.items.find(i => i.name === 'Chicken Wings')?.reason === 'no longer available', 'order again flags unavailable items');
await admin('PATCH', `/admin/products/${P('Chicken Wings').id}`, { active: true });

// ---- Stage 5: reviews ----
r = await cust('GET', `/reviews?productId=${P('Family Braai Pack').id}`);
ok(r.s === 200 && r.j.canReview === true, 'customer with a delivered order can review the product');
r = await cust('POST', '/reviews', { productId: P('Family Braai Pack').id, rating: 5, comment: 'Fed the whole family. Great value.' });
ok(r.s === 201, 'product review posted');
ok((await cust('POST', '/reviews', { productId: P('Family Braai Pack').id, rating: 4, comment: 'Again' })).s === 403, 'only one review per product');
r = await anon('GET', `/reviews?productId=${P('Family Braai Pack').id}`);
ok(r.j.count === 1 && r.j.average === 5 && r.j.reviews[0].name === 'E2E', 'reviews public with first name only', JSON.stringify(r.j.reviews[0]));
ok((await cust('POST', '/reviews', { storeSlug: 'meat-market', rating: 4, comment: 'Friendly service and quick delivery.' })).s === 201, 'store review posted');
const newbie = client();
await newbie('POST', '/auth/register', { email: `newbie-${Date.now()}@demo.local`, password: 'test-password-1', name: 'New Person', acceptPrivacy: true });
r = await newbie('POST', '/reviews', { productId: P('Family Braai Pack').id, rating: 1, comment: 'Never bought it' });
ok(r.s === 403, 'customers without a completed order cannot review', r.j?.error);
ok((await cust('POST', '/reviews', { productId: P('Family Braai Pack').id, rating: 9, comment: 'x' })).s === 400, 'invalid rating rejected');

// ---- Stage 5: age-restricted store ----
const liquor = (await admin('GET', '/admin/stores')).j.find(s => s.slug === 'bottle-liquors');
await admin('PATCH', `/admin/stores/${liquor.id}`, { status: 'ACTIVE' });
r = await admin('POST', '/admin/products', { storeId: liquor.id, name: 'E2E Lager 6-pack', description: 'Test', price: 99.99, categoryId: cats[0].id, soldByWeight: false, quantity: 10 });
const beer = r.j;
const liquorOrder = (extra) => cust('POST', '/orders', { storeSlug: 'bottle-liquors', fulfilment: 'COLLECTION', contact, items: [{ productId: beer.id, quantity: 1 }], ...extra });
r = await liquorOrder({});
ok(r.s === 400 && /18 or older/.test(r.j.error), 'age-restricted order needs age confirmation', r.j?.error);
r = await liquorOrder({ ageConfirmed: true });
ok(r.s === 201 && r.j.ageConfirmedAt, 'age-restricted order accepted after confirmation');
await admin('DELETE', `/admin/products/${beer.id}`);
await admin('PATCH', `/admin/stores/${liquor.id}`, { status: 'COMING_SOON' });

// ---- Stage 6: product photos ----
const { default: sharp } = await import('sharp');
// A JPEG carrying GPS data in its EXIF, like a phone photo.
const photo = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#b91c1c' } })
  .jpeg().withExifMerge({ IFD0: { Make: 'TestPhone' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '26/1 10/1 0/1' } }).toBuffer();
ok(!!(await sharp(photo).metadata()).exif, 'test photo starts with EXIF metadata');
const adminCookie = (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.local', password: 'demo-password-1' }) })).headers.get('set-cookie').split(';')[0];
const uploadAs = async (path, files, field) => {
  const fd = new FormData(); for (const [name, bytes, type] of files) fd.append(field, new Blob([bytes], { type }), name);
  const r = await fetch(BASE + path, { method: 'POST', headers: { Cookie: adminCookie }, body: fd }); return { s: r.status, j: await r.json() };
};
r = await uploadAs(`/admin/products/${P('Beef Brisket').id}/image`, [['brisket.jpg', photo, 'image/jpeg']], 'image');
ok(r.s === 200 && /^\/uploads\/products\/.+\.webp$/.test(r.j.imageUrl), 'upload a product photo', r.j.imageUrl);
const img = await fetch('http://localhost:4000' + r.j.imageUrl);
const imgBytes = Buffer.from(await img.arrayBuffer()); const imgMeta = await sharp(imgBytes).metadata();
ok(img.ok && imgMeta.format === 'webp' && imgMeta.width <= 1200 && !imgMeta.exif, 'photo served as WebP, resized, metadata stripped', `${imgMeta.width}x${imgMeta.height} exif=${!!imgMeta.exif}`);
ok((await anon('GET', `/products/${P('Beef Brisket').id}`)).j.imageUrl === r.j.imageUrl, 'product shows the new photo');
r = await uploadAs(`/admin/products/${P('Beef Brisket').id}/image`, [['notes.txt', Buffer.from('not an image'), 'text/plain']], 'image');
ok(r.s === 400, 'non-image upload rejected', r.j.error);
r = await uploadAs('/admin/products/images/bulk', [['Beef Mince.jpg', photo, 'image/jpeg'], ['CHICKEN_WINGS.jpg', photo, 'image/jpeg'], ['mystery-meat.jpg', photo, 'image/jpeg']], 'images');
ok(r.s === 200 && r.j.matched === 2 && r.j.results.find(x => x.file === 'mystery-meat.jpg')?.ok === false, 'bulk upload matches photos by product name', r.j.results.map(x => `${x.file}:${x.ok ? x.product : x.error}`).join(', '));
ok((await fetch(BASE + `/admin/products/${P('Beef Brisket').id}/image`, { method: 'POST' })).status === 401, 'photo upload needs staff sign-in');

// ---- Stage 6: payments config ----
r = await anon('GET', '/payments/config');
ok(r.s === 200 && r.j.provider === 'demo' && r.j.mode === 'demo', 'payment provider config', JSON.stringify(r.j));

// ---- Stage 6: GPS ----
const gps = await placeAndPay('DELIVERY', [{ productId: P('Pork Chops').id, quantity: 1 }]);
let gDel = (await drv('GET', '/deliveries/mine')).j.find(d => d.orderId === gps.id);
r = await drv('POST', `/deliveries/${gDel.id}/location`, { lat: -26.1, lng: 28.0 });
ok(r.s === 404 || r.s === 409, 'no location before the driver has the delivery', String(r.s));
await drv('POST', `/deliveries/${gDel.id}/advance`, { from: 'PENDING' });
r = await drv('POST', `/deliveries/${gDel.id}/location`, { lat: -26.1, lng: 28.0 });
ok(r.s === 409, 'no location sharing before the driver leaves');
await drv('POST', `/deliveries/${gDel.id}/advance`, { from: 'ASSIGNED' });
ok((await cust('GET', `/orders/${gps.id}/tracking`)).j.driverLocation === null, 'no map position until the driver shares one');
r = await drv('POST', `/deliveries/${gDel.id}/location`, { lat: -26.1050, lng: 28.0560, accuracy: 12 });
ok(r.s === 200 && r.j.stored, 'driver shares location while out for delivery');
r = await drv('POST', `/deliveries/${gDel.id}/location`, { lat: -26.1060, lng: 28.0570 });
ok(r.s === 202 && !r.j.stored, 'location updates are throttled (10 s)');
ok((await drv('POST', `/deliveries/${gDel.id}/location`, { lat: 123, lng: 28 })).s === 400, 'impossible coordinates rejected');
let t6 = (await cust('GET', `/orders/${gps.id}/tracking`)).j;
ok(t6.driverLocation?.lat === -26.105 && t6.simulated === false, 'customer tracking shows the driver position', JSON.stringify(t6.driverLocation));
ok((await newbie('GET', `/orders/${gps.id}/tracking`)).s === 404, "other customers can't see the driver position");
await drv('POST', `/deliveries/${gDel.id}/advance`, { from: 'OUT_FOR_DELIVERY' });
await drv('POST', `/deliveries/${gDel.id}/advance`, { from: 'ARRIVED' });
t6 = (await cust('GET', `/orders/${gps.id}/tracking`)).j;
ok(t6.status === 'DELIVERED' && t6.driverLocation === null, 'position hidden once delivered');

// ---- Free fixes: consent ----
ok((await client()('POST', '/auth/register', { email: `noconsent-${Date.now()}@demo.local`, password: 'test-password-1', name: 'No Consent' })).s === 400, 'registration needs privacy consent');
ok((await client()('POST', '/orders', { storeSlug: 'meat-market', fulfilment: 'COLLECTION', contact, items: [{ productId: P('Braai Pack').id, quantity: 1 }] })).s === 400, 'guest order needs privacy consent');

// ---- Free fixes: unpaid orders release their stock ----
const { PrismaClient } = await import('@prisma/client');
const pdb = new PrismaClient();
const pid = P('Lamb Ribs').id;
const lambBefore = Number((await anon('GET', `/products/${pid}`)).j.inventory.quantity);
const unpaid = (await cust('POST', '/orders', { storeSlug: 'meat-market', fulfilment: 'COLLECTION', contact, items: [{ productId: pid, quantity: 1 }] })).j;
ok(Number((await anon('GET', `/products/${pid}`)).j.inventory.quantity) === lambBefore - 1, 'placing an order reserves stock');
await admin('POST', '/admin/orders/release-unpaid');
ok((await cust('GET', `/orders/${unpaid.id}`)).j.status === 'PLACED', 'a recent unpaid order is kept');
await pdb.order.update({ where: { id: unpaid.id }, data: { createdAt: new Date(Date.now() - 31 * 60_000) } }); // pretend 31 minutes passed
r = await admin('POST', '/admin/orders/release-unpaid');
ok(r.s === 200 && (await cust('GET', `/orders/${unpaid.id}`)).j.status === 'CANCELLED' && Number((await anon('GET', `/products/${pid}`)).j.inventory.quantity) === lambBefore, 'unpaid order cancelled after 30 minutes and stock returned');
ok((await cust('POST', `/payments/${unpaid.id}/pay`, { method: 'CARD' })).s === 409, 'a cancelled order cannot be paid');

// ---- Free fixes: sessions, staff accounts, temporary passwords ----
const s1 = client(), s2 = client();
const sEmail = `sessions-${Date.now()}@demo.local`;
await s1('POST', '/auth/register', { email: sEmail, password: 'test-password-1', name: 'Session Tester', acceptPrivacy: true });
await s2('POST', '/auth/login', { email: sEmail, password: 'test-password-1' });
await s1('POST', '/account/password', { current: 'test-password-1', next: 'test-password-2' });
ok((await s1('GET', '/auth/me')).j?.email === sEmail && (await s2('GET', '/auth/me')).j === null, 'changing password signs out other devices only');
await s1('POST', '/account/logout-all');
ok((await s1('GET', '/auth/me')).j === null, 'sign out everywhere works');
const staffEmail = `staff-${Date.now()}@demo.local`;
r = await admin('POST', '/admin/staff', { name: 'New Staff', email: staffEmail, password: 'first-password-1', storeId: meatStore.id });
ok(r.s === 201, 'admin creates a store staff account');
ok((await admin('POST', '/admin/staff', { name: 'Dup', email: staffEmail, password: 'first-password-1', storeId: meatStore.id })).s === 409, 'duplicate staff email rejected');
const st = client(); r = await st('POST', '/auth/login', { email: staffEmail, password: 'first-password-1' });
ok(r.j?.role === 'STORE_STAFF' && r.j.mustChangePassword === true, 'new staff must change password at first sign-in');
ok((await st('GET', '/admin/orders')).s === 200 && (await admin('GET', '/admin/staff')).j.some(x => x.user.email === staffEmail), 'staff can work and is listed');
const target = client(); await target('POST', '/auth/login', { email: sEmail, password: 'test-password-2' });
const targetId = (await target('GET', '/auth/me')).j.id;
r = await admin('POST', `/admin/users/${targetId}/temporary-password`);
const temp = r.j?.temporaryPassword;
ok(r.s === 200 && /^[a-z]+-\d{4}-[0-9a-f]{4}$/.test(temp ?? ''), 'admin issues a temporary password', temp ? '(issued)' : '');
ok((await target('GET', '/auth/me')).j === null, 'temporary password signs the user out');
const t2 = client(); r = await t2('POST', '/auth/login', { email: sEmail, password: temp });
ok(r.s === 200 && r.j.mustChangePassword === true, 'sign in with the temporary password, must change it');
await t2('POST', '/account/password', { current: temp, next: 'test-password-3' });
ok((await t2('GET', '/auth/me')).j?.mustChangePassword === false, 'changing the password clears the flag');
await admin('PATCH', `/admin/users/${targetId}/active`, { active: false });
ok((await t2('GET', '/auth/me')).j === null, 'disabling a user signs them out');
await admin('PATCH', `/admin/users/${targetId}/active`, { active: true });

// ---- Free fixes: Q&A approval ----
const qa = (await cust('POST', `/products/${P('Beef Brisket').id}/questions`, { text: 'How long should I smoke it?' })).j;
r = await st('POST', `/admin/questions/${qa.id}/answer`, { text: 'About 8 to 10 hours at 110 degrees.' });
ok(r.s === 201 && r.j.approved === false, 'staff answers wait for approval');
ok(!(await anon('GET', `/products/${P('Beef Brisket').id}/qa`)).j.find(x => x.id === qa.id).answers.length, 'unapproved answer is hidden');
await admin('PATCH', `/admin/answers/${r.j.id}`, { approved: true });
ok((await anon('GET', `/products/${P('Beef Brisket').id}/qa`)).j.find(x => x.id === qa.id).answers.length === 1, 'approved answer is shown');

// ---- Free fixes: ORDER AGAIN adds what is in stock ----
const rb = (await cust('GET', `/products/${P('Beef Short Ribs').id}`)).j;
const ro = await placeAndPay('COLLECTION', [{ productId: rb.id, quantity: 3 }]);
await setStatus(ro.id, 'READY_FOR_COLLECTION'); await setStatus(ro.id, 'COLLECTED');
await admin('PATCH', `/admin/products/${rb.id}`, { quantity: 1.5 });
r = await cust('POST', `/orders/${ro.id}/reorder`);
const ri = r.j.items[0];
ok(ri.available && ri.partial && ri.quantity === 1.5 && ri.wanted === 3, 'order again adds the 1.5 kg in stock instead of skipping', ri.reason);

// ---- Free fixes: cart saved to the account ----
ok((await s1('GET', '/cart')).s === 401, 'cart needs sign-in');
r = await cust('PUT', '/cart', { storeSlug: 'meat-market', fulfilment: 'COLLECTION', zoneId: null, lines: [{ productId: P('Braai Pack').id, quantity: 2 }, { productId: 'not-a-product', quantity: 1 }] });
ok(r.s === 200 && r.j.lines.length === 1 && r.j.fulfilment === 'COLLECTION', 'cart saved; unknown products dropped');
const otherDevice = client(); await otherDevice('POST', '/auth/login', { email, password: 'new-password-9' });
ok((await otherDevice('GET', '/cart')).j?.lines?.[0]?.quantity === 2, 'cart follows the customer to another device');

// ---- Free fixes: Vallerie basic mode (no AI key) ----
const ask = q => cust('POST', '/ai/chat', { message: q, history: [] });
r = await ask('I am having a braai for 8 people. What would you recommend?');
ok(r.s === 200 && r.j.mode === 'basic' && r.j.products.length >= 2 && /for 8/.test(r.j.reply) && /R\d/.test(r.j.reply), 'basic mode plans a braai for 8 from the catalogue', r.j.products?.map(p => p.name).join(', '));
r = await ask('Show me chicken products');
ok(r.j.products.length > 0 && r.j.products.every(p => p.category.name === 'Chicken'), 'basic mode lists chicken products');
r = await ask('What is available for under R300?');
ok(r.j.products.length > 0 && r.j.products.every(p => Number(p.price) <= 300), 'basic mode lists items under R300');
r = await ask('How does delivery work?');
ok(/Zone 1/.test(r.j.reply) && /free/i.test(r.j.reply), 'basic mode explains delivery from the zones');
r = await ask('Where is my order?');
ok(/#GV\d{5}/.test(r.j.reply), 'basic mode reports the latest order', r.j.reply.slice(0, 80));

// ---- Free fixes: catalogue import from CSV ----
const csv = (text, dry) => { const fd = new FormData(); fd.append('file', new Blob([text], { type: 'text/csv' }), 'products.csv'); return fetch(`${BASE}/admin/products/import${dry ? '?dryRun=1' : ''}`, { method: 'POST', headers: { Cookie: adminCookie }, body: fd }).then(async x => ({ s: x.status, j: await x.json() })); };
const sheet = 'name,category,price,unit,stock,description\n"Russians, smoked",Braai,"R12,99",each,40,Specials board\nBeef Mince,Beef,104.99,kg,20,\nBroken Row,Beef,abc,kg,1,\n';
r = await csv(sheet, true);
ok(r.s === 200 && r.j.summary.create === 1 && r.j.summary.update === 1 && r.j.summary.errors === 1, 'import preview: 1 new, 1 update, 1 error', JSON.stringify(r.j.summary));
ok(r.j.results.find(x => x.name === 'Beef Mince')?.changes?.some(c => /104\.99/.test(c)), 'preview shows the price change');
ok((await csv(sheet, false)).s === 400, 'import refuses a file with errors');
r = await csv(sheet.replace('Broken Row,Beef,abc,kg,1,\n', ''), false);
ok(r.s === 200 && (await anon('GET', '/products?q=russians')).j.some(p => p.name === 'Russians, smoked' && Number(p.price) === 12.99) && Number((await anon('GET', `/products/${P('Beef Mince').id}`)).j.price) === 104.99, 'import creates and updates products');
r = await csv('name;category;price\nPap;Sides;15\n', true);
ok(r.s === 200 && r.j.summary.create === 1, 'semicolon CSV from Excel accepted');

// ---- Free fixes: delivery zones by suburb (kept last: it changes zone rules) ----
r = await admin('POST', `/admin/stores/${meatStore.id}/zones`, { name: 'Zone 4 – Test suburbs', fee: 80, suburbs: ['Test Park', 'Sample Ridge'] });
const z4 = r.j;
ok(r.s === 201 && z4.suburbs.length === 2, 'admin creates a delivery zone with suburbs');
ok((await admin('POST', `/admin/stores/${meatStore.id}/zones`, { name: 'Clash', fee: 1, suburbs: ['test park'] })).s === 409, 'a suburb can belong to only one zone');
const zoneOrder = (zoneId, area) => cust('POST', '/orders', { storeSlug: 'meat-market', fulfilment: 'DELIVERY', zoneId, address: { ...address, area }, contact, items: [{ productId: P('Braai Pack').id, quantity: 1 }] });
r = await zoneOrder(zone1.id, 'Test Park');
ok(r.s === 400 && /Zone 4/.test(r.j.error), 'wrong zone for the suburb is corrected', r.j.error);
r = await zoneOrder(z4.id, 'Nowhere Village');
ok(r.s === 400 && /don't deliver/.test(r.j.error), 'unknown suburb is refused', r.j.error);
r = await zoneOrder(z4.id, '  sample   RIDGE ');
ok(r.s === 201 && Number(r.j.deliveryFee) === 80, 'right zone for the suburb is accepted (case-insensitive)');
await admin('PUT', `/admin/zones/${z4.id}`, { active: false, suburbs: [] });
await pdb.$disconnect();

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
