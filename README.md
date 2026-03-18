# BaseMarket Backend

## Environment variables (Render)

Copy `.env.example` to `.env` for local development. **Never commit `.env` to Git.**

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB Atlas connection string |
| `JWT_SECRET` | ✅ | Long random string (min 32 chars) |
| `FRONTEND_ORIGIN` | ✅ | Your frontend URL e.g. `https://basemarket.co.za` |
| `ADMIN_KEY` | ✅ | Secret header key for admin routes |
| `PAYFAST_MERCHANT_ID` | PayFast | From your PayFast merchant dashboard |
| `PAYFAST_MERCHANT_KEY` | PayFast | From your PayFast merchant dashboard |
| `PAYFAST_PASSPHRASE` | PayFast | Your PayFast passphrase |
| `PAYFAST_HOST` | PayFast | Sandbox: `https://sandbox.payfast.co.za/eng/process` |
| `PAYFAST_NOTIFY_URL` | PayFast | Full URL to `/api/payfast/itn` on your backend |
| `PUBLIC_BACKEND_URL` | PayFast | Full URL of your deployed backend |
| `OPENROUTER_API_KEY` | AI | From openrouter.ai |
| `OPENROUTER_MODEL` | AI | Recommended: `openai/gpt-4o-mini` |
| `OPENROUTER_HTTP_REFERER` | AI | Your frontend URL |
| `OPENROUTER_APP_NAME` | AI | `BaseMarket` |
| `PORT` | Optional | Defaults to `10000` |
| `NODE_ENV` | Optional | Set to `production` on Render |

## Run locally
```bash
npm install
cp .env.example .env   # fill in your values
npm run dev
```

## API overview

| Route | Auth | Description |
|---|---|---|
| `GET /api/listings` | Public | Paginated listings (`?page=1&limit=30&category=sell`) |
| `POST /api/listings` | JWT | Create listing |
| `POST /api/auth/register` | Public | Register (rate limited: 5/hr) |
| `POST /api/auth/login` | Public | Login (rate limited: 10/15min) |
| `GET /api/auth/me` | JWT | Get current user |
| `POST /api/orders` | JWT | Create order |
| `POST /api/payfast/create-payment` | JWT | Start PayFast checkout |
| `POST /api/payfast/itn` | PayFast IP | Payment notification webhook |
| `GET /api/ai/health` | Public | Check AI availability |
| `POST /api/ai/assist` | Public | AI listing assistant |
| `POST /api/ai/scam-check` | Public | AI scam detection |
| `GET /api/admin/users` | Admin key | List users |

## Test admin access
```bash
curl -H "x-admin-key: YOUR_ADMIN_KEY" https://yourbackend.onrender.com/api/admin/users
```
Expected without key: `403 Forbidden`

## PayFast sandbox
Set `PAYFAST_HOST=https://sandbox.payfast.co.za/eng/process` and `NODE_ENV=development` to test secure checkout. ITN IP verification is skipped in sandbox/dev mode.

## Security notes
- Login is rate-limited to 10 attempts per 15 minutes per IP
- Registration is rate-limited to 5 accounts per hour per IP  
- Image uploads are validated by magic bytes (not just mimetype)
- PayFast ITN verifies source IP in production
- Admin routes require `x-admin-key` header
- MongoDB regex search inputs are escaped to prevent ReDoS
