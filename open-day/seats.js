import { openDayTicketLine, openDayTicketShort } from "../open-day-seats.js?r=3";

function paint(seats) {
  const grunt = document.querySelector('[data-seat="grunt"]');
  const sprouts = document.querySelector('[data-seat="sprouts"]');
  const cap = document.getElementById("prices") ? undefined : seats.limit;
  if (grunt) grunt.textContent = openDayTicketLine("Ґрунт", seats.grunt, cap);
  if (sprouts) sprouts.textContent = openDayTicketLine("Паростки", seats.sprouts, cap);

  document.querySelectorAll("[data-days]").forEach((label) => {
    const days = label.dataset.days.split(/\s+/).filter(Boolean);
    const blocked = (label.dataset.needs || "all") === "any"
      ? days.every((day) => seats[day] < 1)
      : days.some((day) => seats[day] < 1);
    const input = label.querySelector('input[name="pass"]');
    label.classList.toggle("is-sold", blocked);
    if (input) {
      input.disabled = blocked;
      if (blocked) input.checked = false;
    }
    const left = label.querySelector("[data-seat-left]");
    if (!left || days.length !== 1) {
      if (left && blocked) left.textContent = "не лишилося";
      return;
    }
    left.textContent = openDayTicketShort(seats[days[0]], seats.limit);
  });

  document.querySelectorAll("[data-day]").forEach((label) => {
    const blocked = seats[label.dataset.day] < 1;
    const input = label.querySelector('input[name="practice"]');
    label.classList.toggle("is-sold", blocked);
    if (!input) return;
    input.disabled = blocked;
    if (blocked) input.checked = false;
  });

  document.dispatchEvent(new CustomEvent("open-day-seats"));
}

function whole(value) {
  return Number.isInteger(value) && value >= 0;
}

fetch("/api/open-day/seats", { cache: "no-store" })
  .then((response) => response.json().then((payload) => ({ response, payload })))
  .then(({ response, payload }) => {
    const gruntLeft = Number(payload?.grunt);
    const sproutsLeft = Number(payload?.sprouts);
    const limit = Number(payload?.limit);
    if (!response.ok || payload?.ok === false) return;
    if (!whole(gruntLeft) || !whole(sproutsLeft) || !Number.isInteger(limit) || limit < 1) return;
    paint({ grunt: gruntLeft, sprouts: sproutsLeft, limit });
  })
  .catch(() => {});
