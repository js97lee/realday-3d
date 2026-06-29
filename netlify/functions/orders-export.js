const { connectLambda, getStore } = require("@netlify/blobs");

const headers = [
  "접수일",
  "업데이트",
  "주문번호",
  "상태",
  "입금상태",
  "입금금액",
  "입금은행",
  "입금계좌",
  "주문자",
  "연락처",
  "수령방식",
  "배송지",
  "파일명",
  "파일크기",
  "출력용 3D 파일 다운로드",
  "파일 첨부 상태",
  "소재",
  "무게",
  "수량",
  "출력시간",
  "최대치수",
  "적층",
  "서포트",
  "다색출력",
  "빠른납기",
  "후가공",
  "메모",
  "주문조회링크",
];

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function pickupLabel(value) {
  return value === "ONSITE" ? "현장 수령" : "택배 수령";
}

function deliveryLabel(order) {
  return [order.deliveryAddress, order.deliveryAddressDetail].filter(Boolean).join(" ");
}

function buildOrderStatusUrl(order) {
  return `https://real3dmaker.com/order-status.html?orderId=${encodeURIComponent(order.orderId || "")}`;
}

function withToken(url, token) {
  if (!url || !token || url.includes("token=")) return url || "";
  if (!url.includes("/.netlify/functions/order-file")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

function rowForOrder(order, token) {
  return [
    order.createdAt || "",
    order.updatedAt || "",
    order.orderId || "",
    order.status || "입금 대기",
    order.paymentStatus || "입금 대기",
    order.amount || "",
    order.bankName || "카카오뱅크",
    order.bankAccountNumber || "3333-35-6070100",
    order.customerName || "",
    order.customerMobilePhone || "",
    pickupLabel(order.pickup),
    deliveryLabel(order),
    order.fileName || order.modelFileName || "",
    order.fileSizeText || order.modelFileSizeText || order.modelFileSize || "",
    withToken(order.driveFileUrl || order.modelFileDownloadUrl, token),
    order.modelFileStatus || "",
    order.material || "",
    order.weight || "",
    order.quantity || "",
    order.hours || "",
    order.maxSize || "",
    order.layer || "",
    order.support || "",
    order.multicolor || "",
    order.rush || "",
    order.finish || "",
    order.memo || "",
    buildOrderStatusUrl(order),
  ];
}

async function listOrders(store) {
  const orders = [];
  for await (const page of store.list({ paginate: true })) {
    for (const blob of page.blobs || []) {
      const order = await store.get(blob.key, { type: "json" });
      if (order) orders.push(order);
    }
  }
  return orders.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { message: "Method not allowed" });
  }

  const token = process.env.REAL3DMAKER_ADMIN_TOKEN;
  if (!token) {
    return json(503, { message: "REAL3DMAKER_ADMIN_TOKEN이 설정되지 않았습니다." });
  }

  const url = new URL(event.rawUrl || `https://real3dmaker.com${event.path}`);
  if (url.searchParams.get("token") !== token) {
    return json(401, { message: "unauthorized" });
  }

  try {
    connectLambda(event);
    const store = getStore("real3dmaker-orders");
    const rows = [headers, ...(await listOrders(store)).map((order) => rowForOrder(order, token))];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store",
      },
      body: `\uFEFF${csv}`,
    };
  } catch {
    return json(500, { message: "주문 CSV를 만들 수 없습니다." });
  }
};
