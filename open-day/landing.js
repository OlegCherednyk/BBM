if (location.search) history.replaceState(null, "", location.pathname);

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduce || location.hash) document.body.classList.add("settled");
else setTimeout(() => document.body.classList.add("settled"), 2600);

window.addEventListener("scroll", () => {
  if (window.scrollY > 8) document.body.classList.add("settled");
}, { passive: true });
