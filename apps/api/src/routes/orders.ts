// Orders, payments and tracking — for signed-in customers and for guests.
// Guests get a per-order access token (an HMAC of the order id), so nothing secret is stored and the same
// token can be re-issued by the "track by order number + email" lookup.
import crypto from 'node:crypto';
import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { OrderStatus, Prisma } from '@prisma/client';
import { db, fail, h, me, need, num, orderNo, saPhone, setOrderStatus, type U } from '../core';
import { provider } from '../payments';

const SECRET = process.env.JWT_SECRET!;
export const guestToken = (orderId: string) => crypto.createHmac('sha256', SECRET).update('order:' + orderId).digest('base64url');
const tokenOk = (orderId: string, token: unknown) => {
  if (typeof token !== 'string' || !token) return false;
  const a = Buffer.from(guestToken(orderId)), b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const user = (res: Response) => res.locals.user as U | undefined;
// Who may see an order: its signed-in customer, or anyone holding its guest token (X-Order-Token header).
function access(req: Request, res: Response, orderId: string): Prisma.OrderWhereInput {
  if (tokenOk(orderId, req.get('x-order-token'))) return { id: orderId };
  const u = user(res);
  if (u?.customerId) return { id: orderId, customerId: u.customerId };
  throw fail(404, 'Order not found');
}

// ---- tracking (simulated; no GPS yet). Every step's timestamp comes from recorded events. ----
const trackingInclude = { payment: true, events: { orderBy: { at: 'asc' } }, store: { select: { config: true } }, delivery: { include: { updates: { orderBy: { at: 'asc' } } } } } satisfies Prisma.OrderInclude;
type TrackOrder = Prisma.OrderGetPayload<{ include: typeof trackingInclude }>;
// DEMO estimate window from store config (minutes after payment). Not a promise; configurable per store.
function deliveryWindow(o: { fulfilment: string; createdAt: Date; store: { config: Prisma.JsonValue }; payment?: { status: string; createdAt: Date } | null }) {
  const w = (o.store.config as any)?.deliveryWindowMinutes; if (o.fulfilment !== 'DELIVERY' || !Array.isArray(w)) return null;
  const from = o.payment?.status === 'PAID' ? o.payment.createdAt : o.createdAt;
  return { from: new Date(from.getTime() + w[0] * 60_000), to: new Date(from.getTime() + w[1] * 60_000), demo: true };
}
function tracking(o: TrackOrder) {
  const ev = (s: OrderStatus) => o.events.find(e => e.status === s)?.at ?? null;
  const d = o.delivery, paidAt = o.payment?.status === 'PAID' ? o.payment.createdAt : null;
  const steps: { key: string; label: string; at: Date | null }[] = [
    { key: 'RECEIVED', label: 'Order received', at: o.createdAt },
    { key: 'PAID', label: 'Payment confirmed', at: paidAt },
    { key: 'PREPARING', label: 'Order being prepared', at: ev('PREPARING') },
    { key: 'PACKED', label: 'Order packed', at: ev('PACKED') },
    ...(o.fulfilment === 'DELIVERY' ? [
      { key: 'DRIVER_ASSIGNED', label: 'Driver assigned', at: d?.assignedAt ?? null },
      { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery', at: d?.departedAt ?? null },
      { key: 'ARRIVED', label: 'Arrived', at: d?.arrivedAt ?? null },
      { key: 'DELIVERED', label: 'Delivered', at: d?.deliveredAt ?? null },
    ] : [
      { key: 'READY_FOR_COLLECTION', label: 'Ready for collection', at: ev('READY_FOR_COLLECTION') },
      { key: 'COLLECTED', label: 'Collected', at: ev('COLLECTED') },
    ]),
  ];
  let current = 0; steps.forEach((s, i) => { if (s.at) current = i; });
  const message = o.status === 'CANCELLED' ? 'This order was cancelled.'
    : d?.status === 'DELIVERED' ? 'Order delivered.' : d?.status === 'ARRIVED' ? 'Your driver has arrived.'
    : d?.status === 'OUT_FOR_DELIVERY' ? 'Your order is on the way.' : null;
  // The driver's position is shared only while the order is on the road, never before or after.
  const onRoad = !!d && (d.status === 'OUT_FOR_DELIVERY' || d.status === 'ARRIVED') && d.lastLat != null && d.lastLng != null && !!d.lastLocationAt;
  const driverLocation = onRoad ? { lat: d!.lastLat!, lng: d!.lastLng!, accuracy: d!.lastAccuracy, at: d!.lastLocationAt!, stale: Date.now() - +d!.lastLocationAt! > 5 * 60_000 } : null;
  return { orderId: o.id, orderNumber: orderNo(o.seq), status: o.status, fulfilment: o.fulfilment, payment: o.payment?.status ?? 'PENDING',
    steps, current: steps[current].key, message, estimatedWindow: deliveryWindow(o), deliveryStatus: d?.status ?? null, driverLocation, simulated: !driverLocation };
}

const PROVINCES = ['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Free State', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape'] as const;
export const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
export const addressInput = z.object({
  street: z.string().trim().min(3).max(120), area: z.string().trim().min(2).max(80), city: z.string().trim().min(2).max(80),
  province: z.enum(PROVINCES), postalCode: z.string().trim().regex(/^\d{4}$/, 'Use a 4-digit postal code'),
});

export const orderRoutes = express.Router();

// ---- place an order (customer or guest). The server recomputes every price; client totals are ignored. ----
orderRoutes.post('/', h(async (req, res) => {
  const u = user(res);
  if (u && u.role !== 'CUSTOMER') throw fail(403, 'Staff accounts cannot place orders. Sign out to order as a customer.');
  const b = z.object({
    storeSlug: z.string(), fulfilment: z.enum(['DELIVERY', 'COLLECTION']), zoneId: z.string().optional(),
    contact: z.object({ firstName: z.string().trim().min(1).max(60), lastName: z.string().trim().min(1).max(60), phone: saPhone, email: z.string().trim().email().max(120) }),
    address: addressInput.optional(), saveAddress: z.boolean().optional(), ageConfirmed: z.boolean().optional(), acceptPrivacy: z.boolean().optional(),
    items: z.array(z.object({ productId: z.string(), quantity: z.number().positive().max(100) })).min(1).max(50),
  }).parse(req.body);
  const store = await db.store.findFirst({ where: { slug: b.storeSlug, status: 'ACTIVE' } }); if (!store) throw fail(400, 'Store not available');
  // Age-restricted stores need the customer's confirmation; the driver checks ID on delivery or collection.
  if (store.ageRestricted && b.ageConfirmed !== true) {
    const min = (store.config as any)?.ageVerification?.minimumAge ?? 18;
    throw fail(400, `Please confirm you are ${min} or older to order from ${store.name}.`);
  }
  // Guests accept the privacy policy at checkout; account holders accepted it when registering.
  if (!u && b.acceptPrivacy !== true) throw fail(400, 'Please accept the privacy policy and terms to place your order.');
  let fee = 0;
  if (b.fulfilment === 'DELIVERY') {
    if (!b.address || !b.zoneId) throw fail(400, 'Address and delivery zone required');
    const zones = await db.deliveryZone.findMany({ where: { storeId: store.id, active: true } });
    const zone = zones.find(z => z.id === b.zoneId); if (!zone) throw fail(400, 'Invalid delivery zone');
    // When the store lists suburbs per zone, the address must be in the chosen zone.
    if (zones.some(z => z.suburbs.length)) {
      const area = norm(b.address.area);
      const right = zones.find(z => z.suburbs.some(x => norm(x) === area));
      if (!right) throw fail(400, `We don't deliver to ${b.address.area} yet. Choose collection, or contact the store.`);
      if (right.id !== zone.id) throw fail(400, `${b.address.area} is in ${right.name}, not ${zone.name}. Please choose ${right.name}.`);
    }
    fee = num(zone.fee);
  }
  const order = await db.$transaction(async tx => {
    // Money uses exact decimals (Prisma.Decimal), each line rounded half-up to the cent.
    let subtotal = new Prisma.Decimal(0); const items: Prisma.OrderItemCreateWithoutOrderInput[] = [];
    for (const i of b.items) {
      const p = await tx.product.findFirst({ where: { id: i.productId, storeId: store.id, active: true, deletedAt: null }, include: { inventory: true } });
      if (!p || !p.inventory) throw fail(400, 'Product unavailable');
      if (!p.soldByWeight && !Number.isInteger(i.quantity)) throw fail(400, `${p.name} is sold per item; use a whole number`);
      if (p.soldByWeight && Math.abs(i.quantity * 100 - Math.round(i.quantity * 100)) > 1e-6) throw fail(400, 'Weight can have at most 2 decimal places');
      const upd = await tx.inventory.updateMany({ where: { productId: p.id, quantity: { gte: i.quantity } }, data: { quantity: { decrement: i.quantity } } });
      if (!upd.count) throw fail(409, `${p.name} does not have enough stock`);
      const line = p.price.mul(i.quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP); subtotal = subtotal.add(line);
      items.push({ product: { connect: { id: p.id } }, storeId: p.storeId, nameSnapshot: p.name, unitPrice: p.price, quantity: i.quantity, lineTotal: line });
    }
    let addressId: string | undefined;
    if (b.address) {
      const saved = u?.customerId && b.saveAddress ? await tx.address.findFirst({ where: { customerId: u.customerId, saved: true, ...b.address } }) : null;
      addressId = saved?.id ?? (await tx.address.create({ data: { ...b.address, customerId: u?.customerId, saved: !!(u?.customerId && b.saveAddress) } })).id;
    }
    return tx.order.create({ data: {
      customerId: u?.customerId, storeId: store.id, fulfilment: b.fulfilment,
      contactName: `${b.contact.firstName} ${b.contact.lastName}`, contactPhone: b.contact.phone, contactEmail: b.contact.email.toLowerCase(),
      ageConfirmedAt: store.ageRestricted ? new Date() : null, privacyAcceptedAt: u ? null : new Date(),
      subtotal, deliveryFee: fee, total: subtotal.add(fee), addressId, addressText: b.address && `${b.address.street}, ${b.address.area}`, area: b.address?.area,
      items: { create: items }, events: { create: { status: 'PLACED', actorUserId: u?.id } },
    }, include: { items: true } });
  });
  res.status(201).json({ ...order, orderNumber: orderNo(order.seq), ...(u ? {} : { guestToken: guestToken(order.id) }) });
}));

// Track an order with its number and the email used at checkout (works for guests). Rate limited.
const lookupLimit = rateLimit({ windowMs: 15 * 60_000, limit: 20 });
orderRoutes.post('/lookup', lookupLimit, h(async (req, res) => {
  const b = z.object({ orderNumber: z.string().trim().regex(/^#?GV\d{5,}$/i, 'Use the order number, e.g. GV10284'), email: z.string().trim().email() }).parse(req.body);
  const seq = Number(b.orderNumber.replace(/^#?GV/i, '')) - 10283;
  const o = seq > 0 ? await db.order.findFirst({ where: { seq, contactEmail: b.email.toLowerCase() }, select: { id: true } }) : null;
  if (!o) throw fail(404, "We couldn't find an order with that number and email.");
  res.json({ orderId: o.id, token: guestToken(o.id) });
}));

orderRoutes.get('/', need('CUSTOMER'), h(async (_, res) => res.json((await db.order.findMany({
  where: { customerId: me(res).customerId }, include: { items: true, payment: true, delivery: { select: { status: true } } }, orderBy: { createdAt: 'desc' },
})).map(o => ({ ...o, orderNumber: orderNo(o.seq) })))));

orderRoutes.get('/:id', h(async (req, res) => {
  const o = await db.order.findFirst({ where: access(req, res, req.params.id), include: {
    items: { include: { product: { select: { soldByWeight: true } } } },
    address: { select: { street: true, area: true, city: true, province: true, postalCode: true } },
    payment: { select: { id: true, status: true, method: true, provider: true, providerRef: true, createdAt: true } },
    store: { select: { slug: true, name: true, config: true, ageRestricted: true } },
  } });
  if (!o) throw fail(404, 'Order not found');
  res.json({ ...o, orderNumber: orderNo(o.seq), estimatedWindow: deliveryWindow(o), guest: !o.customerId });
}));

orderRoutes.get('/:id/tracking', h(async (req, res) => {
  const o = await db.order.findFirst({ where: access(req, res, req.params.id), include: trackingInclude });
  if (!o) throw fail(404, 'Order not found');
  res.json(tracking(o));
}));

// What can be re-added from a past order. The client adds the available lines and tells the customer what was skipped.
orderRoutes.post('/:id/reorder', need('CUSTOMER'), h(async (req, res) => {
  const o = await db.order.findFirst({ where: { id: req.params.id, customerId: me(res).customerId }, include: { store: { select: { slug: true } }, items: { include: { product: { include: { inventory: true, store: { select: { status: true } } } } } } } });
  if (!o) throw fail(404, 'Order not found');
  res.json({ storeSlug: o.store.slug, items: o.items.map(i => {
    const p = i.product, stock = num(p.inventory?.quantity ?? 0), want = num(i.quantity);
    const gone = p.deletedAt || !p.active || p.store.status !== 'ACTIVE';
    // Low stock: offer what is there (whole items, or kg to 2 decimals) rather than nothing.
    const can = gone ? 0 : Math.min(want, p.soldByWeight ? Math.floor(stock * 100) / 100 : Math.floor(stock));
    const unit = p.soldByWeight ? ' kg' : '';
    const reason = gone ? 'no longer available' : can <= 0 ? 'out of stock' : can < want ? `only ${can}${unit} in stock, so ${can}${unit} was added instead of ${want}${unit}` : null;
    return { productId: p.id, name: i.nameSnapshot, quantity: can, wanted: want, available: can > 0, partial: can > 0 && can < want, reason };
  }) });
}));

// ---- payments: a PaymentProvider (demo or Paystack). Card details never reach this server. ----
export const paymentRoutes = express.Router();

// Marks a payment paid exactly once, then moves the order on. Safe to call from both the return page and the webhook.
async function markPaid(paymentId: string, actorUserId?: string) {
  await db.$transaction(async tx => {
    const r = await tx.payment.updateMany({ where: { id: paymentId, status: { not: 'PAID' } }, data: { status: 'PAID' } });
    if (!r.count) return; // already paid
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
    if (p.order.status !== 'PLACED') return; // e.g. cancelled meanwhile: staff see a paid payment on a cancelled order and refund it
    await setOrderStatus(tx, p.orderId, 'PAID', actorUserId);
    await setOrderStatus(tx, p.orderId, 'PREPARING');
    if (p.order.fulfilment === 'DELIVERY') await tx.delivery.upsert({ where: { orderId: p.orderId }, update: {}, create: { orderId: p.orderId, updates: { create: { status: 'PENDING' } } } });
  });
}
const cents = (d: Prisma.Decimal) => Math.round(num(d) * 100);
// Accept a provider's "paid" only if it is for exactly this order's amount in rand.
const amountOk = (v: { amountCents?: number; currency?: string }, total: Prisma.Decimal) => v.amountCents === cents(total) && (v.currency ?? 'ZAR') === 'ZAR';

paymentRoutes.get('/config', (_, res) => res.json({ provider: provider.name, mode: provider.mode, unpaidMinutes: UNPAID_MINUTES }));

paymentRoutes.post('/:orderId/pay', h(async (req, res) => {
  const { method } = z.object({ method: z.enum(['CARD', 'EFT']) }).parse(req.body); // no card fields are accepted at all
  const o = await db.order.findFirst({ where: access(req, res, req.params.orderId), include: { payment: true } });
  if (!o) throw fail(404, 'Order not found');
  if (o.payment?.status === 'PAID') throw fail(409, 'Already paid');
  if (o.status === 'CANCELLED') throw fail(409, 'This order was cancelled');
  const reference = `${orderNo(o.seq)}-${crypto.randomBytes(3).toString('hex')}`; // new reference per attempt
  const pay = await db.payment.upsert({
    where: { orderId: o.id },
    update: { status: 'PENDING', provider: provider.name, providerRef: reference, method, amount: o.total },
    create: { orderId: o.id, provider: provider.name, providerRef: reference, method, status: 'PENDING', amount: o.total },
  });
  const r = await provider.start({ orderId: o.id, reference, amountCents: cents(o.total), email: o.contactEmail ?? 'customer@example.invalid', method,
    returnUrl: `${process.env.WEB_ORIGIN || 'http://localhost:5180'}/checkout/return?orderId=${o.id}` });
  if (r.kind === 'redirect') return res.json({ paymentId: pay.id, orderId: o.id, orderNumber: orderNo(o.seq), status: 'PENDING', redirectUrl: r.url, mode: provider.mode });
  if (r.status === 'PAID') await markPaid(pay.id, user(res)?.id);
  else await db.payment.update({ where: { id: pay.id }, data: { status: 'FAILED' } });
  res.json({ paymentId: pay.id, providerRef: reference, orderId: o.id, orderNumber: orderNo(o.seq), status: r.status, demo: provider.mode === 'demo', mode: provider.mode });
}));

// Called by the return page after the customer comes back from the provider. The provider is asked directly;
// nothing in the return URL is trusted.
paymentRoutes.post('/:orderId/verify', h(async (req, res) => {
  const o = await db.order.findFirst({ where: access(req, res, req.params.orderId), include: { payment: true } });
  if (!o?.payment) throw fail(404, 'Payment not found');
  const p = o.payment;
  if (p.status === 'PAID') return res.json({ status: 'PAID', orderId: o.id });
  if (!provider.verify || p.provider !== provider.name || !p.providerRef) throw fail(409, 'This payment cannot be verified');
  const v = await provider.verify(p.providerRef);
  if (v.status === 'PAID' && amountOk(v, o.total)) { await markPaid(p.id, user(res)?.id); return res.json({ status: 'PAID', orderId: o.id }); }
  if (v.status === 'PAID') { console.error('Payment amount mismatch', p.providerRef, v); await db.payment.update({ where: { id: p.id }, data: { status: 'FAILED' } }); return res.json({ status: 'FAILED', orderId: o.id, reason: 'amount' }); }
  if (v.status === 'FAILED') await db.payment.update({ where: { id: p.id }, data: { status: 'FAILED' } });
  res.json({ status: v.status, orderId: o.id });
}));

// Paystack server-to-server notification (needs a public URL in production). Signature-checked over the raw body.
paymentRoutes.post('/webhooks/paystack', h(async (req, res) => {
  if (provider.name !== 'paystack' || !provider.webhookValid?.((req as any).rawBody ?? Buffer.alloc(0), req.get('x-paystack-signature'))) return res.status(401).json({ error: 'Invalid signature' });
  const evt = req.body as { event?: string; data?: { reference?: string; amount?: number; currency?: string } };
  if (evt.event === 'charge.success' && evt.data?.reference) {
    const p = await db.payment.findFirst({ where: { providerRef: evt.data.reference, provider: 'paystack' }, include: { order: true } });
    if (p && amountOk({ amountCents: evt.data.amount, currency: evt.data.currency }, p.order.total)) await markPaid(p.id);
  }
  res.json({ ok: true }); // acknowledge so Paystack stops retrying
}));

// ---- unpaid orders: placing an order reserves stock; if it isn't paid in time, cancel it and put the stock back ----
export const UNPAID_MINUTES = Number(process.env.UNPAID_ORDER_MINUTES) || 30;
export async function sweepUnpaidOrders() {
  const cutoff = new Date(Date.now() - UNPAID_MINUTES * 60_000);
  const stale = await db.order.findMany({ where: { status: 'PLACED', createdAt: { lt: cutoff }, OR: [{ payment: null }, { payment: { status: { not: 'PAID' } } }] }, include: { payment: true, items: true }, take: 100 });
  for (const o of stale) {
    // A redirect payment may have gone through just now: ask the provider before cancelling.
    if (o.payment?.status === 'PENDING' && provider.verify && o.payment.provider === provider.name && o.payment.providerRef) {
      const v = await provider.verify(o.payment.providerRef).catch(() => null);
      if (v?.status === 'PAID' && amountOk(v, o.total)) { await markPaid(o.payment.id); continue; }
      if (v?.status === 'PENDING') continue; // still in progress at the provider; check again next round
    }
    await db.$transaction(async tx => {
      const r = await tx.order.updateMany({ where: { id: o.id, status: 'PLACED' }, data: { status: 'CANCELLED' } });
      if (!r.count) return;
      await tx.orderStatusEvent.create({ data: { orderId: o.id, status: 'CANCELLED' } });
      for (const i of o.items) await tx.inventory.updateMany({ where: { productId: i.productId }, data: { quantity: { increment: i.quantity } } });
      if (o.payment && o.payment.status !== 'PAID') await tx.payment.update({ where: { id: o.payment.id }, data: { status: 'FAILED' } });
    });
    console.log(`Cancelled unpaid order ${orderNo(o.seq)} after ${UNPAID_MINUTES} minutes; stock returned`);
  }
  return stale.length;
}
