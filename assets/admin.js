/* Blissful Butterfly — ADMIN DASHBOARD
   Access: Shop header → "🦋 Admin" → demo login (see Settings; default
   username shown in login box). Sections: Dashboard | Orders | Products |
   Customers | Settings

   HOW IT WORKS:
   • Reads/writes the SAME browser database as the shop (backend.js = BB.DB)
   • Customer orders instantly appear here (same device demo; in production a real server syncs them)
   • Admin confirms by WhatsApp, updates status, collects payment in person
   • Stock automatically reserved on order, returned on cancel
   • Status changes are logged (history) for paid/cash records
*/
let adminTabName = 'dashboard';
const moneyA = n => '$' + Number(n||0).toFixed(2);
const esc = s => String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function openAdminLogin(){ document.getElementById('adminLoginOverlay').classList.remove('hidden'); }
function closeAdminLogin(){ document.getElementById('adminLoginOverlay').classList.add('hidden'); }
/* AUTH — Supabase Auth when live; demo fallback when local.
   Live: email + hashed password via supabase.auth (server-side, secure).
   Local demo: username/password (admin / butterfly123), rate-limited. */
let _loginAttempts = [];
async function adminLogin(e){
  e.preventDefault();
  const msg = document.getElementById('adminLoginMsg');
  const email = document.getElementById('adminEmail').value.trim();
  const pass = document.getElementById('adminPass').value;

  if(window.BB?.isLive){
    msg.textContent = 'Signing in…';
    const { error } = await BB.DB.signIn(email, pass);
    if(error){ msg.textContent = 'Invalid email or password.'; return; }
    sessionStorage.setItem('bb_admin','1');
    msg.textContent = '';
    closeAdminLogin(); openAdmin();
    toast('Welcome back, Admin 🦋');
    return;
  }

  // Local demo fallback (no Supabase keys yet)
  const now = Date.now();
  _loginAttempts = _loginAttempts.filter(t => now - t < 60000);
  if(_loginAttempts.length >= 5){ msg.textContent = 'Too many attempts. Wait a minute and try again.'; return; }
  const s = BB.DB.getSettings();
  // Demo: accept "admin" as username OR any email sharing the demo password.
  // Change password in Settings. Production uses Supabase Auth (above).
  const userOk = (email === (s.adminUser || 'admin') || email.includes('@'));
  if(userOk && pass === (s.adminPass || 'butterfly123')){
    sessionStorage.setItem('bb_admin','1');
    msg.textContent = '';
    closeAdminLogin(); openAdmin();
    toast('Welcome back, Admin 🦋');
  } else {
    _loginAttempts.push(now);
    msg.textContent = 'Wrong username or password.';
  }
}
function openAdmin(){
  if(sessionStorage.getItem('bb_admin')!=='1'){ openAdminLogin(); return; }
  document.getElementById('adminPanel').classList.remove('hidden');
  document.body.style.overflow='hidden';
  renderAdmin();
}
async function logoutAdmin(){
  if(window.BB?.DB?.signOut) await BB.DB.signOut();
  sessionStorage.removeItem('bb_admin');
  document.getElementById('adminPanel').classList.add('hidden');
  document.body.style.overflow='';
  toast('Logged out');
}
function adminTab(name){
  adminTabName = name;
  document.querySelectorAll('.admin-tabs button[data-tab]').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
  renderAdmin();
}
async function renderAdmin(){
  // Live: pull latest orders/products first (fresh for admin)
  if(window.BB?.DB?.refreshOrders) await window.BB.DB.refreshOrders();
  if(window.BB?.DB?.refreshLive) await window.BB.DB.refreshLive();
  if(window.BB?.DB?.refreshHistory) await window.BB.DB.refreshHistory();
  const body = document.getElementById('adminBody');
  const stats = BB.DB.stats();
  document.getElementById('adminOrderBadge').textContent = stats.pending || 0;

  if(adminTabName==='dashboard'){
    const orders = BB.DB.orders().slice().reverse().slice(0,8);
    body.innerHTML = `
      <h2 style="color:var(--pink-d)">Dashboard 🦋 — FOR ALL YOUR GIRLY GIRLS ITEMS</h2>
      <div class="stat-grid" style="margin-top:16px">
        <div class="stat-card"><b>${stats.totalOrders}</b><span>Total orders</span></div>
        <div class="stat-card"><b>${stats.pending}</b><span>New — needs confirmation</span></div>
        <div class="stat-card"><b>${moneyA(stats.revenue)}</b><span>Collected so far (in-person payments)</span></div>
        <div class="stat-card"><b>${stats.lowStock}</b><span>Low-stock products (≤5)</span></div>
        <div class="stat-card"><b>${stats.collectPending}</b><span>In-town collections pending</span></div>
        <div class="stat-card"><b>${stats.deliveryPending}</b><span>Out-of-town deliveries pending</span></div>
        <div class="stat-card"><b>${stats.products}</b><span>Products in catalogue</span></div>
        <div class="stat-card"><b>${BB.DB.customers().length}</b><span>Customers (by phone)</span></div>
      </div>
      <div class="admin-card"><h3>How today works</h3>
        <p style="color:var(--muted)">1) Customer orders on website → appears here instantly. 2) Tap <b>Order ID</b> → open Orders → send WhatsApp confirmation. 3) Pack order. 4) Set status to <b>Ready for Pickup</b> (in town) or <b>Shipped</b> (out of town). 5) Customer pays in person → set <b>Collected &amp; Paid / Delivered &amp; Paid</b>. No online payment needed 💖</p>
      </div>
      <h3 style="margin:18px 0 8px;color:var(--pink-d)">Latest orders</h3>
      ${orders.length?orders.map(orderCardHTML).join(''):'<p style="color:var(--muted)">No orders yet. Place a test order from the shop to see it here.</p>'}
    `;
  }

  if(adminTabName==='orders'){
    // Pending (Placed) first, then newest first — admin works the queue top-down
    const orders = BB.DB.orders().slice().reverse().sort((a,b)=>{
      const pa = a.status==='Placed'?0:1, pb = b.status==='Placed'?0:1;
      return pa-pb || new Date(b.date)-new Date(a.date);
    });
    body.innerHTML = `<h2 style="color:var(--pink-d)">Orders 📦</h2>
      <p style="color:var(--muted);margin:8px 0 14px">New orders first. Update status as you pack, deliver and collect payment. WhatsApp opens a pre-filled message to the customer.</p>
      ${orders.length?orders.map(orderCardHTML).join(''):'<p style="color:var(--muted)">No orders yet.</p>'}`;
  }

  if(adminTabName==='products'){
    const products = BB.DB.products();
    const hidden = (window.BB_PRODUCTS_DEFAULT||[]).length
      ? (window.BB_CATALOGUE||[]).concat(window.BB_PRODUCTS_DEFAULT).filter(p=>{
          // shows how many hidden items exist (demo: clear overrides via devtools to restore)
          return !products.some(x=>x.id===p.id);
        }).length : 0;
    body.innerHTML = `<h2 style="color:var(--pink-d)">Products &amp; Stock 🥤</h2>
      <p style="color:var(--muted);margin:8px 0 12px">${products.length} live products${hidden?` • ${hidden} hidden`:''}. Stock changes appear in the shop instantly.</p>
      <div class="admin-card"><h3>Add new product</h3>
        <form id="addProductForm" onsubmit="adminAddProduct(event)">
          <div class="two"><input id="npName" placeholder="Product name *" required><input id="npPrice" type="number" min="0" step="0.01" placeholder="Price $ *" required></div>
          <div class="two"><select id="npCat">
            <option value="stanley">Stanley Cups</option><option value="decor">Room Decor</option><option value="hampers">Gift Hampers</option></select>
          <input id="npStock" type="number" min="0" placeholder="Stock quantity *" required></div>
          <div class="two"><input id="npTag" placeholder="Tag e.g. New / Best Seller"><input id="npImg" placeholder="Image URL (or leave blank for placeholder)"></div>
          <input id="npDesc" placeholder="Short description">
          <input id="npVariants" placeholder="Variants comma-separated e.g. Pink, Purple, Blue">
          <button class="btn primary" type="submit" style="margin-top:10px">➕ Add Product</button>
        </form>
      </div>
      <table class="admin-table"><thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead><tbody>
      ${products.map(p=>`
        <tr><td><img src="${esc(p.img)}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px;vertical-align:middle" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22><rect width=%2280%22 height=%2280%22 fill=%22%23ffe4ee%22/><text x=%2240%22 y=%2246%22 text-anchor=%22middle%22 font-size=%2224%22>🦋</text></svg>'">
          <b>${esc(p.name)}</b><br><small style="color:var(--muted)">${esc(p.id)} • ${esc(p.cat)}</small></td>
          <td>$${Number(p.price||0).toFixed(2)}</td>
          <td><input value="${p.stock||0}" type="number" min="0" style="width:80px;padding:6px;border:1px solid var(--line);border-radius:8px" onchange="adminSetStock('${p.id}', this.value)"> ${p.stock<=0?'<b style="color:#c0392b">OUT!</b>':(p.stock<=5?'<b style="color:#c0392b">LOW!</b>':'✅')}</td>
          <td><button class="small-btn" onclick="adminHideProduct('${p.id}')">Hide</button></td></tr>`).join('')}
      </tbody></table>
      <small style="color:var(--muted);display:block;margin-top:10px">Hiding removes the product from the shop. To un-hide, clear the <code>bb_product_overrides</code> key in browser storage (demo). New products appear in the shop immediately.</small>`;
  }

  if(adminTabName==='customers'){
    const customers = BB.DB.customers();
    body.innerHTML = `<h2 style="color:var(--pink-d)">Customers 👩</h2>
      <table class="admin-table" style="margin-top:12px"><thead><tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Total spent</th><th>Last order</th><th>Actions</th></tr></thead><tbody>
      ${customers.length?customers.map(c=>`<tr><td><b>${esc(c.name)}</b><br><small>${esc(c.email||'')}</small><br><small style="color:var(--muted)">${esc(c.city||'')} ${esc(c.address||'')}</small></td>
        <td>${esc(c.phone)}</td><td>${c.orders}</td><td>${moneyA(c.spent)}</td><td>${new Date(c.last).toLocaleDateString()}</td>
        <td><a class="small-btn green" href="${BB.whatsappLink(c.phone,'🦋 Hello '+c.name.split(' ')[0]+'! This is Blissful Butterfly. Thanks for shopping with us! 💖')}" target="_blank" rel="noopener">💬 WhatsApp</a></td></tr>`).join(''):'<tr><td colspan="6" style="color:var(--muted)">No customers yet — they appear after the first order.</td></tr>'}
      </tbody></table>`;
  }

  if(adminTabName==='settings'){
    const s = BB.DB.getSettings();
    const live = Boolean(window.BB?.isLive);
    body.innerHTML = `<h2 style="color:var(--pink-d)">Settings ⚙️</h2>
      ${live?'<p style="background:#e6f4ea;color:#14532d;border-radius:10px;padding:10px 14px;font-weight:700">🟢 LIVE — connected to Supabase. Orders sync across phones.</p>':'<p style="background:#fff4cd;color:#856404;border-radius:10px;padding:10px 14px;font-weight:700">🟡 Demo mode — add Supabase keys in assets/supabase.js (see SUPABASE_SETUP.sql) to go live.</p>'}
      <form onsubmit="adminSaveSettings(event)" style="margin-top:14px">
        <div class="admin-card">
          <label>Pickup address (shown to in-town customers)<input name="pickupAddress" value="${esc(s.pickupAddress)}" style="width:100%;padding:10px;border:2px solid var(--line);border-radius:10px;margin-top:6px"></label><br><br>
          <div class="two"><label>Delivery fee $<input name="deliveryFee" type="number" step="0.01" min="0" value="${s.deliveryFee}" style="width:100%;padding:10px;border:2px solid var(--line);border-radius:10px;margin-top:6px"></label>
          <label>Free delivery over $<input name="freeDeliveryOver" type="number" step="0.01" min="0" value="${s.freeDeliveryOver}" style="width:100%;padding:10px;border:2px solid var(--line);border-radius:10px;margin-top:6px"></label></div><br>
          <label>Business WhatsApp number<input name="whatsapp" value="${esc(s.whatsapp)}" style="width:100%;padding:10px;border:2px solid var(--line);border-radius:10px;margin-top:6px"></label>
        </div>
        ${live?`<div class="admin-card"><h3>🔐 Admin login (Supabase Auth)</h3>
          <p style="color:var(--muted)">You're signed in with Supabase Auth. Manage users in Supabase → Authentication → Users. Passwords are hashed server-side — no plain-text passwords here.</p>
        </div>`:`<div class="admin-card"><h3>🔐 Change admin login (demo)</h3>
          <div class="two"><label>Admin username<input name="adminUser" value="${esc(s.adminUser||'admin')}" style="width:100%;padding:10px;border:2px solid var(--line);border-radius:10px;margin-top:6px"></label>
          <label>Admin password<input name="adminPass" value="${esc(s.adminPass||'')}" placeholder="(leave blank to keep current)" style="width:100%;padding:10px;border:2px solid var(--line);border-radius:10px;margin-top:6px"></label></div>
          <small style="color:var(--muted)">Demo only — passwords are stored in this browser. Add Supabase keys to switch to secure Auth.</small>
        </div>`}
        <button class="btn primary" type="submit">💾 Save Settings</button>
      </form>
      <div class="admin-card" style="margin-top:18px"><h3>🔁 Supabase setup</h3>
        <p style="color:var(--muted)">1) Create a project at supabase.com. 2) Run <b>SUPABASE_SETUP.sql</b> in SQL Editor. 3) Paste URL + anon key in <b>assets/supabase.js</b>. 4) Create admin user in Authentication → Users. Orders then sync between customer phones and your admin phone.</p>
      </div>`;
  }
}

