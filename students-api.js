import { DateTime } from "luxon";

const KYIV_TZ = "Europe/Kyiv";

/**
 * Скільки візитів уже використано по абонементу.
 * Без override — лише журнал. З override — вже використані до журналу + attended у журналі.
 * @param {number} fromVisits
 * @param {unknown} ovRaw
 * @param {number | null | undefined} totalVisits
 */
export function computeSubscriptionUsedVisits(fromVisits, ovRaw, totalVisits) {
  const journal = Math.max(0, Math.floor(Number(fromVisits) || 0));
  if (ovRaw == null || ovRaw === "" || !Number.isFinite(Number(ovRaw))) return journal;
  const opening = Math.max(0, Math.floor(Number(ovRaw)));
  const used = opening + journal;
  if (totalVisits != null && Number.isFinite(Number(totalVisits))) {
    return Math.min(Math.max(0, Math.floor(Number(totalVisits))), used);
  }
  return used;
}

/** @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin */
export async function resolveLessonTypeIdForOccurrence(supabaseAdmin, row) {
  const snap = row?.lesson_snapshot;
  if (snap && typeof snap.lesson_type_id === "string" && snap.lesson_type_id.trim()) {
    return snap.lesson_type_id.trim();
  }
  const lessonTimeId = row?.lesson_time_id;
  if (!lessonTimeId) return null;
  const { data, error } = await supabaseAdmin
    .from("lesson_times")
    .select("lesson_type_id")
    .eq("id", lessonTimeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.lesson_type_id ? String(data.lesson_type_id) : null;
}

/**
 * total_visits = куплений пакет (8). Залишок = total_visits - attendedCount.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 */
export async function recomputeSubscriptionStatus(supabaseAdmin, subscriptionId) {
  const { data: sub, error: subErr } = await supabaseAdmin
    .from("subscriptions")
    .select("id, total_visits, valid_until, status, used_visits_override")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (subErr) throw new Error(subErr.message);
  if (!sub) return;

  const { count, error: cntErr } = await supabaseAdmin
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("subscription_id", subscriptionId)
    .eq("visit_status", "attended");
  if (cntErr) throw new Error(cntErr.message);
  const fromVisits = Number(count) || 0;
  const attached = computeSubscriptionUsedVisits(fromVisits, sub.used_visits_override, sub.total_visits);

  let nextStatus = sub.status;
  if (sub.total_visits == null) {
    nextStatus = "pending";
  } else {
    const todayKyiv = DateTime.now().setZone(KYIV_TZ).toISODate();
    if (sub.valid_until && String(sub.valid_until) < String(todayKyiv)) {
      nextStatus = "exhausted";
    } else if (attached >= Number(sub.total_visits)) {
      nextStatus = "exhausted";
    } else {
      nextStatus = "active";
    }
  }

  if (nextStatus === sub.status) return;

  const { error: upErr } = await supabaseAdmin
    .from("subscriptions")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", subscriptionId);
  if (upErr) throw new Error(upErr.message);
}

/**
 * Активні абонементи з простроченим valid_until → перерахунок статусу (exhausted).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 */
export async function expireOverdueSubscriptions(supabaseAdmin) {
  if (!supabaseAdmin) return;
  const todayKyiv = DateTime.now().setZone(KYIV_TZ).toISODate();
  const { data: rows, error } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("status", "active")
    .not("valid_until", "is", null)
    .lt("valid_until", todayKyiv);
  if (error) throw new Error(error.message);
  const list = rows || [];
  if (list.length === 0) return;
  for (const r of list) {
    await recomputeSubscriptionStatus(supabaseAdmin, r.id);
  }
  console.log(
    `[subscriptions] expireOverdueSubscriptions recomputed=${list.length} kyiv_date=${todayKyiv}`,
  );
}

/** @param {unknown} raw */
function normalizePostFinalizeErrorsArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  return [];
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} occurrenceId
 * @param {Array<{ at: string, code: string, detail?: string }>} newEvents
 */
