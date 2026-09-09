import "server-only";

/**
 * Yangon-local date maths, shared by every server read that buckets or bounds
 * on `created_at`.
 *
 * created_at is timestamptz, so Postgres hands back an absolute instant and
 * bucketing it in UTC would move every sale before 06:30 local into the
 * previous day. The shop is in Yangon, UTC+06:30, with no DST and no offset
 * change since 1945 - so a fixed offset is correct here and simpler than a tz
 * database.
 */
export const YANGON_OFFSET_MIN = 6 * 60 + 30;

/** The local (Yangon) calendar day an instant falls in, as YYYY-MM-DD. */
export function yangonDay(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + YANGON_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * The absolute instant of 00:00 Yangon on a given calendar day, passed as
 * "YYYY-MM-DD". Turns a date-range input (which staff read as a local date)
 * into the UTC bound a timestamptz column compares against. Returns null for
 * anything not shaped like a date.
 */
export function yangonDayStart(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const utcMidnight = new Date(`${date}T00:00:00.000Z`).getTime();
  if (Number.isNaN(utcMidnight)) return null;
  return new Date(utcMidnight - YANGON_OFFSET_MIN * 60_000);
}
