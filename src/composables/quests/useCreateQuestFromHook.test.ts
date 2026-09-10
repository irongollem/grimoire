import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestHookResult } from "@/ai/types";

const mocks = vi.hoisted(() => ({
  createQuest: vi.fn(),
  createObjective: vi.fn(),
  createQuestRef: vi.fn(),
  createBeat: vi.fn(),
  createBeatEdge: vi.fn(),
  createConsequence: vi.fn(),
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "campaign-1" }),
}));
vi.mock("@/composables/quests/useQuests", () => ({
  useCreateQuest: () => ({ mutateAsync: mocks.createQuest }),
  useCreateObjective: () => ({ mutateAsync: mocks.createObjective }),
  useCreateQuestRef: () => ({ mutateAsync: mocks.createQuestRef }),
}));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useCreateQuestBeat: () => ({ mutateAsync: mocks.createBeat }),
  useCreateQuestBeatEdge: () => ({ mutateAsync: mocks.createBeatEdge }),
  useCreateQuestConsequence: () => ({ mutateAsync: mocks.createConsequence }),
}));

import { useCreateQuestFromHook } from "./useCreateQuestFromHook";

function hook(overrides: Partial<QuestHookResult> = {}): QuestHookResult {
  return {
    title: "The Silent Bell",
    summary: "Something rings under the church at night.",
    objectives: [
      { description: "Investigate the bell" },
      { description: "Confront the ringer" },
    ],
    tags: [],
    ...overrides,
  };
}

const emptyPools = { npcs: [], locations: [], factions: [] };

