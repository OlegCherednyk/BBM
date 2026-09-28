import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  browserLabel,
  clientIp,
  cookieValue,
  deviceHash,
  deviceLabel,
  isBot,
  matchVisitor,
  nextVisitor,
  rememberVisit,
} from "./open-day-visitors.js";

const phone = {
  ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  chUa: "",
  chPlatform: "iOS",
  chMobile: "?1",
  lang: "uk",
  tz: "Europe/Kyiv",
  screen: "390x844",
  dpr: "3",
  cores: "6",
  memory: "",
  touch: "5",
  platform: "iPhone",
  color: "32",
};

test("skips bots and blank clients", () => {
  assert.equal(isBot(""), true);
  assert.equal(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"), true);
  assert.equal(isBot(phone.ua), false);
});

test("reads the visitor ip from the proxy only when the socket is private", () => {
  assert.equal(clientIp({ "x-forwarded-for": "203.0.113.8, 10.0.0.1" }, "127.0.0.1"), "203.0.113.8");
  assert.equal(clientIp({ "x-forwarded-for": "203.0.113.8" }, "198.51.100.4"), "198.51.100.4");
  assert.equal(clientIp({ "cf-connecting-ip": "203.0.113.9" }, "::ffff:10.1.1.1"), "203.0.113.9");
});

test("reads the visitor cookie", () => {
  assert.equal(cookieValue("a=1; od_vid=abc%3D; b=2", "od_vid"), "abc=");
  assert.equal(cookieValue("", "od_vid"), "");
});

test("same cookie is one visitor even after the ip changes", () => {
  const first = nextVisitor(null, { ...phone, ip: "203.0.113.8", cookie: "11111111-1111-4111-8111-111111111111" }, "t1");
  const again = matchVisitor([first], { ...phone, ip: "198.51.100.9", cookie: first.id, screen: "1920x1080" });
  assert.equal(again.id, first.id);
  assert.equal(nextVisitor(again, { ...phone, ip: "198.51.100.9", cookie: first.id }, "t2").hits, 2);
});

test("same local id is one visitor", () => {
  const localId = "22222222-2222-4222-8222-222222222222";
  const first = nextVisitor(null, { ...phone, ip: "203.0.113.8", localId }, "t1");
  const again = matchVisitor([first], { ...phone, ip: "198.51.100.9", localId, screen: "320x700" });
  assert.equal(again.id, first.id);
});

test("same ip and device bundle is one visitor without a cookie", () => {
  const first = nextVisitor(null, { ...phone, ip: "203.0.113.8" }, "t1");
  const again = matchVisitor([first], { ...phone, ip: "203.0.113.8" });
  assert.equal(again.id, first.id);
});

test("same ip with another device is another visitor", () => {
  const first = nextVisitor(null, { ...phone, ip: "203.0.113.8" }, "t1");
  const desktop = { ...phone, ua: "Mozilla/5.0 (Macintosh) Chrome/120.0.0.0", chMobile: "?0", screen: "1440x900", touch: "0", platform: "MacIntel" };
  assert.equal(matchVisitor([first], { ...desktop, ip: "203.0.113.8" }), null);
});

test("same device on another ip is another visitor without a saved id", () => {
  const first = nextVisitor(null, { ...phone, ip: "203.0.113.8" }, "t1");
  assert.equal(matchVisitor([first], { ...phone, ip: "198.51.100.9" }), null);
});

test("device hash changes when a device signal changes", () => {
  assert.notEqual(deviceHash(phone), deviceHash({ ...phone, tz: "Europe/Warsaw" }));
  assert.equal(deviceHash(phone), deviceHash({ ...phone, ua: "  " + phone.ua + "  " }));
});

test("labels the device and browser", () => {
  assert.equal(deviceLabel(phone), "телефон");
  assert.equal(browserLabel(phone), "Safari");
  assert.equal(deviceLabel({ ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0", chMobile: "?0", touch: "0" }), "компʼютер");
  assert.equal(browserLabel({ ua: "Mozilla/5.0 Chrome/120.0.0.0 Edg/120.0.0.0", chUa: "" }), "Edge");
});

test("caps a noisy ip", () => {
  const now = 1_000_000;
  let stamps = [];
  for (let i = 0; i < 30; i += 1) {
    const step = rememberVisit(stamps, now + i);
    assert.equal(step.ok, true);
    stamps = step.stamps;
  }
  assert.equal(rememberVisit(stamps, now + 31).ok, false);
});

test("landing reports the visit", () => {
  const landing = readFileSync(new URL("./open-day/landing.html", import.meta.url), "utf8");
  assert.match(landing, /src="visit\.js/);
});

test("individual visitors stay folded until asked", () => {
  const admin = readFileSync(new URL("./assets/js/admin-events.js", import.meta.url), "utf8");
  assert.match(admin, /createElement\("details"\)/);
  assert.match(admin, /Показати відвідувачів/);
  assert.match(admin, /Сховати відвідувачів/);
});
