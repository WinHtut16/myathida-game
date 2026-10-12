import { describe, expect, it } from "vitest";
import {
  computeLiveBill,
  computePlaytime,
  mapPricingRows,
  mapSoldPricing,
  previewCorrection,
  formatElapsed,
  previewLiveTotal,
  previewTotal,
} from "./pricing";
import type { OrderLine, Pricing, PricingTier, SoldPricing } from "./types";

/**
 * The billing rule exists twice: here, for the number on the staff member's
 * screen, and in game.bill_minutes(), for the number actually charged. Two
 * copies of one rule drift unless something pins them together.
 *
 * This is that pin. Every boundary below is asserted against the real database
 * in db-tests/97-game-live-sessions.sql with the same inputs and the same
 * expected minutes. Change one implementation and one of the two suites fails.
 *
 * Both doors onto the sessions table - a timer closed off and a duration typed
 * in afterwards - go through that one SQL function, so "the two doors agree" is
 * itself a property worth asserting rather than assuming. See the
 * computePlaytime block below.
 */

// PS5 as seeded: 10-minute blocks, 5-minute grace, 30-minute floor — the same
// numbers billiards is actually running in production. A single 60-minute
// tier is the degenerate case: one configured point plus the implicit
// (0,0) origin is a 2-point line, which must reduce to exactly the old
// `ratePerHour * minutes / 60` formula. That equivalence is what pins every
// test below unchanged after the move to tiers.
const ps5: Pricing = {
  tier: "PS5",
  tiers: [{ durationMinutes: 60, rate: 5000 }],
  ratePerHour: 5000,
  minMinutes: 30,
  incrementMinutes: 10,
  graceMinutes: 5,
};

describe("computeLiveBill — the boundaries that cost money", () => {
  it("bills the tier minimum for a session that barely happened", () => {
    // Someone starts a TV and the customer changes their mind. The floor is
    // what stops this being free.
    expect(computeLiveBill(2, ps5).chargedMinutes).toBe(30);
    expect(computeLiveBill(0, ps5).chargedMinutes).toBe(30);
  });

  it("bills 30 at exactly 30", () => {
    expect(computeLiveBill(30, ps5).chargedMinutes).toBe(30);
  });

  it("holds at 30 through the grace period", () => {
    // 34 = 30 + grace(5) − 1. Rolling to 40 here would be the bug a customer
    // notices: five extra minutes costing a whole block.
    expect(computeLiveBill(34, ps5).chargedMinutes).toBe(30);
    expect(computeLiveBill(35, ps5).chargedMinutes).toBe(30);
  });

  it("rolls to the next block once the grace is spent", () => {
    expect(computeLiveBill(36, ps5).chargedMinutes).toBe(40);
  });

  it("applies grace at every block boundary, not just the first", () => {
    expect(computeLiveBill(62, ps5).chargedMinutes).toBe(60);
    expect(computeLiveBill(66, ps5).chargedMinutes).toBe(70);
  });

  it("charges the snapshot rate, not a live one", () => {
    expect(computeLiveBill(60, ps5).playtimeTotal).toBe(5000);
    expect(computeLiveBill(90, ps5).playtimeTotal).toBe(7500);
  });
});

describe("computeLiveBill — the waiver", () => {
  it("takes exactly one block off", () => {
    const bill = computeLiveBill(66, ps5, 1);
    expect(bill.chargedMinutes).toBe(60);
    expect(bill.waivedMinutes).toBe(10);
  });

  it("never waives more than one block, however many are asked for", () => {
    expect(computeLiveBill(120, ps5, 5).chargedMinutes).toBe(110);
  });

  it("cannot push a bill below the tier minimum", () => {
    // Without the floor, a waiver on a short session bills nothing at all —
    // which is indistinguishable from a staff member pocketing the money.
    const bill = computeLiveBill(30, ps5, 1);
    expect(bill.chargedMinutes).toBe(30);
    expect(bill.waivedMinutes).toBe(0);
  });

  it("ignores a negative waiver", () => {
    expect(computeLiveBill(66, ps5, -3).chargedMinutes).toBe(70);
  });
});

