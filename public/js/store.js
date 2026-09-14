// ---------- shared helpers ----------
const API = "/api";
const money = (n) => `₹${Number(n).toFixed(2).replace(/\.00$/, "")}`;

function getToken() { return localStorage.getItem("aa_customer_token"); }
function getCustomerName() { return localStorage.getItem("aa_customer_name"); }
function setSession(token, name) {
  localStorage.setItem("aa_customer_token", token);
  localStorage.setItem("aa_customer_name", name);
}
function clearSession() {
  localStorage.removeItem("aa_customer_token");
  localStorage.removeItem("aa_customer_name");
}
function getCart() { return JSON.parse(localStorage.getItem("aa_cart") || "[]"); }
function setCart(cart) { localStorage.setItem("aa_cart", JSON.stringify(cart)); }

async function api(path, options = {}) {
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

// =====================================================
// LOGIN / REGISTER PAGE
// =====================================================
if (document.getElementById("loginForm")) {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const formTitle = document.getElementById("formTitle");

  document.getElementById("switchToRegister").addEventListener("click", (e) => {
    e.preventDefault();
    loginForm.style.display = "none";
    registerForm.style.display = "block";
    formTitle.textContent = "Create your account";
    document.getElementById("switchToRegisterWrap").style.display = "none";
    document.getElementById("switchToLoginWrap").style.display = "inline";
  });
  document.getElementById("switchToLogin").addEventListener("click", (e) => {
    e.preventDefault();
    registerForm.style.display = "none";
    loginForm.style.display = "block";
    formTitle.textContent = "Welcome back";
    document.getElementById("switchToLoginWrap").style.display = "none";
    document.getElementById("switchToRegisterWrap").style.display = "inline";
  });

  loginForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  const msg = document.getElementById("loginMsg");
  msg.style.display = "none";

  try {

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    const data = await api("/auth/customer/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    setSession(data.token, data.name);

    if (data.policiesAcceptedAt) {
      window.location.href = "/";
    } else {
      window.location.href = "/agree.html";
    }

  } catch (err) {

    msg.textContent = err.message;
    msg.className = "form-msg error";

  }

});
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("registerMsg");
    msg.style.display = "none";
    try {
      const name = document.getElementById("regName").value.trim();
      const email = document.getElementById("regEmail").value.trim();
      const phone = document.getElementById("regPhone").value.trim();
      const address = document.getElementById("regAddress").value.trim();
      const password = document.getElementById("regPassword").value;
      const data = await api("/auth/customer/register", { method: "POST", body: JSON.stringify({ name, email, phone, address, password }) });
      setSession(data.token, data.name);

if (data.policiesAcceptedAt) {
  window.location.href = "/";
} else {
  window.location.href = "/agree.html";
}
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "form-msg error";
    }
  });

  // ---- Google sign-in ----
  async function handleGoogleCredentialResponse(response) {
    const msg = document.getElementById("loginMsg");
    msg.style.display = "none";
    try {
      const data = await api("/auth/customer/google", { method: "POST", body: JSON.stringify({ idToken: response.credential }) });
      setSession(data.token, data.name);

if (data.policiesAcceptedAt) {
  window.location.href = "/";
} else {
  window.location.href = "/agree.html";
}
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "form-msg error";
      msg.style.display = "block";
    }
  }
  window.handleGoogleCredentialResponse = handleGoogleCredentialResponse;

  (async function initGoogleSignIn() {
    try {
      const cfg = await api("/auth/config");
      if (!cfg.googleClientId) return;
      // The Google script loads with async/defer, so wait for it to be ready.
      let attempts = 0;
      while (!window.google && attempts < 40) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
      if (!window.google) return;
      google.accounts.id.initialize({
        client_id: cfg.googleClientId,
        callback: handleGoogleCredentialResponse
      });
      google.accounts.id.renderButton(document.getElementById("googleBtnContainer"), {
        theme: "outline",
        size: "large",
        width: 320
      });
    } catch (err) {
      // Google sign-in is optional - fail silently if not configured yet.
    }
  })();
}

