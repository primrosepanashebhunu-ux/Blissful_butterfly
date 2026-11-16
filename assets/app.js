/* Blissful Butterfly — frontend store
   BACKEND: window.BB (backend.js) — shared DB between shop & admin.
   NO ONLINE PAYMENT: pay on collection in town, or pay on delivery out of town.
   FIXES: settings from BB.DB (single source), stock-validated checkout,
   XSS-escaped rendering, image fallback, unique order IDs, per-device orders. */
const CONFIG = { currency: '$', taxRate: 0, promos: { BLISS10: 0.10, WELCOME15: 0.15, BUTTERFLY20: 0.20 } };
function getSettings(){ return window.BB?.DB?.getSettings?.() || { deliveryFee: 6.99, freeDeliveryOver: 75, pickupAddress: '' }; }
const CATEGORIES = {
  stanley:  { name:'Stanley Cups',    img:'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&q=80&auto=format&fit=crop', blurb:'Quenchers & tumblers' },
  decor:    { name:'Room Decor',      img:'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800&q=80&auto=format&fit=crop', blurb:'Lanterns, lights & cozy pieces' },
  hampers:  { name:'Gift Hampers',    img:'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800&q=80&auto=format&fit=crop', blurb:'Hand-packed & ready to gift' }
};
/* ✅ FIX (placeholder products removed): only your REAL catalogue
   (assets/catalogue.js) + admin-added products are shown.
   Demo Unsplash products were removed from app.js — if you want to
   add Decor / Hamper items later, use Admin → Products → Add Product.
   This keeps the shop honest: customers only see items you actually sell. */
const PRODUCTS = []; // intentionally empty — real items come from catalogue.js
window.BB_PRODUCTS_DEFAULT = PRODUCTS;
function getProducts(){ return window.BB?.DB?.products?.() || PRODUCTS; }
/* --- state (orders live in shared backend BB.DB) --- */
let cart = JSON.parse(localStorage.getItem('bb_cart')||'[]');
let wishlist = JSON.parse(localStorage.getItem('bb_wish')||'[]');
let activeCat = 'all', searchQ = '', promo = null, selectedVariant = {};
const $ = id => document.getElementById(id);
const money = n => CONFIG.currency + Number(n||0).toFixed(2);
const prod = id => getProducts().find(p=>p.id===id);
function getOrders(){ return window.BB?.DB?.orders?.() || []; }
function getMyOrders(){ return window.BB?.DB?.myOrders?.() || []; }
/* FIX: escape user/product text before injecting into HTML (prevents broken markup / injection) */
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const IMG_FALLBACK = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22800%22 height=%22600%22><rect width=%22800%22 height=%22600%22 fill=%22%23ffe4ee%22/><text x=%22400%22 y=%22300%22 text-anchor=%22middle%22 font-size=%2270%22>🦋</text></svg>";

