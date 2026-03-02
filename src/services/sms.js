const twilio = require("twilio");

function normalizePhone(phone){
  return String(phone || "").trim();
}

async function sendSms(to, body){
  const provider = String(process.env.SMS_PROVIDER || "twilio").toLowerCase();
  const phone = normalizePhone(to);

  if (!phone) throw new Error("Phone number missing");

  if (provider === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    if (!sid || !token || !from) {
      throw new Error("SMS provider not configured (missing Twilio env vars)");
    }
    const client = twilio(sid, token);
    await client.messages.create({ to: phone, from, body: String(body || "") });
    return;
  }

  throw new Error("Unsupported SMS_PROVIDER");
}

module.exports = { sendSms };
