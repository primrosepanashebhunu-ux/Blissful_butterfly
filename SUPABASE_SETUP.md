# Blissful Butterfly — Supabase Live Setup (5 minutes)

This wires your shop to a **real cloud database** so orders placed on a customer's phone appear on your admin phone. No payment gateway — customers still pay in person.

## Architecture (after setup)

```
Customer phone ──▶ Vercel/Netlify (this site) ──▶ Supabase (Postgres + Auth)
Admin phone    ──▶ Admin Dashboard ─────────────▶ Supabase
                      ▲                              │
                      └── same tables ───────────────┘
```

- **Products** table → shop reads real prices/stock (no more localStorage)
- **Orders** table → every order saved centrally, syncs across devices
- **order_history** table → audit trail for cash payments
- **settings** table → delivery fee, pickup address, WhatsApp (single source)
- **Supabase Auth** → admin email + hashed password (server-side, secure)
- **Atomic stock** → Postgres `decrement_stock()` prevents oversell

## Step-by-step

### 1) Create the Supabase project (2 min)
1. Go to [supabase.com](https://supabase.com) → **New project**
2. Name: `Blissful Butterfly` → pick a region near you → **Create**
3. Wait ~1 min for provisioning.

### 2) Create tables (1 min)
1. In Supabase: **SQL Editor → New query**
2. Paste the entire contents of **`SUPABASE_SETUP.sql`** → **Run**
   - Creates `products`, `orders`, `order_history`, `settings`
   - Enables RLS (Row Level Security) with safe policies
   - Seeds your 3 real Stanley products ($15 / $10 / $8)
   - Creates the atomic `decrement_stock()` function

### 3) Get your keys (30 sec)
1. **Project Settings → API**
2. Copy **Project URL** (`https://xxxxx.supabase.co`) and **anon public key** (`eyJ…`)
3. Open **`assets/supabase.js`** and paste them in:
   ```js
   window.BB_SUPABASE_CONFIG = {
     url: 'https://your-project.supabase.co',
     anonKey: 'eyJ...your-anon-key...',
     adminEmail: 'you@example.com',  // optional, for display
   };
   ```
   ⚠️ Use the **anon** key only — never the `service_role` key in frontend code.

### 4) Create admin user (30 sec)
1. **Authentication → Users → Add user**
2. Email: your admin email, Password: a strong password → **Create**
3. The Admin Dashboard login now uses **this email + password** (Supabase Auth).

### 5) Go live (30 sec)
1. Refresh `index.html` → banner shows **🟢 Live — connected to Supabase**
2. Test:
   - **Customer flow (phone A):** Add $15 tumbler → Checkout → Collect in Town → Place Order
   - **Admin flow (phone B):** 🦋 Admin → login with your Supabase email → **Orders** → the order is there
   - Change status → **Track Order** with the same ID on phone A → sees updated status
3. Deploy to Vercel/Netlify (free) over HTTPS for your public link.

## How the code works

| File | Role |
|---|---|
| `assets/supabase.js` | Your keys (only file you edit) |
| `assets/backend.js` | Dual-mode `BB.DB`: Supabase when keys present, local demo otherwise. Live: products/orders/settings/history via Supabase, atomic stock via RPC, Auth via `supabase.auth` |
| `SUPABASE_SETUP.sql` | Tables + RLS + seed + `decrement_stock()` |
| `index.html` | Loads Supabase JS CDN + `supabase.js` before `backend.js`; sync banner shows Live/Demo mode |

**Fallback:** If Supabase is unreachable, the app keeps working in local demo mode (same device only) — no crash, banner shows 🟡 Demo.

## Security notes

- **RLS on:** anon can read products, insert own orders; only authenticated admin can update stock/settings/orders status. See policies in `SUPABASE_SETUP.sql`.
- **Admin Auth:** passwords hashed server-side by Supabase. Session stored securely by the SDK. Logout clears it.
- **Pricing:** products priced from DB; order totals saved from the server-known prices at checkout time. (Hardening: re-price in a Postgres function — see `BACKEND_GUIDE.md`.)
- **No service_role key** in any frontend file. Ever.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Banner says 🟡 Demo | Keys missing/wrong in `assets/supabase.js`; or CDN blocked (offline). |
| Orders don't appear for admin | Both phones must use same project URL/key; check RLS policies ran; refresh admin. |
| "Not enough stock" | Stock really is low — restock in Admin → Products. |
| Login fails | User must exist in Supabase Auth; use email (not username) in live mode. |
| Products empty in live mode | Re-run seed from `SUPABASE_SETUP.sql` (step 2). |

## What's next (optional hardening)

- Re-price orders server-side via a Postgres function (never trust client totals).
- WhatsApp Business API for automatic confirmations.
- Order tracking tokens (private links instead of public Order IDs).
- Hosted images (Supabase Storage) instead of local `assets/catalogue-*.jpg`.
