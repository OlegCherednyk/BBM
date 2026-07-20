import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Bundled font with Cyrillic — Inter/Arial often missing on servers → blank PNG text. */
export const DIGEST_FONT_FAMILY = "DejaVu Sans";

const FONT_DIR = path.join(__dirname, "assets", "fonts");

/**
 * Absolute paths to bundled digest fonts (Regular + Bold).
 * @returns {string[]}
 */
export function getDigestFontFiles() {
  return [
    path.join(FONT_DIR, "DejaVuSans.ttf"),
    path.join(FONT_DIR, "DejaVuSans-Bold.ttf"),
  ].filter((filePath) => fs.existsSync(filePath));
}

/**
 * Resvg font options: always load bundled DejaVu so Cyrillic renders
 * even when the host has no system fonts (common on PaaS images).
 * @returns {{ loadSystemFonts: boolean, fontFiles: string[], defaultFontFamily: string }}
 */
export function getDigestResvgFontOptions() {
  const fontFiles = getDigestFontFiles();
  if (!fontFiles.length) {
    console.warn("[digest-png-fonts] bundled DejaVu fonts missing under assets/fonts");
  }
  return {
    loadSystemFonts: true,
    fontFiles,
    defaultFontFamily: DIGEST_FONT_FAMILY,
  };
}
