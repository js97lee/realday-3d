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
const qrCode = document.querySelector("#qrCode");
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

function fallbackQr(text) {
  qrCode.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 180;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#05070d";

  let seed = 0;
  for (let i = 0; i < text.length; i += 1) seed = (seed * 31 + text.charCodeAt(i)) % 9973;

  const cell = 10;
  for (let y = 1; y < 17; y += 1) {
    for (let x = 1; x < 17; x += 1) {
      if ((x * 17 + y * 31 + seed) % 5 < 2) ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  qrCode.append(canvas);
}

function renderQr(order) {
  const payload = JSON.stringify({
    service: "Real3DMaker",
    orderId,
    paymentKey,
    pickup: order?.pickup || "24H_VISIT",
  });

  qrCode.innerHTML = "";
  if (window.QRCode) {
    new QRCode(qrCode, {
      text: payload,
      width: 180,
      height: 180,
      colorDark: "#05070d",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
  } else {
    fallbackQr(payload);
  }
}

function renderBreakdown(order) {
  const method = confirmedPayment?.method || (order?.paymentMethod === "CARD" ? "카드/간편결제" : order?.paymentMethod) || "-";
  const provider =
    confirmedPayment?.easyPay?.provider ||
    confirmedPayment?.card?.company ||
    confirmedPayment?.card?.issuerCode ||
    "-";

  paymentBreakdown.innerHTML = [
    ["주문번호", orderId || "-"],
    ["결제금액", Number.isFinite(amount) ? `${formatter.format(amount)}원` : "-"],
    ["결제수단", method],
    ["결제기관", provider],
    ["파일", order?.fileName || "-"],
    ["소재", order?.material || "-"],
    ["수량", `${order?.quantity || "1"}개`],
  ]
    .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function markConfirmed(order) {
  renderBreakdown(order);
  confirmMessage.textContent = "결제가 승인되었습니다. 주문이 출력 대기열에 접수되었습니다.";
  paymentStatusText.textContent = "결제 승인 완료. 방문 수령 QR을 확인해주세요.";
  successOrderEstimate.textContent = Number.isFinite(amount) ? `${formatter.format(amount)}원 결제 완료` : "결제 완료";
  successSummaryText.textContent = "출력 완료 후 24시간 방문 수령 QR로 픽업합니다.";
  pickupCode.textContent = orderId;
  renderQr(order);
}

function markPending(reason) {
  confirmMessage.textContent = reason;
  paymentStatusText.textContent = "결제 요청은 완료되었지만 서버 승인 확인이 아직 필요합니다.";
  successOrderEstimate.textContent = "승인 확인 필요";
  successSummaryText.textContent = "운영 서버의 confirm API가 연결되면 이 단계에서 QR이 발급됩니다.";
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
      body: JSON.stringify({ paymentKey, orderId, amount }),
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
    markPending("현재 배포에서 서버 승인 API를 호출할 수 없습니다. Netlify Functions 배포와 TOSS_SECRET_KEY 설정이 필요합니다.");
  }
}

const storedOrder = getStoredOrder();
renderBreakdown(storedOrder);
confirmPayment(storedOrder);
