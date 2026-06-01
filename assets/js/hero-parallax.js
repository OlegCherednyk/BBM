(function initHeroParallax() {
  const hero = document.getElementById("hero");
  const img = document.getElementById("heroBgImg");
  const heroScroll = hero?.querySelector(".hero__scroll");
  if (!hero || !img) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let ticking = false;

  function update() {
    ticking = false;
    const scrollY = window.scrollY;
    const heroHeight = hero.offsetHeight;

    if (scrollY <= heroHeight * 1.5) {
      // Photo slides down on screen as user scrolls (k > 1 = visible descent)
      img.style.transform = `translate3d(0, ${scrollY * 1.35}px, 0)`;
    }

    if (heroScroll) {
      const progress = Math.min(scrollY / (heroHeight * 0.4), 1);
      heroScroll.style.opacity = progress > 0.05 ? String(1 - progress) : "";
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();
})();
