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
  return { orderId: o.id, orderNumber: orderNo(o.seq), status: o.status, fulfilment: o.fulfilment, payment: o.payment?.status ?? 'PENDING',
    steps, current: steps[current].key, message, estimatedWindow: deliveryWindow(o), deliveryStatus: d?.status ?? null, simulated: true };
}

const PROVINCES = ['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Free State', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape'] as const;
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
    address: addressInput.optional(), saveAddress: z.boolean().optional(), ageConfirmed: z.boolean().optional(),
    items: z.array(z.object({ productId: z.string(), quantity: z.number().positive().max(100) })).min(1).max(50),
  }).parse(req.body);
  const store = await db.store.findFirst({ where: { slug: b.storeSlug, status: 'ACTIVE' } }); if (!store) throw fail(400, 'Store not available');
  // Age-restricted stores need the customer's confirmation; the driver checks ID on delivery or collection.
  if (store.ageRestricted && b.ageConfirmed !== true) {
    const min = (store.config as any)?.ageVerification?.minimumAge ?? 18;
    throw fail(400, `Please confirm you are ${min} or older to order from ${store.name}.`);
  }
  let fee = 0;
  if (b.fulfilment === 'DELIVERY') {
    if (!b.address || !b.zoneId) throw fail(400, 'Address and delivery zone required');
    const zone = await db.deliveryZone.findFirst({ where: { id: b.zoneId, storeId: store.id, active: true } }); if (!zone) throw fail(400, 'Invalid delivery zone');
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
      ageConfirmedAt: store.ageRestricted ? new Date() : null,
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
    const reason = p.deletedAt || !p.active || p.store.status !== 'ACTIVE' ? 'no longer available' : stock <= 0 ? 'out of stock' : stock < want ? `only ${stock}${p.soldByWeight ? ' kg' : ''} in stock` : null;
    return { productId: p.id, name: i.nameSnapshot, quantity: want, available: !reason, reason };
  }) });
}));

// ---- payments (DEMO provider behind an interface) ----
export const paymentRoutes = express.Router();
paymentRoutes.post('/:orderId/pay', h(async (req, res) => {
  const { method } = z.object({ method: z.enum(['CARD', 'EFT']) }).parse(req.body); // no card fields are accepted at all
  const o = await db.order.findFirst({ where: access(req, res, req.params.orderId), include: { payment: true } });
  if (!o) throw fail(404, 'Order not found');
  if (o.payment?.status === 'PAID') throw fail(409, 'Already paid');
  if (o.status === 'CANCELLED') throw fail(409, 'This order was cancelled');
  const r = await provider.charge({ orderId: o.id, amount: num(o.total), method });
  const actor = user(res)?.id;
  const out = await db.$transaction(async tx => {
    const pay = await tx.payment.upsert({ where: { orderId: o.id }, update: { status: r.status, providerRef: r.providerRef, method }, create: { orderId: o.id, provider: provider.name, providerRef: r.providerRef, method, status: r.status, amount: o.total } });
    if (r.status === 'PAID') {
      await setOrderStatus(tx, o.id, 'PAID', actor);
      await setOrderStatus(tx, o.id, 'PREPARING');
      if (o.fulfilment === 'DELIVERY') await tx.delivery.upsert({ where: { orderId: o.id }, update: {}, create: { orderId: o.id, updates: { create: { status: 'PENDING' } } } });
    }
    return pay;
  });
  res.json({ paymentId: out.id, providerRef: out.providerRef, orderId: o.id, orderNumber: orderNo(o.seq), status: out.status, demo: provider.name === 'demo' });
}));