async function mergeOccurrencePostFinalizeErrors(supabaseAdmin, occurrenceId, newEvents) {
  if (!newEvents.length) return;
  const { data: row, error: fetchErr } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .select("post_finalize_errors")
    .eq("id", occurrenceId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  const prev = normalizePostFinalizeErrorsArray(row?.post_finalize_errors);
  const merged = [...prev, ...newEvents];
  const { error: upErr } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .update({ post_finalize_errors: merged })
    .eq("id", occurrenceId);
  if (upErr) throw new Error(upErr.message);
}

/**
 * @param {bigint} big
 * @param {string} uidStr
 */
function telegramUserIdForDb(big, uidStr) {
  const n = Number(uidStr);
  if (Number.isSafeInteger(n)) return n;
  return big.toString();
}

function isTelegramIdPlaceholder(name) {
  return /^Telegram \d+$/.test(String(name ?? "").trim());
}

/** Не перезаписувати вже збережене імʼя (без @) значенням-нікнеймом із snapshot голосу. */
function mergeStudentDisplayNameForUpsert(existingDisplayName, incomingFromVote) {
  const incoming = String(incomingFromVote ?? "").trim();
  const old = String(existingDisplayName ?? "").trim();
  if (!incoming) return old;
  if (old.length > 0 && incoming.startsWith("@") && !old.startsWith("@")) return old;
  if (old.length > 0 && isTelegramIdPlaceholder(incoming) && !isTelegramIdPlaceholder(old)) return old;
  if (isTelegramIdPlaceholder(old) && !isTelegramIdPlaceholder(incoming)) return incoming;
  return incoming;
}

/**
 * Значення з Map голосу або votes_snapshot (рядок, { name, telegram_username } або { n, u }).
 * @param {unknown} raw
 * @param {string} uidStr
 */
function participantFromVotesMap(raw, uidStr) {
  const uid = String(uidStr ?? "").trim();
  if (raw == null || raw === "") {
    return { name: uid ? `Telegram ${uid}` : "Telegram ?", telegram_username: null };
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("@")) {
      return { name: s, telegram_username: s.replace(/^@/, "") };
    }
    return { name: s || (uid ? `Telegram ${uid}` : ""), telegram_username: null };
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const name = String(raw.n ?? raw.name ?? "").trim();
    let un = raw.u ?? raw.un ?? raw.telegram_username ?? null;
    if (un != null) {
      un = String(un).trim().replace(/^@/, "");
      un = un || null;
    }
    return { name: name || (uid ? `Telegram ${uid}` : ""), telegram_username: un };
  }
  return { name: uid ? `Telegram ${uid}` : "", telegram_username: null };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 */
async function upsertStudentFromVote(
  supabaseAdmin,
  tid,
  displayNameTrimmed,
  uidStrForFallback,
  telegramUsernameFromVote = null,
) {
  const dn = String(displayNameTrimmed ?? "").trim() || `Telegram ${uidStrForFallback}`;
  const { data: existing } = await supabaseAdmin
    .from("students")
    .select("display_name")
    .eq("telegram_user_id", tid)
    .maybeSingle();
  const nameToStore = mergeStudentDisplayNameForUpsert(existing?.display_name ?? "", dn);
  /** @type {Record<string, unknown>} */
  const upsertPayload = {
    telegram_user_id: tid,
    display_name: nameToStore,
    updated_at: new Date().toISOString(),
  };
  if (telegramUsernameFromVote && String(telegramUsernameFromVote).trim())
    upsertPayload.telegram_username = String(telegramUsernameFromVote).trim().replace(/^@/, "");
  return await supabaseAdmin
    .from("students")
    .upsert(upsertPayload, { onConflict: "telegram_user_id" })
    .select("id")
    .single();
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} uidStr
 * @param {unknown} participantRaw
 * @param {(code: string, detail?: string) => void} [appendError]
 */
async function upsertStudentFromVoteParticipant(supabaseAdmin, uidStr, participantRaw, appendError) {
  let big;
  try {
    big = BigInt(uidStr);
  } catch {
    appendError?.("invalid_telegram_user_id", uidStr);
    return { ok: false, studentId: null };
  }

  const { name: displayNameTrimmed, telegram_username: voteUsername } = participantFromVotesMap(
    participantRaw,
    uidStr,
  );
  const tid = telegramUserIdForDb(big, uidStr);

  const { data: student, error: stErr } = await upsertStudentFromVote(
    supabaseAdmin,
    tid,
    displayNameTrimmed,
    uidStr,
    voteUsername,
  );
  if (stErr) {
    appendError?.("student_upsert_failed", stErr.message);
    return { ok: false, studentId: null };
  }
  return { ok: true, studentId: student.id };
}

/**
 * Синхронізація учнів з votes_snapshot finalized голосувань (backfill / repair імен і @ніків).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 */
export async function backfillStudentsFromSkipVotes(supabaseAdmin) {
  if (!supabaseAdmin) return { total: 0, upserted: 0, errors: 0 };

  const { data: occs, error } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .select("votes_snapshot")
    .eq("status", "finalized");
  if (error) throw new Error(error.message);

  /** @type {Map<string, unknown>} */
  const participantsByUid = new Map();
  for (const row of occs || []) {
    const snap = row?.votes_snapshot;
    if (!snap || typeof snap !== "object" || Array.isArray(snap)) continue;
    for (const kind of ["abon", "single", "skip"]) {
      const bucket = snap[kind];
      if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) continue;
      for (const [uidStr, raw] of Object.entries(bucket)) {
        if (!participantsByUid.has(uidStr)) participantsByUid.set(uidStr, raw);
      }
    }
  }

  let upserted = 0;
  let errors = 0;
  for (const [uidStr, participantRaw] of participantsByUid.entries()) {
    try {
      const result = await upsertStudentFromVoteParticipant(supabaseAdmin, uidStr, participantRaw);
      if (result.ok) upserted++;
      else errors++;
    } catch {
      errors++;
    }
  }

  return { total: participantsByUid.size, upserted, errors };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ occurrenceRow: { id: string, lesson_time_id?: string | null, lesson_snapshot?: Record<string, unknown> | null }, votesByKind: { abon?: Map<string, string>, single?: Map<string, string>, skip?: Map<string, string> } }} args
 */
