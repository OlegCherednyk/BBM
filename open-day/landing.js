if (location.search) history.replaceState(null, "", location.pathname);

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

function reveal() {
  if (reduce || location.hash) {
    document.body.classList.add("settled");
    return;
  }
  document.body.classList.add("play");
  setTimeout(() => document.body.classList.add("settled"), 2600);
}

const fontReady = document.fonts
  ? document.fonts.load('86px "PolyglOTT"').catch(() => {})
  : Promise.resolve();
const fontCap = new Promise((resolve) => setTimeout(resolve, 12000));
Promise.race([fontReady, fontCap]).then(reveal);

window.addEventListener("scroll", () => {
  if (window.scrollY > 8) document.body.classList.add("settled");
}, { passive: true });
