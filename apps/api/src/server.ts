import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet'; import cookieParser from 'cookie-parser'; import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs'; import jwt from 'jsonwebtoken'; import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db, h, me, need, num, orderNo, type U } from './core';
import { driverRoutes } from './routes/driver';
import { adminRoutes } from './routes/admin';
import { orderRoutes, paymentRoutes } from './routes/orders';
import { accountRoutes } from './routes/account';
import { reviewRoutes } from './routes/reviews';
import { askVallerie, mentionedProducts } from './ai';

const SECRET = process.env.JWT_SECRET; if (!SECRET || SECRET.length < 24) throw new Error('Set a long JWT_SECRET in .env');
const app = express();
app.set('trust proxy', 'loopback'); // the Vite dev proxy forwards from localhost; needed for per-client rate limits
app.use(helmet(), express.json({ limit: '50kb' }), cookieParser());
app.use((req, res, next) => { // minimal CORS for the Vite frontend, with credentials
  const o = process.env.WEB_ORIGIN; if (o && req.headers.origin === o) { res.set({ 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-Order-Token', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE' }); }
  req.method === 'OPTIONS' ? res.sendStatus(204) : next();
});
app.use('/api', rateLimit({ windowMs: 60_000, limit: 200 }));

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
  const where: Prisma.ProductWhereInput = { active: true, deletedAt: null, store: { status: 'ACTIVE', ...(q.store ? { slug: q.store } : {}) }, ...(q.category ? { category: { name: q.category } } : {}), ...(q.max ? { price: { lte: q.max } } : {}), ...(q.inStock ? { inventory: { quantity: { gt: 0 } } } : {}), ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }] } : {}) };
  res.json(await db.product.findMany({ where, include: { category: true, store: { select: { slug: true, name: true, ageRestricted: true } }, inventory: { select: { quantity: true, lowThreshold: true } } }, orderBy: q.sort === 'popular' ? { popularity: 'desc' } : { price: q.sort === 'low' ? 'asc' : 'desc' } }));
}));
app.get('/api/products/:id', h(async (req, res) => {
  const p = await db.product.findFirst({ where: { id: req.params.id, active: true, store: { status: 'ACTIVE' } }, include: { category: true, store: { select: { slug: true, name: true, ageRestricted: true, config: true } }, inventory: { select: { quantity: true, lowThreshold: true } } } });
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

app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/deliveries', driverRoutes);
app.use('/api/admin', adminRoutes);

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