export async function applyVisitsAfterFinalize(supabaseAdmin, { occurrenceRow, votesByKind }) {
  if (!supabaseAdmin) return;

  const errors = [];
  /**
   * @param {string} code
   * @param {string} [detail]
   */
  const appendError = (code, detail) => {
    /** @type {{ at: string, code: string, detail?: string }} */
    const ev = { at: new Date().toISOString(), code };
    if (detail !== undefined) ev.detail = String(detail);
    errors.push(ev);
  };

  const occurrenceId = occurrenceRow?.id;
  if (!occurrenceId) return;

  let lessonTypeId;
  try {
    lessonTypeId = await resolveLessonTypeIdForOccurrence(supabaseAdmin, occurrenceRow);
  } catch (e) {
    appendError("resolve_lesson_type_failed", e instanceof Error ? e.message : String(e));
    try {
      await mergeOccurrencePostFinalizeErrors(supabaseAdmin, occurrenceId, errors);
    } catch (e) {
      console.error("mergeOccurrencePostFinalizeErrors:", occurrenceId, e?.message || e);
    }
    return;
  }

  if (lessonTypeId == null) {
    appendError("missing_lesson_type_id");
    try {
      await mergeOccurrencePostFinalizeErrors(supabaseAdmin, occurrenceId, errors);
    } catch (e) {
      console.error("mergeOccurrencePostFinalizeErrors:", occurrenceId, e?.message || e);
    }
    return;
  }

  const abonMap = votesByKind?.abon instanceof Map ? votesByKind.abon : new Map();
  const singleMap = votesByKind?.single instanceof Map ? votesByKind.single : new Map();
  const skipMap = votesByKind?.skip instanceof Map ? votesByKind.skip : new Map();

  for (const [uidStr, participantRaw] of abonMap.entries()) {
    try {
      let big;
      try {
        big = BigInt(uidStr);
      } catch {
        appendError("invalid_telegram_user_id", uidStr);
        continue;
      }

      const { name: displayNameTrimmed, telegram_username: voteUsername } = participantFromVotesMap(
        participantRaw,
        uidStr,
      );
      const tid = telegramUserIdForDb(big, uidStr);

      const { data: student, error: stErr } = await upsertStudentFromVote(
        supabaseAdmin,
        tid,
        displayNameTrimmed,
        uidStr,
        voteUsername,
      );
      if (stErr) {
        appendError("student_upsert_failed", stErr.message);
        continue;
      }
      const studentId = student.id;

      const { data: existingVisit, error: exVErr } = await supabaseAdmin
        .from("visits")
        .select("id")
        .eq("student_id", studentId)
        .eq("lesson_vote_occurrence_id", occurrenceId)
        .maybeSingle();
      if (exVErr) {
        appendError("visit_lookup_failed", exVErr.message);
        continue;
      }
      if (existingVisit) continue;

      const { data: activeSub, error: actErr } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("student_id", studentId)
        .eq("lesson_type_id", lessonTypeId)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (actErr) {
        appendError("subscription_lookup_failed", actErr.message);
        continue;
      }

      let subscriptionId = null;
      if (activeSub) {
        subscriptionId = activeSub.id;
      } else {
        const { data: pendingSub, error: penErr } = await supabaseAdmin
          .from("subscriptions")
          .select("id")
          .eq("student_id", studentId)
          .eq("lesson_type_id", lessonTypeId)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (penErr) {
          appendError("subscription_lookup_failed", penErr.message);
          continue;
        }
        if (pendingSub) {
          subscriptionId = pendingSub.id;
        } else {
          const { data: newSub, error: insErr } = await supabaseAdmin
            .from("subscriptions")
            .insert({
              student_id: studentId,
              lesson_type_id: lessonTypeId,
              total_visits: null,
              status: "pending",
              updated_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          if (insErr) {
            appendError("subscription_insert_failed", insErr.message);
            continue;
          }
          subscriptionId = newSub.id;
        }
      }

      const { error: viErr } = await supabaseAdmin.from("visits").insert({
        student_id: studentId,
        lesson_vote_occurrence_id: occurrenceId,
        vote_choice: "abon",
        subscription_id: subscriptionId,
        visit_status: "attended",
      });
      if (viErr) {
        appendError("visit_insert_failed", viErr.message);
        continue;
      }

      await recomputeSubscriptionStatus(supabaseAdmin, subscriptionId);
    } catch (e) {
      appendError("apply_abon_visit_failed", e instanceof Error ? e.message : String(e));
    }
  }

  for (const [uidStr, participantRaw] of singleMap.entries()) {
    try {
      let big;
      try {
        big = BigInt(uidStr);
      } catch {
        appendError("invalid_telegram_user_id", uidStr);
        continue;
      }

      const { name: displayNameTrimmed, telegram_username: voteUsername } = participantFromVotesMap(
        participantRaw,
        uidStr,
      );
      const tid = telegramUserIdForDb(big, uidStr);

      const { data: student, error: stErr } = await upsertStudentFromVote(
        supabaseAdmin,
        tid,
        displayNameTrimmed,
        uidStr,
        voteUsername,
      );
      if (stErr) {
        appendError("student_upsert_failed", stErr.message);
        continue;
      }
      const studentId = student.id;

      const { data: existingVisit, error: exVErr } = await supabaseAdmin
        .from("visits")
        .select("id")
        .eq("student_id", studentId)
        .eq("lesson_vote_occurrence_id", occurrenceId)
        .maybeSingle();
      if (exVErr) {
        appendError("visit_lookup_failed", exVErr.message);
        continue;
      }
      if (existingVisit) continue;

      const { error: viErr } = await supabaseAdmin.from("visits").insert({
        student_id: studentId,
        lesson_vote_occurrence_id: occurrenceId,
        vote_choice: "single",
        subscription_id: null,
        visit_status: "attended",
      });
      if (viErr) {
        appendError("visit_insert_failed", viErr.message);
        continue;
      }
    } catch (e) {
      appendError("apply_single_visit_failed", e instanceof Error ? e.message : String(e));
    }
  }

  for (const [uidStr, participantRaw] of skipMap.entries()) {
    try {
      await upsertStudentFromVoteParticipant(supabaseAdmin, uidStr, participantRaw, appendError);
    } catch (e) {
      appendError("apply_skip_student_failed", e instanceof Error ? e.message : String(e));
    }
  }

  if (errors.length > 0) {
    try {
      await mergeOccurrencePostFinalizeErrors(supabaseAdmin, occurrenceId, errors);
    } catch (e) {
      console.error("mergeOccurrencePostFinalizeErrors:", occurrenceId, e?.message || e);
    }
  }
}

/** @param {string | undefined} s */
function wildIlike(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const esc = t.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return `%${esc}%`;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string[]} studentIds
 */
async function subscriptionSummaryForStudents(supabaseAdmin, studentIds) {
  if (studentIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("id, student_id, status, total_visits, used_visits_override")
    .in("student_id", studentIds);
  if (error) throw new Error(error.message);

  /** @type {Map<string, { pending: number, active: number, exhausted: number, subscriptions_count: number, abon_visits_total: number, abon_visits_remaining: number }>} */
  const m = new Map();
  for (const id of studentIds) {
    m.set(id, {
      pending: 0,
      active: 0,
      exhausted: 0,
      subscriptions_count: 0,
      abon_visits_total: 0,
      abon_visits_remaining: 0,
    });
  }

  /** @type {string[]} */
  const subIdsForVisits = [];
  for (const row of data || []) {
    const sid = row.student_id;
    const bucket = m.get(sid);
    if (!bucket) continue;
    bucket.subscriptions_count += 1;
    const st = String(row.status || "");
    if (st === "pending") bucket.pending += 1;
    else if (st === "active") bucket.active += 1;
    else if (st === "exhausted") bucket.exhausted += 1;

    const tv = row.total_visits;
    if (tv != null && Number.isFinite(Number(tv)) && Number(tv) > 0) {
      subIdsForVisits.push(String(row.id));
    }
  }

  /** @type {Map<string, number>} */
  const usedBySubscriptionId = new Map();
  if (subIdsForVisits.length > 0) {
    const { data: vRows, error: vErr } = await supabaseAdmin
      .from("visits")
      .select("subscription_id")
      .in("subscription_id", subIdsForVisits)
      .eq("visit_status", "attended");
    if (vErr) throw new Error(vErr.message);
    for (const v of vRows || []) {
      const sid = v.subscription_id;
      if (!sid) continue;
      usedBySubscriptionId.set(String(sid), (usedBySubscriptionId.get(String(sid)) || 0) + 1);
    }
  }

  for (const row of data || []) {
    const bucket = m.get(row.student_id);
    if (!bucket) continue;
    const tvRaw = row.total_visits;
    if (tvRaw == null || !Number.isFinite(Number(tvRaw))) continue;
    const total = Math.max(0, Math.floor(Number(tvRaw)));
    if (total <= 0) continue;
    const fromVisits = Math.min(total, Number(usedBySubscriptionId.get(String(row.id)) || 0));
    const used = computeSubscriptionUsedVisits(fromVisits, row.used_visits_override, total);
    const rem = Math.max(0, total - used);
    bucket.abon_visits_total += total;
    bucket.abon_visits_remaining += rem;
  }

  return m;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string[]} studentIds
 */
async function attendedVisitsCountForStudents(supabaseAdmin, studentIds) {
  if (studentIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from("visits")
    .select("student_id")
    .in("student_id", studentIds)
    .eq("visit_status", "attended");
  if (error) throw new Error(error.message);

  /** @type {Map<string, number>} */
  const m = new Map();
  for (const id of studentIds) m.set(String(id), 0);
  for (const row of data || []) {
    const sid = row.student_id;
    if (!sid) continue;
    m.set(String(sid), (m.get(String(sid)) || 0) + 1);
  }
  return m;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 */
async function studentIdsWithAnySubscription(supabaseAdmin) {
  const { data, error } = await supabaseAdmin.from("subscriptions").select("student_id");
  if (error) throw new Error(error.message);
  return new Set((data || []).map((r) => String(r.student_id || "")).filter(Boolean));
}

/**
 * @param {Set<string> | null} allowed
 * @param {string[]} nextIds
 * @returns {Set<string>}
 */
function intersectStudentIds(allowed, nextIds) {
  const nextSet = new Set(nextIds.filter(Boolean));
  if (allowed === null) return nextSet;
  return new Set([...allowed].filter((id) => nextSet.has(id)));
}

/**
 * @param {import("express").Express} app
 * @param {import("@supabase/supabase-js").SupabaseClient | null} supabaseAdmin
 */
export function registerStudentRoutes(app, supabaseAdmin) {
  app.get("/api/admin/students", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
      }
      const search = typeof req.query.search === "string" ? req.query.search : "";
      const filterRaw = typeof req.query.filter === "string" ? req.query.filter : "all";
      const filter =
        filterRaw === "pending" || filterRaw === "active" || filterRaw === "exhausted" ? filterRaw : "all";
      const abonRaw = typeof req.query.abon === "string" ? req.query.abon : "all";
      const abonFilter = abonRaw === "has_abon" || abonRaw === "no_abon" ? abonRaw : "all";

      /** @type {Set<string> | null} */
      let allowedStudentIds = null;

      if (filter !== "all") {
        const { data: subs, error: subErr } = await supabaseAdmin
          .from("subscriptions")
          .select("student_id")
          .eq("status", filter);
        if (subErr) return res.status(500).json({ ok: false, error: subErr.message });
        allowedStudentIds = intersectStudentIds(
          allowedStudentIds,
          (subs || []).map((r) => String(r.student_id || "")).filter(Boolean),
        );
        if (allowedStudentIds.size === 0) {
          return res.status(200).json({ ok: true, rows: [] });
        }
      }

      if (abonFilter !== "all") {
        const withAbon = await studentIdsWithAnySubscription(supabaseAdmin);
        if (abonFilter === "has_abon") {
          allowedStudentIds = intersectStudentIds(allowedStudentIds, [...withAbon]);
        } else {
          const { data: allStudents, error: allErr } = await supabaseAdmin.from("students").select("id");
          if (allErr) return res.status(500).json({ ok: false, error: allErr.message });
          const noAbonIds = (allStudents || [])
            .map((s) => String(s.id || ""))
            .filter((id) => id && !withAbon.has(id));
          allowedStudentIds = intersectStudentIds(allowedStudentIds, noAbonIds);
        }
        if (allowedStudentIds.size === 0) {
          return res.status(200).json({ ok: true, rows: [] });
        }
      }

      let q = supabaseAdmin.from("students").select("*");
      if (allowedStudentIds) q = q.in("id", [...allowedStudentIds]);
      const pattern = wildIlike(search);
      if (pattern) {
        q = q.or(
          `display_name.ilike.${pattern},telegram_username.ilike.${pattern},phone.ilike.${pattern},instagram.ilike.${pattern}`,
        );
      }
      const { data: students, error } = await q.order("created_at", { ascending: false });
      if (error) return res.status(500).json({ ok: false, error: error.message });

      const ids = (students || []).map((s) => s.id);
      const summaryMap = await subscriptionSummaryForStudents(supabaseAdmin, ids);
      const attendedMap = await attendedVisitsCountForStudents(supabaseAdmin, ids);
      const rows = (students || []).map((s) => ({
        ...s,
        subscription_summary: summaryMap.get(s.id) || {
          pending: 0,
          active: 0,
          exhausted: 0,
          subscriptions_count: 0,
          abon_visits_total: 0,
          abon_visits_remaining: 0,
        },
        attended_visits_count: attendedMap.get(String(s.id)) || 0,
      }));

      return res.status(200).json({ ok: true, rows });
    } catch (e) {
      console.error("GET /api/admin/students:", e?.message || e);
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/admin/students/:id", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
      }
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "Missing student id." });

      const { data: student, error: stErr } = await supabaseAdmin
        .from("students")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (stErr) return res.status(500).json({ ok: false, error: stErr.message });
      if (!student) return res.status(404).json({ ok: false, error: "Student not found." });

      const { data: subscriptions, error: subErr } = await supabaseAdmin
        .from("subscriptions")
        .select(
          "*, lesson_types ( id, name )",
        )
        .eq("student_id", id)
        .order("created_at", { ascending: false });
      if (subErr) return res.status(500).json({ ok: false, error: subErr.message });

      const { data: visits, error: vErr } = await supabaseAdmin
        .from("visits")
        .select(
          "id, vote_choice, subscription_id, visit_status, rolled_back_at, created_at, lesson_vote_occurrence_id, lesson_vote_occurrences ( id, occurrence_at, lesson_snapshot, place_id )",
        )
        .eq("student_id", id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (vErr) return res.status(500).json({ ok: false, error: vErr.message });

      return res.status(200).json({
        ok: true,
        student,
        subscriptions: subscriptions || [],
        visits: visits || [],
      });
    } catch (e) {
      console.error("GET /api/admin/students/:id:", e?.message || e);
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/admin/students", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
      }
      const telegramRaw = req.body?.telegram_user_id ?? req.body?.telegramUserId;
      const displayName = String(req.body?.display_name ?? req.body?.displayName ?? "").trim();
      if (telegramRaw === undefined || telegramRaw === null || String(telegramRaw).trim() === "") {
        return res.status(400).json({ ok: false, error: "telegram_user_id is required." });
      }
      if (!displayName) {
        return res.status(400).json({ ok: false, error: "display_name is required." });
      }
      let tid;
      try {
        tid = telegramUserIdForDb(BigInt(String(telegramRaw)), String(telegramRaw));
      } catch {
        return res.status(400).json({ ok: false, error: "Invalid telegram_user_id." });
      }

      const row = {
        telegram_user_id: tid,
        display_name: displayName,
        telegram_username: req.body?.telegram_username ?? req.body?.telegramUsername ?? null,
        instagram: req.body?.instagram ?? null,
        phone: req.body?.phone ?? null,
        admin_note: req.body?.admin_note ?? req.body?.adminNote ?? null,
        updated_at: new Date().toISOString(),
      };

      const { data: inserted, error } = await supabaseAdmin.from("students").insert(row).select("*").single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, row: inserted });
    } catch (e) {
      console.error("POST /api/admin/students:", e?.message || e);
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.patch("/api/admin/students/:id", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
      }
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "Missing student id." });

      /** @type {Record<string, unknown>} */
      const patch = {};
      const fields = ["display_name", "telegram_username", "instagram", "phone", "admin_note"];
      for (const f of fields) {
        if (Object.prototype.hasOwnProperty.call(req.body, f)) patch[f] = req.body[f];
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ ok: false, error: "No updatable fields in body." });
      }
      patch.updated_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin.from("students").update(patch).eq("id", id).select("*").maybeSingle();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      if (!data) return res.status(404).json({ ok: false, error: "Student not found." });
      return res.status(200).json({ ok: true, row: data });
    } catch (e) {
      console.error("PATCH /api/admin/students/:id:", e?.message || e);
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.delete("/api/admin/students/:id", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
      }
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "Missing student id." });

      const { count, error: cErr } = await supabaseAdmin
        .from("visits")
        .select("id", { count: "exact", head: true })
        .eq("student_id", id);
      if (cErr) return res.status(500).json({ ok: false, error: cErr.message });
      const visitCount = Number(count) || 0;

      const { error: delErr } = await supabaseAdmin.from("students").delete().eq("id", id);
      if (delErr) return res.status(500).json({ ok: false, error: delErr.message });
      return res.status(200).json({ ok: true, deletedId: id, visitCount });
    } catch (e) {
      console.error("DELETE /api/admin/students/:id:", e?.message || e);
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/admin/subscriptions", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
      }
      const student_id = req.body?.student_id ?? req.body?.studentId;
      const lesson_type_id = req.body?.lesson_type_id ?? req.body?.lessonTypeId;
      if (!student_id || !lesson_type_id) {
        return res.status(400).json({ ok: false, error: "student_id and lesson_type_id are required." });
      }

      const payload = {
        total_visits: req.body?.total_visits ?? req.body?.totalVisits ?? null,
        amount_uah: req.body?.amount_uah ?? req.body?.amountUah ?? null,
        purchased_at: req.body?.purchased_at ?? req.body?.purchasedAt ?? null,
        valid_until: req.body?.valid_until ?? req.body?.validUntil ?? null,
        updated_at: new Date().toISOString(),
      };

      const { data: pendingExists, error: penErr } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("student_id", student_id)
        .eq("lesson_type_id", lesson_type_id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (penErr) return res.status(500).json({ ok: false, error: penErr.message });

      let subId;
      if (pendingExists?.id) {
        const { data: updated, error: upErr } = await supabaseAdmin
          .from("subscriptions")
          .update(payload)
          .eq("id", pendingExists.id)
          .select("*")
          .single();
        if (upErr) return res.status(500).json({ ok: false, error: upErr.message });
        subId = updated.id;
      } else {
        const { data: ins, error: insErr } = await supabaseAdmin
          .from("subscriptions")
          .insert({
            student_id,
            lesson_type_id,
            status: "pending",
            total_visits: payload.total_visits,
            amount_uah: payload.amount_uah,
            purchased_at: payload.purchased_at,
            valid_until: payload.valid_until,
            updated_at: payload.updated_at,
          })
          .select("*")
          .single();
        if (insErr) return res.status(500).json({ ok: false, error: insErr.message });
        subId = ins.id;
      }

      if (payload.total_visits != null) {
        await recomputeSubscriptionStatus(supabaseAdmin, subId);
      }
      const { data: row, error: rErr } = await supabaseAdmin.from("subscriptions").select("*").eq("id", subId).single();
      if (rErr) return res.status(500).json({ ok: false, error: rErr.message });
      return res.status(200).json({ ok: true, row });
    } catch (e) {
      console.error("POST /api/admin/subscriptions:", e?.message || e);
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.patch("/api/admin/subscriptions/:id", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
      }
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "Missing subscription id." });

      /** @type {Record<string, unknown>} */
      const patch = {};
      for (const f of [
        "total_visits",
        "amount_uah",
        "purchased_at",
        "valid_until",
        "status",
        "used_visits_override",
      ]) {
        if (Object.prototype.hasOwnProperty.call(req.body, f)) patch[f] = req.body[f];
      }
      if (Object.prototype.hasOwnProperty.call(patch, "used_visits_override")) {
        const v = patch.used_visits_override;
        if (v === null || v === "") {
          patch.used_visits_override = null;
        } else {
          const n = Math.floor(Number(v));
          if (!Number.isFinite(n) || n < 0) {
            return res.status(400).json({
              ok: false,
              error: "used_visits_override must be null or an integer ≥ 0.",
            });
          }
          patch.used_visits_override = n;
        }
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ ok: false, error: "No updatable fields." });
      }
      patch.updated_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin.from("subscriptions").update(patch).eq("id", id).select("*").maybeSingle();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      if (!data) return res.status(404).json({ ok: false, error: "Subscription not found." });

      await recomputeSubscriptionStatus(supabaseAdmin, id);
      const { data: fresh, error: frErr } = await supabaseAdmin.from("subscriptions").select("*").eq("id", id).single();
      if (frErr) return res.status(500).json({ ok: false, error: frErr.message });
      return res.status(200).json({ ok: true, row: fresh });
    } catch (e) {
      console.error("PATCH /api/admin/subscriptions/:id:", e?.message || e);
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.delete("/api/admin/subscriptions/:id", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
      }
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "Missing subscription id." });

      const { error } = await supabaseAdmin.from("subscriptions").delete().eq("id", id);
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, deletedId: id });
    } catch (e) {
      console.error("DELETE /api/admin/subscriptions/:id:", e?.message || e);
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/admin/visits/:id/rollback", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
      }
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "Missing visit id." });

      const { data: v, error: vErr } = await supabaseAdmin.from("visits").select("*").eq("id", id).maybeSingle();
      if (vErr) return res.status(500).json({ ok: false, error: vErr.message });
      if (!v) return res.status(404).json({ ok: false, error: "Visit not found." });

      const nextStatus = v.visit_status === "attended" ? "rolled_back" : "attended";
      const rolled_back_at = nextStatus === "rolled_back" ? new Date().toISOString() : null;

      const { error: upErr } = await supabaseAdmin
        .from("visits")
        .update({ visit_status: nextStatus, rolled_back_at })
        .eq("id", id);
      if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

      if (v.subscription_id) {
        await recomputeSubscriptionStatus(supabaseAdmin, v.subscription_id);
      }

      const { data: fresh, error: frErr } = await supabaseAdmin.from("visits").select("*").eq("id", id).single();
      if (frErr) return res.status(500).json({ ok: false, error: frErr.message });
      return res.status(200).json({ ok: true, row: fresh });
    } catch (e) {
      console.error("POST /api/admin/visits/:id/rollback:", e?.message || e);
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/admin/lessons/:occurrenceId/visits", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ ok: false, error: "Supabase admin client is not configured." });
      }
      const occurrenceId = String(req.params.occurrenceId || "").trim();
      if (!occurrenceId) return res.status(400).json({ ok: false, error: "Missing occurrence id." });

      const { data: rows, error } = await supabaseAdmin
        .from("visits")
        .select(
          "id, student_id, vote_choice, subscription_id, visit_status, rolled_back_at, created_at, students ( display_name, telegram_user_id )",
        )
        .eq("lesson_vote_occurrence_id", occurrenceId)
        .order("created_at", { ascending: true });
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, rows: rows || [] });
    } catch (e) {
      console.error("GET /api/admin/lessons/:occurrenceId/visits:", e?.message || e);
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}
