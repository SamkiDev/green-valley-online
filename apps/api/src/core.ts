// Shared helpers for all route modules.
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { PrismaClient, Role, OrderStatus, Prisma } from '@prisma/client';

export const db = new PrismaClient();

export type U = { id: string; role: Role; name: string; email: string; phone: string | null; mustChangePassword: boolean; storeId?: string; customerId?: string; driverId?: string };
export type Tx = Prisma.TransactionClient;

export const h = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
export const me = (res: Response) => res.locals.user as U;
export const num = (d: Prisma.Decimal | number) => Number(d);
export const orderNo = (seq: number) => 'GV' + (10283 + seq);
export const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

// Role is always the one loaded from the database for this request (see `load` in server.ts).
export const need = (...roles: Role[]) => (_: Request, res: Response, next: NextFunction) => {
  const u = res.locals.user as U | undefined; if (!u) return res.status(401).json({ error: 'Login required' });
  if (!roles.includes(u.role)) return res.status(403).json({ error: 'Forbidden' }); next();
};
// Admins see every store; store staff only their own.
export const scope = (res: Response) => (me(res).role === 'ADMIN' ? {} : { storeId: me(res).storeId });

export const setOrderStatus = (tx: Tx, orderId: string, status: OrderStatus, actorUserId?: string) =>
  tx.order.update({ where: { id: orderId }, data: { status, events: { create: { status, actorUserId } } } });

// South African numbers: 0XX XXX XXXX or +27 XX XXX XXXX (spaces and dashes allowed).
export const saPhone = z.string().trim().refine(v => /^(\+27|0)\d{9}$/.test(v.replace(/[\s-]/g, '')), 'Enter a valid South African phone number');

// ---- sessions: a signed cookie carrying the user's tokenVersion; bumping the version signs them out everywhere ----
export const SECRET = process.env.JWT_SECRET ?? '';
if (SECRET.length < 24) throw new Error('Set a long JWT_SECRET in .env');
export const setSession = (res: Response, id: string, v: number) =>
  res.cookie('gvo', jwt.sign({ sub: id, v }, SECRET, { expiresIn: '7d' }), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 864e5 });
