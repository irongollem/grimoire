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

import { insertHabitat, useHabitatEditing } from "./useCampaignHabitats";
import { fetchHabitatLife, fetchHabitats } from "@/lib/canon/canonCampaignReads";

function inSetup<T>(use: () => T): T {
  let result!: T;
  mount(defineComponent({ setup() { result = use(); return () => null; } }), { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } });
  return result;
}

beforeEach(() => {
  fake.reset();
  toasts.error.mockReset();
});

describe("the reads", () => {
  // Bug (Client Reads): the read took every campaign the account's policy allows, so a DM of two worlds saw both.
  it("returns only the campaign's habitats, in order", async () => {
    fake.seed("campaign_habitats", [
      { id: "b", campaign_id: "c1", name: "Hills", description: null, sort_order: 2 },
      { id: "a", campaign_id: "c1", name: "Marsh", description: null, sort_order: 1 },
      { id: "x", campaign_id: "c2", name: "Desert", description: null, sort_order: 0 },
    ]);
    expect((await fetchHabitats("c1")).map((h) => h.name)).toEqual(["Marsh", "Hills"]);
  });

  // Bug: dropping a stat block this reader may not name made the total not add up; a null share read as 0 hid "worked out".
  it("keeps a form whose stat block it may not read, with a placeholder name, and keeps an empty share null", async () => {
    fake.seed("campaign_habitat_life_named", [
      { id: "a", campaign_id: "c1", habitat_id: "h1", species_id: "s1", form_id: "f1", sort_order: 1, percent: "12.50", record_id: "r", from_library: true, name: null, species_name: "Eel", form_label: "Adult" },
      { id: "b", campaign_id: "c1", habitat_id: "h1", species_id: "s1", form_id: "f2", sort_order: 2, percent: null, record_id: "r2", from_library: true, name: "Eel", species_name: "Eel", form_label: "Young" },
      { id: "x", campaign_id: "c2", habitat_id: "h9", species_id: "s9", form_id: "f9", sort_order: 1, percent: "5", record_id: "r", from_library: true, name: "Elsewhere", species_name: "E", form_label: "A" },
    ]);
    const list = await fetchHabitatLife("c1");
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ readable: false, percent: 12.5, name: "A creature another DM listed" });
    expect(list[1]).toMatchObject({ readable: true, percent: null, formId: "f2" });
  });

  // Bug: the error was dropped, so a failed read looked like a world with no habitats.
  it("throws a failed read instead of returning an empty list", async () => {
    fake.failNext("campaign_habitats", { message: "boom" });
    await expect(fetchHabitats("c1")).rejects.toThrow("boom");
  });

  it("writes nothing when the last sort order cannot be read", async () => {
    fake.failNext("campaign_habitats", { message: "boom" });
    await expect(insertHabitat("c1", "Marsh")).rejects.toThrow("boom");
    expect(fake.rows("campaign_habitats")).toEqual([]);
  });
});

