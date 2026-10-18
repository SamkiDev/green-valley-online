// Admin dashboard API. ADMIN sees everything; STORE_STAFF only their own store (via `scope`).
// Routes marked need('ADMIN') hold private or centre-wide data (customers, drivers, store settings, wholesale).
import express from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { OrderStatus, Prisma } from '@prisma/client';
import { db, fail, h, me, need, num, orderNo, saPhone, scope, setOrderStatus } from '../core';
import { imageRoutes } from './images';
import { importRoutes } from './importProducts';
import { sweepUnpaidOrders, UNPAID_MINUTES } from './orders';

export const adminRoutes = express.Router();
adminRoutes.use(need('ADMIN', 'STORE_STAFF'));
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

// ---- dashboard cards ----
adminRoutes.get('/stats', h(async (_, res) => {
  const s = scope(res), today = startOfToday();
  const [sales, todaysOrders, byStatus, completedToday] = await Promise.all([
    db.payment.aggregate({ where: { status: 'PAID', createdAt: { gte: today }, order: s }, _sum: { amount: true } }),
    db.order.count({ where: { ...s, createdAt: { gte: today } } }),
    db.order.groupBy({ by: ['status'], where: { ...s, status: { notIn: ['DELIVERED', 'COLLECTED', 'CANCELLED'] } }, _count: true }),
    db.orderStatusEvent.count({ where: { status: { in: ['DELIVERED', 'COLLECTED'] }, at: { gte: today }, order: s } }),
  ]);
  const count = (...st: OrderStatus[]) => byStatus.filter(b => st.includes(b.status)).reduce((n, b) => n + b._count, 0);
  res.json({
    todaysSales: num(sales._sum.amount ?? 0), todaysOrders,
    pending: count('PLACED', 'PAID'), preparing: count('PREPARING', 'PACKED', 'READY_FOR_COLLECTION'),
    outForDelivery: count('OUT_FOR_DELIVERY'), completedToday,
  });
}));

// ---- orders ----
adminRoutes.get('/orders', h(async (req, res) => {
  const q = z.object({ status: z.nativeEnum(OrderStatus).optional() }).parse(req.query);
  const list = await db.order.findMany({
    where: { ...scope(res), ...(q.status ? { status: q.status } : {}) },
    include: {
      items: { select: { id: true, nameSnapshot: true, quantity: true, lineTotal: true, product: { select: { soldByWeight: true } } } },
      payment: { select: { status: true, method: true, providerRef: true } },
      delivery: { select: { id: true, status: true, driverId: true, driver: { select: { user: { select: { name: true } } } } } },
      store: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' }, take: 200,
  });
  res.json(list.map(o => ({ ...o, orderNumber: orderNo(o.seq) })));
}));

// What staff may set from the dashboard. Delivery progress (out for delivery, delivered) belongs to the driver.
const ALLOWED: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PLACED: ['CANCELLED'],
  PAID: ['PREPARING', 'CANCELLED'],
  PREPARING: ['PACKED', 'READY_FOR_COLLECTION', 'CANCELLED'],
  PACKED: ['READY_FOR_COLLECTION', 'CANCELLED'],
  READY_FOR_COLLECTION: ['COLLECTED', 'CANCELLED'],
};
adminRoutes.patch('/orders/:id/status', h(async (req, res) => {
  const { status } = z.object({ status: z.enum(['PREPARING', 'PACKED', 'READY_FOR_COLLECTION', 'COLLECTED', 'CANCELLED']) }).parse(req.body);
  await db.$transaction(async tx => {
    const o = await tx.order.findFirst({ where: { id: req.params.id, ...scope(res) }, include: { items: true, delivery: true, payment: true } });
    if (!o) throw fail(404, 'Order not found');
    if (!ALLOWED[o.status]?.includes(status)) throw fail(409, `Can't change an order from ${o.status.replace(/_/g, ' ').toLowerCase()} to ${status.replace(/_/g, ' ').toLowerCase()}`);
    if ((status === 'READY_FOR_COLLECTION' || status === 'COLLECTED') && o.fulfilment !== 'COLLECTION') throw fail(409, 'This order is for delivery, not collection');
    if (status === 'CANCELLED' && o.delivery && ['OUT_FOR_DELIVERY', 'ARRIVED', 'DELIVERED'].includes(o.delivery.status)) throw fail(409, 'The driver is already on the way; this order can no longer be cancelled');
    // Conditional on the status we read, so two staff members can't both change it.
    const r = await tx.order.updateMany({ where: { id: o.id, status: o.status }, data: { status } });
    if (!r.count) throw fail(409, 'This order was just updated. Refresh and try again.');
    await tx.orderStatusEvent.create({ data: { orderId: o.id, status, actorUserId: me(res).id } });
    if (status === 'CANCELLED') {
      for (const i of o.items) await tx.inventory.updateMany({ where: { productId: i.productId }, data: { quantity: { increment: i.quantity } } }); // put stock back
      if (o.delivery) {
        await tx.delivery.update({ where: { id: o.delivery.id }, data: { status: 'CANCELLED' } });
        await tx.deliveryStatusUpdate.create({ data: { deliveryId: o.delivery.id, status: 'CANCELLED', actorUserId: me(res).id } });
      }
      if (o.payment?.status === 'PAID') await tx.payment.update({ where: { id: o.payment.id }, data: { status: 'REFUNDED' } }); // DEMO: a real provider refund call goes here
    }
  });
  res.json({ ok: true });
}));

