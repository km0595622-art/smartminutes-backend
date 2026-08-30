const https = require("https");

const DARAJA_BASE_URL =
  process.env.MPESA_ENV === "production"
    ? "api.safaricom.co.ke"
    : "sandbox.safaricom.co.ke";

function httpsRequest(path, method, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: DARAJA_BASE_URL,
      path,
      method,
      headers
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        let parsed;

        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = { raw: data };
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
        } else {
          reject(
            new Error(
              `Daraja HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`
            )
          );
        }
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}


async function getAccessToken() {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;

  if (!key || !secret) {
    throw new Error(
      "MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET is missing."
    );
  }

  const credentials =
    Buffer.from(`${key}:${secret}`).toString("base64");

  const result = await httpsRequest(
    "/oauth/v1/generate?grant_type=client_credentials",
    "GET",
    {
      Authorization: `Basic ${credentials}`
    }
  );

  if (!result.access_token) {
    throw new Error("Daraja access token was not returned.");
  }

  return result.access_token;
}


async function stkPush({
  amount,
  phone,
  accountReference,
  transactionDesc
}) {
  const token = await getAccessToken();

  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const callbackUrl = process.env.MPESA_CALLBACK_URL;

  if (!shortcode || !passkey || !callbackUrl) {
    throw new Error(
      "MPESA_SHORTCODE, MPESA_PASSKEY or MPESA_CALLBACK_URL is missing."
    );
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);

  const password = Buffer.from(
    `${shortcode}${passkey}${timestamp}`
  ).toString("base64");

  const payload = JSON.stringify({
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(Number(amount)),
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: accountReference,
    TransactionDesc: transactionDesc
  });

  return httpsRequest(
    "/mpesa/stkpush/v1/processrequest",
    "POST",
    {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    },
    payload
  );
}


module.exports = {
  getAccessToken,
  stkPush
};
