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
const pickupCode = document.querySelector("#pickupCode");
const paymentNotice = document.querySelector("#paymentNotice");
const bankTransferCard = document.querySelector("#bankTransferCard");
const bankQrImage = document.querySelector("#bankQrImage");
const bankTransferBreakdown = document.querySelector("#bankTransferBreakdown");
const bankTransferHelp = document.querySelector("#bankTransferHelp");
const copyAccountButton = document.querySelector("#copyAccountButton");
const deliveryFields = document.querySelector("#deliveryFields");
const deliveryAddress = document.querySelector("#deliveryAddress");
const deliveryAddressDetail = document.querySelector("#deliveryAddressDetail");
const pickupMethodInputs = document.querySelectorAll('input[name="pickupMethod"]');

const bankTransfer = {
  bankName: "카카오뱅크",
  accountNumber: "3333-35-6070100",
};

const maxInlineModelFileBytes = 5 * 1024 * 1024;

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
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function cleanPhone(value) {
  return String(value || "").replace(/[^\d]/g, "").slice(0, 15);
}

function getPickupValue() {
  return document.querySelector('input[name="pickupMethod"]:checked')?.value || "DELIVERY";
}

function syncDeliveryFields() {
  const isDelivery = getPickupValue() === "DELIVERY";
  deliveryFields.hidden = !isDelivery;
  deliveryAddress.required = isDelivery;
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
  const [selectedFile] = orderModelFile.files;

  return {
    orderId,
    amount,
    orderName: `Real3DMaker 3D 출력 - ${fileName}`.slice(0, 100),
    customerName: document.querySelector("#customerName").value.trim(),
    customerMobilePhone: cleanPhone(document.querySelector("#customerPhone").value),
    fileName,
    fileSizeText: selectedFile ? formatFile(selectedFile).split(" · ").slice(1).join(" · ") : param("fileSize", "-"),
    material: param("material"),
    weight: param("weight", "-"),
    quantity: param("quantity", "1"),
    hours: param("hours", "-"),
    maxSize: param("maxSize", "-"),
    layer: param("layer", "-"),
    finish: param("finish", "-"),
    support: param("support", "-"),
    multicolor: param("multicolor", "-"),
    rush: param("rush", "-"),
    pickup: getPickupValue(),
    deliveryAddress: deliveryAddress.value.trim(),
    deliveryAddressDetail: deliveryAddressDetail.value.trim(),
    estimate: param("estimate", ""),
    paymentMethod: document.querySelector("#paymentMethod").value,
    paymentStatus: "입금 대기",
    bankName: bankTransfer.bankName,
    bankAccountNumber: bankTransfer.accountNumber,
    memo: document.querySelector("#paymentMemo").value.trim(),
    previewImageDataUrl: sessionStorage.getItem("real3dmaker-preview-image") || "",
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

async function attachModelFilePayload(payload) {
  const [selectedFile] = orderModelFile.files;
  if (!selectedFile) {
    return {
      ...payload,
      modelFileStatus: "not-attached",
    };
  }

  if (selectedFile.size > maxInlineModelFileBytes) {
    return {
      ...payload,
      modelFileStatus: "too-large-for-inline-upload",
      modelFileName: selectedFile.name,
      modelFileSize: selectedFile.size,
      modelFileMimeType: selectedFile.type || "application/octet-stream",
    };
  }

  return {
    ...payload,
    modelFileStatus: "attached",
    modelFileName: selectedFile.name,
    modelFileSize: selectedFile.size,
    modelFileMimeType: selectedFile.type || "application/octet-stream",
    modelFileDataUrl: await readFileAsDataUrl(selectedFile),
  };
}

function savePendingOrder(payload) {
  sessionStorage.setItem(`real3dmaker-order-${payload.orderId}`, JSON.stringify(payload));
  sessionStorage.setItem("real3dmaker-last-order", JSON.stringify(payload));
}

function buildQrText(payload) {
  return [
    "Real3DMaker 입금 안내",
    `주문번호: ${payload.orderId}`,
    `은행: ${bankTransfer.bankName}`,
    `계좌: ${bankTransfer.accountNumber}`,
    `금액: ${formatter.format(payload.amount)}원`,
    `입금자: ${payload.customerName}`,
  ].join("\n");
}

function qrImageUrl(payload) {
  const data = encodeURIComponent(buildQrText(payload));
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${data}`;
}

function pickupLabel(value) {
  return value === "ONSITE" ? "현장 수령" : "택배 수령";
}

function renderBankTransfer(payload) {
  pickupCode.textContent = payload.orderId;
  bankQrImage.src = qrImageUrl(payload);
  bankTransferCard.hidden = false;
  bankTransferHelp.textContent = "QR에는 송금에 필요한 주문번호, 계좌, 금액 정보가 들어 있습니다. 은행앱에서 금액과 계좌를 한 번 더 확인해주세요.";
  const rows = [
    ["입금은행", bankTransfer.bankName],
    ["입금계좌", bankTransfer.accountNumber],
    ["입금금액", `${formatter.format(payload.amount)}원`],
    ["입금자명", payload.customerName || "-"],
    ["수령", pickupLabel(payload.pickup)],
  ];

  if (payload.pickup === "DELIVERY") {
    rows.push(["배송지", [payload.deliveryAddress, payload.deliveryAddressDetail].filter(Boolean).join(" ") || "-"]);
  }

  bankTransferBreakdown.innerHTML = rows
    .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function statusUrl(orderId) {
  return `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}order-status.html?orderId=${encodeURIComponent(orderId)}`;
}

async function notifyOrder(payload) {
  const response = await fetch("api/order-alert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ order: payload }),
  });

  return response.json().catch(() => ({}));
}

function setInitialSummary() {
  const estimate = param("estimate", "견적 미확인");
  const file = param("file", "미업로드");

  orderFileName.textContent = file;
  orderEstimateMeta.textContent = `${param("material")} · ${param("quantity", "1")}개 · 최대 ${param("maxSize", "-")}mm`;
  orderEstimate.textContent = estimate;
  orderSummaryText.textContent = `${file} 조건으로 주문을 이어갑니다. 실제 출력 가능 여부는 접수 후 최종 확인됩니다.`;

  orderBreakdown.innerHTML = [
    ["소재", param("material")],
    ["수량", `${param("quantity", "1")}개`],
    ["출력 시간", `${param("hours", "-")}시간`],
    ["적층", param("layer")],
    ["서포트", param("support")],
    ["다색 출력", param("multicolor")],
    ["수령", pickupLabel(getPickupValue())],
    ["결제", "카카오뱅크 계좌이체"],
  ]
    .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
    .join("");

  if (file !== "미업로드") {
    updateSimulation({ name: file, size: 0 }, true);
  }
}

function updateSimulation(file, fromQuote = false) {
  simulationPanel.classList.add("is-ready");
  simulationPanel.querySelector("strong").textContent = "파일 첨부 확인됨";
  simulationPanel.querySelector("span").textContent = fromQuote
    ? `${file.name} · 견적 조건을 이어받았습니다.`
    : `${formatFile(file)} · 주문 파일로 접수됩니다.`;
}

orderModelFile.addEventListener("change", () => {
  const [file] = orderModelFile.files;
  if (!file) return;
  orderFileName.textContent = file.name;
  orderEstimateMeta.textContent = formatFile(file);
  updateSimulation(file);
});

copyAccountButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(bankTransfer.accountNumber);
    copyAccountButton.textContent = "복사 완료";
    window.setTimeout(() => {
      copyAccountButton.textContent = "계좌 복사";
    }, 1600);
  } catch {
    paymentNotice.textContent = `계좌번호: ${bankTransfer.accountNumber}`;
  }
});

pickupMethodInputs.forEach((input) => {
  input.addEventListener("change", () => {
    syncDeliveryFields();
    setInitialSummary();
  });
});

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const amount = parseEstimateAmount();
  if (amount <= 0) {
    paymentNotice.textContent = "견적 금액이 0원입니다. 메인 견적기에서 파일과 조건을 먼저 확인해주세요.";
    return;
  }

  const orderId = createOrderId();
  let payload = buildOrderPayload(orderId);
  payload = await attachModelFilePayload(payload);
  savePendingOrder(payload);
  renderBankTransfer(payload);

  paymentNotice.textContent = `${payload.orderId} 주문번호가 생성되었습니다. ${bankTransfer.bankName} ${bankTransfer.accountNumber}로 ${formatter.format(payload.amount)}원을 입금해주세요.`;

  try {
    const result = await notifyOrder(payload);
    if (result.notification === "telegram-sent") {
      paymentNotice.textContent += " 주문 알림도 전송되었습니다.";
    }
    if (result.stored) {
      paymentNotice.innerHTML += ` <a href="${statusUrl(payload.orderId)}">주문 상태 조회</a>`;
    }
  } catch {
    paymentNotice.textContent += " 주문 알림 전송은 나중에 다시 확인해주세요.";
  }
});

setInitialSummary();
syncDeliveryFields();
