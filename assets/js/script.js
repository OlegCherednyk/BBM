/* ── NAV SCROLL ── */
const nav = document.getElementById("nav");
window.addEventListener("scroll", () => {
  nav.classList.toggle("scrolled", window.scrollY > 50);
}, { passive: true });

/* ── ROTATING HERO WORDS ── */
const words = ["подорож", "відчуття", "свідомість", "вільний рух", "відкриття"];
let wordIdx = 0;
const rotating = document.getElementById("rotatingWord");

function nextWord() {
  rotating.style.animation = "none";
  rotating.offsetHeight; // reflow
  rotating.style.animation = "";
  wordIdx = (wordIdx + 1) % words.length;
  rotating.textContent = words[wordIdx];
}
setInterval(nextWord, 2600);

/* ── SCROLL REVEAL ── */
const revealEls = document.querySelectorAll(".reveal");
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        observer.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12 }
);
revealEls.forEach((el) => observer.observe(el));

/* ── QUOTES SLIDER ── */
const quotes = document.querySelectorAll(".quote");
const dots   = document.querySelectorAll(".dot");
let activeQuote = 0;

function goToQuote(idx) {
  quotes[activeQuote].classList.remove("quote--active");
  dots[activeQuote].classList.remove("dot--active");
  activeQuote = idx;
  quotes[activeQuote].classList.add("quote--active");
  dots[activeQuote].classList.add("dot--active");
}

dots.forEach((dot, i) => dot.addEventListener("click", () => goToQuote(i)));
setInterval(() => goToQuote((activeQuote + 1) % quotes.length), 4500);

/* ── CARD CTA (direction detail) ── */
const cardCtaBtns = document.querySelectorAll(".card__cta");
const directionDetails = {
  "Турбота про тіло":
    "Заняття поєднують вправи на гнучкість, силу і самомасаж. Підходить абсолютно будь-кому. Ти дізнаєшся, як тіло реагує на рух — і це змінює все.",
  "Сучасний танець":
    "Контемп, вільна пластика, контактна імпровізація. Ми вивчаємо типи руху, а не стилі. З кожним заняттям відкриваєш у тілі щось нове.",
  Хорео:
    "Щоразу різний педагог, різна хореографія, різна якість руху. Для тих, хто вже рухається і хоче йти далі меж стилю.",
};

cardCtaBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const dir = btn.dataset.direction;
    const card = btn.closest(".card");
    const existing = card.querySelector(".card__detail");

    if (existing) {
      existing.remove();
      btn.textContent = "Дізнатись більше →";
    } else {
      const detail = document.createElement("p");
      detail.className = "card__detail";
      detail.style.cssText =
        "font-size:.87rem;line-height:1.65;margin-top:6px;opacity:0;transition:opacity .3s ease;";
      detail.textContent = directionDetails[dir] || "";
      btn.insertAdjacentElement("beforebegin", detail);
      requestAnimationFrame(() => requestAnimationFrame(() => (detail.style.opacity = "1")));
      btn.textContent = "Сховати ↑";
    }
  });
});

/* ── MODAL ── */
const modal      = document.getElementById("signupModal");
const backdrop   = document.getElementById("modalBackdrop");
const closeBtnEl = document.getElementById("closeModal");
const openBtns   = [
  document.getElementById("openModal"),
  document.getElementById("openModal2"),
];
const form        = document.getElementById("signupForm");
const formSuccess = document.getElementById("formSuccess");

function openModal() {
  modal.showModal ? modal.showModal() : (modal.open = true);
  backdrop.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.close ? modal.close() : (modal.open = false);
  backdrop.classList.remove("active");
  document.body.style.overflow = "";
}

openBtns.forEach((b) => b && b.addEventListener("click", openModal));
closeBtnEl.addEventListener("click", closeModal);
backdrop.addEventListener("click", closeModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal.open) closeModal();
});

/* ── FORM VALIDATION & SUBMIT ── */
function showError(inputId, errorId, msg) {
  const input = document.getElementById(inputId);
  const err   = document.getElementById(errorId);
  input.classList.add("error");
  err.textContent = msg;
  return false;
}
function clearError(inputId, errorId) {
  document.getElementById(inputId).classList.remove("error");
  document.getElementById(errorId).textContent = "";
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  let valid = true;

  clearError("name", "nameError");
  clearError("contact", "contactError");

  const name    = document.getElementById("name").value.trim();
  const contact = document.getElementById("contact").value.trim();

  if (!name) {
    showError("name", "nameError", "Напиши своє ім'я");
    valid = false;
  }
  if (!contact) {
    showError("contact", "contactError", "Вкажи Instagram або телефон");
    valid = false;
  }

  if (!valid) return;

  // Simulate successful submission
  form.hidden = true;
  formSuccess.hidden = false;
  setTimeout(closeModal, 2800);
  setTimeout(() => {
    form.hidden = false;
    formSuccess.hidden = true;
    form.reset();
  }, 3200);
});
