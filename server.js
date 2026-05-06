import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Telegraf } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

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

/** JS getDay(): 0 = Sunday … 6 = Saturday — короткі підписи українською */
const DAY_SHORT_UK = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const KYIV_TZ = "Europe/Kyiv";
/** Вікно автоголосування: відправка не раніше ніж за 5×24 год і не пізніше ніж за 24 год до початку заняття (Київ) */
const VOTE_SCHED_OPEN_MAX_HOURS_BEFORE = 5 * 24;
const VOTE_SCHED_CLOSE_MAX_HOURS_BEFORE = 24;
const SCHEDULER_TICK_MS = 60 * 1000;

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
 * Значення з адмінки (places.river_bank), напр. «Лівий берег» / «Правий берег»
 * @returns {"left"|"right"|null}
 */
function parsePlaceRiverBank(riverBankRaw) {
  const s = String(riverBankRaw || "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (s.includes("лів")) return "left";
  if (s.includes("прав")) return "right";
  return null;
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
  const abonVoters = [...(votesByKind.abon || new Map()).values()];
  const singleVoters = [...(votesByKind.single || new Map()).values()];
  const skipVoters = [...(votesByKind.skip || new Map()).values()];
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
    `💃 Тип заняття: ${lessonTypeLabel}`,
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
  if (typeof user.username === "string" && user.username.trim()) return `@${user.username.trim()}`;
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;
  return `id:${String(user.id || "unknown")}`;
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
    `💃 Тип заняття: ${lessonContext.lessonTypeLabel}`,
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
    for (const [uid, name] of m.entries()) out[k][String(uid)] = String(name);
  }
  return out;
}

function snapshotToVotesByKind(snap) {
  const votesByKind = { abon: new Map(), single: new Map(), skip: new Map() };
  if (!snap || typeof snap !== "object") return votesByKind;
  for (const k of ["abon", "single", "skip"]) {
    const obj = snap[k];
    if (obj && typeof obj === "object") {
      for (const [uid, name] of Object.entries(obj)) votesByKind[k].set(String(uid), String(name));
    }
  }
  return votesByKind;
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

async function persistOccurrenceConducting(voteOccurrenceId, conductingDisplayName) {
  if (!voteOccurrenceId || !supabaseAdmin) return;
  try {
    const val =
      typeof conductingDisplayName === "string" && conductingDisplayName.trim().length > 0
        ? conductingDisplayName.trim()
        : null;
    const { error } = await supabaseAdmin
      .from("lesson_vote_occurrences")
      .update({ conducting_display_name: val })
      .eq("id", voteOccurrenceId);
    if (error) console.error("persistOccurrenceConducting:", error.message);
  } catch (e) {
    console.error("persistOccurrenceConducting:", e?.message || e);
  }
}

async function refreshGroupAttendanceAfterConduct(linkedGroupVoteKey, conductingDisplayName) {
  if (!bot || !linkedGroupVoteKey) return;
  const groupState = activeLessonVotes.get(linkedGroupVoteKey);
  if (!groupState) return;

  groupState.conductingDisplayName =
    typeof conductingDisplayName === "string" && conductingDisplayName.trim().length > 0
      ? conductingDisplayName.trim()
      : null;

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
    console.error("Failed to refresh group attendance message:", err?.description || err?.message || err);
  }

  if (groupState.voteOccurrenceId) {
    await persistOccurrenceConducting(groupState.voteOccurrenceId, groupState.conductingDisplayName);
  }
}

