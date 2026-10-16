// @vitest-environment jsdom
import { mount } from "@vue/test-utils";

import { reactive, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import NoticePinOffers from "./NoticePinOffers.vue";
import { pinToDraft } from "./pinDraft";
import { grellRow } from "./pinRows";

vi.mock("@/composables/quests/useQuests", () => ({
  useQuests: () => ({
    data: ref([
      { id: "q1", title: "The Burned Barn", campaign_id: "camp-1" },
      { id: "q2", title: "Someone else's errand", campaign_id: "camp-2" },
    ]),
  }),
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
  const mountOffers = (locked = false) => {
    const draft = reactive(pinToDraft(grellRow()));
    const w = mount(NoticePinOffers, {
      props: { draft, campaignId: "camp-1", locked },
      global: { directives: { "no-pwm": {} }, stubs: { Teleport: true } },
    });
    return { w, draft };
  };

  it("says what taking the notice does", () => {
    expect(mountOffers().w.text()).toContain("revealed to the whole party");
    expect(mountOffers().w.text()).toContain("shared with them");
  });

  it("offers only the board's own campaign's quests and handouts, never account-wide ones a take cannot give", () => {
    const { w } = mountOffers();
    const combos = w.findAllComponents({ name: "EntityCombobox" });
    const names = combos.map((c) => (c.props("options") as { name: string }[]).map((o) => o.name));
    expect(names[0]).toEqual(["The Burned Barn"]);
    expect(names[1]).toEqual(["Grell's confession"]);
  });

  it("shows a taken notice's offer read-only, since the database refuses to change it", () => {
    const { w } = mountOffers(true);
    expect(w.findAllComponents({ name: "EntityCombobox" })).toHaveLength(0);
    expect(w.text()).toContain("keeps what it offered");
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