/* --- views --- */
function showView(v){
  ['shop','checkout','track','success'].forEach(x=>$('view-'+x).classList.toggle('hidden', x!==v));
  window.scrollTo({top:0,behavior:'smooth'});
  if(v==='checkout') renderCheckout();
  if(v==='track') renderMyOrders();
  $('nav').classList.remove('open');
}
/* --- categories / filters --- */
function renderCats(){
  $('catGrid').innerHTML = Object.entries(CATEGORIES).map(([k,c])=>`
    <button onclick="filterCat('${k}')"><img src="${esc(c.img)}" alt="${esc(c.name)}" onerror="this.onerror=null;this.src='${IMG_FALLBACK}'"><span class="overlay2"></span>
    <span class="cat-label"><b>${esc(c.name)}</b><small>${esc(c.blurb)} →</small></span></button>`).join('');
  $('pills').innerHTML = `<button class="pill active" data-cat="all">All</button>` +
    Object.entries(CATEGORIES).map(([k,v])=>`<button class="pill" data-cat="${k}">${esc(v.name)}</button>`).join('');
  $('pills').querySelectorAll('.pill').forEach(b=>b.onclick=()=>filterCat(b.dataset.cat));
}
function filterCat(cat){
  activeCat = cat;
  $('pills').querySelectorAll('.pill').forEach(b=>b.classList.toggle('active', b.dataset.cat===cat));
  $('shopTitle').textContent = cat==='all' ? 'All Products' : CATEGORIES[cat].name;
  showView('shop'); renderProducts();
  document.getElementById('shop').scrollIntoView({behavior:'smooth'});
}
function renderProducts(){
  let list = getProducts().filter(p => (activeCat==='all'||p.cat===activeCat) && p.name.toLowerCase().includes(searchQ));
  const s = $('sortSel').value;
  // Featured: real catalogue first, then defaults, then customs (keeps $15 Stanley on top)
  if(!s || s==='featured') list = [...list].sort((a,b)=>{
    const aReal = String(a.id).startsWith('catalog-')?0:1, bReal = String(b.id).startsWith('catalog-')?0:1;
    return aReal-bReal || Number(b.price||0)-Number(a.price||0);
  });
  if(s==='price-low') list=[...list].sort((a,b)=>a.price-b.price);
  if(s==='price-high') list=[...list].sort((a,b)=>b.price-a.price);
  if(s==='rating') list=[...list].sort((a,b)=>b.rating-a.rating);
  if(s==='name') list=[...list].sort((a,b)=>a.name.localeCompare(b.name));
  $('resultCount').textContent = list.length + ' products';
  $('emptyState').classList.toggle('hidden', list.length>0);
  $('productGrid').innerHTML = list.map(p=>`
    <article class="card">
      <div class="thumb">
        <img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" onclick="openProduct('${esc(p.id)}')" onerror="this.onerror=null;this.src='${IMG_FALLBACK}'">
        ${p.tag?`<span class="tag">${esc(p.tag)}</span>`:''}
        <button onclick="toggleWish('${esc(p.id)}')" aria-label="Wishlist">${wishlist.includes(p.id)?'♥':'♡'}</button>
      </div>
      <div class="body">
        <span class="cat">${esc(CATEGORIES[p.cat]?.name || p.cat)}</span>
        <h3 onclick="openProduct('${esc(p.id)}')" style="cursor:pointer">${esc(p.name)}</h3>
        <span class="stars">★★★★★ ${esc(p.rating)} (${esc(p.reviews||0)})</span>
        <p class="desc">${esc(p.desc)}</p>
        <span class="stock ${p.stock<=5?'low':'ok'}">${p.stock<=0?'Out of stock':(p.stock<=5?`Only ${p.stock} left!`:'In stock')}</span>
        <div class="row"><span class="price">${money(p.price)} ${p.old?`<span class="old">${money(p.old)}</span>`:''}</span>
        <button class="add" ${p.stock<=0?'disabled style="opacity:.5"':''} onclick="addToCart('${esc(p.id)}')">${p.stock<=0?'Out of Stock':'Add to Cart'}</button></div>
      </div>
    </article>`).join('');
}
function applySearch(){ searchQ = $('searchInput').value.trim().toLowerCase(); showView('shop'); renderProducts(); }
function toggleWish(id){
  wishlist = wishlist.includes(id) ? wishlist.filter(x=>x!==id) : [...wishlist,id];
  localStorage.setItem('bb_wish', JSON.stringify(wishlist)); renderProducts(); renderWishBadge();
  toast(wishlist.includes(id) ? 'Added to wishlist 💖' : 'Removed from wishlist');
}
function renderWishBadge(){ $('wishCount').textContent=wishlist.length; $('wishCount').classList.toggle('hidden', !wishlist.length); }

