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
- If `GOOGLE_ORDERS_WEBHOOK_URL` is set, `order-alert.js` also forwards each order to a Google Apps Script webhook for Google Sheets logging and Google Drive file storage.
- `netlify.toml` rewrites `/api/order-alert` to the Netlify function.

## Telegram Order Alerts

Create a Telegram bot with BotFather, then set these Netlify environment variables:

```bash
TELEGRAM_BOT_TOKEN="123456789:your-bot-token"
TELEGRAM_CHAT_ID="your-chat-id"
```

The alert is sent when the customer creates an order number. If the Telegram variables are missing or Telegram fails, the order page still shows the bank transfer instructions.

The Telegram alert includes order number, amount, bank account, customer name, phone, pickup method, file name, file size, material, quantity, print conditions, memo, and an order status link. If a browser preview image is available from the quote page, the function also attempts to send the preview image as a Telegram photo.

## Google Sheets And Drive Order DB

Use `scripts/google-orders-webhook.gs` as the Google Apps Script web app.

1. Create a Google Sheet for order records.
2. Create a Google Drive folder for uploaded model files.
3. Open Apps Script, paste `scripts/google-orders-webhook.gs`, and set:
   - `SHEET_ID`
   - `DRIVE_FOLDER_ID`
   - `SECRET`
4. Deploy the script as a web app with access set so the Netlify function can call it.
5. Add these Netlify environment variables:

```bash
GOOGLE_ORDERS_WEBHOOK_URL="https://script.google.com/macros/s/..."
GOOGLE_ORDERS_WEBHOOK_SECRET="same-secret-as-apps-script"
```

The order page sends attached model files up to 5 MB inline to the webhook. Larger files are still logged in the sheet with their file name and status, but the customer should be asked to send the file separately or the upload flow should be upgraded to direct Drive resumable upload.

## Notes

- Bank transfer confirmation is manual for now.
- The customer should include the order number or matching depositor name when sending money.
- Keep `TELEGRAM_BOT_TOKEN` server-side only. Do not put it in browser JavaScript.
