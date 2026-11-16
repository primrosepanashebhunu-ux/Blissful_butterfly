# Architecture Review & Recommendations — Blissful Butterfly

Last updated: bug-fix pass (includes fixes below).

## Current architecture (as-built)

**Static single-page app (vanilla HTML/CSS/JS), no build step, no server.**

```
Browser (one device)
├─ index.html — Shop / Checkout / Track / Success views + Admin shell
├─ assets/style.css + admin.css — pink theme, butterfly animation
├─ assets/catalogue.js — 3 real Stanley products (from owner photos)
├─ assets/app.js — shop UI, cart, checkout (uses BB.DB)
├─ assets/backend.js — BB.DB shared "database" (localStorage demo)
└─ assets/admin.js — dashboard (Dashboard / Orders / Products / Customers / Settings)

localStorage keys: bb_cart, bb_wish, bb_orders, bb_product_overrides,
                   bb_custom_products, bb_settings, bb_status_history, bb_my_orders
```

Checkout: `placeOrder()` (`app.js`) → `BB.DB.createOrder()` (`backend.js`) → validates stock → saves order → reserves stock → logs history.
Admin: `adminLogin()` (`admin.js`) → `renderAdmin()` tabs → `BB.DB.updateStatus()` → status + history.

## What was fixed in this pass ✅

| # | Bug | Fix |
|---|---|---|
| 1 | **Stock could go negative / oversell** (`backend.js` had no floor check) | `adjustStock()` rejects any change that would go below 0; `createOrder()` validates *all* items before saving; shop disables "Add to Cart" at 0 stock and caps qty at stock |
| 2 | **Order ID collisions** (random 6-digit could collide) | `BB.newOrderId()` = `BB-MMDD + random4 + seq` (date + counter), stored in `bb_seq` |
| 3 | **No audit trail** (status overwritten, no timestamps) | `bb_status_history` log + `paidAt` timestamp; admin order card shows history + paid date |
| 4 | **Cart could add more than stock / stale prices** | `addToCart()` / `changeQty()` cap at current stock; `totals()` guards missing products; checkout prunes sold-out items |
| 5 | **Admin session in localStorage (persists forever)** | Moved to `sessionStorage` (cleared on tab close); logout clears it |
| 6 | **No login rate-limiting** | 5 attempts / minute lockout in `adminLogin()` |
| 7 | **"My orders" leaked every order on the device** | New `bb_my_orders` bucket — track page only shows orders placed on *this* device (others can still track by ID) |
| 8 | **Duplicate settings (two sources of truth)** | `CONFIG` in `app.js` no longer holds delivery fee/threshold; `totals()` reads `BB.DB.getSettings()` — one source |
| 9 | **XSS / broken markup from product data** | `esc()` on all injected product/order text; `onerror` image fallback (`IMG_FALLBACK`) |
| 10 | **Broken catalogue images (404)** | Hero + cards + modal use `catalogue-*.jpg` with Unsplash fallback until real photos are added |
| 11 | **Fake "from $35" hero price** | Updated to "from $8" + real product names |
| 12 | **Admin password field showed plain text** | Password input now empty by default; only overwrites if a new value is typed |
| 13 | **No input validation / spam orders** | Phone pattern + JS validation (≥7 digits), email regex, delivery-address-required check, hidden honeypot field |
| 14 | **Admin "Admin" button gave away dashboard** | Admin login also reachable from footer (small link) — header button kept for ease; remove it before production if you prefer hidden |

## Second fix pass ✅ (completed)