describe("useCreateQuestFromHook", () => {
  beforeEach(() => {
    mocks.createQuest.mockReset();
    mocks.createObjective.mockReset();
    mocks.createQuestRef.mockReset();
    mocks.createBeat.mockReset();
    mocks.createBeatEdge.mockReset();
    mocks.createConsequence.mockReset();

    mocks.createQuest.mockResolvedValue({ id: "quest-1" });
    mocks.createObjective.mockImplementation(async (obj: { sort_order: number }) => ({
      id: `objective-${obj.sort_order}`,
      ...obj,
    }));
    mocks.createBeat.mockImplementation(async (beat: { title: string }) => ({
      id: `beat-${beat.title}`,
      ...beat,
    }));
  });

  it("creates the quest and its objectives with no beat when the response has no usable spine (#822 — no fallback beat)", async () => {
    const { createFromHook } = useCreateQuestFromHook();
    const result = await createFromHook({
      hook: hook(),
      giverNpcId: "",
      locationId: "",
      entityPools: emptyPools,
      aiProvenance: null,
    });

    expect(result).toEqual({ questId: "quest-1", beatsCreated: 0 });
    expect(mocks.createBeat).not.toHaveBeenCalled();
    expect(mocks.createBeatEdge).not.toHaveBeenCalled();
    expect(mocks.createConsequence).not.toHaveBeenCalled();

    // No beats at all means nothing to raise anything out of dormant — every
    // objective still lands `pending`, exactly as the reachability rule says.
    expect(mocks.createObjective).toHaveBeenCalledTimes(2);
    for (const call of mocks.createObjective.mock.calls) {
      expect(call[0]).toMatchObject({ status: "pending", is_player_visible: false });
    }
  });

  it("creates the spine's beats and route edges, and splits objectives pending/dormant by which beat raises them", async () => {
    const spineHook = hook({
      objectives: [
        { description: "Learn who rings the bell", raised_by: "opening" },
        { description: "Confront the ringer", raised_by: "confront" },
        { description: "Report back to the elder" },
      ],
      beats: [
        { key: "opening", title: "The bell rings", dm_content: "A bell tolls.", kind: "social" },
        { key: "confront", title: "Face the ringer", dm_content: "Something answers.", kind: "combat" },
      ],
      routes: [{ from: "opening", to: "confront" }],
    });

    const { createFromHook } = useCreateQuestFromHook();
    const result = await createFromHook({
      hook: spineHook,
      giverNpcId: "",
      locationId: "",
      entityPools: emptyPools,
      aiProvenance: null,
    });

    expect(result).toEqual({ questId: "quest-1", beatsCreated: 2 });
    expect(mocks.createBeat).toHaveBeenCalledTimes(2);
    expect(mocks.createBeat.mock.calls[0]![0]).toMatchObject({ title: "The bell rings", kind: "social", canvas_x: 0 });
    expect(mocks.createBeat.mock.calls[1]![0]).toMatchObject({ title: "Face the ringer", kind: "combat", canvas_x: 320 });

    expect(mocks.createBeatEdge).toHaveBeenCalledTimes(1);
    expect(mocks.createBeatEdge.mock.calls[0]![0]).toMatchObject({
      quest_id: "quest-1",
      source_beat_id: "beat-The bell rings",
      target_beat_id: "beat-Face the ringer",
    });

    // objective 0 raised_by the root beat -> pending; objective 1 raised_by
    // the second beat -> dormant; objective 2 has no raised_by at all ->
    // pending (conservative default — never hide something the model forgot
    // to wire).
    const statuses = mocks.createObjective.mock.calls.map((call) => call[0]!.status);
    expect(statuses).toEqual(["pending", "dormant", "pending"]);
    for (const call of mocks.createObjective.mock.calls) {
      expect(call[0]!.is_player_visible).toBe(false);
    }
  });

  it("creates one raise consequence per objective whose raised_by names a real beat, resolved to real ids", async () => {
    const spineHook = hook({
      objectives: [
        { description: "Learn who rings the bell", raised_by: "opening" },
        { description: "Confront the ringer", raised_by: "confront" },
      ],
      beats: [
        { key: "opening", title: "The bell rings", dm_content: "", kind: "social" },
        { key: "confront", title: "Face the ringer", dm_content: "", kind: "combat" },
      ],
      routes: [{ from: "opening", to: "confront" }],
    });

    const { createFromHook } = useCreateQuestFromHook();
    await createFromHook({
      hook: spineHook,
      giverNpcId: "",
      locationId: "",
      entityPools: emptyPools,
      aiProvenance: null,
    });

    expect(mocks.createConsequence).toHaveBeenCalledTimes(2);
    expect(mocks.createConsequence.mock.calls[0]![0]).toMatchObject({
      quest_id: "quest-1",
      on_beat_id: "beat-The bell rings",
      action: "raise",
      target_objective_id: "objective-0",
    });
    expect(mocks.createConsequence.mock.calls[1]![0]).toMatchObject({
      on_beat_id: "beat-Face the ringer",
      action: "raise",
      target_objective_id: "objective-1",
    });
  });

  it("degrades an unrecognized beat kind to neutral before writing it", async () => {
    const spineHook = hook({
      objectives: [{ description: "Do the thing", raised_by: "opening" }],
      beats: [{ key: "opening", title: "Open", dm_content: "", kind: "mystical" }],
      routes: [],
    });

    const { createFromHook } = useCreateQuestFromHook();
    await createFromHook({
      hook: spineHook,
      giverNpcId: "",
      locationId: "",
      entityPools: emptyPools,
      aiProvenance: null,
    });

    expect(mocks.createBeat.mock.calls[0]![0]).toMatchObject({ kind: "neutral" });
  });

  it("never sends the deleted reward columns, and passes the giver/location/provenance through", async () => {
    const { createFromHook } = useCreateQuestFromHook();
    await createFromHook({
      hook: hook(),
      giverNpcId: "npc-1",
      locationId: "loc-1",
      entityPools: emptyPools,
      aiProvenance: null,
    });

    const insert = mocks.createQuest.mock.calls[0]![0] as Record<string, unknown>;
    for (const column of [
      "rewards", "reward_pp", "reward_gp", "reward_ep", "reward_sp", "reward_cp",
      "reward_item_ids", "reward_currency_pools",
    ]) {
      expect(insert).not.toHaveProperty(column);
    }
    expect(insert).toMatchObject({
      title: "The Silent Bell",
      status: "active",
      giver_npc_id: "npc-1",
      location_id: "loc-1",
    });
  });

  it("writes parent_quest_id when the caller supplies one (#873), and null when it doesn't", async () => {
    const { createFromHook } = useCreateQuestFromHook();
    await createFromHook({
      hook: hook(),
      giverNpcId: "",
      locationId: "",
      entityPools: emptyPools,
      aiProvenance: null,
      parentQuestId: "quest-parent-1",
    });
    expect(mocks.createQuest.mock.calls[0]![0]).toMatchObject({ parent_quest_id: "quest-parent-1" });

    mocks.createQuest.mockClear();
    await createFromHook({
      hook: hook(),
      giverNpcId: "",
      locationId: "",
      entityPools: emptyPools,
      aiProvenance: null,
    });
    expect(mocks.createQuest.mock.calls[0]![0]).toMatchObject({ parent_quest_id: null });
  });
});
