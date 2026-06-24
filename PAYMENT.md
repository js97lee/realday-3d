# Real3DMaker Payment Setup

Real3DMaker currently uses manual bank transfer instead of a card payment gateway.

## What Is Already Wired

- `order.html` shows KakaoBank transfer instructions after an order number is created.
- `order.js` creates the order number, stores the pending order in session storage, renders the QR image, and calls the order alert endpoint.
- `order-status.html` lets customers check order status with order number, name, and phone number.
- The transfer account is `KakaoBank 3333-35-6070100`.
- The QR code contains the order number, account, amount, and depositor name for easy scanning.
- `netlify/functions/order-alert.js` stores the order with Netlify Blobs and sends a Telegram new-order message when Telegram environment variables are set.
- `netlify/functions/order-status.js` verifies customer lookup details and returns public order status.
- `netlify.toml` rewrites `/api/order-alert` to the Netlify function.

## Telegram Order Alerts

Create a Telegram bot with BotFather, then set these Netlify environment variables:

```bash
TELEGRAM_BOT_TOKEN="123456789:your-bot-token"
TELEGRAM_CHAT_ID="your-chat-id"
```

The alert is sent when the customer creates an order number. If the Telegram variables are missing or Telegram fails, the order page still shows the bank transfer instructions.

The Telegram alert includes order number, amount, bank account, customer name, phone, pickup method, file name, file size, material, quantity, print conditions, memo, and an order status link. If a browser preview image is available from the quote page, the function also attempts to send the preview image as a Telegram photo.

## Notes

- Bank transfer confirmation is manual for now.
- The customer should include the order number or matching depositor name when sending money.
- Keep `TELEGRAM_BOT_TOKEN` server-side only. Do not put it in browser JavaScript.
