// Store and product reviews. Only customers with a completed (delivered or collected) order may review,
// once per product or store. Only first names are shown publicly.
import express, { Response } from 'express';
import { z } from 'zod';
import { db, fail, h, me, need, type U } from '../core';

const COMPLETED = ['DELIVERED', 'COLLECTED'] as const;
const target = z.object({ productId: z.string().optional(), storeSlug: z.string().optional() }).refine(t => !!t.productId !== !!t.storeSlug, 'Give a productId or a storeSlug');

async function resolve(t: { productId?: string; storeSlug?: string }) {
  if (t.productId) {
    const p = await db.product.findFirst({ where: { id: t.productId, deletedAt: null }, select: { id: true, storeId: true } });
    if (!p) throw fail(404, 'Product not found');
    return { storeId: p.storeId, productId: p.id as string | null };
  }
  const s = await db.store.findUnique({ where: { slug: t.storeSlug! }, select: { id: true } });
  if (!s) throw fail(404, 'Store not found');
  return { storeId: s.id, productId: null as string | null };
}
async function eligibility(res: Response, t: { storeId: string; productId: string | null }) {
  const u = res.locals.user as U | undefined;
  if (!u?.customerId) return { canReview: false, reviewed: false, reason: 'Sign in to review' };
  const reviewed = !!(await db.review.findFirst({ where: { customerId: u.customerId, storeId: t.storeId, productId: t.productId } }));
  const bought = !!(await db.order.findFirst({ where: { customerId: u.customerId, status: { in: [...COMPLETED] }, ...(t.productId ? { items: { some: { productId: t.productId } } } : { storeId: t.storeId }) } }));
  return { canReview: bought && !reviewed, reviewed, reason: reviewed ? 'You have already reviewed this' : bought ? null : 'Reviews open after your order is delivered or collected' };
}

export const reviewRoutes = express.Router();

reviewRoutes.get('/', h(async (req, res) => {
  const t = await resolve(target.parse(req.query));
  const where = { storeId: t.storeId, productId: t.productId };
  const [agg, list] = await Promise.all([
    db.review.aggregate({ where, _avg: { rating: true }, _count: true }),
    db.review.findMany({ where, include: { customer: { select: { user: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  res.json({
    average: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null, count: agg._count,
    reviews: list.map(r => ({ id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt, name: r.customer.user.name.trim().split(/\s+/)[0] })),
    ...(await eligibility(res, t)),
  });
}));

reviewRoutes.post('/', need('CUSTOMER'), h(async (req, res) => {
  const b = z.object({ productId: z.string().optional(), storeSlug: z.string().optional(), rating: z.number().int().min(1).max(5), comment: z.string().trim().min(3, 'Write at least a few words').max(500) })
    .refine(t => !!t.productId !== !!t.storeSlug, 'Give a productId or a storeSlug').parse(req.body);
  const t = await resolve(b);
  const e = await eligibility(res, t);
  if (!e.canReview) throw fail(403, e.reason ?? 'You cannot review this');
  res.status(201).json(await db.review.create({ data: { customerId: me(res).customerId!, storeId: t.storeId, productId: t.productId, rating: b.rating, comment: b.comment } }));
}));
