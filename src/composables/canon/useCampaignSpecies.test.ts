import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const toasts = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/lib/toast", () => ({ toast: { error: toasts.error, fromError: (e: unknown) => (e instanceof Error ? e.message : "failed") } }));

import { useCampaignSpecies, useSpeciesEditing } from "./useCampaignSpecies";

function inSetup<T>(use: () => T): T {
  let result!: T;
  mount(defineComponent({ setup() { result = use(); return () => null; } }), { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } });
  return result;
}

beforeEach(() => {
  fake.reset();
  toasts.error.mockReset();
});

describe("the field guide reads", () => {
  // Bug (Client Reads): a read without the campaign scope showed another campaign's species; forms must also sort by stage.
  it("returns only this campaign's species and clades, forms in stage order", async () => {
    fake.seed("campaign_species", [
      { id: "b", campaign_id: "c1", name: "Heron", sort_order: 1, kingdom: "animal", seasons: {} },
      { id: "a", campaign_id: "c1", name: "Eel", sort_order: 0, kingdom: "animal", seasons: {} },
      { id: "x", campaign_id: "c2", name: "Elsewhere", sort_order: 0, kingdom: "animal", seasons: {} },
    ]);
    fake.seed("campaign_clades", [{ id: "k1", campaign_id: "c1", name: "Fish", sort_order: 0 }, { id: "k2", campaign_id: "c2", name: "Other", sort_order: 0 }]);
    fake.seed("campaign_species_forms", [
      { id: "f2", campaign_id: "c1", species_id: "a", label: "Old", stage_order: 2, domesticated: false },
      { id: "f1", campaign_id: "c1", species_id: "a", label: "Young", stage_order: 1, domesticated: false },
      { id: "fx", campaign_id: "c2", species_id: "x", label: "Adult", stage_order: 0, domesticated: false },
    ]);
    const r = inSetup(useCampaignSpecies);
    await flushPromises();
    expect(r.species.value.map((s) => s.name)).toEqual(["Eel", "Heron"]);
    expect(r.clades.value.map((c) => c.name)).toEqual(["Fish"]);
    expect(r.forms.value.map((f) => f.label)).toEqual(["Young", "Old"]);
    expect(r.ready.value).toBe(true);
  });

  // Bug: a failed read looked like an empty guide (ready true with nothing, no error).
  it("reports a failed read as an error", async () => {
    fake.failNext("campaign_species", { message: "boom" });
    const r = inSetup(useCampaignSpecies);
    await flushPromises();
    expect(r.isError.value).toBe(true);
  });

  // Bug: stat block names were read for every monster, not the forms' own; an unreadable one must stay null, not "".
  it("names each form's stat block, own or library, and leaves an unreadable one null", async () => {
    fake.seed("campaign_species_forms", [
      { id: "f1", campaign_id: "c1", species_id: "a", label: "Adult", stage_order: 0, domesticated: false, monster_id: "m1", library_monster_id: null },
      { id: "f2", campaign_id: "c1", species_id: "a", label: "Young", stage_order: 1, domesticated: false, monster_id: null, library_monster_id: "srd_eel" },
      { id: "f3", campaign_id: "c1", species_id: "a", label: "Egg", stage_order: 2, domesticated: false, monster_id: "m-co-dm", library_monster_id: null },
      { id: "f4", campaign_id: "c1", species_id: "a", label: "Ghost", stage_order: 3, domesticated: false, monster_id: null, library_monster_id: null },
    ]);
    fake.seed("monsters", [{ id: "m1", name: "Marsh Eel" }, { id: "unrelated", name: "Dragon" }]);
    fake.seed("library_monsters", [{ id: "srd_eel", name: "Giant Eel" }]);
    const r = inSetup(useCampaignSpecies);
    await flushPromises();
    await flushPromises();
    expect(Object.fromEntries(r.statBlockNameByForm.value)).toEqual({ f1: "Marsh Eel", f2: "Giant Eel", f3: null, f4: null });
  });
});