describe("the pricing curve — piecewise-linear through admin-set tiers", () => {
  // incrementMinutes: 1, graceMinutes: 0, minMinutes: 0 makes billMinutes()
  // a no-op (chargedMinutes === minutes passed in), isolating the curve math
  // under test from the unrelated blocking/grace rounding tested above.
  const raw = (tiers: PricingTier[]): Pricing => ({
    tier: "PS5",
    tiers,
    ratePerHour: 0,
    minMinutes: 0,
    incrementMinutes: 1,
    graceMinutes: 0,
  });
  const multi = raw([
    { durationMinutes: 30, rate: 2500 },
    { durationMinutes: 60, rate: 5000 },
    { durationMinutes: 90, rate: 6500 },
  ]);

  it("prices exactly at a configured point", () => {
    expect(computeLiveBill(90, multi).playtimeTotal).toBe(6500);
  });

  it("interpolates strictly between two configured points", () => {
    // 47 sits between the 30 (2500) and 60 (5000) points on the straight
    // line joining them — not snapped to either endpoint.
    expect(computeLiveBill(47, multi).playtimeTotal).toBe(3917);
  });

  it("extrapolates beyond the highest point off the LAST segment's slope", () => {
    // 120 is past the 90-minute point. The last configured segment is
    // 60->90 (slope 50/min), so 8000 is expected. A flat continuation of
    // 90's own blended average (6500/90 ~= 72.2/min) would instead give
    // ~8667 — asserting the specific number catches that regression.
    expect(computeLiveBill(120, multi).playtimeTotal).toBe(8000);
  });

  it("interpolates below the lowest point against the implicit (0,0) origin", () => {
    expect(computeLiveBill(10, multi).playtimeTotal).toBe(833);
  });

  it("prices everything at 0 with no tiers configured", () => {
    const unconfigured = raw([]);
    expect(computeLiveBill(60, unconfigured).playtimeTotal).toBe(0);
    expect(computeLiveBill(120, unconfigured).playtimeTotal).toBe(0);
  });

  it("matches the legacy single-rate formula with exactly one tier", () => {
    // The equivalence the whole design leans on: one point + the origin is
    // a 2-point line, which is just ratePerHour * chargedMinutes / 60 —
    // checked independently of the new implementation, for the SAME
    // chargedMinutes billMinutes (unchanged) already produced.
    const bill = computeLiveBill(47, ps5);
    expect(bill.playtimeTotal).toBe(Math.round((5000 * bill.chargedMinutes) / 60));
  });
});

describe("computePlaytime — the retroactive door prices identically", () => {
  // The reason this change exists. record_session used to bill per typed minute
  // floored at the minimum, so 62 minutes cost 62 min typed in and 60 min on a
  // timer, while 36 cost 36 typed in and 40 on a timer. Same hour, two prices,
  // and not even consistently cheaper - it flipped with where in the block you
  // landed, so no price could be quoted in advance.
  const durations = [1, 2, 29, 30, 31, 34, 35, 36, 40, 41, 59, 60, 61, 62, 65, 66, 70, 119, 120, 121];

  it("charges exactly what the timer would charge, at every boundary", () => {
    for (const m of durations) {
      const typed = computePlaytime(m, ps5);
      const timed = computeLiveBill(m, ps5);
      expect(typed.chargedMinutes, `${m} min`).toBe(timed.chargedMinutes);
      expect(typed.total, `${m} min`).toBe(timed.playtimeTotal);
    }
  });

  it("bills the same table of boundaries the database asserts", () => {
    expect(computePlaytime(2, ps5).chargedMinutes).toBe(30);
    expect(computePlaytime(30, ps5).chargedMinutes).toBe(30);
    expect(computePlaytime(34, ps5).chargedMinutes).toBe(30);
    expect(computePlaytime(36, ps5).chargedMinutes).toBe(40);
    expect(computePlaytime(62, ps5).chargedMinutes).toBe(60);
    expect(computePlaytime(66, ps5).chargedMinutes).toBe(70);
  });

  it("no longer charges per typed minute", () => {
    // The specific regression. If this ever passes at 62 again, the two doors
    // have come apart.
    expect(computePlaytime(62, ps5).chargedMinutes).not.toBe(62);
    expect(computePlaytime(36, ps5).chargedMinutes).not.toBe(36);
  });

  it("never prices a longer session below a shorter one", () => {
    // Monotonicity. A customer who stays longer cannot pay less, which is the
    // one property a rounding rule can quietly break.
    let previous = 0;
    for (const m of durations) {
      const charge = computePlaytime(m, ps5).total;
      expect(charge, `${m} min`).toBeGreaterThanOrEqual(previous);
      previous = charge;
    }
  });
});

