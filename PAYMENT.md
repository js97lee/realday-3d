# BlueForge Payment Setup

BlueForge uses Toss Payments Standard Payment Window as the first payment integration.

## What Is Already Wired

- `order.html` loads the Toss Payments V2 SDK.
- `order.js` opens the Toss payment window before generating a pickup QR.
- `payment-success.html` receives `paymentKey`, `orderId`, and `amount` after payment.
- `api/confirm-payment.js` is a Vercel serverless endpoint that calls Toss Payments confirm API.

## Required Before Real Payments

1. Create a Toss Payments merchant account.
2. Replace `payment-config.js` with your client key.
3. Add `TOSS_SECRET_KEY` to the Vercel project environment variables.
4. Store each order on the server before payment and compare the stored amount before calling confirm.

Do not put `TOSS_SECRET_KEY` in any browser JavaScript file.
