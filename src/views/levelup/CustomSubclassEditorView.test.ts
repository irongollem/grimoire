import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The fixtures are module-level refs, so a wrapper left mounted would re-render
// against the next test's route and fixture.
enableAutoUnmount(afterEach);
import { mount, flushPromises, enableAutoUnmount } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";

const create = vi.fn().mockResolvedValue({});
const update = vi.fn().mockResolvedValue({});
const push = vi.fn();
const del = vi.fn().mockResolvedValue({});
const routeState: { name: string; params: Record<string, string>; query: Record<string, string> } = {
  name: "archetype-edit", params: { id: "s1" }, query: { edit: "true" },
};

const existing = ref<unknown>(undefined);

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push }),
  RouterLink: { template: "<a><slot /></a>" },
}));
vi.mock("@/composables/rules/useCustomSubclasses", () => ({
  // The fixture is the viewer's own archetype.
  canEditSubclass: () => true,
  useCustomSubclass: () => ({ data: existing }),
  useCreateCustomSubclass: () => ({ mutateAsync: create }),
  useUpdateCustomSubclass: () => ({ mutateAsync: update }),
  useDeleteCustomSubclass: () => ({ mutateAsync: del }),
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

// The save and delete guards: what the DM can lose or double-do by clicking.
describe("CustomSubclassEditorView save and delete", () => {
  type EditorVm = {
    save: () => Promise<void>;
    remove: () => Promise<void>;
    form: { class_name: string; subclass_name: string; description: string; image_url: string | null };
    saveError: string;
  };
  const mountEditor = async () => {
    const w = mount(CustomSubclassEditorView, {
      global: { stubs: { PageHeader: { template: "<div><slot /><slot name='actions' /></div>" } } },
    });
    await flushPromises();
    return { w, vm: w.vm as unknown as EditorVm };
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    update.mockReset().mockResolvedValue({});
    create.mockReset().mockResolvedValue({});
    del.mockReset().mockResolvedValue({});
    push.mockReset();
    routeState.name = "archetype-edit";
    routeState.params = { id: "s1" };
    routeState.query = { edit: "true" };
    existing.value = {
      id: "s1", class_name: "Druid", subclass_name: "Land", source: "Grimoire:AI", description: null,
      campaign_id: null, features: {}, granted_spells: {}, spell_variants: {}, spell_variant_label: null,
      expanded_spells: {}, expanded_spell_variants: {}, hp_per_level: null, spellcasting: null,
      image_url: null, focal_point: null, ai_provenance: buildAiProvenance("subclass", "p", "m"),
    };
  });

  it("will not save an archetype with no name or no base class", async () => {
    const { vm, w } = await mountEditor();
    vm.form.subclass_name = "   ";
    await vm.save();
    vm.form.subclass_name = "Land";
    vm.form.class_name = "";
    await vm.save();

    expect(update).not.toHaveBeenCalled();
    const saveButton = w.findAll("button").find((b) => b.text() === "Save");
    expect(saveButton?.attributes("disabled")).toBeDefined();
  });

  it("creates on the new route, scoped to all campaigns by default, and goes back to the list", async () => {
    routeState.name = "archetype-new";
    routeState.params = {};
    routeState.query = {};
    existing.value = undefined;
    const { vm } = await mountEditor();
    vm.form.class_name = "Druid";
    vm.form.subclass_name = "Ash";
    await vm.save();

    expect(update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ class_name: "Druid", subclass_name: "Ash", campaign_id: null });
    expect(push).toHaveBeenCalledWith("/levelup/custom");
  });

  it("stores a description with no text in it as no description", async () => {
    const { vm } = await mountEditor();
    const empty = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
    vm.form.description = empty;
    await vm.save();
    expect(update.mock.calls[0][0].update.description).toBeNull();

    const written = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Wardens of the ash." }] }] });
    vm.form.description = written;
    await vm.save();
    expect(update.mock.calls[1][0].update.description).toBe(written);
  });

  it("swapping only the picture does not mark an AI archetype as edited, but changing its rules does", async () => {
    const { vm } = await mountEditor();
    vm.form.image_url = "https://img.example/ash.webp";
    await vm.save();
    const pictureOnly = update.mock.calls[0][0].update;
    expect(pictureOnly.image_url).toBe("https://img.example/ash.webp");
    expect(pictureOnly.ai_provenance.edited).toBeFalsy();
    expect(pictureOnly.source).toBe("Grimoire:AI");

    vm.form.subclass_name = "Land, renamed";
    await vm.save();
    expect(update.mock.calls[1][0].update.ai_provenance.edited).toBe(true);
  });

  it("keeps the editor open and says why when the save fails", async () => {
    update.mockRejectedValue(new Error("Row level security"));
    const { vm, w } = await mountEditor();
    await vm.save();

    expect(push).not.toHaveBeenCalled();
    expect(w.text()).toContain("Row level security");
    // The button comes back, so the DM can try again.
    const retry = w.findAll("button").find((b) => b.text() === "Save");
    expect(retry).toBeDefined();
    expect(retry?.attributes("disabled")).toBeUndefined();
  });

  it("deletes only after the DM confirms", async () => {
    const { vm } = await mountEditor();
    const ask = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", ask);
    await vm.remove();
    expect(del).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();

    ask.mockReturnValue(true);
    await vm.remove();
    expect(ask).toHaveBeenLastCalledWith('Delete "Land"? This cannot be undone.');
    expect(del).toHaveBeenCalledWith(existing.value);
    expect(push).toHaveBeenCalledWith("/levelup/custom");
    vi.unstubAllGlobals();
  });

  it("shows a failed delete and stays on the archetype", async () => {
    del.mockRejectedValue(new Error("in use by a character"));
    const { vm, w } = await mountEditor();
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    await vm.remove();
    await flushPromises();

    expect(w.text()).toContain("in use by a character");
    expect(push).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
