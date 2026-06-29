const { connectLambda, getStore } = require("@netlify/blobs");

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function isAuthorized(event) {
  const token = process.env.REAL3DMAKER_ADMIN_TOKEN;
  if (!token) return false;
  const url = new URL(event.rawUrl || `https://real3dmaker.com${event.path}`);
  return url.searchParams.get("token") === token;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { message: "Method not allowed" });
  }

  const token = process.env.REAL3DMAKER_ADMIN_TOKEN;
  if (!token) {
    return json(503, { message: "REAL3DMAKER_ADMIN_TOKEN이 설정되지 않았습니다." });
  }

  if (!isAuthorized(event)) {
    return json(401, { message: "unauthorized" });
  }

  const url = new URL(event.rawUrl || `https://real3dmaker.com${event.path}`);
  const key = url.searchParams.get("key");
  if (!key) {
    return json(400, { message: "key가 필요합니다." });
  }

  try {
    connectLambda(event);
    const store = getStore("real3dmaker-order-files");
    const entry = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!entry?.data) {
      return json(404, { message: "파일을 찾을 수 없습니다." });
    }

    const metadata = entry.metadata || {};
    const fileName = String(metadata.fileName || key.split("/").pop() || "model-file").replace(/"/g, "");
    const mimeType = metadata.mimeType || "application/octet-stream";

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "private, no-store",
      },
      body: Buffer.from(entry.data).toString("base64"),
    };
  } catch {
    return json(500, { message: "파일을 내려받을 수 없습니다." });
  }
};
