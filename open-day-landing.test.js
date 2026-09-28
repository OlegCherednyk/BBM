import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const landing = readFileSync(new URL("./open-day/landing.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("./open-day/styles.css", import.meta.url), "utf8");
const home = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const homeStyles = readFileSync(new URL("./assets/css/styles.css", import.meta.url), "utf8");

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

  it("links the main header to open day in the poster type", () => {
    const header = home.slice(home.indexOf('id="nav"'), home.indexOf('id="mobileNav"'));
    const ig = header.indexOf('class="nav__ig"');
    const day = header.indexOf('class="nav__open-day"');
    const burger = header.indexOf('id="navHamburger"');
    assert.ok(ig > -1 && ig < day && day < burger, "open day stamp sits at the right edge, after instagram");
    assert.match(header, /class="nav__open-day" href="\/open-day\/landing\.html"/);
    assert.match(homeStyles, /\.nav__end\s*\{[^}]*margin-left:\s*auto/);
    assert.equal(/\.nav__open-day\s*\{[^}]*left:\s*50%/.test(homeStyles), false);
    assert.match(header, /OPEN DAY/);
    assert.match(header, /03\.10/);
    assert.match(header, /04\.10/);
    assert.match(homeStyles, /font-family:\s*"PolyglOTT"/);
    assert.match(homeStyles, /url\("\/open-day\/assets\/moss\.jpg"\)/);
    assert.match(home, /class="mobile-nav__open-day" href="\/open-day\/landing\.html"/);
  });
});
