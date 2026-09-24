require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db/db");

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const paymentRoutes = require("./routes/payment");
const dashboardRoutes = require("./routes/dashboard");
const feedbackRoutes = require("./routes/feedback");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the frontend (customer site + admin panel) as static files
app.use(express.static(path.join(__dirname, "public")));
app.get(["/terms.html", "/terms.html/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "terms.html"));
});

// Make sure a default admin account exists on first run
db.ensureDefaultAdmin();

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/feedback", feedbackRoutes);

app.get("/api/store-info", (req, res) => {
  res.json({
    name: process.env.STORE_NAME || "AL AZEEM TRADERS",
    phone: process.env.STORE_PHONE || ""
  });
});

// Friendly page routes
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin-login.html")));

// Fallback error handler (e.g. multer file errors)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Something went wrong on the server." });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`AL AZEEM TRADERS server running on port ${PORT}`);
});
