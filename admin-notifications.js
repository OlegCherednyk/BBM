import { DateTime } from "luxon";
import { computeSubscriptionUsedVisits } from "./students-api.js";

const KYIV_TZ = "Europe/Kyiv";

/** @returns {"left"|"right"|null} */
export function parsePlaceRiverBank(riverBankRaw) {
  const s = String(riverBankRaw || "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("лів")) return "left";
  if (s.includes("прав")) return "right";
  return null;
}

/** @param {"any"|"left"|"right"} teacherScope @param {"left"|"right"|null} lessonBank */
export function teacherMatchesBank(teacherScope, lessonBank) {
  if (teacherScope === "any") return true;
  if (!lessonBank) return false;
  return teacherScope === lessonBank;
}

/** @param {"any"|"left"|"right"} scope */
export function digestScopeLabel(scope) {
  if (scope === "left") return "Лівий берег";
  if (scope === "right") return "Правий берег";
  return "Усі береги";
}

/** @param {unknown} snap */
function bankFromLessonSnapshot(snap) {
  if (!snap || typeof snap !== "object") return null;
  return parsePlaceRiverBank(/** @type {{ riverBank?: string }} */ (snap).riverBank);
}

function formatKyivDate(iso) {
  if (!iso) return "—";
  return DateTime.fromISO(String(iso), { zone: KYIV_TZ }).toFormat("dd.MM");
}

/** @param {{ display_name?: string | null, telegram_username?: string | null } | null | undefined} st */
function studentLine(st) {
  const un = String(st?.telegram_username ?? "").trim().replace(/^@/, "");
  if (un) return `@${un}`;
  return String(st?.display_name ?? "—").trim() || "—";
}

function truncateSection(lines, limit) {
  if (lines.length <= limit) return { text: lines.join("\n"), extra: 0 };
  const shown = lines.slice(0, limit);
  return { text: shown.join("\n"), extra: lines.length - limit };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {"any"|"left"|"right"} scope
 */
export async function buildDigestTextForScope(supabaseAdmin, scope) {
  const todayKyiv = DateTime.now().setZone(KYIV_TZ).toISODate();
  const dateLabel = DateTime.now().setZone(KYIV_TZ).toFormat("dd.MM.yyyy");
  const scopeLabel = digestScopeLabel(scope);

  const { data: subs, error: subsErr } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "id, status, total_visits, valid_until, used_visits_override, lesson_type_id, students ( display_name, telegram_username ), lesson_types ( name )",
    )
    .in("status", ["pending", "active", "exhausted"]);
  if (subsErr) throw new Error(subsErr.message);

  const subIds = (subs || []).map((s) => s.id);
  /** @type {Map<string, "left"|"right"|null>} */
  const bankBySubId = new Map();
  /** @type {Map<string, number>} */
  const attendedCountBySubId = new Map();

  if (subIds.length) {
    const { data: visits, error: vErr } = await supabaseAdmin
      .from("visits")
      .select(
        "subscription_id, visit_status, created_at, lesson_vote_occurrences ( lesson_snapshot, place_id, places ( river_bank ) )",
      )
      .in("subscription_id", subIds)
      .order("created_at", { ascending: false });
    if (vErr) throw new Error(vErr.message);

    for (const v of visits || []) {
      const sid = v.subscription_id;
      if (!sid) continue;
      if (v.visit_status === "attended") {
        attendedCountBySubId.set(sid, (attendedCountBySubId.get(sid) || 0) + 1);
      }
      if (bankBySubId.has(sid)) continue;
      const occ = v.lesson_vote_occurrences;
      const bank =
        bankFromLessonSnapshot(occ?.lesson_snapshot) ??
        parsePlaceRiverBank(occ?.places?.river_bank) ??
        null;
      bankBySubId.set(sid, bank);
    }
  }

  /** @param {{ id: string }} sub */
  function includeSub(sub) {
    if (scope === "any") return true;
    const bank = bankBySubId.get(sub.id) ?? null;
    return teacherMatchesBank(scope, bank);
  }

  /** @type {string[]} */
  const pendingLines = [];
  /** @type {string[]} */
  const lowLines = [];
  /** @type {string[]} */
  const expiredLines = [];

  for (const sub of subs || []) {
    if (!includeSub(sub)) continue;
    const ltName = sub.lesson_types?.name || "—";
    const st = sub.students;

    if (sub.status === "pending") {
      pendingLines.push(`  • ${studentLine(st)} — ${ltName}`);
      continue;
    }

    const fromVisits = attendedCountBySubId.get(sub.id) || 0;
    const used = computeSubscriptionUsedVisits(fromVisits, sub.used_visits_override, sub.total_visits);
    const total = sub.total_visits != null ? Number(sub.total_visits) : null;
    const remaining = total != null ? Math.max(0, total - used) : null;

    if (sub.status === "active" && total != null && remaining != null && remaining <= 2) {
      lowLines.push(`  • ${studentLine(st)} — ${used}/${total} ${ltName}`);
      continue;
    }

    if (
      sub.status === "exhausted" &&
      sub.valid_until &&
      String(sub.valid_until) < String(todayKyiv) &&
      total != null &&
      remaining != null &&
      remaining > 0
    ) {
      expiredLines.push(`  • ${studentLine(st)} — ${ltName} (до ${formatKyivDate(sub.valid_until)})`);
    }
  }

  const p = pendingLines.length;
  const l = lowLines.length;
  const e = expiredLines.length;

  if (p === 0 && l === 0 && e === 0) {
    return `✅ BBM — ${dateLabel} · ${scopeLabel}\nНічого термінового. Pending: 0 · Закінчуються: 0 · Прострочені: 0`;
  }

  const parts = [`📋 BBM — ранковий дайджest · ${dateLabel}`, scopeLabel, ""];

  if (p > 0) {
    const { text, extra } = truncateSection(pendingLines, 10);
    parts.push(`⚠️ Pending абонементи (${p})`, text);
    if (extra) parts.push(`  … +${extra} ще`);
    parts.push("");
  }
  if (l > 0) {
    const { text, extra } = truncateSection(lowLines, 10);
    parts.push(`🔔 Закінчуються (≤2 заняття) (${l})`, text);
    if (extra) parts.push(`  … +${extra} ще`);
    parts.push("");
  }
  if (e > 0) {
    const { text, extra } = truncateSection(expiredLines, 5);
    parts.push(`⏰ Прострочені абонементи (${e})`, text);
    if (extra) parts.push(`  … +${extra} ще`);
  }

  let text = parts.join("\n").trim();
  if (text.length > 4096) text = `${text.slice(0, 4090)}…`;
  return text;
}

/** @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin */
export async function loadDigestRecipients(supabaseAdmin) {
  const { data, error } = await supabaseAdmin
    .from("teachers")
    .select("id, name, chat_id, river_bank_scope")
    .eq("digest_enabled", true)
    .not("chat_id", "is", null);
  if (error) throw new Error(error.message);
  return (data || []).filter((row) => String(row.chat_id || "").trim());
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ telegram: { sendMessage: (chatId: string, text: string) => Promise<unknown> } } | null} bot
 */
