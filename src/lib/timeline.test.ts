import { describe, expect, it } from "vitest";
import { buildTimeline, type TimelineSessionInput, type TimelineStationInput } from "./timeline";

/**
 * buildTimeline is pure layout math over already-fetched rows — the Supabase
 * read (day windowing, excluding voided sessions) lives in
 * src/lib/data/reports.ts and is not re-tested here. What matters at this
 * layer: span placement (live/estimated/closed), Yangon (+06:30) hour
 * rounding for the axis, and merging overlapping spans for playedMinutes.
 */

const STATIONS: TimelineStationInput[] = [
  { id: "tv1", name: "TV 1", tier: "PS4", sortOrder: 1 },
  { id: "tv2", name: "TV 2", tier: "PS5", sortOrder: 2 },
];

function session(overrides: Partial<TimelineSessionInput> & { id: string; stationId: string }): TimelineSessionInput {
  return {
    stationName: "TV 1",
    tier: "PS4",
    minutes: 0,
    total: 0,
    label: null,
    status: "closed",
    startedAt: null,
    endedAt: null,
    createdAt: "2024-05-01T10:00:00.000Z",
    ...overrides,
  };
}

const DAY = "2024-05-01";
// Yangon midnight for 2024-05-01 = 2024-04-30T17:30:00.000Z (UTC -06:30).
const DAY_START_MS = Date.parse("2024-04-30T17:30:00.000Z");

