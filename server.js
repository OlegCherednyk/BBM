import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Telegraf } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";
import { startDailyLessonVoteCron } from "./lesson-vote-cron.js";
import {
  applyVisitsAfterFinalize,
  backfillStudentsFromSkipVotes,
  expireOverdueSubscriptions,
  pickSubscriptionForAbonLesson,
  registerStudentRoutes,
  resolveCrossTypeLessonTypeIds,
  rollbackVisitsForOccurrence,
} from "./students-api.js";
import { parsePlaceRiverBank, runDailyTeacherDigests, runWeeklyTeacherStatsDigests, runMonthlyTeacherStatsDigests, teacherMatchesBank, getCompletedWeekRangeKyiv } from "./admin-notifications.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: path.join(__dirname, ".env"),
  override: true,
});

const app = express();
const parsedPort = Number.parseInt(process.env.PORT ?? "", 10);
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 8080;
const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
const telegramChatId = process.env.TELEGRAM_CHAT_ID || "";
/** Група, куди йде голосування учасників (Абонемент / Разове); інакше fallback на TELEGRAM_CHAT_ID */
const telegramGroupChatId = process.env.TELEGRAM_GROUP_CHAT_ID || "";
/** Якщо обидва задані, голосування йде в чат відповідно до `places.river_bank` (ліва / права група) */
const telegramGroupChatIdLeftBank = process.env.TELEGRAM_GROUP_CHAT_ID_LEFT_BANK || "";
const telegramGroupChatIdRightBank = process.env.TELEGRAM_GROUP_CHAT_ID_RIGHT_BANK || "";
const publicSupabaseUrl = process.env.PUBLIC_SUPABASE_URL || "";
const publicSupabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY || "";
if (!publicSupabaseUrl || !publicSupabaseAnonKey) {
  console.warn(
    "[env] PUBLIC_SUPABASE_URL або PUBLIC_SUPABASE_ANON_KEY не задані — клієнтські сторінки не зможуть отримати Supabase з /api/public-config.",
  );
}
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const bot = botToken ? new Telegraf(botToken) : null;
const supabaseAdmin =
  publicSupabaseUrl && supabaseServiceRoleKey
    ? createClient(publicSupabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
const activeLessonVotes = new Map();
/** Ключ `${chatId}:${messageId}` — повідомлення «хто проводить» (одна кнопка) */
const activeConductVotes = new Map();
/** Ключ `${chatId}:${messageId}` — підтвердження заняття з 2 учнями */
const activeLessonReviews = new Map();

/** JS getDay(): 0 = Sunday … 6 = Saturday — короткі підписи українською */
const DAY_SHORT_UK = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const KYIV_TZ = "Europe/Kyiv";
/** Вікно автоголосування: відправка не раніше ніж за 3×24 год і не пізніше ніж за 24 год до початку заняття (Київ) */
const VOTE_SCHED_OPEN_MAX_HOURS_BEFORE = 4 * 24;
const VOTE_SCHED_CLOSE_MAX_HOURS_BEFORE = 1;
const SCHEDULER_TICK_MS = 60 * 1000;
const lessonVoteDailyCreateCronTime = process.env.LESSON_VOTE_DAILY_CREATE_CRON_TIME;
const lessonVoteDailyCloseCronTime = process.env.LESSON_VOTE_DAILY_CLOSE_CRON_TIME;
const adminDigestCronTime = process.env.ADMIN_DIGEST_CRON_TIME || "09:00";
const adminWeeklyDigestCronTime = process.env.ADMIN_WEEKLY_DIGEST_CRON_TIME || adminDigestCronTime;

/** Вікно для створення бойових голосувань: (1; 120] год до початку заняття (Київ). */
function isOccurrenceInScheduledVoteWindow(occurrenceKyiv, nowKyiv) {
  const hoursUntil = occurrenceKyiv.diff(nowKyiv, "hours").hours;
  return hoursUntil > VOTE_SCHED_CLOSE_MAX_HOURS_BEFORE && hoursUntil <= VOTE_SCHED_OPEN_MAX_HOURS_BEFORE;
}

function normalizeOccurrenceAtIso(raw) {
  if (raw == null || raw === "") return "";
  const dt = DateTime.fromISO(String(raw), { zone: "utc" });
  return dt.isValid ? dt.toUTC().toISO() : String(raw).trim();
}

function isTelegramMessageNotModifiedError(err) {
  const msg = String(err?.description || err?.message || err || "");
  return /message is not modified/i.test(msg);
}

function isTelegramStaleCallbackQueryError(err) {
  const msg = String(err?.description || err?.message || err || "");
  return /query is too old|query ID is invalid|response timeout expired/i.test(msg);
}

/** Telegram дає ~10–15 с на answerCbQuery; прострочені callback не повинні валити polling. */
async function safeAnswerCbQuery(ctx, text) {
  try {
    if (text !== undefined && text !== null) {
      await ctx.answerCbQuery(text);
    } else {
      await ctx.answerCbQuery();
    }
  } catch (err) {
    if (isTelegramStaleCallbackQueryError(err)) {
      console.warn("Telegram callback query expired:", err?.description || err?.message || err);
      return;
    }
    throw err;
  }
}

/** Уже існуючі (lesson_time_id → Set occurrence_at ISO) для бойових голосувань. */
async function loadOccupiedOccurrenceAtByLessonTimeId() {
  const map = new Map();
  if (!supabaseAdmin) return map;

  const { data, error } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .select("lesson_time_id, occurrence_at")
    .eq("is_test", false);

  if (error) {
    console.warn("loadOccupiedOccurrenceAtByLessonTimeId:", error.message);
    return map;
  }

  for (const row of data || []) {
    const lessonTimeId = String(row.lesson_time_id || "").trim();
    const iso = normalizeOccurrenceAtIso(row.occurrence_at);
    if (!lessonTimeId || !iso) continue;
    if (!map.has(lessonTimeId)) map.set(lessonTimeId, new Set());
    map.get(lessonTimeId).add(iso);
  }
  return map;
}

function resolveGroupVoteChatId() {
  const dedicated = String(telegramGroupChatId || "").trim();
  if (dedicated) return dedicated;
  return String(telegramChatId || "").trim();
}

function trimmedEnvId(value) {
  return String(value || "").trim();
}

/** Режим двох груп: обидві змінні мають бути непусті; інакше помилка конфігурації */
function dualBankGroupChatIds() {
  const left = trimmedEnvId(telegramGroupChatIdLeftBank);
  const right = trimmedEnvId(telegramGroupChatIdRightBank);
  if (!left && !right) return { mode: "off", left: "", right: "" };
  if (left && right) return { mode: "dual", left, right };
  return { mode: "partial", left, right };
}

/**
 * Цільова група для голосування: за берегом місця або legacy одна група.
 * @returns {{ chatId: string, dualMode: boolean, bank: "left"|"right"|null } | { error: string }}
 */
function resolveGroupVoteChatIdForLessonPlace(riverBankRaw) {
  const dual = dualBankGroupChatIds();
  if (dual.mode === "partial") {
    return {
      error:
        "Задай обидві змінні TELEGRAM_GROUP_CHAT_ID_LEFT_BANK і TELEGRAM_GROUP_CHAT_ID_RIGHT_BANK або прибери зайву: зараз указано лише одну.",
    };
  }
  if (dual.mode === "dual") {
    const side = parsePlaceRiverBank(riverBankRaw);
    if (!side) {
      return {
        error:
          "Для цього заняття в картці місця (адмінка → Місця) має бути обраний берег Дніпра: «Лівий берег» або «Правий берег».",
      };
    }
    const chatId = side === "left" ? dual.left : dual.right;
    return { chatId, dualMode: true, bank: side };
  }
  const fallback = resolveGroupVoteChatId();
  if (!fallback) {
    return {
      error:
        "Додай у .env TELEGRAM_GROUP_CHAT_ID_LEFT_BANK і TELEGRAM_GROUP_CHAT_ID_RIGHT_BANK (обидві групи за берегом) або один TELEGRAM_GROUP_CHAT_ID / TELEGRAM_CHAT_ID для однієї групи.",
    };
  }
  return { chatId: fallback, dualMode: false, bank: parsePlaceRiverBank(riverBankRaw) };
}

app.use(express.json());
app.use(express.static("."));

app.get("/api/public-config", (_req, res) => {
  const body = {};
  if (publicSupabaseUrl) body.supabaseUrl = publicSupabaseUrl;
  if (publicSupabaseAnonKey) body.supabaseAnonKey = publicSupabaseAnonKey;
  return res.status(200).json(body);
});

app.get("/api/signup", (_req, res) => {
  return res.status(200).json({
    ok: false,
    message: "Use POST /api/signup with JSON body: { name, contact }",
  });
});

function extractChatIdsFromUpdates(updates) {
  const chatIds = new Set();

  for (const update of updates || []) {
    const id = update?.message?.chat?.id ?? update?.channel_post?.chat?.id;
    if (id !== undefined && id !== null) {
      chatIds.add(String(id));
    }
  }

  return [...chatIds];
}

function extractChatsFromUpdates(updates) {
  const chatsMap = new Map();

  for (const update of updates || []) {
    const chat = update?.message?.chat ?? update?.channel_post?.chat;
    if (!chat?.id) continue;

    const key = String(chat.id);
    if (!chatsMap.has(key)) {
      chatsMap.set(key, {
        id: key,
        type: chat.type || "unknown",
        title: chat.title || null,
        username: chat.username || null,
        firstName: chat.first_name || null,
        lastName: chat.last_name || null,
      });
    }
  }

  return [...chatsMap.values()];
}

async function getRecentUpdates() {
  if (!bot) return [];
  return bot.telegram.getUpdates({ limit: 100, timeout: 0 });
}

/** Те саме, що GET /api/telegram/chats: нові чати з getUpdates + upsert у telegram_chat_targets. */
async function syncTelegramChatsFromUpdates() {
  if (!bot) {
    return { chats: [], persistedChatIds: [] };
  }
  const updates = await getRecentUpdates();
  const chats = extractChatsFromUpdates(updates);
  await saveChatsToSupabase(chats);
  const persistedChatIds = await loadChatIdsFromSupabase();
  return { chats, persistedChatIds };
}

async function saveChatsToSupabase(chats) {
  if (!supabaseAdmin || !chats.length) return;

  const payload = chats.map((chat) => ({
    chat_id: chat.id,
    chat_type: chat.type || "unknown",
    title: chat.title || null,
    username: chat.username || null,
    first_name: chat.firstName || null,
    last_name: chat.lastName || null,
    last_seen_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin.from("telegram_chat_targets").upsert(payload, {
    onConflict: "chat_id",
  });
  if (error) {
    console.error("Failed to upsert telegram_chat_targets:", error.message);
  }
}

async function loadChatIdsFromSupabase() {
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin.from("telegram_chat_targets").select("chat_id");
  if (error) {
    console.error("Failed to load telegram_chat_targets:", error.message);
    return [];
  }
  return (data || []).map((row) => String(row.chat_id)).filter(Boolean);
}

async function resolveTargetChatIds() {
  const chatIds = new Set();
  const dbChatIds = await loadChatIdsFromSupabase();
  for (const id of dbChatIds) chatIds.add(id);

  if (!bot) {
    return [...chatIds];
  }

  try {
    const updates = await getRecentUpdates();
    const chats = extractChatsFromUpdates(updates);
    const updateChatIds = extractChatIdsFromUpdates(updates);
    for (const id of updateChatIds) chatIds.add(id);
    await saveChatsToSupabase(chats);
  } catch (error) {
    console.error("Failed to fetch Telegram updates:", error?.description || error?.message || error);
  }

  if (telegramChatId) {
    const fallbackChatId = String(telegramChatId);
    chatIds.add(fallbackChatId);
    await saveChatsToSupabase([
      {
        id: fallbackChatId,
        type: "unknown",
        title: null,
        username: null,
        firstName: null,
        lastName: null,
      },
    ]);
  }
  return [...chatIds];
}

function buildLessonVoteMessage({
  lessonTimeLabel,
  placeLabel,
  lessonTypeLabel,
  votesByKind,
  teacherName,
  conductingDisplayName,
  audience = "dm",
}) {
  const abonVoters = [...(votesByKind.abon || new Map()).values()].map(voteParticipantLabel).filter(Boolean);
  const singleVoters = [...(votesByKind.single || new Map()).values()].map(voteParticipantLabel).filter(Boolean);
  const skipVoters = [...(votesByKind.skip || new Map()).values()].map(voteParticipantLabel).filter(Boolean);
  const abonLine = abonVoters.length ? abonVoters.join(", ") : "поки немає";
  const singleLine = singleVoters.length ? singleVoters.join(", ") : "поки немає";
  const skipLine = skipVoters.length ? skipVoters.join(", ") : "поки немає";

  const teacherLine =
    typeof teacherName === "string" && teacherName.trim().length > 0
      ? [`👤 Викладач: ${teacherName.trim()}`]
      : [];

  const conductingLine =
    typeof conductingDisplayName === "string" && conductingDisplayName.trim().length > 0
      ? [`👤 Проводить заняття: ${conductingDisplayName.trim()}`]
      : [];

  const title =
    audience === "group"
      ? "🗳️ Голосування учасників"
      : typeof teacherName === "string" && teacherName.trim().length > 0
        ? "🗳️ Тестове голосування по заняттю"
        : "🗳️ Голосування учасників";

  return [
    title,
    "",
    `🕒 Час: ${lessonTimeLabel}`,
    `📍 Місце: ${placeLabel}`,
    `💃 Напрям: ${lessonTypeLabel}`,
    ...teacherLine,
    ...conductingLine,
    "",
    `📘 Абонемент (${abonVoters.length}): ${abonLine}`,
    `🎟️ Разове (${singleVoters.length}): ${singleLine}`,
    `⏭️ Пропускаю (${skipVoters.length}): ${skipLine}`,
  ].join("\n");
}

function buildDisplayNameFromUser(user) {
  if (!user) return "Невідомий";
  const rawFirst = typeof user.first_name === "string" ? user.first_name.trim() : "";
  const rawLast = typeof user.last_name === "string" ? user.last_name.trim() : "";
  const fullName = [rawFirst, rawLast].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;
  if (typeof user.username === "string" && user.username.trim())
    return `@${user.username.trim()}`;
  return `id:${String(user.id ?? "unknown")}`;
}

function normalizeTelegramUsername(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const nick = raw.trim().replace(/^@/, "");
  return nick || null;
}

async function lookupStudentTelegramUsernameByUserId(userIdRaw) {
  if (!supabaseAdmin || userIdRaw == null || userIdRaw === "") return null;
  try {
    const tid = Number(userIdRaw);
    if (!Number.isFinite(tid)) return null;
    const { data: student, error: stErr } = await supabaseAdmin
      .from("students")
      .select("telegram_username")
      .eq("telegram_user_id", tid)
      .maybeSingle();
    if (stErr) {
      console.warn("lookupStudentTelegramUsernameByUserId:", stErr.message);
      return null;
    }
    return normalizeTelegramUsername(student?.telegram_username);
  } catch (e) {
    console.warn("lookupStudentTelegramUsernameByUserId:", e?.message || e);
    return null;
  }
}

/**
 * Імʼя + @нік для збереження в голосуванні.
 * @нік: callback → getChatMember → students.telegram_username (fallback для вже відомих учнів).
 */
async function resolveVoterIdentity(telegram, chatId, fromUser) {
  const uid = Number(fromUser?.id);
  const uidStr = Number.isFinite(uid) ? String(uid) : "";
  let telegramUsername = normalizeTelegramUsername(fromUser?.username);
  let name = buildDisplayNameFromUser(fromUser);

  if (!telegramUsername && telegram && chatId != null && Number.isFinite(uid)) {
    try {
      const member = await telegram.getChatMember(chatId, uid);
      const u = member?.user;
      if (u) {
        telegramUsername = normalizeTelegramUsername(u.username) || telegramUsername;
        const enriched = buildDisplayNameFromUser(u);
        if (enriched !== "Невідомий" && !/^id:\d+$/.test(enriched) && enriched.trim()) {
          name = enriched;
        }
      }
    } catch (_e) {
      // ignore (немає прав getChatMember тощо)
    }
  }

  if (!telegramUsername && uidStr) {
    telegramUsername = await lookupStudentTelegramUsernameByUserId(uidStr);
  }

  return { name, telegram_username: telegramUsername };
}

/**
 * Якщо в callback недоступні імʼя/нік — добираємо профіль учасника чату через getChatMember (частіше допомагає в групах).
 * @param {{ getChatMember: (chatId: number | string, userId: number) => Promise<{ user?: { first_name?: string, last_name?: string, username?: string, id?: number } }> }} telegram
 */
async function resolveVoterDisplayName(telegram, chatId, fromUser) {
  const { name } = await resolveVoterIdentity(telegram, chatId, fromUser);
  return name;
}

/** Підпис у тексті групового голосування — переважно @нік. */
function voteParticipantLabel(participant) {
  if (participant == null) return "";
  if (typeof participant === "string") {
    const s = String(participant).trim();
    if (!s) return "";
    if (s.startsWith("@")) return s;
    return s;
  }
  if (typeof participant === "object") {
    const rawU = participant.telegram_username ?? participant.username;
    const nick = normalizeTelegramUsername(rawU);
    if (nick) return `@${nick}`;
    const name = String(participant.name ?? "").trim();
    if (name.startsWith("@")) return name;
    return name;
  }
  return "";
}

/** Розбір рядка або { n, u } з votes_snapshot після завантаження з БД. */
function snapshotToVoteParticipant(uidStr, raw) {
  const uid = String(uidStr ?? "").trim();
  if (raw == null || raw === "")
    return { name: uid ? `Telegram ${uid}` : "Telegram ?", telegram_username: null };
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("@")) {
      return { name: s, telegram_username: s.replace(/^@/, "") };
    }
    return { name: s || `Telegram ${uid}`, telegram_username: null };
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const name = String(raw.n ?? raw.name ?? "").trim();
    let un = raw.u ?? raw.un ?? null;
    if (un != null) {
      un = String(un).trim().replace(/^@/, "");
      un = un || null;
    }
    return { name: name || `Telegram ${uid}`, telegram_username: un };
  }
  return { name: `Telegram ${uid}`, telegram_username: null };
}

/** У JSON snapshots: або рядок (імʼя), або при наявності @ — { n, u }. */
function voteParticipantToSnapshotStored(uidStr, participant) {
  const uid = String(uidStr ?? "").trim();
  if (participant == null || participant === "") return uid ? `Telegram ${uid}` : "";
  if (typeof participant === "string") {
    const s = participant.trim();
    return s || (uid ? `Telegram ${uid}` : "");
  }
  const nameRaw = typeof participant?.name === "string" ? participant.name.trim() : "";
  const name = nameRaw || (uid ? `Telegram ${uid}` : "");
  const uRaw = participant?.telegram_username;
  let u =
    typeof uRaw === "string" && uRaw.trim() ? String(uRaw).trim().replace(/^@/, "") : "";
  u = u || "";
  if (u) return { n: name, u };
  return name;
}

function buildLessonVoteKeyboard(voteId) {
  return {
    inline_keyboard: [
      [
        { text: "📘 Абонемент", callback_data: `lesson_vote:${voteId}:abon` },
        { text: "🎟️ Разове", callback_data: `lesson_vote:${voteId}:single` },
      ],
      [{ text: "⏭️ Пропускаю", callback_data: `lesson_vote:${voteId}:skip` }],
    ],
  };
}

function pickSmmAmount(rows, peopleCount) {
  const people = Math.max(0, Number(peopleCount) || 0);
  for (const row of rows || []) {
    const from = Number(row.people_from) || 0;
    const to = row.people_to == null ? null : Number(row.people_to) || 0;
    if (people < from) continue;
    if (to != null && people > to) continue;
    return Number(row.amount_uah) || 0;
  }
  return 0;
}

function buildPriceByType(pricesRows) {
  /** @type {Map<string, {single: number, abonUnit: number}>} */
  const map = new Map();
  for (const row of pricesRows || []) {
    const lessonTypeId = String(row.lesson_type_id || "");
    if (!lessonTypeId) continue;
    const amount = Number(row.amount_uah) || 0;
    const visits = Math.max(1, Number(row.visits_count) || 1);
    const current = map.get(lessonTypeId) || { single: 0, abonUnit: 0 };
    if (row.price_kind === "single") {
      current.single = amount;
    } else if (row.price_kind === "abon") {
      const unit = amount / visits;
      if (!current.abonUnit || unit < current.abonUnit) current.abonUnit = unit;
    }
    map.set(lessonTypeId, current);
  }
  return map;
}

function formatMoneyUah(amount) {
  const num = Number(amount) || 0;
  const rounded = Math.round(num * 100) / 100;
  return `${rounded.toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} грн`;
}

/** @param {bigint} big @param {string} uidStr */
function telegramUserIdForDb(big, uidStr) {
  const n = Number(uidStr);
  if (Number.isSafeInteger(n)) return n;
  return big.toString();
}

/** @param {{ amount_uah?: number | null, total_visits?: number | null }} sub */
function subscriptionVisitUnitPrice(sub) {
  const amount = Number(sub?.amount_uah) || 0;
  const visits = Number(sub?.total_visits) || 0;
  if (amount <= 0 || visits <= 0) return 0;
  return amount / visits;
}

/**
 * Абонементи учнів для розрахунку виручки (власний тип + cross-type, напр. сучасний для тренажу).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string[]} studentIds
 * @param {string} lessonTypeId
 */
async function loadAbonSubsByStudentForRevenue(supabaseAdmin, studentIds, lessonTypeId) {
  /** @type {Map<string, Array<{ status?: string, created_at?: string, amount_uah?: number | null, total_visits?: number | null }>>} */
  const ownByStudent = new Map();
  /** @type {Map<string, Array<{ status?: string, created_at?: string, amount_uah?: number | null, total_visits?: number | null }>>} */
  const crossByStudent = new Map();
  if (!studentIds.length) return { ownByStudent, crossByStudent };

  const crossTypeIds = await resolveCrossTypeLessonTypeIds(supabaseAdmin, lessonTypeId);
  const typeIds = [lessonTypeId, ...crossTypeIds.filter((id) => id !== lessonTypeId)];
  const crossSet = new Set(crossTypeIds.map(String));
  const lessonTypeStr = String(lessonTypeId);

  const { data: subs, error: subErr } = await supabaseAdmin
    .from("subscriptions")
    .select("id, student_id, lesson_type_id, status, amount_uah, total_visits, created_at")
    .in("student_id", studentIds)
    .in("lesson_type_id", typeIds)
    .in("status", ["active", "pending"]);
  if (subErr) throw new Error(subErr.message);

  for (const sub of subs || []) {
    const sid = String(sub.student_id);
    const ltId = String(sub.lesson_type_id);
    const bucket =
      ltId === lessonTypeStr ? ownByStudent : crossSet.has(ltId) ? crossByStudent : null;
    if (!bucket) continue;
    if (!bucket.has(sid)) bucket.set(sid, []);
    bucket.get(sid).push(sub);
  }

  return { ownByStudent, crossByStudent };
}

/** @param {Map<string, Array<{ status?: string, created_at?: string, amount_uah?: number | null, total_visits?: number | null }>>} ownByStudent @param {Map<string, Array<{ status?: string, created_at?: string, amount_uah?: number | null, total_visits?: number | null }>>} crossByStudent @param {string} studentId */
function pickAbonSubForStudentRevenue(ownByStudent, crossByStudent, studentId) {
  return pickSubscriptionForAbonLesson(
    ownByStudent.get(String(studentId)) || [],
    crossByStudent.get(String(studentId)) || [],
  );
}

/**
 * Виручка з фактичних відвідувань журналу (subscription_id на візиті).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} occurrenceId
 * @param {string} lessonTypeId
 * @param {Map<string, { single: number, abonUnit: number }>} priceByType
 * @returns {Promise<{ abonRevenue: number, singleRevenue: number, totalRevenue: number, abonCount: number, singleCount: number } | null>}
 */
async function computeLessonRevenueFromAttendedVisits(supabaseAdmin, occurrenceId, lessonTypeId, priceByType) {
  const occId = String(occurrenceId || "").trim();
  if (!occId) return null;

  const { data: visits, error } = await supabaseAdmin
    .from("visits")
    .select("vote_choice, subscriptions ( amount_uah, total_visits )")
    .eq("lesson_vote_occurrence_id", occId)
    .eq("visit_status", "attended");
  if (error) throw new Error(error.message);
  if (!visits?.length) return null;

  const prices = priceByType.get(lessonTypeId) || { single: 0, abonUnit: 0 };
  let abonRevenue = 0;
  let singleRevenue = 0;
  let abonCount = 0;
  let singleCount = 0;

  for (const v of visits) {
    const isAbon = v.vote_choice === "abon";
    let amount = isAbon ? subscriptionVisitUnitPrice(v.subscriptions) : prices.single;
    if (isAbon && amount <= 0) amount = prices.abonUnit;
    amount = Math.round(amount * 100) / 100;
    if (isAbon) {
      abonRevenue += amount;
      abonCount += 1;
    } else {
      singleRevenue += amount;
      singleCount += 1;
    }
  }

  abonRevenue = Math.round(abonRevenue * 100) / 100;
  singleRevenue = Math.round(singleRevenue * 100) / 100;
  return {
    abonRevenue,
    singleRevenue,
    totalRevenue: Math.round((abonRevenue + singleRevenue) * 100) / 100,
    abonCount,
    singleCount,
  };
}

/**
 * Абонементна виручка: частка з відкритого абонементу учня; якщо немає — статична з таблиці prices.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ lessonTypeId: string, votesByKind: { abon?: Map<string, unknown>, single?: Map<string, unknown> }, priceByType: Map<string, { single: number, abonUnit: number }> }} args
 */
async function computeLessonRevenueFromVotes(supabaseAdmin, { lessonTypeId, votesByKind, priceByType }) {
  const singleMap = votesByKind?.single instanceof Map ? votesByKind.single : new Map();
  const abonMap = votesByKind?.abon instanceof Map ? votesByKind.abon : new Map();
  const singleCount = singleMap.size;
  const abonCount = abonMap.size;
  const prices = priceByType.get(lessonTypeId) || { single: 0, abonUnit: 0 };
  const singleRevenue = singleCount * prices.single;
  const staticAbonUnit = prices.abonUnit;

  /** @type {Map<string, number | string>} */
  const uidToTid = new Map();
  for (const uidStr of abonMap.keys()) {
    try {
      uidToTid.set(String(uidStr), telegramUserIdForDb(BigInt(String(uidStr)), String(uidStr)));
    } catch {
      // ignore invalid telegram id
    }
  }

  /** @type {Map<string, string>} */
  const studentIdByTid = new Map();
  /** @type {Map<string, Array<{ status?: string, created_at?: string, amount_uah?: number | null, total_visits?: number | null }>>} */
  let ownByStudent = new Map();
  /** @type {Map<string, Array<{ status?: string, created_at?: string, amount_uah?: number | null, total_visits?: number | null }>>} */
  let crossByStudent = new Map();

  const tidValues = [...new Set([...uidToTid.values()])];
  if (tidValues.length > 0) {
    const { data: students, error: stErr } = await supabaseAdmin
      .from("students")
      .select("id, telegram_user_id")
      .in("telegram_user_id", tidValues);
    if (stErr) throw new Error(stErr.message);

    for (const st of students || []) {
      studentIdByTid.set(String(st.telegram_user_id), String(st.id));
    }

    const studentIds = [...new Set((students || []).map((st) => String(st.id)))];
    if (studentIds.length > 0) {
      ({ ownByStudent, crossByStudent } = await loadAbonSubsByStudentForRevenue(
        supabaseAdmin,
        studentIds,
        lessonTypeId,
      ));
    }
  }

  let abonRevenue = 0;
  for (const uidStr of abonMap.keys()) {
    let unitPrice = 0;
    const tid = uidToTid.get(String(uidStr));
    if (tid != null) {
      const studentId = studentIdByTid.get(String(tid));
      if (studentId) {
        const sub = pickAbonSubForStudentRevenue(ownByStudent, crossByStudent, studentId);
        if (sub) unitPrice = subscriptionVisitUnitPrice(sub);
      }
    }
    if (unitPrice <= 0) unitPrice = staticAbonUnit;
    abonRevenue += unitPrice;
  }

  abonRevenue = Math.round(abonRevenue * 100) / 100;
  const totalRevenue = Math.round((abonRevenue + singleRevenue) * 100) / 100;

  return { abonRevenue, singleRevenue, totalRevenue, abonCount, singleCount };
}

function statsDateToStartIso(dateInput) {
  if (!dateInput || typeof dateInput !== "string") return null;
  const d = new Date(`${dateInput.trim()}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function statsDateToEndIso(dateInput) {
  if (!dateInput || typeof dateInput !== "string") return null;
  const d = new Date(`${dateInput.trim()}T23:59:59.999`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Скільки разів кожен слот розкладу (lesson_times) потрапляє у календарний період (дати yyyy-mm-dd, Київ).
 * @param {Array<{ day_of_week: number, start_time: string }>} slots
 * @param {string | null | undefined} fromDate
 * @param {string | null | undefined} toDate
 */
function countScheduledLessonOccurrencesInRange(slots, fromDate, toDate) {
  if (!fromDate || !toDate || !slots?.length) return null;

  const fromKyiv = DateTime.fromISO(fromDate, { zone: KYIV_TZ }).startOf("day");
  const toKyiv = DateTime.fromISO(toDate, { zone: KYIV_TZ }).endOf("day");
  if (!fromKyiv.isValid || !toKyiv.isValid || fromKyiv > toKyiv) return 0;

  const fromMs = fromKyiv.toUTC().toMillis();
  const toMs = toKyiv.toUTC().toMillis();
  let count = 0;

  for (let day = fromKyiv; day <= toKyiv; day = day.plus({ days: 1 })) {
    for (const row of slots) {
      if (day.weekday !== dbDayToLuxonWeekday(row.day_of_week)) continue;
      const { hour, minute, second } = parseTimeHms(row.start_time);
      const occMs = day.set({ hour, minute, second, millisecond: 0 }).toUTC().toMillis();
      if (occMs >= fromMs && occMs <= toMs) count += 1;
    }
  }

  return count;
}

/**
 * Абонементна виручка: спочатку фактичні візити з subscriptions; інакше голоси; інакше статичний прайс.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 */
async function computeLessonAbonRevenueForStats(supabaseAdmin, {
  lessonRow,
  lessonTypeId,
  votesByKind,
  priceByType,
  visitsByOccurrence,
}) {
  const prices = priceByType.get(lessonTypeId) || { single: 0, abonUnit: 0 };
  const staticAbonUnit = prices.abonUnit;
  const occurrenceId = String(lessonRow?.lesson_vote_occurrence_id || "").trim();
  const attendedVisits = (occurrenceId ? visitsByOccurrence.get(occurrenceId) : null) || [];
  const abonVisits = attendedVisits.filter((visit) => visit.vote_choice === "abon");

  if (abonVisits.length > 0) {
    let abonRevenue = 0;
    for (const visit of abonVisits) {
      let unitPrice = subscriptionVisitUnitPrice(visit.subscriptions);
      if (unitPrice <= 0) unitPrice = staticAbonUnit;
      abonRevenue += unitPrice;
    }
    return Math.round(abonRevenue * 100) / 100;
  }

  const abonMap = votesByKind?.abon instanceof Map ? votesByKind.abon : new Map();
  if (abonMap.size > 0) {
    const { abonRevenue } = await computeLessonRevenueFromVotes(supabaseAdmin, {
      lessonTypeId,
      votesByKind,
      priceByType,
    });
    return abonRevenue;
  }

  const abonCount = Math.max(0, Number(lessonRow?.abon_count) || 0);
  return Math.round(abonCount * staticAbonUnit * 100) / 100;
}

/** @param {ReturnType<typeof snapshotToVoteParticipant>} participant */
function participantDisplayName(participant) {
  const name = String(participant?.name || "").trim();
  return name || "—";
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ lessonTypeId: string, voteSnapshot: unknown, priceByType: Map<string, { single: number, abonUnit: number }> }} args
 */
async function buildStudentFinanceRowsFromSnapshot(supabaseAdmin, { lessonTypeId, voteSnapshot, priceByType }) {
  const votesByKind = snapshotToVotesByKind(voteSnapshot);
  const prices = priceByType.get(lessonTypeId) || { single: 0, abonUnit: 0 };
  /** @type {Array<{ name: string, telegramUsername: string | null, visitKind: "abon" | "single", amountUah: number }>} */
  const rows = [];

  for (const [uid, participant] of votesByKind.single.entries()) {
    const p = snapshotToVoteParticipant(uid, participant);
    rows.push({
      name: participantDisplayName(p),
      telegramUsername: p.telegram_username || null,
      visitKind: "single",
      amountUah: Math.round(prices.single * 100) / 100,
    });
  }

  const abonMap = votesByKind.abon;
  if (abonMap.size > 0) {
    /** @type {Map<string, number | string>} */
    const uidToTid = new Map();
    for (const uidStr of abonMap.keys()) {
      try {
        uidToTid.set(String(uidStr), telegramUserIdForDb(BigInt(String(uidStr)), String(uidStr)));
      } catch {
        // ignore invalid telegram id
      }
    }

    /** @type {Map<string, string>} */
    const studentIdByTid = new Map();
    let ownByStudent = new Map();
    let crossByStudent = new Map();
    const tidValues = [...new Set([...uidToTid.values()])];
    if (tidValues.length > 0) {
      const { data: students, error: stErr } = await supabaseAdmin
        .from("students")
        .select("id, telegram_user_id")
        .in("telegram_user_id", tidValues);
      if (stErr) throw new Error(stErr.message);

      for (const st of students || []) {
        studentIdByTid.set(String(st.telegram_user_id), String(st.id));
      }

      const studentIds = [...new Set((students || []).map((st) => String(st.id)))];
      if (studentIds.length > 0) {
        ({ ownByStudent, crossByStudent } = await loadAbonSubsByStudentForRevenue(
          supabaseAdmin,
          studentIds,
          lessonTypeId,
        ));
      }
    }

    for (const [uid, participant] of abonMap.entries()) {
      const p = snapshotToVoteParticipant(uid, participant);
      let amount = 0;
      const tid = uidToTid.get(String(uid));
      if (tid != null) {
        const studentId = studentIdByTid.get(String(tid));
        if (studentId) {
          const sub = pickAbonSubForStudentRevenue(ownByStudent, crossByStudent, studentId);
          if (sub) amount = subscriptionVisitUnitPrice(sub);
        }
      }
      if (amount <= 0) amount = prices.abonUnit;
      rows.push({
        name: participantDisplayName(p),
        telegramUsername: p.telegram_username || null,
        visitKind: "abon",
        amountUah: Math.round(amount * 100) / 100,
      });
    }
  }

  return rows;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} lessonId
 */
async function computeLessonFinanceBreakdown(supabaseAdmin, lessonId) {
  const { data: lesson, error: lessonErr } = await supabaseAdmin
    .from("lessons")
    .select(
      `id, starts_at, place_id, abon_count, single_visitors_count, vote_snapshot, lesson_vote_occurrence_id,
       teachers ( name, is_smm ),
       conducting_display_name,
       places ( name ),
       lesson_times ( lesson_types ( id, name, duration_minutes ) )`,
    )
    .eq("id", lessonId)
    .maybeSingle();
  if (lessonErr) throw new Error(lessonErr.message);
  if (!lesson) throw new Error("Запис заняття не знайдено.");

  const lessonType = lesson.lesson_times?.lesson_types || null;
  const lessonTypeId = String(lessonType?.id || "");
  const duration = Number(lessonType?.duration_minutes) || 60;
  const placeId = String(lesson.place_id || "");
  const occurrenceId = String(lesson.lesson_vote_occurrence_id || "").trim();

  const [pricesRes, smmRes, placePricesRes, visitsRes] = await Promise.all([
    supabaseAdmin.from("prices").select("lesson_type_id, price_kind, visits_count, amount_uah"),
    supabaseAdmin.from("smm_prices").select("people_from, people_to, amount_uah").order("people_from", { ascending: true }),
    supabaseAdmin.from("places_prices").select("place_id, duration_minutes, amount_uah"),
    occurrenceId
      ? supabaseAdmin
          .from("visits")
          .select(
            "id, vote_choice, students ( display_name, telegram_username ), subscriptions ( amount_uah, total_visits )",
          )
          .eq("lesson_vote_occurrence_id", occurrenceId)
          .eq("visit_status", "attended")
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (pricesRes.error) throw new Error(pricesRes.error.message);
  if (smmRes.error) throw new Error(smmRes.error.message);
  if (placePricesRes.error) throw new Error(placePricesRes.error.message);
  if (visitsRes.error) throw new Error(visitsRes.error.message);

  const priceByType = buildPriceByType(pricesRes.data || []);
  const prices = priceByType.get(lessonTypeId) || { single: 0, abonUnit: 0 };
  const placePriceMap = new Map(
    (placePricesRes.data || []).map((row) => [`${row.place_id}:${row.duration_minutes}`, Number(row.amount_uah) || 0]),
  );

  /** @type {Array<{ name: string, telegramUsername: string | null, visitKind: "abon" | "single", amountUah: number }>} */
  let studentRows = [];
  const visits = visitsRes.data || [];

  if (visits.length > 0) {
    for (const v of visits) {
      const isAbon = v.vote_choice === "abon";
      let amount = isAbon ? subscriptionVisitUnitPrice(v.subscriptions) : prices.single;
      if (isAbon && amount <= 0) amount = prices.abonUnit;
      studentRows.push({
        name: String(v.students?.display_name || "").trim() || "—",
        telegramUsername: v.students?.telegram_username || null,
        visitKind: isAbon ? "abon" : "single",
        amountUah: Math.round(amount * 100) / 100,
      });
    }
  } else {
    studentRows = await buildStudentFinanceRowsFromSnapshot(supabaseAdmin, {
      lessonTypeId,
      voteSnapshot: lesson.vote_snapshot,
      priceByType,
    });
  }

  let abonRevenue = 0;
  let singleRevenue = 0;
  for (const row of studentRows) {
    if (row.visitKind === "abon") abonRevenue += row.amountUah;
    else singleRevenue += row.amountUah;
  }
  abonRevenue = Math.round(abonRevenue * 100) / 100;
  singleRevenue = Math.round(singleRevenue * 100) / 100;
  const totalRevenue = Math.round((abonRevenue + singleRevenue) * 100) / 100;

  const peopleCount =
    studentRows.length ||
    Math.max(0, Number(lesson.abon_count) || 0) + Math.max(0, Number(lesson.single_visitors_count) || 0);
  const rent = placePriceMap.get(`${placeId}:${duration}`) ?? placePriceMap.get(`${placeId}:60`) ?? 0;
  const smmRaw = pickSmmAmount(smmRes.data || [], peopleCount);
  const isSmmTeacher = Boolean(lesson.teachers?.is_smm);
  const smm = isSmmTeacher ? 0 : smmRaw;
  const netProfit = Math.round((totalRevenue - rent - smm) * 100) / 100;

  const teacherName =
    lesson.teachers?.name?.trim() || String(lesson.conducting_display_name || "").trim() || "—";

  return {
    lesson: {
      startsAt: lesson.starts_at,
      teacherName,
      placeName: lesson.places?.name?.trim() || "—",
      lessonTypeName: lessonType?.name?.trim() || "—",
      peopleCount,
    },
    students: studentRows,
    summary: {
      totalRevenue,
      abonRevenue,
      singleRevenue,
      rent,
      smm,
      smmPool: smmRaw,
      isSmmTeacher,
      netProfit,
    },
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ fromIso?: string | null, toIso?: string | null }} range
 */
async function loadAdminStatsLessonsContext(supabaseAdmin, { fromIso, toIso }) {
  let lessonsQuery = supabaseAdmin
    .from("lessons")
    .select(
      `id, starts_at, abon_count, single_visitors_count, conducting_display_name, place_id,
       vote_snapshot, lesson_vote_occurrence_id,
       teachers(id, name, is_smm),
       places(name, river_bank),
       lesson_times(lesson_types(id, name, duration_minutes))`,
    );
  if (fromIso) lessonsQuery = lessonsQuery.gte("starts_at", fromIso);
  if (toIso) lessonsQuery = lessonsQuery.lte("starts_at", toIso);

  const [lessonsRes, pricesRes, smmRes, placePricesRes, smmTeacherRes] = await Promise.all([
    lessonsQuery,
    supabaseAdmin.from("prices").select("lesson_type_id, price_kind, visits_count, amount_uah"),
    supabaseAdmin.from("smm_prices").select("people_from, people_to, amount_uah").order("people_from", { ascending: true }),
    supabaseAdmin.from("places_prices").select("place_id, duration_minutes, amount_uah"),
    supabaseAdmin.from("teachers").select("id, name, chat_id").eq("is_smm", true).limit(1).maybeSingle(),
  ]);

  if (lessonsRes.error) throw new Error(lessonsRes.error.message);
  if (pricesRes.error) throw new Error(pricesRes.error.message);
  if (smmRes.error) throw new Error(smmRes.error.message);
  if (placePricesRes.error) throw new Error(placePricesRes.error.message);
  if (smmTeacherRes.error) throw new Error(smmTeacherRes.error.message);

  const priceByType = buildPriceByType(pricesRes.data || []);
  const smmRows = smmRes.data || [];
  const placePriceMap = new Map(
    (placePricesRes.data || []).map((row) => [`${row.place_id}:${row.duration_minutes}`, Number(row.amount_uah) || 0]),
  );

  const occurrenceIds = [
    ...new Set(
      (lessonsRes.data || [])
        .map((row) => String(row.lesson_vote_occurrence_id || "").trim())
        .filter(Boolean),
    ),
  ];

  /** @type {Map<string, Array<{ student_id?: string, vote_choice: string, subscriptions?: { amount_uah?: number | null, total_visits?: number | null } | null }>>} */
  const visitsByOccurrence = new Map();
  if (occurrenceIds.length > 0) {
    const { data: visitRows, error: visitErr } = await supabaseAdmin
      .from("visits")
      .select("student_id, lesson_vote_occurrence_id, vote_choice, visit_status, subscriptions(amount_uah, total_visits)")
      .in("lesson_vote_occurrence_id", occurrenceIds)
      .eq("visit_status", "attended");
    if (visitErr) throw new Error(visitErr.message);
    for (const visit of visitRows || []) {
      const oid = String(visit.lesson_vote_occurrence_id);
      if (!visitsByOccurrence.has(oid)) visitsByOccurrence.set(oid, []);
      visitsByOccurrence.get(oid).push(visit);
    }
  }

  const smmTeacher = smmTeacherRes.data
    ? { id: String(smmTeacherRes.data.id), name: String(smmTeacherRes.data.name || "").trim() || "SMM", chatId: smmTeacherRes.data.chat_id ? String(smmTeacherRes.data.chat_id) : null }
    : null;

  return {
    lessons: lessonsRes.data || [],
    priceByType,
    smmRows,
    placePriceMap,
    visitsByOccurrence,
    smmTeacher,
  };
}

/**
 * @param {Record<string, unknown>} row
 * @param {{ priceByType: Map<string, { single: number, abonUnit: number }>, smmRows: unknown[], placePriceMap: Map<string, number>, visitsByOccurrence: Map<string, unknown[]> }} ctx
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 */
async function computeLessonFinancialsForStats(supabaseAdmin, row, ctx) {
  const lessonType = row.lesson_times?.lesson_types || null;
  const lessonTypeId = String(lessonType?.id || "");
  const duration = Number(lessonType?.duration_minutes) || 60;
  const prices = ctx.priceByType.get(lessonTypeId) || { single: 0, abonUnit: 0 };

  const occurrenceId = String(row.lesson_vote_occurrence_id || "").trim();
  const attendedVisits = occurrenceId ? ctx.visitsByOccurrence.get(occurrenceId) || [] : [];

  let singleCount;
  let abonPeopleCount;
  if (attendedVisits.length > 0) {
    singleCount = attendedVisits.filter((visit) => visit.vote_choice === "single").length;
    abonPeopleCount = attendedVisits.filter((visit) => visit.vote_choice === "abon").length;
  } else {
    singleCount = Math.max(0, Number(row.single_visitors_count) || 0);
    abonPeopleCount = Math.max(0, Number(row.abon_count) || 0);
  }
  const peopleCount = singleCount + abonPeopleCount;

  const singleRevenue = singleCount * prices.single;
  const votesByKind = snapshotToVotesByKind(row.vote_snapshot);
  const abonRevenue = await computeLessonAbonRevenueForStats(supabaseAdmin, {
    lessonRow: row,
    lessonTypeId,
    votesByKind,
    priceByType: ctx.priceByType,
    visitsByOccurrence: ctx.visitsByOccurrence,
  });
  const revenue = Math.round((singleRevenue + abonRevenue) * 100) / 100;

  const placeId = String(row.place_id || "");
  const rent = ctx.placePriceMap.get(`${placeId}:${duration}`) ?? ctx.placePriceMap.get(`${placeId}:60`) ?? 0;
  const smm = pickSmmAmount(ctx.smmRows, peopleCount);
  const isSmmTeacher = Boolean(row.teachers?.is_smm);
  // ponytail: SMM teacher keeps full lesson payout; pool SMM is added later in dashboard/journal
  const payout = Math.round((revenue - rent - (isSmmTeacher ? 0 : smm)) * 100) / 100;

  const teacherName =
    row.teachers?.name?.trim() ||
    String(row.conducting_display_name || "").trim() ||
    "Без викладача";

  return {
    id: String(row.id || ""),
    startsAt: row.starts_at,
    lessonTypeName: String(lessonType?.name || "").trim() || "—",
    placeName: String(row.places?.name || "").trim() || "—",
    teacherId: row.teachers?.id ? String(row.teachers.id) : null,
    teacherName,
    isSmmTeacher,
    peopleCount,
    revenue,
    rent,
    smm,
    payout,
  };
}

/** @param {Record<string, unknown>} row @param {{ teacherId?: string, teacherName?: string }} filter */
function lessonMatchesTeacherFilter(row, { teacherId, teacherName }) {
  if (teacherId) {
    return String(row.teachers?.id || "") === teacherId;
  }
  const expected = String(teacherName || "").trim();
  if (!expected) return false;
  const actual =
    row.teachers?.name?.trim() ||
    String(row.conducting_display_name || "").trim() ||
    "Без викладача";
  return actual === expected;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ fromIso?: string | null, toIso?: string | null, fromDate?: string | null, toDate?: string | null }} range
 */
async function computeAdminStatsDashboard(supabaseAdmin, { fromIso, toIso, fromDate, toDate }) {
  const ctx = await loadAdminStatsLessonsContext(supabaseAdmin, { fromIso, toIso });

  /** @type {Map<string, { id: string | null, name: string, lessonsCount: number, peopleCount: number, revenue: number, rent: number, smm: number, smmIncome: number, isSmm: boolean, payout: number }>} */
  const byTeacher = new Map();
  let totalSmm = 0;

  for (const row of ctx.lessons) {
    const fin = await computeLessonFinancialsForStats(supabaseAdmin, row, ctx);
    totalSmm += fin.smm;
    const teacherKey = fin.teacherId || fin.teacherName;
    const agg = byTeacher.get(teacherKey) || {
      id: fin.teacherId,
      name: fin.teacherName,
      lessonsCount: 0,
      peopleCount: 0,
      revenue: 0,
      rent: 0,
      smm: 0,
      smmIncome: 0,
      isSmm: false,
      payout: 0,
    };
    agg.lessonsCount += 1;
    agg.peopleCount += fin.peopleCount;
    agg.revenue += fin.revenue;
    agg.rent += fin.rent;
    // SMM fee is school-level only; never on SMM teacher's card
    if (!fin.isSmmTeacher) agg.smm += fin.smm;
    agg.payout += fin.payout;
    if (fin.isSmmTeacher) agg.isSmm = true;
    byTeacher.set(teacherKey, agg);
  }

  if (ctx.smmTeacher) {
    const key = ctx.smmTeacher.id;
    const agg = byTeacher.get(key) || {
      id: ctx.smmTeacher.id,
      name: ctx.smmTeacher.name,
      lessonsCount: 0,
      peopleCount: 0,
      revenue: 0,
      rent: 0,
      smm: 0,
      smmIncome: 0,
      isSmm: true,
      payout: 0,
    };
    agg.isSmm = true;
    // SMM pool goes into overall teacher payout (chart + card total)
    agg.smmIncome = Math.round(totalSmm * 100) / 100;
    agg.payout = Math.round((agg.payout + totalSmm) * 100) / 100;
    byTeacher.set(key, agg);
  }

  const teachers = [...byTeacher.values()].sort((a, b) => b.payout - a.payout);
  const totalLessons = teachers.reduce((sum, row) => sum + row.lessonsCount, 0);
  const uniqueStudentIds = new Set();
  for (const visits of ctx.visitsByOccurrence.values()) {
    for (const visit of visits) {
      const sid = String(visit.student_id || "").trim();
      if (sid) uniqueStudentIds.add(sid);
    }
  }
  const totalPeople = uniqueStudentIds.size;
  const totalPeopleAll = teachers.reduce((sum, row) => sum + row.peopleCount, 0);
  const totalRevenue = teachers.reduce((sum, row) => sum + row.revenue, 0);
  const totalRent = teachers.reduce((sum, row) => sum + row.rent, 0);
  totalSmm = Math.round(totalSmm * 100) / 100;

  let totalScheduledLessons = null;
  if (fromDate && toDate) {
    const { data: scheduleSlots, error: scheduleErr } = await supabaseAdmin
      .from("lesson_times")
      .select("day_of_week, start_time")
      .not("place_id", "is", null);
    if (scheduleErr) throw new Error(scheduleErr.message);
    totalScheduledLessons = countScheduledLessonOccurrencesInRange(scheduleSlots || [], fromDate, toDate);
  }

  return {
    summary: {
      totalLessons,
      totalScheduledLessons,
      totalPeople,
      totalPeopleAll,
      totalNetAfterRent: totalRevenue - totalRent,
      totalSmm,
    },
    teachers,
  };
}

/**
 * BBM monthly digest: dashboard-like summary + direction/bank/visit-kind breakdowns.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ fromIso?: string | null, toIso?: string | null, fromDate?: string | null, toDate?: string | null }} args
 */
async function computeMonthlyDigestOverall(supabaseAdmin, { fromIso, toIso, fromDate, toDate }) {
  const dashboard = await computeAdminStatsDashboard(supabaseAdmin, { fromIso, toIso, fromDate, toDate });
  const ctx = await loadAdminStatsLessonsContext(supabaseAdmin, { fromIso, toIso });

  /** @type {Map<string, { id: string, name: string, lessonsCount: number, totalPeopleCount: number, revenue: number }>} */
  const byDirection = new Map();
  /** @type {Map<"left"|"right", { key: "left"|"right", label: string, lessonsCount: number, totalPeopleCount: number, revenue: number }>} */
  const byBank = new Map();
  let singleVisits = 0;
  let abonVisits = 0;

  for (const row of ctx.lessons) {
    const fin = await computeLessonFinancialsForStats(supabaseAdmin, row, ctx);
    const type = row.lesson_times?.lesson_types || null;
    const typeId = String(type?.id || "unknown");
    const typeName = String(type?.name || "Інше").trim() || "Інше";
    const dir = byDirection.get(typeId) || {
      id: typeId,
      name: typeName,
      lessonsCount: 0,
      totalPeopleCount: 0,
      revenue: 0,
    };
    dir.lessonsCount += 1;
    dir.totalPeopleCount += fin.peopleCount;
    dir.revenue += fin.revenue;
    byDirection.set(typeId, dir);

    const bank = parsePlaceRiverBank(row.places?.river_bank);
    if (bank === "left" || bank === "right") {
      const label = bank === "left" ? "Лівий" : "Правий";
      const b = byBank.get(bank) || {
        key: bank,
        label,
        lessonsCount: 0,
        totalPeopleCount: 0,
        revenue: 0,
      };
      b.lessonsCount += 1;
      b.totalPeopleCount += fin.peopleCount;
      b.revenue += fin.revenue;
      byBank.set(bank, b);
    }

    const oid = String(row.lesson_vote_occurrence_id || "").trim();
    const visits = oid ? ctx.visitsByOccurrence.get(oid) || [] : [];
    for (const v of visits) {
      if (v.vote_choice === "single") singleVisits += 1;
      else if (v.vote_choice === "abon") abonVisits += 1;
    }
  }

  const teachers = dashboard.teachers || [];
  const summary = {
    lessonsCount: Number(dashboard.summary?.totalLessons) || 0,
    uniquePeopleCount: Number(dashboard.summary?.totalPeople) || 0,
    totalPeopleCount:
      Number(dashboard.summary?.totalPeopleAll) ||
      teachers.reduce((sum, row) => sum + (Number(row.peopleCount) || 0), 0),
    revenue: teachers.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0),
    payout: teachers.reduce((sum, row) => sum + (Number(row.payout) || 0), 0),
    scheduledLessons:
      dashboard.summary?.totalScheduledLessons == null
        ? null
        : Number(dashboard.summary.totalScheduledLessons) || 0,
  };

  return {
    summary,
    byDirection: [...byDirection.values()].sort((a, b) => b.lessonsCount - a.lessonsCount),
    byBank: ["right", "left"]
      .map((k) => byBank.get(/** @type {"left"|"right"} */ (k)))
      .filter(Boolean),
    visitKinds: { single: singleVisits, abon: abonVisits },
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ teacherId?: string, teacherName?: string, fromIso?: string | null, toIso?: string | null }} args
 */
async function computeTeacherLessonsJournal(supabaseAdmin, { teacherId, teacherName, fromIso, toIso }) {
  const ctx = await loadAdminStatsLessonsContext(supabaseAdmin, { fromIso, toIso });
  const filter = { teacherId: teacherId || "", teacherName: teacherName || "" };
  const matched = ctx.lessons.filter((row) => lessonMatchesTeacherFilter(row, filter));

  /** @type {Array<Awaited<ReturnType<typeof computeLessonFinancialsForStats>>>} */
  const lessons = [];
  for (const row of matched) {
    lessons.push(await computeLessonFinancialsForStats(supabaseAdmin, row, ctx));
  }
  lessons.sort((a, b) => String(b.startsAt || "").localeCompare(String(a.startsAt || "")));

  const uniqueStudentIds = new Set();
  for (const row of matched) {
    const oid = String(row.lesson_vote_occurrence_id || "").trim();
    if (!oid) continue;
    for (const visit of ctx.visitsByOccurrence.get(oid) || []) {
      const sid = String(visit.student_id || "").trim();
      if (sid) uniqueStudentIds.add(sid);
    }
  }

  const summary = lessons.reduce(
    (acc, lesson) => {
      acc.lessonsCount += 1;
      acc.peopleCount += lesson.peopleCount;
      acc.revenue += lesson.revenue;
      acc.rent += lesson.rent;
      if (!lesson.isSmmTeacher) acc.smm += lesson.smm;
      acc.payout += lesson.payout;
      return acc;
    },
    { lessonsCount: 0, peopleCount: 0, revenue: 0, rent: 0, smm: 0, smmIncome: 0, isSmm: false, payout: 0 },
  );
  summary.uniquePeopleCount = uniqueStudentIds.size;

  const isSmmJournal =
    Boolean(ctx.smmTeacher) &&
    ((teacherId && ctx.smmTeacher.id === teacherId) ||
      (!teacherId && teacherName && ctx.smmTeacher.name === String(teacherName).trim()) ||
      lessons.some((l) => l.isSmmTeacher));
  if (isSmmJournal) {
    let poolSmm = 0;
    for (const row of ctx.lessons) {
      const fin = await computeLessonFinancialsForStats(supabaseAdmin, row, ctx);
      poolSmm += fin.smm;
    }
    summary.isSmm = true;
    summary.smmIncome = Math.round(poolSmm * 100) / 100;
    summary.payout = Math.round((summary.payout + poolSmm) * 100) / 100;
  }

  return {
    teacherName: lessons[0]?.teacherName || (isSmmJournal ? ctx.smmTeacher?.name : null) || teacherName || "—",
    summary,
    lessons: lessons.map(({ id, startsAt, lessonTypeName, placeName, peopleCount, revenue, rent, smm, payout, isSmmTeacher }) => ({
      id,
      startsAt,
      lessonTypeName,
      placeName,
      peopleCount,
      revenue,
      rent,
      smm: isSmmTeacher ? 0 : smm,
      payout,
      hideSmm: Boolean(isSmmTeacher),
    })),
  };
}

function countAttendingFromVotes(votesByKind) {
  const abon = Math.max(0, Number(votesByKind?.abon?.size) || 0);
  const single = Math.max(0, Number(votesByKind?.single?.size) || 0);
  return { abon, single, peopleCount: abon + single };
}

/** Та сама логіка, що POST /api/admin/lessons/delete (хрестик у картці заняття). */
async function deleteAdminLessonRecord(lessonId) {
  if (!supabaseAdmin) {
    return { ok: false, error: "Supabase admin client is not configured." };
  }
  const id = String(lessonId || "").trim();
  if (!id) {
    return { ok: false, error: "Missing lesson id." };
  }

  const { data: lessonRow, error: lessonErr } = await supabaseAdmin
    .from("lessons")
    .select("id, lesson_vote_occurrence_id")
    .eq("id", id)
    .maybeSingle();
  if (lessonErr) {
    return { ok: false, error: lessonErr.message };
  }
  if (!lessonRow) {
    return { ok: false, error: "Запис заняття не знайдено." };
  }

  const linkedOccurrenceId = String(lessonRow.lesson_vote_occurrence_id || "").trim() || null;

  if (linkedOccurrenceId) {
    try {
      await rollbackVisitsForOccurrence(supabaseAdmin, linkedOccurrenceId);
    } catch (e) {
      return { ok: false, error: e?.message || "Failed to rollback visits." };
    }
  }

  const { error: delLessonErr } = await supabaseAdmin.from("lessons").delete().eq("id", id);
  if (delLessonErr) {
    return { ok: false, error: delLessonErr.message };
  }

  // Рядок lesson_vote_occurrences лишається finalized — інакше планувальник знову створить
  // голосування на той самий слот і дату (loadOccupiedOccurrenceAtByLessonTimeId).
  return { ok: true, lessonId: id, linkedOccurrenceId };
}

function buildTwoStudentReviewMessage(lessonContext, abonCount, singleCount, netIncome) {
  const parts = [];
  if (abonCount > 0) parts.push(`${abonCount} абон.`);
  if (singleCount > 0) parts.push(`${singleCount} разов.`);
  const breakdown = parts.length ? parts.join(" + ") : "2 учні";

  const earningsLine =
    netIncome != null && Number.isFinite(Number(netIncome))
      ? `Заробіток: ${formatMoneyUah(netIncome)}`
      : "Заробіток: —";

  return [
    `На занятті лише 2 учні (${breakdown}). Ти будеш проводити цей урок?`,
    "",
    earningsLine,
    "",
    `🕒 Час: ${lessonContext.lessonTimeLabel}`,
    `📍 Місце: ${lessonContext.placeLabel}`,
    `💃 Напрям: ${lessonContext.lessonTypeLabel}`,
  ].join("\n");
}

function buildTwoStudentReviewKeyboard(reviewId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Актуальний урок", callback_data: `lesson_review_keep:${reviewId}` },
        { text: "🗑 Видалити заняття", callback_data: `lesson_review_delete:${reviewId}` },
      ],
    ],
  };
}

async function notifyTeacherTwoStudentReview({
  row,
  lessonContext,
  votesByKind,
  conductingDisplayName,
  conductingTelegramChatId,
  lessonId,
  abonCount,
  singleCount,
}) {
  if (!bot) return;
  const teacherChatId = String(conductingTelegramChatId || "").trim();
  const payoutArgs = {
    row,
    lessonContext,
    votesByKind,
    conductingDisplayName,
    conductingTelegramChatId: teacherChatId,
  };

  const reviewId = `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const payoutBreakdown = await computeConductingTeacherPayoutBreakdown(row, votesByKind);
  const netIncome = payoutBreakdown?.netIncome ?? null;
  const text = buildTwoStudentReviewMessage(lessonContext, abonCount, singleCount, netIncome);
  const markup = buildTwoStudentReviewKeyboard(reviewId);

  /** @type {{ chatId: string }[]} */
  let targets = [];
  if (teacherChatId) {
    targets = [{ chatId: teacherChatId }];
  } else {
    try {
      targets = await loadDigestTeacherTargets();
    } catch (e) {
      console.warn("notifyTeacherTwoStudentReview loadDigestTeacherTargets:", e?.message || e);
      await notifyConductingTeacherPayout(payoutArgs);
      return;
    }
    if (!targets.length) {
      console.warn("notifyTeacherTwoStudentReview: no digest teachers with chat_id; skipping form");
      await notifyConductingTeacherPayout(payoutArgs);
      return;
    }
  }

  const persistedMessages = [];
  for (const t of targets) {
    try {
      const sent = await bot.telegram.sendMessage(t.chatId, text, { reply_markup: markup });
      const entry = {
        chat_id: String(sent.chat.id),
        message_id: Number(sent.message_id),
        review_id: reviewId,
      };
      persistedMessages.push(entry);
      activeLessonReviews.set(attendanceGroupMemoryKey(entry.chat_id, entry.message_id), {
        reviewId,
        lessonId,
        row,
        lessonContext,
        votesByKind,
        conductingDisplayName: conductingDisplayName ?? null,
        conductingTelegramChatId: teacherChatId || null,
        netIncome,
      });
    } catch (e) {
      console.warn(
        "notifyTeacherTwoStudentReview send:",
        t.chatId,
        e?.description || e?.message || e,
      );
    }
  }

  if (!persistedMessages.length) {
    await notifyConductingTeacherPayout(payoutArgs);
    return;
  }

  // Keep row.two_student_review_message in sync for sibling deactivate before DB round-trip.
  if (row) row.two_student_review_message = persistedMessages;
  await persistTwoStudentReviewMessages(row.id, persistedMessages);
}

async function handlePostFinalizeTeacherNotifications({
  row,
  lessonContext,
  votesByKind,
  conductingDisplayName,
  conductingTelegramChatId,
  lessonId,
}) {
  if (row?.is_test) return;

  const { abon, single, peopleCount } = countAttendingFromVotes(votesByKind);
  const payoutArgs = {
    row,
    lessonContext,
    votesByKind,
    conductingDisplayName,
    conductingTelegramChatId,
  };

  if (peopleCount === 2) {
    await notifyTeacherTwoStudentReview({
      row,
      lessonContext,
      votesByKind,
      conductingDisplayName,
      conductingTelegramChatId,
      lessonId,
      abonCount: abon,
      singleCount: single,
    });
    return;
  }

  await notifyConductingTeacherPayout(payoutArgs);
}

async function computeConductingTeacherPayoutBreakdown(row, votesByKind) {
  if (!supabaseAdmin) return null;

  const singleCount = Math.max(0, Number(votesByKind?.single?.size) || 0);
  const abonCount = Math.max(0, Number(votesByKind?.abon?.size) || 0);
  const peopleCount = singleCount + abonCount;

  let lessonTypeId = "";
  let lessonDuration = 60;
  try {
    const { data: lessonTimeRow, error: lessonTimeErr } = await supabaseAdmin
      .from("lesson_times")
      .select("lesson_type_id, lesson_types(duration_minutes)")
      .eq("id", row.lesson_time_id)
      .maybeSingle();
    if (lessonTimeErr) {
      console.warn("computeConductingTeacherPayoutBreakdown lesson_times:", lessonTimeErr.message);
      return null;
    }
    lessonTypeId = String(lessonTimeRow?.lesson_type_id || "");
    lessonDuration = Number(lessonTimeRow?.lesson_types?.duration_minutes) || 60;
  } catch (e) {
    console.warn("computeConductingTeacherPayoutBreakdown lesson_times:", e?.message || e);
    return null;
  }

  try {
    const [pricesRes, smmRes, placePricesRes] = await Promise.all([
      supabaseAdmin.from("prices").select("lesson_type_id, price_kind, visits_count, amount_uah"),
      supabaseAdmin.from("smm_prices").select("people_from, people_to, amount_uah").order("people_from", { ascending: true }),
      supabaseAdmin.from("places_prices").select("place_id, duration_minutes, amount_uah"),
    ]);

    if (pricesRes.error || smmRes.error || placePricesRes.error) {
      console.warn(
        "computeConductingTeacherPayoutBreakdown prices:",
        pricesRes.error?.message || smmRes.error?.message || placePricesRes.error?.message,
      );
      return null;
    }

    const priceByType = buildPriceByType(pricesRes.data || []);
    const revenueFromVisits = await computeLessonRevenueFromAttendedVisits(
      supabaseAdmin,
      row?.id,
      lessonTypeId,
      priceByType,
    );
    const revenueBreakdown =
      revenueFromVisits ||
      (await computeLessonRevenueFromVotes(supabaseAdmin, {
        lessonTypeId,
        votesByKind,
        priceByType,
      }));
    const { abonRevenue, singleRevenue, totalRevenue } = revenueBreakdown;
    const effectivePeopleCount = revenueFromVisits
      ? revenueFromVisits.abonCount + revenueFromVisits.singleCount
      : peopleCount;
    const placePriceMap = new Map(
      (placePricesRes.data || []).map((pp) => [`${pp.place_id}:${pp.duration_minutes}`, Number(pp.amount_uah) || 0]),
    );
    const placeId = String(row.place_id || "");
    const rent = placePriceMap.get(`${placeId}:${lessonDuration}`) ?? placePriceMap.get(`${placeId}:60`) ?? 0;
    const smmPool = pickSmmAmount(smmRes.data || [], effectivePeopleCount);
    let isSmmTeacher = false;
    const teacherId = row?.teacher_id ? String(row.teacher_id).trim() : "";
    if (teacherId) {
      const { data: tRow } = await supabaseAdmin.from("teachers").select("is_smm").eq("id", teacherId).maybeSingle();
      isSmmTeacher = Boolean(tRow?.is_smm);
    }
    const smm = isSmmTeacher ? 0 : smmPool;
    const netIncome = Math.round((totalRevenue - rent - smm) * 100) / 100;

    return {
      abonRevenue,
      singleRevenue,
      totalRevenue,
      rent,
      smm,
      smmPool,
      isSmmTeacher,
      netIncome,
      peopleCount: effectivePeopleCount,
    };
  } catch (e) {
    console.warn("computeConductingTeacherPayoutBreakdown:", e?.message || e);
    return null;
  }
}

async function notifySmmTeacherPayout(smmAmount) {
  if (!bot || !supabaseAdmin) return;
  const amount = Math.round((Number(smmAmount) || 0) * 100) / 100;
  if (amount <= 0) return;
  try {
    const { data: smmTeacher, error } = await supabaseAdmin
      .from("teachers")
      .select("chat_id")
      .eq("is_smm", true)
      .not("chat_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("notifySmmTeacherPayout:", error.message);
      return;
    }
    const chatId = smmTeacher?.chat_id != null ? String(smmTeacher.chat_id).trim() : "";
    if (!chatId) return;
    await bot.telegram.sendMessage(chatId, `📣 Виплата SMM: ${formatMoneyUah(amount)}`);
  } catch (e) {
    console.warn("notifySmmTeacherPayout:", e?.description || e?.message || e);
  }
}

async function notifyConductingTeacherPayout({
  row,
  lessonContext,
  votesByKind,
  conductingDisplayName,
  conductingTelegramChatId,
}) {
  if (!bot || !supabaseAdmin) return;

  try {
    const breakdown = await computeConductingTeacherPayoutBreakdown(row, votesByKind);
    if (!breakdown) return;

    const teacherChatId = conductingTelegramChatId != null ? String(conductingTelegramChatId).trim() : "";
    if (teacherChatId) {
      const { abonRevenue, singleRevenue, rent, smm, netIncome, isSmmTeacher } = breakdown;
      const payoutText = [
        `📘 Абонемент: ${formatMoneyUah(abonRevenue)}`,
        `🎟️ Разове: ${formatMoneyUah(singleRevenue)}`,
        isSmmTeacher ? null : `📣 Оплата SMM: - ${formatMoneyUah(smm)}`,
        `🏠 Оплата оренди: - ${formatMoneyUah(rent)}`,
        `🧾 Чистий дохід: ${formatMoneyUah(netIncome)}`,
      ]
        .filter(Boolean)
        .join("\n");

      await bot.telegram.sendMessage(teacherChatId, payoutText);
    }

    await notifySmmTeacherPayout(breakdown.smmPool);
  } catch (e) {
    console.warn("notifyConductingTeacherPayout:", e?.description || e?.message || e);
  }
}

function buildLessonConductMessage(lessonContext, conductorDisplayName) {
  const who =
    typeof conductorDisplayName === "string" && conductorDisplayName.trim().length > 0
      ? conductorDisplayName.trim()
      : "поки ніхто не натиснув";

  return [
    "👩‍🏫 Хто проводить заняття?",
    "",
    `🕒 Час: ${lessonContext.lessonTimeLabel}`,
    `📍 Місце: ${lessonContext.placeLabel}`,
    `💃 Напрям: ${lessonContext.lessonTypeLabel}`,
    "",
    `Проводить: ${who}`,
  ].join("\n");
}

function buildLessonConductKeyboard(conductId) {
  return {
    inline_keyboard: [
      [{ text: "Я провожу", callback_data: `lesson_conduct:${conductId}` }],
    ],
  };
}

/** Ключ у форматі `chatId:messageId` (chat id може бути від’ємним) */
function parseMessageStateKey(stateKey) {
  const s = String(stateKey || "");
  const i = s.lastIndexOf(":");
  if (i <= 0) return null;
  const chatId = s.slice(0, i);
  const messageId = Number(s.slice(i + 1));
  if (!chatId || !Number.isFinite(messageId)) return null;
  return { chatId, messageId };
}

function attendanceGroupMemoryKey(chatId, messageId) {
  return `${String(chatId)}:${Number(messageId)}`;
}

function votesByKindToSnapshot(votesByKind) {
  const out = { abon: {}, single: {}, skip: {} };
  for (const k of ["abon", "single", "skip"]) {
    const m = votesByKind?.[k];
    if (!(m instanceof Map)) continue;
    for (const [uid, participant] of m.entries())
      out[k][String(uid)] = voteParticipantToSnapshotStored(String(uid), participant);
  }
  return out;
}

function snapshotToVotesByKind(snap) {
  const votesByKind = { abon: new Map(), single: new Map(), skip: new Map() };
  if (!snap || typeof snap !== "object") return votesByKind;
  for (const k of ["abon", "single", "skip"]) {
    const obj = snap[k];
    if (obj && typeof obj === "object") {
      for (const [uid, raw] of Object.entries(obj))
        votesByKind[k].set(String(uid), snapshotToVoteParticipant(String(uid), raw));
    }
  }
  return votesByKind;
}

/** Добирає @нік з students для голосів, збережених без username. */
async function enrichVotesByKindUsernames(votesByKind) {
  if (!supabaseAdmin || !votesByKind) return;
  const uids = new Set();
  for (const k of ["abon", "single", "skip"]) {
    const m = votesByKind[k];
    if (!(m instanceof Map)) continue;
    for (const [uid, participant] of m.entries()) {
      if (normalizeTelegramUsername(participant?.telegram_username)) continue;
      uids.add(String(uid));
    }
  }
  if (!uids.size) return;

  const numericUids = [...uids].map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (!numericUids.length) return;

  const { data: students, error: stErr } = await supabaseAdmin
    .from("students")
    .select("telegram_user_id, telegram_username")
    .in("telegram_user_id", numericUids);
  if (stErr) {
    console.warn("enrichVotesByKindUsernames:", stErr.message);
    return;
  }

  const byUid = new Map();
  for (const row of students || []) {
    const un = normalizeTelegramUsername(row.telegram_username);
    if (un) byUid.set(String(row.telegram_user_id), un);
  }
  if (!byUid.size) return;

  for (const k of ["abon", "single", "skip"]) {
    const m = votesByKind[k];
    if (!(m instanceof Map)) continue;
    for (const [uid, participant] of m.entries()) {
      if (normalizeTelegramUsername(participant?.telegram_username)) continue;
      const un = byUid.get(String(uid));
      if (un) m.set(uid, { ...participant, telegram_username: un });
    }
  }
}

async function persistOccurrenceVotesOnly(voteOccurrenceId, votesByKind) {
  if (!voteOccurrenceId || !supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin
      .from("lesson_vote_occurrences")
      .update({ votes_snapshot: votesByKindToSnapshot(votesByKind) })
      .eq("id", voteOccurrenceId);
    if (error) console.error("persistOccurrenceVotesOnly:", error.message);
  } catch (e) {
    console.error("persistOccurrenceVotesOnly:", e?.message || e);
  }
}

async function persistOccurrenceConducting(voteOccurrenceId, conductingDisplayName, conductingTelegramChatId) {
  if (!voteOccurrenceId || !supabaseAdmin) return;
  try {
    const val =
      typeof conductingDisplayName === "string" && conductingDisplayName.trim().length > 0
        ? conductingDisplayName.trim()
        : null;
    const chatVal =
      typeof conductingTelegramChatId === "string" && conductingTelegramChatId.trim().length > 0
        ? conductingTelegramChatId.trim()
        : null;
    const { error } = await supabaseAdmin
      .from("lesson_vote_occurrences")
      .update({
        conducting_display_name: val,
        conducting_telegram_chat_id: chatVal,
      })
      .eq("id", voteOccurrenceId);
    if (error) console.error("persistOccurrenceConducting:", error.message);
  } catch (e) {
    console.error("persistOccurrenceConducting:", e?.message || e);
  }
}

async function refreshGroupAttendanceAfterConduct(
  linkedGroupVoteKey,
  conductingDisplayName,
  conductingTelegramChatId,
) {
  if (!bot || !linkedGroupVoteKey) return;
  const groupState = activeLessonVotes.get(linkedGroupVoteKey);
  if (!groupState) return;

  groupState.conductingDisplayName =
    typeof conductingDisplayName === "string" && conductingDisplayName.trim().length > 0
      ? conductingDisplayName.trim()
      : null;

  const conductChatStr =
    conductingTelegramChatId != null && String(conductingTelegramChatId).trim().length > 0
      ? String(conductingTelegramChatId).trim()
      : null;
  groupState.conductingTelegramChatId = conductChatStr;

  const parts = parseMessageStateKey(linkedGroupVoteKey);
  if (!parts) return;

  const text = buildLessonVoteMessage({
    ...groupState.lessonContext,
    votesByKind: groupState.votesByKind,
    teacherName: groupState.teacherName,
    conductingDisplayName: groupState.conductingDisplayName,
    audience: groupState.audience || "dm",
  });

  try {
    await bot.telegram.editMessageText(parts.chatId, parts.messageId, undefined, text, {
      reply_markup: buildLessonVoteKeyboard(groupState.voteId),
    });
  } catch (err) {
    if (!isTelegramMessageNotModifiedError(err)) {
      console.error("Failed to refresh group attendance message:", err?.description || err?.message || err);
    }
  }

  // Sync "Я провожу" state across all teachers' private chats for this same group vote.
  const conductText = buildLessonConductMessage(groupState.lessonContext, groupState.conductingDisplayName);
  const updatedConductKeys = new Set();
  for (const [cKey, cState] of activeConductVotes.entries()) {
    if (cState?.linkedGroupVoteKey !== linkedGroupVoteKey) continue;
    const cParts = parseMessageStateKey(cKey);
    if (!cParts) continue;
    updatedConductKeys.add(cKey);
    try {
      await bot.telegram.editMessageText(cParts.chatId, cParts.messageId, undefined, conductText, {
        reply_markup: buildLessonConductKeyboard(cState.conductId),
      });
      cState.conductorDisplayName = groupState.conductingDisplayName;
    } catch (err) {
      if (!isTelegramMessageNotModifiedError(err)) {
        console.error("Failed to refresh teacher conduct message:", err?.description || err?.message || err);
      }
    }
  }

  // If this conduct message was restored only from DB row and is not in memory map, sync it too.
  const rowConductMessages = Array.isArray(groupState?.conductMessages) ? groupState.conductMessages : [];
  for (const c of rowConductMessages) {
    const cid = c?.chat_id;
    const mid = c?.message_id;
    const conductId = c?.conduct_id;
    if (!cid || !Number.isFinite(Number(mid)) || !conductId) continue;
    const key = attendanceGroupMemoryKey(String(cid), Number(mid));
    if (updatedConductKeys.has(key)) continue;
    try {
      await bot.telegram.editMessageText(String(cid), Number(mid), undefined, conductText, {
        reply_markup: buildLessonConductKeyboard(String(conductId)),
      });
    } catch (err) {
      if (!isTelegramMessageNotModifiedError(err)) {
        console.error("Failed to refresh teacher conduct message (from row):", err?.description || err?.message || err);
      }
    }
  }

  if (groupState.voteOccurrenceId) {
    await persistOccurrenceConducting(
      groupState.voteOccurrenceId,
      groupState.conductingDisplayName,
      groupState.conductingTelegramChatId,
    );
  }
}

async function resolveTeacherIdByTelegramChatId(chatIdRaw) {
  if (!supabaseAdmin || chatIdRaw == null || chatIdRaw === "") return null;
  const cid = String(chatIdRaw).trim();
  if (!cid) return null;
  try {
    const { data, error } = await supabaseAdmin.from("teachers").select("id").eq("chat_id", cid).maybeSingle();
    if (error) {
      console.warn("resolveTeacherIdByTelegramChatId:", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.warn("resolveTeacherIdByTelegramChatId:", e?.message || e);
    return null;
  }
}

/**
 * @param {{ lessonBank?: "left"|"right"|null }} [opts]
 */
async function loadTeacherTargetsWithChatId(opts = {}) {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from("teachers")
    .select("id, name, chat_id, river_bank_scope")
    .not("chat_id", "is", null);

  if (error) {
    throw new Error(`Failed to load teachers with chat_id: ${error.message}`);
  }

  const lessonBank = opts.lessonBank ?? null;
  const seen = new Set();
  const result = [];
  for (const row of data || []) {
    const scope = row.river_bank_scope || "any";
    if (lessonBank != null && !teacherMatchesBank(scope, lessonBank)) continue;

    const chatId = String(row.chat_id || "").trim();
    if (!chatId || seen.has(chatId)) continue;
    seen.add(chatId);
    result.push({
      id: row.id,
      name: row.name || "Викладач",
      chatId,
      river_bank_scope: scope,
    });
  }
  return result;
}

/** Викладачі з увімкненим дайджестом (для broadcast форми «2 учні» без conducting). */
async function loadDigestTeacherTargets() {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from("teachers")
    .select("id, name, chat_id")
    .eq("digest_enabled", true)
    .not("chat_id", "is", null);

  if (error) {
    throw new Error(`Failed to load digest teachers: ${error.message}`);
  }

  const seen = new Set();
  const result = [];
  for (const row of data || []) {
    const chatId = String(row.chat_id || "").trim();
    if (!chatId || seen.has(chatId)) continue;
    seen.add(chatId);
    result.push({
      id: row.id,
      name: row.name || "Викладач",
      chatId,
    });
  }
  return result;
}

async function resolveTeacherDisplayNameByChatId(chatIdRaw) {
  if (!supabaseAdmin || chatIdRaw == null || chatIdRaw === "") return null;
  const cid = String(chatIdRaw).trim();
  if (!cid) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("teachers")
      .select("name")
      .eq("chat_id", cid)
      .maybeSingle();
    if (error) {
      console.warn("resolveTeacherDisplayNameByChatId:", error.message);
      return null;
    }
    const name = data?.name != null ? String(data.name).trim() : "";
    return name || null;
  } catch (e) {
    console.warn("resolveTeacherDisplayNameByChatId:", e?.message || e);
    return null;
  }
}

/** 0 = неділя … 6 = субота (як у БД) → Luxon weekday (1 = Mon … 7 = Sun) */
function dbDayToLuxonWeekday(dbDow) {
  const n = Number(dbDow);
  return n === 0 ? 7 : n;
}

function parseTimeHms(timeStr) {
  const parts = String(timeStr || "00:00:00").split(":");
  return {
    hour: Number(parts[0]) || 0,
    minute: Number(parts[1]) || 0,
    second: Number(parts[2]) || 0,
  };
}

/** Найближчий майбутній початок слоту за київським часом (без урахування БД). */
function computeFirstFutureOccurrenceKyiv(row, nowKyiv = DateTime.now().setZone(KYIV_TZ)) {
  const luxWd = dbDayToLuxonWeekday(row.day_of_week);
  const { hour, minute, second } = parseTimeHms(row.start_time);
  let daysUntil = (luxWd - nowKyiv.weekday + 7) % 7;
  if (daysUntil === 0) {
    const todaySlot = nowKyiv.set({ hour, minute, second, millisecond: 0 });
    if (todaySlot <= nowKyiv) daysUntil = 7;
  }
  return nowKyiv.plus({ days: daysUntil }).set({ hour, minute, second, millisecond: 0 });
}

/**
 * Наступний проведення слота, для якого ще немає рядка в lesson_vote_occurrences.
 * Для щотижневих слотів крокає +1 тиждень — без обмеження «8 тижнів уперед».
 */
function computeNextSchedulableOccurrenceKyiv(row, nowKyiv, occupiedIsoSet = null) {
  const first = computeFirstFutureOccurrenceKyiv(row, nowKyiv);
  if (!occupiedIsoSet?.size) return first;

  let candidate = first;
  for (let w = 0; w < 104; w++) {
    const iso = normalizeOccurrenceAtIso(candidate.toUTC().toISO());
    if (!occupiedIsoSet.has(iso)) return candidate;
    candidate = candidate.plus({ weeks: 1 });
  }
  return null;
}

/**
 * Найближче «останнє» заняття: серед усіх слотів розкладу той, що вже відбувся
 * останнім за київським часом (остання подія у минулому).
 */
async function resolveNearestLastLessonSlot() {
  if (!supabaseAdmin) {
    return { lessonTimeId: null, placeId: null, occurredAt: null };
  }

  const { data: rows, error } = await supabaseAdmin
    .from("lesson_times")
    .select("id, place_id, day_of_week, start_time");

  if (error) {
    throw new Error(`Failed to load lesson_times: ${error.message}`);
  }
  if (!rows?.length) {
    return { lessonTimeId: null, placeId: null, occurredAt: null };
  }

  const now = DateTime.now().setZone(KYIV_TZ);
  let bestRow = null;
  let bestDt = null;

  for (const row of rows) {
    const { hour, minute, second } = parseTimeHms(row.start_time);
    const luxWd = dbDayToLuxonWeekday(row.day_of_week);
    let rowBest = null;
    for (let i = 0; i < 21; i++) {
      const day = now.minus({ days: i });
      if (day.weekday !== luxWd) continue;
      const slotDt = day.set({ hour, minute, second, millisecond: 0 });
      if (slotDt <= now) {
        if (!rowBest || slotDt > rowBest) rowBest = slotDt;
      }
    }
    if (rowBest && (!bestDt || rowBest > bestDt)) {
      bestDt = rowBest;
      bestRow = row;
    }
  }

  if (!bestRow || !bestDt) {
    return { lessonTimeId: null, placeId: null, occurredAt: null };
  }

  return {
    lessonTimeId: bestRow.id,
    placeId: bestRow.place_id,
    occurredAt: bestDt.toISO(),
  };
}

async function resolveLessonIdsForVote(body) {
  const reqLessonTimeId = String(body?.lesson_time_id || "").trim();
  const reqPlaceId = String(body?.place_id || "").trim();

  let lessonTimeId = reqLessonTimeId || null;
  let placeId = reqPlaceId || null;
  let defaultUsed = false;
  let occurredAt = null;

  if (!lessonTimeId) {
    const last = await resolveNearestLastLessonSlot();
    lessonTimeId = last.lessonTimeId;
    placeId = last.placeId;
    occurredAt = last.occurredAt;
    defaultUsed = true;
  } else if (supabaseAdmin) {
    if (!placeId) {
      const { data, error } = await supabaseAdmin
        .from("lesson_times")
        .select("place_id")
        .eq("id", lessonTimeId)
        .maybeSingle();
      if (error) throw new Error(`Failed to load lesson_time place: ${error.message}`);
      if (data?.place_id) placeId = data.place_id;
    }
  }

  return { lessonTimeId, placeId, defaultUsed, occurredAt };
}

async function loadLessonContext(lessonTimeId, placeId) {
  let lessonTypeId = null;
  if (!supabaseAdmin) {
    return {
      lessonTimeLabel: "не вказано",
      placeLabel: "не вказано",
      lessonTypeLabel: "не вказано",
      riverBank: null,
      lessonTypeId: null,
    };
  }

  let lessonTimeLabel = "не вказано";
  let placeLabel = "не вказано";
  let lessonTypeLabel = "не вказано";
  let riverBank = null;

  if (lessonTimeId) {
    const { data, error } = await supabaseAdmin
      .from("lesson_times")
      .select("day_of_week, start_time, lesson_types(name, id)")
      .eq("id", lessonTimeId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load lesson_time: ${error.message}`);
    if (data) {
      const di = Number(data.day_of_week);
      const dayName = Number.isFinite(di) && di >= 0 && di <= 6 ? DAY_SHORT_UK[di] : `день ${data.day_of_week}`;
      lessonTimeLabel = `${dayName}, ${String(data.start_time || "").slice(0, 5)} (Київ)`;
      lessonTypeLabel = data.lesson_types?.name || lessonTypeLabel;
      lessonTypeId = data.lesson_types?.id ?? null;
    }
  }

  if (placeId) {
    const { data, error } = await supabaseAdmin
      .from("places")
      .select("name, river_bank")
      .eq("id", placeId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load place: ${error.message}`);
    if (data?.name) placeLabel = data.name;
    if (typeof data?.river_bank === "string" && data.river_bank.trim()) riverBank = data.river_bank.trim();
  }

  return { lessonTimeLabel, placeLabel, lessonTypeLabel, riverBank, lessonTypeId };
}

/**
 * Відкриває групове голосування + розсилку викладачам; за потреби фіксує рядок у lesson_vote_occurrences.
 * @returns {Promise<{ success: true; payload: object } | { success: false; duplicate: true } | { success: false; error: string; httpStatus?: number }>}
 */
async function executeLessonAttendanceVote(opts) {
  const {
    lessonTimeId,
    placeId,
    defaultUsed = false,
    occurredAt = null,
    persistToDb = false,
    occurrenceAtIso = null,
    isTest = false,
  } = opts;

  if (!bot) {
    return { success: false, error: "TELEGRAM_BOT_TOKEN is not configured.", httpStatus: 500 };
  }
  if (!supabaseAdmin) {
    return { success: false, error: "Supabase admin client is not configured.", httpStatus: 500 };
  }

  const lessonContext = await loadLessonContext(lessonTimeId, placeId);

  const resolvedGroup = resolveGroupVoteChatIdForLessonPlace(lessonContext.riverBank);
  if (resolvedGroup.error || !resolvedGroup.chatId) {
    return {
      success: false,
      error: resolvedGroup.error || "Не вдалося обрати Telegram-групу для голосування.",
      httpStatus: 400,
    };
  }
  const groupChatId = resolvedGroup.chatId;
  const lessonBank = resolvedGroup.bank || parsePlaceRiverBank(lessonContext.riverBank);
  const teachers = await loadTeacherTargetsWithChatId({ lessonBank });

  const voteId = `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const lessonSnapshot = {
    lessonTimeLabel: lessonContext.lessonTimeLabel,
    placeLabel: lessonContext.placeLabel,
    lessonTypeLabel: lessonContext.lessonTypeLabel,
    riverBank: lessonContext.riverBank,
    lesson_type_id: lessonContext.lessonTypeId ?? null,
  };

  let voteOccurrenceId = null;
  if (persistToDb) {
    if (!occurrenceAtIso) {
      return { success: false, error: "Internal: occurrenceAtIso required when persistToDb.", httpStatus: 500 };
    }
    const { data: occRow, error: insErr } = await supabaseAdmin
      .from("lesson_vote_occurrences")
      .insert({
        lesson_time_id: lessonTimeId,
        place_id: placeId,
        occurrence_at: occurrenceAtIso,
        vote_id: voteId,
        is_test: Boolean(isTest),
        votes_snapshot: { abon: {}, single: {}, skip: {} },
        lesson_snapshot: lessonSnapshot,
      })
      .select("id")
      .single();

    if (insErr) {
      const dup =
        insErr.code === "23505" || /duplicate key|unique constraint/i.test(String(insErr.message || ""));
      if (dup) {
        return { success: false, duplicate: true };
      }
      return { success: false, error: insErr.message, httpStatus: 500 };
    }
    voteOccurrenceId = occRow.id;
  }

  const replyMarkup = buildLessonVoteKeyboard(voteId);
  const votesByKindGroup = { abon: new Map(), single: new Map(), skip: new Map() };
  const groupVoteText = buildLessonVoteMessage({
    ...lessonContext,
    votesByKind: votesByKindGroup,
    teacherName: null,
    conductingDisplayName: null,
    audience: "group",
  });

  let sentGroup;
  try {
    sentGroup = await bot.telegram.sendMessage(groupChatId, groupVoteText, { reply_markup: replyMarkup });
  } catch (err) {
    if (voteOccurrenceId) {
      await supabaseAdmin.from("lesson_vote_occurrences").delete().eq("id", voteOccurrenceId);
    }
    const msg = err?.description || err?.message || String(err);
    return {
      success: false,
      error: `Не вдалося надіслати голосування учасників у групу: ${msg}`,
      httpStatus: 500,
    };
  }

  const groupVoteStateKey = attendanceGroupMemoryKey(sentGroup.chat.id, sentGroup.message_id);
  activeLessonVotes.set(groupVoteStateKey, {
    voteId,
    lessonContext,
    teacherName: null,
    conductingDisplayName: null,
    conductingTelegramChatId: null,
    audience: "group",
    votesByKind: votesByKindGroup,
    voteOccurrenceId,
    isTestOccurrence: Boolean(isTest),
    conductMessages: [],
  });

  const sendResults = await Promise.allSettled(
    teachers.map(async (teacher) => {
      const conductId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const conductText = buildLessonConductMessage(lessonContext, null);
      const conductMarkup = buildLessonConductKeyboard(conductId);
      const sent2 = await bot.telegram.sendMessage(teacher.chatId, conductText, { reply_markup: conductMarkup });
      activeConductVotes.set(attendanceGroupMemoryKey(sent2.chat.id, sent2.message_id), {
        conductId,
        lessonContext,
        conductorDisplayName: null,
        linkedGroupVoteKey: groupVoteStateKey,
        voteOccurrenceId,
      });

      return {
        chatId: String(sent2.chat.id),
        messageId: sent2.message_id,
        conductMessageId: sent2.message_id,
        conductId,
      };
    })
  );

  const conductMessages = [];
  for (let i = 0; i < sendResults.length; i++) {
    const r = sendResults[i];
    if (r.status === "fulfilled" && r.value?.chatId && Number.isFinite(Number(r.value?.messageId))) {
      conductMessages.push({
        chat_id: r.value.chatId,
        message_id: r.value.messageId,
        conduct_id: r.value.conductId,
      });
    }
  }

  if (voteOccurrenceId) {
    const { error: upErr } = await supabaseAdmin
      .from("lesson_vote_occurrences")
      .update({
        telegram_group_chat_id: String(sentGroup.chat.id),
        telegram_group_message_id: sentGroup.message_id,
        conduct_messages: conductMessages,
      })
      .eq("id", voteOccurrenceId);
    if (upErr) console.error("lesson_vote_occurrences update telegram ids:", upErr.message);
  }

  const groupStateAfterDmSend = activeLessonVotes.get(groupVoteStateKey);
  if (groupStateAfterDmSend) {
    groupStateAfterDmSend.conductMessages = conductMessages;
  }

  const delivered = [];
  const failed = [];
  sendResults.forEach((result, idx) => {
    const target = teachers[idx];
    if (result.status === "fulfilled") {
      const { conductMessageId } = result.value;
      delivered.push({
        teacherId: target.id,
        teacherName: target.name,
        chatId: target.chatId,
        messageId: conductMessageId,
      });
    } else {
      failed.push({
        teacherId: target.id,
        teacherName: target.name,
        chatId: target.chatId,
        error: result.reason?.description || result.reason?.message || "unknown error",
      });
    }
  });

  const payloadBase = {
    ok: true,
    voteId,
    groupAttendance: {
      chatId: String(sentGroup.chat.id),
      messageId: sentGroup.message_id,
      riverBank: lessonContext.riverBank || null,
      bankSide: resolvedGroup.bank || null,
      dualGroupMode: resolvedGroup.dualMode,
    },
    resolvedSlot: {
      lesson_time_id: lessonTimeId,
      place_id: placeId,
      defaultUsed,
      occurredAt,
      lessonTimeLabel: lessonContext.lessonTimeLabel,
      placeLabel: lessonContext.placeLabel,
      lessonTypeLabel: lessonContext.lessonTypeLabel,
      riverBank: lessonContext.riverBank || null,
      ...(occurrenceAtIso ? { occurrence_at: occurrenceAtIso } : {}),
    },
    deliveredCount: delivered.length,
    failedCount: failed.length,
    teachersTotal: teachers.length,
    teachersPartialOk: teachers.length === 0 || delivered.length > 0,
    delivered,
    failed,
  };

  return {
    success: true,
    payload: voteOccurrenceId ? { ...payloadBase, lessonVoteOccurrenceId: voteOccurrenceId } : payloadBase,
  };
}

/**
 * Тестові голосування для кожного слоту розкладу, чия найближча подія потрапляє у вікно автопланувальника.
 * Дублікати з існуючим рядком (lesson_time_id + occurrence_at) пропускаються без помилки.
 * Для щотижневих слотів пропускає зайняті дати (+1 тиждень) — працює необмежено довго.
 */
async function runBatchTeacherVotesInWindow({ isTest = false } = {}) {
  if (!bot) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured.", httpStatus: 500 };
  }
  if (!supabaseAdmin) {
    return { ok: false, error: "Supabase admin client is not configured.", httpStatus: 500 };
  }

  const nowKyiv = DateTime.now().setZone(KYIV_TZ);
  const occupiedByLessonTime = isTest ? new Map() : await loadOccupiedOccurrenceAtByLessonTimeId();
  const { data: slots, error } = await supabaseAdmin
    .from("lesson_times")
    .select("id, place_id, day_of_week, start_time")
    .not("place_id", "is", null);

  if (error) {
    return { ok: false, error: error.message, httpStatus: 500 };
  }

  const planned = [];
  let skippedNoNext = 0;
  let skippedOutOfWindow = 0;

  for (const row of slots || []) {
    const lessonTimeKey = String(row.id || "").trim();
    const occupied = occupiedByLessonTime.get(lessonTimeKey) || null;
    const next = computeNextSchedulableOccurrenceKyiv(row, nowKyiv, occupied);
    if (!next) {
      skippedNoNext++;
      continue;
    }
    if (!isOccurrenceInScheduledVoteWindow(next, nowKyiv)) {
      skippedOutOfWindow++;
      continue;
    }
    planned.push({
      lessonTimeId: row.id,
      placeId: row.place_id,
      occurrenceAtIso: next.toUTC().toISO(),
      nextKyiv: next,
    });
  }

  planned.sort((a, b) => a.nextKyiv.toMillis() - b.nextKyiv.toMillis());

  const voteIds = [];
  const created = [];
  let skippedDuplicate = 0;
  const failures = [];

  for (const p of planned) {
    const exec = await executeLessonAttendanceVote({
      lessonTimeId: p.lessonTimeId,
      placeId: p.placeId,
      defaultUsed: false,
      occurredAt: null,
      persistToDb: true,
      occurrenceAtIso: p.occurrenceAtIso,
      isTest: Boolean(isTest),
    });

    if (exec.duplicate) {
      skippedDuplicate++;
      continue;
    }
    if (!exec.success) {
      failures.push({
        lesson_time_id: p.lessonTimeId,
        error: exec.error || "unknown",
      });
      continue;
    }
    voteIds.push(exec.payload.voteId);
    created.push({
      voteId: exec.payload.voteId,
      resolvedSlot: exec.payload.resolvedSlot,
      deliveredCount: exec.payload.deliveredCount,
      failedCount: exec.payload.failedCount,
      teachersTotal: exec.payload.teachersTotal,
    });
  }

  return {
    ok: true,
    batch: true,
    isTest: Boolean(isTest),
    windowHoursMinExclusive: VOTE_SCHED_CLOSE_MAX_HOURS_BEFORE,
    windowHoursMaxInclusive: VOTE_SCHED_OPEN_MAX_HOURS_BEFORE,
    createdCount: voteIds.length,
    skippedDuplicate,
    skippedOutOfWindow,
    skippedNoNext,
    totalLessonSlots: (slots || []).length,
    eligibleInWindow: planned.length,
    voteIds,
    created,
    failures,
  };
}

function findActiveLessonVoteByVoteId(voteIdRaw) {
  const needle = String(voteIdRaw || "").trim();
  if (!needle) return null;
  for (const [stateKey, st] of activeLessonVotes.entries()) {
    if (st.voteId === needle) return { stateKey, state: st };
  }
  return null;
}

async function ensureActiveLessonVoteByVoteId(voteIdRaw) {
  const found = findActiveLessonVoteByVoteId(voteIdRaw);
  if (found) return found;
  if (!supabaseAdmin) return null;

  const voteId = String(voteIdRaw || "").trim();
  if (!voteId) return null;

  const { data: row, error } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .select("*")
    .eq("status", "open")
    .eq("vote_id", voteId)
    .maybeSingle();

  if (error) {
    console.warn("ensureActiveLessonVoteByVoteId:", error.message);
    return null;
  }
  if (!row) return null;

  await hydrateLessonVoteOccurrenceRow(row);
  return findActiveLessonVoteByVoteId(voteId);
}

/**
 * Збирає приватні повідомлення «хто проводить»: з пам’яті за прив’язкою або з запису occurrences.
 * @returns {{ chat_id: string, message_id: number }[]}
 */
function collectConductChatTargets(groupStateKey, conductMessagesRow) {
  const fromRow = [];
  if (Array.isArray(conductMessagesRow) && conductMessagesRow.length) {
    for (const c of conductMessagesRow) {
      const cid = c?.chat_id;
      const mid = c?.message_id;
      if (!cid || !Number.isFinite(Number(mid))) continue;
      fromRow.push({ chat_id: String(cid), message_id: Number(mid) });
    }
    return fromRow;
  }
  const out = [];
  for (const [cKey, st] of activeConductVotes.entries()) {
    if (st?.linkedGroupVoteKey === groupStateKey) {
      const p = parseMessageStateKey(cKey);
      if (p) out.push({ chat_id: String(p.chatId), message_id: Number(p.messageId) });
    }
  }
  return out;
}

/** Прибирає кнопки в Telegram та очищує in-memory активні голосування. */
async function closeAttendanceVotesInTelegramAndMemory({
  groupChatId,
  groupMessageId,
  lessonContext,
  votesByKind,
  conductingDisplayName,
  conductChatTargets,
  groupStateKey,
}) {
  let groupTelegramOk = true;
  let lastError = null;

  if (!bot) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured.", memoryCleared: false };
  }

  const baseText = buildLessonVoteMessage({
    ...lessonContext,
    votesByKind,
    teacherName: null,
    conductingDisplayName,
    audience: "group",
  });
  const closedText = `${baseText}\n\n⛔️ Голосування закрито.`;

  try {
    await bot.telegram.editMessageText(
      String(groupChatId),
      Number(groupMessageId),
      undefined,
      closedText,
      { reply_markup: { inline_keyboard: [] } },
    );
  } catch (e) {
    if (isTelegramMessageNotModifiedError(e)) {
      // Повідомлення вже в потрібному стані.
    } else {
      groupTelegramOk = false;
      lastError = e?.description || e?.message || "Не вдалося оновити повідомлення в групі.";
      console.error("close group vote message:", lastError);
    }
  }

  const whoConduct = conductingDisplayName;
  for (const t of conductChatTargets || []) {
    const cid = t.chat_id;
    const mid = t.message_id;
    const cKey = attendanceGroupMemoryKey(cid, mid);
    const cState = activeConductVotes.get(cKey);
    const who = cState?.conductorDisplayName ?? whoConduct;
    const ct = `${buildLessonConductMessage(lessonContext, who)}\n\n⛔️ Оновлення неактивне.`;
    try {
      await bot.telegram.editMessageText(String(cid), Number(mid), undefined, ct, {
        reply_markup: { inline_keyboard: [] },
      });
    } catch (e2) {
      console.error("close conduct msg:", e2?.description || e2?.message || e2);
    }
    activeConductVotes.delete(cKey);
  }

  if (groupStateKey) activeLessonVotes.delete(groupStateKey);

  if (!groupTelegramOk) return { ok: false, error: lastError, memoryCleared: true };
  return { ok: true, memoryCleared: true };
}

/** Після закриття голосування: один рядок lessons на пару lesson_time_id + starts_at (= occurrence_at). */
async function markLessonVoteOccurrenceFinalizedInDb(rowId, votesByKind, conductingDisplayName) {
  if (!supabaseAdmin || !rowId) {
    return { ok: false, error: !supabaseAdmin ? "Supabase not configured." : "Missing row id." };
  }
  const finalVotesSnapshot = votesByKindToSnapshot(votesByKind);
  const cond =
    typeof conductingDisplayName === "string" && conductingDisplayName.trim().length > 0
      ? conductingDisplayName.trim()
      : null;

  const { error } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .update({
      status: "finalized",
      finalized_at: new Date().toISOString(),
      votes_snapshot: finalVotesSnapshot,
      conducting_display_name: cond,
    })
    .eq("id", rowId)
    .eq("status", "open");

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function persistFinalizedVotesToLessonRow(row, votesByKind, conductingDisplayName, conductingTelegramChatIdOverride) {
  if (!supabaseAdmin) return null;
  const lessonTimeId = row.lesson_time_id;
  const placeId = row.place_id;
  const startsAt = row.occurrence_at;
  if (!lessonTimeId || !startsAt) return null;

  const abon = votesByKind.abon.size;
  const single = votesByKind.single.size;
  const skip = votesByKind.skip.size;
  const voteFinalizedAt = new Date().toISOString();
  const cond =
    typeof conductingDisplayName === "string" && conductingDisplayName.trim().length > 0
      ? conductingDisplayName.trim()
      : null;
  const finalVotesSnapshot = votesByKindToSnapshot(votesByKind);

  const chatRaw =
    conductingTelegramChatIdOverride != null && String(conductingTelegramChatIdOverride).trim() !== ""
      ? String(conductingTelegramChatIdOverride).trim()
      : row.conducting_telegram_chat_id != null && String(row.conducting_telegram_chat_id).trim() !== ""
        ? String(row.conducting_telegram_chat_id).trim()
        : null;

  try {
    const teacherId = await resolveTeacherIdByTelegramChatId(chatRaw);

    const { data: existing, error: selErr } = await supabaseAdmin
      .from("lessons")
      .select("id")
      .eq("lesson_time_id", lessonTimeId)
      .eq("starts_at", startsAt)
      .maybeSingle();

    if (selErr) {
      console.error("persistFinalizedVotesToLessonRow select:", selErr.message);
      return null;
    }

    const payload = {
      lesson_time_id: lessonTimeId,
      place_id: placeId,
      starts_at: startsAt,
      teacher_id: teacherId,
      abon_count: abon,
      single_visitors_count: single,
      skip_visitors_count: skip,
      conducting_display_name: cond,
      vote_finalized_at: voteFinalizedAt,
      vote_snapshot: finalVotesSnapshot,
      lesson_vote_occurrence_id: row.id,
    };

    let lessonId = existing?.id ? String(existing.id) : null;

    if (existing?.id) {
      const { error: upLesson } = await supabaseAdmin.from("lessons").update(payload).eq("id", existing.id);
      if (upLesson) console.error("persistFinalizedVotesToLessonRow update:", upLesson.message);
    } else {
      const { data: inserted, error: insLesson } = await supabaseAdmin
        .from("lessons")
        .insert(payload)
        .select("id")
        .single();
      if (insLesson) {
        const isDup =
          insLesson.code === "23505" || /duplicate key|unique constraint/i.test(String(insLesson.message || ""));
        if (isDup) {
          const { data: existing2, error: sel2 } = await supabaseAdmin
            .from("lessons")
            .select("id")
            .eq("lesson_time_id", lessonTimeId)
            .eq("starts_at", startsAt)
            .maybeSingle();
          if (sel2) {
            console.error("persistFinalizedVotesToLessonRow select after dup:", sel2.message);
          } else if (existing2?.id) {
            lessonId = String(existing2.id);
            const { error: up2 } = await supabaseAdmin.from("lessons").update(payload).eq("id", existing2.id);
            if (up2) console.error("persistFinalizedVotesToLessonRow update after dup:", up2.message);
          } else {
            console.error("persistFinalizedVotesToLessonRow insert dup but row not found:", insLesson.message);
          }
        } else {
          console.error("persistFinalizedVotesToLessonRow insert:", insLesson.message);
        }
      } else if (inserted?.id) {
        lessonId = String(inserted.id);
      }
    }

    return lessonId;
  } catch (e) {
    console.error("persistFinalizedVotesToLessonRow:", e?.message || e);
    return null;
  }
}

function needsTwoStudentTeacherReview(row, votesByKind) {
  if (row?.is_test) return false;
  const { peopleCount } = countAttendingFromVotes(votesByKind);
  return peopleCount === 2;
}

/** Бойове голосування з <2 учасниками (абон+разове): заняття не створюємо, лише закриваємо голосування. */
function shouldSkipLessonRecordAfterFinalize(row, votesByKind) {
  if (row?.is_test) return false;
  const { peopleCount } = countAttendingFromVotes(votesByKind);
  return peopleCount < 2;
}

function buildReviewStateFromOccurrenceRow(row, reviewId, lessonId = null) {
  return {
    reviewId,
    lessonId,
    row,
    lessonContext: lessonContextFromOccurrenceRow(row),
    votesByKind: snapshotToVotesByKind(row.votes_snapshot),
    conductingDisplayName: row.conducting_display_name ?? null,
    conductingTelegramChatId:
      row.conducting_telegram_chat_id != null && String(row.conducting_telegram_chat_id).trim() !== ""
        ? String(row.conducting_telegram_chat_id).trim()
        : null,
    netIncome: null,
  };
}

async function markTwoStudentReviewPending(occurrenceId) {
  if (!supabaseAdmin || !occurrenceId) return;
  const { error } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .update({ two_student_review_status: "pending" })
    .eq("id", occurrenceId)
    .eq("status", "finalized");
  if (error) console.error("markTwoStudentReviewPending:", error.message);
}

/** @param {unknown} raw */
function normalizeTwoStudentReviewMessages(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((m) => m && m.chat_id != null && Number.isFinite(Number(m.message_id)) && m.review_id)
      .map((m) => ({
        chat_id: String(m.chat_id),
        message_id: Number(m.message_id),
        review_id: String(m.review_id),
      }));
  }
  if (
    typeof raw === "object" &&
    raw.chat_id != null &&
    Number.isFinite(Number(raw.message_id)) &&
    raw.review_id
  ) {
    return [
      {
        chat_id: String(raw.chat_id),
        message_id: Number(raw.message_id),
        review_id: String(raw.review_id),
      },
    ];
  }
  return [];
}

async function persistTwoStudentReviewMessages(occurrenceId, messages) {
  if (!supabaseAdmin || !occurrenceId) return;
  const normalized = normalizeTwoStudentReviewMessages(messages);
  const { error } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .update({ two_student_review_message: normalized })
    .eq("id", occurrenceId);
  if (error) console.error("persistTwoStudentReviewMessages:", error.message);
}

async function finalizeTwoStudentReviewMessages(row, finalText) {
  if (!bot || !row) return;
  let messages = normalizeTwoStudentReviewMessages(row.two_student_review_message);
  if (!messages.length && supabaseAdmin && row.id) {
    try {
      const { data, error } = await supabaseAdmin
        .from("lesson_vote_occurrences")
        .select("two_student_review_message")
        .eq("id", row.id)
        .maybeSingle();
      if (!error) {
        messages = normalizeTwoStudentReviewMessages(data?.two_student_review_message);
        row.two_student_review_message = data?.two_student_review_message ?? row.two_student_review_message;
      }
    } catch (e) {
      console.warn("finalizeTwoStudentReviewMessages reload:", e?.message || e);
    }
  }

  for (const msg of messages) {
    const stateKey = attendanceGroupMemoryKey(msg.chat_id, msg.message_id);
    activeLessonReviews.delete(stateKey);
    try {
      await bot.telegram.editMessageText(String(msg.chat_id), Number(msg.message_id), undefined, finalText, {
        reply_markup: { inline_keyboard: [] },
      });
    } catch (e) {
      if (!isTelegramMessageNotModifiedError(e)) {
        console.warn(
          "finalizeTwoStudentReviewMessages:",
          msg.chat_id,
          e?.description || e?.message || e,
        );
      }
    }
  }
}

async function markTwoStudentReviewResolved(occurrenceId, status) {
  if (!supabaseAdmin || !occurrenceId) return { ok: false };
  const { error } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .update({ two_student_review_status: status })
    .eq("id", occurrenceId)
    .eq("status", "finalized");
  if (error) {
    console.error("markTwoStudentReviewResolved:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function findLessonIdByOccurrenceId(occurrenceId) {
  if (!supabaseAdmin || !occurrenceId) return null;
  const { data, error } = await supabaseAdmin
    .from("lessons")
    .select("id")
    .eq("lesson_vote_occurrence_id", occurrenceId)
    .maybeSingle();
  if (error) {
    console.warn("findLessonIdByOccurrenceId:", error.message);
    return null;
  }
  return data?.id ? String(data.id) : null;
}

async function confirmTwoStudentLesson(reviewState) {
  const { row, lessonContext, votesByKind, conductingDisplayName, conductingTelegramChatId } = reviewState;
  if (!supabaseAdmin || !row?.id) return { ok: false, error: "Missing occurrence." };

  const { data: current, error: curErr } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .select("two_student_review_status")
    .eq("id", row.id)
    .maybeSingle();
  if (curErr) return { ok: false, error: curErr.message };
  if (current?.two_student_review_status === "confirmed") return { ok: true, alreadyConfirmed: true };
  if (current?.two_student_review_status === "cancelled") {
    return { ok: false, error: "Заняття вже скасовано." };
  }

  const mark = await markTwoStudentReviewResolved(row.id, "confirmed");
  if (!mark.ok) return mark;

  try {
    await applyVisitsAfterFinalize(supabaseAdmin, { occurrenceRow: row, votesByKind });
  } catch (e) {
    console.error("confirmTwoStudentLesson applyVisitsAfterFinalize:", e?.message || e);
  }

  await persistFinalizedVotesToLessonRow(row, votesByKind, conductingDisplayName, conductingTelegramChatId);
  await notifyConductingTeacherPayout({
    row,
    lessonContext,
    votesByKind,
    conductingDisplayName,
    conductingTelegramChatId,
  });

  return { ok: true };
}

async function cancelTwoStudentLesson(reviewState) {
  const { row } = reviewState;
  if (!supabaseAdmin || !row?.id) return { ok: false, error: "Missing occurrence." };

  const { data: current, error: curErr } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .select("two_student_review_status")
    .eq("id", row.id)
    .maybeSingle();
  if (curErr) return { ok: false, error: curErr.message };
  if (current?.two_student_review_status === "cancelled") return { ok: true, alreadyCancelled: true };
  if (current?.two_student_review_status === "confirmed") {
    return { ok: false, error: "Заняття вже підтверджено." };
  }

  const mark = await markTwoStudentReviewResolved(row.id, "cancelled");
  if (!mark.ok) return mark;

  try {
    await rollbackVisitsForOccurrence(supabaseAdmin, row.id);
  } catch (e) {
    return { ok: false, error: e?.message || "Failed to rollback visits." };
  }

  const lessonId = reviewState.lessonId || (await findLessonIdByOccurrenceId(row.id));
  if (lessonId) {
    const { error: delErr } = await supabaseAdmin.from("lessons").delete().eq("id", lessonId);
    if (delErr) return { ok: false, error: delErr.message };
  }

  return { ok: true };
}

async function persistLessonAndNotifyAfterFinalize({
  row,
  lessonContext,
  votesByKind,
  conductingDisplayName,
  conductingTelegramChatId,
}) {
  if (shouldSkipLessonRecordAfterFinalize(row, votesByKind)) {
    return;
  }

  if (needsTwoStudentTeacherReview(row, votesByKind)) {
    await markTwoStudentReviewPending(row.id);
    await notifyTeacherTwoStudentReview({
      row,
      lessonContext,
      votesByKind,
      conductingDisplayName,
      conductingTelegramChatId,
      lessonId: null,
      abonCount: votesByKind.abon.size,
      singleCount: votesByKind.single.size,
    });
    return;
  }

  try {
    await applyVisitsAfterFinalize(supabaseAdmin, { occurrenceRow: row, votesByKind });
  } catch (e) {
    console.error("applyVisitsAfterFinalize:", e?.message || e);
  }

  const lessonId = await persistFinalizedVotesToLessonRow(
    row,
    votesByKind,
    conductingDisplayName,
    conductingTelegramChatId,
  );

  await handlePostFinalizeTeacherNotifications({
    row,
    lessonContext,
    votesByKind,
    conductingDisplayName,
    conductingTelegramChatId,
    lessonId,
  });
}

async function finalizeLessonVoteOccurrence(row) {
  if (!bot || !supabaseAdmin) return;

  const chatId = row.telegram_group_chat_id;
  const messageId = row.telegram_group_message_id;
  if (!chatId || !Number.isFinite(Number(messageId))) {
    console.error("finalizeLessonVoteOccurrence: missing telegram ids for row", row.id);
    return;
  }

  const snap = row.lesson_snapshot || {};
  const lessonContext = {
    lessonTimeLabel: snap.lessonTimeLabel || "не вказано",
    placeLabel: snap.placeLabel || "не вказано",
    lessonTypeLabel: snap.lessonTypeLabel || "не вказано",
    riverBank: snap.riverBank ?? null,
  };

  const stateKey = attendanceGroupMemoryKey(chatId, messageId);
  const live = activeLessonVotes.get(stateKey);
  const votesByKind = live?.votesByKind || snapshotToVotesByKind(row.votes_snapshot);
  const conductingDisplayName = live?.conductingDisplayName ?? row.conducting_display_name ?? null;
  const conductingTelegramChatId = live?.conductingTelegramChatId ?? row.conducting_telegram_chat_id;

  const conductChatTargets = collectConductChatTargets(stateKey, row.conduct_messages);

  const closeRes = await closeAttendanceVotesInTelegramAndMemory({
    groupChatId: chatId,
    groupMessageId: messageId,
    lessonContext,
    votesByKind,
    conductingDisplayName,
    conductChatTargets,
    groupStateKey: stateKey,
  });
  if (!closeRes.ok) {
    console.warn("finalizeLessonVoteOccurrence: telegram close imperfect:", closeRes.error);
  }

  const markResult = await markLessonVoteOccurrenceFinalizedInDb(row.id, votesByKind, conductingDisplayName);
  if (!markResult.ok) {
    console.error("Failed to finalize lesson_vote_occurrences row:", markResult.error);
    return;
  }

  await persistLessonAndNotifyAfterFinalize({
    row,
    lessonContext,
    votesByKind,
    conductingDisplayName,
    conductingTelegramChatId,
  });
}

function lessonContextFromOccurrenceRow(row) {
  const snap = row.lesson_snapshot || {};
  return {
    lessonTimeLabel: snap.lessonTimeLabel || "не вказано",
    placeLabel: snap.placeLabel || "не вказано",
    lessonTypeLabel: snap.lessonTypeLabel || "не вказано",
    riverBank: snap.riverBank ?? null,
  };
}

/** Один рядок open → in-memory Maps; повертає groupKey або null. */
async function hydrateLessonVoteOccurrenceRow(row, { refreshTelegramMessage = false } = {}) {
  const chatId = row.telegram_group_chat_id;
  const messageId = row.telegram_group_message_id;
  if (!chatId || !Number.isFinite(Number(messageId))) return null;

  const lessonContext = lessonContextFromOccurrenceRow(row);
  const votesByKind = snapshotToVotesByKind(row.votes_snapshot);
  await enrichVotesByKindUsernames(votesByKind);
  const groupKey = attendanceGroupMemoryKey(chatId, messageId);
  activeLessonVotes.set(groupKey, {
    voteId: row.vote_id,
    lessonContext,
    teacherName: null,
    conductingDisplayName: row.conducting_display_name ?? null,
    conductingTelegramChatId:
      row.conducting_telegram_chat_id != null && String(row.conducting_telegram_chat_id).trim() !== ""
        ? String(row.conducting_telegram_chat_id).trim()
        : null,
    audience: "group",
    votesByKind,
    voteOccurrenceId: row.id,
    isTestOccurrence: Boolean(row.is_test),
    conductMessages: Array.isArray(row.conduct_messages) ? row.conduct_messages : [],
  });

  if (refreshTelegramMessage && bot && votesByKind.abon.size + votesByKind.single.size + votesByKind.skip.size > 0) {
    const text = buildLessonVoteMessage({
      ...lessonContext,
      votesByKind,
      teacherName: null,
      conductingDisplayName: row.conducting_display_name ?? null,
      audience: "group",
    });
    try {
      await bot.telegram.editMessageText(String(chatId), Number(messageId), undefined, text, {
        reply_markup: buildLessonVoteKeyboard(row.vote_id),
      });
    } catch (err) {
      if (!isTelegramMessageNotModifiedError(err)) {
        console.warn("hydrateLessonVoteOccurrenceRow refresh group message:", err?.description || err?.message || err);
      }
    }
    await persistOccurrenceVotesOnly(row.id, votesByKind);
  }

  const conducts = Array.isArray(row.conduct_messages) ? row.conduct_messages : [];
  for (const c of conducts) {
    const cid = c?.chat_id;
    const mid = c?.message_id;
    const cCond = c?.conduct_id;
    if (!cid || !Number.isFinite(Number(mid)) || !cCond) continue;
    const cKey = attendanceGroupMemoryKey(cid, mid);
    activeConductVotes.set(cKey, {
      conductId: String(cCond),
      lessonContext,
      conductorDisplayName: null,
      linkedGroupVoteKey: groupKey,
      voteOccurrenceId: row.id,
    });
  }

  return groupKey;
}

/** Якщо голосування немає в RAM — підвантажує open-рядок з БД за chat_id + message_id. */
async function ensureActiveLessonVote(chatId, messageId, voteId) {
  const stateKey = attendanceGroupMemoryKey(chatId, messageId);
  const cached = activeLessonVotes.get(stateKey);
  if (cached && cached.voteId === voteId) return cached;
  if (!supabaseAdmin) return null;

  const { data: row, error } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .select("*")
    .eq("status", "open")
    .eq("telegram_group_chat_id", String(chatId))
    .eq("telegram_group_message_id", Number(messageId))
    .maybeSingle();

  if (error) {
    console.warn("ensureActiveLessonVote:", error.message);
    return null;
  }
  if (!row || row.vote_id !== voteId) return null;

  await hydrateLessonVoteOccurrenceRow(row);
  return activeLessonVotes.get(stateKey) || null;
}

/** Якщо «Я провожу» немає в RAM — шукає open-occurrence з conduct_messages. */
async function ensureActiveConductVote(chatId, messageId, conductId) {
  const stateKey = attendanceGroupMemoryKey(chatId, messageId);
  const cached = activeConductVotes.get(stateKey);
  if (cached && cached.conductId === conductId) return cached;
  if (!supabaseAdmin) return null;

  const { data: rows, error } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .select("*")
    .eq("status", "open");

  if (error) {
    console.warn("ensureActiveConductVote:", error.message);
    return null;
  }

  for (const row of rows || []) {
    const conducts = Array.isArray(row.conduct_messages) ? row.conduct_messages : [];
    const hit = conducts.some(
      (c) =>
        String(c?.chat_id) === String(chatId) &&
        Number(c?.message_id) === Number(messageId) &&
        String(c?.conduct_id) === String(conductId),
    );
    if (!hit) continue;
    await hydrateLessonVoteOccurrenceRow(row);
    const restored = activeConductVotes.get(stateKey);
    if (restored && restored.conductId === conductId) return restored;
  }
  return null;
}

/** Якщо підтвердження «2 учні» немає в RAM — шукає pending-occurrence з two_student_review_message. */
async function ensureActiveLessonReview(chatId, messageId, reviewId) {
  const stateKey = attendanceGroupMemoryKey(chatId, messageId);
  const cached = activeLessonReviews.get(stateKey);
  if (cached && cached.reviewId === reviewId) return cached;
  if (!supabaseAdmin) return null;

  const { data: rows, error } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .select("*")
    .eq("status", "finalized")
    .eq("two_student_review_status", "pending");

  if (error) {
    console.warn("ensureActiveLessonReview:", error.message);
    return null;
  }

  for (const row of rows || []) {
    const messages = normalizeTwoStudentReviewMessages(row.two_student_review_message);
    const hit = messages.find(
      (msg) =>
        String(msg.chat_id) === String(chatId) &&
        Number(msg.message_id) === Number(messageId) &&
        String(msg.review_id) === String(reviewId),
    );
    if (!hit) continue;
    const lessonId = await findLessonIdByOccurrenceId(row.id);
    const reviewState = buildReviewStateFromOccurrenceRow(row, reviewId, lessonId);
    activeLessonReviews.set(stateKey, reviewState);
    return reviewState;
  }
  return null;
}

/** Після рестарту відновлює in-memory стан для pending «2 учні». */
async function hydratePendingTwoStudentReviewsFromDb() {
  if (!supabaseAdmin) return 0;
  try {
    const { data: rows, error } = await supabaseAdmin
      .from("lesson_vote_occurrences")
      .select("*")
      .eq("status", "finalized")
      .eq("two_student_review_status", "pending");

    if (error) {
      console.error("hydratePendingTwoStudentReviewsFromDb:", error.message);
      return 0;
    }

    let count = 0;
    for (const row of rows || []) {
      const messages = normalizeTwoStudentReviewMessages(row.two_student_review_message);
      for (const msg of messages) {
        const stateKey = attendanceGroupMemoryKey(msg.chat_id, msg.message_id);
        if (activeLessonReviews.has(stateKey)) continue;
        const lessonId = await findLessonIdByOccurrenceId(row.id);
        activeLessonReviews.set(stateKey, buildReviewStateFromOccurrenceRow(row, msg.review_id, lessonId));
        count += 1;
      }
    }
    return count;
  } catch (e) {
    console.error("hydratePendingTwoStudentReviewsFromDb:", e?.message || e);
    return 0;
  }
}

/** Після рестарту відновлює in-memory стан для відкритих голосувань (callback-и знову працюють). */
async function hydrateOpenLessonVotesFromDb() {
  if (!supabaseAdmin) return { lesson: 0, conduct: 0 };
  try {
    const { data: rows, error } = await supabaseAdmin
      .from("lesson_vote_occurrences")
      .select("*")
      .eq("status", "open");

    if (error) {
      console.error("hydrateOpenLessonVotesFromDb:", error.message);
      return { lesson: 0, conduct: 0 };
    }

    for (const row of rows || []) {
      const votesByKind = snapshotToVotesByKind(row.votes_snapshot);
      const hasVotes = votesByKind.abon.size + votesByKind.single.size + votesByKind.skip.size > 0;
      await hydrateLessonVoteOccurrenceRow(row, { refreshTelegramMessage: hasVotes });
    }

    return { lesson: activeLessonVotes.size, conduct: activeConductVotes.size };
  } catch (e) {
    console.error("hydrateOpenLessonVotesFromDb:", e?.message || e);
    return { lesson: activeLessonVotes.size, conduct: activeConductVotes.size };
  }
}

async function closeOpenVotesForToday() {
  if (!bot || !supabaseAdmin) {
    return { attempted: 0, finalized: 0, failed: 0 };
  }

  const nowKyiv = DateTime.now().setZone(KYIV_TZ);
  const dayStartUtcIso = nowKyiv.startOf("day").toUTC().toISO();
  const dayEndUtcIso = nowKyiv.endOf("day").toUTC().toISO();
  if (!dayStartUtcIso || !dayEndUtcIso) {
    return { attempted: 0, finalized: 0, failed: 0 };
  }

  const { data: openRows, error } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .select("*")
    .eq("status", "open")
    .eq("is_test", false)
    .gte("occurrence_at", dayStartUtcIso)
    .lte("occurrence_at", dayEndUtcIso)
    .order("occurrence_at", { ascending: true });

  if (error) {
    throw new Error(`closeOpenVotesForToday load failed: ${error.message}`);
  }

  let finalized = 0;
  let failed = 0;
  for (const row of openRows || []) {
    try {
      await finalizeLessonVoteOccurrence(row);
      finalized++;
    } catch (_e) {
      failed++;
    }
  }
  return { attempted: (openRows || []).length, finalized, failed };
}

/**
 * Закриває одне тестове голосування з адмінки (кнопка «Закрити тест»).
 * @returns {Promise<{ ok: true, voteId: string } | { ok: false, voteId: string, error: string, notFound?: boolean, telegramWarning?: boolean }>}
 */
async function closeSingleTeacherTestVote(voteIdRaw) {
  const voteId = String(voteIdRaw || "").trim();
  if (!voteId) {
    return { ok: false, voteId: "", error: "Порожній ідентифікатор голосування." };
  }
  if (!bot) {
    return { ok: false, voteId, error: "TELEGRAM_BOT_TOKEN is not configured." };
  }

  const found = await ensureActiveLessonVoteByVoteId(voteId);
  if (!found) {
    return {
      ok: false,
      voteId,
      notFound: true,
      error:
        "Не знайдено активного голосування для цього vote_id у пам'яті сервера (вже закрито або після перезапуску — закрий запис у lesson_vote_occurrences вручну, якщо status=open).",
    };
  }

  const p = parseMessageStateKey(found.stateKey);
  if (!p || !found.state.lessonContext || !found.state.votesByKind) {
    return { ok: false, voteId, error: "Пошкоджений стан голосування в пам'яті." };
  }

  const conductChatTargets = collectConductChatTargets(found.stateKey, null);
  const conductingDisplayName =
    typeof found.state.conductingDisplayName === "string" && found.state.conductingDisplayName.trim().length > 0
      ? found.state.conductingDisplayName.trim()
      : null;

  const votesSnap = found.state.votesByKind;
  const occIdClose = found.state.voteOccurrenceId;

  const closeRes = await closeAttendanceVotesInTelegramAndMemory({
    groupChatId: p.chatId,
    groupMessageId: p.messageId,
    lessonContext: found.state.lessonContext,
    votesByKind: found.state.votesByKind,
    conductingDisplayName,
    conductChatTargets,
    groupStateKey: found.stateKey,
  });

  if (!closeRes.ok) {
    return {
      ok: false,
      voteId,
      telegramWarning: true,
      error:
        closeRes.error ||
        "Не вдалося коректно оновити Telegram; перевір журнал сервера. Стан голосування в пам'яті очищено.",
    };
  }

  if (occIdClose && supabaseAdmin) {
    const markTry = await markLessonVoteOccurrenceFinalizedInDb(occIdClose, votesSnap, conductingDisplayName);
    if (!markTry.ok) {
      console.warn("test-vote/close DB finalize:", markTry.error);
    } else {
      const { data: occRow, error: occFetchErr } = await supabaseAdmin
        .from("lesson_vote_occurrences")
        .select("*")
        .eq("id", occIdClose)
        .maybeSingle();
      if (occFetchErr) {
        console.warn("test-vote/close load occurrence for lessons:", occFetchErr.message);
      } else if (occRow) {
        await persistLessonAndNotifyAfterFinalize({
          row: occRow,
          lessonContext: found.state.lessonContext,
          votesByKind: votesSnap,
          conductingDisplayName,
          conductingTelegramChatId: found.state.conductingTelegramChatId ?? occRow.conducting_telegram_chat_id,
        });
      }
    }
  }

  return { ok: true, voteId };
}

app.post("/api/telegram/teachers/test-vote", async (req, res) => {
  try {
    const body = req.body || {};
    const reqLessonTimeId = String(body?.lesson_time_id || "").trim();

    if (!reqLessonTimeId) {
      const batch = await runBatchTeacherVotesInWindow({ isTest: true });
      if (!batch.ok) {
        return res.status(batch.httpStatus || 500).json({ ok: false, error: batch.error });
      }
      return res.status(200).json({ ok: true, ...batch });
    }

    if (!bot) {
      return res.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN is not configured." });
    }
    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
    }

    const ids = await resolveLessonIdsForVote(body);
    const { lessonTimeId, placeId, defaultUsed, occurredAt } = ids;

    if (!lessonTimeId) {
      return res.status(400).json({
        ok: false,
        error: "Не знайдено заняття: перевір lesson_time_id у тілі JSON.",
      });
    }

    const occurrenceAtIso =
      typeof occurredAt === "string" && occurredAt.trim()
        ? occurredAt.trim()
        : DateTime.utc().toISO();

    const exec = await executeLessonAttendanceVote({
      lessonTimeId,
      placeId,
      defaultUsed,
      occurredAt,
      persistToDb: true,
      occurrenceAtIso,
      isTest: true,
    });

    if (exec.duplicate) {
      return res.status(409).json({
        ok: false,
        error:
          "Голосування для цього слоту та часу вже існує (у БД unique lesson_time_id + occurrence_at).",
      });
    }
    if (!exec.success) {
      return res.status(exec.httpStatus || 500).json({ ok: false, error: exec.error });
    }

    return res.status(200).json({ ok: true, ...exec.payload, batch: false });
  } catch (error) {
    console.error("Failed to send teacher test vote:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to send teacher test vote." });
  }
});

app.post("/api/telegram/teachers/vote", async (_req, res) => {
  try {
    if (!bot) {
      return res.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN is not configured." });
    }
    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
    }

    const batch = await runBatchTeacherVotesInWindow({ isTest: false });
    if (!batch.ok) {
      return res.status(batch.httpStatus || 500).json({ ok: false, error: batch.error });
    }
    return res.status(200).json({ ok: true, ...batch });
  } catch (error) {
    console.error("Failed to send teacher vote batch:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to send teacher vote batch." });
  }
});

app.post("/api/telegram/teachers/test-vote/close", async (req, res) => {
  try {
    if (!bot) {
      return res.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN is not configured." });
    }
    const single = String(req.body?.vote_id || req.body?.voteId || "").trim();
    const rawArr = req.body?.vote_ids ?? req.body?.voteIds;
    const fromArr = Array.isArray(rawArr) ? rawArr : [];
    const targetIds = [
      ...new Set([...fromArr.map((x) => String(x || "").trim()).filter(Boolean), ...(single ? [single] : [])]),
    ];

    if (!targetIds.length) {
      return res.status(400).json({
        ok: false,
        error: "Передайте vote_id або vote_ids (масив) у тілі JSON.",
      });
    }

    if (targetIds.length === 1) {
      const r = await closeSingleTeacherTestVote(targetIds[0]);
      if (!r.ok) {
        const status = r.notFound ? 404 : r.telegramWarning ? 502 : 500;
        return res.status(status).json({
          ok: false,
          error: r.error,
          ...(r.telegramWarning ? { telegramWarning: true } : {}),
        });
      }
      return res.status(200).json({ ok: true, voteId: r.voteId });
    }

    const results = [];
    let closedCount = 0;
    let anyTelegramWarning = false;
    for (const vid of targetIds) {
      const r = await closeSingleTeacherTestVote(vid);
      results.push({
        voteId: vid,
        ok: r.ok,
        error: r.ok ? null : r.error,
        telegramWarning: Boolean(r.telegramWarning),
      });
      if (r.ok) closedCount++;
      if (r.telegramWarning) anyTelegramWarning = true;
    }

    return res.status(200).json({
      ok: closedCount > 0,
      closedCount,
      failedCount: targetIds.length - closedCount,
      results,
      ...(anyTelegramWarning ? { telegramWarning: true } : {}),
    });
  } catch (error) {
    console.error("test-vote close failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to close test vote." });
  }
});

app.post("/api/telegram/lesson-votes/close", async (req, res) => {
  try {
    if (!bot) {
      return res.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN is not configured." });
    }
    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
    }

    const occurrenceId = String(req.body?.occurrence_id || req.body?.occurrenceId || "").trim();
    if (!occurrenceId) {
      return res.status(400).json({ ok: false, error: "Передайте occurrence_id у тілі JSON." });
    }

    const { data: row, error: rowErr } = await supabaseAdmin
      .from("lesson_vote_occurrences")
      .select("*")
      .eq("id", occurrenceId)
      .eq("status", "open")
      .maybeSingle();
    if (rowErr) {
      return res.status(500).json({ ok: false, error: rowErr.message });
    }
    if (!row) {
      return res.status(404).json({ ok: false, error: "Відкрите голосування не знайдено або вже закрите." });
    }

    await finalizeLessonVoteOccurrence(row);
    return res.status(200).json({ ok: true, occurrenceId });
  } catch (error) {
    console.error("lesson-votes/close failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to close lesson vote." });
  }
});

app.get("/api/admin/stats", async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
    }

    const fromRaw = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const toRaw = typeof req.query.to === "string" ? req.query.to.trim() : "";
    const fromIso = statsDateToStartIso(fromRaw);
    const toIso = statsDateToEndIso(toRaw);

    if (fromRaw && !fromIso) {
      return res.status(400).json({ ok: false, error: "Некоректна дата «від»." });
    }
    if (toRaw && !toIso) {
      return res.status(400).json({ ok: false, error: "Некоректна дата «до»." });
    }
    if (fromRaw && toRaw && fromRaw > toRaw) {
      return res.status(400).json({ ok: false, error: "Дата «від» має бути не пізніше за «до»." });
    }

    const payload = await computeAdminStatsDashboard(supabaseAdmin, {
      fromIso,
      toIso,
      fromDate: fromRaw || null,
      toDate: toRaw || null,
    });
    return res.status(200).json({ ok: true, ...payload });
  } catch (error) {
    console.error("admin stats failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to load stats." });
  }
});

app.get("/api/admin/stats/teacher-lessons", async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
    }

    const teacherId = typeof req.query.teacherId === "string" ? req.query.teacherId.trim() : "";
    const teacherName = typeof req.query.teacherName === "string" ? req.query.teacherName.trim() : "";
    const fromRaw = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const toRaw = typeof req.query.to === "string" ? req.query.to.trim() : "";
    const fromIso = statsDateToStartIso(fromRaw);
    const toIso = statsDateToEndIso(toRaw);

    if (!teacherId && !teacherName) {
      return res.status(400).json({ ok: false, error: "Потрібен teacherId або teacherName." });
    }
    if (fromRaw && !fromIso) {
      return res.status(400).json({ ok: false, error: "Некоректна дата «від»." });
    }
    if (toRaw && !toIso) {
      return res.status(400).json({ ok: false, error: "Некоректна дата «до»." });
    }
    if (fromRaw && toRaw && fromRaw > toRaw) {
      return res.status(400).json({ ok: false, error: "Дата «від» має бути не пізніше за «до»." });
    }

    const payload = await computeTeacherLessonsJournal(supabaseAdmin, {
      teacherId,
      teacherName,
      fromIso,
      toIso,
    });
    return res.status(200).json({ ok: true, ...payload });
  } catch (error) {
    console.error("admin stats teacher-lessons failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to load teacher lessons." });
  }
});

app.get("/api/admin/lesson-votes/open", async (_req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
    }
    const { data, error } = await supabaseAdmin
      .from("lesson_vote_occurrences")
      .select("id, vote_id, occurrence_at, conducting_display_name, votes_snapshot, lesson_snapshot, status, is_test")
      .eq("status", "open")
      .order("occurrence_at", { ascending: false, nullsFirst: false });
    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.status(200).json({ ok: true, rows: data || [] });
  } catch (error) {
    console.error("admin lesson-votes open failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to load open lesson votes." });
  }
});

app.get("/api/admin/lessons/:lessonId/finance", async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
    }
    const lessonId = String(req.params.lessonId || "").trim();
    if (!lessonId) {
      return res.status(400).json({ ok: false, error: "Missing lesson id." });
    }
    const breakdown = await computeLessonFinanceBreakdown(supabaseAdmin, lessonId);
    return res.status(200).json({ ok: true, ...breakdown });
  } catch (error) {
    console.error("admin lessons finance failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to load lesson finance." });
  }
});

app.post("/api/admin/lessons/delete", async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
    }
    const lessonId = String(req.body?.lesson_id || req.body?.lessonId || "").trim();
    if (!lessonId) {
      return res.status(400).json({ ok: false, error: "Передайте lesson_id у тілі JSON." });
    }

    const result = await deleteAdminLessonRecord(lessonId);
    if (!result.ok) {
      const status = result.error?.includes("не знайдено") ? 404 : result.lessonDeleted ? 500 : 500;
      return res.status(status).json({ ok: false, error: result.error, lessonDeleted: result.lessonDeleted ?? false });
    }

    return res.status(200).json({ ok: true, lessonId: result.lessonId, linkedOccurrenceId: result.linkedOccurrenceId });
  } catch (error) {
    console.error("admin lessons delete failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to delete lesson." });
  }
});

app.get("/api/telegram/health", async (_req, res) => {
  const dual = dualBankGroupChatIds();
  const health = {
    ok: false,
    tokenConfigured: Boolean(botToken),
    chatIdConfigured: Boolean(telegramChatId),
    groupVoteChatIdConfigured: Boolean(resolveGroupVoteChatId()),
    resolvedGroupVoteChatId: resolveGroupVoteChatId() || null,
    dualBankGroupMode: dual.mode,
    leftBankGroupChatIdConfigured: Boolean(dual.left),
    rightBankGroupChatIdConfigured: Boolean(dual.right),
    supabaseConfigured: Boolean(supabaseAdmin),
    configuredChatId: telegramChatId || null,
    botInfo: null,
    discoveredChatIds: [],
    persistedChatIds: [],
    sendProbe: null,
    errors: [],
  };

  if (!bot) {
    health.errors.push("TELEGRAM_BOT_TOKEN is not configured.");
    return res.status(500).json(health);
  }

  try {
    const me = await bot.telegram.getMe();
    health.botInfo = {
      id: me.id,
      username: me.username || null,
      firstName: me.first_name || null,
    };
  } catch (error) {
    health.errors.push(`getMe failed: ${error?.description || error?.message || "unknown error"}`);
  }

  try {
    health.persistedChatIds = await loadChatIdsFromSupabase();
    const targetChatIds = await resolveTargetChatIds();
    health.discoveredChatIds = targetChatIds;
  } catch (error) {
    health.errors.push(`resolveTargetChatIds failed: ${error?.description || error?.message || "unknown error"}`);
  }

  if (telegramChatId) {
    try {
      await bot.telegram.getChat(telegramChatId);
      health.sendProbe = { chatId: telegramChatId, canAccessChat: true };
    } catch (error) {
      health.sendProbe = {
        chatId: telegramChatId,
        canAccessChat: false,
        error: error?.description || error?.message || "unknown error",
      };
      health.errors.push(`chat probe failed: ${health.sendProbe.error}`);
    }
  }

  health.ok = health.errors.length === 0;
  return res.status(health.ok ? 200 : 500).json(health);
});

app.get("/api/telegram/chats", async (_req, res) => {
  if (!bot) {
    return res.status(500).json({
      ok: false,
      error: "TELEGRAM_BOT_TOKEN is not configured.",
      chats: [],
    });
  }

  try {
    const { chats, persistedChatIds } = await syncTelegramChatsFromUpdates();
    return res.status(200).json({
      ok: true,
      total: chats.length,
      chats,
      persistedTotal: persistedChatIds.length,
      persistedChatIds,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.description || error?.message || "Failed to load chats from Telegram updates.",
      chats: [],
    });
  }
});

app.post("/api/signup", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const contact = String(req.body?.contact || "").trim();

    if (!name || !contact) {
      return res.status(400).json({ ok: false, error: "Name and contact are required." });
    }

    if (!bot) {
      return res.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN is not configured." });
    }

    const when = new Date().toLocaleString("uk-UA", {
      dateStyle: "long",
      timeStyle: "short",
    });

    const text = [
      "✨ Нова заявка з сайту",
      "",
      `👤 Імʼя: ${name}`,
      `📇 Контакт: ${contact}`,
      `🕐 Отримано: ${when}`,
    ].join("\n");

    const teacherTargets = await loadTeacherTargetsWithChatId();
    const targetChatIds = teacherTargets.map((t) => t.chatId);
    if (!targetChatIds.length) {
      return res.status(500).json({
        ok: false,
        error: "No teacher chat IDs found. Fill `teachers.chat_id` for teachers in admin/Supabase.",
      });
    }

    const sendResults = await Promise.allSettled(
      targetChatIds.map((chatId) => bot.telegram.sendMessage(chatId, text))
    );

    const delivered = sendResults.filter((result) => result.status === "fulfilled").length;
    if (!delivered) {
      const firstError = sendResults.find((result) => result.status === "rejected");
      if (firstError && firstError.status === "rejected") {
        console.error(
          "Telegram delivery failed for all target chats:",
          firstError.reason?.description || firstError.reason?.message || firstError.reason
        );
      }
      return res.status(500).json({
        ok: false,
        error:
          firstError && firstError.status === "rejected"
            ? `Telegram send failed: ${firstError.reason?.description || firstError.reason?.message || "unknown error"}`
            : "Failed to send Telegram message to all discovered chats.",
      });
    }

    return res.json({ ok: true, delivered, total: targetChatIds.length });
  } catch (error) {
    console.error("Telegram send failed:", error);
    return res.status(500).json({ ok: false, error: "Failed to send Telegram message." });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ ok: false, error: "Invalid JSON body." });
  }
  next(err);
});

if (bot) {
  /** Callback-и чекають завершення hydrate після рестарту; fallback з БД — у handler. */
  let voteHydrationPromise = Promise.resolve();
  if (supabaseAdmin) {
    voteHydrationPromise = Promise.all([
      hydrateOpenLessonVotesFromDb(),
      hydratePendingTwoStudentReviewsFromDb(),
    ])
      .then(([openCounts, reviewCount]) => {
        console.log(
          `[lesson-vote-scheduler] hydrated open votes: lesson=${openCounts.lesson} conduct=${openCounts.conduct} twoStudentReviews=${reviewCount}`,
        );
      })
      .catch((e) => {
        console.error("hydrateOpenLessonVotesFromDb:", e);
      });
  }

  bot.catch((err) => {
    const msg = err?.description || err?.message || String(err);
    if (isTelegramStaleCallbackQueryError(err)) {
      console.warn("Telegram stale callback (ignored):", msg);
      return;
    }
    console.error("Telegram bot handler error:", msg);
  });

  /** Поки працює long-polling Telegraf, додатковий getUpdates може не бачити ті самі апдейти — зберігаємо чат із кожного вхідного оновлення. */
  bot.use((ctx, next) => {
    const chat = ctx.chat;
    if (chat?.id) {
      void saveChatsToSupabase([
        {
          id: String(chat.id),
          type: chat.type || "unknown",
          title: chat.title ?? null,
          username: chat.username ?? null,
          firstName: chat.first_name ?? null,
          lastName: chat.last_name ?? null,
        },
      ]);
    }
    return next();
  });

  bot.on("callback_query", async (ctx) => {
    try {
      const data = String(ctx.callbackQuery?.data || "");
      const chatId = ctx.chat?.id;
      const messageId = ctx.callbackQuery?.message?.message_id;

      const conductPrefix = "lesson_conduct:";
      if (data.startsWith(conductPrefix)) {
        const conductId = data.slice(conductPrefix.length);
        if (!chatId || !messageId) {
          await safeAnswerCbQuery(ctx, "Не вдалося ідентифікувати повідомлення.");
          return;
        }

        const stateKey = attendanceGroupMemoryKey(chatId, messageId);
        let state = activeConductVotes.get(stateKey);
        if (!state || state.conductId !== conductId) {
          state = await ensureActiveConductVote(chatId, messageId, conductId);
        }
        if (!state || state.conductId !== conductId) {
          await safeAnswerCbQuery(ctx, "Оновлення вже неактивне.");
          return;
        }

        await safeAnswerCbQuery(ctx);

        const displayName = await resolveVoterDisplayName(ctx.telegram, chatId, ctx.from);
        state.conductorDisplayName = displayName;

        const text = buildLessonConductMessage(state.lessonContext, state.conductorDisplayName);
        await ctx.editMessageText(text, { reply_markup: buildLessonConductKeyboard(conductId) });

        if (state.linkedGroupVoteKey) {
          await refreshGroupAttendanceAfterConduct(state.linkedGroupVoteKey, displayName, String(chatId));
        } else if (state.voteOccurrenceId) {
          await persistOccurrenceConducting(state.voteOccurrenceId, displayName, String(chatId));
        }
        return;
      }

      const reviewKeepPrefix = "lesson_review_keep:";
      const reviewDeletePrefix = "lesson_review_delete:";
      if (data.startsWith(reviewKeepPrefix) || data.startsWith(reviewDeletePrefix)) {
        const isKeep = data.startsWith(reviewKeepPrefix);
        const reviewId = data.slice((isKeep ? reviewKeepPrefix : reviewDeletePrefix).length);
        if (!chatId || !messageId) {
          await safeAnswerCbQuery(ctx, "Не вдалося ідентифікувати повідомлення.");
          return;
        }

        const stateKey = attendanceGroupMemoryKey(chatId, messageId);
        let reviewState = activeLessonReviews.get(stateKey);
        if (!reviewState || reviewState.reviewId !== reviewId) {
          reviewState = await ensureActiveLessonReview(chatId, messageId, reviewId);
        }
        if (!reviewState || reviewState.reviewId !== reviewId) {
          await safeAnswerCbQuery(ctx, "Оновлення вже неактивне.");
          return;
        }

        await safeAnswerCbQuery(ctx);

        const clickerChatId = String(chatId);
        reviewState.conductingTelegramChatId = clickerChatId;
        const fromDb = await resolveTeacherDisplayNameByChatId(clickerChatId);
        reviewState.conductingDisplayName =
          fromDb ||
          [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ").trim() ||
          "Викладач";
        if (reviewState.row?.id) {
          await persistOccurrenceConducting(
            reviewState.row.id,
            reviewState.conductingDisplayName,
            clickerChatId,
          );
        }

        if (isKeep) {
          const confirmed = await confirmTwoStudentLesson(reviewState);
          const keptText = `${buildTwoStudentReviewMessage(
            reviewState.lessonContext,
            reviewState.votesByKind?.abon?.size ?? 0,
            reviewState.votesByKind?.single?.size ?? 0,
            reviewState.netIncome,
          )}\n\n${confirmed.ok ? "✅ Заняття підтверджено." : "⚠️ Не вдалося підтвердити заняття."}`;
          await finalizeTwoStudentReviewMessages(reviewState.row, keptText);
          return;
        }

        const cancelled = await cancelTwoStudentLesson(reviewState);
        const deletedText = cancelled.ok
          ? `${buildTwoStudentReviewMessage(
              reviewState.lessonContext,
              reviewState.votesByKind?.abon?.size ?? 0,
              reviewState.votesByKind?.single?.size ?? 0,
              reviewState.netIncome,
            )}\n\n🗑 Заняття скасовано.`
          : `${buildTwoStudentReviewMessage(
              reviewState.lessonContext,
              reviewState.votesByKind?.abon?.size ?? 0,
              reviewState.votesByKind?.single?.size ?? 0,
              reviewState.netIncome,
            )}\n\n⚠️ ${cancelled.error || "Не вдалося скасувати заняття."}`;
        await finalizeTwoStudentReviewMessages(reviewState.row, deletedText);
        return;
      }

      const match = data.match(/^lesson_vote:([^:]+):(abon|single|skip)$/);
      if (!match) {
        await safeAnswerCbQuery(ctx);
        return;
      }

      const [, voteId, choice] = match;
      if (!chatId || !messageId) {
        await safeAnswerCbQuery(ctx, "Не вдалося ідентифікувати повідомлення.");
        return;
      }

      const stateKey = attendanceGroupMemoryKey(chatId, messageId);
      let voteState = activeLessonVotes.get(stateKey);
      if (!voteState || voteState.voteId !== voteId) {
        voteState = await ensureActiveLessonVote(chatId, messageId, voteId);
      }
      if (!voteState || voteState.voteId !== voteId) {
        await safeAnswerCbQuery(ctx, "Голосування вже неактивне.");
        return;
      }

      const userId = String(ctx.from?.id || "");
      if (!userId) {
        await safeAnswerCbQuery(ctx, "Не вдалося визначити користувача.");
        return;
      }

      const feedback =
        choice === "abon"
          ? "Ваш голос: Абонемент"
          : choice === "single"
            ? "Ваш голос: Разове"
            : "Ви позначили: пропускаю";
      await safeAnswerCbQuery(ctx, feedback);

      const voter = await resolveVoterIdentity(ctx.telegram, chatId, ctx.from);
      voteState.votesByKind.abon.delete(userId);
      voteState.votesByKind.single.delete(userId);
      voteState.votesByKind.skip.delete(userId);
      voteState.votesByKind[choice].set(userId, voter);

      if (voteState.voteOccurrenceId) {
        await persistOccurrenceVotesOnly(voteState.voteOccurrenceId, voteState.votesByKind);
      }

      const text = buildLessonVoteMessage({
        ...voteState.lessonContext,
        votesByKind: voteState.votesByKind,
        teacherName: voteState.teacherName,
        conductingDisplayName: voteState.conductingDisplayName,
        audience: voteState.audience || "dm",
      });

      try {
        await ctx.editMessageText(text, { reply_markup: buildLessonVoteKeyboard(voteId) });
      } catch (err) {
        if (!isTelegramMessageNotModifiedError(err)) {
          console.warn("lesson vote callback editMessageText:", err?.description || err?.message || err);
        }
      }
    } catch (error) {
      if (isTelegramStaleCallbackQueryError(error)) {
        console.warn("lesson vote callback expired:", error?.description || error?.message || error);
        return;
      }
      console.error("Failed to process lesson vote callback:", error);
      await safeAnswerCbQuery(ctx, "Помилка обробки голосу.");
    }
  });

  const botLaunchStartedAtMs = Date.now();
  let botLaunchSettled = false;
  const botLaunchDiagnosticTimeout = setTimeout(() => {
    if (botLaunchSettled) return;
    console.error(
      "[lesson-vote-scheduler] bot launch diagnostic: pending >60s (possible reasons: blocked network to api.telegram.org, proxy/firewall, DNS issues, or another bot process causing long-poll contention)"
    );
  }, 60_000);
  bot
    .launch()
    .then(() => {
      botLaunchSettled = true;
      clearTimeout(botLaunchDiagnosticTimeout);
      console.log("Telegram bot polling started");
      console.log("[lesson-vote-scheduler] bot launch status=ok");
      syncTelegramChatsFromUpdates().catch((e) =>
        console.error("Initial Telegram chat discovery:", e?.description || e?.message || e)
      );
      setInterval(() => {
        syncTelegramChatsFromUpdates().catch((e) =>
          console.error("Telegram chat discovery tick:", e?.description || e?.message || e)
        );
      }, SCHEDULER_TICK_MS);
      if (supabaseAdmin) {
        console.log("[lesson-vote-scheduler] init status=ok (supabase=connected, tick_interval_ms=60000)");
        voteHydrationPromise.catch((e) => console.error("hydrateOpenLessonVotesFromDb:", e));
      } else {
        console.error("[lesson-vote-scheduler] init status=disabled (reason=supabase_not_configured)");
      }
    })
    .catch((error) => {
      botLaunchSettled = true;
      clearTimeout(botLaunchDiagnosticTimeout);
      const msg = error?.description || error?.message || String(error);
      console.error("Failed to launch Telegram bot polling:", msg);
      console.error(`[lesson-vote-scheduler] init status=disabled (reason=bot_launch_failed, error=${msg})`);
    });
}

/** One-shot: PREVIEW_WEEKLY_DIGEST_TEACHER=Ім'я node server.js -> writes PNG and exits. */
async function previewWeeklyDigestPngAndExit() {
  const teacherQuery = String(process.env.PREVIEW_WEEKLY_DIGEST_TEACHER || "").trim();
  if (!teacherQuery) return false;
  if (!supabaseAdmin) {
    console.error("[preview-weekly-digest] supabase not configured");
    process.exit(1);
  }
  const outPath = path.resolve(
    String(process.env.PREVIEW_WEEKLY_DIGEST_OUT || "").trim() ||
      path.join(__dirname, `weekly-digest-${teacherQuery}.png`),
  );
  const { formatWeekCompareSubtitle, renderWeeklyDigestPng } = await import("./weekly-digest-png.js");
  const { writeFileSync } = await import("fs");

  const { data: teachers, error } = await supabaseAdmin
    .from("teachers")
    .select("id, name")
    .ilike("name", `%${teacherQuery}%`)
    .limit(5);
  if (error) throw new Error(error.message);
  const teacher = (teachers || []).find((t) => String(t.name || "").trim() === teacherQuery) || teachers?.[0];
  if (!teacher) {
    console.error(`[preview-weekly-digest] teacher not found: ${teacherQuery}`);
    process.exit(1);
  }

  const currentWeek = getCompletedWeekRangeKyiv(1);
  const prevWeek = getCompletedWeekRangeKyiv(2);
  const dateSubtitle = formatWeekCompareSubtitle(currentWeek, prevWeek);

  const toTeacherSummary = (summary) => ({
    lessonsCount: Number(summary?.lessonsCount) || 0,
    uniquePeopleCount: Number(summary?.uniquePeopleCount) || 0,
    totalPeopleCount: Number(summary?.peopleCount) || 0,
    revenue: Number(summary?.revenue) || 0,
    payout: Number(summary?.payout) || 0,
  });
  const toOverallSummary = (dashboard) => {
    const s = dashboard?.summary || {};
    const teachersRows = dashboard?.teachers || [];
    return {
      lessonsCount: Number(s.totalLessons) || 0,
      uniquePeopleCount: Number(s.totalPeople) || 0,
      totalPeopleCount:
        Number(s.totalPeopleAll) || teachersRows.reduce((sum, row) => sum + (Number(row.peopleCount) || 0), 0),
      revenue: teachersRows.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0),
      payout: teachersRows.reduce((sum, row) => sum + (Number(row.payout) || 0), 0),
      scheduledLessons:
        s.totalScheduledLessons == null ? null : Number(s.totalScheduledLessons) || 0,
    };
  };

  const [overallCurrentRaw, overallPrevRaw, current, previous] = await Promise.all([
    computeAdminStatsDashboard(supabaseAdmin, {
      fromIso: currentWeek.fromIso,
      toIso: currentWeek.toIso,
      fromDate: currentWeek.fromDate,
      toDate: currentWeek.toDate,
    }),
    computeAdminStatsDashboard(supabaseAdmin, {
      fromIso: prevWeek.fromIso,
      toIso: prevWeek.toIso,
      fromDate: prevWeek.fromDate,
      toDate: prevWeek.toDate,
    }),
    computeTeacherLessonsJournal(supabaseAdmin, {
      teacherId: String(teacher.id),
      teacherName: String(teacher.name || ""),
      fromIso: currentWeek.fromIso,
      toIso: currentWeek.toIso,
    }),
    computeTeacherLessonsJournal(supabaseAdmin, {
      teacherId: String(teacher.id),
      teacherName: String(teacher.name || ""),
      fromIso: prevWeek.fromIso,
      toIso: prevWeek.toIso,
    }),
  ]);

  const teacherName = current.teacherName || teacher.name || "Викладач";
  const png = await renderWeeklyDigestPng({
    teacherName,
    dateSubtitle,
    teacherWeek: { current: toTeacherSummary(current.summary), previous: toTeacherSummary(previous.summary) },
    overallWeek: { current: toOverallSummary(overallCurrentRaw), previous: toOverallSummary(overallPrevRaw) },
  });
  writeFileSync(outPath, png);
  console.log(`[preview-weekly-digest] wrote ${outPath} teacher=${teacherName} label=${dateSubtitle} bytes=${png.length}`);
  return true;
}

if (await previewWeeklyDigestPngAndExit()) {
  process.exit(0);
}

startDailyLessonVoteCron({
  createDailyTimeEnv: lessonVoteDailyCreateCronTime,
  closeDailyTimeEnv: lessonVoteDailyCloseCronTime,
  digestDailyTimeEnv: adminDigestCronTime,
  weeklyDigestTimeEnv: adminWeeklyDigestCronTime,
  runBatchTeacherVotesInWindow,
  closeOpenVotesForToday,
  supabaseAdmin,
  expireOverdueSubscriptions,
  runDailyTeacherDigests: () => runDailyTeacherDigests(supabaseAdmin, bot),
  runWeeklyTeacherStatsDigests: () =>
    runWeeklyTeacherStatsDigests(supabaseAdmin, bot, computeTeacherLessonsJournal, computeAdminStatsDashboard),
  runMonthlyTeacherStatsDigests: () =>
    runMonthlyTeacherStatsDigests(supabaseAdmin, bot, computeTeacherLessonsJournal, computeMonthlyDigestOverall),
});

registerStudentRoutes(app, supabaseAdmin);

if (supabaseAdmin) {
  backfillStudentsFromSkipVotes(supabaseAdmin)
    .then((result) => {
      if (result.total > 0) {
        console.log(
          `[students] vote-snapshot reconcile total=${result.total} upserted=${result.upserted} errors=${result.errors}`,
        );
      }
    })
    .catch((error) => {
      console.error("[students] skip-voters backfill failed:", error?.message || error);
    });
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