/* --- product modal --- */
function openProduct(id){
  const p = prod(id); if(!p) return;
  selectedVariant[id] = selectedVariant[id] || p.variants[0];
  $('productModal').innerHTML = `
    <button class="icon-btn close-x" onclick="closeModal()">✕</button>
    <div class="modal-grid">
      <img class="heroimg" src="${esc(p.img)}" alt="${esc(p.name)}" onerror="this.onerror=null;this.src='${IMG_FALLBACK}'">
      <div>
        <span class="cat" style="color:var(--pink-d);font-weight:800;font-size:12px">🦋 ${esc(CATEGORIES[p.cat]?.name || p.cat)}</span>
        <h3>${esc(p.name)}</h3><span style="color:var(--gold)">★★★★★ ${esc(p.rating)} (${esc(p.reviews||0)} reviews)</span>
        <p style="color:var(--muted);margin:10px 0">${esc(p.desc)}</p>
        <p class="price">${money(p.price)} ${p.old?`<span class="old">${money(p.old)}</span>`:''}</p>
        <p style="font-weight:700;margin:12px 0 4px">Choose option:</p>
        <div class="variants">${p.variants.map(v=>`<button class="${v===selectedVariant[id]?'sel':''}" onclick="pickVariant('${esc(id)}','${esc(v)}')">${esc(v)}</button>`).join('')}</div>
        <p style="font-weight:700;color:#d15a75;font-size:14px;margin:8px 0">💖 Pay when you collect in town, or pay on delivery — no online payment!</p>
        <p class="stock ${p.stock<=5?'low':'ok'}">${p.stock<=0?'❌ Out of stock':(p.stock<=5?`⚠️ Only ${p.stock} left in stock`:'✅ In stock, ready in 24h')}</p>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          <button class="btn primary" ${p.stock<=0?'disabled style="opacity:.5"':''} onclick="addToCart('${esc(id)}',true)">Add to Cart 🛒</button>
          <button class="btn ghost" ${p.stock<=0?'disabled style="opacity:.5"':''} onclick="addToCart('${esc(id)}',true);showView('checkout')">Buy Now</button>
        </div>
        <ul style="list-style:none;margin-top:16px;color:var(--muted);font-size:14px">
          <li>🏬 Collect in town — pay on collection (no online payment)</li>
          <li>🚚 Out of town? Admin delivers to you — pay on delivery</li>
          <li>↩️ 7-day easy returns</li><li>💖 FOR ALL YOUR GIRLY GIRLS ITEMS</li>
        </ul>
      </div>
    </div>`;
  $('productModal').classList.remove('hidden'); $('modalOverlay').classList.remove('hidden');
}
function pickVariant(id,v){ selectedVariant[id]=v; openProduct(id); }
function closeModal(){ $('productModal').classList.add('hidden'); $('modalOverlay').classList.add('hidden'); }