// =====================================================
// STOREFRONT PAGE
// =====================================================
if (document.getElementById("productGrid")) {
  let allProducts = [];
  let activeCategory = "";
  let activeSearch = "";

  const grid = document.getElementById("productGrid");
  const emptyState = document.getElementById("emptyState");
  const resultCount = document.getElementById("resultCount");
  const shopTitle = document.getElementById("shopTitle");

  function renderAccount() {
    const label = document.getElementById("accountLabel");
    label.textContent = getToken() ? getCustomerName().split(" ")[0] : "Login";
  }

  function updateCartBadge() {
  const cart = getCart();
  const count = cart.reduce((n, l) => n + l.qty, 0);

  const badge = document.getElementById("cartCount");
  badge.textContent = count;

  badge.classList.remove("cart-badge-pop");

  // Restart animation
  void badge.offsetWidth;

  badge.classList.add("cart-badge-pop");
}

  function renderCategories(cats) {
    const strip = document.getElementById("categoryStrip");
    strip.innerHTML = `<a class="cat-pill ${activeCategory === "" ? "active" : ""}" data-cat="">All items</a>`;
    cats.forEach((c) => {
      strip.innerHTML += `<a class="cat-pill ${activeCategory === c ? "active" : ""}" data-cat="${c}">${c}</a>`;
    });
    strip.querySelectorAll(".cat-pill").forEach((el) => {
      el.addEventListener("click", () => {
        activeCategory = el.dataset.cat;
        shopTitle.textContent = activeCategory || "All items";
        renderCategories(cats);
        renderGrid();
      });
    });
  }

  function renderGrid() {
    let items = allProducts;
    if (activeCategory) items = items.filter((p) => p.category === activeCategory);
    if (activeSearch) {
      const q = activeSearch.toLowerCase();
      items = items.filter((p) => p.name.toLowerCase().includes(q));
    }
    resultCount.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
    grid.innerHTML = "";
    emptyState.style.display = items.length ? "none" : "block";

    items.forEach((p) => {
      const card = document.createElement("div");
      card.className = "product-card";
      const out = p.stockQty <= 0;
      const low = !out && p.stockQty <= p.lowStockThreshold;
      card.innerHTML = `
        <div class="product-thumb">
          ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}">` : `🧺`}
          ${out ? `<span class="stock-flag out">Out of stock</span>` : low ? `<span class="stock-flag low">Only ${p.stockQty} left</span>` : ""}
        </div>
        <div class="product-body">
          <span class="product-cat">${p.category}</span>
          <div class="product-name">${p.name}</div>
          <div class="product-unit">per ${p.unit}</div>
          <div class="product-foot">
            <div class="price" id="price-${p.id}">${money(p.wholesalePrice || p.retailPrice)}<br><small>pice / ${p.unit}</small></div>
               ${p.wholesalePrice ? `<div style="font-size:1em; margin-top:2px;"><span style="text-decoration:line-through;">${money(p.retailPrice)}</span> <small>retail / ${p.unit}</small></div>` : ''}
          </div>
          <div class="product-foot" style="margin-top:6px;">
          ${p.unit === 'kg' && !/\d+\s*(kg|g)\b/i.test(p.name) ? `
          <div class="field" style="margin-bottom:6px;">
            <select class="weight-select" style="width:100%; padding:6px; border-radius:6px;">
            <option value="0.1">100g</option>
            <option value="0.25" selected>250g</option>
            <option value="0.5">500g</option>
            <option value="1">1kg</option>
            </select>
             </div>
            ` : ''}
            <div class="qty-stepper">
              <button type="button" class="qty-minus">−</button>
              <span class="qty-val">1</span>
              <button type="button" class="qty-plus">+</button>
            </div>
            <button type="button" class="add-btn" ${out ? "disabled" : ""}>${out ? "Sold out" : "Add"}</button>
          </div>
        </div>
      `;
      const qtyVal = card.querySelector(".qty-val");
      card.querySelector(".qty-minus").addEventListener("click", () => {
        qtyVal.textContent = Math.max(1, Number(qtyVal.textContent) - 1);
      });
      card.querySelector(".qty-plus").addEventListener("click", () => {
        qtyVal.textContent = Math.min(p.stockQty, Number(qtyVal.textContent) + 1);
      });
      if (p.unit === 'kg' && !/\d+\s*(kg|g)\b/i.test(p.name)) {
  const weightSelect = card.querySelector('.weight-select');
  const priceDiv = card.querySelector(`#price-${p.id}`);
  const basePrice = p.wholesalePrice || p.retailPrice;
  weightSelect.addEventListener('change', () => {
    const frac = parseFloat(weightSelect.value);
    priceDiv.innerHTML = `${money(basePrice * frac)}<br><small>for ${weightSelect.options[weightSelect.selectedIndex].text}</small>`;
  });
}
      card.querySelector(".add-btn").addEventListener("click", () => {
  const weightSelect = card.querySelector('.weight-select');
  const frac = p.unit === 'kg' && weightSelect
    ? parseFloat(weightSelect.value)
    : 1;
  addToCart(p, Number(qtyVal.textContent), frac);
  qtyVal.textContent = 1;
  if (weightSelect) weightSelect.value = "0.25";
});
      grid.appendChild(card);
    });
  }

  function addToCart(product, qty, packSize = 1) {
    const cart = getCart();
   const line = cart.find((l) => l.productId === product.id && l.packSize === packSize);
if (line) {
  const maxPacks = Math.floor(product.stockQty / packSize);
  line.qty = Math.min(maxPacks, line.qty + qty);
} else {
  const maxPacks = Math.floor(product.stockQty / packSize);
  cart.push({
    productId: product.id,
    name: product.name,
    unit: product.unit,
    packSize: packSize,
    price: (product.wholesalePrice || product.retailPrice) * packSize,
    qty: Math.min(qty, maxPacks),
    maxStock: maxPacks
  });
}
    setCart(cart);
    updateCartBadge();
    openCart();
    showToast(`${product.name} added to cart`);
  }
  let locationMap, locationMarker;

