const { Resend } = require("resend");

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

// The address emails are sent from. Resend's shared "onboarding@resend.dev"
// works immediately with no setup, but can only send to the email address
// you signed up to Resend with. To email real customers, verify your own
// domain in Resend and set EMAIL_FROM to an address on that domain.
function getFromAddress() {
  return process.env.EMAIL_FROM || "AL AZEEM Store <onboarding@resend.dev>";
}

function getAppUrl() {
  return process.env.APP_URL || "http://localhost:5000";
}

async function sendConfirmationEmail(toEmail, name, token) {
  const resend = getResend();
  if (!resend) {
    console.warn("RESEND_API_KEY not set - skipping confirmation email.");
    return;
  }
  const link = `${getAppUrl()}/verify-email.html?token=${token}`;
  await resend.emails.send({
    from: getFromAddress(),
    to: toEmail,
    subject: "Confirm your email — AL AZEEM TRADERS",
    html: `
      <p>Hi ${name},</p>
      <p>Thanks for creating an account with AL AZEEM WHOLESALE · RETAIL. Please confirm your email address to activate your account:</p>
      <p><a href="${link}">Confirm my email</a></p>
      <p>If you didn't create this account, you can ignore this email.</p>
    `
  });
}

async function sendPasswordResetEmail(toEmail, name, token) {
  const resend = getResend();
  if (!resend) {
    console.warn("RESEND_API_KEY not set - skipping password reset email.");
    return;
  }
  const link = `${getAppUrl()}/reset-password.html?token=${token}`;
  await resend.emails.send({
    from: getFromAddress(),
    to: toEmail,
    subject: "Reset your password — AL AZEEM TRADERS",
    html: `
      <p>Hi ${name},</p>
      <p>We received a request to reset your password. This link is valid for 1 hour:</p>
      <p><a href="${link}">Reset my password</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `
  });
}

async function sendOrderConfirmationEmail(toEmail, name, order) {
  const resend = getResend();
  if (!resend) {
    console.warn("RESEND_API_KEY not set - skipping order confirmation email.");
    return;
  }
  const itemsHtml = order.items.map(
    (it) => `<li>${it.name} × ${it.qty} — ₹${(it.price * it.qty).toFixed(2)}</li>`
  ).join("");
  await resend.emails.send({
    from: getFromAddress(),
    to: toEmail,
    subject: `Order Confirmed — AL AZEEM TRADERS (#${order.id})`,
    html: `
      <p>Hi ${name},</p>
      <p>Thank you for your order! Here's a summary:</p>
      <ul>${itemsHtml}</ul>
      <p><strong>Total: ₹${order.total.toFixed(2)}</strong></p>
      <p>Payment method: ${order.paymentMethod === "cod" ? "Cash on Delivery" : "Online"}</p>
      <p>Delivery address: ${order.deliveryAddress || "Not provided"}</p>
      <p>We'll notify you as your order status updates.</p>
    `
  });
}
module.exports = { sendConfirmationEmail, sendPasswordResetEmail, sendOrderConfirmationEmail };
