import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, enableAutoUnmount } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";

enableAutoUnmount(afterEach);

const create = vi.fn().mockResolvedValue({});
const update = vi.fn().mockResolvedValue({});
const push = vi.fn();
const routeState: { name: string; params: Record<string, string>; query: Record<string, string> } = {
  name: "custom-class-edit", params: { id: "c1" }, query: { edit: "true" },
};
const record = ref<unknown>(undefined);

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push }),
  RouterLink: { template: "<a><slot /></a>" },
}));
vi.mock("@/composables/rules/useCustomClasses", () => ({
  canEditClass: () => true,
  useClass: () => ({ data: record }),
  useCreateCustomClass: () => ({ mutateAsync: create }),
  useUpdateCustomClass: () => ({ mutateAsync: update }),
  useDeleteCustomClass: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/rules/useFeatures", () => ({ useAllFeatures: () => ({ data: ref([]) }) }));
vi.mock("@/composables/campaign/useCampaigns", () => ({ useDmCampaigns: () => ({ data: ref([]) }) }));
vi.mock("@/components/common/entity/EntityImageBlock.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/levelup/CustomClassFeaturesPerLevel.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/levelup/CustomClassSpellSlots.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/levelup/CustomClassProficienciesPanel.vue", () => ({ default: { template: "<div />" } }));

import CustomClassEditorView from "./CustomClassEditorView.vue";

function cls(capabilities: string[] | undefined) {
  return {
    id: "c1", class_name: "Skinchanger", hit_die: 8, primary_ability: null, saving_throws: [],
    armor_proficiencies: [], weapon_proficiencies: [], subclass_level: 3, features: {},
    spell_slots: null, spells_known: null, cantrips_known: null, slot_recovery: "long",
    caster_type: "none", prepared_ability: null, prepared_divisor: null, image_url: null,
    focal_point: null, source: null, campaign_id: null, ai_provenance: null, capabilities,
  };
}

async function mountWith(capabilities: string[] | undefined) {
  record.value = { kind: "custom", cls: cls(capabilities) };
  const w = mount(CustomClassEditorView, {
    global: { stubs: { PageHeader: { template: "<div><slot /><slot name='actions' /></div>" }, CustomClassSheet: true } },
  });
  await flushPromises();
  return w;
}

describe("CustomClassEditorView Wild Shape capability", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    update.mockClear();
  });

  // Bug: a class could not be given Wild Shape from the editor at all, so the
  // only classes that could shapeshift were the ones the database was backfilled with.
  it("saves the capability once the box is ticked", async () => {
    const w = await mountWith([]);
    await w.find('input[type="checkbox"]').setValue(true);
    await (w.vm as unknown as { save: () => Promise<void> }).save();
    expect(update.mock.calls[0][0].update.capabilities).toEqual(["wild_shape"]);
  });

  // Bug: a save that rebuilt the payload without the form's list would clear the flag.
  it("keeps the capability on an untouched save and drops it when the box is cleared", async () => {
    const w = await mountWith(["wild_shape"]);
    const box = w.find('input[type="checkbox"]');
    expect((box.element as HTMLInputElement).checked).toBe(true);
    await (w.vm as unknown as { save: () => Promise<void> }).save();
    expect(update.mock.calls[0][0].update.capabilities).toEqual(["wild_shape"]);
    await box.setValue(false);
    await (w.vm as unknown as { save: () => Promise<void> }).save();
    expect(update.mock.calls[1][0].update.capabilities).toEqual([]);
  });

  // Bug: a Druid row from a previous build's cache has no `capabilities`, the box
  // shows unticked, and saving sent [] — stripping Wild Shape from the class and
  // every character of it before the fresh row had even landed.
  it("leaves the capability alone when the loaded row predates it and the box is untouched", async () => {
    const w = await mountWith(undefined);
    await (w.vm as unknown as { save: () => Promise<void> }).save();
    expect(update.mock.calls[0][0].update).not.toHaveProperty("capabilities");
    await w.find('input[type="checkbox"]').setValue(true);
    await (w.vm as unknown as { save: () => Promise<void> }).save();
    expect(update.mock.calls[1][0].update.capabilities).toEqual(["wild_shape"]);
  });
});
