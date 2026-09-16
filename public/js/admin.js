const API = "/api";
const money = (n) => `₹${Number(n).toFixed(2).replace(/\.00$/, "")}`;

function getToken() { return localStorage.getItem("aa_admin_token"); }
function setToken(t) { localStorage.setItem("aa_admin_token", t); }
function clearToken() { localStorage.removeItem("aa_admin_token"); }

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const token = getToken();

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API}${path}`, {
    ...options,
    headers
  });

  const text = await res.text();

  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }

  if (!res.ok) {
    console.error("API Error:", {
      url: `${API}${path}`,
      status: res.status,
      response: data
    });

    throw new Error(
      data.error ||
      data.message ||
      `Server error: ${res.status}`
    );
  }

  return data;
}

let allFeedback = [];

// =====================================================
// ADMIN LOGIN PAGE
// =====================================================
if (document.getElementById("adminLoginForm")) {
  document.getElementById("adminLoginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("adminLoginMsg");
    msg.style.display = "none";
    try {
      const username = document.getElementById("adminUsername").value.trim();
      const password = document.getElementById("adminPassword").value;
      const data = await api("/auth/admin/login", { method: "POST", body: JSON.stringify({ username, password }) });
      setToken(data.token);
      window.location.href = "/admin.html";
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "form-msg error";
    }
  });
}

// =====================================================
// ADMIN DASHBOARD PAGE
// =====================================================
if (document.getElementById("tab-dashboard")) {
  if (!getToken()) window.location.href = "/admin-login.html";

  const STATUS_OPTIONS = ["placed", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"];
  const STATUS_LABELS = {
    placed: "Placed", confirmed: "Confirmed", packed: "Packed",
    out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled"
  };

// ---- feedback ----
async function loadFeedback() {
  try {
    const feedback = await api("/dashboard/feedback");
    allFeedback = feedback || [];

    const body = document.getElementById("feedbackBody");

    // Update feedback statistics
    const totalEl = document.getElementById("feedbackTotal");
    const averageEl = document.getElementById("feedbackAverage");
    const fiveStarEl = document.getElementById("feedbackFiveStar");

    const totalFeedback = feedback ? feedback.length : 0;

    const ratings = feedback
      ? feedback
          .map(item => Number(item.rating))
          .filter(rating => !isNaN(rating))
      : [];

    const averageRating =
      ratings.length > 0
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0;

    const fiveStarReviews = ratings.filter(rating => rating === 5).length;

    if (totalEl) {
      totalEl.textContent = totalFeedback;
    }

    if (averageEl) {
      averageEl.textContent = averageRating.toFixed(1);
    }

    if (fiveStarEl) {
      fiveStarEl.textContent = fiveStarReviews;
    }

   // Display feedback table
   renderFeedbackTable(feedback);
  } catch (err) {
    if (!(await handleAuthError(err))) {
      console.error("Feedback loading error:", err);
      alert(err.message || "Could not load feedback.");
    }
  }
}


  // ---- navigation ----
  document.querySelectorAll(".admin-nav a").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".admin-nav a").forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      document.querySelectorAll(".tab-section").forEach((s) => (s.style.display = "none"));
      document.getElementById(`tab-${link.dataset.tab}`).style.display = "block";
      if (link.dataset.tab === "dashboard") loadDashboard();
      if (link.dataset.tab === "products") loadProducts();
      if (link.dataset.tab === "orders") loadOrders();
      if (link.dataset.tab === "stock") loadCategoryList();
      if (link.dataset.tab === "feedback") loadFeedback();
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    clearToken();
    window.location.href = "/admin-login.html";
  });

  async function handleAuthError(err) {
    if (err.message.includes("log in")) {
      clearToken();
      window.location.href = "/admin-login.html";
      return true;
    }
    return false;
  }

  // ---- dashboard ----
  async function loadDashboard() {
    try {
      const s = await api("/dashboard/summary");
      document.getElementById("statSales").textContent = money(s.todaysSales);
      document.getElementById("statOrders").textContent = `${s.todaysOrderCount} orders today`;
      document.getElementById("statProducts").textContent = s.totalProducts;
      document.getElementById("statPending").textContent = s.pendingOrderCount;
      document.getElementById("statCustomers").textContent = s.totalCustomers;

      const body = document.getElementById("lowStockBody");
      const emptyMsg = document.getElementById("lowStockEmpty");
      if (s.lowStock.length === 0) {
        body.innerHTML = "";
        emptyMsg.style.display = "block";
      } else {
        emptyMsg.style.display = "none";
        body.innerHTML = s.lowStock.map((p) => `
          <tr>
            <td>${p.name}</td>
            <td>${p.category}</td>
            <td><span class="pill ${p.stockQty <= 0 ? "out" : "low"}">${p.stockQty} ${p.unit}</span></td>
            <td>${p.lowStockThreshold}</td>
            <td><button class="btn btn-sm btn-outline restock-btn" data-id="${p.id}">Restock</button></td>
          </tr>
        `).join("");
        body.querySelectorAll(".restock-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            document.querySelector('[data-tab="stock"]').click();
          });
        });
      }
    } catch (err) {
      if (!(await handleAuthError(err))) alert(err.message);
    }
  }

  // ---- category datalist for stock form ----
  async function loadCategoryList() {
    try {
      const cats = await api("/products/categories");
      document.getElementById("catList").innerHTML = cats.map((c) => `<option value="${c}">`).join("");
    } catch (err) { /* non-critical */ }
  }

  // ---- stock entry form ----
  document.getElementById("stockForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("stockMsg");
    msg.style.display = "none";
    const fd = new FormData();
    fd.append("name", document.getElementById("sName").value.trim());
    fd.append("category", document.getElementById("sCategory").value.trim());
    fd.append("unit", document.getElementById("sUnit").value);
    fd.append("stockQty", document.getElementById("sQty").value);
    fd.append("costPrice", document.getElementById("sCost").value || 0);
    fd.append("retailPrice", document.getElementById("sRetail").value);
    fd.append("wholesalePrice", document.getElementById("sWholesale").value || document.getElementById("sRetail").value);
    fd.append("lowStockThreshold", document.getElementById("sThreshold").value || 5);
    const imageFile = document.getElementById("sImage").files[0];
    if (imageFile) fd.append("image", imageFile);

    try {
      const result = await api("/products", { method: "POST", body: fd });
      msg.textContent = result.message;
      msg.className = "form-msg success";
      document.getElementById("stockForm").reset();
      loadCategoryList();
    } catch (err) {
      if (await handleAuthError(err)) return;
      msg.textContent = err.message;
      msg.className = "form-msg error";
    }
  });

  // ---- products table ----
  let allProducts = [];
  async function loadProducts() {
    try {
      allProducts = await api("/products");
      renderProducts(allProducts);
    } catch (err) {
      if (!(await handleAuthError(err))) alert(err.message);
    }
  }
  function renderProducts(items) {
    const body = document.getElementById("productsBody");
    if (items.length === 0) {
      body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#74807A;padding:30px;">No products yet — add today's stock entry to get started.</td></tr>`;
      return;
    }
    body.innerHTML = items.map((p) => `
      <tr>
        <td>${p.name}</td>
        <td>${p.category}</td>
        <td><span class="pill ${p.stockQty <= 0 ? "out" : p.stockQty <= p.lowStockThreshold ? "low" : ""}">${p.stockQty} ${p.unit}</span></td>
        <td>${money(p.retailPrice)}</td>
        <td>${money(p.wholesalePrice)}</td>
        <td style="font-size:11.5px;color:#74807A;">${new Date(p.updatedAt).toLocaleDateString()}</td>
        <td><button class="btn btn-sm btn-outline edit-btn" data-id="${p.id}">Edit</button></td>
      </tr>
    `).join("");
    body.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => openEdit(Number(btn.dataset.id)));
    });
  }
  document.getElementById("productSearch").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    renderProducts(allProducts.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)));
  });

  // ---- edit product drawer ----
  function openEdit(id) {
    const p = allProducts.find((x) => x.id === id);
    if (!p) return;
    document.getElementById("eId").value = p.id;
    document.getElementById("eName").value = p.name;
    document.getElementById("eCategory").value = p.category;
    document.getElementById("eUnit").value = p.unit;
    document.getElementById("eQty").value = p.stockQty;
    document.getElementById("eCost").value = p.costPrice;
    document.getElementById("eRetail").value = p.retailPrice;
    document.getElementById("eWholesale").value = p.wholesalePrice;
    document.getElementById("eThreshold").value = p.lowStockThreshold;
    document.getElementById("editMsg").style.display = "none";
    document.getElementById("editOverlay").classList.add("open");
    document.getElementById("editDrawer").classList.add("open");
  }
  function closeEdit() {
    document.getElementById("editOverlay").classList.remove("open");
    document.getElementById("editDrawer").classList.remove("open");
  }
  document.getElementById("closeEdit").addEventListener("click", closeEdit);
  document.getElementById("editOverlay").addEventListener("click", closeEdit);

  document.getElementById("saveProductBtn").addEventListener("click", async () => {
    const id = document.getElementById("eId").value;
    const msg = document.getElementById("editMsg");
    try {
      await api(`/products/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: document.getElementById("eName").value.trim(),
          category: document.getElementById("eCategory").value.trim(),
          unit: document.getElementById("eUnit").value.trim(),
          stockQty: document.getElementById("eQty").value,
          costPrice: document.getElementById("eCost").value,
          retailPrice: document.getElementById("eRetail").value,
          wholesalePrice: document.getElementById("eWholesale").value,
          lowStockThreshold: document.getElementById("eThreshold").value
        })
      });
      closeEdit();
      loadProducts();
    } catch (err) {
      if (await handleAuthError(err)) return;
      msg.textContent = err.message;
      msg.className = "form-msg error";
    }
  });

  document.getElementById("deleteProductBtn").addEventListener("click", async () => {
    const id = document.getElementById("eId").value;
    if (!confirm("Remove this product permanently?")) return;
    try {
      await api(`/products/${id}`, { method: "DELETE" });
      closeEdit();
      loadProducts();
    } catch (err) {
      if (!(await handleAuthError(err))) alert(err.message);
    }
  });

  // ---- orders table ----
  async function loadOrders() {
    try {
      const orders = await api("/orders");
      const body = document.getElementById("ordersBody");
      if (orders.length === 0) {
        body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#74807A;padding:30px;">No orders yet.</td></tr>`;
        return;
      }
      body.innerHTML = orders.map((o) => `
        <tr>
          <td>#${o.id}</td>
          <td>${o.customerName}</td>
          <td style="max-width:180px;font-size:12px;">${o.deliveryAddress || '—'}</td>
          <td style="max-width:220px;font-size:12.5px;">${o.items.map((it) => `${it.name} ×${it.qty}`).join(", ")}</td>
          <td>${money(o.total)}</td>
          <td><span class="pill ${o.paymentStatus}">${o.paymentMethod.toUpperCase()} · ${o.paymentStatus.replace("_", " ")}</span></td>
          <td>
            <select class="status-select" data-id="${o.id}">
              ${STATUS_OPTIONS.map((s) => `<option value="${s}" ${o.orderStatus === s ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("")}
            </select>
          </td>
          <td style="font-size:11.5px;color:#74807A;">${new Date(o.createdAt).toLocaleString()}</td>
        </tr>
      `).join("");
      body.querySelectorAll(".status-select").forEach((sel) => {
        sel.addEventListener("change", async () => {
          try {
            await api(`/orders/${sel.dataset.id}/status`, { method: "PUT", body: JSON.stringify({ orderStatus: sel.value }) });
          } catch (err) {
            if (!(await handleAuthError(err))) alert(err.message);
          }
        });
      });
    } catch (err) {
      if (!(await handleAuthError(err))) alert(err.message);
    }
  }

  // ---- init ----
  loadDashboard();
}

async function markFeedbackRead(feedbackId) {
  try {
    await api(`/dashboard/feedback/${feedbackId}/read`, {
      method: "PATCH"
    });

    await loadFeedback();
  } catch (err) {
    console.error("Mark feedback read error:", err);
    alert(err.message || "Could not mark feedback as reviewed.");
  }
}

function applyFeedbackFilters() {
  const search = document
    .getElementById("feedbackSearch")
    .value
    .toLowerCase()
    .trim();

  const ratingFilter = document.getElementById("feedbackRatingFilter").value;
  const statusFilter = document.getElementById("feedbackStatusFilter").value;

  const filtered = allFeedback.filter((item) => {
    const customerName = item.customers?.name || "Unknown";
    const customerEmail = item.customers?.email || "";
    const message = item.message || "";

    const matchesSearch =
      customerName.toLowerCase().includes(search) ||
      customerEmail.toLowerCase().includes(search) ||
      message.toLowerCase().includes(search);

    const matchesRating =
      ratingFilter === "all" ||
      Number(item.rating) === Number(ratingFilter);

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "new" && !item.is_read) ||
      (statusFilter === "reviewed" && item.is_read);

    return matchesSearch && matchesRating && matchesStatus;
  });

  renderFeedbackTable(filtered);
}

function renderFeedbackTable(feedback) {
  const body = document.getElementById("feedbackBody");

  if (!feedback || feedback.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:30px;">
          No matching feedback found.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = feedback.map((item, index) => {
    const customerName = item.customers?.name || "Unknown";
    const customerEmail = item.customers?.email || "—";
    const date = new Date(item.created_at).toLocaleString();
    const stars = "⭐".repeat(Number(item.rating));

    const status = item.is_read
      ? `<span class="feedback-status reviewed">✓ Reviewed</span>`
      : `<button class="feedback-review-btn" onclick="markFeedbackRead('${item.id}')">🔴 NEW — Mark Reviewed</button>`;

    return `
      <tr class="${item.is_read ? "" : "feedback-unread"}">
        <td>${index + 1}</td>
        <td>${customerName}</td>
        <td>${customerEmail}</td>
        <td>${stars}</td>
        <td>${item.message}</td>
        <td>${date}</td>
        <td>${status}</td>
      </tr>
    `;
  }).join("");
}

document.getElementById("feedbackSearch")?.addEventListener("input", applyFeedbackFilters);

document.getElementById("feedbackRatingFilter")?.addEventListener("change", applyFeedbackFilters);

document.getElementById("feedbackStatusFilter")?.addEventListener("change", applyFeedbackFilters);