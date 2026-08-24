import { describe, it, expect } from "vitest";
import type { Quest, QuestBeatTransition } from "@/types/quest.types";
import { deriveQuestActivityRows } from "./questActivity";

const quest = (id: string, title: string): Quest => ({
  id,
  user_id: "user-1",
  campaign_id: "campaign-1",
  parent_quest_id: null,
  title,
  summary: null,
  status: "active",
  giver_npc_id: null,
  location_id: null,
  rewards: null,
  reward_pp: 0,
  reward_gp: 0,
  reward_ep: 0,
  reward_sp: 0,
  reward_cp: 0,
  tags: [],
  description: null,
  notes: null,
  player_visible_to: [],
  reward_item_ids: [],
  reward_currency_pools: [],
  started_at: null,
  resolved_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const transition = (overrides: Partial<QuestBeatTransition> & { id: string }): QuestBeatTransition => ({
  campaign_id: "campaign-1",
  from_quest_id: "q1",
  from_beat_id: "beat-a",
  to_quest_id: "q1",
  to_beat_id: "beat-b",
  transition_kind: "forward",
  reason: null,
  runtime_version: 1,
  from_quest_title: "The Sunken Keep",
  from_beat_title: "The Flooded Hall",
  to_quest_title: "The Sunken Keep",
  to_beat_title: "The Drowned Vault",
  provenance: {},
  created_by: "user-1",
  created_at: "2026-08-20T12:00:00Z",
  ...overrides,
});

describe("deriveQuestActivityRows", () => {
  it("returns nothing for no transitions", () => {
    expect(deriveQuestActivityRows([], [quest("q1", "The Sunken Keep")])).toEqual([]);
  });

  it("drops a transition whose quest id has no matching quest, without crashing", () => {
    const rows = deriveQuestActivityRows(
      [transition({ id: "t1", to_quest_id: "deleted-quest", to_quest_title: "Gone Quest" })],
      [quest("q1", "The Sunken Keep")],
    );
    expect(rows).toEqual([]);
  });

  it("orders rows newest-first regardless of input order", () => {
    const oldest = transition({ id: "old", created_at: "2026-08-01T00:00:00Z" });
    const middle = transition({ id: "mid", created_at: "2026-08-10T00:00:00Z" });
    const newest = transition({ id: "new", created_at: "2026-08-20T00:00:00Z" });
    const rows = deriveQuestActivityRows(
      [oldest, newest, middle],
      [quest("q1", "The Sunken Keep")],
    );
    expect(rows.map((row) => row.transitionId)).toEqual(["new", "mid", "old"]);
  });

  it("truncates to the limit after filtering, not before", () => {
    // Newest is unresolvable and would be dropped; if the limit applied to the
    // raw list first, this would leave only one valid row instead of two.
    const rows = deriveQuestActivityRows(
      [
        transition({ id: "unresolvable", to_quest_id: "gone", created_at: "2026-08-22T00:00:00Z" }),
        transition({ id: "second", created_at: "2026-08-21T00:00:00Z" }),
        transition({ id: "first", created_at: "2026-08-20T00:00:00Z" }),
      ],
      [quest("q1", "The Sunken Keep")],
      2,
    );
    expect(rows.map((row) => row.transitionId)).toEqual(["second", "first"]);
  });

  it("phrases a quest starting with no from-beat as entering, not a blank 'from'", () => {
    const rows = deriveQuestActivityRows(
      [
        transition({
          id: "t1",
          transition_kind: "enter",
          from_quest_id: null,
          from_beat_id: null,
          from_quest_title: null,
          from_beat_title: null,
          to_beat_title: "The Camp",
        }),
      ],
      [quest("q1", "The Sunken Keep")],
    );
    expect(rows).toEqual([
      {
        transitionId: "t1",
        questId: "q1",
        questTitle: "The Sunken Keep",
        summary: 'Entered "The Camp"',
        occurredAt: "2026-08-20T12:00:00Z",
      },
    ]);
  });

  it("phrases a session ending with no to-beat as ending, not a blank 'to'", () => {
    const rows = deriveQuestActivityRows(
      [
        transition({
          id: "t1",
          transition_kind: "end",
          to_quest_id: null,
          to_beat_id: null,
          to_quest_title: null,
          to_beat_title: null,
          from_beat_title: "The Drowned Vault",
        }),
      ],
      [quest("q1", "The Sunken Keep")],
    );
    expect(rows).toEqual([
      {
        transitionId: "t1",
        questId: "q1",
        questTitle: "The Sunken Keep",
        summary: 'Ended at "The Drowned Vault"',
        occurredAt: "2026-08-20T12:00:00Z",
      },
    ]);
  });

  it("phrases an ordinary forward move between two named beats", () => {
    const rows = deriveQuestActivityRows([transition({ id: "t1" })], [quest("q1", "The Sunken Keep")]);
    expect(rows[0].summary).toBe('Advanced from "The Flooded Hall" to "The Drowned Vault"');
  });
});
