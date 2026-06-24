const params = new URLSearchParams(window.location.search);
const formatter = new Intl.NumberFormat("ko-KR");

const orderFileName = document.querySelector("#orderFileName");
const orderEstimateMeta = document.querySelector("#orderEstimateMeta");
const orderEstimate = document.querySelector("#orderEstimate");
const orderSummaryText = document.querySelector("#orderSummaryText");
const orderBreakdown = document.querySelector("#orderBreakdown");
const orderModelFile = document.querySelector("#orderModelFile");
const simulationPanel = document.querySelector("#simulationPanel");
const orderForm = document.querySelector("#orderForm");
const qrCode = document.querySelector("#qrCode");
const pickupCode = document.querySelector("#pickupCode");
const paymentNotice = document.querySelector("#paymentNotice");

const paymentConfig = window.REAL3DMAKER_PAYMENT || window.BLUEFORGE_PAYMENT || {};
const basePath = window.location.pathname.replace(/[^/]*$/, "");

function param(name, fallback = "-") {
  return params.get(name) || fallback;
}

function formatFile(file) {
  if (!file) return "파일 미선택";
  const size = file.size / 1024 / 1024;
  return `${file.name} · ${size >= 1 ? size.toFixed(1) : (file.size / 1024).toFixed(0)} ${size >= 1 ? "MB" : "KB"}`;
}

function parseEstimateAmount() {
  const estimate = param("estimate", "0");
  const parsed = Number(String(estimate).replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
}

function cleanPhone(value) {
  return String(value || "").replace(/[^\d]/g, "").slice(0, 15);
}

function createOrderId() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0, 6);
  return `R3D-${date}-${random}`;
}

function buildOrderPayload(orderId) {
  const amount = parseEstimateAmount();
  const fileName = orderFileName.textContent || param("file", "3D 모델 파일");

  return {
    orderId,
    amount,
    orderName: `Real3DMaker 3D 출력 - ${fileName}`.slice(0, 100),
    customerName: document.querySelector("#customerName").value.trim(),
    customerMobilePhone: cleanPhone(document.querySelector("#customerPhone").value),
    fileName,
    material: param("material"),
    quantity: param("quantity", "1"),
    pickup: document.querySelector("#pickupMethod").value,
    estimate: param("estimate", ""),
    paymentMethod: document.querySelector("#paymentMethod").value,
    memo: document.querySelector("#paymentMemo").value.trim(),
  };
}

function getReturnUrl(page) {
  return `${window.location.origin}${basePath}${page}`;
}

function savePendingOrder(payload) {
  sessionStorage.setItem(`real3dmaker-order-${payload.orderId}`, JSON.stringify(payload));
  sessionStorage.setItem("real3dmaker-last-order", JSON.stringify(payload));
}

function setInitialSummary() {
  const estimate = param("estimate", "견적 미확인");
  const file = param("file", "미업로드");

  orderFileName.textContent = file;
  orderEstimateMeta.textContent = `${param("material")} · ${param("quantity", "1")}개 · 최대 ${param("maxSize", "-")}mm`;
  orderEstimate.textContent = estimate;
  orderSummaryText.textContent = `${file} 조건으로 선결제 주문을 이어갑니다. 실제 출력 가능 여부는 접수 후 최종 확인됩니다.`;

  orderBreakdown.innerHTML = [
    ["소재", param("material")],
    ["수량", `${param("quantity", "1")}개`],
    ["출력 시간", `${param("hours", "-")}시간`],
    ["적층", param("layer")],
    ["서포트", param("support")],
    ["다색 출력", param("multicolor")],
    ["수령", "택배 또는 현장 수령"],
    ["결제", "선결제 필요"],
  ]
    .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
    .join("");

  if (file !== "미업로드") {
    updateSimulation({ name: file, size: 0 }, true);
  }
}

function updateSimulation(file, fromQuote = false) {
  simulationPanel.classList.add("is-ready");
  simulationPanel.querySelector("strong").textContent = "출력 시뮬레이션 자동 생성됨";
  simulationPanel.querySelector("span").textContent = fromQuote
    ? `${file.name} · 견적 조건 기반 자동 확인`
    : `${formatFile(file)} · 업로드 파일 기반 자동 확인`;
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
      const active = (x * 17 + y * 31 + seed) % 5 < 2;
      if (active) ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  [
    [1, 1],
    [12, 1],
    [1, 12],
  ].forEach(([x, y]) => {
    ctx.fillRect(x * cell, y * cell, cell * 5, cell * 5);
    ctx.fillStyle = "#fff";
    ctx.fillRect((x + 1) * cell, (y + 1) * cell, cell * 3, cell * 3);
    ctx.fillStyle = "#05070d";
    ctx.fillRect((x + 2) * cell, (y + 2) * cell, cell, cell);
  });

  qrCode.append(canvas);
}

function renderQr(orderId) {
  const payload = JSON.stringify({
    service: "Real3DMaker",
    orderId,
    pickup: document.querySelector("#pickupMethod").value,
    estimate: param("estimate", ""),
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

orderModelFile.addEventListener("change", () => {
  const [file] = orderModelFile.files;
  if (!file) return;
  orderFileName.textContent = file.name;
  orderEstimateMeta.textContent = formatFile(file);
  updateSimulation(file);
});

orderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const clientKey = paymentConfig.clientKey || "";

  if (!window.TossPayments) {
    paymentNotice.textContent = "결제 SDK를 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.";
    return;
  }

  if (!clientKey || clientKey.includes("REPLACE_ME")) {
    paymentNotice.textContent = "토스페이먼츠 clientKey가 필요합니다. payment-config.js에 테스트 키를 넣으면 결제창 테스트가 가능합니다.";
    return;
  }

  const orderId = createOrderId();
  const payload = buildOrderPayload(orderId);
  savePendingOrder(payload);

  paymentNotice.textContent = "결제창을 여는 중입니다.";

  const tossPayments = TossPayments(clientKey);
  const payment = tossPayments.payment({ customerKey: TossPayments.ANONYMOUS || "ANONYMOUS" });

  payment.requestPayment({
    method: payload.paymentMethod,
    amount: {
      value: payload.amount,
      currency: "KRW",
    },
    orderId: payload.orderId,
    orderName: payload.orderName,
    successUrl: getReturnUrl("payment-success.html"),
    failUrl: getReturnUrl("payment-fail.html"),
    customerName: payload.customerName,
    customerMobilePhone: payload.customerMobilePhone,
    metadata: {
      fileName: payload.fileName,
      pickup: payload.pickup,
      paymentMethod: payload.paymentMethod,
    },
  }).catch((error) => {
    paymentNotice.textContent = error.message || "결제창을 열지 못했습니다. 잠시 후 다시 시도해주세요.";
  });
});

setInitialSummary();