function setupLocationButton() {
  const btn = document.getElementById('useLocationBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast('Geolocation not supported on this device');
      return;
    }
    btn.textContent = 'Getting location...';
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        showLocationOnMap(latitude, longitude);
        await updateAddressFromCoords(latitude, longitude);
        btn.textContent = '📍 Use my current location';
      },
      () => {
        showToast('Could not get your location');
        btn.textContent = '📍 Use my current location';
      }
    );
  });
}

function showLocationOnMap(lat, lon) {
  const mapDiv = document.getElementById('locationMap');
  mapDiv.style.display = 'block';

  if (!locationMap) {
    locationMap = L.map('locationMap').setView([lat, lon], 16);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 20
}).addTo(locationMap);
    locationMarker = L.marker([lat, lon], { draggable: true }).addTo(locationMap);
    locationMarker.on('dragend', async (e) => {
      const { lat, lng } = e.target.getLatLng();
      await updateAddressFromCoords(lat, lng);
    });
  } else {
    locationMap.setView([lat, lon], 16);
    locationMarker.setLatLng([lat, lon]);
  }
  setTimeout(() => locationMap.invalidateSize(), 200);
}

async function updateAddressFromCoords(lat, lon) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18`);
    const data = await res.json();
    document.getElementById('deliveryAddress').value = data.display_name || `${lat}, ${lon}`;
    showToast('Location added — drag the pin to fine-tune');
  } catch (err) {
    document.getElementById('deliveryAddress').value = `${lat}, ${lon}`;
    showToast('Location added (coordinates only)');
  }
}
  function renderCart() {
    const cart = getCart();
    const body = document.getElementById("cartBody");
    if (cart.length === 0) {
      body.innerHTML = `<div class="empty-state"><div class="stamp">AA</div><p>Your cart is empty. Add some items to get started.</p></div>`;
    } else {
      body.innerHTML = cart.map((l, i) => `
        <div class="cart-line">
          <div>
            <div class="cart-line-name">${l.name}</div>
            <div class="cart-line-meta">${l.packSize && l.packSize < 1 ? `${l.packSize * 1000}g` : l.packSize ? `${l.packSize}kg` : l.unit} × ${l.qty}</div>
          </div>
          <div class="cart-line-price">${money(l.qty * l.price)}</div>
          <button class="remove-x" data-i="${i}" aria-label="Remove">✕</button>
        </div>
      `).join("");
      body.querySelectorAll(".remove-x").forEach((btn) => {
        btn.addEventListener("click", () => {
          const cart2 = getCart();
          cart2.splice(Number(btn.dataset.i), 1);
          setCart(cart2);
          renderCart();
          updateCartBadge();
        });
      });
    }
    const total = cart.reduce((s, l) => s + l.qty * l.price, 0);
    document.getElementById("cartTotal").textContent = money(total);
  }

    function openCart() {
  renderCart();
  document.getElementById("overlay").classList.add("open");
  document.getElementById("cartDrawer").classList.add("open");

  // Prevent the background page from scrolling
  document.body.style.overflow = "hidden";
}

  function closeCart() {
  document.getElementById("overlay").classList.remove("open");
  document.getElementById("cartDrawer").classList.remove("open");

  // Allow the background page to scroll again
  document.body.style.overflow = "";
}
  document.getElementById("cartBtn").addEventListener("click", openCart);
  document.getElementById("closeCart").addEventListener("click", closeCart);
  document.getElementById("overlay").addEventListener("click", closeCart);

  // ---- checkout ----
  async function openCheckout() {
  const cart = getCart();

  if (cart.length === 0) return;

  if (!getToken()) {
    window.location.href = "/login.html";
    return;
  }

  const summary = document.getElementById("checkoutSummary");

  summary.innerHTML = cart.map((l) =>
    `<div class="row"><span>${l.name} × ${l.qty}</span><span>${money(l.qty * l.price)}</span></div>`
  ).join("");

  const total = cart.reduce((s, l) => s + l.qty * l.price, 0);

  document.getElementById("checkoutTotal").textContent = money(total);
  document.getElementById("checkoutMsg").style.display = "none";

  // Load customer's saved profile address
  try {
    const profile = await api("/auth/customer/profile");

    const savedAddressBox = document.getElementById("savedAddressBox");
    const savedAddressText = document.getElementById("savedAddressText");

    if (profile.address && profile.address.trim()) {
      savedAddressText.textContent = profile.address;
      savedAddressBox.style.display = "block";

      // Automatically fill the saved address
      document.getElementById("deliveryAddress").value = profile.address;
    } else {
      savedAddressBox.style.display = "none";
    }

  } catch (err) {
    console.error("Could not load saved address:", err);
  }

  closeCart();

  document.getElementById("checkoutOverlay").classList.add("open");
  document.getElementById("checkoutDrawer").classList.add("open");
}
  function closeCheckout() {
    document.getElementById("checkoutOverlay").classList.remove("open");
    document.getElementById("checkoutDrawer").classList.remove("open");
  }
  document.getElementById("checkoutBtn").addEventListener("click", openCheckout);
  document.getElementById("closeCheckout").addEventListener("click", closeCheckout);
  document.getElementById("checkoutOverlay").addEventListener("click", closeCheckout);

  document.getElementById("placeOrderBtn").addEventListener("click", async () => {
    const msg = document.getElementById("checkoutMsg");
    msg.style.display = "none";
    const cart = getCart();
    const paymentMethod = document.getElementById("paymentMethod").value;
    const houseNumber = document.getElementById('houseNumber').value.trim();
const rawAddress = document.getElementById('deliveryAddress').value.trim();
const deliveryAddress = houseNumber ? `${houseNumber}, ${rawAddress}` : rawAddress;
    if (!deliveryAddress) {
      msg.textContent = "Please enter a delivery address.";
      msg.style.display = "block";
      return;
    }
    try {
      const payload = {
        items: cart.map((l) => ({ productId: l.productId, qty: l.qty })),
        paymentMethod,
        deliveryAddress,
        priceMode: "wholesale"
      };
      const { order } = await api("/orders", { method: "POST", body: JSON.stringify(payload) });

      if (paymentMethod === "online") {
        const payData = await api("/payment/create-order", { method: "POST", body: JSON.stringify({ orderId: order.id }) });
        const rzp = new Razorpay({
          key: payData.keyId,
          amount: payData.amount,
          currency: payData.currency,
          order_id: payData.razorpayOrderId,
          name: "AL AZEEM KIRANA AND GENERAL STORE",
          description: `Order #${order.id}`,
          theme: { color: "#1F4D3A" },
          handler: async function (response) {
            await api("/payment/verify", {
              method: "POST",
              body: JSON.stringify({ orderId: order.id, ...response })
            });
            setCart([]);
            updateCartBadge();
            closeCheckout();
            alert("Payment successful! Your order has been placed.");
          }
        });
        rzp.open();
      } else {
        setCart([]);
        updateCartBadge();
        closeCheckout();
        alert(`Order placed! Order #${order.id} — pay ₹${order.total.toFixed(2)} on delivery.`);
      }
    } catch (err) {
      msg.textContent = err.message;
      msg.style.display = "block";
    }
  });

  // ---- my orders ----
  const STATUS_LABELS = {
    placed: "Placed", confirmed: "Confirmed", packed: "Packed",
    out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled"
  };
  async function openOrders() {
    if (!getToken()) { window.location.href = "/login.html"; return; }
    const body = document.getElementById("ordersBody");
    body.innerHTML = "<p style='color:#74807A;font-size:13px;'>Loading…</p>";
    document.getElementById("ordersOverlay").classList.add("open");
    document.getElementById("ordersDrawer").classList.add("open");
    try {
      const orders = await api("/orders/my");
      if (orders.length === 0) {
        body.innerHTML = `<div class="empty-state"><div class="stamp">AA</div><p>No orders yet.</p></div>`;
        return;
      }
      body.innerHTML = orders.map((o) => `
        <div class="ledger-card" style="margin:14px 0;">
          <div class="ledger-title">Order #${o.id} · <span class="pill ${o.orderStatus}">${STATUS_LABELS[o.orderStatus]}</span></div>
          ${o.items.map((it) => `<div class="row"><span>${it.name} × ${it.qty}</span><span>${money(it.lineTotal)}</span></div>`).join("")}
          <div class="row" style="border-top:1px solid var(--rule);font-weight:600;"><span>Total</span><span>${money(o.total)}</span></div>
          <div class="row"><span>Payment</span><span>${o.paymentMethod.toUpperCase()} · ${o.paymentStatus}</span></div>
        </div>
      `).join("");
    } catch (err) {
      body.innerHTML = `<p style="color:var(--chili);font-size:13px;">${err.message}</p>`;
    }
  }
  function closeOrders() {
    document.getElementById("ordersOverlay").classList.remove("open");
    document.getElementById("ordersDrawer").classList.remove("open");
  }
  document.getElementById("ordersBtn").addEventListener("click", openOrders);
  document.getElementById("closeOrders").addEventListener("click", closeOrders);
  document.getElementById("ordersOverlay").addEventListener("click", closeOrders);

  const accountBtn = document.getElementById("accountBtn");
