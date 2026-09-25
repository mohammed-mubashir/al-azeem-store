const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const supabase = require("../db/supabase");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// ---- image upload setup ----
// Note: images are stored on local disk. On most hosts (including Railway
// without a volume) this storage is temporary and images may be lost on
// redeploy. Add a persistent volume mounted at /app/public/uploads if you
// want uploaded photos to stick around.
const uploadDir = path.join(__dirname, "..", "public", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `product_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image files are allowed."));
    cb(null, true);
  }
});

function mapProduct(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    unit: p.unit,
    saleType: p.sale_type || "unit",
    packageSize: Number(p.package_size || 1),
    costPrice: p.cost_price,
    retailPrice: p.retail_price,
    wholesalePrice: p.wholesale_price,
    stockQty: p.stock_qty,
    lowStockThreshold: p.low_stock_threshold,
    imageUrl: p.image_url,
    createdAt: p.created_at,
    updatedAt: p.updated_at
  };
}

// ---- GET /api/products - public, with optional search/category filter ----
router.get("/", async (req, res) => {
  const { category, search } = req.query;
  let query = supabase
  .from("products")
  .select("*")
  .order("display_order",
    { ascending: true });
  if (category) query = query.ilike("category", category);
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "Could not load products." });
  res.json(data.map(mapProduct));
});

// ---- GET /api/products/categories - distinct category list ----
router.get("/categories", async (req, res) => {
  const { data, error } = await supabase.from("products").select("category");
  if (error) return res.status(500).json({ error: "Could not load categories." });
  const cats = [...new Set(data.map((p) => p.category))].sort();
  res.json(cats);
});

// ---- GET /api/products/:id ----
router.get("/:id", async (req, res) => {
  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: "Could not load product." });
  if (!product) return res.status(404).json({ error: "Product not found." });
  res.json(mapProduct(product));
});

// ---- POST /api/products - admin adds today's stock entry ----
// If a product with the same name + category already exists, its stock
// quantity is increased instead of creating a duplicate row.
router.post("/", requireAdmin, upload.single("image"), async (req, res) => {
  const { name, category, unit, costPrice, retailPrice, wholesalePrice, stockQty, lowStockThreshold } = req.body;
  if (!name || !category || !unit || !retailPrice || stockQty === undefined) {
    return res.status(400).json({ error: "Name, category, unit, retail price and quantity are required." });
  }
  const qtyToAdd = Number(stockQty);
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  const { data: existing, error: findError } = await supabase
    .from("products")
    .select("*")
    .ilike("name", name)
    .ilike("category", category)
    .maybeSingle();

  if (findError) return res.status(500).json({ error: "Could not check existing stock." });

  if (existing) {
    const updates = {
      stock_qty: Number(existing.stock_qty) + qtyToAdd,
      retail_price: Number(retailPrice),
      unit,
      updated_at: new Date().toISOString()
    };
    if (costPrice !== undefined) updates.cost_price = Number(costPrice);
    if (wholesalePrice !== undefined) updates.wholesale_price = Number(wholesalePrice);
    if (lowStockThreshold !== undefined) updates.low_stock_threshold = Number(lowStockThreshold);
    if (imageUrl) updates.image_url = imageUrl;

    const { data: updated, error } = await supabase
      .from("products")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: "Could not update stock." });
    return res.status(200).json({ message: `Added ${qtyToAdd} ${unit} to existing stock.`, product: mapProduct(updated) });
  }
  
const finalSaleType = req.body.saleType || "unit";
const finalPackageSize = req.body.packageSize
  ? Number(req.body.packageSize)
  : 1;

  const { data: created, error } = await supabase
    .from("products")
    .insert({
      name,
      category,
      unit,
      sale_type: finalSaleType,
      package_size:
      finalPackageSize,
      cost_price: costPrice !== undefined ? Number(costPrice) : 0,
      retail_price: Number(retailPrice),
      wholesale_price: wholesalePrice !== undefined ? Number(wholesalePrice) : Number(retailPrice),
      stock_qty: qtyToAdd,
      low_stock_threshold: lowStockThreshold !== undefined ? Number(lowStockThreshold) : 5,
      image_url: imageUrl
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: "Could not add new product." });
  res.status(201).json({ message: "New product added.", product: mapProduct(created) });
});

// ---- PUT /api/products/:id - admin edits a product ----
router.put("/:id", requireAdmin, upload.single("image"), async (req, res) => {
  const fieldMap = {
    name: "name",
    category: "category",
    unit: "unit",
    costPrice: "cost_price",
    retailPrice: "retail_price",
    wholesalePrice: "wholesale_price",
    stockQty: "stock_qty",
    lowStockThreshold: "low_stock_threshold"
  };
  const numericFields = ["costPrice", "retailPrice", "wholesalePrice", "stockQty", "lowStockThreshold"];
  const updates = { updated_at: new Date().toISOString() };
  Object.keys(fieldMap).forEach((f) => {
    if (req.body[f] !== undefined) {
      updates[fieldMap[f]] = numericFields.includes(f) ? Number(req.body[f]) : req.body[f];
    }
  });
  if (req.file) updates.image_url = `/uploads/${req.file.filename}`;

  const { data: updated, error } = await supabase
    .from("products")
    .update(updates)
    .eq("id", req.params.id)
    .select()
    .maybeSingle();

  if (error) return res.status(500).json({ error: "Could not update product." });
  if (!updated) return res.status(404).json({ error: "Product not found." });
  res.json({ message: "Product updated.", product: mapProduct(updated) });
});

// ---- DELETE /api/products/:id - admin removes a product ----
router.delete("/:id", requireAdmin, async (req, res) => {
  const { error } = await supabase.from("products").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: "Could not remove product." });
  res.json({ message: "Product removed." });
});

module.exports = router;
