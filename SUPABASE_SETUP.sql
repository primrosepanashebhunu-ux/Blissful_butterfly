-- ============================================================================
-- BLISSFUL BUTTERFLY — SUPABASE SETUP
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query → Run
-- Creates: products, orders, order_history, settings + RLS policies + seed data
-- Customers: anon role can read products + insert orders (pay-on-collection model)
-- Admin: authenticated role only (create admin user in Authentication → Users)
-- ============================================================================

-- ── 1) Products ─────────────────────────────────────────────────────────────
create table if not exists public.products (
  id text primary key,
  cat text not null default 'stanley',
  name text not null,
  price numeric not null default 0 check (price >= 0),
  old numeric not null default 0,
  rating numeric not null default 5,
  reviews int not null default 0,
  tag text default '',
  stock int not null default 0 check (stock >= 0),
  img text default '',
  descr text default '',
  variants text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz default now()
);
create index if not exists products_active_idx on public.products(active);
create index if not exists products_cat_idx on public.products(cat);

-- ── 2) Orders ───────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id text primary key,                        -- e.g. BB-11051234
  date timestamptz default now(),
  status text not null default 'Placed',
  payment_status text not null default 'Unpaid',
  paid_at timestamptz,
  delivery text not null default 'pickup',    -- 'pickup' | 'delivery'
  payment text not null default 'pay-on-collection',
  customer text not null default '',          -- full name
  phone text not null default '',
  email text not null default '',
  address text default '',
  city text default '',
  note text default '',
  items jsonb not null default '[]'::jsonb,   -- [{id,name,variant,qty,price}]
  totals jsonb not null default '{}'::jsonb,  -- {sub,discount,delivery,tax,total}
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists orders_created_idx on public.orders(created_at desc);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_phone_idx on public.orders(phone);

-- ── 3) Order status history (audit trail for cash payments) ─────────────────
create table if not exists public.order_history (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders(id) on delete cascade,
  status text not null,
  at timestamptz default now()
);
create index if not exists order_history_order_idx on public.order_history(order_id);

-- ── 4) Settings (single row, JSON) ──────────────────────────────────────────
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  value jsonb not null default '{}'::jsonb
);
insert into public.settings(id, value) values (1,
  '{"shopName":"Blissful Butterfly","pickupAddress":"Blissful Butterfly shop — in town. Open Mon–Sat 9am–7pm","deliveryFee":6.99,"freeDeliveryOver":75,"whatsapp":"+15550123456"}'::jsonb
) on conflict (id) do nothing;

-- ── 5) Enable RLS + policies ────────────────────────────────────────────────
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_history enable row level security;
alter table public.settings enable row level security;

-- Products: everyone can READ; only admin (authenticated) can WRITE
drop policy if exists "products_read" on public.products;
create policy "products_read" on public.products for select using (true);
drop policy if exists "products_write" on public.products;
create policy "products_write" on public.products for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Orders: anon can INSERT + SELECT own by ID (track page); admin full access
-- NOTE: demo-simple — anon select is scoped by id in app; harden with tokens later.
drop policy if exists "orders_insert" on public.orders;
create policy "orders_insert" on public.orders for insert to anon with check (true);
drop policy if exists "orders_read" on public.orders;
create policy "orders_read" on public.orders for select to anon using (true);
drop policy if exists "orders_admin" on public.orders;
create policy "orders_admin" on public.orders for all to authenticated using (true) with check (true);

-- Order history: anon can insert (on order create) + read; admin full
drop policy if exists "oh_insert" on public.order_history;
create policy "oh_insert" on public.order_history for insert to anon with check (true);
drop policy if exists "oh_read" on public.order_history;
create policy "oh_read" on public.order_history for select to anon using (true);
drop policy if exists "oh_admin" on public.order_history;
create policy "oh_admin" on public.order_history for all to authenticated using (true) with check (true);

-- Settings: everyone can read; only admin writes
drop policy if exists "settings_read" on public.settings;
create policy "settings_read" on public.settings for select using (true);
drop policy if exists "settings_write" on public.settings;
create policy "settings_write" on public.settings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── 6) Seed: your 3 real Stanley products (from catalogue.js) ────────────────
insert into public.products(id, cat, name, price, old, rating, reviews, tag, stock, img, descr, variants, active) values
  ('catalog-40oz-bows', 'stanley', '40oz Vacuum Insulated Tumbler — Bows & Floral', 15, 0, 4.9, 0, 'Best Seller', 12,
   'assets/catalogue-1.jpg', 'Vacuum insulated 40oz / 1.18L tumbler with handle and bow straw topper. Keeps drinks cold for hours. Designs: Pink Bows, Purple Bows, Blue Floral.',
   '{"Pink Bows","Purple Bows","Blue Floral"}', true),
  ('catalog-18oz-flask', 'stanley', '18oz Vacuum Insulated Flask — Colour', 10, 0, 4.8, 0, 'New', 20,
   'assets/catalogue-2.jpg', 'Vacuum insulated 18oz / 540ml flask with easy-carry cap. Perfect for school, gym and daily hydration. Colours: Red, Purple, Blue, Sage Green.',
   '{"Red","Purple","Blue","Sage Green"}', true),
  ('catalog-14oz-tumbler', 'stanley', '14oz Vacuum Insulated Tumbler — Floral & Stripes', 8, 0, 4.7, 0, 'Girly Fave', 15,
   'assets/catalogue-3.jpg', 'Cute 14oz / 420ml vacuum tumbler with handle. 8hrs cold, 1 day iced, 4hrs hot. Designs: Pink Floral Bows, Pink/White Stripes.',
   '{"Pink Floral Bows","Pink / White Stripes"}', true)
on conflict (id) do nothing;

-- ── 7) Atomic stock decrement (prevents oversell — call from createOrder) ────
-- Returns new stock, or -1 if there isn't enough. Use this in production!
create or replace function public.decrement_stock(p_id text, p_qty int)
returns int language plpgsql security definer as $$
declare v_stock int;
begin
  update public.products set stock = stock - p_qty where id = p_id and stock >= p_qty returning stock into v_stock;
  if not found then return -1; end if;
  return v_stock;
end;
$$;

-- Done! Now:
-- 1) Project Settings → API → copy URL + anon key into assets/supabase.js
-- 2) Authentication → Users → Add your admin email + password
-- 3) Refresh index.html — products + orders now sync across phones.
