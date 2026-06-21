module.exports = async function handler(request, response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ message: "Method not allowed" });
    return;
  }

  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    response.status(501).json({
      message: "TOSS_SECRET_KEY 환경변수가 필요합니다. 시크릿 키는 프론트엔드에 넣으면 안 됩니다.",
    });
    return;
  }

  const { paymentKey, orderId, amount } = request.body || {};
  if (!paymentKey || !orderId || typeof amount !== "number") {
    response.status(400).json({ message: "paymentKey, orderId, amount가 필요합니다." });
    return;
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
    response.status(tossResponse.status).json(data);
  } catch {
    response.status(502).json({ message: "토스페이먼츠 승인 API에 연결할 수 없습니다." });
  }
};