const accountMenu = document.getElementById("accountMenu");

accountBtn.addEventListener("click", (event) => {
  event.stopPropagation();

  if (!getToken()) {
    window.location.href = "/login.html";
    return;
  }

  const name = getCustomerName() || "User";

  const profileName = document.getElementById("profileMenuName");
  if (profileName) {
    profileName.textContent = name;
  }

  accountMenu.classList.toggle("open");
});

document.addEventListener("click", (event) => {
  if (
    accountMenu &&
    !accountMenu.contains(event.target) &&
    !accountBtn.contains(event.target)
  ) {
    accountMenu.classList.remove("open");
  }
});
document.getElementById("logoutBtn").addEventListener("click", () => {
  clearSession();
  accountMenu.classList.remove("open");
  renderAccount();
  window.location.reload();
});

document.getElementById("profileOrdersBtn").addEventListener("click", () => {
  accountMenu.classList.remove("open");
  document.getElementById("ordersBtn").click();
});
document.getElementById("profileBtn").addEventListener("click", async () => {
  accountMenu.classList.remove("open");

  const profileDrawer = document.getElementById("profileDrawer");
  const profileOverlay = document.getElementById("profileOverlay");

  profileDrawer.classList.add("open");
  profileOverlay.classList.add("open");

  try {
    const profile = await api("/auth/customer/profile");

    document.getElementById("profileName").value = profile.name || "";
    document.getElementById("profileEmail").value = profile.email || "";
    document.getElementById("profilePhone").value = profile.phone || "";
    document.getElementById("profileAddress").value = profile.address || "";
  } catch (err) {
    document.getElementById("profileMsg").textContent =
      err.message || "Could not load your profile.";
  }
});

