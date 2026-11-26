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

import { fetchHabitatLife, insertHabitat, insertHabitatLife, useHabitatEditing } from "./useCampaignHabitats";
import { fetchHabitats } from "@/lib/canon/canonCampaignReads";

function inSetup<T>(use: () => T): T {
  let result!: T;
  mount(defineComponent({ setup() { result = use(); return () => null; } }), { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } });
  return result;
}

beforeEach(() => {
  fake.reset();
  toasts.error.mockReset();
});

describe("insertHabitatLife", () => {
  // Bug: a book's creature (a text id) went in monster_id, a uuid FK the table refuses, or a creature the DM wrote went
  // in library_monster_id; exactly one of the two columns is set, and it is the one the source names.
  it.each([
    ["a library creature", true, "srd_owlbear", "library_monster_id", "monster_id"],
    ["a creature the DM wrote", false, "9c2e-uuid", "monster_id", "library_monster_id"],
  ] as const)("writes %s in %s and not in %s", async (_label, fromLibrary, recordId, column, other) => {
    await insertHabitatLife("c1", { habitatId: "h1", recordId, fromLibrary, percent: 0 });
    const [row] = fake.rows("campaign_habitat_life");
    expect(row[column]).toBe(recordId);
    expect(row[other] ?? null).toBeNull();
    expect(row.habitat_id).toBe("h1");
  });

  // Bug: a new creature took sort_order 0, or counted another habitat's rows, and jumped in the DM's list.
  it("puts a new creature after the last one in this habitat, not after another habitat's", async () => {
    fake.seed("campaign_habitat_life", [
      { id: "a", campaign_id: "c1", habitat_id: "h1", sort_order: 3 },
      { id: "b", campaign_id: "c1", habitat_id: "h2", sort_order: 9 },
    ]);
    await insertHabitatLife("c1", { habitatId: "h1", recordId: "srd_owlbear", fromLibrary: true, percent: 0 });
    expect(fake.rows("campaign_habitat_life").find((r) => r.library_monster_id === "srd_owlbear")?.sort_order).toBe(4);
  });
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

  // Bug: dropping a creature this reader may not name made the total not add up; passing null on let a generator be told "null".
  it("keeps a creature it may not read, marked unreadable with a placeholder name, and reads the share as a number", async () => {
    fake.seed("campaign_habitat_life_named", [
      { id: "a", campaign_id: "c1", habitat_id: "h1", sort_order: 1, percent: "12.50", record_id: "r", from_library: true, name: null },
      { id: "x", campaign_id: "c2", habitat_id: "h9", sort_order: 1, percent: "5", record_id: "r", from_library: true, name: "Elsewhere" },
    ]);
    const list = await fetchHabitatLife("c1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ readable: false, percent: 12.5, name: "A creature another DM listed" });
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
    fake.seed("campaign_habitat_life_named", [{ id: "a", campaign_id: "c1", habitat_id: "h1", sort_order: 0, percent: 60, record_id: "r", from_library: true, name: "Eel" }]);
    const { setLifePercent, life } = inSetup(useHabitatEditing);
    await flushPromises();
    fake.failNext("campaign_habitat_life", { message: "What lives in a habitat adds up to 130%", code: "23514" });
    setLifePercent("a", 90);
    await flushPromises();
    expect(toasts.error).toHaveBeenCalledWith("These shares would pass 100%.");
    expect(life.value.map((l) => l.percent)).toEqual([60]);
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
