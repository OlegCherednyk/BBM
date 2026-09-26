import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const landing = readFileSync(new URL("./open-day/landing.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("./open-day/styles.css", import.meta.url), "utf8");

describe("open day landing instagram", () => {
  it("places the studio instagram card after the address and before prices", () => {
    const place = landing.indexOf("Позняки, Мішуги 10");
    const prices = landing.indexOf('id="prices"');
    const link = landing.indexOf(
      '<a class="place" href="https://www.instagram.com/mozok.tilo.ruh/" target="_blank" rel="noopener noreferrer">',
    );
    assert.ok(place > -1 && prices > place);
    assert.ok(link > place && link < prices, "instagram card sits between the address and prices");
    const block = landing.slice(link, prices);
    assert.match(block, /<span>інстаграм<\/span>/);
    assert.match(block, /<strong>@mozok\.tilo\.ruh<\/strong>/);
    assert.match(styles, /a\.place\s*\{[^}]*display:\s*block/);
    assert.match(styles, /a\.place\s*\{[^}]*text-decoration:\s*none/);
  });
});
