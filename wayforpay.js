import crypto from "crypto";

/** ponytail: WayForPay serviceUrl signs these fields in this order, empty ones included. */
const SERVICE_FIELDS = [
  "merchantAccount",
  "orderReference",
  "amount",
  "currency",
  "authCode",
  "cardPan",
  "transactionStatus",
  "reasonCode",
];

const PASS_KOPECKS = new Map([
  [180000, "full"],
  [140000, "sprouts"],
  [60000, "grunt"],
  [40000, "one"],
]);

export function wayforpayField(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value);
}

export function hmacMd5(value, secret) {
  return crypto.createHmac("md5", secret).update(value, "utf8").digest("hex");
}

export function serviceSignatureString(body) {
  return SERVICE_FIELDS.map((key) => wayforpayField(body?.[key])).join(";");
}

export function signaturesMatch(expected, actual) {
  const left = Buffer.from(String(expected || "").toLowerCase());
  const right = Buffer.from(String(actual || "").toLowerCase());
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifyServiceSignature(body, secret) {
  if (!secret || !body || typeof body !== "object") return false;
  const expected = hmacMd5(serviceSignatureString(body), secret);
  return signaturesMatch(expected, wayforpayField(body.merchantSignature));
}

/** ponytail: the return page follows transactionStatus only; the service callback marks the signup paid. */
export function openDayReturnState(body) {
  const status = wayforpayField(parseWayforpayBody(body).transactionStatus);
  return status === "Approved" ? "paid" : "failed";
}

export function acceptPayload(orderReference, secret, time) {
  const status = "accept";
  return {
    orderReference,
    status,
    time,
    signature: hmacMd5(`${orderReference};${status};${time}`, secret),
  };
}

export function phoneKey(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}

const SIGNUP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ponytail: serviceUrl may arrive as JSON or as a form body; both become one object. */
export function parseWayforpayBody(body) {
  if (Buffer.isBuffer(body)) body = body.toString("utf8");
  if (typeof body === "string") {
    const text = body.replace(/^\uFEFF/, "").trim();
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      /* a form body is not JSON */
    }
    const params = new URLSearchParams(text);
    const obj = {};
    for (const [key, value] of params) obj[key] = value;
    const only = Object.keys(obj);
    if (only.length === 1 && only[0].trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(only[0]);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch {
        /* keep the form fields */
      }
    }
    if (only.length) return obj;
    return { raw: text.slice(0, 8000) };
  }
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  return {};
}

export function onePracticeAmount(count) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > 6) return 0;
  return n * 400;
}

const PRACTICE_LINES = new Map([
  ["trenazh", "Open Day, 03.10 14:00–15:00, Тренаж"],
  ["dance", "Open Day, 03.10 15:15–17:45, Сучасний танець"],
  ["game", "Open Day, 04.10 12:00–13:00, Рух як гра"],
  ["contact", "Open Day, 04.10 13:10–14:10, Контактна практика"],
  ["health", "Open Day, 04.10 15:00–16:00, Dance and health"],
  ["stretch", "Open Day, 04.10 16:10–17:10, Стретчинг"],
]);

/** ponytail: invoice lines are the only place WayForPay shows what was bought. */
export function openDayLines(pass, practices) {
  if (pass === "full") return [{ name: "Open Day, Full pass, 03.10 і 04.10", price: 1800, count: 1 }];
  if (pass === "grunt") return [{ name: "Open Day, Ґрунт, субота 03.10", price: 600, count: 1 }];
  if (pass === "sprouts") return [{ name: "Open Day, Паростки, неділя 04.10", price: 1400, count: 1 }];
  if (pass !== "one") return [];
  const lines = [];
  for (const id of practices || []) {
    const name = PRACTICE_LINES.get(id);
    if (name && !lines.some((line) => line.name === name)) lines.push({ name, price: 400, count: 1 });
  }
  return lines.length <= 6 ? lines : [];
}

