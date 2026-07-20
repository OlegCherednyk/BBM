import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { Resvg } from "@resvg/resvg-js";
import {
  DIGEST_FONT_FAMILY,
  getDigestFontFiles,
  getDigestResvgFontOptions,
} from "./digest-png-fonts.js";

describe("getDigestFontFiles", () => {
  it("returns Regular and Bold DejaVu paths that exist", () => {
    const files = getDigestFontFiles();
    assert.equal(files.length, 2);
    for (const file of files) {
      assert.ok(fs.existsSync(file), `missing ${file}`);
      assert.ok(file.includes("DejaVuSans"));
    }
  });
});

describe("getDigestResvgFontOptions", () => {
  it("points Resvg at bundled DejaVu", () => {
    const opts = getDigestResvgFontOptions();
    assert.equal(opts.defaultFontFamily, DIGEST_FONT_FAMILY);
    assert.equal(opts.loadSystemFonts, true);
    assert.ok(opts.fontFiles.length >= 2);
  });

  it("renders Cyrillic without system fonts (regression for blank digest text)", () => {
    const opts = getDigestResvgFontOptions();
    const svg = `<svg width="400" height="80" xmlns="http://www.w3.org/2000/svg" font-family="${DIGEST_FONT_FAMILY}">
  <rect width="400" height="80" fill="#111827"/>
  <text x="16" y="50" fill="#ffffff" font-size="28" font-weight="700">Тижневий</text>
</svg>`;
    const png = Buffer.from(
      new Resvg(svg, {
        fitTo: { mode: "width", value: 400 },
        font: { ...opts, loadSystemFonts: false },
      })
        .render()
        .asPng(),
    );
    // Empty text (no glyphs) yields a tiny nearly-solid PNG; with glyphs it is much larger.
    assert.ok(png.length > 1500, `expected textured PNG, got ${png.length} bytes`);
    assert.equal(png[0], 0x89);
    assert.equal(png[1], 0x50);
  });
});
