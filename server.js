import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Telegraf } from "telegraf";
import { createClient } from "@supabase/supabase-js";

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

app.get("/api/telegram/health", async (_req, res) => {
  const health = {
    ok: false,
    tokenConfigured: Boolean(botToken),
    chatIdConfigured: Boolean(telegramChatId),
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

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