describe("buildTimeline", () => {
  it("places a closed session with real start/end as a non-live, non-estimated span", () => {
    const data = buildTimeline({
      day: DAY,
      dayStartMs: DAY_START_MS,
      nowMs: Date.parse("2024-05-01T12:00:00.000Z"),
      isToday: false,
      stations: STATIONS,
      sessions: [
        session({
          id: "s1",
          stationId: "tv1",
          status: "closed",
          startedAt: "2024-05-01T08:00:00.000Z",
          endedAt: "2024-05-01T10:00:00.000Z",
        }),
      ],
    });

    const row = data.rows.find((r) => r.stationId === "tv1")!;
    expect(row.spans).toHaveLength(1);
    const span = row.spans[0];
    expect(span.live).toBe(false);
    expect(span.estimated).toBe(false);
    expect(span.minutes).toBe(120);
    expect(row.playedMinutes).toBe(120);
  });

  it("runs an active session's span to now", () => {
    const now = Date.parse("2024-05-01T09:00:00.000Z");
    const data = buildTimeline({
      day: DAY,
      dayStartMs: DAY_START_MS,
      nowMs: now,
      isToday: true,
      stations: STATIONS,
      sessions: [
        session({
          id: "s2",
          stationId: "tv1",
          status: "active",
          startedAt: "2024-05-01T08:00:00.000Z",
          endedAt: null,
        }),
      ],
    });

    const span = data.rows.find((r) => r.stationId === "tv1")!.spans[0];
    expect(span.live).toBe(true);
    expect(span.end).toBe(now);
    expect(span.minutes).toBe(60);
  });

  it("back-computes an estimated span from created_at minus minutes when there is no started_at", () => {
    const data = buildTimeline({
      day: DAY,
      dayStartMs: DAY_START_MS,
      nowMs: Date.parse("2024-05-01T12:00:00.000Z"),
      isToday: false,
      stations: STATIONS,
      sessions: [
        session({
          id: "s3",
          stationId: "tv2",
          minutes: 45,
          createdAt: "2024-05-01T10:00:00.000Z",
        }),
      ],
    });

    const span = data.rows.find((r) => r.stationId === "tv2")!.spans[0];
    expect(span.estimated).toBe(true);
    expect(span.end).toBe(Date.parse("2024-05-01T10:00:00.000Z"));
    expect(span.start).toBe(Date.parse("2024-05-01T09:15:00.000Z"));
  });

  it("floors/ceils the axis to Yangon hour boundaries", () => {
    const data = buildTimeline({
      day: DAY,
      dayStartMs: DAY_START_MS,
      nowMs: Date.parse("2024-05-01T14:00:00.000Z"),
      isToday: false,
      stations: STATIONS,
      sessions: [
        // Yangon 2:30 PM -> 7:30 PM (started_at/ended_at are UTC 08:00/13:00).
        // Kept over 4h so the minimum-axis-span rule doesn't mask the rounding.
        session({
          id: "s4",
          stationId: "tv1",
          startedAt: "2024-05-01T08:00:00.000Z",
          endedAt: "2024-05-01T13:00:00.000Z",
        }),
      ],
    });

    // Floors to Yangon 2:00 PM, ceils to Yangon 8:00 PM.
    expect(data.axisStart).toBe(Date.parse("2024-05-01T07:30:00.000Z"));
    expect(data.axisEnd).toBe(Date.parse("2024-05-01T13:30:00.000Z"));
  });

  it("lets a live span cross midnight rather than clamping to the day", () => {
    const now = Date.parse("2024-05-02T00:30:00.000Z"); // Yangon 2024-05-02 07:00 AM
    const data = buildTimeline({
      day: DAY,
      dayStartMs: DAY_START_MS,
      nowMs: now,
      isToday: true,
      stations: STATIONS,
      sessions: [
        // Started Yangon 2024-05-01 11:30 PM, still running.
        session({
          id: "s5",
          stationId: "tv1",
          status: "active",
          startedAt: "2024-05-01T17:00:00.000Z",
          endedAt: null,
        }),
      ],
    });

    const span = data.rows.find((r) => r.stationId === "tv1")!.spans[0];
    expect(span.end).toBe(now);
    expect(data.axisEnd).toBeGreaterThanOrEqual(now);
  });

  it("still produces a row for a station with no sessions that day", () => {
    const data = buildTimeline({
      day: DAY,
      dayStartMs: DAY_START_MS,
      nowMs: Date.parse("2024-05-01T12:00:00.000Z"),
      isToday: false,
      stations: STATIONS,
      sessions: [
        session({
          id: "s6",
          stationId: "tv1",
          startedAt: "2024-05-01T08:00:00.000Z",
          endedAt: "2024-05-01T09:00:00.000Z",
        }),
      ],
    });

    const idleRow = data.rows.find((r) => r.stationId === "tv2")!;
    expect(idleRow.spans).toHaveLength(0);
    expect(idleRow.playedMinutes).toBe(0);
  });

  it("merges overlapping spans on the same station when summing played minutes", () => {
    const data = buildTimeline({
      day: DAY,
      dayStartMs: DAY_START_MS,
      nowMs: Date.parse("2024-05-01T12:00:00.000Z"),
      isToday: false,
      stations: STATIONS,
      sessions: [
        // Yangon 10:00-11:00 and 10:30-11:30 -> 90 minutes merged, not 120.
        session({
          id: "s7a",
          stationId: "tv1",
          startedAt: "2024-05-01T03:30:00.000Z",
          endedAt: "2024-05-01T04:30:00.000Z",
        }),
        session({
          id: "s7b",
          stationId: "tv1",
          startedAt: "2024-05-01T04:00:00.000Z",
          endedAt: "2024-05-01T05:00:00.000Z",
        }),
      ],
    });

    const row = data.rows.find((r) => r.stationId === "tv1")!;
    expect(row.spans).toHaveLength(2);
    expect(row.playedMinutes).toBe(90);
  });

  it("groups sessions on an unknown/deleted station by name after the floor", () => {
    const data = buildTimeline({
      day: DAY,
      dayStartMs: DAY_START_MS,
      nowMs: Date.parse("2024-05-01T12:00:00.000Z"),
      isToday: false,
      stations: STATIONS,
      sessions: [
        session({
          id: "s8",
          stationId: "gone",
          stationName: "Old TV",
          startedAt: "2024-05-01T08:00:00.000Z",
          endedAt: "2024-05-01T09:00:00.000Z",
        }),
      ],
    });

    expect(data.rows).toHaveLength(3);
    const extra = data.rows[2];
    expect(extra.stationName).toBe("Old TV");
    expect(extra.spans).toHaveLength(1);
  });
  it("clips an estimated span that reaches back into the previous day", () => {
    // Two hours typed in at Yangon 00:30 - the play really happened last night.
    // The bar must not drag the axis into yesterday, but the tooltip must still
    // say two hours, because that is what the customer was charged for.
    const data = buildTimeline({
      day: DAY,
      dayStartMs: DAY_START_MS,
      nowMs: Date.parse("2024-05-01T12:00:00.000Z"),
      isToday: false,
      stations: STATIONS,
      sessions: [
        session({
          id: "s9",
          stationId: "tv1",
          minutes: 120,
          createdAt: "2024-04-30T18:00:00.000Z", // Yangon 2024-05-01 00:30 AM
        }),
      ],
    });

    const row = data.rows.find((r) => r.stationId === "tv1")!;
    const span = row.spans[0];
    expect(span.clipped).toBe(true);
    expect(span.start).toBe(DAY_START_MS);          // drawn from the day's edge
    expect(span.minutes).toBe(120);                 // ...but honest about length
    expect(span.startLabel).toBe("10:30 PM");       // ...and about when it began
    expect(data.axisStart).toBeGreaterThanOrEqual(DAY_START_MS);
    // Occupancy is measured within the day: 00:00 to 00:30 Yangon.
    expect(row.playedMinutes).toBe(30);
  });

  it("drops an estimated span that ended before the day even opened", () => {
    const data = buildTimeline({
      day: DAY,
      dayStartMs: DAY_START_MS,
      nowMs: Date.parse("2024-05-01T12:00:00.000Z"),
      isToday: false,
      stations: STATIONS,
      sessions: [
        session({
          id: "s10",
          stationId: "tv1",
          minutes: 30,
          createdAt: "2024-04-30T17:00:00.000Z", // 30 min before the day starts
        }),
      ],
    });

    expect(data.rows.find((r) => r.stationId === "tv1")!.spans).toHaveLength(0);
  });

  it("does not guarantee a tick on axisEnd — which is why labels must be positioned by percentage", () => {
    // Yangon 10:00 AM to 7:00 PM: a 9-hour axis, and tickStepHours gives 2h for
    // anything from 9 to 16 hours. Five ticks cover only 8 of the 9 hours, so
    // laying the labels out with even flex distribution puts the last one 11%
    // right of its own gridline. StationTimeline positions them with the same
    // pct() the gridlines use; this test pins the input that made that
    // necessary, so nobody "simplifies" it back.
    const data = buildTimeline({
      day: DAY,
      dayStartMs: DAY_START_MS,
      nowMs: Date.parse("2024-05-01T20:00:00.000Z"),
      isToday: false,
      stations: STATIONS,
      sessions: [
        session({
          id: "s11",
          stationId: "tv1",
          startedAt: "2024-05-01T03:30:00.000Z",
          endedAt: "2024-05-01T12:30:00.000Z",
        }),
      ],
    });

    expect((data.axisEnd - data.axisStart) / 3_600_000).toBe(9);
    expect(data.ticks).toHaveLength(5);
    expect(data.ticks[data.ticks.length - 1].at).toBeLessThan(data.axisEnd);
    // Evenly spaced, so a single percentage function places every one of them.
    const gaps = data.ticks.slice(1).map((tk, i) => tk.at - data.ticks[i].at);
    expect(new Set(gaps).size).toBe(1);
  });
});
