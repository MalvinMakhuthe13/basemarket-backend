# BaseMarket Backend

This package is the backend foundation for BaseMarket's marketplace flow: listings, messages, offers, orders, Secure Deal checkout via PayFast, disputes, notifications, and admin controls.

## What was tightened in this pass
- order responses now include cleaner front-end wording helpers like `stageLabel`, `checkoutLabel`, and `deliveryLabel`
- listing API now supports explicit sort values: `newest`, `oldest`, `price_low`, `price_high`
- order creation validation is stricter for Secure Deal courier orders
- offer and dispute inputs are cleaned and validated more safely
- `/pretest` endpoint was added so you can verify environment readiness before QA

## Environment variables
Copy `.env.example` to `.env` for local development. Never commit `.env`.

Core required values:
- `MONGODB_URI`
- `JWT_SECRET`
- `FRONTEND_ORIGIN`
- `ADMIN_KEY`

Secure Deal / PayFast values:
- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- `PAYFAST_PASSPHRASE`
- `PAYFAST_NOTIFY_URL`
- `PUBLIC_BACKEND_URL`

## Run locally
```bash
npm install
cp .env.example .env
npm run dev
```

## Quick readiness checks
```bash
curl http://localhost:10000/health
curl http://localhost:10000/pretest
```

## Key routes
- `GET /api/listings?sort=newest|oldest|price_low|price_high`
- `POST /api/listings`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/orders`
- `GET /api/orders/mine`
- `GET /api/orders/sold`
- `POST /api/orders/:id/mark-confirmed`
- `POST /api/orders/:id/mark-preparing`
- `POST /api/orders/:id/mark-shipped`
- `POST /api/orders/:id/mark-delivered`
- `POST /api/orders/:id/confirm-delivery`
- `POST /api/orders/:id/open-dispute`
- `POST /api/payfast/create-payment`
- `POST /api/payfast/itn`
- `GET /api/offers`
- `POST /api/offers`
- `POST /api/offers/:id/respond`
- `GET /api/disputes`
- `POST /api/disputes`
- `POST /api/disputes/:id/message`

## Testing sequence to use first
1. register buyer, seller, admin
2. create a listing
3. start a conversation
4. create an offer
5. create an order
6. start PayFast sandbox checkout for Secure Deal
7. seller marks preparing / shipped / delivered
8. buyer confirms delivery
9. open a dispute on a second order
10. review dispute via admin flow

## Notes for the front end
Order responses now include:
- `stageLabel`
- `checkoutLabel`
- `deliveryLabel`
- `statusCopy`

These are there so the UI can show wording like:
- `Secure Deal`
- `Direct order`
- `Courier delivery`
- `Meetup`
- `Payment secured`
- `Seller preparing`

## Security notes
- JWT required on protected routes
- global rate limit enabled
- image uploads validated by magic bytes
- PayFast ITN verifies source IP in production
- admin routes require `x-admin-key`
