import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet'; import cookieParser from 'cookie-parser'; import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs'; import jwt from 'jsonwebtoken'; import { z } from 'zod';
import { PrismaClient, Role, DeliveryStatus, OrderStatus, Prisma } from '@prisma/client';
import { provider } from './payments'; import { askVallerie, mentionedProducts } from './ai';

const db = new PrismaClient();
const SECRET = process.env.JWT_SECRET; if (!SECRET || SECRET.length < 24) throw new Error('Set a long JWT_SECRET in .env');
const app = express();
app.set('trust proxy', 'loopback'); // the Vite dev proxy forwards from localhost; needed for per-client rate limits
app.use(helmet(), express.json({ limit: '50kb' }), cookieParser());
app.use((req, res, next) => { // minimal CORS for the Vite frontend, with credentials
  const o = process.env.WEB_ORIGIN; if (o && req.headers.origin === o) { res.set({ 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE' }); }
  req.method === 'OPTIONS' ? res.sendStatus(204) : next();
});
app.use('/api', rateLimit({ windowMs: 60_000, limit: 200 }));

type U = { id: string; role: Role; name: string; email: string; phone: string | null; storeId?: string; customerId?: string; driverId?: string };
const h = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const me = (res: Response) => res.locals.user as U;
const num = (d: Prisma.Decimal | number) => Number(d);
const orderNo = (seq: number) => 'GV' + (10283 + seq);
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
type Tx = Prisma.TransactionClient;
const setOrderStatus = (tx: Tx, orderId: string, status: OrderStatus, actorUserId?: string) =>
  tx.order.update({ where: { id: orderId }, data: { status, events: { create: { status, actorUserId } } } });

// ---- auth: role is ALWAYS loaded from the DB, never trusted from the client or token claims ----
async function load(req: Request, res: Response, next: NextFunction) {
  const t = req.cookies?.gvo; if (!t) return next();
  try {
    const { sub } = jwt.verify(t, SECRET!) as { sub: string };
    const u = await db.user.findUnique({ where: { id: sub }, include: { customer: true, driver: true, staff: true } });
    if (u?.active) res.locals.user = { id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone, storeId: u.staff?.storeId, customerId: u.customer?.id, driverId: u.driver?.id } as U;
  } catch { /* invalid token = anonymous */ }
  next();
}
app.use(load);
const need = (...roles: Role[]) => (_: Request, res: Response, next: NextFunction) => {
  const u = res.locals.user as U | undefined; if (!u) return res.status(401).json({ error: 'Login required' });
  if (!roles.includes(u.role)) return res.status(403).json({ error: 'Forbidden' }); next();
};
const setSession = (res: Response, id: string) => res.cookie('gvo', jwt.sign({ sub: id }, SECRET!, { expiresIn: '7d' }), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 864e5 });
const authLimit = rateLimit({ windowMs: 15 * 60_000, limit: 30 });

const A = express.Router();
A.post('/register', authLimit, h(async (req, res) => {
  const b = z.object({ email: z.string().email(), password: z.string().min(8).max(100), name: z.string().min(1).max(80), phone: z.string().max(20).optional() }).parse(req.body);
  if (await db.user.findUnique({ where: { email: b.email.toLowerCase() } })) return res.status(409).json({ error: 'Email already registered' });
  const { password, ...profile } = b; // never pass the plaintext password to the database layer
  const u = await db.user.create({ data: { ...profile, email: b.email.toLowerCase(), passwordHash: await bcrypt.hash(password, 12), role: 'CUSTOMER', customer: { create: {} } } });
  setSession(res, u.id); res.status(201).json({ id: u.id, name: u.name, role: u.role });
}));
A.post('/login', authLimit, h(async (req, res) => {
  const b = z.object({ email: z.string().email(), password: z.string().max(100) }).parse(req.body);
  const u = await db.user.findUnique({ where: { email: b.email.toLowerCase() } });
  if (!u || !u.active || !(await bcrypt.compare(b.password, u.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
  setSession(res, u.id); res.json({ id: u.id, name: u.name, role: u.role });
}));
A.post('/logout', (_, res) => { res.clearCookie('gvo'); res.json({ ok: true }); });
A.get('/me', (_, res) => { const u = res.locals.user as U | undefined; res.json(u ? { id: u.id, name: u.name, role: u.role, email: u.email, phone: u.phone } : null); });
app.use('/api/auth', A);

// ---- public catalogue ----
// store.config holds public display settings only (accent colours, hours, WhatsApp number, compliance text)
const storeSelect = { id: true, slug: true, name: true, category: true, description: true, status: true, ageRestricted: true, config: true } satisfies Prisma.StoreSelect;
app.get('/api/stores', h(async (_, res) => res.json(await db.store.findMany({ select: storeSelect, orderBy: { createdAt: 'asc' } }))));
app.get('/api/stores/:slug', h(async (req, res) => {
  const s = await db.store.findUnique({ where: { slug: req.params.slug }, select: { ...storeSelect, zones: { where: { active: true }, select: { id: true, name: true, fee: true } } } });
  s ? res.json(s) : res.status(404).json({ error: 'Store not found' });
}));
app.get('/api/categories', h(async (_, res) => res.json(await db.category.findMany())));
app.get('/api/products', h(async (req, res) => {
  const q = z.object({ store: z.string().optional(), q: z.string().max(60).optional(), category: z.string().optional(), max: z.coerce.number().optional(), inStock: z.enum(['1']).optional(), sort: z.enum(['popular', 'low', 'high']).default('popular') }).parse(req.query);
  const where: Prisma.ProductWhereInput = { active: true, store: { status: 'ACTIVE', ...(q.store ? { slug: q.store } : {}) }, ...(q.category ? { category: { name: q.category } } : {}), ...(q.max ? { price: { lte: q.max } } : {}), ...(q.inStock ? { inventory: { quantity: { gt: 0 } } } : {}), ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }] } : {}) };
  res.json(await db.product.findMany({ where, include: { category: true, inventory: { select: { quantity: true, lowThreshold: true } } }, orderBy: q.sort === 'popular' ? { popularity: 'desc' } : { price: q.sort === 'low' ? 'asc' : 'desc' } }));
}));
app.get('/api/products/:id', h(async (req, res) => {
  const p = await db.product.findFirst({ where: { id: req.params.id, active: true, store: { status: 'ACTIVE' } }, include: { category: true, store: { select: { slug: true, name: true } }, inventory: { select: { quantity: true, lowThreshold: true } } } });
  p ? res.json(p) : res.status(404).json({ error: 'Product not found' });
}));
app.get('/api/stores/:slug/zones', h(async (req, res) => res.json(await db.deliveryZone.findMany({ where: { active: true, store: { slug: req.params.slug } } }))));
app.get('/api/products/:id/qa', h(async (req, res) => res.json(await db.question.findMany({ where: { productId: req.params.id }, include: { answers: { where: { approved: true }, select: { text: true } } } }))));
app.post('/api/products/:id/questions', need('CUSTOMER'), h(async (req, res) => {
  const { text } = z.object({ text: z.string().min(3).max(300) }).parse(req.body);
  res.status(201).json(await db.question.create({ data: { text, productId: req.params.id, customerId: me(res).customerId } }));
}));
app.post('/api/wholesale', h(async (req, res) => {
  const b = z.object({ name: z.string().min(1).max(80), business: z.string().max(120), phone: z.string().max(20), email: z.string().email(), products: z.string().max(500), quantity: z.string().max(100), preferredDate: z.string().max(30).optional(), notes: z.string().max(500).optional() }).parse(req.body);
  res.status(201).json(await db.wholesaleRequest.create({ data: b }));
}));

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
// South African numbers: 0XX XXX XXXX or +27 XX XXX XXXX (spaces and dashes allowed); stored as entered, trimmed.
const saPhone = z.string().trim().refine(v => /^(\+27|0)\d{9}$/.test(v.replace(/[\s-]/g, '')), 'Enter a valid South African phone number');

// ---- orders: the server recomputes every price; client totals are ignored ----
const O = express.Router(); O.use(need('CUSTOMER'));
O.post('/', h(async (req, res) => {
  const b = z.object({ storeSlug: z.string(), fulfilment: z.enum(['DELIVERY', 'COLLECTION']), zoneId: z.string().optional(),
    contact: z.object({ firstName: z.string().trim().min(1).max(60), lastName: z.string().trim().min(1).max(60), phone: saPhone, email: z.string().trim().email().max(120) }),
    address: z.object({ street: z.string().trim().min(3).max(120), area: z.string().trim().min(2).max(80), city: z.string().trim().min(2).max(80),
      province: z.enum(PROVINCES), postalCode: z.string().trim().regex(/^\d{4}$/, 'Use a 4-digit postal code') }).optional(),
    items: z.array(z.object({ productId: z.string(), quantity: z.number().positive().max(100) })).min(1).max(50) }).parse(req.body);
  const store = await db.store.findFirst({ where: { slug: b.storeSlug, status: 'ACTIVE' } }); if (!store) return res.status(400).json({ error: 'Store not available' });
  if (store.ageRestricted) return res.status(400).json({ error: 'Age verification flow required for this store' });
  let fee = 0; if (b.fulfilment === 'DELIVERY') {
    if (!b.address || !b.zoneId) return res.status(400).json({ error: 'Address and delivery zone required' });
    const zone = await db.deliveryZone.findFirst({ where: { id: b.zoneId, storeId: store.id, active: true } }); if (!zone) return res.status(400).json({ error: 'Invalid delivery zone' }); fee = num(zone.fee);
  }
  const order = await db.$transaction(async tx => {
    // Money uses exact decimals (Prisma.Decimal), each line rounded half-up to the cent.
    let subtotal = new Prisma.Decimal(0); const items: Prisma.OrderItemCreateWithoutOrderInput[] = [];
    for (const i of b.items) {
      const p = await tx.product.findFirst({ where: { id: i.productId, storeId: store.id, active: true }, include: { inventory: true } });
      if (!p || !p.inventory) throw fail(400, 'Product unavailable');
      if (!p.soldByWeight && !Number.isInteger(i.quantity)) throw fail(400, `${p.name} is sold per item; use a whole number`);
      if (p.soldByWeight && Math.abs(i.quantity * 100 - Math.round(i.quantity * 100)) > 1e-6) throw fail(400, 'Weight can have at most 2 decimal places');
      const upd = await tx.inventory.updateMany({ where: { productId: p.id, quantity: { gte: i.quantity } }, data: { quantity: { decrement: i.quantity } } });
      if (!upd.count) throw fail(409, `${p.name} does not have enough stock`);
      const line = p.price.mul(i.quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP); subtotal = subtotal.add(line);
      items.push({ product: { connect: { id: p.id } }, storeId: p.storeId, nameSnapshot: p.name, unitPrice: p.price, quantity: i.quantity, lineTotal: line });
    }
    const addr = b.address ? await tx.address.create({ data: { ...b.address, customerId: me(res).customerId! } }) : null;
    return tx.order.create({ data: { customerId: me(res).customerId, storeId: store.id, fulfilment: b.fulfilment,
      contactName: `${b.contact.firstName} ${b.contact.lastName}`, contactPhone: b.contact.phone, contactEmail: b.contact.email.toLowerCase(), subtotal, deliveryFee: fee, total: subtotal.add(fee), addressId: addr?.id, addressText: b.address && `${b.address.street}, ${b.address.area}`, area: b.address?.area, items: { create: items }, events: { create: { status: 'PLACED', actorUserId: me(res).id } } }, include: { items: true } });
  });
  res.status(201).json({ ...order, orderNumber: orderNo(order.seq) });
}));
O.get('/', h(async (_, res) => res.json((await db.order.findMany({ where: { customerId: me(res).customerId }, include: { items: true, payment: true, delivery: { select: { status: true } } }, orderBy: { createdAt: 'desc' } })).map(o => ({ ...o, orderNumber: orderNo(o.seq) })))));
O.get('/:id', h(async (req, res) => {
  const o = await db.order.findFirst({ where: { id: req.params.id, customerId: me(res).customerId }, include: { items: { include: { product: { select: { soldByWeight: true } } } }, address: { select: { street: true, area: true, city: true, province: true, postalCode: true } }, payment: { select: { id: true, status: true, method: true, provider: true, providerRef: true, createdAt: true } }, store: { select: { slug: true, name: true, config: true } } } });
  if (!o) return res.status(404).json({ error: 'Order not found' });
  res.json({ ...o, orderNumber: orderNo(o.seq), estimatedWindow: deliveryWindow(o) });
}));
O.get('/:id/tracking', h(async (req, res) => {
  const o = await db.order.findFirst({ where: { id: req.params.id, customerId: me(res).customerId }, include: trackingInclude });
  if (!o) return res.status(404).json({ error: 'Order not found' });
  res.json(tracking(o));
}));
O.post('/:id/reorder', h(async (req, res) => { // returns what can be re-added; the client then calls cart/checkout itself
  const o = await db.order.findFirst({ where: { id: req.params.id, customerId: me(res).customerId }, include: { items: { include: { product: { include: { inventory: true } } } } } });
  if (!o) return res.status(404).json({ error: 'Order not found' });
  res.json(o.items.map(i => ({ productId: i.productId, name: i.nameSnapshot, quantity: i.quantity, available: i.product.active && num(i.product.inventory?.quantity ?? 0) >= num(i.quantity) })));
}));
app.use('/api/orders', O);

// ---- payments (DEMO provider behind an interface) ----
app.post('/api/payments/:orderId/pay', need('CUSTOMER'), h(async (req, res) => {
  const { method } = z.object({ method: z.enum(['CARD', 'EFT']) }).parse(req.body); // no card fields are accepted at all
  const o = await db.order.findFirst({ where: { id: req.params.orderId, customerId: me(res).customerId }, include: { payment: true } });
  if (!o) return res.status(404).json({ error: 'Order not found' }); if (o.payment?.status === 'PAID') return res.status(409).json({ error: 'Already paid' });
  const r = await provider.charge({ orderId: o.id, amount: num(o.total), method });
  const out = await db.$transaction(async tx => {
    const pay = await tx.payment.upsert({ where: { orderId: o.id }, update: { status: r.status, providerRef: r.providerRef, method }, create: { orderId: o.id, provider: provider.name, providerRef: r.providerRef, method, status: r.status, amount: o.total } });
    if (r.status === 'PAID') {
      await setOrderStatus(tx, o.id, 'PAID', me(res).id);
      await setOrderStatus(tx, o.id, 'PREPARING');
      if (o.fulfilment === 'DELIVERY') await tx.delivery.upsert({ where: { orderId: o.id }, update: {}, create: { orderId: o.id, updates: { create: { status: 'PENDING' } } } });
    } return pay;
  });
  res.json({ paymentId: out.id, providerRef: out.providerRef, orderId: o.id, orderNumber: orderNo(o.seq), status: out.status, demo: provider.name === 'demo' });
}));

// ---- deliveries: drivers only touch their own (or claim an unassigned one); transitions are enforced ----
const NEXT: Partial<Record<DeliveryStatus, DeliveryStatus>> = { PENDING: 'ASSIGNED', ASSIGNED: 'OUT_FOR_DELIVERY', READY_FOR_PICKUP: 'ASSIGNED', OUT_FOR_DELIVERY: 'ARRIVED', ARRIVED: 'DELIVERED' };
const D = express.Router(); D.use(need('DRIVER'));
D.get('/mine', h(async (_, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const list = await db.delivery.findMany({ where: { OR: [
      { driverId: me(res).driverId, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
      { driverId: me(res).driverId, status: 'DELIVERED', deliveredAt: { gte: today } },
      { driverId: null, status: { in: ['PENDING', 'READY_FOR_PICKUP'] } }] },
    include: { order: { select: { seq: true, area: true, addressText: true, total: true, createdAt: true, customer: { select: { user: { select: { name: true } } } } } } }, orderBy: { order: { createdAt: 'asc' } } });
  res.json(list.map(d => ({ ...d, orderNumber: orderNo(d.order.seq), mine: d.driverId === me(res).driverId })));
}));
D.post('/:id/advance', h(async (req, res) => {
  const u = me(res); const now = new Date();
  const nd = await db.$transaction(async tx => {
    const d = await tx.delivery.findUnique({ where: { id: req.params.id }, include: { order: { select: { status: true } } } }); if (!d) throw fail(404, 'Not found');
    if (d.driverId && d.driverId !== u.driverId) throw fail(403, 'Not your delivery');
    const to = NEXT[d.status]; if (!to) throw fail(409, 'No further transition');
    const stamp = to === 'ASSIGNED' ? { assignedAt: now, pickedUpAt: now } : to === 'OUT_FOR_DELIVERY' ? { departedAt: now } : to === 'ARRIVED' ? { arrivedAt: now } : { deliveredAt: now };
    // Conditional update: only succeeds if nobody else claimed or advanced it since we read it.
    const r = await tx.delivery.updateMany({ where: { id: d.id, status: d.status, driverId: d.driverId }, data: { status: to, driverId: u.driverId, ...stamp } });
    if (!r.count) throw fail(409, 'This delivery was just updated by someone else. Refresh and try again.');
    await tx.deliveryStatusUpdate.create({ data: { deliveryId: d.id, status: to, actorUserId: u.id } });
    if (to === 'ASSIGNED' && (d.order.status === 'PAID' || d.order.status === 'PREPARING')) await setOrderStatus(tx, d.orderId, 'PACKED', u.id);
    if (to === 'OUT_FOR_DELIVERY' || to === 'DELIVERED') await setOrderStatus(tx, d.orderId, to, u.id);
    return tx.delivery.findUniqueOrThrow({ where: { id: d.id } });
  });
  res.json(nd);
}));
app.use('/api/deliveries', D);

// ---- admin / store staff (staff are scoped to their own store) ----
const AD = express.Router(); AD.use(need('ADMIN', 'STORE_STAFF'));
const scope = (res: Response) => (me(res).role === 'ADMIN' ? {} : { storeId: me(res).storeId });
AD.get('/stats', h(async (_, res) => {
  const since = new Date(); since.setHours(0, 0, 0, 0); const w = { ...scope(res), createdAt: { gte: since } };
  const [sales, orders, byStatus] = await Promise.all([db.order.aggregate({ where: { ...w, payment: { status: 'PAID' } }, _sum: { total: true } }), db.order.count({ where: w }), db.order.groupBy({ by: ['status'], where: w, _count: true })]);
  res.json({ todaysSales: num(sales._sum.total ?? 0), todaysOrders: orders, byStatus });
}));
AD.get('/orders', h(async (_, res) => res.json(await db.order.findMany({ where: scope(res), include: { items: true, payment: true, delivery: { include: { driver: { include: { user: { select: { name: true } } } } } } }, orderBy: { createdAt: 'desc' }, take: 100 }))));
AD.patch('/orders/:id/status', h(async (req, res) => {
  const { status } = z.object({ status: z.enum(['PREPARING', 'PACKED', 'READY_FOR_COLLECTION', 'COLLECTED', 'CANCELLED']) }).parse(req.body);
  const o = await db.order.findFirst({ where: { id: req.params.id, ...scope(res) }, select: { id: true } }); if (!o) return res.status(404).json({ error: 'Not found' });
  await db.$transaction(tx => setOrderStatus(tx, o.id, status, me(res).id)); res.json({ ok: true });
}));
const prod = z.object({ name: z.string().min(1).max(100), description: z.string().max(500), price: z.number().positive().max(100000), categoryId: z.string(), soldByWeight: z.boolean(), imageUrl: z.string().url().optional(), quantity: z.number().min(0).default(0) });
AD.post('/products', h(async (req, res) => {
  const b = prod.parse(req.body); const storeId = me(res).role === 'ADMIN' ? z.string().parse(req.body.storeId) : me(res).storeId!;
  const { quantity, ...rest } = b; res.status(201).json(await db.product.create({ data: { ...rest, storeId, inventory: { create: { quantity } } } }));
}));
AD.patch('/products/:id', h(async (req, res) => {
  const b = prod.partial().extend({ active: z.boolean().optional() }).parse(req.body); const { quantity, ...rest } = b;
  const r = await db.product.updateMany({ where: { id: req.params.id, ...scope(res) }, data: rest }); if (!r.count) return res.status(404).json({ error: 'Not found' });
  if (quantity !== undefined) await db.inventory.upsert({ where: { productId: req.params.id }, update: { quantity }, create: { productId: req.params.id, quantity } }); res.json({ ok: true });
}));
AD.delete('/products/:id', h(async (req, res) => { const r = await db.product.updateMany({ where: { id: req.params.id, ...scope(res) }, data: { active: false } }); r.count ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' }); })); // soft delete keeps order history intact
AD.get('/inventory', h(async (_, res) => res.json(await db.inventory.findMany({ where: { product: scope(res) }, include: { product: { select: { name: true } } } }))));
AD.get('/wholesale', need('ADMIN'), h(async (_, res) => res.json(await db.wholesaleRequest.findMany({ orderBy: { createdAt: 'desc' } }))));
AD.post('/questions/:id/answer', h(async (req, res) => {
  const { text } = z.object({ text: z.string().min(1).max(500) }).parse(req.body);
  if (!(await db.question.findFirst({ where: { id: req.params.id, product: scope(res) } }))) return res.status(404).json({ error: 'Question not found' });
  res.status(201).json(await db.answer.create({ data: { questionId: req.params.id, text, approved: true, authorUserId: me(res).id } }));
}));
AD.put('/zones/:id', h(async (req, res) => { const b = z.object({ fee: z.number().min(0).max(5000) }).parse(req.body); const r = await db.deliveryZone.updateMany({ where: { id: req.params.id, store: scope(res).storeId ? { id: scope(res).storeId } : {} }, data: b }); r.count ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' }); }));
const AM = express.Router(); AM.use(need('ADMIN'));
AM.post('/drivers', h(async (req, res) => {
  const b = z.object({ email: z.string().email(), name: z.string().min(1), password: z.string().min(8), vehicle: z.string().optional() }).parse(req.body);
  const u = await db.user.create({ data: { email: b.email.toLowerCase(), name: b.name, role: 'DRIVER', passwordHash: await bcrypt.hash(b.password, 12), driver: { create: { vehicle: b.vehicle } } } }); res.status(201).json({ id: u.id });
}));
AM.patch('/users/:id/active', h(async (req, res) => { const { active } = z.object({ active: z.boolean() }).parse(req.body); await db.user.update({ where: { id: req.params.id }, data: { active } }); res.json({ ok: true }); }));
app.use('/api/admin', AD, AM);

// ---- Vallerie ----
const aiLimit = rateLimit({ windowMs: 60_000, limit: 15 });
app.post('/api/ai/chat', aiLimit, h(async (req, res) => {
  const b = z.object({ message: z.string().min(1).max(500), history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1000) })).max(10).default([]), storeSlug: z.string().default('meat-market') }).parse(req.body);
  const store = await db.store.findFirst({ where: { slug: b.storeSlug, status: 'ACTIVE' }, include: { zones: { where: { active: true } } } });
  if (!store) return res.status(400).json({ error: 'Unknown store' });
  const prods = await db.product.findMany({ where: { storeId: store.id, active: true }, include: { category: true, inventory: true, questions: { include: { answers: { where: { approved: true } } } } } });
  const catalogue = prods.map(p => { const q = num(p.inventory?.quantity ?? 0), low = num(p.inventory?.lowThreshold ?? 5);
    return `- ${p.name} | ${p.category.name} | R${num(p.price).toFixed(2)}${p.soldByWeight ? '/kg' : ' each'} | ${q <= 0 ? 'OUT OF STOCK' : q <= low ? 'LOW STOCK' : 'In stock'} | ${p.description}`; }).join('\n');
  const qa = prods.flatMap(p => p.questions.filter(x => x.answers.length).map(x => `Q (${p.name}): ${x.text} A: ${x.answers[0].text}`)).slice(0, 20).join('\n');
  let own = ''; const u = res.locals.user as U | undefined;
  if (u?.customerId) { const o = await db.order.findFirst({ where: { customerId: u.customerId }, orderBy: { createdAt: 'desc' }, include: { delivery: true } }); if (o) own = `Customer's latest order ${orderNo(o.seq)}: status ${o.status}${o.delivery ? ', delivery ' + o.delivery.status : ''}. Total R${num(o.total).toFixed(2)}.`; }
  const ctx = `Store: ${store.name} - ${store.description}\nAll prices are DEMO prices in ZAR.\nDelivery zones (demo fees): ${store.zones.map(z => `${z.name} R${num(z.fee)}`).join('; ')}. Collection from store is also available.${Array.isArray((store.config as any)?.deliveryWindowMinutes) ? ` Demo delivery estimate: about ${(store.config as any).deliveryWindowMinutes[0]}-${(store.config as any).deliveryWindowMinutes[1]} minutes after payment (an estimate, not a guarantee).` : ' No delivery time estimate is configured.'} Weight-based prices are per kg; the final price may vary slightly based on the actual weighed quantity. Payment is currently a DEMO (no real money). Large or business orders can use the Bulk & Wholesale quote form.\nCATALOGUE:\n${catalogue}\nAPPROVED Q&A:\n${qa || 'none'}\n${own}`;
  try {
    const reply = await askVallerie(ctx, b.history, b.message);
    res.json({ reply, products: mentionedProducts(reply, prods) });
  }
  catch (e) { console.error('AI error', (e as Error).message); res.status(503).json({ error: 'AI_UNAVAILABLE', reply: 'Vallerie is temporarily unavailable. You can continue shopping normally.' }); }
}));

app.use((e: any, _: Request, res: Response, __: NextFunction) => {
  if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: e.flatten().fieldErrors });
  if (e?.status) return res.status(e.status).json({ error: e.message });
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return res.status(409).json({ error: 'Already exists' });
  console.error(e); res.status(500).json({ error: 'Something went wrong' });
});
app.listen(+(process.env.PORT || 4000), () => console.log('Green Valley API on :' + (process.env.PORT || 4000)));
