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
