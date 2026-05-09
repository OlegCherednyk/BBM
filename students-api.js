import { DateTime } from "luxon";

const KYIV_TZ = "Europe/Kyiv";

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
    .select("id, total_visits, valid_until, status")
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
  const attached = Number(count) || 0;

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

  for (const [uidStr, displayName] of abonMap.entries()) {
    try {
      let big;
      try {
        big = BigInt(uidStr);
      } catch {
        appendError("invalid_telegram_user_id", uidStr);
        continue;
      }

      const displayNameTrimmed = String(displayName ?? "").trim();
      const dn = displayNameTrimmed || `Telegram ${uidStr}`;
      const tid = telegramUserIdForDb(big, uidStr);

      const { data: student, error: stErr } = await supabaseAdmin
        .from("students")
        .upsert(
          { telegram_user_id: tid, display_name: dn, updated_at: new Date().toISOString() },
          { onConflict: "telegram_user_id" },
        )
        .select("id")
        .single();
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

  for (const [uidStr, displayName] of singleMap.entries()) {
    try {
      let big;
      try {
        big = BigInt(uidStr);
      } catch {
        appendError("invalid_telegram_user_id", uidStr);
        continue;
      }

      const displayNameTrimmed = String(displayName ?? "").trim();
      const dn = displayNameTrimmed || `Telegram ${uidStr}`;
      const tid = telegramUserIdForDb(big, uidStr);

      const { data: student, error: stErr } = await supabaseAdmin
        .from("students")
        .upsert(
          { telegram_user_id: tid, display_name: dn, updated_at: new Date().toISOString() },
          { onConflict: "telegram_user_id" },
        )
        .select("id")
        .single();
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

  if (errors.length > 0) {
    try {
      await mergeOccurrencePostFinalizeErrors(supabaseAdmin, occurrenceId, errors);
    } catch (e) {
      console.error("mergeOccurrencePostFinalizeErrors:", occurrenceId, e?.message || e);
    }
  }
}
