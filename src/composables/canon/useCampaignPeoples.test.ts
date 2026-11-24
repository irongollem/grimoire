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

import { fetchPeoples, insertPeople, usePeoplesEditing } from "./useCampaignPeoples";

function inSetup<T>(use: () => T): T {
  let result!: T;
  mount(defineComponent({ setup() { result = use(); return () => null; } }), { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } });
  return result;
}

const FOUR_COLUMNS = ["species_id", "library_species_id", "monster_id", "library_monster_id"] as const;

beforeEach(() => {
  fake.reset();
  toasts.error.mockReset();
});

describe("insertPeople", () => {
  // Bug: a record went in the wrong column (a library species id in species_id, a uuid FK), which the table refuses
  // or, worse, files under another kind. Exactly one of the four is set, and it is the one the kind and source name.
  it.each([
    ["a library species", { kind: "species", recordId: "srd_elf", fromLibrary: true }, "library_species_id"],
    ["a species the DM wrote", { kind: "species", recordId: "5b1f-uuid", fromLibrary: false }, "species_id"],
    ["a library creature", { kind: "creature", recordId: "srd_owlbear", fromLibrary: true }, "library_monster_id"],
    ["a creature the DM wrote", { kind: "creature", recordId: "9c2e-uuid", fromLibrary: false }, "monster_id"],
  ] as const)("writes %s in %s and in no other column", async (_label, who, column) => {
    await insertPeople("c1", { ...who, percent: 0 });
    const [row] = fake.rows("campaign_peoples");
    expect(row[column]).toBe(who.recordId);
    for (const other of FOUR_COLUMNS) if (other !== column) expect(row[other] ?? null).toBeNull();
    expect(row.percent).toBe(0);
    expect(row.campaign_id).toBe("c1");
  });

  // Bug: the new people took sort_order 0 and jumped to the top of the DM's list.
  it("puts a new people after the last one of this campaign, not after another campaign's", async () => {
    fake.seed("campaign_peoples", [
      { id: "a", campaign_id: "c1", sort_order: 3 },
      { id: "b", campaign_id: "c2", sort_order: 9 },
    ]);
    await insertPeople("c1", { kind: "species", recordId: "srd_elf", fromLibrary: true, percent: 0 });
    expect(fake.rows("campaign_peoples").find((r) => r.library_species_id === "srd_elf")?.sort_order).toBe(4);
  });
});

// Bug: a failed read of the last sort order was ignored, and the new people was written at 0 over the DM's order.
it("writes nothing when the last sort order cannot be read", async () => {
  fake.failNext("campaign_peoples", { message: "boom" });
  await expect(insertPeople("c1", { kind: "species", recordId: "srd_elf", fromLibrary: true, percent: 0 })).rejects.toThrow("boom");
  expect(fake.rows("campaign_peoples")).toEqual([]);
});

describe("fetchPeoples", () => {
  const named = (id: string, campaign_id: string, sort_order: number) => ({
    id, campaign_id, sort_order, percent: "12.50", kind: "species", record_id: `r-${id}`, from_library: true, name: `Name ${id}`,
  });

  // Bug (Client Reads): the read took every campaign the account's policy allows, so a DM of two worlds saw both lists.
  it("returns only the campaign's peoples, in order, with the share as a number", async () => {
    fake.seed("campaign_peoples_named", [named("b", "c1", 2), named("a", "c1", 1), named("x", "c2", 0)]);
    const list = await fetchPeoples("c1");
    expect(list.map((p) => p.id)).toEqual(["a", "b"]);
    expect(list[0]).toEqual({ id: "a", kind: "species", recordId: "r-a", fromLibrary: true, name: "Name a", readable: true, percent: 12.5 });
  });

  // Bug caught (the security audit, #1255): a species on a co-DM's own shelf has no name for this reader. Dropping the
  // row made the total not add up; passing null on let a generator be told "Race: null".
  it("keeps a people whose name it may not read, marked unreadable, with a placeholder for a name", async () => {
    fake.seed("campaign_peoples_named", [{ ...named("a", "c1", 1), name: null }]);
    const [row] = await fetchPeoples("c1");
    expect(row.readable).toBe(false);
    expect(row.name).toBe("A people another DM listed");
    expect(row.percent).toBe(12.5);
  });

  // Bug: the error was dropped, so a failed read looked like a world with nobody in it.
  it("throws a failed read instead of returning an empty list", async () => {
    fake.failNext("campaign_peoples_named", { message: "boom" });
    await expect(fetchPeoples("c1")).rejects.toThrow("boom");
  });
});

describe("the writes", () => {
  // Bug: the commit-time total (23514) surfaced as a raw database message instead of a plain sentence.
  it("says a total past 100 in plain words and keeps the cache as the server has it", async () => {
    fake.seed("campaign_peoples", [{ id: "a", campaign_id: "c1", sort_order: 0, percent: 60 }]);
    fake.seed("campaign_peoples_named", [{ id: "a", campaign_id: "c1", sort_order: 0, percent: 60, kind: "species", record_id: "r", from_library: true, name: "Elf" }]);
    const { setPercent, peoples } = inSetup(usePeoplesEditing);
    await flushPromises();
    fake.failNext("campaign_peoples", { message: "The peoples of a campaign add up to 130%", code: "23514" });
    setPercent("a", 90);
    await flushPromises();
    expect(toasts.error).toHaveBeenCalledWith("These shares would pass 100%.");
    expect(peoples.value.map((p) => p.percent)).toEqual([60]);
  });

  it("removes the row it is given and no other", async () => {
    fake.seed("campaign_peoples", [{ id: "a", campaign_id: "c1" }, { id: "b", campaign_id: "c1" }]);
    const { removePeople } = inSetup(usePeoplesEditing);
    removePeople("a");
    await flushPromises();
    expect(fake.rows("campaign_peoples").map((r) => r.id)).toEqual(["b"]);
  });
});
