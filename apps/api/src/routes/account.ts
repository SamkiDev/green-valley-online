// "My account": profile, password, saved addresses and favourites. Customers only see and change their own data.
import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, fail, h, limit, me, need, saPhone, setSession } from '../core';
import { addressInput } from './orders';

export const accountRoutes = express.Router();
accountRoutes.use(need('CUSTOMER', 'STORE_STAFF', 'DRIVER', 'ADMIN'));

accountRoutes.patch('/profile', h(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(80), phone: z.union([z.literal(''), saPhone]).optional() }).parse(req.body);
  const u = await db.user.update({ where: { id: me(res).id }, data: { name: b.name, ...(b.phone !== undefined ? { phone: b.phone || null } : {}) } });
  res.json({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role });
}));

accountRoutes.post('/password', limit(15 * 60_000, 10, 'Too many password attempts. Please try again in 15 minutes.', { skipSuccessfulRequests: true }), h(async (req, res) => {
  const b = z.object({ current: z.string().min(1).max(100), next: z.string().min(8).max(100) }).parse(req.body);
  const u = await db.user.findUniqueOrThrow({ where: { id: me(res).id } });
  if (!(await bcrypt.compare(b.current, u.passwordHash))) throw fail(400, 'Your current password is incorrect');
  if (b.current === b.next) throw fail(400, 'Choose a password you have not used here');
  // A new password signs out every other device; this one gets a fresh session.
  const updated = await db.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(b.next, 12), mustChangePassword: false, tokenVersion: { increment: 1 } } });
  setSession(res, updated.id, updated.tokenVersion);
  res.json({ ok: true });
}));

accountRoutes.post('/logout-all', h(async (_req, res) => { // sign out on every device, including this one
  await db.user.update({ where: { id: me(res).id }, data: { tokenVersion: { increment: 1 } } });
  res.clearCookie('gvo');
  res.json({ ok: true });
}));

// ---- saved addresses (order addresses are kept separately so past orders never change) ----
const C = express.Router(); C.use(need('CUSTOMER'));
const addrSelect = { id: true, label: true, street: true, area: true, city: true, province: true, postalCode: true } as const;
C.get('/addresses', h(async (_, res) => res.json(await db.address.findMany({ where: { customerId: me(res).customerId, saved: true }, select: addrSelect, orderBy: { createdAt: 'desc' } }))));
C.post('/addresses', h(async (req, res) => {
  const b = addressInput.extend({ label: z.string().trim().max(40).optional() }).parse(req.body);
  if ((await db.address.count({ where: { customerId: me(res).customerId, saved: true } })) >= 10) throw fail(400, 'You can save up to 10 addresses');
  res.status(201).json(await db.address.create({ data: { ...b, customerId: me(res).customerId, saved: true }, select: addrSelect }));
}));
C.delete('/addresses/:id', h(async (req, res) => { // un-save only: orders that used it keep their address
  const r = await db.address.updateMany({ where: { id: req.params.id, customerId: me(res).customerId, saved: true }, data: { saved: false } });
  r.count ? res.json({ ok: true }) : res.status(404).json({ error: 'Address not found' });
}));

// ---- favourites ----
C.get('/favourites', h(async (_, res) => {
  const favs = await db.favourite.findMany({ where: { customerId: me(res).customerId, product: { deletedAt: null } }, include: { product: { include: { category: true, inventory: { select: { quantity: true, lowThreshold: true } }, store: { select: { slug: true, name: true, status: true } } } } } });
  res.json(favs.map(f => ({ ...f.product, available: f.product.active && f.product.store.status === 'ACTIVE' })));
}));
const favProduct = async (id: string) => { if (!(await db.product.findFirst({ where: { id, deletedAt: null } }))) throw fail(404, 'Product not found'); };
C.put('/favourites/:productId', h(async (req, res) => {
  await favProduct(req.params.productId);
  await db.favourite.upsert({ where: { customerId_productId: { customerId: me(res).customerId!, productId: req.params.productId } }, update: {}, create: { customerId: me(res).customerId!, productId: req.params.productId } });
  res.json({ ok: true });
}));
C.delete('/favourites/:productId', h(async (req, res) => {
  await db.favourite.deleteMany({ where: { customerId: me(res).customerId, productId: req.params.productId } });
  res.json({ ok: true });
}));
// Favourites saved on this device before signing in are merged into the account once.
C.post('/favourites/merge', h(async (req, res) => {
  const { productIds } = z.object({ productIds: z.array(z.string()).max(100) }).parse(req.body);
  const valid = await db.product.findMany({ where: { id: { in: productIds }, deletedAt: null }, select: { id: true } });
  await db.favourite.createMany({ data: valid.map(p => ({ customerId: me(res).customerId!, productId: p.id })), skipDuplicates: true });
  res.json({ merged: valid.length });
}));
accountRoutes.use(C);
