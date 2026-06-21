exports.handler = async (event) => {
  const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...jsonHeaders, Allow: "POST" },
      body: JSON.stringify({ message: "Method not allowed" }),
    };
  }

  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    return {
      statusCode: 501,
      headers: jsonHeaders,
      body: JSON.stringify({
        message: "TOSS_SECRET_KEY 환경변수가 필요합니다. 시크릿 키는 프론트엔드에 넣으면 안 됩니다.",
      }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ message: "요청 JSON을 읽을 수 없습니다." }),
    };
  }

  const { paymentKey, orderId, amount } = payload;
  if (!paymentKey || !orderId || typeof amount !== "number") {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ message: "paymentKey, orderId, amount가 필요합니다." }),
    };
  }

  try {
    // Production note: fetch the original order from your DB and compare its amount here.
    const authorization = Buffer.from(`${secretKey}:`).toString("base64");
    const tossResponse = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });

    const data = await tossResponse.json().catch(() => ({
      message: "토스페이먼츠 승인 응답을 읽을 수 없습니다.",
    }));

    return {
      statusCode: tossResponse.status,
      headers: jsonHeaders,
      body: JSON.stringify(data),
    };
  } catch {
    return {
      statusCode: 502,
      headers: jsonHeaders,
      body: JSON.stringify({ message: "토스페이먼츠 승인 API에 연결할 수 없습니다." }),
    };
  }
};