export async function runDailyTeacherDigests(supabaseAdmin, bot) {
  if (!supabaseAdmin || !bot?.telegram?.sendMessage) {
    console.log("[admin-digest] skipped: bot or supabase not configured");
    return { sent: 0, skipped: true };
  }

  const recipients = await loadDigestRecipients(supabaseAdmin);
  if (!recipients.length) {
    console.log("[admin-digest] no recipients with digest_enabled");
    return { sent: 0, skipped: false };
  }

  let sent = 0;
  for (const t of recipients) {
    const scope = /** @type {"any"|"left"|"right"} */ (t.river_bank_scope || "any");
    try {
      const text = await buildDigestTextForScope(supabaseAdmin, scope);
      await bot.telegram.sendMessage(String(t.chat_id).trim(), text);
      sent += 1;
    } catch (err) {
      console.error(`[admin-digest] send failed teacher=${t.id}:`, err?.description || err?.message || err);
    }
  }
  console.log(`[admin-digest] done sent=${sent} recipients=${recipients.length}`);
  return { sent, skipped: false };
}

/** @param {number} weeksAgo 1 = минулий повний тиждень (пн–нд) */
export function getCompletedWeekRangeKyiv(weeksAgo = 1) {
  const now = DateTime.now().setZone(KYIV_TZ);
  const thisWeekStart = now.startOf("week");
  const weekStart = thisWeekStart.minus({ weeks: weeksAgo });
  const weekEnd = weekStart.plus({ days: 6 });
  return {
    fromDate: weekStart.toISODate(),
    toDate: weekEnd.toISODate(),
    fromIso: weekStart.startOf("day").toUTC().toISO(),
    toIso: weekEnd.endOf("day").toUTC().toISO(),
    label: `${weekStart.toFormat("dd.MM")} — ${weekEnd.toFormat("dd.MM.yyyy")}`,
  };
}

