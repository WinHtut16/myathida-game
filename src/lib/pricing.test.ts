import { describe, expect, it } from "vitest";
import { computeLiveBill, formatElapsed, previewLiveTotal } from "./pricing";
import type { OrderLine, Pricing } from "./types";

/**
 * The live billing rule exists twice: here, for the number on the staff
 * member's screen, and in game.close_session(), for the number actually
 * charged. Two copies of one rule drift unless something pins them together.
 *
 * This is that pin. Every boundary below is asserted against the real database
 * in db-tests/97-game-live-sessions.sql with the same inputs and the same
 * expected minutes. Change one implementation and one of the two suites fails.
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
