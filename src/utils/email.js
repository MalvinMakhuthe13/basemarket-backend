const nodemailer = require('nodemailer');

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: Number(port) === 465,
    auth: { user, pass },
  });
  return cachedTransporter;
}

async function sendEmail({ to, subject, html, text }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('[email disabled] would send to=%s subject=%s', to, subject);
    return { ok: false, disabled: true };
  }
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  const info = await transporter.sendMail({ from, to, subject, html, text });
  return { ok: true, messageId: info.messageId };
}

module.exports = { sendEmail };
