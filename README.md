# 🦋 Blissful Butterfly — Storefront Frontend

A complete, ready-to-view frontend for **Blissful Butterfly** (Stanley cups, room decor & gift hampers):
product catalog, categories, search, wishlist, cart, promo codes, checkout & order tracking.

## ▶️ How to run (no install needed)

**Option A — just open it:** double-click `index.html` in your browser.

**Option B — local server (recommended):**
```bash
# in this folder
npx serve .
# or
python -m http.server 8000   # then open http://localhost:8000
```

## ✨ Features included

| Feature | Status |
|---|---|
| Hero, categories, trust badges, reviews, newsletter | ✅ |
| Product grid (12 products), filter by category, sort, live search | ✅ |
| Product detail modal with variant picker (color/size) | ✅ |
| Cart drawer with quantity, remove, promo code (`BLISS10` / `WELCOME15` / `BUTTERFLY20`) | ✅ |
| Checkout form (details, **collect in town / admin delivery out of town**, gift note) | ✅ **NO online payment** |
| Order confirmation + Order ID (e.g. `BB-123456`) | ✅ |
| Track order + recent orders page | ✅ |
| Cart / wishlist / orders saved in `localStorage` | ✅ (demo persistence) |
| Mobile-responsive design | ✅ |

### 💖 Pay on Collection / Delivery model — NO online payment

```
Customer orders online → Choose ONE:
  ├─ 🏬 Collect in Town ......... collect at shop & PAY ON COLLECTION
  └─ 🚚 Admin Delivery .......... out-of-town: admin delivers & customer PAYS ON DELIVERY
```

**Checkout flow:** name + phone/WhatsApp + email → choose Collect in Town or Admin Delivery → address required only for out-of-town → gift note → Place Order → customer gets Order ID (`BB-…`) → admin confirms by phone/WhatsApp → customer pays cash/mobile at collection or on delivery. Order tracking steps adapt per type (Pickup: Confirmed → Packed → Ready for Pickup → Collected & Paid | Delivery: Confirmed → Packed → Shipped → Delivered & Paid).

> Checkout writes orders to a **shared backend database** (`assets/backend.js`). The **Admin Dashboard** (header → 🦋 Admin, demo login `admin` / `butterfly123`) reads the SAME database — see `BACKEND_GUIDE.md`. In this demo the database is the browser's local storage; for multi-device use, connect Supabase (guide included). **No payment gateway needed.**

## 🖥️ Admin Dashboard

Click **🦋 Admin** in the shop header → login (`admin` / `butterfly123`).
- **Dashboard** — order totals, money collected (in-person), low stock
- **Orders** — confirm via WhatsApp, pack, set Ready/Shipped, record payment
- **Products & Stock** — add/hide products, edit stock (shop updates instantly)
- **Customers** — past buyers by phone, WhatsApp for promos
- **Settings** — pickup address, delivery fee, WhatsApp number, admin login

Full explanation: **`BACKEND_GUIDE.md`**

## 📁 Project structure

```
Blissful_butterfly/
├── index.html              # Shop + checkout + track + success + admin UI shell
├── assets/
│   ├── style.css           # Shop design (pink / butterflies)
│   ├── admin.css           # Admin dashboard styles
│   ├── catalogue.js        # ★ Your REAL Stanley products (from photos, $15)
│   ├── backend.js          # ★ Shared database + WhatsApp helpers (BB.DB)
│   ├── app.js              # Shop logic (uses BB.DB)
│   └── admin.js            # ★ Admin dashboard logic
├── README.md
└── BACKEND_GUIDE.md        # ★ How backend + admin work (read this)
```

## 🔧 Easy customisations

- **Prices / currency / delivery fee / promo codes** → top of `assets/app.js` (`CONFIG`).
- **Products** → edit the `PRODUCTS` array in `assets/app.js` (name, price, image, stock, variants).
  Replace the Unsplash image URLs with your own product photos.
- **Brand colours / fonts** → CSS variables in `assets/style.css` (`:root`).
- **Business info** (phone, email, address) → footer in `index.html`.

## 🚀 Next step: connect the real backend

This prototype maps 1:1 to the recommended architecture:

| Frontend (this project) | Production upgrade |
|---|---|
| Products in `app.js` | Next.js + Supabase/PostgreSQL `products` table |
| Cart in `localStorage` | Server-side cart + user accounts |
| Demo checkout | **No gateway** — orders API + admin dashboard (WhatsApp) for confirmation |
| Orders in browser | Orders API + admin dashboard for Blissful Butterfly |

**Suggested migration path:** convert `index.html` views to Next.js App Router pages
(`/`, `/product/[id]`, `/checkout`, `/track`), move `PRODUCTS` to the database,
and wire `placeOrder()` to a `POST /api/orders` endpoint. The UI/design stays the same.

## 🧪 Try it

1. Add a product to cart → open cart → apply code `BLISS10`.
2. Checkout → fill the form → Place Order → note your `BB-…` ID.
3. Go to **Track Order**, enter the ID to see order status steps.