adminRoutes.patch('/orders/:id/driver', h(async (req, res) => {
  const { driverId } = z.object({ driverId: z.string().nullable() }).parse(req.body);
  await db.$transaction(async tx => {
    const o = await tx.order.findFirst({ where: { id: req.params.id, ...scope(res) }, include: { delivery: true } });
    if (!o?.delivery) throw fail(404, o ? 'This order has no delivery (unpaid or collection)' : 'Order not found');
    if (!['PENDING', 'READY_FOR_PICKUP', 'ASSIGNED'].includes(o.delivery.status)) throw fail(409, 'The driver has already started this delivery');
    if (driverId && !(await tx.driver.findFirst({ where: { id: driverId, user: { active: true } } }))) throw fail(400, 'Driver not found or disabled');
    const status = driverId ? 'ASSIGNED' : 'PENDING';
    await tx.delivery.update({ where: { id: o.delivery.id }, data: { driverId, status, assignedAt: driverId ? new Date() : null } });
    await tx.deliveryStatusUpdate.create({ data: { deliveryId: o.delivery.id, status, actorUserId: me(res).id } });
  });
  res.json({ ok: true });
}));

// Names only, so store staff can assign drivers without seeing driver contact details.
adminRoutes.get('/driver-options', h(async (_, res) => {
  const ds = await db.driver.findMany({ where: { user: { active: true } }, select: { id: true, user: { select: { name: true } } }, orderBy: { user: { name: 'asc' } } });
  res.json(ds.map(d => ({ id: d.id, name: d.user.name })));
}));

// ---- products & inventory ----
const productInput = z.object({
  name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).default(''),
  price: z.number().positive().max(100000), categoryId: z.string().min(1), soldByWeight: z.boolean(),
  imageUrl: z.string().trim().url().max(500).nullable().optional(), active: z.boolean().optional(),
  quantity: z.number().min(0).max(100000).optional(), lowThreshold: z.number().min(0).max(10000).optional(),
});
const inventoryOf = (quantity?: number, lowThreshold?: number) => ({ ...(quantity !== undefined ? { quantity } : {}), ...(lowThreshold !== undefined ? { lowThreshold } : {}) });

