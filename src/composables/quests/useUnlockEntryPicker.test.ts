import { effectScope, ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Quest, QuestBeat } from "@/types/quest.types";

const undiscoveredQuestsData = ref<Quest[]>([]);
const allQuestsData = ref<Quest[]>([]);
const beatsByQuest = ref<Record<string, QuestBeat[]>>({});

vi.mock("@/composables/quests/useQuests", () => ({
  useQuests: (status?: string) => ({ data: status === "undiscovered" ? undiscoveredQuestsData : allQuestsData }),
}));
// Keyed by the ref's own current value, like the real composable, so the
// query reacts when `beatQueryTargetId` follows either the form's own
// selection or the fallback.
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeats: (id: { value: string } | string) => ({
    data: { get value() {
      const targetId = typeof id === "string" ? id : id.value;
      return beatsByQuest.value[targetId] ?? [];
    } },
  }),
}));

import { useUnlockEntryPicker } from "./useUnlockEntryPicker";

function quest(overrides: Partial<Quest> & { id: string; title: string }): Quest {
  return {
    user_id: "dm", campaign_id: "campaign-1", parent_quest_id: null, summary: null, status: "undiscovered",
    giver_npc_id: null, location_id: null, tags: [], player_visible_to: [], started_at: null,
    entry_beat_id: null,
    ...overrides,
  } as Quest;
}

function beat(overrides: Partial<QuestBeat> & { id: string; title: string }): QuestBeat {
  return {
    quest_id: "quest-sequel", campaign_id: "campaign-1", dm_content: null, read_aloud: null, how_it_plays: null,
    rumor_text: null, reveal_text: null, visibility: "hidden", kind: "neutral", presentation_hint: null,
    ...overrides,
  } as QuestBeat;
}

function mountPicker(opts: { targetQuestId?: string; fallbackTargetQuestId?: () => string } = {}) {
  const targetQuestId = ref(opts.targetQuestId ?? "");
  const scope = effectScope();
  const picker = scope.run(() => useUnlockEntryPicker({
    targetQuestId,
    fallbackTargetQuestId: opts.fallbackTargetQuestId ?? (() => ""),
  }))!;
  return { picker, targetQuestId, scope };
}

beforeEach(() => {
  undiscoveredQuestsData.value = [
    quest({ id: "quest-sequel", title: "The stolen cauldron", entry_beat_id: "beat-rumor" }),
    quest({ id: "quest-empty", title: "The empty ledger", entry_beat_id: null }),
  ];
  allQuestsData.value = [
    ...undiscoveredQuestsData.value,
    quest({ id: "quest-promoted", title: "Already underway", status: "active", entry_beat_id: "beat-x" }),
  ];
  beatsByQuest.value = {
    "quest-sequel": [
      beat({ id: "beat-rumor", title: "The rumor" }),
      beat({ id: "beat-cauldron", title: "The cauldron surfaces" }),
      beat({ id: "beat-old", title: "An old, retired scene", kind: "archived" }),
    ],
  };
});

describe("useUnlockEntryPicker", () => {
  it("preselects the target's own entry beat when the target quest changes", async () => {
    const { picker, targetQuestId } = mountPicker();
    expect(picker.entryBeatId.value).toBe("");

    targetQuestId.value = "quest-sequel";
    await flushPromises();
    expect(picker.entryBeatId.value).toBe("beat-rumor");
  });

  it("does not fight back once the DM picks a different beat for the same target", async () => {
    const { picker, targetQuestId } = mountPicker();
    targetQuestId.value = "quest-sequel";
    await flushPromises();

    picker.entryBeatId.value = "beat-cauldron";
    await flushPromises();
    expect(picker.entryBeatId.value).toBe("beat-cauldron");
  });

  it("marks the target's own entry in the options and excludes archived beats", async () => {
    const { picker, targetQuestId } = mountPicker();
    targetQuestId.value = "quest-sequel";
    await flushPromises();

    const options = picker.entryBeatOptions.value;
    expect(options.map((o) => o.id)).toEqual(["beat-rumor", "beat-cauldron"]);
    expect(options.find((o) => o.id === "beat-rumor")!.name).toBe("The rumor · entry");
    expect(options.find((o) => o.id === "beat-cauldron")!.name).toBe("The cauldron surfaces");
  });

  it("resolves null when the choice equals the target's entry, the id otherwise", async () => {
    const { picker, targetQuestId } = mountPicker();
    targetQuestId.value = "quest-sequel";
    await flushPromises();

    expect(picker.resolveEntryBeatId()).toBeNull(); // preselected to the entry
    picker.entryBeatId.value = "beat-cauldron";
    expect(picker.resolveEntryBeatId()).toBe("beat-cauldron");
    picker.entryBeatId.value = "";
    expect(picker.resolveEntryBeatId()).toBeNull();
  });

  it("resolves unlockQuestLabel against every quest, not only undiscovered ones, and '' for an unknown or null id", () => {
    const { picker } = mountPicker();
    expect(picker.unlockQuestLabel("quest-sequel")).toBe("The stolen cauldron");
    expect(picker.unlockQuestLabel("quest-promoted")).toBe("Already underway");
    expect(picker.unlockQuestLabel("quest-missing")).toBe("");
    expect(picker.unlockQuestLabel(null)).toBe("");
  });

  it("resolves unlockBeatLabel against the beats query, and '' for an unknown or null id", async () => {
    const { picker, targetQuestId } = mountPicker();
    targetQuestId.value = "quest-sequel";
    await flushPromises();

    expect(picker.unlockBeatLabel("beat-cauldron")).toBe("The cauldron surfaces");
    expect(picker.unlockBeatLabel("beat-missing")).toBe("");
    expect(picker.unlockBeatLabel(null)).toBe("");
  });

  it("queries the fallback target's beats when the form has no selection of its own, without offering options", async () => {
    const { picker } = mountPicker({ targetQuestId: "", fallbackTargetQuestId: () => "quest-sequel" });
    await flushPromises();

    // The options list stays empty — it only opens once the form itself
    // names a target — but the label lookup still resolves through the
    // fallback-driven query, for describing an already-authored row.
    expect(picker.entryBeatOptions.value).toEqual([]);
    expect(picker.unlockBeatLabel("beat-rumor")).toBe("The rumor");
  });

  it("reset() clears the entry-beat choice only", async () => {
    const { picker, targetQuestId } = mountPicker();
    targetQuestId.value = "quest-sequel";
    await flushPromises();
    expect(picker.entryBeatId.value).toBe("beat-rumor");

    picker.reset();
    expect(picker.entryBeatId.value).toBe("");
  });
});
