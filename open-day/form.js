const params = new URLSearchParams(location.search);
const variant = ["1", "2", "3"].includes(params.get("v")) ? params.get("v") : "3";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
document.getElementById("back").href = "landing.html?v=" + variant;

const form = document.getElementById("reg");
const nickRe = /^@?[A-Za-z0-9_]{5,32}$/;
const phoneRe = /^\+?[0-9 ()-]{10,17}$/;
const names = { 1: "Ти", 2: "Обери практику", 3: "Майже все" };

function showStep(n) {
  form.querySelectorAll("[data-step]").forEach((section) => {
    section.hidden = section.dataset.step !== String(n);
  });
  document.getElementById("step-name").textContent = names[n];
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
}

function revealProblem() {
  const slot = [...form.querySelectorAll(".err")].find((el) => el.textContent && !el.closest("[hidden]"));
  slot?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
}

function setErr(name, message) {
  const slot = form.querySelector('[data-for="' + name + '"]');
  if (slot) slot.textContent = message || "";
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
    const pass = passValue();
    setErr("pass", pass ? "" : "Обери формат");
    if (!pass) ok = false;
  }
  if (step === 2) {
    const practice = form.querySelector('input[name="practice"]:checked');
    setErr("practice", practice ? "" : "Обери практику");
    if (!practice) ok = false;
  }
  if (step === 3) {
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
      revealProblem();
      return;
    }
    if (step === 1) showStep(passValue() === "one" ? 2 : 3);
    else showStep(3);
  });
});

form.querySelectorAll('input[name="source"]').forEach((input) => {
  input.addEventListener("change", () => {
    document.getElementById("other-wrap").hidden = input.value !== "other" || !input.checked;
  });
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validate(3)) {
    revealProblem();
    return;
  }
  if (passValue() === "one" && !validate(2)) {
    showStep(2);
    revealProblem();
    return;
  }
  form.hidden = true;
  document.getElementById("done").hidden = false;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
});
