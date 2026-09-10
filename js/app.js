/* ============================================================
   Banalili Resto — ordering flow
   Menu -> Cart -> Checkout -> Confirm -> Dine-in/Takeout -> Code -> Thank you
   Talks to php/api.php; falls back to local data/logic if no PHP
   server is running, so the demo still works when opened statically.
   ============================================================ */

const state = {
  menu: null,          // { categories: [...] }
  activeCategory: null,
  cart: {},            // { itemId: qty }
  customer: { name: '', contact: '', notes: '' },
  orderType: null,
  lastOrder: null       // { code, total, orderType }
};

const peso = n => '₱' + Number(n).toLocaleString('en-PH');

/* ---------------- view switching ---------------- */
const STEP_LABELS = {
  'view-menu': 'Step 1 of 5 — Menu',
  'view-cart': 'Step 2 of 5 — Your order',
  'view-checkout': 'Step 3 of 5 — Checkout',
  'view-confirm': 'Step 4 of 5 — Confirm',
  'view-ordertype': 'Step 5 of 5 — Dine in or take out',
  'view-thankyou': 'Order complete'
};

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('stepIndicator').textContent = STEP_LABELS[id] || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById('cart-bar').classList.toggle(
    'show',
    cartCount() > 0 && ['view-menu', 'view-cart'].includes(id)
  );
}

document.addEventListener('click', e => {
  const target = e.target.closest('[data-goto]');
  if (target) showView(target.dataset.goto);
});

/* ---------------- menu loading ---------------- */
async function loadMenu() {
  try {
    const res = await fetch('php/api.php?action=menu');
    if (!res.ok) throw new Error('api unavailable');
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'menu load failed');
    state.menu = data.menu;
  } catch (err) {
    // PHP not running (e.g. opened as a static file) — fall back to the raw JSON.
    const res = await fetch('data/menu.json');
    state.menu = await res.json();
  }
  state.activeCategory = state.menu.categories[0].id;
  renderCategoryTabs();
  renderMenuGrid();
}

function renderCategoryTabs() {
  const wrap = document.getElementById('categoryTabs');
  wrap.innerHTML = '';
  state.menu.categories.forEach(cat => {
    const tab = document.createElement('button');
    tab.className = 'cat-tab' + (cat.id === state.activeCategory ? ' active' : '');
    tab.textContent = cat.name;
    tab.addEventListener('click', () => {
      state.activeCategory = cat.id;
      renderCategoryTabs();
      renderMenuGrid();
    });
    wrap.appendChild(tab);
  });
}

function findItem(id) {
  for (const cat of state.menu.categories) {
    const found = cat.items.find(i => i.id === id);
    if (found) return found;
  }
  return null;
}

