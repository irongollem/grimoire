import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import type { CanonEntryQuest } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn() }));
const quests = ref([{ id: "q1", title: "The Souring" }, { id: "q2", title: "Bitter Water" }]);

vi.mock("@/composables/canon/useCanonEntryQuests", () => ({
  useCreateEntryQuests: () => ({ mutate: mocks.create }),
  useDeleteEntryQuest: () => ({ mutate: mocks.remove }),
}));
vi.mock("@/composables/quests/useQuests", () => ({ useQuests: () => ({ data: quests }) }));

import EntryQuests from "./EntryQuests.vue";

const link = (over: Partial<CanonEntryQuest>): CanonEntryQuest => ({ id: "l1", user_id: "u", campaign_id: "c1", entry_id: "s1", quest_id: "q1", created_at: "", ...over });
const entry = canonEntry({ id: "s1", campaign_id: "c1", part: "secret" });
const EntityComboboxStub = { name: "EntityCombobox", props: ["modelValue", "options"], emits: ["update:modelValue"], template: "<div />" };
const mountIt = (links: CanonEntryQuest[], words = { label: "The quests that uncover it", empty: "No quest is built to uncover this yet." }) =>
  mount(EntryQuests, { props: { entry, links, ...words }, global: { stubs: { EntityCombobox: EntityComboboxStub, RouterLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" } } } });

describe("EntryQuests", () => {
  beforeEach(() => { for (const m of Object.values(mocks)) m.mockReset(); });

  it("links each quest to its page", () => {
    expect(mountIt([link({})]).get("a").attributes("href")).toBe("/quests/q1");
  });

  // Bug caught: a quest offered again after it is linked, so it could be linked twice.
  it("offers only the quests not linked yet, so a quest is linked once", () => {
    const options = mountIt([link({})]).getComponent(EntityComboboxStub).props("options");
    expect(options).toEqual([{ id: "q2", name: "Bitter Water" }]);
  });

  it("links the quest picked, to this entry, and clears the picker", async () => {
    const w = mountIt([]);
    w.getComponent(EntityComboboxStub).vm.$emit("update:modelValue", "q2");
    await nextTick();
    expect(mocks.create).toHaveBeenCalledWith([{ campaign_id: "c1", entry_id: "s1", quest_id: "q2" }]);
  });

  // Bug caught: unlinking by the quest's id, which removes nothing (or the wrong row) once an entry has several links.
  it("unlinks by the link's id, not the quest's, and only that link", async () => {
    const w = mountIt([link({ id: "l9" }), link({ id: "l10", quest_id: "q2" })]);
    await w.findAll("button")[0]!.trigger("click");
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith("l9");
  });

  // Bug caught: every part saying the force's words ("In no quest yet: the party has not crossed its path").
  it("says the words it is given for its label and for nothing linked", () => {
    const w = mountIt([]);
    expect(w.text()).toContain("The quests that uncover it");
    expect(w.text()).toContain("No quest is built to uncover this yet.");
    expect(w.text()).not.toContain("the party has not crossed");
  });
});
