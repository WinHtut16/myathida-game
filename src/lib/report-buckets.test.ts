import { describe, expect, it } from "vitest";
import { bucketByDay, bucketByHour } from "./report-buckets";
import type { Session } from "@/lib/types";

/**
 * bucketByDay / bucketByHour are pure aggregation over already-fetched rows —
 * the Supabase read, the row cap and the window split (current vs. previous)
 * live in src/lib/data/reports.ts and are not re-tested here.
 *
 * What matters at this layer: the "all" span covers the earliest sale (the
 * bug this was extracted to fix), gaps are zero-filled rather than skipped,
 * sums are correct, and the today/7d/30d spans are byte-identical to what
 * getReports computed inline before the extraction.
 */

function session(overrides: Partial<Session> & { createdAt: string; total: number }): Session {
  return {
    id: "s1",
    stationId: "tv1",
    stationName: "TV 1",
    tier: "PS4",
    ratePerHour: 3000,
    minutes: 60,
    chargedMinutes: 60,
    playtimeTotal: overrides.total,
    snacksTotal: 0,
    label: null,
    orders: [],
    status: "closed",
    startedAt: null,
    endedAt: null,
    paymentMethod: null,
    waivedMinutes: 0,
    createdBy: "staff-1",
    voidReason: null,
    voidedAt: null,
    ...overrides,
  };
}

// A fixed "now": 2026-03-10T12:00:00Z, which is 2026-03-10 in Yangon (+06:30,
// same calendar day since the offset doesn't cross midnight at noon UTC).
const NOW = Date.parse("2026-03-10T12:00:00.000Z");

describe("bucketByDay", () => {
  it("zero-fills a 7-day span that has no sales at all", () => {
    const buckets = bucketByDay([], 7, NOW);
    expect(buckets).toHaveLength(7);
    expect(buckets.every((b) => b.value === 0)).toBe(true);
    expect(buckets[buckets.length - 1].key).toBe("2026-03-10");
    expect(buckets[0].key).toBe("2026-03-04");
  });

  it("sums same-day sales into one bucket", () => {
    const rows = [
      session({ createdAt: "2026-03-10T02:00:00.000Z", total: 1000 }), // 2026-03-10 Yangon
      session({ createdAt: "2026-03-10T10:00:00.000Z", total: 500 }), // 2026-03-10 Yangon
    ];
    const buckets = bucketByDay(rows, 7, NOW);
    const today = buckets.find((b) => b.key === "2026-03-10");
    expect(today?.value).toBe(1500);
  });

  it("today/7d/30d spans are unchanged: exactly `days` buckets ending today, gaps zeroed", () => {
    const rows = [session({ createdAt: "2026-03-08T12:00:00.000Z", total: 700 })];
    const buckets = bucketByDay(rows, 30, NOW);
    expect(buckets).toHaveLength(30);
    expect(buckets[buckets.length - 1].key).toBe("2026-03-10");
    expect(buckets[0].key).toBe("2026-02-09");
    const mar8 = buckets.find((b) => b.key === "2026-03-08");
    expect(mar8?.value).toBe(700);
    // every other day is zero
    expect(buckets.filter((b) => b.value !== 0)).toHaveLength(1);
  });

  it('"all" (days=null) spans from the EARLIEST sale to today, not a distinct-day count', () => {
    // This is the bug: a sale 400 days ago, plus one distinct day of sales
    // near today. The old code sized the span by counting distinct selling
    // days (2 here) and walked back only 2 days from today, which drops the
    // 400-day-old sale off the front of the chart entirely.
    const rows = [
      session({ createdAt: "2025-02-01T05:00:00.000Z", total: 9000 }), // ~400 days before NOW
      session({ createdAt: "2026-03-10T05:00:00.000Z", total: 100 }),
    ];
    const buckets = bucketByDay(rows, null, NOW);
    const first = buckets.find((b) => b.key === "2025-02-01");
    expect(first).toBeDefined();
    expect(first?.value).toBe(9000);
    expect(buckets[0].key).toBe("2025-02-01");
    expect(buckets[buckets.length - 1].key).toBe("2026-03-10");
  });

  it('"all" with no sales at all falls back to a single (today) bucket', () => {
    const buckets = bucketByDay([], null, NOW);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].key).toBe("2026-03-10");
    expect(buckets[0].value).toBe(0);
  });

  it('"all" span is contiguous with no gaps between the earliest sale and today', () => {
    const rows = [
      session({ createdAt: "2026-03-01T05:00:00.000Z", total: 100 }),
      session({ createdAt: "2026-03-10T05:00:00.000Z", total: 200 }),
    ];
    const buckets = bucketByDay(rows, null, NOW);
    expect(buckets).toHaveLength(10); // Mar 1 .. Mar 10 inclusive
    const keys = buckets.map((b) => b.key);
    expect(keys).toEqual([
      "2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05",
      "2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10",
    ]);
  });
});

describe("bucketByHour", () => {
  it("falls back to the 10-23 default when there are no sessions", () => {
    const buckets = bucketByHour([]);
    expect(buckets).toHaveLength(14);
    expect(buckets[0].key).toBe("10");
    expect(buckets[buckets.length - 1].key).toBe("23");
    expect(buckets.every((b) => b.value === 0)).toBe(true);
  });

  it("spans only the shop's own opening hours, zero-filling gaps in between", () => {
    const rows = [
      session({ createdAt: "2026-03-10T05:30:00.000Z", total: 100 }), // 12:00 Yangon
      session({ createdAt: "2026-03-10T09:30:00.000Z", total: 200 }), // 16:00 Yangon
    ];
    const buckets = bucketByHour(rows);
    expect(buckets[0].key).toBe("12");
    expect(buckets[buckets.length - 1].key).toBe("16");
    expect(buckets).toHaveLength(5); // 12,13,14,15,16
    expect(buckets.find((b) => b.key === "12")?.value).toBe(100);
    expect(buckets.find((b) => b.key === "16")?.value).toBe(200);
    expect(buckets.find((b) => b.key === "13")?.value).toBe(0);
  });

  it("sums multiple sales within the same hour", () => {
    const rows = [
      session({ createdAt: "2026-03-10T05:10:00.000Z", total: 100 }), // 11:40 Yangon
      session({ createdAt: "2026-03-10T05:20:00.000Z", total: 50 }), // 11:50 Yangon
    ];
    const buckets = bucketByHour(rows);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].key).toBe("11");
    expect(buckets[0].value).toBe(150);
  });
});
