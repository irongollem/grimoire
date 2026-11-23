import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { mount } from "@vue/test-utils";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn(), entries: vi.fn(), forces: vi.fn(), clues: vi.fn(), party: vi.fn() }));
const session = vi.hoisted(() => ({ isDM: true, preview: false }));
const entries = ref([
  canonEntry({ id: "l1", part: "lore", title: "The Fall" }),
  canonEntry({ id: "t1", part: "truth", title: "The river gives back" }),
  canonEntry({ id: "f1", part: "force", title: "The Ferrymen", clock_size: 4 }),
]);
const links = ref([
  { id: "a", entry_id: "l1", quest_id: "q1" },
  { id: "b", entry_id: "f1", quest_id: "q1" },
]);

vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ get isDM() { return session.isDM; } }) }));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({ get dmPreviewMode() { return session.preview; } }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => { mocks.entries(); return { data: entries }; } }));
vi.mock("@/composables/canon/useCanonForces", () => ({ clockFilled: () => 1, useCanonForceData: () => { mocks.forces(); return { data: computed(() => ({ steps: [], ticks: [], quests: links.value })) }; } }));
vi.mock("@/composables/canon/useCanonClues", () => ({ useCanonClues: () => { mocks.clues(); return { data: ref([]) }; } }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => { mocks.party(); return { data: ref([]) }; } }));
vi.mock("@/composables/canon/useCanonEntryQuests", () => ({
  useCreateEntryQuests: () => ({ mutate: mocks.create }),
  useDeleteEntryQuest: () => ({ mutate: mocks.remove }),
}));

import QuestCanon from "./QuestCanon.vue";

const EntityComboboxStub = { name: "EntityCombobox", props: ["modelValue", "options"], emits: ["update:modelValue"], template: "<div />" };
const mountIt = () =>
  mount(QuestCanon, { props: { questId: "q1", campaignId: "c1" }, global: { stubs: { EntityCombobox: EntityComboboxStub, RouterLink: { props: ["to"], template: "<a :href=\"to.query.entry\"><slot /></a>" } } } });

describe("QuestCanon", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    session.isDM = true;
    session.preview = false;
  });

  it("lists the canon tied to the quest by part, each linking to its entry", () => {
    const w = mountIt();
    expect(w.findAll("[data-testid=quest-canon-row]").map((r) => r.text())).toEqual(["The Ferrymen1 of 4", "The Fall"]);
    expect(w.findAll("a").map((a) => a.attributes("href"))).toEqual(["f1", "l1"]);
  });

  // Bug caught: an entry already tied offered again in the picker.
  it("offers only the entries not yet tied", () => {
    expect(mountIt().getComponent(EntityComboboxStub).props("options")).toEqual([{ id: "t1", name: "The river gives back" }]);
  });

  it("ties the entry picked to this quest, and unlinks by the link's id", async () => {
    const w = mountIt();
    w.getComponent(EntityComboboxStub).vm.$emit("update:modelValue", "t1");
    await w.vm.$nextTick();
    expect(mocks.create).toHaveBeenCalledWith([{ campaign_id: "c1", entry_id: "t1", quest_id: "q1" }]);
    await w.findAll("button")[1]!.trigger("click");
    expect(mocks.remove).toHaveBeenCalledWith("a");
  });

  // Bug caught: the DM-only canon reads running (and the block drawing) for a player, or a DM previewing the player portal.
  it.each([
    ["a player", { isDM: false, preview: false }],
    ["a DM previewing the player portal", { isDM: true, preview: true }],
  ])("mounts nothing and runs no read for %s", (_who, state) => {
    Object.assign(session, state);
    const w = mountIt();
    expect(w.find("[data-testid=quest-canon]").exists()).toBe(false);
    for (const read of [mocks.entries, mocks.forces, mocks.clues, mocks.party]) expect(read).not.toHaveBeenCalled();
  });
});
