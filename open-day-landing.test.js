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

  it("places an open day lockup under the hero", () => {
    const hero = home.indexOf('id="hero"');
    const card = home.indexOf('class="od-postcard"');
    const spotlight = home.indexOf('id="classes-spotlight"');
    const block = home.slice(card, spotlight);
    assert.ok(hero > -1 && card > hero && card < spotlight);
    assert.equal(home.includes("nav__open-day"), false);
    assert.equal(block.includes("<img"), false);
    assert.match(block, /aria-label="OPEN DAY"/);
    assert.match(block, /03\.10/);
    assert.match(block, /04\.10/);
    assert.match(block, /«ґрунт»/);
    assert.match(block, /«паростки»/);
    assert.match(block, /class="od-card__reg" href="\/open-day\/landing\.html"/);
    assert.match(homeStyles, /font-family:\s*"PolyglOTT"/);
    assert.match(homeStyles, /url\("\/open-day\/assets\/moss\.jpg"\)/);
    assert.match(homeStyles, /\.od-card\s*\{[^}]*border:\s*1px solid #5f6b30/);
    assert.match(homeStyles, /\.od-card\s*\{[^}]*outline-offset:\s*7px/);
    assert.match(homeStyles, /\.od-card__word\s*\{[^}]*font-size:\s*clamp\(60px,\s*15vw,\s*180px\)/);
  });
});
