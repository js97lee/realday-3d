const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function json(statusCode, body) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body),
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

  const workerUrl = process.env.REAL3DMAKER_SLICER_ENDPOINT;
  if (!workerUrl) {
    return json(202, {
      ok: false,
      mode: "browser-estimate",
      message:
        "REAL3DMAKER_SLICER_ENDPOINT가 아직 설정되지 않아 브라우저 예측 견적을 사용합니다.",
    });
  }

  const contentType = event.headers["content-type"] || event.headers["Content-Type"];
  if (!contentType?.includes("multipart/form-data")) {
    return json(400, { ok: false, message: "multipart/form-data 요청이 필요합니다." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const body = Buffer.from(event.body || "", event.isBase64Encoded ? "base64" : "utf8");
    const headers = { "Content-Type": contentType };
    const token = process.env.REAL3DMAKER_SLICER_TOKEN;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const workerResponse = await fetch(workerUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    const data = await workerResponse.json().catch(() => ({
      ok: false,
      message: "슬라이서 워커 응답을 JSON으로 읽을 수 없습니다.",
    }));

    return json(workerResponse.status, data);
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    return json(timedOut ? 504 : 502, {
      ok: false,
      message: timedOut
        ? "슬라이서 워커 응답 시간이 초과되었습니다."
        : "슬라이서 워커에 연결할 수 없습니다.",
    });
  } finally {
    clearTimeout(timeout);
  }
};
