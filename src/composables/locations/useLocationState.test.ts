import { describe, it, expect } from "vitest";
import { buildLocationStateIndex } from "./useLocationState";
import type { LocationState } from "@/types/locationState.types";

function row(overrides: Partial<LocationState> = {}): LocationState {
  return {
    location_id: "room-a",
    fact: "cleared",
    value: true,
    asserted_by: "dm-1",
    asserted_note: null,
    asserted_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildLocationStateIndex", () => {
  it("returns an empty index for no rows", () => {
    expect(buildLocationStateIndex([]).size).toBe(0);
  });

  it("indexes a row under its location and fact", () => {
    const index = buildLocationStateIndex([row()]);
    expect(index.get("room-a")?.cleared?.value).toBe(true);
  });

  // The core distinction the whole feature exists to preserve: a fact nobody
  // has ever asserted must read as "unknown", never as a synthesized `false`.
  it("leaves an unasserted fact absent rather than defaulting it to false", () => {
    const index = buildLocationStateIndex([row({ fact: "cleared", value: true })]);
    const forRoom = index.get("room-a");
    expect(forRoom?.cleared).toBeDefined();
    expect(forRoom?.looted).toBeUndefined();
    expect(forRoom?.explored).toBeUndefined();
  });

  it("distinguishes an explicit false assertion from an absent one", () => {
    const index = buildLocationStateIndex([
      row({ location_id: "room-a", fact: "cleared", value: false }),
    ]);
    const cleared = index.get("room-a")?.cleared;
    expect(cleared).toBeDefined();
    expect(cleared?.value).toBe(false);
  });

  it("keeps each location's facts independent of one another", () => {
    const index = buildLocationStateIndex([
      row({ location_id: "room-a", fact: "cleared", value: true }),
      row({ location_id: "room-a", fact: "looted", value: false }),
      row({ location_id: "room-b", fact: "cleared", value: false }),
    ]);
    expect(index.get("room-a")?.cleared?.value).toBe(true);
    expect(index.get("room-a")?.looted?.value).toBe(false);
    expect(index.get("room-a")?.explored).toBeUndefined();
    expect(index.get("room-b")?.cleared?.value).toBe(false);
    expect(index.get("room-b")?.looted).toBeUndefined();
  });

  // `location_state` is already `distinct on (location_id, fact)` newest-first,
  // so this collision should never occur from a real query result — but the
  // function must not be at the mercy of array order if it ever does.
  it("keeps the newest row when two rows collide on the same (location, fact)", () => {
    const older = row({ value: true, asserted_at: "2026-09-01T00:00:00Z", asserted_note: "first pass" });
    const newer = row({ value: false, asserted_at: "2026-09-03T00:00:00Z", asserted_note: "actually, no" });

    const oldThenNew = buildLocationStateIndex([older, newer]);
    expect(oldThenNew.get("room-a")?.cleared?.value).toBe(false);
    expect(oldThenNew.get("room-a")?.cleared?.asserted_note).toBe("actually, no");

    const newThenOld = buildLocationStateIndex([newer, older]);
    expect(newThenOld.get("room-a")?.cleared?.value).toBe(false);
    expect(newThenOld.get("room-a")?.cleared?.asserted_note).toBe("actually, no");
  });
});