adminRoutes.get('/products', h(async (_, res) => res.json(await db.product.findMany({
  where: { ...scope(res), deletedAt: null },
  include: { category: true, inventory: true, store: { select: { name: true, slug: true } } },
  orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
}))));
adminRoutes.post('/products', h(async (req, res) => {
  const b = productInput.parse(req.body);
  const storeId = me(res).role === 'ADMIN' ? z.string().min(1).parse(req.body.storeId) : me(res).storeId!;
  const { quantity, lowThreshold, ...data } = b;
  const p = await db.product.create({ data: { ...data, storeId, isDemo: false, inventory: { create: { quantity: quantity ?? 0, ...(lowThreshold !== undefined ? { lowThreshold } : {}) } } } });
  res.status(201).json(p);
}));
adminRoutes.patch('/products/:id', h(async (req, res) => {
  const { quantity, lowThreshold, ...data } = productInput.partial().parse(req.body);
  // Check access first: a stock-only update has no product fields, and updateMany with empty data matches nothing.
  if (!(await db.product.findFirst({ where: { id: req.params.id, ...scope(res), deletedAt: null }, select: { id: true } }))) return res.status(404).json({ error: 'Product not found' });
  if (Object.keys(data).length) await db.product.update({ where: { id: req.params.id }, data });
  const inv = inventoryOf(quantity, lowThreshold);
  if (Object.keys(inv).length) await db.inventory.upsert({ where: { productId: req.params.id }, update: inv, create: { productId: req.params.id, quantity: quantity ?? 0, ...(lowThreshold !== undefined ? { lowThreshold } : {}) } });
  res.json({ ok: true });
}));
adminRoutes.delete('/products/:id', h(async (req, res) => { // soft delete keeps order history intact
  const r = await db.product.updateMany({ where: { id: req.params.id, ...scope(res), deletedAt: null }, data: { active: false, deletedAt: new Date() } });
  r.count ? res.json({ ok: true }) : res.status(404).json({ error: 'Product not found' });
}));
adminRoutes.get('/inventory', h(async (_, res) => {
  const rows = await db.inventory.findMany({ where: { product: { ...scope(res), deletedAt: null } }, include: { product: { select: { id: true, name: true, active: true, soldByWeight: true, category: { select: { name: true } } } } } });
  res.json(rows.map(r => { const q = num(r.quantity), low = num(r.lowThreshold); return { ...r, state: q <= 0 ? 'OUT_OF_STOCK' : q <= low ? 'LOW_STOCK' : 'IN_STOCK' }; })
    .sort((a, b) => ['OUT_OF_STOCK', 'LOW_STOCK', 'IN_STOCK'].indexOf(a.state) - ['OUT_OF_STOCK', 'LOW_STOCK', 'IN_STOCK'].indexOf(b.state) || a.product.name.localeCompare(b.product.name)));
}));

// ---- Q&A: only approved answers are shown to customers and to Vallerie ----
adminRoutes.get('/questions', h(async (_, res) => {
  const qs = await db.question.findMany({ where: { product: scope(res) }, include: { product: { select: { name: true } }, customer: { select: { user: { select: { name: true } } } }, answers: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 200 });
  res.json(qs.sort((a, b) => Number(a.answers.length > 0) - Number(b.answers.length > 0)));
}));
adminRoutes.post('/questions/:id/answer', h(async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(1).max(500) }).parse(req.body);
  if (!(await db.question.findFirst({ where: { id: req.params.id, product: scope(res) } }))) return res.status(404).json({ error: 'Question not found' });
  // Admin answers go live at once; store staff answers wait for an admin to approve them.
  res.status(201).json(await db.answer.create({ data: { questionId: req.params.id, text, approved: me(res).role === 'ADMIN', authorUserId: me(res).id } }));
}));

