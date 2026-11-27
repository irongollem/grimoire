import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import MentionTextarea from "@/components/common/controls/MentionTextarea.vue";

const openGenerator = vi.hoisted(() => vi.fn());
const mocks = vi.hoisted(() => ({ addForm: vi.fn(), updateForm: vi.fn(), removeForm: vi.fn() }));
const state = vi.hoisted(() => ({ forms: [] as unknown[] }));

vi.mock("@/composables/canon/useCampaignSpecies", () => ({
  useSpeciesEditing: () => ({
    forms: ref(state.forms),
    statBlockNameByForm: ref(new Map([["f1", "Rime cub"]])),
    addForm: mocks.addForm,
    updateForm: mocks.updateForm,
    removeForm: mocks.removeForm,
  }),
}));
vi.mock("@/composables/ask/useOpenGenerator", () => ({ useOpenGenerator: () => ({ open: openGenerator }) }));
vi.mock("@/composables/monsters/useMonsterIndex", () => ({
  useMonsterIndex: () => ({ data: ref([{ id: "own-1", name: "Rime cub", is_shared: false }, { id: "lib_bear", name: "Rime bear", is_shared: true }]) }),
}));

import SpeciesForms from "./SpeciesForms.vue";

const species = { id: "s1", name: "Rime bear", scientificName: null, cladeId: null, kingdom: "animal" as const, livesAs: null, activity: null, seasons: {}, description: null, sortOrder: 0 };
const textarea = { props: ["modelValue"], emits: ["update:modelValue", "item-selected"], template: "<textarea :value='modelValue' @input=\"$emit('update:modelValue', $event.target.value)\" />" };
const mountIt = () => mount(SpeciesForms, { props: { species }, global: { stubs: { MentionTextarea: textarea, EntityMentionChip: { props: ["entityType", "id", "editable"], template: "<span>{{ entityType }}:{{ id }}</span>" } } } });
const pick = async (w: ReturnType<typeof mountIt>, text: string, token: string, id: string) => {
  await w.get("textarea").setValue(text);
  w.findComponent(MentionTextarea).vm.$emit("item-selected", { item: { id, label: "x" }, token, value: text });
};

describe("SpeciesForms", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => { m.mockReset(); m.mockResolvedValue(undefined); });
    mocks.addForm.mockResolvedValue("new");
    state.forms = [
      { id: "f2", speciesId: "s1", label: "Old", stageOrder: 1, domesticated: false, monsterId: null, libraryMonsterId: null },
      { id: "f1", speciesId: "s1", label: "Young", stageOrder: 0, domesticated: false, monsterId: "own-1", libraryMonsterId: null },
      { id: "x", speciesId: "other", label: "Elsewhere", stageOrder: 0, domesticated: false, monsterId: null, libraryMonsterId: null },
    ];
  });

  // Bug: another species' forms were listed, or the stages were not in their order.
  it("lists this species' forms in stage order with the stat block name where there is one", () => {
    const rows = mountIt().findAll("[data-testid=species-form]");
    expect(rows).toHaveLength(2);
    expect(rows[0].get("[data-testid=form-stat-block]").text()).toBe("monster:own-1");
    expect(rows[1].text()).toContain("No stat block");
  });

  // Bug: the button offered on a form that already has a stat block (a second monster for one form), or opening the card
  // with no bind (the monster made and never tied to the form), or tying it to the wrong form.
  it("offers Make its stat block only where there is none, and opens the monster card bound to that form", async () => {
    openGenerator.mockClear();
    const w = mountIt();
    const rows = w.findAll("[data-testid=species-form]");
    expect(rows[1].find("[data-testid=make-stat-block]").exists()).toBe(true);
    expect(rows[0].find("[data-testid=make-stat-block]").exists()).toBe(false);
    await rows[1].get("[data-testid=make-stat-block]").trigger("click");
    expect(openGenerator).toHaveBeenCalledExactlyOnceWith("monster", {
      concept: expect.stringContaining("Old Rime bear"),
      inputs: { monster_type: "beast" },
      bind: { kind: "species_form", formId: "f2", formLabel: "Old" },
    });
  });

  // Bug: the words before the @ were lost, so every form was "Adult"; or a book's stat block was written as the DM's own.
  it("adds a stage from the words before the pick and files a book's stat block as the library's", async () => {
    const w = mountIt();
    await pick(w, "Young @Rime_bear ", "@Rime_bear", "lib_bear");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.addForm).toHaveBeenCalledExactlyOnceWith("s1", { label: "Young", monsterId: null, libraryMonsterId: "lib_bear" });
  });

  it("makes a bare stat block an Adult of the DM's own, and empties the line afterwards", async () => {
    const w = mountIt();
    await pick(w, "@Rime_cub ", "@Rime_cub", "own-1");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.addForm).toHaveBeenCalledExactlyOnceWith("s1", { label: "Adult", monsterId: "own-1", libraryMonsterId: null });
    expect((w.get("textarea").element as HTMLTextAreaElement).value).toBe("");
  });

  // Bug: a stat block another species already holds was refused (the composable says so) yet the line was emptied.
  it("keeps the line when the add is refused", async () => {
    mocks.addForm.mockResolvedValue(null);
    const w = mountIt();
    await pick(w, "@Rime_cub ", "@Rime_cub", "own-1");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect((w.get("textarea").element as HTMLTextAreaElement).value).toBe("@Rime_cub ");
  });

  // Bug: the Domesticated mark wrote the wrong form, or the remove button did not remove the form it sits on.
  it("saves Domesticated and removes on the form's own row", async () => {
    const w = mountIt();
    const first = w.findAll("[data-testid=species-form]")[0];
    await first.get("input[type=checkbox]").setValue(true);
    expect(mocks.updateForm).toHaveBeenCalledExactlyOnceWith("f1", { domesticated: true });
    await w.findAll("[data-testid=remove-form]")[1].trigger("click");
    expect(mocks.removeForm).toHaveBeenCalledExactlyOnceWith("f2");
  });
});
