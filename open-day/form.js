const chosen = new URLSearchParams(location.search).get("pass") || "";
if (location.search) history.replaceState(null, "", location.pathname);
const motion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const form = document.getElementById("reg");
const nickRe = /^@?[A-Za-z0-9_]{5,32}$/;
const phoneRe = /^\+?[0-9 ()-]{10,17}$/;
const names = { 1: "Ти", 2: "Звідки", 3: "Формат" };
const passLabel = {
  full: "Full pass · 1800 грн",
  grunt: "Ґрунт · 600 грн",
  sprouts: "Паростки · 1400 грн",
  one: "Одна практика · 400 грн",
};
if (passLabel[chosen]) {
  const input = form.querySelector('input[name="pass"][value="' + chosen + '"]');
  if (input) input.checked = true;
}

const practiceWrap = document.getElementById("practice-wrap");
function syncPractice() {
  if (practiceWrap) practiceWrap.hidden = passValue() !== "one";
}
syncPractice();
form.querySelectorAll('input[name="pass"]').forEach((input) => {
  input.addEventListener("change", syncPractice);
});

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: motion ? "auto" : "smooth", block: "start" });
}

function showStep(n) {
  form.querySelectorAll("[data-step]").forEach((section) => {
    section.hidden = section.dataset.step !== String(n);
  });
  document.getElementById("step-name").textContent = names[n];
  scrollToId("register-body");
}

function revealProblem(step) {
  const scope = form.querySelector('[data-step="' + step + '"]') || form;
  const slot = [...scope.querySelectorAll(".err")].find((el) => el.textContent)
    || [...form.querySelectorAll(".err")].find((el) => el.textContent);
  slot?.scrollIntoView({ block: "nearest", behavior: motion ? "auto" : "smooth" });
}

function setErr(name, message) {
  form.querySelectorAll('[data-for="' + name + '"]').forEach((slot) => {
    slot.textContent = message || "";
  });
}

function passValue() {
  return form.querySelector('input[name="pass"]:checked')?.value || "";
}

function validate(step) {
  let ok = true;
  if (step === 1) {
    const name = form.name.value.trim();
    setErr("name", name ? "" : "Напиши прізвище та імʼя");
    if (!name) ok = false;
    const nickOk = nickRe.test(form.nick.value.trim());
    setErr("nick", nickOk ? "" : "Перевір нік: лише латиниця, цифри і _");
    if (!nickOk) ok = false;
    const phoneOk = phoneRe.test(form.phone.value.trim());
    setErr("phone", phoneOk ? "" : "Схоже, в номері помилка");
    if (!phoneOk) ok = false;
  }
  if (step === 3) {
    const pass = passValue();
    setErr("pass", pass ? "" : "Обери формат");
    if (!pass) ok = false;
    if (pass === "one") {
      const practice = form.querySelector('input[name="practice"]:checked');
      setErr("practice", practice ? "" : "Обери практику");
      if (!practice) ok = false;
    } else {
      setErr("practice", "");
    }
    const agree = form.agree.checked;
    setErr("agree", agree ? "" : "Потрібна ця згода, щоб забронювати місце");
    if (!agree) ok = false;
  }
  return ok;
}

form.querySelectorAll("[data-next]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const step = Number(btn.closest("[data-step]").dataset.step);
    if (!validate(step)) {
      revealProblem(step);
      return;
    }
    if (step === 1) showStep(2);
    else showStep(3);
  });
});

form.querySelectorAll('input[name="source"]').forEach((input) => {
  input.addEventListener("change", () => {
    document.getElementById("other-wrap").hidden = input.value !== "other" || !input.checked;
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validate(3)) {
    revealProblem(3);
    return;
  }
  const submitBtn = form.querySelector(".submit, [type='submit']");
  submitBtn.disabled = true;
  submitBtn.textContent = "надсилаємо…";
  setErr("submit", "");
  try {
    const response = await fetch("/api/open-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.value.trim(),
        nick: form.nick.value.trim(),
        phone: form.phone.value.trim(),
        pass: passValue(),
        practice: passValue() === "one" ? form.querySelector('input[name="practice"]:checked')?.value || "" : "",
        source: form.querySelector('input[name="source"]:checked')?.value || "",
        other: form.other.value.trim(),
        hope: form.hope.value.trim(),
        agree: true,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || "Не вдалося надіслати. Спробуй ще раз.");
    }
    document.getElementById("register-body").hidden = true;
    document.getElementById("done").hidden = false;
    scrollToId("done");
  } catch (error) {
    setErr("submit", error?.message || "Не вдалося надіслати. Спробуй ще раз.");
    submitBtn.disabled = false;
    submitBtn.textContent = "надіслати";
    revealProblem(3);
  }
});
