const params = new URLSearchParams(window.location.search);
const formatter = new Intl.NumberFormat("ko-KR");

const orderStatusForm = document.querySelector("#orderStatusForm");
const statusOrderId = document.querySelector("#statusOrderId");
const statusCustomerName = document.querySelector("#statusCustomerName");
const statusCustomerPhone = document.querySelector("#statusCustomerPhone");
const statusNotice = document.querySelector("#statusNotice");
const statusTitle = document.querySelector("#statusTitle");
const statusSummaryText = document.querySelector("#statusSummaryText");
const statusBadge = document.querySelector("#statusBadge");
const statusCurrent = document.querySelector("#statusCurrent");
const statusBreakdown = document.querySelector("#statusBreakdown");

function formatCurrency(value) {
  return `${formatter.format(Number(value || 0))}원`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderOrder(order) {
  statusTitle.textContent = order.orderId;
  statusSummaryText.textContent = order.statusMessage || "주문 상태를 확인했습니다.";
  statusBadge.hidden = false;
  statusCurrent.textContent = order.status || "입금 대기";

  const rows = [
    ["접수일", formatDate(order.createdAt)],
    ["업데이트", formatDate(order.updatedAt)],
    ["입금상태", order.paymentStatus || "입금 대기"],
    ["입금금액", formatCurrency(order.amount)],
    ["입금계좌", `${order.bankName || "카카오뱅크"} ${order.bankAccountNumber || "3333-35-6070100"}`],
    ["주문자", order.customerName || "-"],
    ["연락처", order.customerMobilePhone || "-"],
    ["수령", order.pickupLabel || "-"],
    ...(order.pickup === "DELIVERY"
      ? [["배송지", [order.deliveryAddress, order.deliveryAddressDetail].filter(Boolean).join(" ") || "-"]]
      : []),
    ["파일", order.fileName || "-"],
    ["파일크기", order.fileSizeText || "-"],
    ["소재", order.material || "-"],
    ["수량", `${order.quantity || "1"}개`],
    ["출력시간", `${order.hours || "-"}시간`],
    ["최대치수", `${order.maxSize || "-"}mm`],
    ["적층", order.layer || "-"],
    ["서포트", order.support || "-"],
    ["다색출력", order.multicolor || "-"],
    ["후가공", order.finish || "-"],
    ["메모", order.memo || "-"],
  ];

  statusBreakdown.innerHTML = rows
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

async function lookupOrder() {
  statusNotice.textContent = "주문 정보를 확인하는 중입니다.";

  const response = await fetch("api/order-status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      orderId: statusOrderId.value.trim(),
      customerName: statusCustomerName.value.trim(),
      customerMobilePhone: statusCustomerPhone.value.trim(),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    statusNotice.textContent = data.message || "주문 상태를 확인할 수 없습니다.";
    statusBadge.hidden = true;
    statusTitle.textContent = "조회 실패";
    statusSummaryText.textContent = "입력한 주문 정보를 다시 확인해주세요.";
    statusBreakdown.innerHTML = "";
    return;
  }

  statusNotice.textContent = "주문 상태를 확인했습니다.";
  renderOrder(data.order);
}

statusOrderId.value = params.get("orderId") || "";

orderStatusForm.addEventListener("submit", (event) => {
  event.preventDefault();
  lookupOrder().catch(() => {
    statusNotice.textContent = "주문 상태를 확인할 수 없습니다.";
  });
});
