// Currency + number/time formatting. Shop currency is Myanmar Kyat (MMK).

/** 1500 -> "1,500" */
export function formatMMK(amount: number): string {
  return Math.round(amount).toLocaleString("en-US");
}

/** 1500 -> "1,500 MMK" */
export function formatMMKUnit(amount: number): string {
  return `${formatMMK(amount)} MMK`;
}

/** 1240000 -> "1.24M" (report KPI cards) */
export function formatCompactMMK(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}K`;
  return formatMMK(amount);
}

/** Minutes -> "2h 15m" / "45m". */
export function formatDuration(minutes: number): string {
  // Round FIRST, then split. Rounding the remainder on its own turns 59.7 into
  // "60m" instead of "1h" - unreachable while every caller passed whole
  // minutes, reachable the moment the timeline started passing live fractions.
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** ISO -> "8:30 PM" */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** ISO -> "16 Aug, 8:30 PM" */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
