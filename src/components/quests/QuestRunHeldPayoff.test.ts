import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestRunHeldPayoff from "./QuestRunHeldPayoff.vue";
import type { LootPlacement, QuestHeldPayoff } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({ dispatch: vi.fn(), fire: vi.fn() }));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useDispatchLoot: () => ({ mutateAsync: mocks.dispatch }),
}));
vi.mock("@/composables/quests/useQuestThreads", () => ({
  useFireHeldConsequence: () => ({ mutateAsync: mocks.fire }),
}));

const currencyLoot: LootPlacement = {
  id: "loot-1", beat_id: "beat-1", quest_id: "quest-1", location_id: null, campaign_id: "c1",
  kind: "currency", item_id: null, quantity: 1, label: "80 gp, skimmed", payload: {},
  source_type: "prepared", source_id: null, sort_order: 0, dispatch_message_id: null, dispatched_at: null,
  delivery_state: "held", quantity_remaining: 1, claimed_by_names: [], handed_out_this_session: false,
};

const heldEvent: QuestHeldPayoff = {
  event_id: "ev-1", consequence_id: "cq-1", action: "shift_npc_relationship", target_objective_id: null,
  target_npc_id: "npc-1", target_quest_id: null, action_payload: {}, after_days: 0,
  held_at: "2026-01-01T00:00:00Z", beat_id: "beat-1", beat_title: "Confront Ser Vallis",
};

describe("QuestRunHeldPayoff", () => {
  beforeEach(() => {
    mocks.dispatch.mockReset();
    mocks.fire.mockReset();
  });

  it("says nothing is held back rather than hiding the panel", () => {
    const wrapper = mount(QuestRunHeldPayoff, { props: { campaignId: "c1", loot: [], held: [] } });
    expect(wrapper.text()).toContain("Nothing held back");
  });

  it("counts loot and held events together", () => {
    const wrapper = mount(QuestRunHeldPayoff, { props: { campaignId: "c1", loot: [currencyLoot], held: [heldEvent] } });
    expect(wrapper.text()).toContain("2 to dispatch");
    expect(wrapper.text()).toContain("currency · prepared");
  });

  it("dispatches one loot entry through the sole writer", async () => {
    const wrapper = mount(QuestRunHeldPayoff, { props: { campaignId: "c1", loot: [currencyLoot], held: [] } });
    await wrapper.find("button").trigger("click");
    expect(mocks.dispatch).toHaveBeenCalledWith({ entryIds: ["loot-1"], campaignId: "c1" });
  });

  it("fires a held consequence from the log", async () => {
    const wrapper = mount(QuestRunHeldPayoff, { props: { campaignId: "c1", loot: [], held: [heldEvent] } });
    expect(wrapper.text()).toContain("Shifts an NPC's disposition");
    await wrapper.find("button").trigger("click");
    expect(mocks.fire).toHaveBeenCalledWith({ eventId: "ev-1" });
  });
});