async function loadTeacherTargetsWithChatId() {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from("teachers")
    .select("id, name, chat_id")
    .not("chat_id", "is", null);

  if (error) {
    throw new Error(`Failed to load teachers with chat_id: ${error.message}`);
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

/** Найближчий майбутній початок слоту за київським часом */
function computeNextOccurrenceKyiv(row) {
  const nowKyiv = DateTime.now().setZone(KYIV_TZ);
  const luxWd = dbDayToLuxonWeekday(row.day_of_week);
  const { hour, minute, second } = parseTimeHms(row.start_time);
  let best = null;
  for (let d = 0; d <= 28; d++) {
    const day = nowKyiv.plus({ days: d });
    if (day.weekday !== luxWd) continue;
    const slotDt = day.set({ hour, minute, second, millisecond: 0 });
    if (slotDt > nowKyiv) {
      if (!best || slotDt < best) best = slotDt;
    }
  }
  return best;
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
  if (!supabaseAdmin) {
    return {
      lessonTimeLabel: "не вказано",
      placeLabel: "не вказано",
      lessonTypeLabel: "не вказано",
      riverBank: null,
    };
  }

  let lessonTimeLabel = "не вказано";
  let placeLabel = "не вказано";
  let lessonTypeLabel = "не вказано";
  let riverBank = null;

  if (lessonTimeId) {
    const { data, error } = await supabaseAdmin
      .from("lesson_times")
      .select("day_of_week, start_time, lesson_types(name)")
      .eq("id", lessonTimeId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load lesson_time: ${error.message}`);
    if (data) {
      const di = Number(data.day_of_week);
      const dayName = Number.isFinite(di) && di >= 0 && di <= 6 ? DAY_SHORT_UK[di] : `день ${data.day_of_week}`;
      lessonTimeLabel = `${dayName}, ${String(data.start_time || "").slice(0, 5)} (Київ)`;
      lessonTypeLabel = data.lesson_types?.name || lessonTypeLabel;
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

  return { lessonTimeLabel, placeLabel, lessonTypeLabel, riverBank };
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

  const [teachers, lessonContext] = await Promise.all([
    loadTeacherTargetsWithChatId(),
    loadLessonContext(lessonTimeId, placeId),
  ]);

  const resolvedGroup = resolveGroupVoteChatIdForLessonPlace(lessonContext.riverBank);
  if (resolvedGroup.error || !resolvedGroup.chatId) {
    return {
      success: false,
      error: resolvedGroup.error || "Не вдалося обрати Telegram-групу для голосування.",
      httpStatus: 400,
    };
  }
  const groupChatId = resolvedGroup.chatId;

  const voteId = `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const lessonSnapshot = {
    lessonTimeLabel: lessonContext.lessonTimeLabel,
    placeLabel: lessonContext.placeLabel,
    lessonTypeLabel: lessonContext.lessonTypeLabel,
    riverBank: lessonContext.riverBank,
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
    audience: "group",
    votesByKind: votesByKindGroup,
    voteOccurrenceId,
    isTestOccurrence: Boolean(isTest),
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

function findActiveLessonVoteByVoteId(voteIdRaw) {
  const needle = String(voteIdRaw || "").trim();
  if (!needle) return null;
  for (const [stateKey, st] of activeLessonVotes.entries()) {
    if (st.voteId === needle) return { stateKey, state: st };
  }
  return null;
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
    groupTelegramOk = false;
    lastError = e?.description || e?.message || "Не вдалося оновити повідомлення в групі.";
    console.error("close group vote message:", lastError);
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

async function persistFinalizedVotesToLessonRow(row, votesByKind, conductingDisplayName) {
  if (!supabaseAdmin || row?.is_test) return;
  const lessonTimeId = row.lesson_time_id;
  const placeId = row.place_id;
  const startsAt = row.occurrence_at;
  if (!lessonTimeId || !startsAt) return;

  const abon = votesByKind.abon.size;
  const single = votesByKind.single.size;
  const skip = votesByKind.skip.size;
  const voteFinalizedAt = new Date().toISOString();
  const cond =
    typeof conductingDisplayName === "string" && conductingDisplayName.trim().length > 0
      ? conductingDisplayName.trim()
      : null;
  const finalVotesSnapshot = votesByKindToSnapshot(votesByKind);

  try {
    const { data: existing, error: selErr } = await supabaseAdmin
      .from("lessons")
      .select("id")
      .eq("lesson_time_id", lessonTimeId)
      .eq("starts_at", startsAt)
      .maybeSingle();

    if (selErr) {
      console.error("persistFinalizedVotesToLessonRow select:", selErr.message);
      return;
    }

    const payload = {
      lesson_time_id: lessonTimeId,
      place_id: placeId,
      starts_at: startsAt,
      abon_count: abon,
      single_visitors_count: single,
      skip_visitors_count: skip,
      conducting_display_name: cond,
      vote_finalized_at: voteFinalizedAt,
      vote_snapshot: finalVotesSnapshot,
      lesson_vote_occurrence_id: row.id,
    };

    if (existing?.id) {
      const { error: upLesson } = await supabaseAdmin.from("lessons").update(payload).eq("id", existing.id);
      if (upLesson) console.error("persistFinalizedVotesToLessonRow update:", upLesson.message);
    } else {
      const { error: insLesson } = await supabaseAdmin.from("lessons").insert(payload);
      if (insLesson) console.error("persistFinalizedVotesToLessonRow insert:", insLesson.message);
    }
  } catch (e) {
    console.error("persistFinalizedVotesToLessonRow:", e?.message || e);
  }
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

  await persistFinalizedVotesToLessonRow(row, votesByKind, conductingDisplayName);
}

/** Після рестарту відновлює in-memory стан для відкритих голосувань (callback-и знову працюють). */
async function hydrateOpenLessonVotesFromDb() {
  if (!supabaseAdmin) return;
  try {
    const { data: rows, error } = await supabaseAdmin
      .from("lesson_vote_occurrences")
      .select("*")
      .eq("status", "open");

    if (error) {
      console.error("hydrateOpenLessonVotesFromDb:", error.message);
      return;
    }

    for (const row of rows || []) {
      const chatId = row.telegram_group_chat_id;
      const messageId = row.telegram_group_message_id;
      if (!chatId || !Number.isFinite(Number(messageId))) continue;

      const snap = row.lesson_snapshot || {};
      const lessonContext = {
        lessonTimeLabel: snap.lessonTimeLabel || "не вказано",
        placeLabel: snap.placeLabel || "не вказано",
        lessonTypeLabel: snap.lessonTypeLabel || "не вказано",
        riverBank: snap.riverBank ?? null,
      };

      const votesByKind = snapshotToVotesByKind(row.votes_snapshot);
      const groupKey = attendanceGroupMemoryKey(chatId, messageId);
      activeLessonVotes.set(groupKey, {
        voteId: row.vote_id,
        lessonContext,
        teacherName: null,
        conductingDisplayName: row.conducting_display_name ?? null,
        audience: "group",
        votesByKind,
        voteOccurrenceId: row.id,
        isTestOccurrence: Boolean(row.is_test),
      });

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
    }
  } catch (e) {
    console.error("hydrateOpenLessonVotesFromDb:", e?.message || e);
  }
}

async function runScheduledLessonVotesTick() {
  if (!bot || !supabaseAdmin) return;

  try {
    const nowKyiv = DateTime.now().setZone(KYIV_TZ);

    const { data: openRows, error: openErr } = await supabaseAdmin
      .from("lesson_vote_occurrences")
      .select("*")
      .eq("status", "open")
      .eq("is_test", false);

    if (openErr) {
      console.error("scheduler open votes:", openErr.message);
    } else {
      for (const row of openRows || []) {
        const occ = DateTime.fromISO(row.occurrence_at, { zone: "utc" }).setZone(KYIV_TZ);
        const hoursUntil = occ.diff(nowKyiv, "hours").hours;
        if (hoursUntil <= VOTE_SCHED_CLOSE_MAX_HOURS_BEFORE) {
          await finalizeLessonVoteOccurrence(row);
        }
      }
    }

    const { data: slots, error } = await supabaseAdmin
      .from("lesson_times")
      .select("id, place_id, day_of_week, start_time")
      .not("place_id", "is", null);

    if (error) {
      console.error("scheduler lesson_times:", error.message);
      return;
    }

    for (const row of slots || []) {
      const next = computeNextOccurrenceKyiv(row);
      if (!next) continue;
      const hoursUntil = next.diff(nowKyiv, "hours").hours;
      if (hoursUntil <= VOTE_SCHED_CLOSE_MAX_HOURS_BEFORE || hoursUntil > VOTE_SCHED_OPEN_MAX_HOURS_BEFORE) {
        continue;
      }

      const occurrenceIso = next.toUTC().toISO();
      const exec = await executeLessonAttendanceVote({
        lessonTimeId: row.id,
        placeId: row.place_id,
        defaultUsed: false,
        occurredAt: null,
        persistToDb: true,
        occurrenceAtIso: occurrenceIso,
      });

      if (exec.duplicate) continue;
      if (!exec.success) {
        console.error("scheduler open vote failed:", exec.error);
      }
    }
  } catch (e) {
    console.error("runScheduledLessonVotesTick:", e?.message || e);
  }
}

app.post("/api/telegram/teachers/test-vote", async (req, res) => {
  try {
    if (!bot) {
      return res.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN is not configured." });
    }
    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
    }

    const ids = await resolveLessonIdsForVote(req.body || {});
    const { lessonTimeId, placeId, defaultUsed, occurredAt } = ids;

    if (!lessonTimeId) {
      return res.status(400).json({
        ok: false,
        error:
          "Не знайдено заняття за замовчуванням: у таблиці lesson_times немає слотів або не вдалося підібрати останнє минуле заняття.",
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
      return res.status(409).json({ ok: false, error: "Дубль голосування (неочікувано для тесту)." });
    }
    if (!exec.success) {
      return res.status(exec.httpStatus || 500).json({ ok: false, error: exec.error });
    }

    return res.status(200).json(exec.payload);
  } catch (error) {
    console.error("Failed to send teacher test vote:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to send teacher test vote." });
  }
});

app.post("/api/telegram/teachers/test-vote/close", async (req, res) => {
  try {
    if (!bot) {
      return res.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN is not configured." });
    }
    const voteId = String(req.body?.vote_id || req.body?.voteId || "").trim();
    if (!voteId) {
      return res.status(400).json({
        ok: false,
        error: "Передайте vote_id (з відповіді тестового запиту) у тілі JSON.",
      });
    }
    const found = findActiveLessonVoteByVoteId(voteId);
    if (!found) {
      return res.status(404).json({
        ok: false,
        error:
          "Не знайдено активного голосування для цього vote_id у пам'яті сервера (вже закрито або після перезапуску — закрий запис у lesson_vote_occurrences вручну, якщо status=open).",
      });
    }

    const p = parseMessageStateKey(found.stateKey);
    if (!p || !found.state.lessonContext || !found.state.votesByKind) {
      return res.status(500).json({ ok: false, error: "Пошкоджений стан голосування в пам'яті." });
    }

    const conductChatTargets = collectConductChatTargets(found.stateKey, null);
    const conductingDisplayName =
      typeof found.state.conductingDisplayName === "string" && found.state.conductingDisplayName.trim().length > 0
        ? found.state.conductingDisplayName.trim()
        : null;

    /** Знімаємо до закриття (пам'ять очиститься після Telegram). */
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
      return res.status(502).json({
        ok: false,
        error:
          closeRes.error ||
          "Не вдалося коректно оновити Telegram; перевір журнал сервера. Стан голосування в пам'яті очищено.",
        telegramWarning: true,
      });
    }

    if (occIdClose && supabaseAdmin) {
      const markTry = await markLessonVoteOccurrenceFinalizedInDb(occIdClose, votesSnap, conductingDisplayName);
      if (!markTry.ok) {
        console.warn("test-vote/close DB finalize:", markTry.error);
      }
    }

    return res.status(200).json({ ok: true, voteId });
  } catch (error) {
    console.error("test-vote close failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to close test vote." });
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
    const updates = await getRecentUpdates();
    const chats = extractChatsFromUpdates(updates);
    await saveChatsToSupabase(chats);
    const persistedChatIds = await loadChatIdsFromSupabase();
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

    const targetChatIds = await resolveTargetChatIds();
    if (!targetChatIds.length) {
      return res.status(500).json({
        ok: false,
        error: "No chat IDs found. Send a message to bot first (private chat/group/channel).",
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
  bot.on("callback_query", async (ctx) => {
    try {
      const data = String(ctx.callbackQuery?.data || "");
      const chatId = ctx.chat?.id;
      const messageId = ctx.callbackQuery?.message?.message_id;

      const conductPrefix = "lesson_conduct:";
      if (data.startsWith(conductPrefix)) {
        const conductId = data.slice(conductPrefix.length);
        if (!chatId || !messageId) {
          await ctx.answerCbQuery("Не вдалося ідентифікувати повідомлення.");
          return;
        }

        const stateKey = attendanceGroupMemoryKey(chatId, messageId);
        const state = activeConductVotes.get(stateKey);
        if (!state || state.conductId !== conductId) {
          await ctx.answerCbQuery("Оновлення вже неактивне.");
          return;
        }

        const displayName = buildDisplayNameFromUser(ctx.from);
        state.conductorDisplayName = displayName;

        const text = buildLessonConductMessage(state.lessonContext, state.conductorDisplayName);
        await ctx.editMessageText(text, { reply_markup: buildLessonConductKeyboard(conductId) });

        if (state.linkedGroupVoteKey) {
          await refreshGroupAttendanceAfterConduct(state.linkedGroupVoteKey, displayName);
        } else if (state.voteOccurrenceId) {
          await persistOccurrenceConducting(state.voteOccurrenceId, displayName);
        }

        await ctx.answerCbQuery(`Проводить: ${displayName}`);
        return;
      }

      const match = data.match(/^lesson_vote:([^:]+):(abon|single|skip)$/);
      if (!match) {
        await ctx.answerCbQuery();
        return;
      }

      const [, voteId, choice] = match;
      if (!chatId || !messageId) {
        await ctx.answerCbQuery("Не вдалося ідентифікувати повідомлення.");
        return;
      }

      const stateKey = attendanceGroupMemoryKey(chatId, messageId);
      const voteState = activeLessonVotes.get(stateKey);
      if (!voteState || voteState.voteId !== voteId) {
        await ctx.answerCbQuery("Голосування вже неактивне.");
        return;
      }

      const userId = String(ctx.from?.id || "");
      if (!userId) {
        await ctx.answerCbQuery("Не вдалося визначити користувача.");
        return;
      }

      const displayName = buildDisplayNameFromUser(ctx.from);
      voteState.votesByKind.abon.delete(userId);
      voteState.votesByKind.single.delete(userId);
      voteState.votesByKind.skip.delete(userId);
      voteState.votesByKind[choice].set(userId, displayName);

      const text = buildLessonVoteMessage({
        ...voteState.lessonContext,
        votesByKind: voteState.votesByKind,
        teacherName: voteState.teacherName,
        conductingDisplayName: voteState.conductingDisplayName,
        audience: voteState.audience || "dm",
      });

      await ctx.editMessageText(text, { reply_markup: buildLessonVoteKeyboard(voteId) });
      if (voteState.voteOccurrenceId) {
        await persistOccurrenceVotesOnly(voteState.voteOccurrenceId, voteState.votesByKind);
      }
      const feedback =
        choice === "abon"
          ? "Ваш голос: Абонемент"
          : choice === "single"
            ? "Ваш голос: Разове"
            : "Ви позначили: пропускаю";
      await ctx.answerCbQuery(feedback);
    } catch (error) {
      console.error("Failed to process lesson vote callback:", error);
      await ctx.answerCbQuery("Помилка обробки голосу.");
    }
  });

  bot
    .launch()
    .then(() => {
      console.log("Telegram bot polling started");
      if (supabaseAdmin) {
        hydrateOpenLessonVotesFromDb()
          .then(() =>
            runScheduledLessonVotesTick().catch((e) => console.error("Initial lesson vote scheduler tick:", e))
          )
          .catch((e) => console.error("hydrateOpenLessonVotesFromDb:", e));
        setInterval(() => {
          runScheduledLessonVotesTick().catch((e) => console.error("Lesson vote scheduler tick:", e));
        }, SCHEDULER_TICK_MS);
      }
    })
    .catch((error) => {
      console.error("Failed to launch Telegram bot polling:", error?.description || error?.message || error);
    });
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