describe("previewTotal — the retroactive modal", () => {
  const lines: OrderLine[] = [
    { productId: "p1", productName: "Crisps", qty: 3, unitPrice: 1000, lineTotal: 3000 },
  ];

  it("adds snacks to the block-rounded playtime", () => {
    const p = previewTotal(62, ps5, lines);
    expect(p.chargedMinutes).toBe(60);
    expect(p.playtimeTotal).toBe(5000);
    expect(p.snacksTotal).toBe(3000);
    expect(p.total).toBe(8000);
  });

  it("matches the live preview for the same duration and the same snacks", () => {
    const started = "2026-09-16T10:00:00.000Z";
    const at62 = new Date(started).getTime() + 62 * 60_000;
    const typed = previewTotal(62, ps5, lines);
    const timed = previewLiveTotal(started, ps5, lines, at62);
    expect(typed.total).toBe(timed.total);
  });
});

describe("previewLiveTotal", () => {
  const started = "2026-09-16T10:00:00.000Z";
  const at = (minutes: number) => new Date(started).getTime() + minutes * 60_000;
  const lines: OrderLine[] = [
    { productId: "p1", productName: "Crisps", qty: 3, unitPrice: 1000, lineTotal: 3000 },
  ];

  it("adds snacks to the playtime rather than replacing it", () => {
    const p = previewLiveTotal(started, ps5, lines, at(60));
    expect(p.playtimeTotal).toBe(5000);
    expect(p.snacksTotal).toBe(3000);
    expect(p.total).toBe(8000);
  });

  it("bills nothing extra for snacks on a session with no time yet", () => {
    const p = previewLiveTotal(started, ps5, lines, at(0));
    expect(p.chargedMinutes).toBe(30);
    expect(p.total).toBe(2500 + 3000);
  });

  it("treats a clock that has gone backwards as zero elapsed", () => {
    // A device with a wrong clock must not produce a negative bill.
    const p = previewLiveTotal(started, ps5, [], at(-90));
    expect(p.elapsed).toBe(0);
    expect(p.chargedMinutes).toBe(30);
  });
});

describe("mapPricingRows — assembles Pricing[] from the two parallel selects", () => {
  const pricingRows = [
    { tier: "PS4" as const, rate_per_hour: 3000, min_minutes: 30, increment_minutes: 10, grace_minutes: 5 },
    { tier: "PS5" as const, rate_per_hour: 5000, min_minutes: 30, increment_minutes: 10, grace_minutes: 5 },
  ];

  it("attaches each tier's own rows, sorted by duration, to the matching pricing row", () => {
    const tierRows = [
      { tier: "PS5" as const, duration_minutes: 60, rate: 5000 },
      { tier: "PS4" as const, duration_minutes: 60, rate: 3000 },
      { tier: "PS5" as const, duration_minutes: 30, rate: 2500 },
    ];
    const result = mapPricingRows(pricingRows, tierRows);
    const ps5 = result.find((p) => p.tier === "PS5")!;
    expect(ps5.tiers).toEqual([
      { durationMinutes: 30, rate: 2500 },
      { durationMinutes: 60, rate: 5000 },
    ]);
    const ps4 = result.find((p) => p.tier === "PS4")!;
    expect(ps4.tiers).toEqual([{ durationMinutes: 60, rate: 3000 }]);
  });

  it("derives ratePerHour from the 60-minute tier, not the raw column", () => {
    // Simulates the mirror trigger not having caught up yet — the tiers
    // list is the source of truth, the column is the fallback.
    const tierRows = [{ tier: "PS5" as const, duration_minutes: 60, rate: 7000 }];
    const result = mapPricingRows(pricingRows, tierRows);
    expect(result.find((p) => p.tier === "PS5")!.ratePerHour).toBe(7000);
  });

  it("falls back to the raw column when no 60-minute tier is configured", () => {
    const tierRows = [{ tier: "PS5" as const, duration_minutes: 30, rate: 2500 }];
    const result = mapPricingRows(pricingRows, tierRows);
    expect(result.find((p) => p.tier === "PS5")!.ratePerHour).toBe(5000);
  });
});

