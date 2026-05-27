const params = new URLSearchParams(window.location.search);
const formatter = new Intl.NumberFormat("ko-KR");

const orderFileName = document.querySelector("#orderFileName");
const orderEstimateMeta = document.querySelector("#orderEstimateMeta");
const orderEstimate = document.querySelector("#orderEstimate");
const orderSummaryText = document.querySelector("#orderSummaryText");
const orderBreakdown = document.querySelector("#orderBreakdown");
const orderModelFile = document.querySelector("#orderModelFile");
const simulationFile = document.querySelector("#simulationFile");
const simulationPanel = document.querySelector("#simulationPanel");
const orderForm = document.querySelector("#orderForm");
const qrCode = document.querySelector("#qrCode");
const pickupCode = document.querySelector("#pickupCode");

function param(name, fallback = "-") {
  return params.get(name) || fallback;
}

function formatFile(file) {
  if (!file) return "파일 미선택";
  const size = file.size / 1024 / 1024;
  return `${file.name} · ${size >= 1 ? size.toFixed(1) : (file.size / 1024).toFixed(0)} ${size >= 1 ? "MB" : "KB"}`;
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
  ]
    .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function updateSimulation(file) {
  simulationPanel.classList.add("is-ready");
  simulationPanel.querySelector("strong").textContent = "시뮬레이션 파일 확인됨";
  simulationPanel.querySelector("span").textContent = formatFile(file);
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
    service: "BlueForge",
    orderId,
    pickup: "24H_VISIT",
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
});

simulationFile.addEventListener("change", () => {
  const [file] = simulationFile.files;
  if (file) updateSimulation(file);
});

orderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const now = new Date();
  const serial = String(Math.floor(Math.random() * 9000) + 1000);
  const orderId = `BF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${serial}`;
  pickupCode.textContent = orderId;
  renderQr(orderId);
});

setInitialSummary();