function orderCardHTML(o){
  const statusClass = (o.status||'').replace(/\s.*$/,'');
  const next = nextStatus(o);
  return `<div class="admin-card">
    <div class="admin-row" style="justify-content:space-between">
      <b style="font-size:17px">${esc(o.id)} <span class="badge-status ${statusClass}">${esc(o.status)}</span></b>
      <small style="color:var(--muted)">${new Date(o.date).toLocaleString()} • ${o.delivery==='pickup'?'🏬 Collect in Town':'🚚 Admin Delivery'}</small>
    </div>
    <p style="margin:8px 0"><b>${esc(o.customer.name)}</b> • ${esc(o.customer.phone)} • ${esc(o.customer.email||'')}</p>
    <p style="color:var(--muted)">${o.delivery==='delivery'?('📍 '+esc(o.customer.address||'')+' '+(o.customer.city||'')):'🏬 Pickup: '+esc(BB.DB.getSettings().pickupAddress)}</p>
    ${(o.items||[]).map(i=>`<div class="summary-line"><span>${esc(i.name)} (${esc(i.variant)}) × ${i.qty}</span><span>${moneyA(i.price*i.qty)}</span></div>`).join('')}
    ${o.customer.note?`<p>💌 Gift note: <i>${esc(o.customer.note)}</i></p>`:''}
    <div class="summary-line total"><span>To pay ${o.payment==='pay-on-delivery'||o.delivery==='delivery'?'on delivery':'on collection'}</span><span>${moneyA(o.totals?.total)}</span></div>
    <p style="font-weight:700;color:var(--pink-d)">${o.paymentStatus==='Paid'?('✅ Paid'+(o.paidAt?(' • '+new Date(o.paidAt).toLocaleString()):'')):'💵 Payment pending (pay in person)'}</p>
    ${BB.DB.history ? `<p style="color:var(--muted);font-size:12px">History: ${BB.DB.history(o.id).map(h=>esc(h.status)+' '+new Date(h.at).toLocaleDateString()).join(' → ')||'—'}</p>`:''}
    <div class="admin-row" style="margin-top:10px">
      <select id="st-${o.id}" onchange="adminSetStatus('${o.id}', this.value)">
        ${statusOptions(o.status, o.delivery)}
      </select>
      ${next?`<button class="small-btn pink" onclick="adminSetStatus('${o.id}','${next}')">➡️ Next: ${next}</button>`:''}
      <a class="small-btn green" href="${BB.whatsappLink(o.customer.phone, BB.orderMessage(o,'confirmed'))}" target="_blank" rel="noopener">💬 WhatsApp Customer</a>
      <button class="small-btn ghost" onclick="window.print()">🖨️ Print</button>
    </div>
  </div>`;
}
function statusOptions(current, delivery){
  const pickup = ['Placed','Confirmed','Packed','Ready for Pickup','Collected & Paid','Cancelled'];
  const shipped = ['Placed','Confirmed','Packed','Shipped','Delivered & Paid','Cancelled'];
  const list = delivery==='delivery'?shipped:pickup;
  return list.map(s=>`<option ${s===current?'selected':''}>${s}</option>`).join('');
}
function nextStatus(o){
  const pickup = ['Placed','Confirmed','Packed','Ready for Pickup','Collected & Paid'];
  const shipped = ['Placed','Confirmed','Packed','Shipped','Delivered & Paid'];
  const flow = o.delivery==='delivery'?shipped:pickup;
  const i = flow.indexOf(o.status);
  return (i>=0 && i<flow.length-1) ? flow[i+1] : null;
}
async function adminSetStatus(id, status){
  await BB.DB.updateStatus(id, status);
  await renderAdmin();
  toast(`Order ${id} → ${status}`);
}
function adminSetStock(id, n){
  BB.DB.setStock(id, Number(n)||0);
  if(typeof renderProducts==='function') renderProducts();
  toast('Stock updated');
}
async function adminHideProduct(id){
  if(confirm('Hide this product from the shop? It will not be deleted forever.')){ await BB.DB.deleteProduct(id); await renderAdmin(); if(typeof renderProducts==='function') renderProducts(); toast('Product hidden'); }
}
async function adminAddProduct(e){
  e.preventDefault();
  const f = e.target;
  const id = 'custom-' + Date.now();
  const variants = f.npVariants.value.split(',').map(s=>s.trim()).filter(Boolean);
  await BB.DB.addCustomProduct({
    id, cat: f.npCat.value, name: f.npName.value.trim(), price: Number(f.npPrice.value)||0, old:0,
    rating: 5.0, reviews: 0, tag: f.npTag.value||'', stock: Number(f.npStock.value)||0,
    img: f.npImg.value || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22800%22 height=%22600%22><rect width=%22800%22 height=%22600%22 fill=%22%23ffe4ee%22/><text x=%22400%22 y=%22300%22 text-anchor=%22middle%22 font-size=%2270%22>🦋</text></svg>',
    desc: f.npDesc.value||'Beautiful girly items from Blissful Butterfly.',
    variants: variants.length?variants:['Standard'],
  });
  await renderAdmin(); if(typeof renderProducts==='function') renderProducts();
  toast('Product added 🦋');
}
function adminSaveSettings(e){
  e.preventDefault();
  const f = new FormData(e.target);
  const s = BB.DB.getSettings();
  s.pickupAddress = f.get('pickupAddress');
  s.deliveryFee = Math.max(0, Number(f.get('deliveryFee'))||0);
  s.freeDeliveryOver = Math.max(0, Number(f.get('freeDeliveryOver'))||0);
  s.whatsapp = f.get('whatsapp');
  s.adminUser = String(f.get('adminUser')||'').trim() || 'admin';
  const np = String(f.get('adminPass')||'');
  if(np) s.adminPass = np; // only overwrite if a new password was typed
  BB.DB.saveSettings(s);
  toast('Settings saved 💾');
}