// ---- review moderation ----
adminRoutes.get('/reviews', h(async (_, res) => res.json(await db.review.findMany({ where: { store: scope(res).storeId ? { id: scope(res).storeId } : {} }, include: { product: { select: { name: true } }, store: { select: { name: true } }, customer: { select: { user: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 200 }))));
adminRoutes.delete('/reviews/:id', h(async (req, res) => {
  const r = await db.review.deleteMany({ where: { id: req.params.id, ...(scope(res).storeId ? { storeId: scope(res).storeId } : {}) } });
  r.count ? res.json({ ok: true }) : res.status(404).json({ error: 'Review not found' });
}));

// ---- analytics (paid orders only) ----
adminRoutes.get('/analytics', h(async (req, res) => {
  const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
  const since = new Date(Date.now() - days * 864e5);
  const paid = { ...scope(res), payment: { status: 'PAID' as const }, createdAt: { gte: since } };
  const [agg, top, recent] = await Promise.all([
    db.order.aggregate({ where: paid, _sum: { total: true }, _avg: { total: true }, _count: true }),
    db.orderItem.groupBy({ by: ['productId', 'nameSnapshot'], where: { order: paid }, _sum: { lineTotal: true, quantity: true }, _count: true, orderBy: { _sum: { lineTotal: 'desc' } }, take: 8 }),
    db.order.findMany({ where: paid, select: { createdAt: true, total: true } }),
  ]);
  const byDay = new Map<string, number>();
  for (let i = 6; i >= 0; i--) byDay.set(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10), 0);
  for (const o of recent) { const k = o.createdAt.toISOString().slice(0, 10); if (byDay.has(k)) byDay.set(k, byDay.get(k)! + num(o.total)); }
  res.json({
    days, orders: agg._count, revenue: num(agg._sum.total ?? 0), averageOrderValue: Math.round(num(agg._avg.total ?? 0) * 100) / 100,
    topProducts: top.map(t => ({ productId: t.productId, name: t.nameSnapshot, revenue: num(t._sum.lineTotal ?? 0), quantity: num(t._sum.quantity ?? 0), orders: t._count })),
    last7Days: [...byDay].map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 })),
  });
}));

// ---- admin only ----
const A = express.Router();
A.use(need('ADMIN'));

A.get('/customers', h(async (_, res) => {
  const users = await db.user.findMany({ where: { role: 'CUSTOMER' }, select: { id: true, name: true, email: true, phone: true, active: true, createdAt: true, customer: { select: { orders: { select: { total: true, createdAt: true, payment: { select: { status: true } } } } } } }, orderBy: { createdAt: 'desc' }, take: 500 });
  res.json(users.map(({ customer, ...u }) => {
    const orders = customer?.orders ?? [];
    return { ...u, orders: orders.length, spent: orders.filter(o => o.payment?.status === 'PAID').reduce((s, o) => s + num(o.total), 0), lastOrderAt: orders.map(o => o.createdAt).sort((a, b) => +b - +a)[0] ?? null };
  }));
}));

A.get('/drivers', h(async (_, res) => {
  const drivers = await db.driver.findMany({ include: { user: { select: { id: true, name: true, email: true, phone: true, active: true } }, deliveries: { include: { order: { select: { seq: true, area: true } } }, orderBy: { assignedAt: 'desc' }, take: 50 } }, orderBy: { user: { name: 'asc' } } });
  res.json(drivers.map(d => ({
    id: d.id, vehicle: d.vehicle, user: d.user,
    active: d.deliveries.filter(x => ['ASSIGNED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'ARRIVED'].includes(x.status)).map(x => ({ id: x.id, orderNumber: orderNo(x.order.seq), area: x.order.area, status: x.status })),
    delivered: d.deliveries.filter(x => x.status === 'DELIVERED').length,
    history: d.deliveries.filter(x => x.status === 'DELIVERED').slice(0, 5).map(x => ({ id: x.id, orderNumber: orderNo(x.order.seq), area: x.order.area, deliveredAt: x.deliveredAt })),
  })));
}));
A.post('/drivers', h(async (req, res) => {
  const b = z.object({ email: z.string().trim().email(), name: z.string().trim().min(1).max(80), phone: saPhone.optional(), password: z.string().min(8).max(100), vehicle: z.string().trim().max(60).optional() }).parse(req.body);
  if (await db.user.findUnique({ where: { email: b.email.toLowerCase() } })) return res.status(409).json({ error: 'That email is already registered' });
  const u = await db.user.create({ data: { email: b.email.toLowerCase(), name: b.name, phone: b.phone, role: 'DRIVER', passwordHash: await bcrypt.hash(b.password, 12), driver: { create: { vehicle: b.vehicle } } } });
  res.status(201).json({ id: u.id });
}));
A.patch('/users/:id/active', h(async (req, res) => {
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  if (req.params.id === me(res).id) return res.status(400).json({ error: "You can't disable your own account" });
  // Disabling also signs the user out everywhere.
  const r = await db.user.updateMany({ where: { id: req.params.id, role: { not: 'ADMIN' } }, data: { active, ...(active ? {} : { tokenVersion: { increment: 1 } }) } });
  r.count ? res.json({ ok: true }) : res.status(404).json({ error: 'User not found' });
}));

// No email service yet, so a forgotten password is reset by an admin: a one-time temporary password,
// shown once, which the user must change at next sign-in. Their other sessions end.
const tempPassword = () => {
  const words = ['braai', 'boerewors', 'sosatie', 'potjie', 'chakalaka', 'biltong', 'vetkoek', 'rooibos'];
  return `${words[crypto.randomInt(words.length)]}-${crypto.randomInt(1000, 9999)}-${crypto.randomBytes(2).toString('hex')}`;
};
A.post('/users/:id/temporary-password', h(async (req, res) => {
  if (req.params.id === me(res).id) return res.status(400).json({ error: 'Change your own password from your account page' });
  const u = await db.user.findFirst({ where: { id: req.params.id, role: { not: 'ADMIN' } } });
  if (!u) return res.status(404).json({ error: 'User not found' });
  const password = tempPassword();
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true, tokenVersion: { increment: 1 } } });
  res.json({ temporaryPassword: password, name: u.name, email: u.email });
}));

