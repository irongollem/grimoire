import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import type { CanonEntryQuest } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn() }));
const links = ref<CanonEntryQuest[]>([]);
vi.mock("@/composables/canon/useEntryQuestLinks", () => ({ useEntryQuestLinks: () => links }));
vi.mock("@/composables/canon/useCanonEntryQuests", () => ({
  useCreateEntryQuests: () => ({ mutate: mocks.create }),
  useDeleteEntryQuest: () => ({ mutate: mocks.remove }),
}));
vi.mock("@/composables/quests/useQuests", () => ({ useQuests: () => ({ data: ref([{ id: "q1", title: "The Souring" }, { id: "q2", title: "Bitter Water" }]) }) }));
vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => ({ data: ref([]), isSuccess: ref(true) }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useUpdateCanonEntry: () => ({ mutate: vi.fn() }) }));

import QuestionRow from "./QuestionRow.vue";

const entry = canonEntry({ id: "qn1", campaign_id: "c1", part: "question", title: "Who built the mill?" });
const EntityComboboxStub = { name: "EntityCombobox", props: ["modelValue", "options"], emits: ["update:modelValue"], template: "<div />" };
const mountRow = () =>
  mount(QuestionRow, { props: { entry }, global: { stubs: { EntityCombobox: EntityComboboxStub, RouterLink: { props: ["to"], template: "<a><slot /></a>" } } } });

describe("QuestionRow: Answered in", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    links.value = [];
  });

  // Bug caught (#1258 item 24): the quest picker was drawn on every question at once, crowding the list the DM reads.
  it("keeps the quest tie folded until Answered in… is pressed", async () => {
    const w = mountRow();
    expect(w.findComponent(EntityComboboxStub).exists()).toBe(false);
    await w.get("[data-testid=answered-in]").trigger("click");
    expect(w.findComponent(EntityComboboxStub).exists()).toBe(true);
  });

  // Bug caught: the tie was written against another entry, or with no campaign, so Tonight could never find it.
  it("ties this question to the quest picked", async () => {
    const w = mountRow();
    await w.get("[data-testid=answered-in]").trigger("click");
    w.getComponent(EntityComboboxStub).vm.$emit("update:modelValue", "q2");
    await nextTick();
    expect(mocks.create).toHaveBeenCalledWith([{ campaign_id: "c1", entry_id: "qn1", quest_id: "q2" }]);
  });

  // Bug caught: a question already tied to quests looked untied, so the DM tied it twice.
  it("counts the quests it is already tied to on its button", () => {
    links.value = [{ id: "l1", user_id: "u", campaign_id: "c1", entry_id: "qn1", quest_id: "q1", created_at: "" }];
    expect(mountRow().get("[data-testid=answered-in]").text()).toBe("Quests that answer it (1)");
  });
});