/* --- cart --- */
function saveCart(){ localStorage.setItem('bb_cart', JSON.stringify(cart)); renderCart(); }
function addToCart(id, fromModal=false){
  const p = prod(id); if(!p) return;
  if((p.stock||0)<=0){ toast('Sorry, this item is out of stock'); return; }
  const v = selectedVariant[id] || p.variants[0];
  const key = id+'|'+v;
  const found = cart.find(c=>c.key===key);
  const newQty = (found?found.qty:0) + 1;
  if(newQty > (p.stock||0)){ toast(`Only ${p.stock} available — cannot add more`); return; }
  if(found) found.qty = newQty; else cart.push({key,id,variant:v,qty:1});
  saveCart(); toast(`${p.name} (${v}) added to cart 🛒`);
  if(!fromModal) toggleCart(true);
}
function changeQty(key,d){
  const it=cart.find(c=>c.key===key); if(!it) return;
  const p = prod(it.id);
  const next = it.qty + d;
  if(next > (p?.stock||0)){ toast('Not enough stock for that qty'); return; }
  it.qty = next; if(it.qty<=0) cart=cart.filter(c=>c.key!==key); saveCart();
}
function removeItem(key){ cart=cart.filter(c=>c.key!==key); saveCart(); }
function totals(){
  const s = getSettings();
  const sub = cart.reduce((sum,c)=>{ const p=prod(c.id); return p ? sum + p.price*c.qty : sum; }, 0);
  const discount = promo ? sub*CONFIG.promos[promo] : 0;
  const delivery = sub===0?0:(sub-discount>=s.freeDeliveryOver?0:s.deliveryFee);
  const tax = (sub-discount)*CONFIG.taxRate;
  return {sub,discount,delivery,tax,total:sub-discount+delivery+tax};
}
function summaryHTML(showPromo=true){
  const t = totals();
  const items = cart.length ? cart.map(c=>{const p=prod(c.id); if(!p) return ''; return `<div class="cart-item"><img src="${esc(p.img)}" alt="" onerror="this.onerror=null;this.src='${IMG_FALLBACK}'"><div><h4>${esc(p.name)}</h4><small>${esc(c.variant)} × ${c.qty}</small></div><b>${money(p.price*c.qty)}</b></div>`}).join('') : '<p style="color:var(--muted)">Your cart is empty.</p>';
  return `${items}
    <div class="summary-line"><span>Subtotal</span><span>${money(t.sub)}</span></div>
    ${t.discount?`<div class="summary-line"><span>Discount (${esc(promo)})</span><span>−${money(t.discount)}</span></div>`:''}
    <div class="summary-line"><span>Delivery</span><span>${t.delivery===0?'Free 🎉':money(t.delivery)}</span></div>
    ${t.tax?`<div class="summary-line"><span>Tax</span><span>${money(t.tax)}</span></div>`:''}
    <div class="summary-line total"><span>Total</span><span>${money(t.total)}</span></div>`;
}
function paymentLabel(delivery, payment){
  if(payment==='pay-on-delivery' || delivery==='delivery'){
    return '💵 To pay on delivery — admin will deliver to you & you pay on delivery';
  }
  return '💵 To pay on collection — collect in town & pay then';
}
function renderCart(){
  const n = cart.reduce((s,c)=>s+c.qty,0);
  $('cartCount').textContent=n; $('drawerCount').textContent = n?`(${n})`:'';
  $('cartItems').innerHTML = cart.length ? cart.map(c=>{const p=prod(c.id); if(!p) return ''; return `
    <div class="cart-item"><img src="${esc(p.img)}" alt="${esc(p.name)}" onerror="this.onerror=null;this.src='${IMG_FALLBACK}'">
      <div><h4>${esc(p.name)}</h4><small>${esc(c.variant)}</small>
        <div class="qty"><button onclick="changeQty('${esc(c.key)}',-1)">−</button><b>${c.qty}</b><button onclick="changeQty('${esc(c.key)}',1)">+</button></div></div>
      <div><b>${money(p.price*c.qty)}</b><br><button class="add" style="background:#fff;color:#c0392b;border:1px solid #f0d0d0;margin-top:6px;padding:6px 10px" onclick="removeItem('${esc(c.key)}')">Remove</button></div>
    </div>`}).join('') : '<p style="color:var(--muted);text-align:center;padding:30px 0">Your cart is empty 🦋<br>Add something beautiful!</p>';
  $('cartFoot').innerHTML = cart.length ? summaryHTML(false) +
    `<p style="font-size:13px;font-weight:700;margin:8px 0;color:#d15a75">💖 No online payment — you pay when you collect in town, or pay on delivery when admin delivers to you.</p>
     <button class="btn primary big" onclick="toggleCart(false);showView('checkout')">Checkout →</button>
     <button class="btn ghost big" onclick="toggleCart(true)">Continue shopping</button>` : '';
  $('payBtnTotal').textContent = money(totals().total);
  if($('payInfoTotal')) $('payInfoTotal').textContent = money(totals().total);
}
function toggleCart(open){
  $('cartDrawer').classList.toggle('hidden', !open);
  $('cartOverlay').classList.toggle('hidden', !open);
}
function applyPromo(){
  const code = $('promoInput').value.trim().toUpperCase();
  if(CONFIG.promos[code]){ promo=code; $('promoMsg').textContent='✅ Promo applied! Saved for checkout.'; $('promoMsg').style.color='green'; }
  else { promo=null; $('promoMsg').textContent='Invalid code — try BLISS10'; $('promoMsg').style.color='#c0392b'; }
  renderCart();
}

