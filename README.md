# Green Valley Online

**Your local shopping centre, delivered to your door.**

E-commerce and local-delivery platform MVP for the Green Valley shopping centre in Johannesburg. Customers browse stores, order, pay (demo), and track delivery; drivers and admins have their own portals; Vallerie is the AI shopping assistant.

> Everything in this repo is **DEMO**: demo prices, fictional people, simulated payments and tracking. No real money is processed and no card data is collected.

## Layout

```
apps/api   Express + TypeScript + Zod + Prisma (PostgreSQL)   ← Stage 1, running
apps/web   React + TypeScript + Vite + Tailwind               ← Stage 2, not started
docker-compose.yml   local PostgreSQL 16
```

## Run locally (Windows, Node 22, Docker Desktop)

```bash
npm install
npm run db:up                                   # start Postgres in Docker
cp apps/api/.env.example apps/api/.env          # then set JWT_SECRET (24+ chars)
cd apps/api
npx prisma migrate dev                          # create tables (also seeds)
npm run dev                                     # API on http://localhost:4000
npm run test:e2e                                # in a second terminal, on a fresh DB
```

`npm run db:reset` (in `apps/api`) wipes and reseeds the local demo database, so the next order is **#GV10284** again.

## Demo logins (DEMO ONLY)

Password `demo-password-1` (or `SEED_PASSWORD` in `.env`):
`admin@demo.local` · `driver1@demo.local` · `staff@demo.local` (Meat Market staff) · `customer@demo.local`

## Stores

| Store | Status | Accent |
|---|---|---|
| Green Valley Meat Market | ACTIVE (flagship, Bulk & Wholesale) | red + black |
| Green Valley Farm Stall | COMING_SOON | gold + green |
| Green Valley Bottle Liquors | COMING_SOON (age-restricted, configurable compliance) | dark blue |
| Green Valley Supermarket | COMING_SOON | light blue |

Activating a store is a data change (`Store.status = 'ACTIVE'`), not code. Hours, WhatsApp number, delivery-window estimate and compliance text live in `Store.config` and are empty until an admin sets real values.

## Vallerie (AI assistant)

`POST /api/ai/chat` builds context from the database (catalogue with price and stock, approved Q&A, delivery zones, the signed-in customer's latest order) and calls the model server-side. She recommends and explains only; she has no tools and cannot change carts, orders or payments.

- `AI_PROVIDER=anthropic` (default, model `ANTHROPIC_MODEL`, default `claude-opus-5-5`) or `AI_PROVIDER=xai` (`XAI_API_KEY`, `XAI_MODEL`).
- Keys are server-side env vars only. Rate limited (15/min) with a timeout (`AI_TIMEOUT_MS`).
- With no key, or if the provider fails, the route returns 503 with *"Vallerie is temporarily unavailable. You can continue shopping normally."*

## API (Stage 1)

| Area | Routes |
|---|---|
| Auth | `POST /api/auth/register` `login` `logout`, `GET /api/auth/me` (httpOnly JWT cookie; role always read from DB) |
| Catalogue | `GET /api/stores`, `/stores/:slug`, `/stores/:slug/zones`, `/categories`, `/products?q=&category=&max=&inStock=1&sort=`, `/products/:id`, `/products/:id/qa` |
| Orders | `POST /api/orders` (server recomputes all prices, decrements stock atomically), `GET /orders`, `/orders/:id`, `/orders/:id/tracking`, `POST /orders/:id/reorder` |
| Payments | `POST /api/payments/:orderId/pay` `{ method: CARD \| EFT }`, DEMO provider behind `PaymentProvider` |
| Deliveries | `GET /api/deliveries/mine`, `POST /deliveries/:id/advance` (accept → start → arrived → delivered) |
| Admin | `/api/admin/stats`, `orders`, `orders/:id/status`, `products`, `inventory`, `wholesale`, `questions/:id/answer`, `zones/:id`, `drivers`, `users/:id/active` |
| Other | `POST /api/wholesale`, `POST /api/products/:id/questions`, `POST /api/ai/chat` |

## Stages

1. ✅ API running; end-to-end flow tested (register → order → demo pay → driver advance → tracking → AI fallback)
2. `apps/web`: home, stores, shop, product, cart
3. Checkout, demo payment, confirmation, tracking, Vallerie widget
4. Driver portal and admin dashboard
5. Account, reviews, Q&A, bulk, guest checkout, liquor age verification
6. Image storage, real payment provider, GPS tracking
