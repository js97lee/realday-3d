const params = new URLSearchParams(window.location.search);
const formatter = new Intl.NumberFormat("ko-KR");

const paymentKey = params.get("paymentKey");
const orderId = params.get("orderId");
const amount = Number(params.get("amount"));

const paymentBreakdown = document.querySelector("#paymentBreakdown");
const confirmMessage = document.querySelector("#confirmMessage");
const paymentStatusText = document.querySelector("#paymentStatusText");
const successOrderEstimate = document.querySelector("#successOrderEstimate");
const successSummaryText = document.querySelector("#successSummaryText");
const pickupCode = document.querySelector("#pickupCode");
let confirmedPayment = null;

function getStoredOrder() {
  if (!orderId) return null;
  try {
    return JSON.parse(sessionStorage.getItem(`real3dmaker-order-${orderId}`));
  } catch {
    return null;
  }
}

function renderBreakdown(order) {
  const method =
    order?.paymentMethod === "BANK_TRANSFER"
      ? "카카오뱅크 계좌이체"
      : confirmedPayment?.method || order?.paymentMethod || "-";
  const provider =
    confirmedPayment?.easyPay?.provider ||
    confirmedPayment?.card?.company ||
    confirmedPayment?.card?.issuerCode ||
    "-";
  const pickupLabel = order?.pickup === "ONSITE" ? "현장 수령" : "택배 수령";

  paymentBreakdown.innerHTML = [
    ["주문번호", orderId || "-"],
    ["결제금액", Number.isFinite(amount) ? `${formatter.format(amount)}원` : "-"],
    ["결제수단", method],
    ["결제기관", provider],
    ["파일", order?.fileName || "-"],
    ["소재", order?.material || "-"],
    ["수량", `${order?.quantity || "1"}개`],
    ["수령", pickupLabel],
  ]
    .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function markConfirmed(order) {
  renderBreakdown(order);
  confirmMessage.textContent = "주문이 출력 대기열에 접수되었습니다.";
  paymentStatusText.textContent = "주문 접수 완료. 출력 완료 후 수령 방법을 안내드립니다.";
  successOrderEstimate.textContent = Number.isFinite(amount) ? `${formatter.format(amount)} 입금 확인 필요` : "입금 확인 필요";
  successSummaryText.textContent =
    order?.pickup === "ONSITE"
      ? "출력 완료 후 현장 수령 가능 시간을 연락처로 안내합니다."
      : "출력 완료 후 택배 발송 정보를 연락처로 안내합니다.";
  pickupCode.textContent = orderId;
}

function markPending(reason) {
  confirmMessage.textContent = reason;
  paymentStatusText.textContent = "주문 정보 확인이 필요합니다.";
  successOrderEstimate.textContent = "확인 필요";
  successSummaryText.textContent = "주문번호와 입금 내역을 확인한 뒤 제작 가능 여부를 안내합니다.";
}

async function confirmPayment(order) {
  if (!paymentKey || !orderId || !Number.isFinite(amount)) {
    markPending("결제 승인에 필요한 값이 부족합니다. 결제 내역을 확인해주세요.");
    return;
  }

  if (order?.amount && Number(order.amount) !== amount) {
    markPending("브라우저에 저장된 견적 금액과 결제 금액이 다릅니다. 주문 금액 확인이 필요합니다.");
    return;
  }

  try {
    const response = await fetch("api/confirm-payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentKey, orderId, amount, order }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      markPending(data.message || "서버 승인 API 연결이 필요합니다.");
      return;
    }

    confirmedPayment = data;
    sessionStorage.setItem(`real3dmaker-payment-${orderId}`, JSON.stringify({
      paymentKey,
      orderId,
      amount,
      method: data.method,
      approvedAt: data.approvedAt,
    }));
    markConfirmed(order);
  } catch {
    markPending("주문 정보를 확인할 수 없습니다. 주문번호와 입금 내역을 고객센터로 알려주세요.");
  }
}

const storedOrder = getStoredOrder();
renderBreakdown(storedOrder);
confirmPayment(storedOrder);
