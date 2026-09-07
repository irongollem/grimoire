import { describe, expect, it } from "vitest";
import { deriveBeatRecordStates, describeBeatRecordState, type BeatRecordState } from "./backfill";
import type { QuestBeatTransition } from "@/types/quest.types";

type TransitionRow = Pick<QuestBeatTransition, "to_quest_id" | "to_beat_id" | "transition_kind" | "reason" | "created_at">;

function transition(overrides: Partial<TransitionRow> & { created_at: string }): TransitionRow {
  return {
    to_quest_id: "quest-1",
    to_beat_id: "a",
    transition_kind: "forward",
    reason: null,
    ...overrides,
  };
}

describe("deriveBeatRecordStates", () => {
  it("gives every beat id an entry, unplayed by default", () => {
    const states = deriveBeatRecordStates({
      questId: "quest-1",
      beatIds: ["a", "b"],
      transitions: [],
      currentBeatId: null,
    });
    expect(states.a).toEqual({ kind: "unplayed", at: null, note: null });
    expect(states.b).toEqual({ kind: "unplayed", at: null, note: null });
  });

  it("lets the newest transition to a beat win over an older one", () => {
    const states = deriveBeatRecordStates({
      questId: "quest-1",
      beatIds: ["a"],
      transitions: [
        transition({ to_beat_id: "a", transition_kind: "forward", created_at: "2026-01-01T00:00:00Z" }),
        transition({ to_beat_id: "a", transition_kind: "assert", reason: "Session 4", created_at: "2026-02-01T00:00:00Z" }),
      ],
      currentBeatId: null,
    });
    expect(states.a).toEqual({ kind: "recorded", at: "2026-02-01T00:00:00Z", note: "Session 4" });
  });

  it("is order-independent — the newest wins regardless of array order", () => {
    const states = deriveBeatRecordStates({
      questId: "quest-1",
      beatIds: ["a"],
      transitions: [
        transition({ to_beat_id: "a", transition_kind: "assert", reason: "Session 4", created_at: "2026-02-01T00:00:00Z" }),
        transition({ to_beat_id: "a", transition_kind: "forward", created_at: "2026-01-01T00:00:00Z" }),
      ],
      currentBeatId: null,
    });
    expect(states.a.kind).toBe("recorded");
  });

  it.each(["enter", "forward", "jump", "return", "improv"] as const)(
    "reads a %s transition as played",
    (kind) => {
      const states = deriveBeatRecordStates({
        questId: "quest-1",
        beatIds: ["a"],
        transitions: [transition({ to_beat_id: "a", transition_kind: kind, created_at: "2026-01-01T00:00:00Z" })],
        currentBeatId: null,
      });
      expect(states.a.kind).toBe("played");
    },
  );

  it("reads an assert transition as recorded, carrying its reason as the note", () => {
    const states = deriveBeatRecordStates({
      questId: "quest-1",
      beatIds: ["a"],
      transitions: [transition({ to_beat_id: "a", transition_kind: "assert", reason: "Session 11", created_at: "2026-01-01T00:00:00Z" })],
      currentBeatId: null,
    });
    expect(states.a).toEqual({ kind: "recorded", at: "2026-01-01T00:00:00Z", note: "Session 11" });
  });

  it("overrides a played beat with here when it is the cursor's current beat", () => {
    const states = deriveBeatRecordStates({
      questId: "quest-1",
      beatIds: ["a"],
      transitions: [transition({ to_beat_id: "a", transition_kind: "forward", created_at: "2026-01-01T00:00:00Z" })],
      currentBeatId: "a",
    });
    expect(states.a.kind).toBe("here");
  });

  it("marks the cursor's beat as here even with no transition history at all", () => {
    const states = deriveBeatRecordStates({
      questId: "quest-1",
      beatIds: ["a"],
      transitions: [],
      currentBeatId: "a",
    });
    expect(states.a).toEqual({ kind: "here", at: null, note: null });
  });

  it("ignores transitions belonging to another quest", () => {
    const states = deriveBeatRecordStates({
      questId: "quest-1",
      beatIds: ["a"],
      transitions: [transition({ to_quest_id: "quest-2", to_beat_id: "a", created_at: "2026-01-01T00:00:00Z" })],
      currentBeatId: null,
    });
    expect(states.a.kind).toBe("unplayed");
  });

  it("ignores transitions with a null to_beat_id (pause/resume/end)", () => {
    const states = deriveBeatRecordStates({
      questId: "quest-1",
      beatIds: ["a"],
      transitions: [transition({ to_beat_id: null, transition_kind: "pause", created_at: "2026-01-01T00:00:00Z" })],
      currentBeatId: null,
    });
    expect(states.a.kind).toBe("unplayed");
  });
});

describe("describeBeatRecordState", () => {
  const formatDate = (iso: string) => `fmt(${iso})`;

  it("labels here as 'the party is here' when the runtime is not running", () => {
    const state: BeatRecordState = { kind: "here", at: null, note: null };
    expect(describeBeatRecordState(state, "paused", formatDate)).toBe("The party is here");
    expect(describeBeatRecordState(state, null, formatDate)).toBe("The party is here");
  });

  it("labels here as 'playing now' when the runtime is running", () => {
    const state: BeatRecordState = { kind: "here", at: null, note: null };
    expect(describeBeatRecordState(state, "running", formatDate)).toBe("Playing now");
  });

  it("labels played with the formatted date", () => {
    const state: BeatRecordState = { kind: "played", at: "2026-01-01T00:00:00Z", note: null };
    expect(describeBeatRecordState(state, null, formatDate)).toBe("Played · fmt(2026-01-01T00:00:00Z)");
  });

  it("labels recorded with the reason when there is one", () => {
    const state: BeatRecordState = { kind: "recorded", at: "2026-01-01T00:00:00Z", note: "Session 11" };
    expect(describeBeatRecordState(state, null, formatDate)).toBe("Recorded · Session 11");
  });

  it("falls back to the formatted date for a recorded beat with no reason", () => {
    const state: BeatRecordState = { kind: "recorded", at: "2026-01-01T00:00:00Z", note: null };
    expect(describeBeatRecordState(state, null, formatDate)).toBe("Recorded · fmt(2026-01-01T00:00:00Z)");
  });

  it("labels unplayed as 'not played'", () => {
    const state: BeatRecordState = { kind: "unplayed", at: null, note: null };
    expect(describeBeatRecordState(state, null, formatDate)).toBe("Not played");
  });
});