document.getElementById("closeProfile").addEventListener("click", () => {
  document.getElementById("profileDrawer").classList.remove("open");
  document.getElementById("profileOverlay").classList.remove("open");
});

document.getElementById("profileOverlay").addEventListener("click", () => {
  document.getElementById("profileDrawer").classList.remove("open");
  document.getElementById("profileOverlay").classList.remove("open");
});


document.getElementById("saveProfileBtn").addEventListener("click", async () => {
  const name = document.getElementById("profileName").value.trim();
  const phone = document.getElementById("profilePhone").value.trim();
  const address = document.getElementById("profileAddress").value.trim();
  const profileMsg = document.getElementById("profileMsg");

  profileMsg.textContent = "";

  if (!name) {
    profileMsg.textContent = "Name is required.";
    return;
  }

  const button = document.getElementById("saveProfileBtn");
  button.disabled = true;
  button.textContent = "Saving...";

  try {
    const updatedProfile = await api("/auth/customer/profile", {
      method: "PUT",
      body: JSON.stringify({
        name,
        phone,
        address
      })
    });

    localStorage.setItem("aa_customer_name", updatedProfile.name);
    renderAccount();

    profileMsg.textContent = "Profile saved successfully.";
    document.getElementById("profileDrawer").classList.remove("open");
document.getElementById("profileOverlay").classList.remove("open");
  } catch (err) {
    profileMsg.textContent = err.message || "Could not save your profile.";
  } finally {
    button.disabled = false;
    button.textContent = "Save Profile";
  }
});


  // ---- wholesale enquiry ----
  // ---- search ----