describe("the field guide writes", () => {
  // Bug: a removed form stayed in the list until a manual reload (no refresh after the write).
  it("removes a form and re-reads", async () => {
    fake.seed("campaign_species_forms", [{ id: "f1", campaign_id: "c1", species_id: "a", label: "Adult", stage_order: 0, domesticated: false }]);
    const { removeForm, forms } = inSetup(useSpeciesEditing);
    await flushPromises();
    expect(forms.value).toHaveLength(1);
    await removeForm("f1");
    await flushPromises();
    expect(forms.value).toHaveLength(0);
  });

  // Bug: a new form took stage 0 and jumped before the existing ones, or counted another species' stages.
  it("puts a new form after this species' last stage, not another species'", async () => {
    fake.seed("campaign_species_forms", [
      { id: "f1", campaign_id: "c1", species_id: "a", label: "Adult", stage_order: 3 },
      { id: "f2", campaign_id: "c1", species_id: "b", label: "Adult", stage_order: 9 },
    ]);
    const { addForm } = inSetup(useSpeciesEditing);
    await addForm("a", { label: "Old", monsterId: "m1" });
    const row = fake.rows("campaign_species_forms").find((r) => r.label === "Old");
    expect(row).toMatchObject({ stage_order: 4, species_id: "a", monster_id: "m1", library_monster_id: null, domesticated: false });
  });

  // Bug: the unique stat block refusal (23505) surfaced as a raw index name.
  it("says a stat block already used in plain words", async () => {
    const { addForm } = inSetup(useSpeciesEditing);
    await flushPromises();
    // The first call is the read of the last stage; the refusal is the insert after it.
    fake.failNext("campaign_species_forms", { message: "dup", code: "23505" }, { after: 1 });
    const id = await addForm("a", { label: "Adult", monsterId: "m1" });
    expect(id).toBeNull();
    expect(toasts.error).toHaveBeenCalledWith("That stat block is already a form of another species.");
  });

  // Bug: the cycle refusal (23514) surfaced as a raw trigger message.
  it("says a clade inside itself in plain words", async () => {
    fake.seed("campaign_clades", [{ id: "k1", campaign_id: "c1", name: "Fish", sort_order: 0 }]);
    const { updateClade } = inSetup(useSpeciesEditing);
    await flushPromises();
    fake.failNext("campaign_clades", { message: "cycle", code: "23514" });
    await updateClade("k1", { parentId: "k1" });
    expect(toasts.error).toHaveBeenCalledWith("A clade cannot be inside itself.");
  });

  // Bug: a patch that left a field out wrote undefined/null over it (the camelCase keys were also mapped to the wrong columns).
  it("updates only the fields the patch names, in their column names", async () => {
    fake.seed("campaign_species", [{ id: "a", campaign_id: "c1", name: "Eel", scientific_name: "Anguilla", lives_as: "herd", sort_order: 0 }]);
    const { updateSpecies } = inSetup(useSpeciesEditing);
    await updateSpecies("a", { cladeId: "k1", activity: "night" });
    expect(fake.rows("campaign_species")[0]).toMatchObject({ name: "Eel", scientific_name: "Anguilla", lives_as: "herd", clade_id: "k1", activity: "night" });
  });

  // Bug: a write RLS refused (no row back) looked like a save.
  it("tells an update that changed no row from a save", async () => {
    const { updateSpecies } = inSetup(useSpeciesEditing);
    await updateSpecies("ghost", { name: "X" });
    expect(toasts.error).toHaveBeenCalledWith("That species is gone, or you may not change it.");
  });

  // Bug: reordering swapped neighbours, so two species sharing a sort_order never moved.
  it("reorders species by position", async () => {
    fake.seed("campaign_species", [
      { id: "a", campaign_id: "c1", name: "A", sort_order: 0 },
      { id: "b", campaign_id: "c1", name: "B", sort_order: 0 },
    ]);
    const { reorderSpecies } = inSetup(useSpeciesEditing);
    await reorderSpecies(["b", "a"]);
    const order = Object.fromEntries(fake.rows("campaign_species").map((r) => [r.id, r.sort_order]));
    expect(order).toEqual({ b: 0, a: 1 });
  });
});
