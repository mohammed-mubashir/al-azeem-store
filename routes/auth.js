const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const supabase = require("../db/supabase");
const { signToken, requireCustomer } = require("../middleware/auth");
const { sendConfirmationEmail, sendPasswordResetEmail } = require("../utils/email");
const { verifyGoogleToken } = require("../utils/google-auth");

const router = express.Router();

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function customerResponse(customer, token) {
  return {
    token,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    emailVerified: customer.email_verified,
    policiesAcceptedAt: customer.policies_accepted_at || null
  };
}

// ---- Public config the frontend needs (Google Client ID is not secret) ----
router.get("/config", (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
});

// ---- Admin login ----
router.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }
  const { data: admin, error } = await supabase
    .from("admins")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (error) return res.status(500).json({ error: "Server error. Please try again." });
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: "Incorrect username or password." });
  }
  const token = signToken({ id: admin.id, username: admin.username, role: "admin" });
  res.json({ token, username: admin.username });
});

// ---- Customer register (email + password) ----
router.post("/customer/register", async (req, res) => {
  const { name, email, phone, password, address } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email and password are required." });
  }

  const { data: exists } = await supabase.from("customers").select("id").eq("email", email).maybeSingle();
  if (exists) {
    return res.status(409).json({ error: "An account with this email already exists. Please log in." });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const verifyToken = makeToken();

  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      name,
      email,
      phone: phone || null,
      address: address || "",
      password_hash: passwordHash,
      email_verified: false,
      reset_token: verifyToken // reused as the email-confirmation token
    })
    .select()
    .single();

     if (error) {
  console.error("Customer registration Supabase error:", error);

  if (error.code === "23505" && error.message.includes("customer_phone_key")) {
    return res.status(409).json({
      error: "This phone number is already registered. Please log in."
    });
  }

  if (error.code === "23505" && error.message.includes("customers_email_key")) {
    return res.status(409).json({
      error: "An account with this email already exists. Please log in."
    });
  }

  return res.status(500).json({
    error: "Could not create account. Please try again."
  });
}

  try {
    await sendConfirmationEmail(email, name, verifyToken);
  } catch (err) {
    console.error("Confirmation email failed to send:", err.message);
  }

  const token = signToken({ id: customer.id, name: customer.name, email: customer.email, role: "customer" });
  res.status(201).json(customerResponse(customer, token));
});

// ---- Customer login (email + password) ----
router.post("/customer/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const { data: customer, error } = await supabase.from("customers").select("*").eq("email", email).maybeSingle();

  if (error) return res.status(500).json({ error: "Server error. Please try again." });
  if (!customer || !customer.password_hash || !bcrypt.compareSync(password, customer.password_hash)) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  const token = signToken({ id: customer.id, name: customer.name, email: customer.email, role: "customer" });
  res.json(customerResponse(customer, token));
});
// ---- Customer accepts store policies ----

router.patch("/customer/accept-policies", requireCustomer, async (req, res) => {
  const { data, error } = await supabase
    .from("customers")
    .update({
      policies_accepted_at: new Date().toISOString()
    })
    .eq("id", req.customer.id)
    .select("policies_accepted_at")
    .single();

  if (error) {
    console.error("Policy acceptance error:", error);
    return res.status(500).json({
      error: "Could not save your policy agreement."
    });
  }

  res.json({
    success: true,
    policiesAcceptedAt: data.policies_accepted_at
  });
});
// ---- Customer profile ----
router.get("/customer/profile", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Please log in to view your profile." });
  }

  try {
    const jwt = require("jsonwebtoken");
    const secret = process.env.JWT_SECRET || "dev_secret_change_me";
    const decoded = jwt.verify(token, secret);

    if (decoded.role !== "customer") {
      return res.status(401).json({ error: "Invalid customer session." });
    }

    const { data: customer, error } = await supabase
      .from("customers")
      .select(
  "id, name, email, phone, address, email_verified, policies_accepted_at"
)
      .eq("id", decoded.id)
      .maybeSingle();

    if (error || !customer) {
      return res.status(404).json({ error: "Customer profile not found." });
    }
    res.json({
  id: customer.id,
  name: customer.name,
  email: customer.email,
  phone: customer.phone,
  address: customer.address,
  emailVerified: customer.email_verified,
  policiesAcceptedAt: customer.policies_accepted_at || null
});
  } catch (err) {
    return res.status(401).json({ error: "Your session has expired. Please log in again." });
  }
});