/* --- checkout / orders --- */
function renderCheckout(){
  if(!cart.length){ toast('Your cart is empty — add a product first'); showView('shop'); return; }
  // Prune items that are now out of stock / missing
  cart = cart.filter(c=>{ const p=prod(c.id); return p && p.stock>0; });
  if(!cart.length){ toast('Those items just sold out — sorry!'); showView('shop'); return; }
  $('checkoutSummary').innerHTML = `<h3 style="margin-bottom:14px">Order Summary</h3>` + summaryHTML(false) +
    `<p style="font-size:13px;font-weight:700;margin-top:10px;color:#d15a75">💖 ${paymentLabel('pickup','pay-on-collection')}</p>`;
  $('payBtnTotal').textContent = money(totals().total);
  if($('payInfoTotal')) $('payInfoTotal').textContent = money(totals().total);
  document.querySelectorAll('#checkoutForm [name="delivery"], #checkoutForm [name="payment"]').forEach(el=>{
    el.onchange = ()=>{
      const d = document.querySelector('[name="delivery"]:checked')?.value;
      const addr = $('addressInput');
      if(addr){ if(d==='pickup'){ addr.required=false; } else { addr.required=true; } }
      renderCheckout();
    };
  });
}
async function placeOrder(e){
  e.preventDefault();
  const f = new FormData(e.target);
  // Honeypot FIRST — bots that fill it must never create an order / reserve stock
  if(String(f.get('website')||'').trim() !== ''){ toast('Spam detected — order not sent'); return; }
  // Basic input validation (demo — production needs server validation)
  const phone = String(f.get('phone')||'').replace(/\D/g,'');
  if(phone.length < 7){ toast('Please enter a valid phone / WhatsApp number'); return; }
  const email = String(f.get('email')||'');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ toast('Please enter a valid email'); return; }
  if(f.get('delivery')==='delivery' && !String(f.get('address')||'').trim()){ toast('Delivery address is required for out-of-town orders'); return; }
  const t = totals();
  const order = {
    id: window.BB?.newOrderId?.() || ('BB-'+Math.floor(100000+Math.random()*900000)),
    date:new Date().toISOString(), status:'Placed', paymentStatus:'Unpaid',
    customer:{name:((f.get('firstName')||'')+' '+(f.get('lastName')||'')).trim(), phone:String(f.get('phone')).trim(), email:email.trim(),
      address:String(f.get('address')||'').trim(), city:String(f.get('city')||'').trim(), note:String(f.get('note')||'').trim()},
    delivery:f.get('delivery'), payment:f.get('payment'),
    items:cart.map(c=>({...c, name:prod(c.id).name, price:prod(c.id).price})),
    totals:t
  };
  // Disable button while saving (prevents double-submit / duplicate orders)
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Placing order… ⏳'; }
  let result;
  try{ result = await window.BB.DB.createOrder(order); }
  catch(err){ result = { ok:false, error: err?.message || 'Network error' }; }
  if(submitBtn){ submitBtn.disabled = false; }
  if(!result.ok){ toast('Order failed: '+(result.error||'unknown')); return; }
  cart=[]; promo=null; saveCart();
  const isPickup = order.delivery==='pickup';
  const payLabel = paymentLabel(order.delivery, order.payment);
  $('successCard').innerHTML = `
    <h3>Order ${esc(order.id)} 🦋</h3>
    <p style="color:var(--muted);margin:6px 0">Confirmation sent to ${esc(order.customer.email)}<br>
    ${isPickup?'🏬 Collect in Town — we’ll message you on WhatsApp when ready. Bring this Order ID.':'🚚 Admin Delivery — we will deliver to: '+esc(order.customer.address)+'. We’ll call you to arrange delivery.'}</p>
    ${order.items.map(i=>`<div class="summary-line"><span>${esc(i.name)} (${esc(i.variant)}) × ${i.qty}</span><span>${money(i.price*i.qty)}</span></div>`).join('')}
    <div class="summary-line total"><span>${isPickup?'To pay on collection':'To pay on delivery'}</span><span>${money(order.totals.total)}</span></div>
    <p style="font-weight:700;color:#d15a75">${esc(payLabel)}</p>
    <p style="color:var(--muted);font-size:13px">💖 No online payment needed! 💾 Save your Order ID to track it: <b>${esc(order.id)}</b></p>`;
  showView('success'); toast('Order placed! 🎉');
}
function stepsHTML(status, delivery){
  const steps = delivery==='delivery' ? ['Placed','Confirmed','Packed','Shipped','Delivered'] : ['Placed','Confirmed','Packed','Ready for Pickup','Collected & Paid'];
  const map = {Placed:0, Paid:1, Confirmed:1, Packed:2, Shipped:3, 'Ready for Pickup':3, Delivered:4, Collected:4, CollectedAndPaid:4, 'Collected & Paid':4, 'Delivered & Paid':4, Cancelled:0};
  const idx = map[status] ?? 0;
  return `<div class="steps">${steps.map((s,i)=>`<span class="${status==='Cancelled'?'':(i<idx?'done':i===idx?'now':'')}">${s}</span>`).join('')}</div>`;
}
async function trackOrder(e){
  e.preventDefault();
  const id=$('trackInput').value.trim().toUpperCase();
  // Live: refresh from Supabase first so the customer sees current status/detail
  if(window.BB?.DB?.refreshOrders) await window.BB.DB.refreshOrders();
  const o=getOrders().find(x=>x.id===id);
  $('trackResult').innerHTML = o ? `
    <div class="order-card"><h3>${esc(o.id)} — ${esc(o.status)} 🦋</h3>${stepsHTML(o.status, o.delivery)}
      <p style="color:var(--muted)">${o.items.map(i=>`${esc(i.name)} × ${i.qty}`).join(' • ')}</p>
      <p style="font-weight:700;color:#d15a75">${esc(paymentLabel(o.delivery, o.payment))}</p>
      <div class="summary-line total"><span>Total to pay</span><span>${money(o.totals.total)}</span></div></div>`
    : '<p style="color:#c0392b">Order not found. Check the ID and try again.</p>';
}
async function renderMyOrders(){
  // Live: pull latest orders from Supabase before rendering
  if(window.BB?.DB?.refreshOrders) await window.BB.DB.refreshOrders();
  const orders = getMyOrders();
  $('myOrders').innerHTML = orders.length ? orders.slice().reverse().map(o=>`
    <div class="order-card"><h3>${esc(o.id)} — ${esc(o.status)}</h3>${stepsHTML(o.status, o.delivery)}
      <p style="color:var(--muted)">${o.items.map(i=>`${esc(i.name)} × ${i.qty}`).join(' • ')}</p>
      <p style="font-weight:700;color:#d15a75">${esc(paymentLabel(o.delivery, o.payment))}</p>
      <b>${money(o.totals.total)}</b></div>`).join('') : '<p style="color:var(--muted)">No orders yet on this device. Place an order to see it here.<br><small>You can also track any order with its Order ID above.</small></p>';
}

