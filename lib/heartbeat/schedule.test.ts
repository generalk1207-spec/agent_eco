import { describe, expect, it } from "vitest";
import { computeNextRunAt, InvalidScheduleError, isValidSchedule } from "./schedule";

describe("computeNextRunAt", () => {
  // 2026-09-22T12:00:00Z = 08:00 New York (EDT), 21:00 Tokyo, 13:00 London (BST).
  const from = new Date("2026-09-22T12:00:00Z");

  it.each([
    ["America/New_York", "2026-09-22T13:00:00.000Z"], // 09:00 EDT later today
    ["Asia/Tokyo", "2026-09-23T00:00:00.000Z"], // 09:00 JST tomorrow
    ["Europe/London", "2026-09-23T08:00:00.000Z"], // 09:00 BST tomorrow
    ["UTC", "2026-09-23T09:00:00.000Z"],
  ])("evaluates '0 9 * * *' in %s", (tz, expected) => {
    expect(computeNextRunAt("0 9 * * *", tz, from).toISOString()).toBe(expected);
  });

  it("follows DST: 09:00 New York is 13:00Z in summer and 14:00Z after the switch", () => {
    expect(computeNextRunAt("0 9 * * *", "America/New_York", new Date("2026-10-31T15:00:00Z")).toISOString())
      .toBe("2026-11-01T14:00:00.000Z");
    expect(computeNextRunAt("0 9 * * *", "America/New_York", new Date("2026-10-30T15:00:00Z")).toISOString())
      .toBe("2026-10-31T13:00:00.000Z");
  });

  it("handles half-hour offsets", () => {
    expect(computeNextRunAt("0 9 * * *", "Asia/Kolkata", from).toISOString()).toBe("2026-09-23T03:30:00.000Z");
  });

  it("is strictly after `from`", () => {
    const at = new Date("2026-09-22T13:00:00Z");
    expect(computeNextRunAt("0 9 * * *", "America/New_York", at).toISOString()).toBe("2026-09-23T13:00:00.000Z");
  });

  it("rejects bad expressions and timezones", () => {
    expect(() => computeNextRunAt("not a cron", "UTC", from)).toThrow(InvalidScheduleError);
    expect(isValidSchedule("0 9 * * *", "Mars/Olympus_Mons")).toBe(false);
    expect(isValidSchedule("*/15 * * * *", "Europe/Berlin")).toBe(true);
  });
});
