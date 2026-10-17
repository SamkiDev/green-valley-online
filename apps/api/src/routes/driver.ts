// Driver portal API. Drivers see only their own deliveries plus unassigned ones they can claim.
// Every action is a conditional update, so two drivers (or a double tap) can't both move the same delivery.
import express from 'express';
import { z } from 'zod';
import { DeliveryStatus, Prisma } from '@prisma/client';
import { db, fail, h, me, need, orderNo, setOrderStatus } from '../core';

const NEXT: Partial<Record<DeliveryStatus, DeliveryStatus>> = { PENDING: 'ASSIGNED', READY_FOR_PICKUP: 'ASSIGNED', ASSIGNED: 'OUT_FOR_DELIVERY', OUT_FOR_DELIVERY: 'ARRIVED', ARRIVED: 'DELIVERED' };

const orderForDriver = {
  select: {
    id: true, seq: true, status: true, area: true, addressText: true, total: true, createdAt: true, contactName: true, contactPhone: true, ageConfirmedAt: true,
    store: { select: { name: true, ageRestricted: true, config: true } }, // age-restricted orders need an ID check at the door
    address: { select: { street: true, area: true, city: true, province: true, postalCode: true } },
    items: { select: { nameSnapshot: true, quantity: true, product: { select: { soldByWeight: true } } } },
    customer: { select: { user: { select: { name: true } } } },
  },
} satisfies Prisma.OrderDefaultArgs;

export const driverRoutes = express.Router();
driverRoutes.use(need('DRIVER'));

driverRoutes.get('/mine', h(async (_, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const driverId = me(res).driverId;
  const list = await db.delivery.findMany({
    where: { OR: [
      { driverId, status: { notIn: ['DELIVERED', 'CANCELLED', 'FAILED'] } },
      { driverId, status: 'DELIVERED', deliveredAt: { gte: today } },
      { driverId: null, status: { in: ['PENDING', 'READY_FOR_PICKUP'] } },
    ] },
    include: { order: orderForDriver },
    orderBy: { order: { createdAt: 'asc' } },
  });
  res.json(list.map(d => ({ ...d, orderNumber: orderNo(d.order.seq), mine: d.driverId === driverId })));
}));

driverRoutes.get('/history', h(async (_, res) => {
  const list = await db.delivery.findMany({ where: { driverId: me(res).driverId, status: 'DELIVERED' }, include: { order: { select: { seq: true, area: true, total: true } } }, orderBy: { deliveredAt: 'desc' }, take: 30 });
  res.json(list.map(d => ({ id: d.id, orderNumber: orderNo(d.order.seq), area: d.order.area, total: d.order.total, deliveredAt: d.deliveredAt })));
}));

driverRoutes.post('/:id/advance', h(async (req, res) => {
  // `from` is the status the driver saw on screen; if it changed meanwhile, nothing happens (no double advance).
  const { from } = z.object({ from: z.nativeEnum(DeliveryStatus).optional() }).parse(req.body ?? {});
  const u = me(res); const now = new Date();
  const nd = await db.$transaction(async tx => {
    const d = await tx.delivery.findUnique({ where: { id: req.params.id }, include: { order: { select: { status: true } } } });
    if (!d) throw fail(404, 'Delivery not found');
    if (d.driverId && d.driverId !== u.driverId) throw fail(403, 'This delivery belongs to another driver');
    if (from && d.status !== from) throw fail(409, 'This delivery was already updated. Refresh to see the latest status.');
    if (d.order.status === 'CANCELLED') throw fail(409, 'This order was cancelled');
    const to = NEXT[d.status]; if (!to) throw fail(409, 'This delivery is already complete');
    const stamp = to === 'ASSIGNED' ? { assignedAt: now } : to === 'OUT_FOR_DELIVERY' ? { pickedUpAt: now, departedAt: now } : to === 'ARRIVED' ? { arrivedAt: now } : { deliveredAt: now };
    const r = await tx.delivery.updateMany({ where: { id: d.id, status: d.status, driverId: d.driverId }, data: { status: to, driverId: u.driverId, ...stamp } });
    if (!r.count) throw fail(409, 'This delivery was just updated by someone else. Refresh and try again.');
    await tx.deliveryStatusUpdate.create({ data: { deliveryId: d.id, status: to, actorUserId: u.id } });
    // Keep the order's own status (and the customer's timeline) in step with the delivery.
    const preparing = d.order.status === 'PAID' || d.order.status === 'PREPARING';
    if (to === 'ASSIGNED' && preparing) await setOrderStatus(tx, d.orderId, 'PACKED', u.id);
    if (to === 'OUT_FOR_DELIVERY') { if (preparing) await setOrderStatus(tx, d.orderId, 'PACKED', u.id); await setOrderStatus(tx, d.orderId, 'OUT_FOR_DELIVERY', u.id); }
    if (to === 'DELIVERED') await setOrderStatus(tx, d.orderId, 'DELIVERED', u.id);
    return tx.delivery.findUniqueOrThrow({ where: { id: d.id } });
  });
  res.json(nd);
}));
