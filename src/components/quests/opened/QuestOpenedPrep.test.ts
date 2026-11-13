import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import QuestOpenedPrep from "./QuestOpenedPrep.vue";
import type { QuestBeat } from "@/types/quest.types";

vi.mock("@/composables/locations/useLocations", () => ({ useLocationTree: () => ({ locationOptions: { value: [] } }) }));
vi.mock("@/composables/quests/useQuests", () => ({ useQuestObjectives: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({ useUpdateQuestBeat: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/composables/quests/useSetBeatVisibility", () => ({ useSetBeatVisibility: () => vi.fn() }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ isAiEnabled: false }) }));

const stub = (name: string) => ({ name, template: "<div />" });
const stubs = {
  QuestBeatAttachmentsPanel: stub("QuestBeatAttachmentsPanel"), QuestBeatFields: stub("QuestBeatFields"), QuestBeatIdentityFields: stub("QuestBeatIdentityFields"),
  QuestBeatRoutesPanel: stub("QuestBeatRoutesPanel"), QuestBeatSitePanel: stub("QuestBeatSitePanel"), QuestPayoffPanel: stub("QuestPayoffPanel"),
};

function mountPrep(partyHere: boolean, gaps: Array<{ kind: string; label: string }> = []) {
  return mount(QuestOpenedPrep, {
    props: {
      beat: { id: "beat-1", quest_id: "quest-1", kind: "neutral", visibility: "hidden", staged_at_location_id: null } as QuestBeat,
      partyHere, quest: null, threads: [], edges: [], beats: [], consequences: [], loot: [], attachments: [],
      gaps: gaps as never,
    },
    global: { stubs },
  });
}
const opens = (wrapper: ReturnType<typeof mountPrep>) => wrapper.findAllComponents({ name: "QuestFoldRow" }).map((fold) => fold.props("open"));

describe("QuestOpenedPrep", () => {
  // Bug: prep folds open over the table's side while the party is here, or closed when the DM is preparing a beat.
  it("starts the three folds closed when the party is here and open when it is elsewhere", () => {
    expect(opens(mountPrep(true))).toEqual([false, false, false]);
    expect(opens(mountPrep(false))).toEqual([true, true, true]);
  });

  it("resets the folds when the party arrives or leaves", async () => {
    const wrapper = mountPrep(false);
    await wrapper.setProps({ partyHere: true });
    await nextTick();
    expect(opens(wrapper)).toEqual([false, false, false]);
  });

  // Bug: gap counts attributed to the wrong fold hide where the missing prep is.
  it("shows each fold's own gap count and flags only that fold", () => {
    const wrapper = mountPrep(true, [
      { kind: "guidance", label: "Add DM guidance" }, { kind: "player_copy", label: "Add reveal copy" }, { kind: "attachment", label: "Replace X" },
    ]);
    const folds = wrapper.findAllComponents({ name: "QuestFoldRow" });
    expect(folds.map((fold) => fold.props("caption"))).toEqual(["2 gaps", "1 gap", ""]);
    expect(folds.map((fold) => fold.props("tone"))).toEqual(["caution", "caution", "muted"]);
  });
});
