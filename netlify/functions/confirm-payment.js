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

function buildTelegramMessage({ orderId, amount, order, payment }) {
  const lines = [
    "Real3DMaker 새 주문",
    "",
    `주문번호: ${orderId}`,
    `결제금액: ${formatCurrency(amount)}`,
    `결제수단: ${trim(payment?.method)}`,
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

  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    return {
      statusCode: 501,
      headers: jsonHeaders,
      body: JSON.stringify({
        message: "TOSS_SECRET_KEY 환경변수가 필요합니다. 시크릿 키는 프론트엔드에 넣으면 안 됩니다.",
      }),
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

  const { paymentKey, orderId, amount, order } = payload;
  if (!paymentKey || !orderId || typeof amount !== "number") {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ message: "paymentKey, orderId, amount가 필요합니다." }),
    };
  }

  try {
    // Production note: fetch the original order from your DB and compare its amount here.
    const authorization = Buffer.from(`${secretKey}:`).toString("base64");
    const tossResponse = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });

    const data = await tossResponse.json().catch(() => ({
      message: "토스페이먼츠 승인 응답을 읽을 수 없습니다.",
    }));

    if (tossResponse.ok) {
      try {
        const notification = await notifyTelegram(buildTelegramMessage({ orderId, amount, order, payment: data }));
        data.real3dmakerNotification = notification.ok
          ? "telegram-sent"
          : notification.skipped
          ? "telegram-not-configured"
          : "telegram-failed";
      } catch {
        data.real3dmakerNotification = "telegram-failed";
      }
    }

    return {
      statusCode: tossResponse.status,
      headers: jsonHeaders,
      body: JSON.stringify(data),
    };
  } catch {
    return {
      statusCode: 502,
      headers: jsonHeaders,
      body: JSON.stringify({ message: "토스페이먼츠 승인 API에 연결할 수 없습니다." }),
    };
  }
};