// ---- Update customer profile ----
router.put("/customer/profile", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Please log in to update your profile." });
  }

  try {
    const jwt = require("jsonwebtoken");
    const secret = process.env.JWT_SECRET || "dev_secret_change_me";
    const decoded = jwt.verify(token, secret);

    if (decoded.role !== "customer") {
      return res.status(401).json({ error: "Invalid customer session." });
    }

    const { name, phone, address } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required." });
    }

    const { data: customer, error } = await supabase
      .from("customers")
      .update({
        name: name.trim(),
        phone: phone ? phone.trim() : null,
        address: address ? address.trim() : ""
      })
      .eq("id", decoded.id)
      .select(
  "id, name, email, phone, address, email_verified, policies_accepted_at"
)
      .single();

    if (error) {
      console.error("Profile update error:", error);
      return res.status(500).json({ error: "Could not save your profile." });
    }

    res.json({
  id: customer.id,
  name: customer.name,
  email: customer.email,
  phone: customer.phone,
  address: customer.address,
  emailVerified: customer.email_verified,
  policiesAcceptedAt: customer.policies_accepted_at || null
});
  } catch (err) {
    return res.status(401).json({ error: "Your session has expired. Please log in again." });
  }
});

// ---- Confirm email ----
router.post("/customer/verify-email", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "Missing confirmation token." });

  const { data: customer, error } = await supabase.from("customers").select("*").eq("reset_token", token).maybeSingle();
  if (error || !customer) return res.status(400).json({ error: "This confirmation link is invalid or has already been used." });

  const { error: updateError } = await supabase
    .from("customers")
    .update({ email_verified: true, reset_token: null })
    .eq("id", customer.id);
  if (updateError) return res.status(500).json({ error: "Could not confirm your email. Please try again." });

  res.json({ message: "Email confirmed. You can now log in." });
});

// ---- Forgot password: request a reset link ----
router.post("/customer/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required." });

  const { data: customer } = await supabase.from("customers").select("*").eq("email", email).maybeSingle();

  // Always respond with success, even if no account exists, so the form
  // can't be used to check which emails are registered.
  if (!customer) {
    return res.json({ message: "If an account exists for that email, a reset link has been sent." });
  }

  const resetToken = makeToken();
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  const { error } = await supabase
    .from("customers")
    .update({ reset_token: resetToken, reset_token_expires: expires })
    .eq("id", customer.id);
  if (error) return res.status(500).json({ error: "Could not process your request. Please try again." });

  try {
    await sendPasswordResetEmail(email, customer.name, resetToken);
  } catch (err) {
    console.error("Password reset email failed to send:", err.message);
  }

  res.json({ message: "If an account exists for that email, a reset link has been sent." });
});

// ---- Reset password using the emailed token ----
router.post("/customer/reset-password", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "Missing token or new password." });

  const { data: customer, error } = await supabase.from("customers").select("*").eq("reset_token", token).maybeSingle();
  if (error || !customer) return res.status(400).json({ error: "This reset link is invalid or has already been used." });

  if (!customer.reset_token_expires || new Date(customer.reset_token_expires) < new Date()) {
    return res.status(400).json({ error: "This reset link has expired. Please request a new one." });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const { error: updateError } = await supabase
    .from("customers")
    .update({ password_hash: passwordHash, reset_token: null, reset_token_expires: null })
    .eq("id", customer.id);
  if (updateError) return res.status(500).json({ error: "Could not reset your password. Please try again." });

  res.json({ message: "Password reset successfully. You can now log in." });
});

// ---- Google sign-in ----
router.post("/customer/google", async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: "Missing Google credential." });

  const profile = await verifyGoogleToken(idToken);
  if (!profile) return res.status(400).json({ error: "Could not verify your Google sign-in. Please try again." });

  let { data: customer } = await supabase.from("customers").select("*").eq("google_id", profile.googleId).maybeSingle();

  if (!customer) {
    // Link to an existing email/password account with the same email, if any.
    const { data: byEmail } = await supabase.from("customers").select("*").eq("email", profile.email).maybeSingle();
    if (byEmail) {
      const { data: linked, error: linkError } = await supabase
        .from("customers")
        .update({ google_id: profile.googleId, email_verified: true })
        .eq("id", byEmail.id)
        .select()
        .single();
      if (linkError) return res.status(500).json({ error: "Could not link your Google account. Please try again." });
      customer = linked;
    } else {
      const { data: created, error: createError } = await supabase
        .from("customers")
        .insert({
          name: profile.name,
          email: profile.email,
          google_id: profile.googleId,
          email_verified: true
        })
        .select()
        .single();
      if (createError) return res.status(500).json({ error: "Could not create your account. Please try again." });
      customer = created;
    }
  }

  const token = signToken({ id: customer.id, name: customer.name, email: customer.email, role: "customer" });
  res.json(customerResponse(customer, token));
});

module.exports = router;
