# BlueForge Payment Setup

BlueForge uses Toss Payments Standard Payment Window as the first payment integration.

## What Is Already Wired

- `order.html` loads the Toss Payments V2 SDK.
- `order.js` opens the Toss payment window before generating a pickup QR.
- `payment-success.html` receives `paymentKey`, `orderId`, and `amount` after payment.
- `netlify/functions/confirm-payment.js` is the Netlify Functions endpoint that calls Toss Payments confirm API.
- `netlify.toml` rewrites `/api/confirm-payment` to the Netlify function.

## Required Before Real Payments

1. Create a Toss Payments merchant account.
2. Replace `payment-config.js` with your client key.
3. Add `TOSS_SECRET_KEY` to the Netlify site environment variables.
4. Store each order on the server before payment and compare the stored amount before calling confirm.

Do not put `TOSS_SECRET_KEY` in any browser JavaScript file.
