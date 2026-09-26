import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const landing = readFileSync(new URL("./open-day/landing.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("./open-day/styles.css", import.meta.url), "utf8");

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
});
