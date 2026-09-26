import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const landing = readFileSync(new URL("./open-day/landing.html", import.meta.url), "utf8");

describe("open day landing instagram", () => {
  it("links to instagram at the top under the poster, before the program", () => {
    const poster = landing.indexOf('id="poster"');
    const below = landing.indexOf('<div class="below">');
    const details = landing.indexOf('id="details"');
    const link = landing.indexOf(
      '<a href="https://www.instagram.com/mozok.tilo.ruh/" target="_blank" rel="noopener noreferrer">Дізнайтесь більше про мозок.тіло.рух</a>',
    );
    assert.ok(poster > -1 && below > poster && details > below);
    assert.ok(link > below && link < details, "learn-more link sits after the poster and before the program");
    assert.equal(landing.includes('class="place" href="https://www.instagram.com'), false);
  });
});
