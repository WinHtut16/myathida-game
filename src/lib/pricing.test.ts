import { describe, expect, it } from "vitest";
import {
  computeLiveBill,
  computePlaytime,
  previewCorrection,
  formatElapsed,
  previewLiveTotal,
  previewTotal,
} from "./pricing";
import type { OrderLine, Pricing } from "./types";

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
// numbers billiards is actually running in production.
const ps5: Pricing = {
  tier: "PS5",
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

describe("correction preview — the rate comes from the session, not the tier", () => {
  // ReceiptModal builds its preview as computePlaytime(minutes, {...tier,
  // ratePerHour: session.ratePerHour}), mirroring game.correct_session, which
  // reads pr.min/increment/grace but s.rate_per_hour. The override is the whole
  // point and it is invisible in a diff, so pin it: a price rise since the
  // customer paid must not move the bill they already agreed to.
  it("prices a corrected session at the rate it was sold at", () => {
    const soldAt = 3000;
    const tierToday: Pricing = { ...ps5, ratePerHour: 9000 }; // price tripled since
    const preview = previewCorrection(62, tierToday, soldAt, 0);

    expect(preview.chargedMinutes).toBe(60);   // blocks come from the tier
    expect(preview.total).toBe(3000);          // rate comes from the session

    // What the owner would be shown if anyone "simplified" the override away.
    expect(computePlaytime(62, tierToday).total).toBe(9000);
  });

  it("adds the snacks that were already on the session", () => {
    expect(previewCorrection(62, ps5, 3000, 1500).total).toBe(4500);
  });

  it("rounds a corrected duration by the same block rule as the timer", () => {
    for (const m of [2, 30, 34, 36, 62, 66]) {
      expect(previewCorrection(m, ps5, 3000, 0).chargedMinutes).toBe(
        computeLiveBill(m, ps5).chargedMinutes,
      );
    }
  });
});
