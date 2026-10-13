import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";

const create = vi.fn().mockResolvedValue({});
const update = vi.fn().mockResolvedValue({});
const push = vi.fn();

const existing = ref<unknown>(undefined);

vi.mock("vue-router", () => ({
  useRoute: () => ({ name: "archetype-edit", params: { id: "s1" }, query: { edit: "true" } }),
  useRouter: () => ({ push }),
  RouterLink: { template: "<a><slot /></a>" },
}));
vi.mock("@/composables/rules/useCustomSubclasses", () => ({
  // The fixture is the viewer's own archetype.
  canEditSubclass: () => true,
  useCustomSubclass: () => ({ data: existing }),
  useCreateCustomSubclass: () => ({ mutateAsync: create }),
  useUpdateCustomSubclass: () => ({ mutateAsync: update }),
  useDeleteCustomSubclass: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/rules/useFeatures", () => ({ useAllFeatures: () => ({ data: ref([]) }) }));
vi.mock("@/composables/spells/useSpellIndex", () => ({
  useSpellIndex: () => ({ data: ref([{ id: "a", name: "Misty Step", level: 2 }]) }),
}));
vi.mock("@/composables/spells/useSpellsByIds", () => ({ useSpellsByIds: () => ({ data: ref(new Map()) }) }));
vi.mock("@/composables/campaign/useCampaigns", () => ({ useDmCampaigns: () => ({ data: ref([]) }) }));
vi.mock("@/composables/rules/useCustomClasses", () => ({
  useAllSystemClasses: () => ({ data: ref([{ class_name: "Druid", caster_type: "prepared" }, { class_name: "Fighter", caster_type: "none" }]) }),
  useAllCustomClasses: () => ({ data: ref([]) }),
}));

vi.mock("@/components/common/entity/EntityImageBlock.vue", () => ({ default: { template: "<div />" } }));

import { buildAiProvenance } from "@/ai/provenance";
import CustomSubclassEditorView from "./CustomSubclassEditorView.vue";

describe("CustomSubclassEditorView spell data", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    update.mockClear();
    existing.value = {
      id: "s1", class_name: "Druid", subclass_name: "Land", source: null, description: null,
      campaign_id: null, features: {}, granted_spells: { "3": ["a"] },
      spell_variants: { Arctic: { "3": ["a"] } }, spell_variant_label: "Terrain",
      expanded_spells: { "1": ["a"] }, expanded_spell_variants: { Arctic: { "2": ["a"] } }, hp_per_level: null, spellcasting: null, image_url: null, focal_point: null, ai_provenance: null,
    };
  });

  it("round-trips granted, variant and expanded spells into the save payload", async () => {
    const w = mount(CustomSubclassEditorView, {
      global: { stubs: { PageHeader: { template: "<div><slot /><slot name='actions' /></div>" } } },
    });
    await flushPromises();
    const vm = w.vm as unknown as { save: () => Promise<void> };
    await vm.save();
    expect(update).toHaveBeenCalledTimes(1);
    const { update: payload } = update.mock.calls[0][0];
    expect(payload).toMatchObject({
      granted_spells: { "3": ["a"] },
      spell_variants: { Arctic: { "3": ["a"] } },
      spell_variant_label: "Terrain",
      expanded_spells: { "1": ["a"] },
      expanded_spell_variants: { Arctic: { "2": ["a"] } },
    });
  });

  it("drops the label when there are no options", async () => {
    existing.value = { ...(existing.value as object), spell_variants: {}, expanded_spell_variants: {}, spell_variant_label: "Terrain" };
    const w = mount(CustomSubclassEditorView, {
      global: { stubs: { PageHeader: { template: "<div><slot /></div>" } } },
    });
    await flushPromises();
    await (w.vm as unknown as { save: () => Promise<void> }).save();
    expect(update.mock.calls[0][0].update.spell_variant_label).toBeNull();
  });

  it("keeps the label when only the expanded variants have options", async () => {
    existing.value = { ...(existing.value as object), spell_variants: {} };
    const w = mount(CustomSubclassEditorView, {
      global: { stubs: { PageHeader: { template: "<div><slot /></div>" } } },
    });
    await flushPromises();
    await (w.vm as unknown as { save: () => Promise<void> }).save();
    expect(update.mock.calls[0][0].update.spell_variant_label).toBe("Terrain");
  });

  it("adds the third-caster preset and saves it, marking an AI archetype edited", async () => {
    existing.value = {
      ...(existing.value as object), source: "Grimoire:AI",
      ai_provenance: buildAiProvenance("subclass", "p", "m"),
    };
    const w = mount(CustomSubclassEditorView, {
      global: { stubs: { PageHeader: { template: "<div><slot /></div>" } } },
    });
    await flushPromises();
    const add = w.findAll("button").find(b => b.text() === "Add spellcasting");
    expect(add).toBeTruthy();
    await add?.trigger("click");
    await (w.vm as unknown as { save: () => Promise<void> }).save();
    const payload = update.mock.calls[0][0].update;
    expect(payload.spellcasting).toMatchObject({ ability: "int", list: "Wizard", caster_type: "known" });
    expect(payload.spellcasting.spell_slots[2]).toEqual([2, 0, 0, 0]);
    expect(payload.ai_provenance.edited).toBe(true);
  });

  it("removes spellcasting back to null", async () => {
    const w = mount(CustomSubclassEditorView, {
      global: { stubs: { PageHeader: { template: "<div><slot /></div>" } } },
    });
    await flushPromises();
    await w.findAll("button").find(b => b.text() === "Add spellcasting")?.trigger("click");
    await w.findAll("button").find(b => b.text() === "Remove spellcasting")?.trigger("click");
    await (w.vm as unknown as { save: () => Promise<void> }).save();
    expect(update.mock.calls[0][0].update.spellcasting).toBeNull();
  });

  it("warns when the base class already casts, and not when it does not", async () => {
    const w = mount(CustomSubclassEditorView, {
      global: { stubs: { PageHeader: { template: "<div><slot /></div>" } } },
    });
    await flushPromises();
    await w.findAll("button").find(b => b.text() === "Add spellcasting")?.trigger("click");
    expect(w.text()).toContain("Druid already casts");

    existing.value = { ...(existing.value as object), class_name: "Fighter" };
    await flushPromises();
    expect(w.text()).not.toContain("already casts");
  });
});
