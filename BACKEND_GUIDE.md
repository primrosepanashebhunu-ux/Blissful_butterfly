# Blissful Butterfly — Backend & Admin Guide

## What was added

1. **Backend layer** (`assets/backend.js`)
   - `window.BB.DB` — the shared database (demo: `localStorage`)
   - `BB.whatsappLink(phone, msg)` — opens WhatsApp with pre-filled message
   - `BB.orderMessage(order, type)` — builds the confirmation message

2. **Admin Dashboard** (`assets/admin.js` + `assets/admin.css`)
   - Access: Shop header → **🦋 Admin** → demo login `admin` / `butterfly123`
   - Tabs: Dashboard, Orders, Products & Stock, Customers, Settings

3. **Real catalogue** (`assets/catalogue.js`)
   - Your 3 photos become products:
     - 40oz Tumbler (Bows & Floral) — **$15** — Pink Bows / Purple Bows / Blue Floral
     - 18oz Flask (Colour) — $10 — Red / Purple / Blue / Sage Green
     - 14oz Tumbler (Floral & Stripes) — $8 — Pink Floral Bows / Pink-White Stripes
   - **To show your photos:** save them as `assets/catalogue-1.jpg`, `assets/catalogue-2.jpg`, `assets/catalogue-3.jpg` (keep the same names). The shop will then display them automatically. Until then, those 3 items show a placeholder image.

## How it works (plain English)

```
Customer phone                     Admin phone/computer
─────────────────                  ─────────────────────
1. Views products ──┐              (same database)
2. Adds to cart     │              ┌─ Sees order instantly (demo: same browser;
3. Places order  ───┼─► BACKEND ──┤   production: via Supabase, any device)
   (collect in town  │  (BB.DB)     │
    or admin delivery)│              ├─ Opens Orders tab
4. Gets Order ID ───┘              ├─ Clicks WhatsApp → sends confirmation
   (BB-123456 + track)             ├─ Packs → status: Packed
                                   ├─ In town → Ready for Pickup
                                   │  Out of town → Shipped
                                   └─ Customer pays in person →
                                      Collected & Paid / Delivered & Paid
```

**Payment model:** There is **NO online payment gateway**.
- 🏬 **In town:** customer collects at shop, pays cash/mobile at collection.
- 🚚 **Out of town:** admin delivers, customer pays on delivery.
- Admin records it by setting status to `Collected & Paid` or `Delivered & Paid`.

**Stock:** When an order is placed, stock is reserved (deducted) immediately. If admin cancels, stock is returned. Admin can edit stock in Products tab.

**Customers:** Derived from orders (by phone number). Click WhatsApp to message.

## Admin Dashboard tour

| Tab | What you do there |
|---|---|
| **Dashboard** | See totals: new orders, money collected, low stock. Latest orders list. |
| **Orders** | Full order cards. Change status via dropdown or ⬆️ Next button. WhatsApp customer. Print packing list. |
| **Products & Stock** | Add new product, change stock numbers, hide out-of-season items. Changes appear in shop instantly. |
| **Customers** | List of past buyers by phone. WhatsApp them for promos/restocks. |
| **Settings** | Pickup address, delivery fee, free-delivery threshold, business WhatsApp, demo admin login. |

## Test it in 2 minutes

1. Open `index.html`.
2. Add a Stanley cup to cart → Checkout → choose Collect in Town → Place Order. Note the `BB-…` ID.
3. Click **🦋 Admin** (top-right) → login `admin` / `butterfly123`.
4. Go to **Orders** — your order is there. Click **💬 WhatsApp Customer** → pre-filled message opens.
5. Change status to `Confirmed` → `Packed` → `Ready for Pickup` → `Collected & Paid`.
6. Go back to **Track Order** with the same ID — customer sees updated steps.

## Going live: connect a real server (Supabase)

This demo stores data in the browser, so orders only appear on the same device/browser. To share between customer phones and the admin's phone:

1. Create a free project at [supabase.com](https://supabase.com).
2. Run this SQL in Supabase (SQL Editor):

```sql
create table products (
  id text primary key, cat text, name text, price numeric, old numeric default 0,
  rating numeric default 5, reviews int default 0, tag text, stock int, img text, desc text,
  variants text[] default '{}', active boolean default true
);
create table orders (
  id text primary key, date timestamptz default now(), status text default 'Placed',
  payment_status text default 'Unpaid', delivery text, payment text,
  customer_name text, phone text, email text, address text, city text, note text,
  items jsonb, totals jsonb
);
create table settings (key text primary key, value jsonb);
alter table products disable row level security;
alter table orders disable row level security;
alter table settings disable row level security;
```

3. Insert your products (or import `assets/catalogue.js` values).
4. Add this to `assets/backend.js` — replace the `localStorage` reads/writes in `BB.DB` with `supabase.from('orders')`, `supabase.from('products')`, etc.
5. Deploy on Vercel/Netlify (free) + set the admin login to a real authenticated user (Supabase Auth), never store passwords in plain text.

**Do not confuse this with a payment gateway.** Supabase is the database/server only. Customers still pay in person — no Stripe/Paystack needed.

## Security checklist before real launch

- [ ] Change admin password from demo (`admin` / `butterfly123`) to a strong one.
- [ ] Use HTTPS (hosting provides this).
- [ ] Restrict admin access to your device / IP if possible.
- [ ] Compress catalogue photos (<200KB each) for fast mobile loading.
- [ ] Back up the database daily (Supabase does this automatically on paid plans).
- [ ] Confirm WhatsApp Business number in Settings so deep-links work.
