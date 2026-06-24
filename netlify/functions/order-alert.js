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
    `소재: ${trim(order?.material)}`,
    `수량: ${trim(order?.quantity, "1")}개`,
  ];

  if (order?.memo) {
    lines.push(`메모: ${trim(order.memo)}`);
  }

  return lines.join("\n");
}

async function notifyTelegram(message) {
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
  return { ok: response.ok, status: response.status, data };
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
    const notification = await notifyTelegram(buildTelegramMessage(order));
    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        ok: true,
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
