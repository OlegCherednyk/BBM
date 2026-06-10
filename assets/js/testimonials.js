const TESTIMONIALS = [
  { name: "Аня", age: 25, role: "фотограф", text: "Такий вид практик обрала через зажими в тілі, болі в спині, сидячу роботу. Практики допомогли заземлитися — це, напевно, найкраще слово. Заземлення, вивільнення думок, концентрація на тілі та його відчуттях. Це не порівняти ні з залом, ні з танцями. Це більше про рух, дослідження тіла, внутрішні дозволи, імпровізацію, самовираження. Не \"рухатися до відмови\", не силувати себе — а прислуховуватися до себе і давати тілу те, чого воно просить." },
  { name: "Настя", age: 23, role: "розробниця в ІТ", text: "Сподобався індивідуальний, чутливий підхід — усе дуже м'яко, ненав'язливо, але з глибоким сенсом. Не просто виконувати вправи, а відчувати, що саме зараз відбувається всередині. Перед практикою було хвилювання: а чи зможу розслабитись, а чи вийде. Після — легкість і внутрішній спокій, ніби дихати стало простіше. Тут не треба бути професіоналом, щоб відчувати своє тіло. Всі рухи про присутність, а не про форму." },
  { name: "Оксана", age: 25, role: "проджект-менеджерка", text: "Почала помічати, що дуже затискаюсь у тілі, мало розслаблення. Тут якраз акцент на тіло — і дуже ніжно ведуть по практиці на розслаблення. Після занять я ніби знову почала відчувати своє тіло, або себе в тілі. Подобається акцент на відчуття, розслаблення і дихання — а якщо правильно дихати, то і з'являється потрібна енергія. Спільнота асоціюється зі свободою прояву: тут кожна вчиться прислухатись до себе." },
  { name: "Віка", age: 24, role: "освітянка", text: "Мені сподобалось, що я можу дбати про своє тіло без надриву. І дуже подобається відчувати себе танцівницею, коли ми комбінуємо різні елементи, і разом з тим я можу імпровізувати. До практики я часто затиснена, напружена, \"у хмарах\". Після — більше контакту з тілом, заземлення. Тут багато уваги до кожної: ми не заучуємо поставлений порядок рухів, а починаємо з того, щоб відчувати кожну частину тіла. Асоціація — комфорт, легкість, прийняття, обійми й посмішки." },
  { name: "Таня", age: 36, role: "бухгалтерка", text: "До нещодавна думала, що я \"дерев'яна\": погано гнулась, тіло було зжате, я сутулилась. Мені дуже подобаються заняття, бо це місце, де можна сповільнитись, почути себе, відчути себе, дати дозвіл бути учнем, веселитись від того, що не виходить, і радіти тому, що виходить. Це місце, де до себе можна лагідно." },
  { name: "Катя", age: 23, role: "комунікаційниця у громадській організації", text: "Раніше пробувала різні види спорту, але хотілося не просто фізичних вправ, а зв'язку з тілом і простору для творчості. Зараз відчуваю наслідки сидячої роботи — біль у спині, погану поставу — і психологічне виснаження. Сподобався ґрунтовний підхід викладачки, те, що під практиками є теоретична база. Після практики відчувала менше напруги і більше розслаблення. З перших вражень спільнота — це відкритість, прийняття, професійність." },
  { name: "Вікторія", age: 24, role: "майбутня психологиня", text: "Думаю, що не можу відпустити контроль — виходить постійна напруга в тілі. Під час практики сподобались самі вправи і акцент на відчуття в тілі. До практики в мене був поганий настрій, а після я взагалі про це забула: легкість, ніби тіло саме хотіло рухатися. Тут не просто механічне виконання вправ, а глибоке заглиблення в тіло. Ваша спільнота асоціюється з підходом, який може стати трендом: коли люди займаються не заради результату, а для себе, з любові до власного тіла." },
  { name: "Марина", age: 27, role: "тренерка з плавання", text: "Сподобалось, що викладачка дуже уважна — дійсно знає свою справу, і видно, що зацікавлена. Стан до практики був нормальний, але тіло трохи втомлене, а після — тіло розслабилось, і додому я йшла вже більш наповнена. Спільнота асоціюється з тим, що все спокійно, затишно, як у своїй тарілці, без тиску — це підштовхує, і ти можеш розслабитись. Рада, що потрапила на вас." },
  { name: "Богдана", age: 24, role: "продюсерка, акторка", text: "Відчувалася \"застояність\" в тілі. Після практики я відчула відновлення контакту з тілом і прилив енергії. Сподобалась увага до деталей у процесі і помірний темп, без поспіху. Радила б — особливо тим, хто має досвід акторських тілесних практик, бо я не знаю жодного іншого місця, де можна було б отримати схожий досвід на цей момент у Києві." },
  { name: "Поліна", age: 28, role: "копірайтерка і перекладачка", text: "До практики було тривожно, багато думок в одну купу. Після — фокус змістився в тіло, зменшилась тривожність, наче легше дихати. Сподобалась взаємодія з партнером, імпровізація. Мозок-тіло-рух — у вас гарно підібрана назва, це саме воно: увага до тіла і перезавантаження." },
];

