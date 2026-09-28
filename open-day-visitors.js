import { createHash, randomUUID } from "node:crypto";
import { DateTime } from "luxon";

/** ponytail: same person if the cookie or local id matches, or the same IP has the same device bundle; IP alone is not a person. */
const BOT_UA = /(bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|outbrain|pinterest|vkshare|w3c_validator|baiduspider|bingpreview|applebot|yandex|petalbot|semrush|ahrefs|mj12bot|dotbot|bytespider|headless)/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID.test(String(value || ""));
}

export function clip(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

export function isBot(ua) {
  const text = clip(ua, 400);
  return !text || BOT_UA.test(text);
}

function bareIp(value) {
  return clip(value, 80).replace(/^::ffff:/i, "");
}

function isPrivateIp(ip) {
  const text = bareIp(ip).toLowerCase();
  if (!text) return true;
  if (text === "::1" || text === "0.0.0.0") return true;
  if (text.startsWith("127.") || text.startsWith("10.") || text.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(text)) return true;
  if (text.startsWith("fc") || text.startsWith("fd") || text.startsWith("fe80:")) return true;
  return false;
}

export function clientIp(headers, socketIp) {
  const head = headers || {};
  const socket = bareIp(socketIp);
  const real = bareIp(head["cf-connecting-ip"] || head["x-real-ip"] || "");
  const forwarded = bareIp(String(head["x-forwarded-for"] || "").split(",")[0]);
  if (isPrivateIp(socket)) return real || forwarded || socket;
  return socket || real || forwarded;
}

export function cookieValue(header, name) {
  const wanted = String(name || "");
  for (const part of String(header || "").split(";")) {
    const text = part.trim();
    const eq = text.indexOf("=");
    if (eq === -1) continue;
    if (text.slice(0, eq) !== wanted) continue;
    try {
      return decodeURIComponent(text.slice(eq + 1));
    } catch {
      return text.slice(eq + 1);
    }
  }
  return "";
}

export function deviceSignals(input) {
  const source = input || {};
  return {
    ua: clip(source.ua, 300),
    chUa: clip(source.chUa, 180),
    chPlatform: clip(source.chPlatform, 60).replace(/^"|"$/g, ""),
    chMobile: clip(source.chMobile, 8),
    chModel: clip(source.chModel, 80),
    lang: clip(source.lang, 40),
    tz: clip(source.tz, 80),
    screen: clip(source.screen, 32),
    dpr: clip(source.dpr, 8),
    cores: clip(source.cores, 4),
    memory: clip(source.memory, 8),
    touch: clip(source.touch, 4),
    platform: clip(source.platform, 40),
    platformVersion: clip(source.platformVersion, 40),
    color: clip(source.color, 4),
  };
}

function hashSignal(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function deviceHash(input) {
  const s = deviceSignals(input);
  return hashSignal(
    ["device", s.ua, s.chUa, s.chPlatform, s.chMobile, s.chModel, s.lang, s.tz, s.screen, s.dpr, s.cores, s.memory, s.touch, s.platform, s.platformVersion, s.color].join("\n"),
  );
}

export function ipHash(ip) {
  return hashSignal(["ip", bareIp(ip)].join("\n"));
}

export function deviceLabel(input) {
  const s = deviceSignals(input);
  const ua = s.ua.toLowerCase();
  const platform = (s.chPlatform || s.platform).toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua) || (/macintosh/.test(ua) && Number(s.touch) > 1)) return "планшет";
  if (platform === "android" && Number(s.touch) > 0 && !/mobile/.test(ua)) return "планшет";
  if (s.chMobile === "?1" || s.chMobile === "1" || /iphone|ipod|windows phone|android.+mobile|mobile/.test(ua)) return "телефон";
  return "компʼютер";
}

