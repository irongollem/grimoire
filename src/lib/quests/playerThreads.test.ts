import { describe, expect, it } from "vitest";
import { groupPlayerBeatsByThread } from "./playerThreads";
import type { PlayerQuestBeat } from "@/types/quest.types";

function beat(overrides: Partial<PlayerQuestBeat> = {}): PlayerQuestBeat {
  return {
    id: "beat-a",
    quest_id: "quest-a",
    campaign_id: "campaign-a",
    visibility: "revealed",
    kind: "social",
    presentation_hint: null,
    player_text: "The envoy agreed to help.",
    story_order: 0,
    attachments: [],
    visits: [],
    updated_at: "2026-08-10T12:00:00Z",
    staged_at_location_id: null,
    thread_id: "thread-main",
    thread_label: "Main",
    is_current: false,
    payoff: [],
    ...overrides,
  };
}

describe("groupPlayerBeatsByThread", () => {
  it("returns one column per distinct thread, ordered by each thread's earliest beat", () => {
    const columns = groupPlayerBeatsByThread([
      beat({ id: "petition-1", story_order: 0 }),
      beat({ id: "vault-1", story_order: 2, thread_id: "thread-vault", thread_label: "The Drowned Vault" }),
      beat({ id: "petition-2", story_order: 1 }),
    ]);

    expect(columns.map((c) => c.threadId)).toEqual(["thread-main", "thread-vault"]);
    expect(columns[0]!.beats.map((b) => b.id)).toEqual(["petition-1", "petition-2"]);
  });

  it("puts Main first regardless of story_order, and gives it the bare label as its eyebrow", () => {
    const columns = groupPlayerBeatsByThread([
      // A parallel thread's first beat sits earlier in the flow than the beat
      // that opened it, which is what a "spawn" out of an earlier beat looks
      // like — Main still leads the columns.
      beat({ id: "vault-1", story_order: 1, thread_id: "thread-vault", thread_label: "The Drowned Vault" }),
      beat({ id: "petition-1", story_order: 3, thread_id: "thread-main", thread_label: "Main" }),
    ]);

    expect(columns[0]!.threadId).toBe("thread-main");
    expect(columns[0]!.isPrimary).toBe(true);
    expect(columns[0]!.eyebrow).toBe("Main");
    expect(columns[1]!.eyebrow).toBe("Also following — The Drowned Vault");
    expect(columns[1]!.isPrimary).toBe(false);
  });

  it("assigns the primary and secondary tones by column order, not by thread label", () => {
    const columns = groupPlayerBeatsByThread([
      beat({ id: "main-1", thread_id: "thread-main", thread_label: "Main" }),
      beat({ id: "second-1", story_order: 1, thread_id: "thread-b", thread_label: "The Drowned Vault" }),
    ]);

    expect(columns[0]!.tone.text).toBe("text-primary");
    expect(columns[1]!.tone.text).toBe("text-ink-info");
  });

  it("orders beats within a column by story_order, not array position", () => {
    const columns = groupPlayerBeatsByThread([
      beat({ id: "keep", story_order: 2 }),
      beat({ id: "gate", story_order: 0 }),
      beat({ id: "bridge", story_order: 1 }),
    ]);

    expect(columns[0]!.beats.map((b) => b.id)).toEqual(["gate", "bridge", "keep"]);
  });

  it("filters out anything that is not rumored or revealed, defensively, even though the RPC already does", () => {
    const malformed = {
      ...beat({ id: "hidden" }),
      visibility: "hidden" as PlayerQuestBeat["visibility"],
    };
    const columns = groupPlayerBeatsByThread([malformed, beat({ id: "safe" })]);

    expect(columns).toHaveLength(1);
    expect(columns[0]!.beats.map((b) => b.id)).toEqual(["safe"]);
  });

  it("returns no columns for an empty beat list", () => {
    expect(groupPlayerBeatsByThread([])).toEqual([]);
  });

  it("keeps rumored beats in their assigned thread's column alongside revealed ones", () => {
    const columns = groupPlayerBeatsByThread([
      beat({ id: "confront", story_order: 2, visibility: "rumored" }),
      beat({ id: "ledgers", story_order: 1 }),
    ]);

    expect(columns).toHaveLength(1);
    expect(columns[0]!.beats.map((b) => b.id)).toEqual(["ledgers", "confront"]);
  });

  it("falls back to the earliest beat's thread as primary when no beat carries the Main label (malformed cache)", () => {
    const columns = groupPlayerBeatsByThread([
      beat({ id: "b-1", story_order: 1, thread_id: "thread-b", thread_label: "The Drowned Vault" }),
      beat({ id: "a-1", story_order: 0, thread_id: "thread-a", thread_label: "The Petition" }),
    ]);

    expect(columns[0]!.threadId).toBe("thread-a");
    expect(columns[0]!.isPrimary).toBe(true);
  });
});
