import type { LimitedFeature } from "../src/lib/subscriptions/limits";
import { FREE_USAGE_LIMITS, localDayKey } from "../src/lib/subscriptions/limits";
import { getPool } from "./postgres";

export type UsageResult = {
  allowed: boolean;
  isPremium: boolean;
  feature: LimitedFeature;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  localDay: string;
  timeZone: string;
};

export function validateTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export async function reserveDailyUsage(userId: string, feature: LimitedFeature, requestedTimeZone: string, now = new Date()): Promise<UsageResult> {
  if (!validateTimeZone(requestedTimeZone)) throw new Error("Use a valid IANA timezone.");
  const limit = FREE_USAGE_LIMITS[feature].dailyLimit;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO user_usage_settings (user_id, time_zone)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, requestedTimeZone],
    );
    const settings = await client.query<{ time_zone: string }>(
      "SELECT time_zone FROM user_usage_settings WHERE user_id = $1",
      [userId],
    );
    const timeZone = settings.rows[0]?.time_zone ?? "UTC";
    const localDay = localDayKey(now, timeZone);
    const reserved = await client.query<{ used: number }>(
      `INSERT INTO daily_feature_usage (user_id, local_day, feature, used)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (user_id, local_day, feature)
       DO UPDATE SET used = daily_feature_usage.used + 1
       WHERE daily_feature_usage.used < $4
       RETURNING used`,
      [userId, localDay, feature, limit],
    );

    if (reserved.rowCount) {
      const used = Number(reserved.rows[0].used);
      await client.query("COMMIT");
      return { allowed: true, isPremium: false, feature, used, limit, remaining: limit - used, localDay, timeZone };
    }

    const existing = await client.query<{ used: number }>(
      `SELECT used FROM daily_feature_usage
       WHERE user_id = $1 AND local_day = $2 AND feature = $3`,
      [userId, localDay, feature],
    );
    const used = Number(existing.rows[0]?.used ?? limit);
    await client.query("COMMIT");
    return { allowed: false, isPremium: false, feature, used, limit, remaining: 0, localDay, timeZone };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}