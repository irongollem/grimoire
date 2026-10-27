import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/vue-query";
import { CLASS_EQUIPMENT } from "@/data/classEquipment";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: vi.fn() }));

import {
  replayStartingGrants,
  partitionBundleEntries,
  buildBackgroundEquipmentRows,
  buildStartingEquipmentPlan,
  parseStartingEquipmentPlan,
  type VaultEntry,
} from "./useCharacterEquipmentSeeding";

const CARRIER = "member-1";

describe("partitionBundleEntries", () => {
  it("routes plain items to a batched row and resolves their vault item_id", () => {
    const vaultMap = new Map<string, VaultEntry>([
      ["greataxe", { id: "11111111-1111-4111-8111-111111111111", bundle_items: null }],
      ["javelin", { id: "22222222-2222-4222-8222-222222222222", bundle_items: null }],
    ]);
    const { plainRows, packEntries } = partitionBundleEntries(
      [{ name: "Greataxe" }, { name: "Javelin", quantity: 4 }],
      vaultMap,
      CARRIER,
    );

    expect(packEntries).toEqual([]);
    expect(plainRows).toEqual([
      {
        item_id: "11111111-1111-4111-8111-111111111111", library_item_id: null, name: "Greataxe", quantity: 1,
        carried_by: CARRIER, location: "backpack",
        slot: null, is_container: false, container_id: null,
        is_attuned: false, is_equipped: false, notes: null,
        current_charges: null, is_identified: true, sort_order: 0,
      },
      {
        item_id: "22222222-2222-4222-8222-222222222222", library_item_id: null, name: "Javelin", quantity: 4,
        carried_by: CARRIER, location: "backpack",
        slot: null, is_container: false, container_id: null,
        is_attuned: false, is_equipped: false, notes: null,
        current_charges: null, is_identified: true, sort_order: 0,
      },
    ]);
  });

  it("routes entries with bundle_items to packEntries instead of batching them", () => {
    const vaultMap = new Map<string, VaultEntry>([
      ["explorer's pack", { id: "55555555-5555-4555-8555-555555555555", bundle_items: [{ name: "Bedroll", quantity: 1 }] }],
      ["rapier", { id: "44444444-4444-4444-8444-444444444444", bundle_items: null }],
    ]);
    const { plainRows, packEntries } = partitionBundleEntries(
      [{ name: "Rapier" }, { name: "Explorer's Pack" }],
      vaultMap,
      CARRIER,
    );

    expect(packEntries).toEqual([{ name: "Explorer's Pack" }]);
    expect(plainRows).toHaveLength(1);
    expect(plainRows[0].name).toBe("Rapier");
  });

  it("falls back to item_id: null for a name with no vault match, still batched", () => {
    const { plainRows, packEntries } = partitionBundleEntries(
      [{ name: "Homebrew Whatsit" }],
      new Map(),
      CARRIER,
    );
    expect(packEntries).toEqual([]);
    expect(plainRows[0]).toMatchObject({ item_id: null, name: "Homebrew Whatsit", quantity: 1 });
  });

  it("treats an entry whose vault match has an empty bundle_items array as plain", () => {
    const vaultMap = new Map<string, VaultEntry>([
      ["dagger", { id: "33333333-3333-4333-8333-333333333333", bundle_items: [] }],
    ]);
    const { plainRows, packEntries } = partitionBundleEntries([{ name: "Dagger" }], vaultMap, CARRIER);
    expect(packEntries).toEqual([]);
    expect(plainRows[0].item_id).toBe("33333333-3333-4333-8333-333333333333");
  });
});

describe("buildBackgroundEquipmentRows", () => {
  it("splits the background's free-text equipment into one plain row each", () => {
    const rows = buildBackgroundEquipmentRows(
      "a holy symbol, a prayer book, vestments, a set of common clothes, and a belt pouch containing 15 gp",
      CARRIER,
    );
    expect(rows.map((r) => r.name)).toEqual([
      "a holy symbol",
      "a prayer book",
      "vestments",
      "a set of common clothes",
      "a belt pouch containing 15 gp",
    ]);
    for (const row of rows) {
      expect(row.item_id).toBeNull();
      expect(row.quantity).toBe(1);
      expect(row.carried_by).toBe(CARRIER);
      expect(row.location).toBe("backpack");
      expect(row.is_container).toBe(false);
    }
  });

  it("returns no rows for empty equipment text", () => {
    expect(buildBackgroundEquipmentRows("", CARRIER)).toEqual([]);
    expect(buildBackgroundEquipmentRows("   ", CARRIER)).toEqual([]);
  });
});

describe("buildStartingEquipmentPlan", () => {
  it("keeps the class bundle choice and the background's item names", () => {
    expect(buildStartingEquipmentPlan({
      className: "Cleric", classChoice: "b", importClass: true,
      backgroundText: "A holy symbol, a prayer book", importBackground: true,
    })).toEqual({
      class_name: "Cleric", class_choice: "b", background_items: ["A holy symbol", "a prayer book"],
    });
  });

  it("leaves out what the player unticked, and is null when nothing is left", () => {
    expect(buildStartingEquipmentPlan({
      className: "Cleric", classChoice: "a", importClass: false,
      backgroundText: "A holy symbol", importBackground: false,
    })).toBeNull();
  });
});

