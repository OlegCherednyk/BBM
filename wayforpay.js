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