// ---- store staff accounts ----
A.get('/staff', h(async (_, res) => {
  const staff = await db.storeStaff.findMany({ include: { user: { select: { id: true, name: true, email: true, phone: true, active: true, createdAt: true } }, store: { select: { id: true, name: true } } }, orderBy: { user: { name: 'asc' } } });
  res.json(staff.map(s => ({ id: s.id, user: s.user, store: s.store })));
}));
A.post('/staff', h(async (req, res) => {
  const b = z.object({ email: z.string().trim().email(), name: z.string().trim().min(1).max(80), phone: saPhone.optional(), password: z.string().min(8).max(100), storeId: z.string().min(1) }).parse(req.body);
  if (await db.user.findUnique({ where: { email: b.email.toLowerCase() } })) return res.status(409).json({ error: 'That email is already registered' });
  if (!(await db.store.findUnique({ where: { id: b.storeId } }))) return res.status(400).json({ error: 'Store not found' });
  // Staff choose their own password: the temporary one must be changed at first sign-in.
  const u = await db.user.create({ data: { email: b.email.toLowerCase(), name: b.name, phone: b.phone, role: 'STORE_STAFF', mustChangePassword: true, passwordHash: await bcrypt.hash(b.password, 12), staff: { create: { storeId: b.storeId } } } });
  res.status(201).json({ id: u.id });
}));

// Release stock held by unpaid orders now, instead of waiting for the automatic check.
A.post('/orders/release-unpaid', h(async (_req, res) => res.json({ checked: await sweepUnpaidOrders(), minutes: UNPAID_MINUTES })));

// ---- Q&A moderation (admin) ----
A.patch('/answers/:id', h(async (req, res) => {
  const { approved } = z.object({ approved: z.boolean() }).parse(req.body);
  const r = await db.answer.updateMany({ where: { id: req.params.id }, data: { approved } });
  r.count ? res.json({ ok: true }) : res.status(404).json({ error: 'Answer not found' });
}));
A.delete('/answers/:id', h(async (req, res) => {
  const r = await db.answer.deleteMany({ where: { id: req.params.id } });
  r.count ? res.json({ ok: true }) : res.status(404).json({ error: 'Answer not found' });
}));
A.delete('/questions/:id', h(async (req, res) => {
  const q = await db.question.findUnique({ where: { id: req.params.id } }); if (!q) return res.status(404).json({ error: 'Question not found' });
  await db.$transaction([db.answer.deleteMany({ where: { questionId: q.id } }), db.question.delete({ where: { id: q.id } })]);
  res.json({ ok: true });
}));