describe("the writes", () => {
  // Bug: the commit-time total (23514) surfaced as a raw database message instead of a plain sentence.
  it("says shares past 100 in plain words and keeps what the server has", async () => {
    fake.seed("campaign_habitat_life", [{ id: "a", campaign_id: "c1", habitat_id: "h1", sort_order: 0, percent: 60 }]);
    fake.seed("campaign_habitat_life_named", [{ id: "a", campaign_id: "c1", habitat_id: "h1", species_id: "s", form_id: "f", sort_order: 0, percent: 60, record_id: "r", from_library: true, name: "Eel", species_name: "Eel", form_label: "Adult" }]);
    const { setFormPercent, life } = inSetup(useHabitatEditing);
    await flushPromises();
    fake.failNext("campaign_habitat_life", { message: "What lives in a habitat adds up to 130%", code: "23514" });
    setFormPercent("a", 90);
    await flushPromises();
    expect(toasts.error).toHaveBeenCalledWith("These shares would pass 100%.");
    expect(life.value.map((l) => l.percent)).toEqual([60]);
  });

  // Bug: "back to worked out" wrote 0 (or nothing), so the generator treated the form as the DM's own 0%.
  it("puts a form's share back to null", async () => {
    fake.seed("campaign_habitat_life", [{ id: "a", campaign_id: "c1", habitat_id: "h1", sort_order: 0, percent: 40 }]);
    const { setFormPercent } = inSetup(useHabitatEditing);
    setFormPercent("a", null);
    await flushPromises();
    expect(fake.rows("campaign_habitat_life")[0].percent).toBeNull();
  });

  // Bug: a write RLS refused (no row back) looked like a save.
  it("tells a share write that changed no row from a save", async () => {
    const { setFormPercent } = inSetup(useHabitatEditing);
    setFormPercent("ghost", 10);
    await flushPromises();
    expect(toasts.error).toHaveBeenCalledWith("That form is gone, or you may not change it.");
  });

  // Bug: a domesticated breed (a household cat) or a stage with no stat block went on the wild roll.
  it("puts only the wild forms with a stat block on the roll, with no share, when a species moves in", async () => {
    fake.seed("campaign_species_forms", [
      { id: "adult", campaign_id: "c1", species_id: "s1", stage_order: 1, domesticated: false, monster_id: "m1", library_monster_id: null },
      { id: "young", campaign_id: "c1", species_id: "s1", stage_order: 0, domesticated: false, monster_id: null, library_monster_id: null },
      { id: "pet", campaign_id: "c1", species_id: "s1", stage_order: 2, domesticated: true, monster_id: "m2", library_monster_id: null },
      { id: "other", campaign_id: "c1", species_id: "s2", stage_order: 0, domesticated: false, monster_id: "m3", library_monster_id: null },
      { id: "elsewhere", campaign_id: "c2", species_id: "s1", stage_order: 0, domesticated: false, monster_id: "m4", library_monster_id: null },
    ]);
    const { addHabitatSpecies } = inSetup(useHabitatEditing);
    addHabitatSpecies("h1", "s1");
    await flushPromises();
    expect(fake.rows("campaign_habitat_species")).toHaveLength(1);
    const roll = fake.rows("campaign_habitat_life");
    expect(roll.map((r) => r.form_id)).toEqual(["adult"]);
    expect(roll[0]).toMatchObject({ percent: null, species_id: "s1", habitat_id: "h1" });
  });

  // Bug: the species landing twice (23505) surfaced as a raw index name.
  it("says a species already living here in plain words", async () => {
    const { addHabitatSpecies } = inSetup(useHabitatEditing);
    await flushPromises();
    // The first call is the read of the last sort order; the refusal is the insert after it.
    fake.failNext("campaign_habitat_species", { message: "duplicate key", code: "23505" }, { after: 1 });
    addHabitatSpecies("h1", "s1");
    await flushPromises();
    expect(toasts.error).toHaveBeenCalledWith("That species already lives here.");
  });

  // Bug: "anything else" wrote into the wrong column, or 0 for "leave it to the generator".
  it("sets and clears the share for anything else", async () => {
    fake.seed("campaign_habitats", [{ id: "h1", campaign_id: "c1", name: "Marsh", description: null, sort_order: 0, other_percent: null }]);
    const { setOtherPercent } = inSetup(useHabitatEditing);
    setOtherPercent("h1", 15);
    await flushPromises();
    expect(fake.rows("campaign_habitats")[0].other_percent).toBe(15);
    setOtherPercent("h1", null);
    await flushPromises();
    expect(fake.rows("campaign_habitats")[0].other_percent).toBeNull();
  });

  // Bug: a habitat's read dropped other_percent, or turned the numeric string into NaN-prone text.
  it("reads the share for anything else as a number, or null", async () => {
    fake.seed("campaign_habitats", [
      { id: "a", campaign_id: "c1", name: "A", description: null, sort_order: 0, other_percent: "12.50" },
      { id: "b", campaign_id: "c1", name: "B", description: null, sort_order: 1, other_percent: null },
    ]);
    expect((await fetchHabitats("c1")).map((h) => h.otherPercent)).toEqual([12.5, null]);
  });

  // Bug: a place already in another habitat (23505) surfaced as the raw index name.
  it("says a place already in another habitat in plain words", async () => {
    const { addPlace } = inSetup(useHabitatEditing);
    await flushPromises();
    fake.failNext("campaign_habitat_places", { message: "duplicate key value violates unique constraint", code: "23505" });
    addPlace("h1", "loc1");
    await flushPromises();
    expect(toasts.error).toHaveBeenCalledWith("That place is already in another habitat.");
  });

  // Bug: moving one habitat swapped sort_order values, and two habitats that shared one never moved.
  it("reorders by position even when two habitats shared a sort order", async () => {
    fake.seed("campaign_habitats", [
      { id: "a", campaign_id: "c1", name: "A", description: null, sort_order: 0 },
      { id: "b", campaign_id: "c1", name: "B", description: null, sort_order: 0 },
    ]);
    const { reorderHabitats } = inSetup(useHabitatEditing);
    await flushPromises();
    reorderHabitats(["b", "a"]);
    await flushPromises();
    expect(fake.rows("campaign_habitats").find((r) => r.id === "b")?.sort_order).toBe(0);
    expect(fake.rows("campaign_habitats").find((r) => r.id === "a")?.sort_order).toBe(1);
  });
});
