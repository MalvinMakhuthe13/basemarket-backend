# BaseMarket — Deployment Guide
**Frontend:** basemarket.co.za  
**Backend:** Render (Node.js web service)  
**Database:** MongoDB Atlas

---

## Step 1 — Deploy backend to Render

1. Push the `backend/` folder to a GitHub repo (or zip upload to Render)
2. In Render → New Web Service → connect your repo
3. **Build command:** `npm install`
4. **Start command:** `node server.js`
5. **Node version:** 18+ (set in Render environment)

---

## Step 1b — Set up Cloudinary (image storage)

Render's disk is ephemeral — every deploy wipes local files. Images must go to Cloudinary.

1. Sign up at [cloudinary.com](https://cloudinary.com) (free tier: 25GB storage, 25GB bandwidth/month — more than enough to launch)
2. Go to Dashboard → copy the **API Environment variable** — it looks like `cloudinary://key:secret@cloud_name`
3. Add it as `CLOUDINARY_URL` in your Render environment variables (Step 2 below)

That's it. The backend auto-detects the env var and switches from disk to cloud on first upload.

---

## Step 2 — Set environment variables in Render

Go to your Render service → Environment tab. Add these exactly:

```
NODE_ENV=production
PORT=10000
MONGODB_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/basemarket
JWT_SECRET=<generate: openssl rand -hex 32>
FRONTEND_ORIGIN=https://basemarket.co.za,https://www.basemarket.co.za
ADMIN_KEY=<generate: openssl rand -hex 16>

# PayFast — use sandbox values for testing, swap to live before real payments
PAYFAST_MERCHANT_ID=10000100
PAYFAST_MERCHANT_KEY=46f0cd694581a
PAYFAST_PASSPHRASE=
PAYFAST_HOST=https://sandbox.payfast.co.za/eng/process
PAYFAST_NOTIFY_URL=https://<your-render-url>.onrender.com/api/payfast/itn
PUBLIC_BACKEND_URL=https://<your-render-url>.onrender.com

# AI assistant (get from openrouter.ai — free tier available)
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_HTTP_REFERER=https://basemarket.co.za

# Email (optional — for verification emails)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=support@basemarket.co.za
```

**PayFast sandbox test credentials:**
- Merchant ID: `10000100`
- Merchant Key: `46f0cd694581a`
- Passphrase: *(leave blank for sandbox)*
- Test card: `4111 1111 1111 1111`, any future date, CVV `123`

---

## Step 3 — Deploy frontend to basemarket.co.za

Upload the `basemarket_clean/` folder contents to your basemarket.co.za hosting. The `index.html` should be at the root (e.g. `public_html/index.html`).

**Before uploading**, update the backend URL in the frontend:
1. Open `js/bm-config.js`
2. Change the `DEFAULT_URL` to your actual Render URL
3. Or: after uploading, open `https://basemarket.co.za/test-checklist.html` and enter the backend URL there (it saves to each user's browser)

---

## Step 4 — Verify deployment

1. Open `https://<your-render-url>.onrender.com/health`  
   Should return `{ ok: true, ... }`

2. Open `https://<your-render-url>.onrender.com/pretest`  
   All 5 readiness checks should be `true`

3. Open `https://basemarket.co.za/test-checklist.html`  
   Run all 5 system checks — all should go green

---

## Step 5 — Keep the backend warm (important)

Render free tier sleeps after 15 minutes. PayFast ITN webhooks will fail if it's asleep.

**Option A (free):** Add an UptimeRobot monitor:
- URL: `https://<your-render-url>.onrender.com/health`
- Interval: every 5 minutes
- Type: HTTP(s)

**Option B (paid):** Upgrade to Render Starter ($7/mo) — always-on, no cold starts.

---

## Step 6 — Go live with PayFast (when ready)

When you want real payments:
1. Get your live merchant ID and key from your [PayFast dashboard](https://www.payfast.co.za/merchants)
2. Update these 3 env vars in Render:
   ```
   PAYFAST_MERCHANT_ID=<your live merchant ID>
   PAYFAST_MERCHANT_KEY=<your live merchant key>
   PAYFAST_HOST=https://www.payfast.co.za/eng/process
   ```
3. Redeploy

---

## All API routes

| Route | Auth | Description |
|---|---|---|
| `GET /health` | None | Health check |
| `GET /pretest` | None | Env readiness check |
| `POST /api/auth/register` | None | Sign up |
| `POST /api/auth/login` | None | Login |
| `GET /api/auth/me` | JWT | Current user |
| `GET /api/listings` | None | List all |
| `POST /api/listings` | JWT | Create listing |
| `DELETE /api/listings/:id` | JWT | Delete listing |
| `POST /api/orders` | JWT | Place order |
| `GET /api/orders/mine` | JWT | Buyer orders |
| `GET /api/orders/sold` | JWT | Seller orders |
| `GET /api/orders/seller-summary` | JWT | Earnings summary |
| `POST /api/orders/:id/mark-confirmed` | JWT | Seller confirms |
| `POST /api/orders/:id/mark-shipped` | JWT | Seller ships |
| `POST /api/orders/:id/mark-delivered` | JWT | Seller delivers |
| `POST /api/orders/:id/confirm-delivery` | JWT | Buyer confirms |
| `POST /api/orders/:id/open-dispute` | JWT | Raise dispute |
| `POST /api/orders/:id/review` | JWT | Leave review ✅ *new* |
| `POST /api/orders/:id/send-buyer-nudge` | JWT | Nudge buyer ✅ *new* |
| `GET /api/users/:id/trust` | JWT | Trust badge ✅ *new* |
| `POST /api/errors` | None | Client error log ✅ *new* |
| `POST /api/payfast/create-payment` | JWT | Start PayFast checkout |
| `POST /api/payfast/itn` | None | PayFast webhook |
| `GET /api/messages` | JWT | Conversations |
| `POST /api/messages` | JWT | Send message |
| `GET /api/offers` | JWT | Offers |
| `POST /api/offers/:id/respond` | JWT | Accept/decline offer |
| `GET /api/disputes` | JWT | Disputes |
| `POST /api/disputes/:id/message` | JWT | Dispute message |
| `GET /api/notifications` | JWT | Notifications |
| `GET /api/admin/*` | Admin key | Admin controls |

---

## Tester onboarding

Share this URL with testers:  
`https://basemarket.co.za/test-checklist.html`

Each tester enters the Render backend URL once — it saves to their browser. They then run the system check and start testing.
