const CONFIG = {
  SHEET_ID: "PASTE_GOOGLE_SHEET_ID_HERE",
  DRIVE_FOLDER_ID: "PASTE_GOOGLE_DRIVE_FOLDER_ID_HERE",
  SECRET: "CHANGE_THIS_SECRET",
  SHEET_NAME: "Orders",
};

const HEADERS = [
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

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    if (CONFIG.SECRET && payload.secret !== CONFIG.SECRET) {
      return json({ ok: false, message: "unauthorized" });
    }

    const order = payload.order || {};
    const fileUrl = saveModelFile(order);
    const sheetUrl = appendOrderRow(order, fileUrl);

    return json({
      ok: true,
      fileUrl,
      sheetUrl,
    });
  } catch (error) {
    return json({
      ok: false,
      message: error.message,
    });
  }
}

function saveModelFile(order) {
  if (!order.modelFileDataUrl || order.modelFileStatus !== "attached") {
    return "";
  }

  const match = String(order.modelFileDataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return "";
  }

  const mimeType = match[1] || "application/octet-stream";
  const bytes = Utilities.base64Decode(match[2]);
  const safeName = sanitizeFileName(`${order.orderId}_${order.modelFileName || order.fileName || "model"}`);
  const blob = Utilities.newBlob(bytes, mimeType, safeName);
  const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const file = folder.createFile(blob);
  return file.getUrl();
}

function appendOrderRow(order, fileUrl) {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = getOrCreateSheet(spreadsheet, CONFIG.SHEET_NAME);
  ensureHeaders(sheet);

  const now = new Date();
  const statusUrl = `https://real3dmaker.com/order-status.html?orderId=${encodeURIComponent(order.orderId || "")}`;
  const row = [
    order.createdAt || now,
    order.updatedAt || now,
    order.orderId || "",
    order.status || "입금 대기",
    order.paymentStatus || "입금 대기",
    order.amount || "",
    order.bankName || "카카오뱅크",
    order.bankAccountNumber || "3333-35-6070100",
    order.customerName || "",
    order.customerMobilePhone || "",
    order.pickup === "ONSITE" ? "현장 수령" : "택배 수령",
    order.fileName || order.modelFileName || "",
    order.fileSizeText || order.modelFileSize || "",
    fileUrl || "",
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
    statusUrl,
  ];

  sheet.appendRow(row);
  return spreadsheet.getUrl();
}

function getOrCreateSheet(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function ensureHeaders(sheet) {
  if (sheet.getLastRow() > 0) return;
  sheet.appendRow(HEADERS);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, HEADERS.length);
}

function sanitizeFileName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "_").slice(0, 180);
}

function json(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
