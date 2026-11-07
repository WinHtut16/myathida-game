import { describe, expect, it } from "vitest";
import { mapPointRule, maskPhone, pointsFor } from "./points";

const rule = { blockMinutes: 60, pointsPerBlock: 10, isActive: true };

describe("pointsFor - same boundaries as db-tests/104 and 105", () => {
  it.each([
    [0, 0],
    [59, 0],
    [60, 10],
    [90, 10],
    [119, 10],
    [120, 20],
    [180, 30],
  ])("%i paid minutes earns %i", (minutes, points) => {
    expect(pointsFor(minutes, rule)).toBe(points);
  });

  it("earns nothing while the rule is off", () => {
    expect(pointsFor(240, { ...rule, isActive: false })).toBe(0);
  });

  it("earns nothing without a rule", () => {
    expect(pointsFor(240, null)).toBe(0);
  });
});

describe("mapPointRule", () => {
  it("reads the stored shape", () => {
    expect(mapPointRule({ block_minutes: 60, points_per_block: 10, is_active: true })).toEqual(rule);
  });
  it("returns null for nothing", () => {
    expect(mapPointRule(null)).toBeNull();
  });
});

describe("maskPhone", () => {
  it("keeps the first two and last four digits", () => {
    expect(maskPhone("09777300011")).toBe("09•••••0011");
  });
});
