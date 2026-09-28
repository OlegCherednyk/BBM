/** ponytail: a paid person takes one seat per direction they attend; full pass is both days. */
export const OPEN_DAY_SEAT_LIMIT = 12;

export const OPEN_DAY_PRACTICE_DAY = {
  trenazh: "grunt",
  dance: "grunt",
  game: "sprouts",
  contact: "sprouts",
  health: "sprouts",
  stretch: "sprouts",
};

export function openDaySeatUse(pass, practices) {
  if (pass === "full") return { grunt: 1, sprouts: 1 };
  if (pass === "grunt") return { grunt: 1, sprouts: 0 };
  if (pass === "sprouts") return { grunt: 0, sprouts: 1 };
  if (pass !== "one") return { grunt: 0, sprouts: 0 };
  const use = { grunt: 0, sprouts: 0 };
  for (const id of practices || []) {
    const day = OPEN_DAY_PRACTICE_DAY[id];
    if (day) use[day] = 1;
  }
  return use;
}

export function openDaySeatsLeft(signups, limit = OPEN_DAY_SEAT_LIMIT) {
  const taken = { grunt: 0, sprouts: 0 };
  for (const row of signups || []) {
    if (!row?.paid_at) continue;
    const use = openDaySeatUse(row.pass, row.practices);
    taken.grunt += use.grunt;
    taken.sprouts += use.sprouts;
  }
  return {
    limit,
    grunt: Math.max(0, limit - taken.grunt),
    sprouts: Math.max(0, limit - taken.sprouts),
  };
}

export function openDaySeatError(left, pass, practices) {
  const use = openDaySeatUse(pass, practices);
  if (!use.grunt && !use.sprouts) return "";
  if (use.grunt <= left.grunt && use.sprouts <= left.sprouts) return "";
  if (pass === "full") {
    return "Full pass бере по одному квитку з кожного напряму, а на одному з них місць уже немає.";
  }
  if (use.grunt && left.grunt < use.grunt && use.sprouts && left.sprouts < use.sprouts) {
    return "На обидва дні квитків уже не лишилося.";
  }
  if (use.grunt && left.grunt < use.grunt) return "На Ґрунт квитків уже не лишилося.";
  if (use.sprouts && left.sprouts < use.sprouts) return "На Паростки квитків уже не лишилося.";
  return "На цей формат квитків уже не лишилося.";
}

export function openDayTicketWord(n) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "квиток";
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return "квитки";
  return "квитків";
}

export function openDayTicketLine(dayName, left, limit) {
  if (left <= 0) return `${dayName} — не лишилося`;
  const count = `${left} ${openDayTicketWord(left)}`;
  return `${dayName} — лишилося ${limit ? `${count} із ${limit}` : count}`;
}

export function openDayTicketShort(left, limit) {
  if (left <= 0) return "не лишилося";
  return `${left} із ${limit}`;
}
