import { describe, expect, it } from "vitest";
import { formatDuration, readTimer } from "./item-timer";

const timer = (overrides = {}) => ({
  agenda_item_id: "a1", planned_minutes: 10, discussion_started_at: "2026-10-16T08:00:00Z", discussion_ended_at: null, revision: 1, ...overrides,
});
const at = (iso: string) => Date.parse(iso);

describe("readTimer", () => {
  it("shows nothing before the discussion starts", () => {
    expect(readTimer(timer({ discussion_started_at: null }), at("2026-10-16T08:05:00Z"))).toBeNull();
    expect(readTimer(undefined, at("2026-10-16T08:05:00Z"))).toBeNull();
  });

  it("counts a running discussion within its planned duration", () => {
    expect(readTimer(timer(), at("2026-10-16T08:07:32Z"))).toEqual({ elapsedSeconds: 452, running: true, plannedSeconds: 600, overSeconds: null });
  });

  it("reports the overrun beyond the planned duration", () => {
    expect(readTimer(timer(), at("2026-10-16T08:12:10Z"))?.overSeconds).toBe(130);
  });

  it("freezes on the final duration once the discussion ended", () => {
    const ended = timer({ discussion_ended_at: "2026-10-16T08:04:00Z" });
    expect(readTimer(ended, at("2026-10-16T09:00:00Z"))).toMatchObject({ elapsedSeconds: 240, running: false, overSeconds: null });
  });

  it("counts from the server's clock, whatever this device's clock says", () => {
    // This device is two minutes behind the server.
    expect(readTimer(timer(), at("2026-10-16T08:03:00Z"), 120_000)?.elapsedSeconds).toBe(300);
  });

  it("has no overrun without a planned duration", () => {
    expect(readTimer(timer({ planned_minutes: null }), at("2026-10-16T09:00:00Z"))).toMatchObject({ plannedSeconds: null, overSeconds: null });
  });
});

describe("formatDuration", () => {
  it("writes minutes and seconds, and hours when needed", () => {
    expect(formatDuration(452)).toBe("07:32");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(-5)).toBe("00:00");
  });
});