function renderTestimonialCard(item, index, total) {
  const article = document.createElement("article");
  article.className = "testimonial-card" + (index === 0 ? " testimonial-card--active" : "");
  article.setAttribute("role", "listitem");
  article.setAttribute("aria-roledescription", "slide");
  article.setAttribute("aria-label", `${index + 1} з ${total}`);
  if (index !== 0) article.setAttribute("hidden", "");

  const initial = item.name.charAt(0);
  article.innerHTML = `
    <div class="testimonial-card__inner">
      <p class="testimonial-card__text">«${item.text}»</p>
      <footer class="testimonial-card__author">
        <span class="testimonial-card__avatar" aria-hidden="true">${initial}</span>
        <span class="testimonial-card__meta">
          <span class="testimonial-card__name">${item.name}</span>
          <span class="testimonial-card__role">${item.age} · ${item.role}</span>
        </span>
      </footer>
    </div>
  `;
  return article;
}

function initTestimonials() {
  const track = document.getElementById("testimonialsTrack");
  const viewport = document.getElementById("testimonialsViewport");
  if (!track || !viewport) return;

  const prevBtn = document.getElementById("testimonialsPrev");
  const nextBtn = document.getElementById("testimonialsNext");
  const dotsEl = document.getElementById("testimonialsDots");
  const currentEl = document.getElementById("testimonialsCurrent");
  const totalEl = document.getElementById("testimonialsTotal");
  const progressEl = document.getElementById("testimonialsProgress");
  const swipeHint = document.getElementById("testimonialsSwipeHint");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  track.innerHTML = "";
  TESTIMONIALS.forEach((item, i) => {
    track.appendChild(renderTestimonialCard(item, i, TESTIMONIALS.length));
  });

  const cards = Array.from(track.querySelectorAll(".testimonial-card"));
  const total = cards.length;
  let active = 0;
  let animating = false;
  let autoTimer = null;
  const INTERVAL_MS = 7000;
  const PHASE_MS = 520;
  const SWIPE_PX = 48;

  if (totalEl) totalEl.textContent = String(total);

  function syncHeight() {
    const el = cards[active];
    if (el) track.style.minHeight = `${el.offsetHeight}px`;
  }

  function updateUi() {
    if (currentEl) currentEl.textContent = String(active + 1);
    if (progressEl) progressEl.style.width = `${((active + 1) / total) * 100}%`;
    dotsEl?.querySelectorAll(".testimonials__dot").forEach((dot, i) => {
      const on = i === active;
      dot.classList.toggle("testimonials__dot--active", on);
      dot.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function buildDots() {
    if (!dotsEl) return;
    dotsEl.innerHTML = "";
    cards.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "testimonials__dot" + (i === 0 ? " testimonials__dot--active" : "");
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-label", `Відгук ${i + 1}`);
      dot.setAttribute("aria-selected", i === 0 ? "true" : "false");
      dot.addEventListener("click", () => goTo(i));
      dotsEl.appendChild(dot);
    });
  }

  function resetAuto() {
    if (autoTimer) clearInterval(autoTimer);
    if (!prefersReducedMotion) {
      autoTimer = setInterval(() => goTo((active + 1) % total, 1), INTERVAL_MS);
    }
  }

  function goTo(idx, direction = null) {
    if (animating || idx === active || idx < 0 || idx >= total) return;
    const dir = direction ?? (idx > active ? 1 : -1);
    const cur = cards[active];
    const next = cards[idx];
    animating = true;
    resetAuto();

    cur.classList.remove("testimonial-card--active");
    cur.classList.add(dir > 0 ? "is-leaving-left" : "is-leaving-right");
    cur.removeAttribute("hidden");

    next.classList.remove("testimonial-card--active", "is-leaving-left", "is-leaving-right", "is-entering-left", "is-entering-right");
    next.classList.add(dir > 0 ? "is-entering-right" : "is-entering-left");
    next.removeAttribute("hidden");

    if (!prefersReducedMotion) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          next.classList.remove("is-entering-right", "is-entering-left");
          next.classList.add("testimonial-card--active");
        });
      });
    } else {
      next.classList.remove("is-entering-right", "is-entering-left");
      next.classList.add("testimonial-card--active");
    }

    setTimeout(() => {
      cur.classList.remove("is-leaving-left", "is-leaving-right");
      cur.setAttribute("hidden", "");
      active = idx;
      updateUi();
      syncHeight();
      setTimeout(() => { animating = false; }, 40);
    }, prefersReducedMotion ? 120 : PHASE_MS);
  }

  function step(delta) {
    goTo((active + delta + total) % total, delta);
  }

  buildDots();
  updateUi();
  syncHeight();
  resetAuto();
  window.addEventListener("resize", syncHeight);
  document.fonts?.ready?.then(syncHeight);

  prevBtn?.addEventListener("click", () => step(-1));
  nextBtn?.addEventListener("click", () => step(1));

  let startX = 0;
  let startY = 0;
  let touching = false;

  function hideHint() {
    if (swipeHint) swipeHint.style.display = "none";
  }

  viewport.addEventListener("touchstart", (e) => {
    if (!e.touches.length) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    touching = true;
    viewport.classList.add("is-dragging");
  }, { passive: true });

  viewport.addEventListener("touchmove", (e) => {
    if (!touching || !e.touches.length) return;
    const dx = Math.abs(e.touches[0].clientX - startX);
    const dy = Math.abs(e.touches[0].clientY - startY);
    if (dx > dy && dx > 12) hideHint();
  }, { passive: true });

  viewport.addEventListener("touchend", (e) => {
    if (!touching) return;
    touching = false;
    viewport.classList.remove("is-dragging");
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    hideHint();
    step(dx < 0 ? 1 : -1);
  }, { passive: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTestimonials);
} else {
  initTestimonials();
}
