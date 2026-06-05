import { DateTime } from "luxon";

const KYIV_TZ = "Europe/Kyiv";

function normalizeDailyTime(rawValue) {
  const raw = String(rawValue || "").trim();
  const m = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function isSameKyivMinute(nowKyiv, hhmm) {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  return nowKyiv.hour === h && nowKyiv.minute === m;
}

async function logOpenLessonVotes({ supabaseAdmin }) {
  if (!supabaseAdmin) {
    console.error("[lesson-vote-daily-cron] open-check skipped: supabase_not_configured");
    return;
  }

  const nowIso = DateTime.now().setZone(KYIV_TZ).toUTC().toISO();
  const { data, error } = await supabaseAdmin
    .from("lesson_vote_occurrences")
    .select("id, lesson_time_id, occurrence_at, status, is_test")
    .eq("is_test", false)
    .neq("status", "finalized")
    .gte("occurrence_at", nowIso)
    .order("occurrence_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[lesson-vote-daily-cron] open-check failed:", error.message);
    return;
  }

  const openVotes = Array.isArray(data) ? data : [];
  console.log(`[lesson-vote-daily-cron] open-check count=${openVotes.length}`);
  for (const row of openVotes) {
    console.log(
      `[lesson-vote-daily-cron] open lesson_time_id=${row.lesson_time_id} occurrence_at=${row.occurrence_at} status=${row.status} id=${row.id}`
    );
  }
}

export function startDailyLessonVoteCron({
  createDailyTimeEnv,
  closeDailyTimeEnv,
  digestDailyTimeEnv,
  runBatchTeacherVotesInWindow,
  closeOpenVotesForToday,
  supabaseAdmin,
  expireOverdueSubscriptions,
  runDailyTeacherDigests,
}) {
  const createDailyTime = normalizeDailyTime(createDailyTimeEnv);
  const closeDailyTime = normalizeDailyTime(closeDailyTimeEnv);
  const digestDailyTime = normalizeDailyTime(digestDailyTimeEnv || "09:00");
  if (!createDailyTime || !closeDailyTime) {
    console.error(
      "[lesson-vote-daily-cron] disabled: invalid/missing env. Expected LESSON_VOTE_DAILY_CREATE_CRON_TIME and LESSON_VOTE_DAILY_CLOSE_CRON_TIME in HH:MM"
    );
    return;
  }
  let lastCreateRunDateKyiv = "";
  let lastCloseRunDateKyiv = "";
  let lastDigestRunDateKyiv = "";

  console.log(
    `[lesson-vote-daily-cron] enabled create_time=${createDailyTime} close_time=${closeDailyTime} digest_time=${digestDailyTime} tz=${KYIV_TZ}`
  );

  const tick = async () => {
    const nowKyiv = DateTime.now().setZone(KYIV_TZ);
    const dateKey = nowKyiv.toFormat("yyyy-LL-dd");

    if (isSameKyivMinute(nowKyiv, createDailyTime) && lastCreateRunDateKyiv !== dateKey) {
      lastCreateRunDateKyiv = dateKey;
      console.log(`[lesson-vote-daily-cron] create run started kyiv=${nowKyiv.toISO()}`);
      try {
        const batch = await runBatchTeacherVotesInWindow({ isTest: false });
        if (!batch?.ok) {
          console.error(
            `[lesson-vote-daily-cron] create failed error=${batch?.error || "unknown"} status=${batch?.httpStatus || 500}`
          );
        } else {
          console.log(
            `[lesson-vote-daily-cron] create ok created=${batch.createdCount} eligible=${batch.eligibleInWindow} duplicates=${batch.skippedDuplicate} outOfWindow=${batch.skippedOutOfWindow} failures=${Array.isArray(batch.failures) ? batch.failures.length : 0}`
          );
        }
      } catch (error) {
        console.error("[lesson-vote-daily-cron] create exception:", error?.message || error);
      }

      await logOpenLessonVotes({ supabaseAdmin });

      if (typeof expireOverdueSubscriptions === "function") {
        try {
          await expireOverdueSubscriptions(supabaseAdmin);
        } catch (error) {
          console.error("[lesson-vote-daily-cron] expire subscriptions:", error?.message || error);
        }
      }

      console.log(`[lesson-vote-daily-cron] create run finished date=${dateKey}`);
    }

    if (isSameKyivMinute(nowKyiv, closeDailyTime) && lastCloseRunDateKyiv !== dateKey) {
      lastCloseRunDateKyiv = dateKey;
      console.log(`[lesson-vote-daily-cron] close run started kyiv=${nowKyiv.toISO()}`);
      try {
        const closed = await closeOpenVotesForToday();
        console.log(
          `[lesson-vote-daily-cron] close done attempted=${closed.attempted} finalized=${closed.finalized} failed=${closed.failed}`
        );
      } catch (error) {
        console.error("[lesson-vote-daily-cron] close exception:", error?.message || error);
      }
    }

    if (
      digestDailyTime &&
      isSameKyivMinute(nowKyiv, digestDailyTime) &&
      lastDigestRunDateKyiv !== dateKey
    ) {
      lastDigestRunDateKyiv = dateKey;
      console.log(`[lesson-vote-daily-cron] digest run started kyiv=${nowKyiv.toISO()}`);
      if (typeof runDailyTeacherDigests === "function") {
        try {
          await runDailyTeacherDigests();
        } catch (error) {
          console.error("[lesson-vote-daily-cron] digest exception:", error?.message || error);
        }
      }
    }
  };

  void tick();
  setInterval(() => {
    void tick();
  }, 30_000);
}
