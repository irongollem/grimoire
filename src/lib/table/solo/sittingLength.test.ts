import { describe, expect, it } from "vitest";
import { SITTING_ENDS_AFTER_IDLE_MS as SERVER_IDLE_MS } from "../../../../supabase/functions/_shared/agent/sittingEnd";
import { endedByPause, offersNewSitting, SITTING_ENDS_AFTER_IDLE_MS } from "./sittingLength";

const HOUR = 60 * 60 * 1000;
const T0 = Date.parse("2026-11-18T12:00:00Z");

describe("endedByPause", () => {
  // Bug caught: the page and the server disagreeing on the pause, so the page lets a turn be typed that the
  // server then refuses, or ends a sitting the server would still play.
  it("uses the server's own pause", () => {
    expect(SITTING_ENDS_AFTER_IDLE_MS).toBe(SERVER_IDLE_MS);
  });

  // Bug caught: a table closed over dinner (the comparison too eager), or never closed (a null read as "long ago").
  it("ends a sitting at six hours idle, not before, and never one whose last move is unknown", () => {
    expect(endedByPause(T0, T0 + 6 * HOUR)).toBe(true);
    expect(endedByPause(T0, T0 + 6 * HOUR - 1)).toBe(false);
    expect(endedByPause(null, T0 + 100 * HOUR)).toBe(false);
  });
});

describe("offersNewSitting", () => {
  const at = (hours: number, turns: number, notNow: { atMs: number; turns: number } | null = null) =>
    offersNewSitting({ startedMs: T0, turns, nowMs: T0 + hours * HOUR, notNow });

  // Bug caught: the offer made on a short sitting, or never made on a long one that is all talk (few hours, many
  // turns) or all thought (few turns, many hours).
  it("offers a new sitting after four hours or eighty turns, whichever comes first", () => {
    expect(at(3.9, 79)).toBe(false);
    expect(at(4, 10)).toBe(true);
    expect(at(1, 80)).toBe(true);
  });

  // Bug caught: "not now" asked again on the very next turn (the offer nags), or never again (one click silences
  // it for a sitting that then runs for days).
  it("leaves the player alone after not now, until two more hours or forty more turns", () => {
    const notNow = { atMs: T0 + 4 * HOUR, turns: 30 };
    expect(at(4.1, 31, notNow)).toBe(false);
    expect(at(5.9, 69, notNow)).toBe(false);
    expect(at(6, 31, notNow)).toBe(true);
    expect(at(4.1, 70, notNow)).toBe(true);
  });

  // Bug caught: a sitting whose start could not be read offering a new one at once, or throwing.
  it("goes by the turns alone when the start is unknown", () => {
    expect(offersNewSitting({ startedMs: null, turns: 5, nowMs: T0, notNow: null })).toBe(false);
    expect(offersNewSitting({ startedMs: null, turns: 80, nowMs: T0, notNow: null })).toBe(true);
  });
});
