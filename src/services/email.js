const nodemailer = require("nodemailer");

function getSmtpConfig(){
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS (and SMTP_PORT/SMTP_SECURE if needed).");
  }
  return { host, port, secure, auth: { user, pass } };
}

let _transporter = null;
function transporter(){
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport(getSmtpConfig());
  return _transporter;
}

async function sendEmail(to, subject, text){
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  const info = await transporter().sendMail({ from, to, subject, text });
  return info;
}

module.exports = { sendEmail };
