# Green Valley Online

**Your local shopping centre, delivered to your door.**

E-commerce and local-delivery platform MVP for the Green Valley shopping centre in Johannesburg. Customers browse stores, order, pay (demo), and track delivery; drivers and admins have their own portals; Vallerie is the AI shopping assistant.

> Everything in this repo is **DEMO**: demo prices, fictional people, simulated payments and tracking. No real money is processed and no card data is collected.

**Running the shop day to day?** The [user guide](docs/USER_GUIDE.md) has step-by-step instructions for admins, store staff, drivers and customers.

## Layout

```
apps/api   Express + TypeScript + Zod + Prisma (PostgreSQL)   ← Stage 1
apps/web   React + TypeScript + Vite + Tailwind v4            ← Stage 2 (storefront)
docs/      user guide for the shop, drivers and customers
docker-compose.yml   local PostgreSQL 16
render.yaml          free hosting setup (Render + Neon)
```

## Run locally (Windows, Node 22, Docker Desktop)

```bash
npm install
npm run db:up                                   # start Postgres in Docker
cp apps/api/.env.example apps/api/.env          # PowerShell: Copy-Item apps/api/.env.example apps/api/.env
                                                # then set JWT_SECRET in apps/api/.env (24+ characters)
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

## Tests

| Command | What it checks |
|---|---|
| `npm run test:e2e -w apps/api` | 147 API checks: ordering, payments, roles, sessions, zones, imports, Vallerie basic mode (API must be running, fresh DB) |
| `npm run test:paystack -w apps/api` | the Paystack flow against a mock Paystack (starts its own API on :4001) |
| `npm run test:browser -w apps/web` | Playwright: a real Chromium (desktop and phone size) shops, checks out, registers, uses Vallerie and the admin pages |

First time only: `npx playwright install chromium` in `apps/web`. The tests place orders and add accounts, so run
`npm run db:reset` in `apps/api` before showing the demo. GitHub Actions (`.github/workflows/ci.yml`) runs all of
this, plus type checks and builds, on every push.

## Put the demo online (free)

The site runs as one free [Render](https://render.com) web service (website and API at one address) with a free
[Neon](https://neon.com) Postgres database. `render.yaml` describes the setup; you only create the two accounts.

1. **Database (Neon):** sign up, create a project in region **AWS Europe (Frankfurt)**, then open **Connect**, turn
   *Connection pooling* **off** and copy the connection string (it ends in `?sslmode=require`).
2. **Website (Render):** sign up with GitHub and allow access to the `green-valley-online` repository. Choose
   **New > Blueprint**, pick the repository, and fill in the two values Render asks for:
   - `DATABASE_URL`: the Neon connection string.
   - `SEED_PASSWORD`: a private password of 12+ characters. All demo accounts (`admin@demo.local`, etc.) use it.
     The public default `demo-password-1` is refused on a hosted site.
3. Click **Apply**. The first build takes about 5 to 10 minutes; the site is then at
   `https://green-valley-online.onrender.com` (or the name Render shows). The demo data is added on the first start
   only, so later restarts never undo your changes.

Good to know about the free tiers:

- The site **sleeps after 15 minutes** without visitors and takes about a minute to wake. Open it a few minutes before a demo.
- Product photos are stored in the database (`STORAGE_PROVIDER=database`) because Render's free disk is wiped whenever the site sleeps or restarts.
- Render's paid Starter plan (about $7 a month) never sleeps. Neon's free database pauses after 5 idle minutes and wakes in about a second.
- Every push to `main` redeploys the site automatically.

To check the live site with the browser tests (they place orders, so only on a demo copy):

```bash
BASE_URL=https://green-valley-online.onrender.com ADMIN_PASSWORD=your-seed-password npm run test:browser -w apps/web
```

## Going fully live

The free setup is meant for demos and a trial. Before taking real customers' money:

1. **Legal:** have the privacy policy and terms (`/privacy`, `/terms`, in `apps/web/src/pages/Legal.tsx`) checked by a
   legal adviser and fill in every `[bracketed]` detail.
2. **Always on:** in Render, change the service's instance type to **Starter** so the site never sleeps.
3. **Own web address:** buy a `.co.za` domain, add it under the Render service's **Settings > Custom Domains**, and
   add the DNS records Render shows at the domain registrar. Render sets up https automatically. Then set
   `WEB_ORIGIN=https://<your domain>` in Render's Environment settings, so Paystack sends customers back to it.
4. **Real payments:** open a Paystack business account. In Render's **Environment** settings (never in the code) set
   `PAYMENT_PROVIDER=paystack`, `PAYSTACK_SECRET_KEY` to the live secret key and `ALLOW_LIVE_PAYMENTS=true`. In the
   Paystack dashboard set the webhook URL to `https://<your domain>/api/payments/webhooks/paystack`. Then make one
   small real payment and refund it to check the whole flow.
5. **Real catalogue:** import the shop's price list (it updates products with the same name and adds new ones), and mark the remaining
   demo products unavailable or delete them.
6. **Accounts:** disable the demo customer, driver and staff accounts, and create real staff and drivers. There is no
   screen yet to create another admin or change the admin's sign-in email, so until that is added the owner uses
   `admin@demo.local` with a strong password of their own.
7. **Optional:** add `ANTHROPIC_API_KEY` in Render's Environment settings to switch Vallerie from basic mode to AI answers.

## Security

- **Accounts:** passwords hashed with bcrypt (cost 12); sessions are httpOnly, SameSite=Lax cookies (Secure in production)
  signed with HS256 only; roles are read from the database on every request, never from the token. Changing a
  password, "sign out everywhere" and disabling a user revoke existing sessions.
- **Access control:** every admin and staff route checks the role, staff are limited to their own store, customers to
  their own orders and data, guests to orders they hold a signed token for. Admins can't disable or reset other admins.
- **Sign-in protection:** rate limits per device and per account; a wrong email and a wrong password get the same
  answer in the same time; temporary passwords (about 48 bits) only allow choosing a new password.
- **Input:** every request body is validated with zod (unknown fields dropped, 50 KB limit); prices and totals are
  recomputed on the server; uploads are size-limited and re-encoded (metadata stripped); no raw SQL.
- **Browser:** strict Content-Security-Policy (no inline scripts), Permissions-Policy, HSTS, nosniff, no framing;
  React escapes all text, and nothing is inserted as raw HTML. CORS allows only the site's own origin.
- **Secrets:** server-side environment variables only; the server refuses a short or example `JWT_SECRET`, and a hosted
  site refuses the public demo password. Git history contains no secrets.
- `npm audit` reports no known vulnerabilities (last checked 27 October 2026).

## Demo logins (DEMO ONLY)

Password `demo-password-1` locally (or `SEED_PASSWORD` in `.env`; on a hosted site always `SEED_PASSWORD`):
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
- **Basic mode (no key):** Vallerie still answers the common questions straight from the database: braai planning for a number of people, products by category, items under a budget, how delivery works, and the customer's latest order. The widget shows *Basic mode*. No AI cost, nothing leaves the server.
- If a key is set but the provider fails, the route returns 503 with *"Vallerie is temporarily unavailable. You can continue shopping normally."*
- The reply also carries the catalogue products it names, looked up in the database (price and stock from the DB, never the model), so the widget shows real Add buttons.

**To switch Vallerie on:** put your key in `apps/api/.env` yourself (`ANTHROPIC_API_KEY=...`, or `AI_PROVIDER=xai` with `XAI_API_KEY` and `XAI_MODEL`) and restart the API. Never commit it; `.env` is git-ignored.

## Guest checkout and age-restricted stores