export function browserLabel(input) {
  const s = deviceSignals(input);
  const ua = s.ua;
  const ch = s.chUa;
  if (/Edg\//i.test(ua) || /Microsoft Edge/i.test(ch)) return "Edge";
  if (/OPR\/|Opera/i.test(ua + ch)) return "Opera";
  if (/Firefox|FxiOS/i.test(ua + ch)) return "Firefox";
  if (/Chrome|CriOS|Chromium/i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua)) return "Safari";
  return "інший";
}

export function matchVisitor(rows, hit) {
  const list = rows || [];
  const cookie = isUuid(hit?.cookie) ? hit.cookie : "";
  const localId = isUuid(hit?.localId) ? hit.localId : "";
  const hashedIp = hit?.ipHash || (hit?.ip ? ipHash(hit.ip) : "");
  const hashedDevice = hit?.deviceHash || deviceHash(hit || {});
  if (cookie) {
    const found = list.find((row) => row.id === cookie);
    if (found) return found;
  }
  if (localId) {
    const found = list.find((row) => row.local_id === localId);
    if (found) return found;
  }
  if (hashedIp && hashedDevice) {
    return list.find((row) => row.ip_hash === hashedIp && row.device_hash === hashedDevice) || null;
  }
  return null;
}

export function nextVisitor(existing, hit, now) {
  const signals = deviceSignals(hit);
  const localId = isUuid(hit?.localId) ? hit.localId : null;
  return {
    id: existing?.id || (isUuid(hit?.cookie) ? hit.cookie : randomUUID()),
    event_slug: existing?.event_slug || (hit?.page === "home" ? "home" : "open-day"),
    ip_hash: ipHash(hit?.ip),
    device_hash: deviceHash(signals),
    local_id: existing?.local_id || localId,
    hits: (existing?.hits || 0) + 1,
    device_label: deviceLabel(signals),
    browser_label: browserLabel(signals),
    lang: signals.lang || null,
    tz: signals.tz || null,
    first_seen: existing?.first_seen || now,
    last_seen: now,
  };
}

export function rememberVisit(stamps, now, limit = 30, windowMs = 600000) {
  const fresh = (stamps || []).filter((stamp) => now - stamp < windowMs);
  if (fresh.length >= limit) return { ok: false, stamps: fresh };
  fresh.push(now);
  return { ok: true, stamps: fresh };
}

const KYIV = "Europe/Kyiv";

export function eachKyivDay(fromDate, toDate) {
  let cursor = DateTime.fromISO(String(fromDate || ""), { zone: KYIV }).startOf("day");
  const end = DateTime.fromISO(String(toDate || ""), { zone: KYIV }).startOf("day");
  if (!cursor.isValid || !end.isValid || cursor > end) return [];
  const days = [];
  while (cursor <= end) {
    days.push(cursor.toISODate());
    cursor = cursor.plus({ days: 1 });
  }
  return days;
}

/** ponytail: daily bars count views; a person is unique once per page inside the Kyiv range. */
export function summarizePageViews(rows, fromDate, toDate) {
  const days = eachKyivDay(fromDate, toDate);
  const index = new Map(days.map((day, i) => [day, i]));
  const series = { home: days.map(() => 0), "open-day": days.map(() => 0) };
  const views = { home: 0, "open-day": 0 };
  const people = { home: new Set(), "open-day": new Set() };
  for (const row of rows || []) {
    const page = row.page === "home" || row.page === "open-day" ? row.page : "";
    if (!page) continue;
    const seen = DateTime.fromISO(String(row.seen_at || ""), { zone: "utc" }).setZone(KYIV);
    if (!seen.isValid) continue;
    const at = index.get(seen.toISODate());
    if (at === undefined) continue;
    views[page] += 1;
    series[page][at] += 1;
    if (row.visitor_id) people[page].add(row.visitor_id);
  }
  return {
    days,
    home: { views: views.home, visitors: people.home.size },
    openDay: { views: views["open-day"], visitors: people["open-day"].size },
    series,
  };
}