function renderMenuGrid() {
  const grid = document.getElementById('menuGrid');
  const cat = state.menu.categories.find(c => c.id === state.activeCategory);
  grid.innerHTML = '';
  cat.items.forEach(item => {
    const qty = state.cart[item.id] || 0;
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-top">
        <h3>${item.name}</h3>
        <div class="item-price">${peso(item.price)}</div>
      </div>
      <p class="item-desc">${item.desc}</p>
      <div class="item-add-row"></div>
    `;
    const row = card.querySelector('.item-add-row');
    if (qty === 0) {
      const btn = document.createElement('button');
      btn.className = 'add-btn';
      btn.textContent = 'Add to order';
      btn.addEventListener('click', () => { changeQty(item.id, 1); renderMenuGrid(); });
      row.appendChild(btn);
    } else {
      row.appendChild(buildQtyControl(item.id, qty, () => renderMenuGrid()));
    }
    grid.appendChild(card);
  });
}

function buildQtyControl(id, qty, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'qty-control';
  wrap.innerHTML = `<button data-act="minus">−</button><span>${qty}</span><button data-act="plus">+</button>`;
  wrap.querySelector('[data-act="minus"]').addEventListener('click', () => { changeQty(id, -1); onChange(); });
  wrap.querySelector('[data-act="plus"]').addEventListener('click', () => { changeQty(id, 1); onChange(); });
  return wrap;
}

/* ---------------- cart logic ---------------- */
function changeQty(id, delta) {
  const next = (state.cart[id] || 0) + delta;
  if (next <= 0) delete state.cart[id];
  else state.cart[id] = next;
  updateCartBar();
}

function cartCount() {
  return Object.values(state.cart).reduce((a, b) => a + b, 0);
}

function cartTotal() {
  return Object.entries(state.cart).reduce((sum, [id, qty]) => {
    const item = findItem(id);
    return sum + (item ? item.price * qty : 0);
  }, 0);
}

function updateCartBar() {
  const count = cartCount();
  const bar = document.getElementById('cart-bar');
  document.getElementById('cartBarCount').textContent = count + (count === 1 ? ' item' : ' items');
  document.getElementById('cartBarTotal').textContent = peso(cartTotal());
  const menuOrCart = document.getElementById('view-menu').classList.contains('active') ||
                      document.getElementById('view-cart').classList.contains('active');
  bar.classList.toggle('show', count > 0 && menuOrCart);
}

function renderCartList() {
  const list = document.getElementById('cartList');
  const summary = document.getElementById('cartSummary');
  const toCheckoutBtn = document.getElementById('toCheckoutBtn');
  list.innerHTML = '';

  const entries = Object.entries(state.cart);
  if (entries.length === 0) {
    list.innerHTML = '<div class="empty-state">Your order is empty. Go add something delicious!</div>';
    summary.style.display = 'none';
    toCheckoutBtn.disabled = true;
    return;
  }

  entries.forEach(([id, qty]) => {
    const item = findItem(id);
    if (!item) return;
    const row = document.createElement('div');
    row.className = 'cart-row';
    row.innerHTML = `
      <div class="info">
        <h4>${item.name}</h4>
        <span>${peso(item.price)} each</span>
      </div>
    `;
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.appendChild(buildQtyControl(id, qty, () => renderCartList()));
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => { delete state.cart[id]; updateCartBar(); renderCartList(); });
    controls.appendChild(removeBtn);
    row.appendChild(controls);
    list.appendChild(row);
  });

  summary.style.display = 'block';
  document.getElementById('cartSubtotal').textContent = peso(cartTotal());
  document.getElementById('cartTotal').textContent = peso(cartTotal());
  toCheckoutBtn.disabled = false;
}

document.querySelector('[data-goto="view-cart"]').addEventListener('click', () => {}); // no-op, handled by delegate
document.getElementById('toCheckoutBtn').addEventListener('click', () => showView('view-checkout'));

/* keep cart view + bar fresh whenever we navigate into it */
const cartNav = document.querySelectorAll('[data-goto="view-cart"]');
cartNav.forEach(btn => btn.addEventListener('click', renderCartList));

/* ---------------- checkout ---------------- */
function buildOrderSummaryHTML() {
  const rows = Object.entries(state.cart).map(([id, qty]) => {
    const item = findItem(id);
    return `<div class="summary-row"><span>${item.name} × ${qty}</span><span>${peso(item.price * qty)}</span></div>`;
  }).join('');
  return rows + `<div class="summary-row total"><span>Total</span><b>${peso(cartTotal())}</b></div>`;
}

document.getElementById('toConfirmBtn').addEventListener('click', () => {
  const name = document.getElementById('custName').value.trim();
  const contact = document.getElementById('custContact').value.trim();
  const notes = document.getElementById('custNotes').value.trim();
  const errBox = document.getElementById('checkoutError');

  if (!name || !contact) {
    errBox.textContent = 'Please enter your name and contact number.';
    errBox.style.display = 'block';
    return;
  }
  errBox.style.display = 'none';
  state.customer = { name, contact, notes };

  const summary = document.getElementById('confirmSummary');
  summary.innerHTML = `
    <div class="summary-row"><span><b>Name</b></span><span>${name}</span></div>
    <div class="summary-row"><span><b>Contact</b></span><span>${contact}</span></div>
    ${notes ? `<div class="summary-row"><span><b>Notes</b></span><span>${notes}</span></div>` : ''}
    <div style="height:10px;"></div>
    ${buildOrderSummaryHTML()}
  `;
  showView('view-confirm');
});

document.getElementById('confirmOrderBtn').addEventListener('click', () => {
  showView('view-ordertype');
});

/* ---------------- dine-in / takeout -> place order ---------------- */
document.querySelectorAll('.type-card').forEach(card => {
  card.addEventListener('click', async () => {
    state.orderType = card.dataset.type;
    document.querySelectorAll('.type-card').forEach(c => c.style.opacity = '0.5');
    card.style.opacity = '1';

    const payload = {
      customer: state.customer,
      orderType: state.orderType,
      items: Object.entries(state.cart).map(([id, qty]) => ({ id, qty }))
    };

    const result = await placeOrder(payload);
    state.lastOrder = result;
    renderThankYou();
    showView('view-thankyou');
  });
});

async function placeOrder(payload) {
  try {
    const res = await fetch('php/api.php?action=place_order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'order failed');
    return data;
  } catch (err) {
    // No PHP server available — generate the confirmation locally so the
    // ordering flow still completes end-to-end for demo purposes.
    return {
      success: true,
      code: generateLocalCode(),
      total: cartTotal(),
      orderType: payload.orderType,
      fallback: true
    };
  }
}

function generateLocalCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const pick = s => s[Math.floor(Math.random() * s.length)];
  return `${pick(letters)}${Math.floor(Math.random()*10)}${Math.floor(Math.random()*10)}${pick(letters)}${Math.floor(Math.random()*10)}`;
}

function renderThankYou() {
  const order = state.lastOrder;
  document.getElementById('orderCode').textContent = order.code;
  document.getElementById('finalOrderType').textContent =
    order.orderType === 'dine-in' ? '🍽️ Dine In' : '🥡 Take Out';
  document.getElementById('finalTotalMsg').textContent =
    `Total: ${peso(order.total)} — see you soon!`;
}

document.getElementById('newOrderBtn').addEventListener('click', () => {
  state.cart = {};
  state.customer = { name: '', contact: '', notes: '' };
  state.orderType = null;
  state.lastOrder = null;
  document.getElementById('checkoutForm').reset();
  document.querySelectorAll('.type-card').forEach(c => c.style.opacity = '1');
  updateCartBar();
  renderMenuGrid();
  showView('view-menu');
});

/* ---------------- boot ---------------- */
loadMenu();
