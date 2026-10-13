import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const landing = readFileSync(new URL("./open-day/landing.html", import.meta.url), "utf8");
const form = readFileSync(new URL("./open-day/form.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("./open-day/styles.css", import.meta.url), "utf8");
const home = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const homeStyles = readFileSync(new URL("./assets/css/styles.css", import.meta.url), "utf8");
const pay = readFileSync(new URL("./wayforpay.js", import.meta.url), "utf8");
const adminEvents = readFileSync(new URL("./assets/js/admin-events.js", import.meta.url), "utf8");

describe("Ґрунт contemporary dance", () => {
  it("ends at 16:45", () => {
    for (const source of [landing, form, pay, adminEvents]) {
      assert.match(source, /15:15–16:45[ ·,]*Сучасний танець/);
      assert.equal(source.includes("17:45"), false);
    }
  });
});

describe("open day landing instagram", () => {
  it("places the same instagram card at the top under the poster", () => {
    const below = landing.indexOf('<div class="below">');
    const details = landing.indexOf('id="details"');
    const link = landing.indexOf(
      '<a class="place" href="https://www.instagram.com/mozok.tilo.ruh/" target="_blank" rel="noopener noreferrer">',
    );
    assert.ok(below > -1 && details > below);
    assert.ok(link > below && link < details, "instagram card sits after the poster and before the program");
    const block = landing.slice(link, details);
    assert.match(block, /<span>інстаграм<\/span>/);
    assert.match(block, /<strong>@mozok\.tilo\.ruh<\/strong>/);
    assert.equal(landing.includes("Дізнайтесь більше"), false);
    assert.match(styles, /a\.place\s*\{[^}]*display:\s*block/);
    assert.match(styles, /a\.place\s*\{[^}]*text-decoration:\s*none/);
  });

  it("does not invite to open day from the homepage", () => {
    assert.equal(home.includes("od-postcard"), false);
    assert.equal(home.includes("od-card"), false);
    assert.equal(home.includes("/open-day/"), false);
    assert.equal(homeStyles.includes(".od-postcard"), false);
    assert.equal(homeStyles.includes(".od-card"), false);
    assert.equal(homeStyles.includes("PolyglOTT"), false);
  });
});