describe("mapSoldPricing — snake_case jsonb snapshot to camelCase", () => {
  it("converts a full snapshot", () => {
    const snapshot = mapSoldPricing({
      points: [
        { duration_minutes: 0, rate: 0 },
        { duration_minutes: 60, rate: 3000 },
      ],
      min_minutes: 30,
      increment_minutes: 10,
      grace_minutes: 5,
    });
    expect(snapshot).toEqual({
      points: [
        { durationMinutes: 0, rate: 0 },
        { durationMinutes: 60, rate: 3000 },
      ],
      minMinutes: 30,
      incrementMinutes: 10,
      graceMinutes: 5,
    });
  });

  it("returns null for a row with no snapshot yet", () => {
    expect(mapSoldPricing(null)).toBeNull();
  });
});

describe("formatElapsed", () => {
  it("shows mm:ss under an hour", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(9.5)).toBe("09:30");
    expect(formatElapsed(59.99)).toBe("59:59");
  });

  it("adds hours only once there is an hour", () => {
    expect(formatElapsed(60)).toBe("1:00:00");
    expect(formatElapsed(125.5)).toBe("2:05:30");
  });
});

describe("correction preview — replays the session's own snapshot, not live pricing", () => {
  // The session carries its own frozen curve + blocking rule (SoldPricing).
  // previewCorrection no longer accepts a live Pricing at all, so it is
  // structurally impossible for it to use today's prices instead of what
  // was actually sold — a stronger guarantee than a behavioral check, but
  // the numbers below still pin the actual math.
  const soldAt3000: SoldPricing = {
    points: [
      { durationMinutes: 0, rate: 0 },
      { durationMinutes: 60, rate: 3000 },
    ],
    minMinutes: 30,
    incrementMinutes: 10,
    graceMinutes: 5,
  };

  it("prices a corrected session at the rate it was sold at", () => {
    const preview = previewCorrection(62, soldAt3000, 0);

    expect(preview.chargedMinutes).toBe(60); // blocks come from the snapshot
    expect(preview.total).toBe(3000); // rate comes from the snapshot

    // What the owner would be shown if the price had tripled since sale -
    // previewCorrection never sees this, which is the whole point.
    const tierToday: Pricing = { ...ps5, tiers: [{ durationMinutes: 60, rate: 9000 }] };
    expect(computePlaytime(62, tierToday).total).toBe(9000);
  });

  it("adds the snacks that were already on the session", () => {
    expect(previewCorrection(62, soldAt3000, 1500).total).toBe(4500);
  });

  it("prices at 0 rather than throwing when the snapshot has no points", () => {
    // Real shape: floor.ts/live-session.ts build exactly this zeroed fallback
    // for an ActiveSession whose sold_pricing column is null (pre-backfill or
    // any insert path other than open_session/record_session).
    const empty: SoldPricing = { points: [], minMinutes: 0, incrementMinutes: 10, graceMinutes: 0 };
    expect(previewCorrection(60, empty, 0).total).toBe(0);
  });

  it("rounds a corrected duration by the same block rule as the timer", () => {
    for (const m of [2, 30, 34, 36, 62, 66]) {
      expect(previewCorrection(m, soldAt3000, 0).chargedMinutes).toBe(
        computeLiveBill(m, ps5).chargedMinutes,
      );
    }
  });
});
