const express = require("express");
const supabase = require("../db/supabase");
const { requireAdmin, requireCustomer } = require("../middleware/auth");
const { sendOrderConfirmationEmail } = require("../utils/email");

const router = express.Router();

function mapOrder(o) {
  return {
    id: o.id,
    customerId: o.customer_id,
    customerName: o.customer_name,
    items: o.items,
    total: o.total,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    orderStatus: o.order_status,
    deliveryAddress: o.delivery_address,
    razorpayOrderId: o.razorpay_order_id,
    createdAt: o.created_at
  };
}

// ---- POST /api/orders - customer places an order ----
// Stock is checked and deducted here. Because Supabase JS doesn't run
// multiple statements as a single transaction, we first validate every
// line, then deduct stock item by item, then create the order.
router.post("/", requireCustomer, async (req, res) => {
  const { items, paymentMethod, deliveryAddress, priceMode } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Your cart is empty." });
  }
  if (!["cod", "online"].includes(paymentMethod)) {
    return res.status(400).json({ error: "Choose a valid payment method." });
  }

  const orderItems = [];
  let total = 0;
  const stockUpdates = [];

  for (const line of items) {
    const { data: product, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", line.productId)
      .maybeSingle();
    if (error || !product) return res.status(404).json({ error: "A product in your cart no longer exists." });

    const qty = Number(line.qty);

if (qty <= 0) {
  return res.status(400).json({
    error: `Invalid quantity for ${product.name}.`
  });
}

// For bag products, qty means number of bags.
// Example: 1 bag × 26 kg = 26 kg stock required.
const packageSize =
  product.sale_type === "bag"
    ? Number(product.package_size || 1)
    : 1;

const requiredStock = qty * packageSize;

if (Number(product.stock_qty) < requiredStock) {
  const available = Math.floor(
    Number(product.stock_qty) / packageSize
  );

  const availableText =
    product.sale_type === "bag"
      ? `${available} bag${available === 1 ? "" : "s"}`
      : `${product.stock_qty} ${product.unit}`;

  return res.status(409).json({
    error: `Only ${availableText} of ${product.name} available.`
  });
}
    const unitPrice = priceMode === "wholesale" ? product.wholesale_price : product.retail_price;
   orderItems.push({
  productId: product.id,
  name: product.name,
  unit: product.unit,
  saleType: product.sale_type || "unit",
  packageSize: packageSize,
  qty,
  unitPrice,
  lineTotal: unitPrice * qty
});
    total += unitPrice * qty;
   const stockToDeduct = qty * packageSize;

stockUpdates.push({
  id: product.id,
  newQty: Number(product.stock_qty) - stockToDeduct
});
  }

  // Deduct stock for every item now that all lines are validated.
  for (const u of stockUpdates) {
    await supabase.from("products").update({ stock_qty: u.newQty, updated_at: new Date().toISOString() }).eq("id", u.id);
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_id: req.customer.id,
      customer_name: req.customer.name,
      items: orderItems,
      total,
      payment_method: paymentMethod,
      payment_status: paymentMethod === "cod" ? "pending" : "awaiting_payment",
      order_status: "placed",
      delivery_address: deliveryAddress || ""
    })
    .select()
    .single();

  if (orderError) return res.status(500).json({ error: "Order could not be saved. Please try again." });
const mappedOrder = mapOrder(order);
console.log("req.customer =",req.customer);
if (req.customer.email) {
  console.log("Before sending order confirmation email");
  console.log("Customer email:",req.customer.email);
  sendOrderConfirmationEmail(req.customer.email, req.customer.name, mappedOrder).catch((err) => {
    console.error("Failed to send order confirmation email:", err);
  });
}
res.status(201).json({ message: "Order placed.", order: mappedOrder });
});

// ---- GET /api/orders/my - customer's own order history ----
router.get("/my", requireCustomer, async (req, res) => {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("customer_id", req.customer.id)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: "Could not load your orders." });
  res.json(data.map(mapOrder));
});

// ---- GET /api/orders - admin sees all orders ----
router.get("/", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: "Could not load orders." });
  res.json(data.map(mapOrder));
});

// ---- PUT /api/orders/:id/status - admin updates order status ----
const VALID_STATUSES = ["placed", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"];
router.put("/:id/status", requireAdmin, async (req, res) => {
  const { orderStatus, paymentStatus } = req.body;

  const { data: order, error: findError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();
  if (findError) return res.status(500).json({ error: "Could not load order." });
  if (!order) return res.status(404).json({ error: "Order not found." });

  const updates = {};

  if (orderStatus) {
    if (!VALID_STATUSES.includes(orderStatus)) {
      return res.status(400).json({ error: "Invalid status." });
    }
    // If an order is cancelled, restock the items automatically.
    if (orderStatus === "cancelled" && order.order_status !== "cancelled") {
      for (const line of order.items) {
        const { data: product } = await supabase.from("products").select("stock_qty").eq("id", line.productId).maybeSingle();
        if (product) {
          await supabase
            .from("products")
            .update({ stock_qty: Number(product.stock_qty) + line.qty, updated_at: new Date().toISOString() })
            .eq("id", line.productId);
        }
      }
    }
    updates.order_status = orderStatus;
  }
  if (paymentStatus) updates.payment_status = paymentStatus;

  const { data: updated, error } = await supabase
    .from("orders")
    .update(updates)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: "Could not update order." });
  res.json({ message: "Order updated.", order: mapOrder(updated) });
});

module.exports = router;
