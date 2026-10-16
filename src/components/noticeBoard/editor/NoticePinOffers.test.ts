// @vitest-environment jsdom
import { mount } from "@vue/test-utils";

import { reactive, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import NoticePinOffers from "./NoticePinOffers.vue";
import { pinToDraft } from "./pinDraft";
import { grellRow } from "./pinRows";

vi.mock("@/composables/quests/useQuests", () => ({
  useQuests: () => ({ data: ref([{ id: "q1", title: "The Burned Barn" }]) }),
}));
vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  useScriptoriumDocuments: () => ({
    data: ref([
      { id: "d1", title: "Grell's confession", campaign_id: "camp-1" },
      { id: "d2", title: "Another table's secret", campaign_id: "camp-2" },
      { id: "d3", title: "Account-wide rumours", campaign_id: null },
    ]),
  }),
}));

describe("NoticePinOffers", () => {
  const mountOffers = () => {
    const draft = reactive(pinToDraft(grellRow()));
    const w = mount(NoticePinOffers, {
      props: { draft, campaignId: "camp-1" },
      global: { directives: { "no-pwm": {} }, stubs: { Teleport: true } },
    });
    return { w, draft };
  };

  it("says what taking the notice does", () => {
    expect(mountOffers().w.text()).toContain("revealed to the whole party");
    expect(mountOffers().w.text()).toContain("shared with them");
  });

  it("offers the campaign's quests, and only handouts usable in this campaign", () => {
    const { w } = mountOffers();
    const combos = w.findAllComponents({ name: "EntityCombobox" });
    const names = combos.map((c) => (c.props("options") as { name: string }[]).map((o) => o.name));
    expect(names[0]).toEqual(["The Burned Barn"]);
    expect(names[1]).toEqual(["Grell's confession", "Account-wide rumours"]);
  });

  it("writes the chosen quest into the draft, and null when cleared", async () => {
    const { w, draft } = mountOffers();
    const quest = w.findAllComponents({ name: "EntityCombobox" })[0];
    quest.vm.$emit("update:modelValue", "q1");
    expect(draft.quest_id).toBe("q1");
    quest.vm.$emit("update:modelValue", "");
    expect(draft.quest_id).toBeNull();
  });
});