- **Guests** can check out without an account. Each guest order gets an access token (an HMAC of the order id, nothing stored) that this device keeps; anyone can also find an order on *Track Order* with its number and the checkout email (rate limited).
- **Age-restricted stores** (Bottle Liquors): the shop and product pages ask for a date of birth (self-declared, not saved), checkout needs an explicit confirmation that the API enforces and records (`Order.ageConfirmedAt`), and drivers see a CHECK ID badge. The minimum age and any compliance text come from the store settings. Bottle Liquors has no delivery zones yet, so it is collection-only until an admin adds zones.

## Delivery zones by suburb

In *Admin > Stores & settings* each delivery zone can list the suburbs it covers (a suburb belongs to one zone only). When any zone has suburbs, checkout picks the zone and fee from the customer's suburb and refuses addresses outside every list; the API checks the same rule. Leave all lists empty to let customers choose a zone themselves.

## Unpaid orders

Placing an order reserves its stock. Orders still unpaid after `UNPAID_ORDER_MINUTES` (default 30) are cancelled automatically and their stock goes back on sale (checked every minute; Paystack payments are verified with Paystack first). The payment page shows the deadline, and admins can run the check at once with *Release unpaid orders*.

## Accounts, staff and passwords

- Registration and guest checkout require accepting the privacy policy and terms (`/privacy`, `/terms`). Both pages are **drafts for legal review**: the [bracketed] details must be completed by the owners before launch.
- There is no email service yet, so a forgotten password is reset by an admin (*Customers*, *Drivers* or *Store staff* > *Reset password*): the admin sees a one-time temporary password to share privately, the user is signed out everywhere and must choose a new password at the next sign-in. New staff accounts work the same way.
- Changing a password signs out all other devices; *Sign out everywhere* on the account page signs out all of them. Disabling a user signs them out at once.
- Store staff answers to customer questions wait for an admin's approval before customers or Vallerie see them.
- A signed-in customer's cart is saved to their account, so it follows them from phone to laptop. Signing out empties the cart on that device.

## Catalogue import (CSV)

*Admin > Products > Import from a spreadsheet* loads a price list saved as CSV from Excel (comma or semicolon). Required columns: `name, category, price`; optional `unit` (kg or each), `stock`, `description`, `available`, `store` and `image_url`. The preview shows what will be added, what changes on existing products (matched by name) and any row errors; nothing is saved until you confirm, and a file with errors is refused. A template can be downloaded from the same panel.

## Product photos

Admins and store staff add photos from **Admin > Products**: *Take photo* opens the phone camera, *Upload* picks a file, and *Bulk photo upload* matches files to products by name (`Beef Mince.jpg`, `beef-short-ribs.png`). Every photo is re-encoded to WebP (at most 1200 px) with its metadata removed, including the GPS location phones embed. Files are stored in `apps/api/uploads` (git-ignored) and served at `/uploads`, or in the database with `STORAGE_PROVIDER=database` (used on the hosted demo). S3 or Cloudinary can replace either later in `apps/api/src/storage.ts`.

## Payments (Paystack)

`PAYMENT_PROVIDER=demo` (the default) simulates payment. To use Paystack test mode, put your own test key in `apps/api/.env` and restart the API:

```
PAYMENT_PROVIDER="paystack"
PAYSTACK_SECRET_KEY="sk_test_..."
```

The customer pays on Paystack's page and returns to `/checkout/return`; the API asks Paystack directly and checks the reference, the amount in cents and that the currency is ZAR before confirming the order. In production, also point Paystack's webhook at `/api/payments/webhooks/paystack` (signature-checked). Live keys (`sk_live_`) are refused unless `ALLOW_LIVE_PAYMENTS=true`. `npm run test:paystack` (in `apps/api`) runs the whole flow against a mock Paystack, no account needed.

## GPS tracking

