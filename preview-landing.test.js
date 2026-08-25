import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

test("preview landing exposes per-section keep/change toggles", () => {
  const html = readFileSync(join(root, "preview.html"), "utf8");
  assert.match(html, /id="previewDock"/);
  assert.match(html, /data-feature="nav"/);
  assert.match(html, /data-feature="hero"/);
  assert.match(html, /data-feature="calendar"/);
  assert.match(html, /data-feature="footer"/);
  assert.match(html, /data-feature="modal"/);
  assert.match(html, /data-feature="sticky"/);
  assert.match(html, /id="previewAllOff"/);
  assert.match(html, /id="previewAllOn"/);
  assert.doesNotMatch(html, /<meta name="robots" content="noindex, nofollow" \/>\s*<meta name="robots"/);
});

test("production index is unchanged by preview sandbox", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.doesNotMatch(html, /preview-dock/);
  assert.doesNotMatch(html, /assets\/css\/preview\.css/);
});
