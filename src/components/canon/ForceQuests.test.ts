import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import type { CanonForceQuest } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn() }));
const quests = ref([{ id: "q1", title: "The Souring" }, { id: "q2", title: "Bitter Water" }]);

vi.mock("@/composables/canon/useCanonForces", () => ({
  useCreateForceQuests: () => ({ mutate: mocks.create }),
  useDeleteForceQuest: () => ({ mutate: mocks.remove }),
}));
vi.mock("@/composables/quests/useQuests", () => ({ useQuests: () => ({ data: quests }) }));

import ForceQuests from "./ForceQuests.vue";

const link = (over: Partial<CanonForceQuest>): CanonForceQuest => ({ id: "l1", user_id: "u", campaign_id: "c1", force_id: "f1", quest_id: "q1", created_at: "", ...over });
const force = canonEntry({ id: "f1", campaign_id: "c1", part: "force" });
const EntityComboboxStub = { name: "EntityCombobox", props: ["modelValue", "options"], emits: ["update:modelValue"], template: "<div />" };
const mountIt = (links: CanonForceQuest[]) =>
  mount(ForceQuests, { props: { force, links }, global: { stubs: { EntityCombobox: EntityComboboxStub, RouterLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" } } } });

describe("ForceQuests", () => {
  beforeEach(() => { for (const m of Object.values(mocks)) m.mockReset(); });

  it("links each quest to its page", () => {
    expect(mountIt([link({})]).get("a").attributes("href")).toBe("/quests/q1");
  });

  it("offers only the quests not linked yet, so a quest is linked once", () => {
    const options = mountIt([link({})]).getComponent(EntityComboboxStub).props("options");
    expect(options).toEqual([{ id: "q2", name: "Bitter Water" }]);
  });

  it("links the quest picked, to this force, and clears the picker", async () => {
    const w = mountIt([]);
    w.getComponent(EntityComboboxStub).vm.$emit("update:modelValue", "q2");
    await nextTick();
    expect(mocks.create).toHaveBeenCalledWith([{ campaign_id: "c1", force_id: "f1", quest_id: "q2" }]);
  });

  it("unlinks by the link's id, not the quest's", async () => {
    await mountIt([link({ id: "l9" })]).get("button").trigger("click");
    expect(mocks.remove).toHaveBeenCalledWith("l9");
  });

  it("says so when the force is in no quest", () => {
    expect(mountIt([]).text()).toContain("In no quest yet");
  });
});