| # | Bug found | Fix applied |
|---|---|---|
| 15 | **Honeypot checked AFTER order saved** — bot orders reserved stock | Honeypot now runs *before* `createOrder()`; bot submissions create nothing |
| 16 | **12 fake Unsplash products still shipped** (`app.js` $35–$110) | Removed — `PRODUCTS = []`, only real catalogue + admin-added items show. Shop is now honest |
| 17 | **Settings could become NaN** (bad input broke totals) | `getSettings()` sanitizes; `saveSettings()` clamps to ≥0; single source of truth |
| 18 | **Duplicate Order IDs possible** | `createOrder()` rejects duplicate IDs; stock validated for *all* items before any write (no partial writes) |
| 19 | **Fake review counts** (231, 156, 98…) on real products | Set to `0` until real reviews exist |
| 20 | **"Featured" sort was missing** (catalogue buried under placeholders) | Featured sort puts real catalogue first, then defaults |
| 21 | **/Admin Products tab didn't show hidden count** | Now shows "X live • Y hidden" and clearer un-hide instructions |
| 22 | **Broken catalogue images** | Shop/admin/card/modal all use `onerror` fallback (`IMG_FALLBACK` / Unsplash) — never a broken-image icon |

## Remaining critical items (not fixed — require a real server) 🔴

1. **Cross-device sync:** localStorage is per-device. Customer phone → admin phone still needs Supabase (see `BACKEND_GUIDE.md`). This is the #1 launch blocker.
2. **Real auth:** client-side password compare in `admin.js` is demo-only. Ship with Supabase Auth + RLS.
3. **Server-side pricing:** totals are still computed in the browser. Production must re-price from the DB.
4. **Real photos still missing:** `assets/catalogue-1/2/3.jpg` don't exist yet — shop shows fallbacks until you add them (compress <200KB).
5. **Promo codes client-side only** (`BLISS10` visible in source). Keep for demo; enforce server-side in production.

## Recommendations (prioritized)

### ⭐ A. Move to Supabase (HIGH — do before real launch)
- Tables: `products`, `orders`, `order_status_history`, `settings` (SQL in `BACKEND_GUIDE.md`).
- RLS: anon can insert orders + read products; admin (authenticated) full access.
- Replace `BB.DB` localStorage calls with Supabase queries — one file (`backend.js`).
- Deploy static site to Vercel/Netlify (free, HTTPS). Customers pay in person — no gateway.

### ⭐ B. Data integrity (HIGH)
- Atomic stock decrement in DB (`UPDATE … WHERE stock >= qty`), reject if insufficient.
- Enforce status transitions server-side; keep history table for cash reconciliation.
- Validate phone/email server-side; add CAPTCHA if spam appears.

### ⭐ C. Real admin auth (HIGH)
- Supabase Auth (email + hashed password), protect admin route, auto-logout.
- Never ship demo credentials (`admin` / `butterfly123`) to production.

### D. Catalogue hygiene (MEDIUM)
- Add real photos: `assets/catalogue-1.jpg`, `-2.jpg`, `-3.jpg` (compress <200KB).
- Hide or remove the 12 placeholder products until stocked.
- Move product data to DB; keep `catalogue.js` only as seed data.

### E. Config (MEDIUM)
- One settings source (done ✅). Add `.env` for secrets; never hardcode keys in client JS.

### F. Operations (MEDIUM)
- WhatsApp Business API for automatic confirmations.
- New-order alert to admin (email/SMS/WhatsApp push).
- 48h hold policy: flag/cancel stale `Packed` orders to free stock.

### G. Growth (LOW, after stable)
- Next.js migration for SEO + performance (same pink design).
- SMS tracking links, reviews, loyalty, coupon expiry.

## Migration path

1. Add 3 photos + hide placeholders (20 min).
2. Supabase project + SQL + seed products (30 min).
3. Swap `BB.DB` to Supabase (1–2 hrs, one file).
4. Supabase Auth + protect admin (1 hr).
5. Server-side price/stock validation (1 hr).
6. Deploy to Vercel + test phone → admin phone end-to-end (30 min).
7. (Optional) Next.js for SEO.

**Do not take real orders until steps 2–4 are done** — on the current demo, orders from other phones will be invisible to you.
