# Green Valley Online

**Your local shopping centre, delivered to your door.**

E-commerce and local-delivery platform MVP for the Green Valley shopping centre in Johannesburg. Customers browse stores, order, pay (demo), and track delivery; drivers and admins have their own portals; Vallerie is the AI shopping assistant.

> Everything in this repo is **DEMO**: demo prices, fictional people, simulated payments and tracking. No real money is processed and no card data is collected.

## Layout

```
apps/api   Express + TypeScript + Zod + Prisma (PostgreSQL)   ← Stage 1
apps/web   React + TypeScript + Vite + Tailwind v4            ← Stage 2 (storefront)
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

Then, from the repo root in another terminal:

```bash
npm run dev:web                                 # storefront on http://localhost:5180 (proxies /api to :4000)
```

Port 5180 is used because 5173 is often taken by other Vite projects. If npm ever skips native packages
(error mentioning `@tailwindcss/oxide-win32-x64-msvc` or a Rolldown binding), delete `node_modules` and
`package-lock.json` and run `npm install` again.

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
- The reply also carries the catalogue products it names, looked up in the database (price and stock from the DB, never the model), so the widget shows real Add buttons.

**To switch Vallerie on:** put your key in `apps/api/.env` yourself (`ANTHROPIC_API_KEY=...`, or `AI_PROVIDER=xai` with `XAI_API_KEY` and `XAI_MODEL`) and restart the API. Never commit it; `.env` is git-ignored.

## Guest checkout and age-restricted stores

- **Guests** can check out without an account. Each guest order gets an access token (an HMAC of the order id, nothing stored) that this device keeps; anyone can also find an order on *Track Order* with its number and the checkout email (rate limited).
- **Age-restricted stores** (Bottle Liquors): the shop and product pages ask for a date of birth (self-declared, not saved), checkout needs an explicit confirmation that the API enforces and records (`Order.ageConfirmedAt`), and drivers see a CHECK ID badge. The minimum age and any compliance text come from the store settings. Bottle Liquors has no delivery zones yet, so it is collection-only until an admin adds zones.

## Portals

- **Driver** `/driver`: sign in as a driver. Today's deliveries with ACCEPT DELIVERY, START DELIVERY, ARRIVED, DELIVERED (DELIVERED asks for a second tap). Each action sends the status the driver saw, so a double tap can't skip a step; the customer's tracking page updates within seconds.
- **Admin** `/admin`: sign in as admin or store staff. Staff only see their own store and can't open customers, drivers, store settings or bulk quotes. Cancelling an order returns its stock and marks a demo payment refunded. Opening a store online is a button in *Stores & settings*.

## API

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
2. ✅ `apps/web`: home, stores, shop, product, cart
3. ✅ Checkout (details → delivery or collection → address → review), DEMO payment, confirmation, live tracking (polls every 8 s), Vallerie widget
4. ✅ Driver portal (`/driver`) and admin dashboard (`/admin`): orders, driver assignment, products, inventory, Q&A, analytics; admin-only customers, drivers, stores & settings, bulk quotes
5. ✅ Account (profile, password, saved addresses, favourites, ORDER AGAIN), store and product reviews (completed orders only), guest checkout with track-by-number-and-email, multi-store cart, liquor age verification
6. Image storage, real payment provider, GPS tracking
