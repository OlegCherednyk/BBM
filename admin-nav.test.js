import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const nav = readFileSync(new URL("./assets/js/admin-nav.js", import.meta.url), "utf8");
const adminJs = readFileSync(new URL("./assets/js/admin.js", import.meta.url), "utf8");
const prices = readFileSync(new URL("./admin/prices.html", import.meta.url), "utf8");

describe("grouped admin nav", () => {
  it("keeps the grouped bar and does not delay the click", () => {
    assert.match(nav, /label: "Аналітика"/);
    assert.match(nav, /label: "Розклад"/);
    assert.match(nav, /label: "Люди"/);
    assert.match(nav, /label: "Студія"/);
    assert.match(nav, /buildNav\("bottom"/);
    assert.equal(nav.includes("NAV_DELAY_MS"), false);
    assert.equal(nav.includes("setTimeout"), false);
    assert.match(prices, /id="adminNavGroups"/);
    assert.equal(prices.includes("adminNavJumps"), false);
  });

  it("shows the shell from a cached allowlist check", () => {
    assert.match(adminJs, /mountAdminNav/);
    assert.match(adminJs, /bbm:admin-ok:v1/);
    assert.match(adminJs, /setVisible\(true\)/);
    assert.match(prices, /admin-known/);
  });
});
