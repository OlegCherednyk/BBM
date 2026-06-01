(function initHeroParallax() {
  const hero = document.getElementById("hero");
  const img = document.getElementById("heroBgImg");
  if (!hero || !img) return;

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (motion.matches) return;

  const PARALLAX = 0.38;
  let ticking = false;
  let inView = true;

  function clearParallax() {
    img.style.removeProperty("--hero-parallax-y");
  }

  function update() {
    ticking = false;
    if (!inView) return;

    const scrollY = window.scrollY;
    const heroBottom = hero.offsetTop + hero.offsetHeight;
    if (scrollY > heroBottom) {
      clearParallax();
      return;
    }

    img.style.setProperty("--hero-parallax-y", `${scrollY * PARALLAX}px`);
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      if (inView) update();
      else clearParallax();
    },
    { rootMargin: "20% 0px" }
  );
  observer.observe(hero);

  motion.addEventListener("change", (e) => {
    if (e.matches) {
      clearParallax();
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    }
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  update();
})();
