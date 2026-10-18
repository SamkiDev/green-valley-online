// A signed-in customer's cart, saved to their account so it follows them between phone and laptop.
// Guests keep their cart in the browser only. Prices are never stored here; checkout recomputes everything.
import express from 'express';
import { z } from 'zod';
import { db, h, me, need } from '../core';

export const cartRoutes = express.Router();
cartRoutes.use(need('CUSTOMER'));

const shape = (c: { storeSlug: string; fulfilment: 'DELIVERY' | 'COLLECTION'; zoneId: string | null; items: { productId: string; quantity: unknown }[]; updatedAt: Date } | null) =>
  c ? { storeSlug: c.storeSlug, fulfilment: c.fulfilment, zoneId: c.zoneId, lines: c.items.map(i => ({ productId: i.productId, quantity: Number(i.quantity) })), updatedAt: c.updatedAt } : null;

cartRoutes.get('/', h(async (_, res) => {
  res.json(shape(await db.cart.findUnique({ where: { customerId: me(res).customerId! }, include: { items: true } })));
}));

cartRoutes.put('/', h(async (req, res) => {
  const b = z.object({
    storeSlug: z.string().min(1).max(60), fulfilment: z.enum(['DELIVERY', 'COLLECTION']), zoneId: z.string().max(40).nullable(),
    lines: z.array(z.object({ productId: z.string().min(1).max(40), quantity: z.number().positive().max(100) })).max(50),
  }).parse(req.body);
  const store = await db.store.findUnique({ where: { slug: b.storeSlug }, select: { id: true } });
  // Keep only products that exist in that store; anything else is dropped quietly.
  const valid = store ? await db.product.findMany({ where: { id: { in: b.lines.map(l => l.productId) }, storeId: store.id, deletedAt: null }, select: { id: true } }) : [];
  const ok = new Set(valid.map(p => p.id));
  const lines = [...new Map(b.lines.filter(l => ok.has(l.productId)).map(l => [l.productId, l])).values()];
  const customerId = me(res).customerId!;
  const cart = await db.$transaction(async tx => {
    const c = await tx.cart.upsert({ where: { customerId }, update: { storeSlug: b.storeSlug, fulfilment: b.fulfilment, zoneId: b.zoneId }, create: { customerId, storeSlug: b.storeSlug, fulfilment: b.fulfilment, zoneId: b.zoneId } });
    await tx.cartItem.deleteMany({ where: { cartId: c.id } });
    if (lines.length) await tx.cartItem.createMany({ data: lines.map(l => ({ cartId: c.id, productId: l.productId, quantity: Math.round(l.quantity * 100) / 100 })) });
    return tx.cart.findUnique({ where: { id: c.id }, include: { items: true } });
  });
  res.json(shape(cart));
}));
