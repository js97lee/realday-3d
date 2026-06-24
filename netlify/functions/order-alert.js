const { getStore } = require("@netlify/blobs");

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function pickupLabel(value) {
  return value === "ONSITE" ? "현장 수령" : "택배 수령";
}

function trim(value, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function buildTelegramMessage(order) {
  const statusUrl = `https://real3dmaker.com/order-status.html?orderId=${encodeURIComponent(trim(order?.orderId, ""))}`;
  const lines = [
    "Real3DMaker 새 주문",
    "",
    `주문번호: ${trim(order?.orderId)}`,
    `입금금액: ${formatCurrency(order?.amount)}`,
    `입금계좌: ${trim(order?.bankName)} ${trim(order?.bankAccountNumber)}`,
    `결제상태: ${trim(order?.paymentStatus, "입금 대기")}`,
    `주문자: ${trim(order?.customerName)}`,
    `연락처: ${trim(order?.customerMobilePhone)}`,
    `수령: ${pickupLabel(order?.pickup)}`,
    `파일: ${trim(order?.fileName)}`,
    `파일크기: ${trim(order?.fileSizeText)}`,
    `소재: ${trim(order?.material)}`,
    `수량: ${trim(order?.quantity, "1")}개`,
    `출력시간: ${trim(order?.hours)}시간`,
    `최대치수: ${trim(order?.maxSize)}mm`,
    `적층: ${trim(order?.layer)}`,
    `서포트: ${trim(order?.support)}`,
    `다색출력: ${trim(order?.multicolor)}`,
    `후가공: ${trim(order?.finish)}`,
    `조회: ${statusUrl}`,
  ];

  if (order?.memo) {
    lines.push(`메모: ${trim(order.memo)}`);
  }

  return lines.join("\n");
}

async function notifyTelegram(message, order) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return { ok: false, skipped: true, reason: "telegram-env-missing" };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (response.ok && order?.previewImageDataUrl) {
    try {
      await sendTelegramPhoto({ token, chatId, order });
    } catch {
      // Text notification is more important than the optional preview image.
    }
  }

  return { ok: response.ok, status: response.status, data };
}

async function sendTelegramPhoto({ token, chatId, order }) {
  const match = String(order.previewImageDataUrl).match(/^data:image\/(png|jpeg);base64,(.+)$/);
  if (!match) return { ok: false, skipped: true };

  const mimeType = match[1] === "jpeg" ? "image/jpeg" : "image/png";
  const bytes = Buffer.from(match[2], "base64");
  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("caption", `모델 미리보기 · ${trim(order.fileName)} · ${trim(order.orderId)}`);
  formData.append("photo", new Blob([bytes], { type: mimeType }), `${trim(order.orderId, "preview")}.png`);

  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function stripPrivateFields(order) {
  const { previewImageDataUrl, ...storedOrder } = order;
  return storedOrder;
}

async function saveOrder(order) {
  const store = getStore("real3dmaker-orders");
  const now = new Date().toISOString();
  const storedOrder = {
    ...stripPrivateFields(order),
    status: order.status || "입금 대기",
    statusMessage: order.statusMessage || "주문번호가 생성되었습니다. 입금 확인 후 제작 가능 여부를 안내합니다.",
    createdAt: order.createdAt || now,
    updatedAt: now,
    customerNameKey: trim(order.customerName, "").toLocaleLowerCase("ko-KR"),
    customerPhoneKey: normalizePhone(order.customerMobilePhone),
    hasPreviewImage: Boolean(order.previewImageDataUrl),
  };
  await store.setJSON(order.orderId, storedOrder);
  return storedOrder;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...jsonHeaders, Allow: "POST" },
      body: JSON.stringify({ message: "Method not allowed" }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ message: "요청 JSON을 읽을 수 없습니다." }),
    };
  }

  const order = payload.order || {};
  if (!order.orderId || typeof order.amount !== "number") {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ message: "order.orderId와 order.amount가 필요합니다." }),
    };
  }

  try {
    let stored = false;
    let status = order.status || "입금 대기";
    try {
      const savedOrder = await saveOrder(order);
      stored = true;
      status = savedOrder.status;
    } catch {
      stored = false;
    }

    const notification = await notifyTelegram(buildTelegramMessage(order), order);
    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        ok: true,
        stored,
        status,
        notification: notification.ok
          ? "telegram-sent"
          : notification.skipped
          ? "telegram-not-configured"
          : "telegram-failed",
      }),
    };
  } catch {
    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({ ok: true, notification: "telegram-failed" }),
    };
  }
};
