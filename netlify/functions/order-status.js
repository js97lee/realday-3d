const { connectLambda, getStore } = require("@netlify/blobs");

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function trim(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function maskPhone(value) {
  const phone = normalizePhone(value);
  if (phone.length < 7) return phone ? `${phone.slice(0, 3)}****` : "-";
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function pickupLabel(value) {
  return value === "ONSITE" ? "현장 수령" : "택배 수령";
}

function publicOrder(order) {
  return {
    orderId: order.orderId,
    status: order.status || "입금 대기",
    statusMessage: order.statusMessage || "입금 확인 후 제작 가능 여부를 안내합니다.",
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    amount: order.amount,
    paymentStatus: order.paymentStatus || "입금 대기",
    bankName: order.bankName,
    bankAccountNumber: order.bankAccountNumber,
    customerName: order.customerName,
    customerMobilePhone: maskPhone(order.customerMobilePhone),
    pickup: order.pickup,
    pickupLabel: pickupLabel(order.pickup),
    fileName: order.fileName,
    fileSizeText: order.fileSizeText || "-",
    material: order.material,
    quantity: order.quantity || "1",
    hours: order.hours || "-",
    maxSize: order.maxSize || "-",
    layer: order.layer || "-",
    finish: order.finish || "-",
    support: order.support || "-",
    multicolor: order.multicolor || "-",
    memo: order.memo || "",
    hasPreviewImage: Boolean(order.hasPreviewImage),
  };
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

  const orderId = trim(payload.orderId).toUpperCase();
  const customerNameKey = trim(payload.customerName).toLocaleLowerCase("ko-KR");
  const customerPhoneKey = normalizePhone(payload.customerMobilePhone);

  if (!orderId || !customerNameKey || !customerPhoneKey) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ message: "주문번호, 이름, 연락처를 입력해주세요." }),
    };
  }

  try {
    connectLambda(event);
    const store = getStore("real3dmaker-orders");
    const order = await store.get(orderId, { type: "json" });

    if (!order) {
      return {
        statusCode: 404,
        headers: jsonHeaders,
        body: JSON.stringify({ message: "주문번호를 찾을 수 없습니다." }),
      };
    }

    const nameMatches = trim(order.customerNameKey).toLocaleLowerCase("ko-KR") === customerNameKey;
    const phoneMatches = normalizePhone(order.customerPhoneKey) === customerPhoneKey;

    if (!nameMatches || !phoneMatches) {
      return {
        statusCode: 403,
        headers: jsonHeaders,
        body: JSON.stringify({ message: "주문 정보가 일치하지 않습니다." }),
      };
    }

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({ ok: true, order: publicOrder(order) }),
    };
  } catch {
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ message: "주문 상태를 확인할 수 없습니다." }),
    };
  }
};