function fmtUah(amount) {
  const n = Math.round(Number(amount) || 0);
  return `${n.toLocaleString("uk-UA")} ₴`;
}

/**
 * @param {string} label
 * @param {number} current
 * @param {number} previous
 * @param {{ money?: boolean }} [opts]
 */
function formatCompareLine(label, current, previous, { money = false } = {}) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  const delta = cur - prev;
  const fmt = money ? fmtUah : (v) => String(Math.round(Number(v) || 0));

  let arrow = "→";
  if (delta > 0) arrow = "↑";
  else if (delta < 0) arrow = "↓";

  let changePart;
  if (delta === 0) {
    changePart = "без змін";
  } else {
    const sign = delta > 0 ? "+" : "−";
    const absVal = Math.abs(delta);
    changePart = money ? `${sign}${fmtUah(absVal)}` : `${sign}${absVal}`;
  }

  return `${label}: ${fmt(cur)} ${arrow} ${changePart} (було ${fmt(prev)})`;
}

/**
 * @param {{ summary?: { totalLessons?: number, totalPeople?: number, totalPeopleAll?: number }, teachers?: Array<{ revenue?: number, payout?: number, peopleCount?: number }> }} dashboard
 */
function dashboardToWeekSummary(dashboard) {
  const s = dashboard?.summary || {};
  const teachers = dashboard?.teachers || [];
  return {
    lessonsCount: Number(s.totalLessons) || 0,
    uniquePeopleCount: Number(s.totalPeople) || 0,
    totalPeopleCount:
      Number(s.totalPeopleAll) || teachers.reduce((sum, row) => sum + (Number(row.peopleCount) || 0), 0),
    revenue: teachers.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0),
    payout: teachers.reduce((sum, row) => sum + (Number(row.payout) || 0), 0),
  };
}

function teacherSummaryToWeekSummary(summary) {
  const s = summary || {};
  return {
    lessonsCount: Number(s.lessonsCount) || 0,
    uniquePeopleCount: Number(s.uniquePeopleCount) || 0,
    totalPeopleCount: Number(s.peopleCount) || 0,
    revenue: Number(s.revenue) || 0,
    payout: Number(s.payout) || 0,
  };
}

function formatStatsBlock(title, currentSummary, prevSummary) {
  return [
    title,
    formatCompareLine("📚 Уроків", currentSummary.lessonsCount, prevSummary.lessonsCount),
    formatCompareLine("👤 Унікальних", currentSummary.uniquePeopleCount, prevSummary.uniquePeopleCount),
    formatCompareLine("👥 Всіх", currentSummary.totalPeopleCount, prevSummary.totalPeopleCount),
    formatCompareLine("💰 Виручка", currentSummary.revenue, prevSummary.revenue, { money: true }),
    formatCompareLine("💵 Виплата", currentSummary.payout, prevSummary.payout, { money: true }),
  ];
}

/**
 * @param {string} teacherName
 * @param {string} weekLabel
 * @param {{ lessonsCount: number, uniquePeopleCount: number, totalPeopleCount: number, revenue: number, payout: number }} teacherCurrent
 * @param {{ lessonsCount: number, uniquePeopleCount: number, totalPeopleCount: number, revenue: number, payout: number }} teacherPrev
 * @param {{ lessonsCount: number, uniquePeopleCount: number, totalPeopleCount: number, revenue: number, payout: number }} overallCurrent
 * @param {{ lessonsCount: number, uniquePeopleCount: number, totalPeopleCount: number, revenue: number, payout: number }} overallPrev
 */
export function buildWeeklyStatsDigestText(
  teacherName,
  weekLabel,
  teacherCurrent,
  teacherPrev,
  overallCurrent,
  overallPrev,
) {
  const name = String(teacherName || "Викладач").trim();
  const lines = [
    "📊 BBM — тижневий дайджест",
    weekLabel,
    "",
    ...formatStatsBlock(`👤 ${name}`, teacherCurrent, teacherPrev),
    "",
    ...formatStatsBlock("🏫 BBM загалом", overallCurrent, overallPrev),
  ];
  let text = lines.join("\n").trim();
  if (text.length > 4096) text = `${text.slice(0, 4090)}…`;
  return text;
}

