const params = new URLSearchParams(location.search);
const variant = ["1", "2", "3"].includes(params.get("v")) ? params.get("v") : "3";
document.body.dataset.v = variant;

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (params.get("settle") === "1" || reduce) document.body.classList.add("settled");
else setTimeout(() => document.body.classList.add("settled"), 7000);

window.addEventListener("scroll", () => {
  if (window.scrollY > 12) document.body.classList.add("settled");
}, { passive: true });

document.querySelectorAll('a[href="form.html"]').forEach((a) => {
  a.href = "form.html?v=" + variant;
});

const grunt = `
  <p class="when">03.10, субота</p>
  <h2>ҐРУНТ</h2>
  <p>Практики, які вже не перший рік дієво змінюють стан наших учениць і прокачують звʼязок із тілом. Рівень підготовки не має значення: рухаєшся у власному темпі, з увагою педагогині. А на виході маєш тишу в голові й легкість після напруженого дня.</p>
  <ul class="slots">
    <li><strong>14:00–15:00 · Тренаж</strong><span>Комплекс вправ на мобільність і функціональність мʼязів.</span></li>
    <li><strong>15:15–17:45 · Сучасний танець</strong><span>Опановуємо принципи руху, напрацьовуємо техніку, розвиваємо витривалість тіла і гнучкість мислення.</span></li>
  </ul>
  <p>Приходь, якщо ще жодного разу в нас не був_ла!</p>
`;

const sprouts = `
  <p class="when">04.10, неділя</p>
  <h2>ПАРОСТКИ</h2>
  <p>Осінь — час оновлень, тож ми запроваджуємо нові напрями. Стань першою_им, хто їх затестить: твій вибір вплине на розклад нового сезону. А ще це чудова нагода повернутися до практик після паузи.</p>
  <ul class="slots">
    <li><strong>12:00–13:00 · Рух як гра</strong></li>
    <li><strong>13:10–14:10 · Контактна практика</strong></li>
    <li><strong>15:00–16:00 · Dance and health</strong></li>
    <li><strong>16:10–17:10 · Стретчинг</strong></li>
  </ul>
  <p>Нічого не пояснюємо, бо хочемо, щоб ти відчув_ла все сам_а. Приходь, якщо маєш жагу рухатись і досліджувати.</p>
`;

const prices = `
  <h2>ВАРТІСТЬ</h2>
  <ul>
    <li><span>Full pass, 03.10 «ґрунт» + 04.10 «паростки»</span><b>1800 грн</b></li>
    <li><span>03.10 «Ґрунт»</span><b>600 грн</b></li>
    <li><span>04.10 «Паростки»</span><b>1400 грн</b></li>
    <li><span>Одна практика в будь-який день</span><b>400 грн</b></li>
  </ul>
  <p class="fine">Подія передбачає 12 місць. Місце бронюється лише після оплати, а оплата проходить у чаті події в Telegram.</p>
  <a class="go" href="form.html?v=${variant}">Записатись</a>
`;

const story = document.getElementById("story");
story.innerHTML = `
  <div class="sign">
    <img class="sign-mark" src="assets/logo.png" alt="" />
    <p class="kicker">3–4 жовтня · Позняки · Мішуги 10</p>
    <div class="grass" aria-hidden="true"></div>
    <article class="day">${grunt}</article>
    <div class="grass" aria-hidden="true"></div>
    <article class="day">${sprouts}</article>
    <section class="prices">${prices}</section>
  </div>
`;

document.getElementById("day-grunt").innerHTML = `<article class="day">${grunt}</article>`;
document.getElementById("day-sprouts").innerHTML = `<article class="day">${sprouts}</article>`;
document.getElementById("prices-v2").innerHTML = prices;

document.querySelectorAll(".cluster").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (document.body.dataset.v !== "2") return;
    const id = "day-" + btn.dataset.day;
    const panel = document.getElementById(id);
    const open = panel.hasAttribute("hidden");
    document.querySelectorAll(".day-panels > article").forEach((el) => el.setAttribute("hidden", ""));
    document.querySelectorAll(".cluster").forEach((el) => el.classList.remove("is-on"));
    if (open) {
      panel.removeAttribute("hidden");
      btn.classList.add("is-on");
      panel.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  });
});

document.getElementById("details").addEventListener("click", () => {
  const open = story.classList.toggle("is-open");
  document.getElementById("details").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) story.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
});