export function openDayAmount(pass, practices) {
  return openDayLines(pass, practices).reduce((sum, line) => sum + line.price * line.count, 0);
}

export function signupIdFromOrder(orderReference) {
  const value = wayforpayField(orderReference);
  if (!value.startsWith("od-")) return "";
  const id = value.slice(3);
  return SIGNUP_ID.test(id) ? id : "";
}

export function purchaseSignatureString(fields) {
  return [
    fields.merchantAccount,
    fields.merchantDomainName,
    fields.orderReference,
    String(fields.orderDate),
    String(fields.amount),
    "UAH",
    ...fields.productName,
    ...fields.productCount.map(String),
    ...fields.productPrice.map(String),
  ].join(";");
}

export function openDayPurchase({
  merchantAccount,
  merchantDomainName,
  secret,
  orderReference,
  orderDate,
  pass,
  practices,
  returnUrl,
  serviceUrl,
  phone,
  firstName,
}) {
  const lines = openDayLines(pass, practices);
  const amount = lines.reduce((sum, line) => sum + line.price * line.count, 0);
  if (!amount) return null;
  const productName = lines.map((line) => line.name);
  const productCount = lines.map((line) => line.count);
  const productPrice = lines.map((line) => line.price);
  const params = new URLSearchParams();
  params.set("merchantAccount", merchantAccount);
  params.set("merchantDomainName", merchantDomainName);
  params.set("merchantTransactionType", "AUTO");
  params.set("merchantSignature", hmacMd5(purchaseSignatureString({
    merchantAccount,
    merchantDomainName,
    orderReference,
    orderDate,
    amount,
    productName,
    productCount,
    productPrice,
  }), secret));
  params.set("orderReference", orderReference);
  params.set("orderDate", String(orderDate));
  params.set("amount", String(amount));
  params.set("currency", "UAH");
  params.set("language", "UA");
  productName.forEach((name) => params.append("productName[]", name));
  productCount.forEach((count) => params.append("productCount[]", String(count)));
  productPrice.forEach((price) => params.append("productPrice[]", String(price)));
  if (returnUrl) params.set("returnUrl", returnUrl);
  if (serviceUrl) params.set("serviceUrl", serviceUrl);
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length >= 9 && digits.length <= 13) params.set("clientPhone", digits);
  const name = String(firstName || "").trim().split(/\s+/)[0]?.slice(0, 50) || "";
  if (name) params.set("clientFirstName", name);
  return params;
}

export function passForAmount(amount) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return "";
  return PASS_KOPECKS.get(Math.round(number * 100)) || "";
}

export function pickSignup(rows, phone, amount) {
  const key = phoneKey(phone);
  if (!key) return null;
  const samePhone = (rows || []).filter((row) => phoneKey(row.phone) === key);
  if (!samePhone.length) return null;
  const pass = passForAmount(amount);
  const samePass = pass ? samePhone.filter((row) => row.pass === pass) : [];
  const pool = samePass.length ? samePass : samePhone;
  const unpaid = pool.filter((row) => !row.paid_at);
  const list = unpaid.length ? unpaid : pool;
  return [...list].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0] || null;
}

export async function handleWayforpayNotification(body, { secret, merchantAccount, now, save }) {
  if (!secret || !merchantAccount) return { statusCode: 503, payload: { ok: false } };
  if (!verifyServiceSignature(body, secret)) return { statusCode: 400, payload: { ok: false } };
  if (wayforpayField(body.merchantAccount) !== merchantAccount) return { statusCode: 400, payload: { ok: false } };
  const orderReference = wayforpayField(body.orderReference).trim();
  if (!orderReference) return { statusCode: 400, payload: { ok: false } };
  if (save) await save(body);
  const time = now ? now() : Math.floor(Date.now() / 1000);
  return { statusCode: 200, payload: acceptPayload(orderReference, secret, time) };
}
