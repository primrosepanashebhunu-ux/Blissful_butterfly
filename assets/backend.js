/* ============================================================================
   BLISSFUL BUTTERFLY — BACKEND (Supabase live OR local demo)
   ----------------------------------------------------------------------------
   MODE:
   • Supabase configured (assets/supabase.js has URL + anon key) → LIVE
     Orders sync between customer phones and the admin phone. Real Supabase
     Auth (email + hashed password). Atomic stock via Postgres function.
   • No keys (or Supabase unreachable) → LOCAL DEMO (same device only,
     localStorage). The shop/admin UI is identical in both modes.

   FIXES APPLIED (kept from local version):
   • Stock can't go negative; orders rejected when stock is insufficient.
   • Unique Order IDs (date + random + counter, no collisions).
   • Order history log (status changes with timestamps) for paid/cash records.
   • Settings are the SINGLE source of truth (delivery fee, pickup, WhatsApp).
   • No cross-customer leak: "My orders" reads a per-device bucket locally,
     and live tracking works by Order ID.
   ============================================================================ */
(function(){
'use strict';

/* ── Config ──────────────────────────────────────────────────────────────── */
const CFG = window.BB_SUPABASE_CONFIG || {};
const SUPA_URL = CFG.url || '', SUPA_KEY = CFG.anonKey || '';
const isLive = Boolean(SUPA_URL && SUPA_KEY && window.supabase && window.supabase.createClient);
let supabase = null;
if(isLive){
  try{ supabase = window.supabase.createClient(SUPA_URL, SUPA_KEY); }catch(e){ supabase = null; }
}
const LIVE = Boolean(supabase);
window.BB_MODE = LIVE ? 'live' : 'local';

/* ── Shared helpers (both modes) ─────────────────────────────────────────── */
function whatsappLink(phone, message){
  const clean = String(phone||'').replace(/[^\d+]/g,'').replace(/^\+/,'');
  return 'https://wa.me/' + clean + '?text=' + encodeURIComponent(message);
}
function orderMessage(o, type){
  const name = ((o.customer && o.customer.name) || 'Butterfly').split(' ')[0];
  const lines = [
    `🦋 Hello ${name}! This is Blissful Butterfly.`,
    `Your order *${o.id}* (${(o.items||[]).map(i=>`${i.name} (${i.variant}) x${i.qty}`).join(', ')}) — Total: $${(o.totals?.total||0).toFixed(2)}`,
  ];
  if(o.delivery==='pickup') lines.push('🏬 Please collect in town and pay when you collect. Bring your Order ID.');
  else lines.push(`🚚 Admin will deliver to: ${o.customer.address||''}. Please pay on delivery.`);
  if(type==='ready') lines.push('✅ Your order is READY FOR PICKUP!');
  if(type==='shipped') lines.push('🚚 Your order is on its way — pay on delivery.');
  if(type==='paid') lines.push('🎉 Thank you! Payment received. Enjoy your items! 💖');
  if(type==='confirmed') lines.push('✅ We confirmed your order. We will pack it now.');
  lines.push('FOR ALL YOUR GIRLY GIRLS ITEMS 🦋');
  return lines.join('\n');
}
let _seq = parseInt(localStorage.getItem('bb_seq')||'0', 10) || 0;
function newOrderId(){
  _seq = (_seq + 1) % 10000;
  localStorage.setItem('bb_seq', String(_seq));
  const d = new Date();
  const mmdd = String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
  const rand = String(Math.floor(Math.random()*9000)+1000);
  return 'BB-' + mmdd + rand + String(_seq).padStart(2,'0');
}

/* ── Local DB (demo fallback) ────────────────────────────────────────────── */
const LocalDB = {
  get(k, def){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : (def!==undefined?def:v); }catch(e){ return def; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); },
  orders(){ return LocalDB.get('bb_orders', []); },
  saveOrders(o){ LocalDB.set('bb_orders', o); },
  products(){
    const defaults = (window.BB_PRODUCTS_DEFAULT || []);
    const catalogue = (window.BB_CATALOGUE || []);
    const overrides = LocalDB.get('bb_product_overrides', {});
    const custom = LocalDB.get('bb_custom_products', []);
    const all = [...catalogue, ...defaults, ...custom];
    const seen = new Set(); const out = [];
    for(const p of all){
      if(seen.has(p.id)) continue; seen.add(p.id);
      const o = overrides[p.id] || {};
      if(o.active === false) continue;
      out.push({ ...p, ...o });
    }
    return out;
  },
  saveOverride(id, patch){ const o = LocalDB.get('bb_product_overrides', {}); o[id] = { ...(o[id]||{}), ...patch }; LocalDB.set('bb_product_overrides', o); },
  addCustomProduct(p){ const c = LocalDB.get('bb_custom_products', []); c.push(p); LocalDB.set('bb_custom_products', c); },
  deleteProduct(id){ LocalDB.set('bb_custom_products', LocalDB.get('bb_custom_products', []).filter(p=>p.id!==id)); LocalDB.saveOverride(id, { active:false }); },
  setStock(id, n){ LocalDB.saveOverride(id, { stock: Math.max(0, Number(n)||0) }); },
  adjustStock(id, delta){
    const p = LocalDB.products().find(x=>x.id===id); if(!p) return null;
    const next = (Number(p.stock)||0) + delta;
    if(next < 0) return null;
    LocalDB.setStock(id, next); return next;
  },
  createOrder(order){
    for(const it of (order.items||[])){
      const p = LocalDB.products().find(x=>x.id===it.id);
      if(!p) return { ok:false, error:'Product not found: '+it.id };
      if(Number(p.stock||0) < Number(it.qty||1)) return { ok:false, error:'Not enough stock for '+p.name };
    }
    if(LocalDB.orders().some(o=>o.id===order.id)) return { ok:false, error:'Duplicate order ID — please try again' };
    const orders = LocalDB.orders(); orders.push(order); LocalDB.saveOrders(orders);
    (order.items||[]).forEach(it=>{ LocalDB.adjustStock(it.id, -Number(it.qty||1)); });
    LocalDB.logHistory(order.id, 'Placed');
    const mine = LocalDB.get('bb_my_orders', []); if(!mine.includes(order.id)){ mine.push(order.id); LocalDB.set('bb_my_orders', mine); }
    return { ok:true, order };
  },
  updateStatus(id, newStatus){
    const orders = LocalDB.orders();
    const o = orders.find(x=>x.id===id); if(!o) return null;
    const was = o.status;
    o.status = newStatus; o.updatedAt = new Date().toISOString();
    if(newStatus==='Collected & Paid' || newStatus==='Delivered & Paid'){ o.paymentStatus='Paid'; o.paidAt = o.updatedAt; }
    if(newStatus==='Cancelled' && was!=='Cancelled') (o.items||[]).forEach(it=>{ LocalDB.adjustStock(it.id, Number(it.qty||1)); });
    LocalDB.saveOrders(orders); LocalDB.logHistory(id, newStatus);
    return o;
  },
  logHistory(orderId, status){ const h = LocalDB.get('bb_status_history', []); h.push({ orderId, status, at: new Date().toISOString() }); LocalDB.set('bb_status_history', h); },
  history(orderId){ return LocalDB.get('bb_status_history', []).filter(h=>h.orderId===orderId); },
  myOrders(){ const mine = LocalDB.get('bb_my_orders', []); return LocalDB.orders().filter(o=>mine.includes(o.id)); },
  getSettings(){
    const s = LocalDB.get('bb_settings', { shopName:'Blissful Butterfly', pickupAddress:'Blissful Butterfly shop — in town. Open Mon–Sat 9am–7pm', deliveryFee:6.99, freeDeliveryOver:75, whatsapp:'+15550123456' });
    s.deliveryFee = Number.isFinite(Number(s.deliveryFee)) ? Math.max(0, Number(s.deliveryFee)) : 6.99;
    s.freeDeliveryOver = Number.isFinite(Number(s.freeDeliveryOver)) ? Math.max(0, Number(s.freeDeliveryOver)) : 75;
    return s;
  },
  saveSettings(s){ s.deliveryFee = Math.max(0, Number(s.deliveryFee)||0); s.freeDeliveryOver = Math.max(0, Number(s.freeDeliveryOver)||0); LocalDB.set('bb_settings', s); },
};

/* ── Supabase mapping helpers ────────────────────────────────────────────── */
function rowToProduct(r){
  return { id:r.id, cat:r.cat||'stanley', name:r.name||'', price:Number(r.price)||0, old:Number(r.old)||0,
    rating:Number(r.rating)||5, reviews:Number(r.reviews)||0, tag:r.tag||'', stock:Number(r.stock)||0,
    img:r.img||'', desc:r.descr||'', variants: r.variants||[], featured:true };
}
function orderToRow(o){
  return { id:o.id, date:o.date, status:o.status, payment_status:o.paymentStatus||'Unpaid', paid_at:o.paidAt||null,
    delivery:o.delivery, payment:o.payment,
    customer:o.customer?.name||'', phone:o.customer?.phone||'', email:o.customer?.email||'',
    address:o.customer?.address||'', city:o.customer?.city||'', note:o.customer?.note||'',
    items:o.items||[], totals:o.totals||{} };
}
function rowToOrder(r){
  return { id:r.id, date:r.date, status:r.status, paymentStatus:r.payment_status||'Unpaid', paidAt:r.paid_at||null, updatedAt:r.updated_at||null,
    delivery:r.delivery, payment:r.payment,
    customer:{ name:r.customer||'', phone:r.phone||'', email:r.email||'', address:r.address||'', city:r.city||'', note:r.note||'' },
    items:r.items||[], totals:r.totals||{} };
}

/* ── Unified DB API (shop + admin use these; mode handled internally) ────── */
const DB = {
  /* Products are cached after first live load for sync UI; refreshed by refreshLive() */
  _liveProducts: null,
  _liveSettings: null,

  products(){
    if(LIVE && DB._liveProducts) return DB._liveProducts;
    return LocalDB.products();
  },
  async refreshLive(){
    if(!LIVE) return;
    try{
      const { data: prods } = await supabase.from('products').select('*').eq('active', true).order('created_at');
      if(prods && prods.length) DB._liveProducts = prods.map(rowToProduct);
      else if(!DB._liveProducts) DB._liveProducts = LocalDB.products(); // seed fallback until seeded
      const { data: set } = await supabase.from('settings').select('value').eq('id', 1).single();
      if(set?.value) DB._liveSettings = { ...DB._liveSettings, ...set.value, deliveryFee: Math.max(0, Number(set.value.deliveryFee)||0), freeDeliveryOver: Math.max(0, Number(set.value.freeDeliveryOver)||0) };
    }catch(e){ /* offline — use cache/local */ }
    // Re-render shop if it exists
    if(typeof renderProducts === 'function') renderProducts();
    if(typeof renderAdmin === 'function' && !document.getElementById('adminPanel')?.classList.contains('hidden')) renderAdmin();
  },

  orders(){ if(LIVE) return DB._liveOrders || []; return LocalDB.orders(); },
  _liveOrders: [],
  async refreshOrders(){
    if(!LIVE) return;
    try{
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending:false }).limit(200);
      if(data) DB._liveOrders = data.map(rowToOrder);
    }catch(e){}
    if(typeof renderAdmin === 'function' && !document.getElementById('adminPanel')?.classList.contains('hidden')) renderAdmin();
  },

  getSettings(){
    if(LIVE && DB._liveSettings) return DB._liveSettings;
    return LocalDB.getSettings();
  },
  saveSettings(s){ /* live: write to Supabase settings table */ if(LIVE){ const v={...s}; delete v.adminUser; delete v.adminPass; supabase.from('settings').upsert({id:1, value:v}).then(()=>DB.refreshLive()); } LocalDB.saveSettings(s); },

  myOrders(){ if(LIVE){ const mine = LocalDB.get('bb_my_orders', []); return DB._liveOrders.filter(o=>mine.includes(o.id)); } return LocalDB.myOrders(); },
  history(orderId){
    if(LIVE && DB._liveHistory) return DB._liveHistory.filter(h=>h.order_id===orderId).map(h=>({orderId:h.order_id, status:h.status, at:h.at}));
    return LocalDB.history(orderId);
  },
  _liveHistory: [],
  logHistory(orderId, status){ if(LIVE){ supabase.from('order_history').insert({order_id:orderId, status}).then(()=>DB.refreshHistory()); } LocalDB.logHistory(orderId, status); },
  async refreshHistory(){
    if(!LIVE) return;
    try{ const { data } = await supabase.from('order_history').select('*').order('at'); if(data) DB._liveHistory = data; }catch(e){}
  },

  customers(){
    const orders = DB.orders();
    const map = {};
    orders.forEach(o=>{
      const key = (o.customer && o.customer.phone) || 'unknown';
      if(!map[key]) map[key] = { phone:key, name:o.customer?.name, email:o.customer?.email, address:o.customer?.address, city:o.customer?.city, orders:0, spent:0, last:o.date };
      map[key].orders++; map[key].spent += (o.totals?.total||0); map[key].last = o.date;
    });
    return Object.values(map).sort((a,b)=> new Date(b.last)-new Date(a.last));
  },
  stats(){
    const orders = DB.orders();
    const active = orders.filter(o=>o.status!=='Cancelled');
    const revenue = active.filter(o=>o.paymentStatus==='Paid').reduce((s,o)=>s+(o.totals?.total||0),0);
    const pending = orders.filter(o=>o.status==='Placed').length;
    const collectPending = orders.filter(o=>o.delivery==='pickup' && !['Collected & Paid','Cancelled'].includes(o.status)).length;
    const deliveryPending = orders.filter(o=>o.delivery==='delivery' && !['Delivered & Paid','Cancelled'].includes(o.status)).length;
    const lowStock = DB.products().filter(p=>(p.stock||0)<=5);
    return { totalOrders: orders.length, activeOrders: active.length, revenue, pending, collectPending, deliveryPending, lowStock: lowStock.length, products: DB.products().length };
  },

  /* ── Writes (async-capable; UI can await or fire-and-forget) ─────────── */
  async createOrder(order){
    if(!LIVE) return LocalDB.createOrder(order);
    // Live: validate then insert atomically via RPC (prevents oversell)
    try{
      for(const it of (order.items||[])){
        const { data: stock } = await supabase.rpc('decrement_stock', { p_id: it.id, p_qty: Number(it.qty||1) });
        if(stock === -1 || stock == null) return { ok:false, error:'Not enough stock for '+it.name };
      }
      const { error } = await supabase.from('orders').insert(orderToRow(order));
      if(error) return { ok:false, error:error.message };
      await supabase.from('order_history').insert({ order_id: order.id, status:'Placed' });
      const mine = LocalDB.get('bb_my_orders', []); if(!mine.includes(order.id)){ mine.push(order.id); LocalDB.set('bb_my_orders', mine); }
      await DB.refreshOrders(); await DB.refreshLive();
      return { ok:true, order };
    }catch(e){ return { ok:false, error:'Network error — please try again' }; }
  },

  async updateStatus(id, newStatus){
    if(!LIVE) return LocalDB.updateStatus(id, newStatus);
    const o = DB._liveOrders.find(x=>x.id===id) || (await supabase.from('orders').select('*').eq('id', id).single().then(r=>r.data?rowToOrder(r.data):null));
    if(!o) return null;
    const was = o.status;
    const patch = { status:newStatus, updated_at:new Date().toISOString() };
    if(newStatus==='Collected & Paid' || newStatus==='Delivered & Paid'){ patch.payment_status='Paid'; patch.paid_at=new Date().toISOString(); }
    await supabase.from('orders').update(patch).eq('id', id);
    if(newStatus==='Cancelled' && was!=='Cancelled'){
      for(const it of (o.items||[])){ await supabase.from('products').update({ stock: (DB.products().find(p=>p.id===it.id)?.stock||0) + Number(it.qty||1) }).eq('id', it.id); }
    }
    await supabase.from('order_history').insert({ order_id:id, status:newStatus });
    await DB.refreshOrders(); await DB.refreshLive(); await DB.refreshHistory();
    return o;
  },

  setStock(id, n){
    if(LIVE){ supabase.from('products').update({ stock: Math.max(0, Number(n)||0) }).eq('id', id).then(()=>DB.refreshLive()); return; }
    LocalDB.setStock(id, n);
  },
  async addCustomProduct(p){
    if(LIVE){
      await supabase.from('products').insert({ id:p.id, cat:p.cat, name:p.name, price:p.price, old:0, rating:5, reviews:0, tag:p.tag||'', stock:p.stock||0, img:p.img||'', descr:p.desc||'', variants:p.variants||[], active:true });
      await DB.refreshLive(); return;
    }
    LocalDB.addCustomProduct(p);
  },
  deleteProduct(id){
    if(LIVE){ supabase.from('products').update({ active:false }).eq('id', id).then(()=>DB.refreshLive()); return; }
    LocalDB.deleteProduct(id);
  },

  /* Auth (live only — local demo login handled in admin.js) */
  async signIn(email, password){
    if(!LIVE) return { error:'Supabase not configured' };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  },
  async signOut(){ if(LIVE) await supabase.auth.signOut(); sessionStorage.removeItem('bb_admin'); },
  async session(){ if(!LIVE) return null; const { data } = await supabase.auth.getSession(); return data?.session || null; },
};

/* ── Boot: load live data + session; show sync banner ────────────────────── */
async function boot(){
  const banner = document.getElementById('syncBanner');
  if(LIVE){
    if(banner){ banner.classList.remove('hidden'); banner.textContent = '🟢 Live — connected to Supabase (orders sync across phones)'; banner.style.background = '#e6f4ea'; banner.style.color = '#14532d'; }
    await DB.refreshLive(); await DB.refreshOrders(); await DB.refreshHistory();
    const session = await DB.session();
    if(session) sessionStorage.setItem('bb_admin','1');
  } else {
    if(banner){ banner.classList.remove('hidden'); banner.textContent = '🟡 Demo mode — orders saved on this device only. Add Supabase keys in assets/supabase.js to go live.'; banner.style.background = '#fff4cd'; banner.style.color = '#856404'; }
  }
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

window.BB = { DB, whatsappLink, orderMessage, newOrderId, supabase, isLive: LIVE };
})();