document.getElementById("searchBtn").addEventListener("click", () => {
  activeSearch = document.getElementById("searchInput").value.trim();
  renderGrid();
  updateClearSearchButton();

  if (activeSearch) {
    document.querySelector(".product-grid").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
});

document.getElementById("searchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    activeSearch = e.target.value.trim();
    renderGrid();
    updateClearSearchButton();

    if (activeSearch) {
      document.querySelector(".product-grid").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }

  if (e.key === "Escape") {
    e.target.value = "";
    activeSearch = "";
    renderGrid();
    updateClearSearchButton();
  }
});

const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");

function updateClearSearchButton() {
  if (searchInput.value.trim()) {
    clearSearchBtn.style.setProperty("display", "flex", "important");
  } else {
    clearSearchBtn.style.setProperty("display", "none", "important");
  }
}

clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  activeSearch = "";
  renderGrid();
  updateClearSearchButton();
  searchInput.focus();
});

searchInput.addEventListener("input", updateClearSearchButton);
updateClearSearchButton();

updateClearSearchButton();

  // ---- init ----
  async function init() {
    renderAccount();
    updateCartBadge();
    setupLocationButton();
    try {
      const [products, cats] = await Promise.all([api("/products"), api("/products/categories")]);
      allProducts = products.sort(
  (a, b) => (a.display_order ?? 999) - (b.display_order ?? 999)
);
      document.getElementById("statItems").textContent = products.length;
      document.getElementById("statCats").textContent = cats.length;
      renderCategories(cats);
      renderGrid();
    } catch (err) {
      grid.innerHTML = `<p style="color:var(--chili);">${err.message}</p>`;
    }
  }
  init();
}
function showToast(message) {
  let toast = document.getElementById('toast-notification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #1f2937;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toast._hideTimeout);
  toast._hideTimeout = setTimeout(() => {
    toast.style.opacity = '0';
  }, 2000);
}

// =========================================================
// FEEDBACK MODAL
// =========================================================
// =========================================================
// FEEDBACK MODAL
// =========================================================

const feedbackBtn = document.getElementById("feedbackBtn");
const feedbackModal = document.getElementById("feedbackModal");
const closeFeedback = document.getElementById("closeFeedback");
const feedbackRating = document.getElementById("feedbackRating");
const stars = document.querySelectorAll(".feedback-rating .star");

if (feedbackBtn && feedbackModal && closeFeedback) {

  feedbackBtn.addEventListener("click", (e) => {
    e.preventDefault();

    feedbackModal.classList.add("open");

    document.body.style.overflow = "hidden";
  });

  closeFeedback.addEventListener("click", () => {
    feedbackModal.classList.remove("open");
    document.body.style.overflow = "";
  });

  feedbackModal.addEventListener("click", (e) => {
    if (e.target === feedbackModal) {
      feedbackModal.classList.remove("open");
      document.body.style.overflow = "";
    }
  });

  stars.forEach((star) => {
    star.addEventListener("click", () => {
      const rating = Number(star.dataset.rating);

      feedbackRating.value = rating;

      stars.forEach((s) => {
        s.classList.toggle(
          "active",
          Number(s.dataset.rating) <= rating
        );
      });
    });
  });

}




// Submit feedback
const submitFeedback = document.getElementById("submitFeedback");
const feedbackText = document.getElementById("feedbackText");
if (submitFeedback && feedbackText) {

submitFeedback.addEventListener("click", async () => {
  const rating = Number(feedbackRating.value);
  const message = feedbackText.value.trim();

  if (!rating) {
  const feedbackMessage = document.getElementById("feedbackMessage");
  feedbackMessage.textContent = "⭐ Please select a star rating.";
  feedbackMessage.className = "feedback-warning";
  feedbackMessage.style.display = "block";
  return;
}

  if (!message) {
  const feedbackMessage = document.getElementById("feedbackMessage");
  feedbackMessage.textContent = "💬 Please enter your feedback.";
  feedbackMessage.className = "feedback-warning";
  feedbackMessage.style.display = "block";
  return;
}

  const token = getToken();

  if (!token) {
  const feedbackMessage = document.getElementById("feedbackMessage");

  if (feedbackMessage) {
    feedbackMessage.textContent = "👤 Please log in to submit feedback.";
    feedbackMessage.style.display = "block";
  }

  return;
}

  submitFeedback.disabled = true;
  submitFeedback.textContent = "Submitting...";

  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        rating,
        message
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not submit feedback.");
    }

    const feedbackMessage = document.getElementById("feedbackMessage");

if (feedbackMessage) {
  feedbackMessage.textContent = "Thank you for your feedback! ❤️";
  feedbackMessage.className = "feedback-success";
  feedbackMessage.style.display = "block";
}

feedbackText.value = "";
feedbackRating.value = "";

stars.forEach((star) => {
  star.classList.remove("active");
});

setTimeout(() => {
  if (feedbackMessage) {
    feedbackMessage.style.display = "none";
  }

  feedbackModal.classList.remove("open");
  document.body.style.overflow = "";
}, 1500);

  } catch (error) {
    console.error("Feedback submission error:", error);
    alert(error.message || "Could not submit feedback. Please try again.");
  } finally {
    submitFeedback.disabled = false;
    submitFeedback.textContent = "Submit Feedback";
  }
});
}