describe("parseStartingEquipmentPlan", () => {
  it("round-trips what the wizard wrote", () => {
    const plan = { class_name: "Rogue", class_choice: "a" as const, background_items: ["A lockpick"] };
    expect(parseStartingEquipmentPlan(plan)).toEqual(plan);
  });

  it("ignores a bundle choice when no class was kept", () => {
    expect(parseStartingEquipmentPlan({ class_name: null, class_choice: "a", background_items: ["A lockpick"] })).toEqual({
      class_name: null, class_choice: null, background_items: ["A lockpick"],
    });
  });

  it("refuses a missing or malformed marker", () => {
    expect(parseStartingEquipmentPlan(undefined)).toBeNull();
    expect(parseStartingEquipmentPlan("a")).toBeNull();
    expect(parseStartingEquipmentPlan({ class_name: 3, background_items: "x" })).toBeNull();
  });
});

describe("replayStartingGrants", () => {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
const keysOf = () =>
  invalidate.mock.calls.map(([filters]) => (filters !== undefined && typeof filters !== "function" ? filters.queryKey : undefined));

  const marker = { class_name: null, class_choice: null, background_items: ["A lockpick", "A map"] };

  beforeEach(() => {
    fake.reset();
    invalidate.mockClear();
  });

  const seatCharacter = (classChoices: Record<string, unknown>) =>
    fake.seed("party_members", [{ id: "pm1", class_choices: classChoices }]);
  const choicesOf = () => fake.rows("party_members")[0]?.class_choices;

  it("grants the loadout into the table's inventory, takes the marker off, and keeps every other choice", async () => {
    seatCharacter({ starting_grants: marker, fighting_style: ["defense"] });

    expect(await replayStartingGrants("pm1", "camp-1", client)).toBe(true);

    expect(fake.rows("party_inventory")).toMatchObject([
      { name: "A lockpick", carried_by: "pm1", campaign_id: "camp-1", user_id: "user-1", location: "backpack" },
      { name: "A map", carried_by: "pm1", campaign_id: "camp-1" },
    ]);
    expect(choicesOf()).toEqual({ fighting_style: ["defense"] });
    expect(keysOf()).toContainEqual(["party-inventory"]);
  });

  it("grants only once: a second attach finds no marker and adds nothing", async () => {
    seatCharacter({ starting_grants: marker });
    await replayStartingGrants("pm1", "camp-1", client);
    expect(await replayStartingGrants("pm1", "camp-2", client)).toBe(false);
    expect(fake.rows("party_inventory")).toHaveLength(2);
  });

  it("does nothing for a character that never had a loadout", async () => {
    seatCharacter({ fighting_style: ["defense"] });
    expect(await replayStartingGrants("pm1", "camp-1", client)).toBe(false);
    expect(fake.rows("party_inventory")).toEqual([]);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("a class bundle is the one chosen, a or b", async () => {
    const [name] = Object.keys(CLASS_EQUIPMENT);
    const bundle = CLASS_EQUIPMENT[name!]!;
    for (const choice of ["a", "b"] as const) {
      fake.reset();
      seatCharacter({ starting_grants: { class_name: name, class_choice: choice, background_items: [] } });
      await replayStartingGrants("pm1", "camp-1", client);
      expect(fake.rows("party_inventory").map((r) => r.name).sort()).toEqual(bundle[choice].items.map((e) => e.name).sort());
    }
  });

  it("a failed write puts the marker back beside the other choices and leaves no half-granted rows, then throws", async () => {
    seatCharacter({ starting_grants: marker, fighting_style: ["defense"] });
    fake.failNext("party_inventory", { message: "quota" });

    await expect(replayStartingGrants("pm1", "camp-1", client)).rejects.toMatchObject({ message: "quota" });

    expect(choicesOf()).toEqual({ starting_grants: marker, fighting_style: ["defense"] });
    expect(fake.rows("party_inventory")).toEqual([]);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("a failure to claim the loadout is an error, not 'nothing to grant'", async () => {
    seatCharacter({ starting_grants: marker });
    fake.failNext("party_members", { message: "claim failed" }, { after: 1 });
    await expect(replayStartingGrants("pm1", "camp-1", client)).rejects.toMatchObject({ message: "claim failed" });
    expect(fake.rows("party_inventory")).toEqual([]);
  });

  it("when another attach claims the loadout between the read and the claim, this one grants nothing", async () => {
    seatCharacter({ starting_grants: marker });
    const from = fake.client.from.bind(fake.client);
    let touches = 0;
    const spy = vi.spyOn(fake.client, "from").mockImplementation((table: string) => {
      if (table === "party_members" && ++touches === 2) {
        // The other caller finished first: the marker is gone by the time this one tries to claim it.
        fake.reset();
        seatCharacter({});
      }
      return from(table);
    });
    try {
      expect(await replayStartingGrants("pm1", "camp-1", client)).toBe(false);
    } finally {
      spy.mockRestore();
    }
    expect(fake.rows("party_inventory")).toEqual([]);
  });

  it("takes back the rows that did land when a later write fails, so the retry does not grant them twice", async () => {
    // Rogue's first bundle holds a pack that is written on its own, after the plain rows.
    fake.seed("items", [{ id: "11111111-1111-4111-8111-111111111111", name: "Burglar's Pack", bundle_items: [{ name: "Bedroll", quantity: 1 }] }]);
    seatCharacter({ starting_grants: { class_name: "Rogue", class_choice: "a", background_items: [] } });
    fake.failNext("party_inventory", { message: "quota" }, { after: 1 });

    await expect(replayStartingGrants("pm1", "camp-1", client)).rejects.toMatchObject({ message: "quota" });

    expect(fake.rows("party_inventory")).toEqual([]);
    expect(choicesOf()).toMatchObject({ starting_grants: { class_name: "Rogue" } });
  });

  it("a failed read of the character is an error, not 'nothing to grant'", async () => {
    fake.failNext("party_members", { message: "boom" });
    await expect(replayStartingGrants("pm1", "camp-1", client)).rejects.toMatchObject({ message: "boom" });
  });
});
