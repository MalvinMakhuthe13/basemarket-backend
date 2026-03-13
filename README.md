# BaseMarket Backend (rewrite)

## Env vars (Render)
- MONGODB_URI=...
- JWT_SECRET=...
- FRONTEND_ORIGIN=https://YOURFRONTENDDOMAIN (or * for dev)
- ADMIN_KEY=your_admin_key

## Run locally
npm install
npm run dev

## Test admin route exists
Open in browser:
  /api/admin/users

Expected: 403 (no x-admin-key)

If you see: Cannot GET /api/admin/users
then you're not deploying this code.


## AI

This backend includes `/api/ai/assist`, `/api/ai/price-suggestion`, `/api/ai/scam-check`, and `/api/ai/health`. Configure `OPENROUTER_API_KEY` in Render to enable live AI responses. Without a key, BaseMarket falls back to built-in local listing and pricing logic.


## PayFast sandbox
Set the PAYFAST_* environment variables to test secure checkout in sandbox mode. Orders must stay in `awaiting_payment` until the PayFast ITN webhook marks them as paid.