// =====================================================
// CUSTOMER POLICY AGREEMENT PAGE
// =====================================================

if (document.getElementById("continueBtn")) {
  const continueBtn = document.getElementById("continueBtn");
  const agreeCheckbox = document.getElementById("agreeCheckbox");
  const agreeMsg = document.getElementById("agreeMsg");

  continueBtn.addEventListener("click", async () => {
    agreeMsg.style.display = "none";

    if (!agreeCheckbox.checked) {
      agreeMsg.textContent =
        "Please check the box to agree before continuing.";
      agreeMsg.style.display = "block";
      return;
    }

    continueBtn.disabled = true;
    continueBtn.textContent = "Saving...";

    try {
      await api("/auth/customer/accept-policies", {
        method: "PATCH"
      });

      window.location.href = "/";
    } catch (err) {
      console.error("Policy agreement error:", err);

      agreeMsg.textContent =
        err.message || "Could not save your agreement. Please try again.";
      agreeMsg.style.display = "block";

      continueBtn.disabled = false;
      continueBtn.textContent = "Continue to Store";
    }
  });
}

// =====================================================
// POLICY PAGE BACK LINK
// =====================================================

const policyBackLink = document.getElementById("policyBackLink");

if (policyBackLink) {
  policyBackLink.addEventListener("click", async (e) => {
    e.preventDefault();

    const token = getToken();

    if (!token) {
      window.location.href = "/agree.html";
      return;
    }

    try {
      const profile = await api("/auth/customer/profile");

      if (profile && profile.policiesAcceptedAt) {
        window.location.href = "/";
      } else {
        window.location.href = "/agree.html";
      }
    } catch (err) {
      window.location.href = "/agree.html";
    }
  });
}