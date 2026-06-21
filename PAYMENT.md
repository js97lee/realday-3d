# real3Dmaker Payment Setup

real3Dmaker uses Toss Payments Standard Payment Window for card and easy-pay checkout.

## What Is Already Wired

- `order.html` loads the Toss Payments V2 SDK.
- `order.js` opens the Toss payment window with `method: "CARD"` before generating a pickup QR.
- `payment-success.html` receives `paymentKey`, `orderId`, and `amount` after payment.
- `payment-success.js` compares the returned amount with the pending order amount and calls the confirm endpoint.
- `netlify/functions/confirm-payment.js` is the Netlify Functions endpoint that calls Toss Payments confirm API.
- `netlify.toml` rewrites `/api/confirm-payment` to the Netlify function.

## Required Before Real Payments

1. Create a Toss Payments merchant account.
2. Replace `payment-config.js` with your client key.
3. Add `TOSS_SECRET_KEY` to the Netlify site environment variables.
4. Store each order on the server before payment and compare the stored amount before calling confirm.
5. Deploy to a host that can run the confirm endpoint. GitHub Pages alone cannot call Toss confirm because the secret key must stay on the server.
6. Replace the placeholder business address in `policies.html` with the business registration address before Toss/card review.
7. Switch from test keys to live keys only after Toss Payments and card-company review is complete.

Do not put `TOSS_SECRET_KEY` in any browser JavaScript file.