A.get('/stores', h(async (_, res) => res.json(await db.store.findMany({ include: { zones: { orderBy: { fee: 'asc' } }, _count: { select: { products: { where: { deletedAt: null } } } } }, orderBy: { createdAt: 'asc' } }))));
const storeConfig = z.object({
  whatsapp: z.union([z.literal(''), saPhone]).optional(), hours: z.string().trim().max(300).optional(),
  deliveryWindowMinutes: z.tuple([z.number().int().min(5).max(1440), z.number().int().min(5).max(1440)]).refine(([a, b]) => a <= b, 'Earliest must be before latest').optional(),
  complianceNotice: z.string().trim().max(500).optional(), responsibleSaleMessage: z.string().trim().max(200).optional(),
}).strict();
A.patch('/stores/:id', h(async (req, res) => {
  const b = z.object({ status: z.enum(['ACTIVE', 'COMING_SOON']).optional(), description: z.string().trim().max(300).optional(), config: storeConfig.optional() }).parse(req.body);
  const s = await db.store.findUnique({ where: { id: req.params.id } }); if (!s) return res.status(404).json({ error: 'Store not found' });
  // Merge into the existing config so unrelated keys (accent colours, age verification) are kept.
  const config = b.config ? ({ ...(s.config as Prisma.JsonObject), ...b.config } as Prisma.InputJsonValue) : undefined;
  res.json(await db.store.update({ where: { id: s.id }, data: { status: b.status, description: b.description, config } }));
}));
// Suburbs: trimmed, de-duplicated (case-insensitive), at most 200 per zone.
const suburbList = z.array(z.string().trim().min(2).max(60)).max(200)
  .transform(xs => [...new Map(xs.map(x => [x.toLowerCase().replace(/\s+/g, ' '), x.replace(/\s+/g, ' ')])).values()]);
const zoneInput = z.object({ name: z.string().trim().min(1).max(80), fee: z.number().min(0).max(5000), suburbs: suburbList.default([]), active: z.boolean().default(true) });
// A suburb may belong to only one zone per store, so an address always maps to one fee.
async function suburbClash(storeId: string, suburbs: string[], exceptZoneId?: string) {
  if (!suburbs.length) return null;
  const others = await db.deliveryZone.findMany({ where: { storeId, ...(exceptZoneId ? { id: { not: exceptZoneId } } : {}) } });
  const mine = new Set(suburbs.map(s => s.toLowerCase()));
  for (const z of others) { const hit = z.suburbs.find(s => mine.has(s.toLowerCase())); if (hit) return `${hit} is already in ${z.name}`; }
  return null;
}
A.post('/stores/:id/zones', h(async (req, res) => {
  const b = zoneInput.parse(req.body);
  if (!(await db.store.findUnique({ where: { id: req.params.id } }))) return res.status(404).json({ error: 'Store not found' });
  const clash = await suburbClash(req.params.id, b.suburbs); if (clash) return res.status(409).json({ error: clash });
  res.status(201).json(await db.deliveryZone.create({ data: { ...b, storeId: req.params.id } }));
}));
A.put('/zones/:id', h(async (req, res) => {
  const b = zoneInput.partial().parse(req.body);
  const zone = await db.deliveryZone.findUnique({ where: { id: req.params.id } }); if (!zone) return res.status(404).json({ error: 'Zone not found' });
  if (b.suburbs) { const clash = await suburbClash(zone.storeId, b.suburbs, zone.id); if (clash) return res.status(409).json({ error: clash }); }
  await db.deliveryZone.update({ where: { id: zone.id }, data: b });
  res.json({ ok: true });
}));

A.get('/wholesale', h(async (_, res) => res.json(await db.wholesaleRequest.findMany({ orderBy: { createdAt: 'desc' } }))));

adminRoutes.use(imageRoutes); // product photos (admin and store staff)
adminRoutes.use(importRoutes); // catalogue import from CSV (admin and store staff)
adminRoutes.use(A);