While a delivery is out for delivery or arrived, the driver portal shares the phone's location (one stored point every 10 to 15 seconds; the driver can pause it). The customer's tracking page shows a live OpenStreetMap map with the driver's pin; the position is hidden before the driver leaves and after delivery. History is kept in `TrackingPoint` for 30 days. Browsers only allow location on https (or localhost), so drivers' phones need the site served over https.

## Portals

- **Driver** `/driver`: sign in as a driver. Today's deliveries with ACCEPT DELIVERY, START DELIVERY, ARRIVED, DELIVERED (DELIVERED asks for a second tap). Each action sends the status the driver saw, so a double tap can't skip a step; the customer's tracking page updates within seconds.
- **Admin** `/admin`: sign in as admin or store staff. Staff only see their own store and can't open customers, drivers, store settings or bulk quotes. Cancelling an order returns its stock and marks a demo payment refunded. Opening a store online is a button in *Stores & settings*. A pop-up, a flashing tab title and an optional chime announce each new paid order while the dashboard is open.

## API

| Area | Routes |
|---|---|
| Auth | `POST /api/auth/register` `login` `logout`, `GET /api/auth/me` (httpOnly JWT cookie; role always read from DB) |
| Catalogue | `GET /api/stores`, `/stores/:slug`, `/stores/:slug/zones`, `/categories`, `/products?q=&category=&max=&inStock=1&sort=`, `/products/:id`, `/products/:id/qa` |
| Orders | `POST /api/orders` (server recomputes all prices, decrements stock atomically), `GET /orders`, `/orders/:id`, `/orders/:id/tracking`, `POST /orders/:id/reorder` |
| Payments | `GET /api/payments/config`, `POST /api/payments/:orderId/pay` `{ method: CARD \| EFT }`, `POST /payments/:orderId/verify`, `POST /payments/webhooks/paystack` |
| Deliveries | `GET /api/deliveries/mine`, `POST /deliveries/:id/advance` (accept → start → arrived → delivered), `POST /deliveries/:id/location` |
| Photos | `POST /api/admin/products/:id/image` (field `image`), `DELETE /admin/products/:id/image`, `POST /admin/products/images/bulk` (field `images`) |
| Admin | `/api/admin/stats`, `orders`, `orders/:id/status`, `orders/release-unpaid`, `products`, `products/import[?dryRun=1]`, `inventory`, `wholesale`, `questions/:id/answer`, `answers/:id`, `stores/:id/zones`, `zones/:id`, `drivers`, `staff`, `users/:id/active`, `users/:id/temporary-password` |
| Account | `/api/account/profile`, `password`, `logout-all`, `addresses`, `favourites`; `GET`/`PUT /api/cart` |
| Other | `POST /api/wholesale`, `POST /api/products/:id/questions`, `POST /api/ai/chat` |

## Stages

1. ✅ API running; end-to-end flow tested (register → order → demo pay → driver advance → tracking → AI fallback)
2. ✅ `apps/web`: home, stores, shop, product, cart
3. ✅ Checkout (details → delivery or collection → address → review), DEMO payment, confirmation, live tracking (polls every 8 s), Vallerie widget
4. ✅ Driver portal (`/driver`) and admin dashboard (`/admin`): orders, driver assignment, products, inventory, Q&A, analytics; admin-only customers, drivers, stores & settings, bulk quotes
5. ✅ Account (profile, password, saved addresses, favourites, Order again), store and product reviews (completed orders only), guest checkout with track-by-number-and-email, multi-store cart, liquor age verification
6. ✅ Product photos (camera, file and bulk upload; local storage behind an interface), Paystack behind `PaymentProvider` (tested against a mock), GPS driver sharing with a live OpenStreetMap map
7. ✅ Free fixes before the owners' demo: unpaid orders release stock, suburb-based zones, staff accounts and password resets, session revocation, Q&A approval, POPIA consent with draft privacy/terms pages, new-order alerts, Vallerie basic mode, CSV catalogue import, cart saved to the account, Playwright browser tests and GitHub Actions CI