const EMPTY_WEEK_SUMMARY = { lessonsCount: 0, uniquePeopleCount: 0, totalPeopleCount: 0, revenue: 0, payout: 0 };

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ telegram: { sendMessage: (chatId: string, text: string) => Promise<unknown> } } | null} bot
 * @param {(supabaseAdmin: import("@supabase/supabase-js").SupabaseClient, args: { teacherId?: string, teacherName?: string, fromIso?: string | null, toIso?: string | null }) => Promise<{ summary: { lessonsCount: number, uniquePeopleCount: number, totalPeopleCount: number, revenue: number, payout: number }, teacherName?: string }>} computeTeacherStats
 * @param {(supabaseAdmin: import("@supabase/supabase-js").SupabaseClient, args: { fromIso?: string | null, toIso?: string | null, fromDate?: string | null, toDate?: string | null }) => Promise<{ summary: { totalLessons?: number, totalPeople?: number, totalPeopleAll?: number }, teachers?: Array<{ revenue?: number, payout?: number, peopleCount?: number }> }>} computeOverallStats
 */
export async function runWeeklyTeacherStatsDigests(supabaseAdmin, bot, computeTeacherStats, computeOverallStats) {
  if (!supabaseAdmin || !bot?.telegram?.sendMessage) {
    console.log("[admin-weekly-digest] skipped: bot or supabase not configured");
    return { sent: 0, skipped: true };
  }
  if (typeof computeTeacherStats !== "function") {
    console.log("[admin-weekly-digest] skipped: computeTeacherStats not configured");
    return { sent: 0, skipped: true };
  }
  if (typeof computeOverallStats !== "function") {
    console.log("[admin-weekly-digest] skipped: computeOverallStats not configured");
    return { sent: 0, skipped: true };
  }

  const recipients = await loadDigestRecipients(supabaseAdmin);
  if (!recipients.length) {
    console.log("[admin-weekly-digest] no recipients with digest_enabled");
    return { sent: 0, skipped: false };
  }

  const currentWeek = getCompletedWeekRangeKyiv(1);
  const prevWeek = getCompletedWeekRangeKyiv(2);

  const [overallCurrentRaw, overallPrevRaw] = await Promise.all([
    computeOverallStats(supabaseAdmin, {
      fromIso: currentWeek.fromIso,
      toIso: currentWeek.toIso,
      fromDate: currentWeek.fromDate,
      toDate: currentWeek.toDate,
    }),
    computeOverallStats(supabaseAdmin, {
      fromIso: prevWeek.fromIso,
      toIso: prevWeek.toIso,
      fromDate: prevWeek.fromDate,
      toDate: prevWeek.toDate,
    }),
  ]);
  const overallCurrent = dashboardToWeekSummary(overallCurrentRaw);
  const overallPrev = dashboardToWeekSummary(overallPrevRaw);

  let sent = 0;
  for (const t of recipients) {
    try {
      const [current, previous] = await Promise.all([
        computeTeacherStats(supabaseAdmin, {
          teacherId: String(t.id),
          teacherName: String(t.name || ""),
          fromIso: currentWeek.fromIso,
          toIso: currentWeek.toIso,
        }),
        computeTeacherStats(supabaseAdmin, {
          teacherId: String(t.id),
          teacherName: String(t.name || ""),
          fromIso: prevWeek.fromIso,
          toIso: prevWeek.toIso,
        }),
      ]);

      const text = buildWeeklyStatsDigestText(
        current.teacherName || t.name,
        currentWeek.label,
        teacherSummaryToWeekSummary(current.summary),
        teacherSummaryToWeekSummary(previous.summary),
        overallCurrent,
        overallPrev,
      );
      await bot.telegram.sendMessage(String(t.chat_id).trim(), text);
      sent += 1;
    } catch (err) {
      console.error(
        `[admin-weekly-digest] send failed teacher=${t.id}:`,
        err?.description || err?.message || err,
      );
    }
  }
  console.log(`[admin-weekly-digest] done sent=${sent} recipients=${recipients.length} week=${currentWeek.label}`);
  return { sent, skipped: false };
}
