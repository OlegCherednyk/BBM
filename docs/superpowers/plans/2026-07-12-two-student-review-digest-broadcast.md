# Two-student review digest broadcast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a 2-student lesson has no conducting teacher, send the confirm/cancel review form to every teacher with `digest_enabled`, and treat the clicker as conducting.

**Architecture:** Extend `notifyTeacherTwoStudentReview` with a digest broadcast branch; store all Telegram message refs as a jsonb array in `two_student_review_message`; normalize old single-object shape on read; on callback set conducting from the clicker and deactivate sibling messages.

**Tech Stack:** Node.js / Express / Telegraf, Supabase (`teachers`, `lesson_vote_occurrences`), existing Maps in `server.js`.

**Spec:** `docs/superpowers/specs/2026-07-12-two-student-review-digest-broadcast-design.md`

---

## File map

| File | Role |
|------|------|
| `server.js` | All behavior: helpers, notify, persist, hydrate, callback |
| (optional) no new SQL migration | jsonb shape change only, same column |

---

### Task 1: Helpers — normalize messages + load digest targets

**Files:**
- Modify: `server.js` (near `loadTeacherTargetsWithChatId` ~1841 and `persistTwoStudentReviewMessage` ~2666)

- [ ] **Step 1: Add `normalizeTwoStudentReviewMessages`**

Place above `persistTwoStudentReviewMessage`:

```js
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
  if (typeof raw === "object" && raw.chat_id != null && Number.isFinite(Number(raw.message_id)) && raw.review_id) {
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
```

- [ ] **Step 2: Add `loadDigestTeacherTargets`**

Place next to `loadTeacherTargetsWithChatId`:

```js
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
```

- [ ] **Step 3: Add `resolveTeacherDisplayNameByChatId`**

```js
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
```

- [ ] **Step 4: Replace persist helper to accept an array**

Replace `persistTwoStudentReviewMessage` with:

```js
async function persistTwoStudentReviewMessages(occurrenceId, messages) {
  if (!supabaseAdmin || !occurrenceId) return;
  const normalized = normalizeTwoStudentReviewMessages(messages);
  const { error } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .update({ two_student_review_message: normalized })
    .eq("id", occurrenceId);
  if (error) console.error("persistTwoStudentReviewMessages:", error.message);
}
```

Keep a thin wrapper if call sites still use the old name, or update all call sites to the new function.

---

### Task 2: Broadcast in `notifyTeacherTwoStudentReview`

**Files:**
- Modify: `server.js` function `notifyTeacherTwoStudentReview` (~1389)

- [ ] **Step 1: Rewrite the no-conducting branch**

Replace the early `if (!teacherChatId) { await notifyConductingTeacherPayout(...); return; }` with digest broadcast:

```js
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

  await persistTwoStudentReviewMessages(row.id, persistedMessages);
}
```

---

### Task 3: Hydrate / ensure review — read message arrays

**Files:**
- Modify: `server.js` `ensureActiveLessonReview` (~3015), `hydratePendingTwoStudentReviewsFromDb` (~3050)

- [ ] **Step 1: Update `ensureActiveLessonReview`**

When matching, use normalize:

```js
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
```

- [ ] **Step 2: Update `hydratePendingTwoStudentReviewsFromDb`**

For each pending row, iterate `normalizeTwoStudentReviewMessages(...)` and register each `(chat_id, message_id)` into `activeLessonReviews` (same `review_id` / row state).

---

### Task 4: Callback — set conducting from clicker + deactivate siblings

**Files:**
- Modify: `server.js` callback block `lesson_review_keep` / `lesson_review_delete` (~3788)

- [ ] **Step 1: Add helper to finalize all review Telegram messages**

```js
async function finalizeTwoStudentReviewMessages(row, finalText, exceptChatId, exceptMessageId) {
  if (!bot || !row) return;
  const messages = normalizeTwoStudentReviewMessages(row.two_student_review_message);
  for (const msg of messages) {
    const stateKey = attendanceGroupMemoryKey(msg.chat_id, msg.message_id);
    activeLessonReviews.delete(stateKey);
    const isClicker =
      String(msg.chat_id) === String(exceptChatId) &&
      Number(msg.message_id) === Number(exceptMessageId);
    // clicker already edited by caller; still safe to edit all
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
    void isClicker;
  }
}
```

- [ ] **Step 2: In keep/delete handlers, before confirm/cancel**

```js
const clickerChatId = String(chatId);
reviewState.conductingTelegramChatId = clickerChatId;
const fromDb = await resolveTeacherDisplayNameByChatId(clickerChatId);
reviewState.conductingDisplayName =
  fromDb ||
  [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ").trim() ||
  "Викладач";
```

Also persist conducting onto the occurrence early (optional but good): call existing `persistOccurrenceConducting(row.id, displayName, clickerChatId)` before confirm so DB matches.

- [ ] **Step 3: After confirm/cancel, deactivate all siblings**

Replace single `ctx.editMessageText` + `activeLessonReviews.delete(stateKey)` with building `finalText` then:

```js
await finalizeTwoStudentReviewMessages(reviewState.row, finalText, chatId, messageId);
```

Ensure `reviewState.row.two_student_review_message` is current (from DB if needed — re-select occurrence before finalize if RAM row is stale).

---

### Task 5: Manual verification

- [ ] **Step 1: Restart `npm start`**
- [ ] **Step 2: Checklist from spec**

1. No conducting + 2 students → digests receive form  
2. Clicker becomes teacher on lesson  
3. With conducting → only that chat  
4. Old single-object jsonb still hydrates (if any pending)  
5. Zero digest teachers → payout fallback + warning log  

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Broadcast when no conducting | 2 |
| Recipients = digest_enabled | 1 (`loadDigestTeacherTargets`) |
| Clicker = conducting | 4 |
| Sibling deactivate | 4 |
| Array jsonb + legacy object | 1 + 3 |
| Conducting present = single target | 2 |
| Empty digest list fallback | 2 |

## Self-review notes

- No new migration needed.
- Project has no automated test runner for bot flows — Task 5 is manual.
- Commit only if user asks.