/* --- misc --- */
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.remove('hidden'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.add('hidden'),2400); }
function subscribe(e){ e.preventDefault(); $('newsMsg').textContent='✅ Welcome to the Butterfly list! Check your inbox for 10% off.'; $('newsEmail').value=''; toast('Subscribed 💌'); }
function openQuiz(){
  const budget = prompt('What\'s your hamper budget in $? (e.g. 60)', '65');
  const b = Number(budget)||65;
  const pick = getProducts().filter(p=>p.cat==='hampers').sort((a,b)=>Math.abs(a.price-b)-Math.abs(b.price-b))[0];
  if(pick){ toast(`🎁 We recommend: ${pick.name} (${money(pick.price)})`); openProduct(pick.id); }
}

/* --- wiring --- */
$('cartBtn').onclick=()=>toggleCart(true);
$('menuBtn').onclick=()=>$('nav').classList.toggle('open');
$('searchBtn').onclick=()=>{ $('searchRow').classList.toggle('hidden'); $('searchInput').focus(); };
$('searchInput').addEventListener('input', e=>{ searchQ=e.target.value.toLowerCase(); renderProducts(); });
$('wishBtn').onclick=()=>toast(wishlist.length?`Wishlist: ${wishlist.map(id=>prod(id)?.name).filter(Boolean).join(', ')}`:'Your wishlist is empty — tap ♡ on a product');
document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(); toggleCart(false);} });

renderCats(); renderProducts(); renderCart(); renderWishBadge();
