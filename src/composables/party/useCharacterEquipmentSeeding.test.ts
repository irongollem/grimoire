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
  buildStartingEquipmentPlan,
  parseStartingEquipmentPlan,
} from "./useCharacterEquipmentSeeding";

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

  const marker = { class_name: null, class_choice: null, background_items: ["A dagger", "A map"] };

  beforeEach(() => {
    fake.reset();
    seedLibrary([{ name: "Dagger" }, { name: "Map" }]);
    invalidate.mockClear();
  });

  function seedLibrary(items: { name: string; id?: string; ruleset?: "2014" | "2024"; bundle_items?: { name: string; quantity?: number }[] }[]) {
    fake.seed("library_items", items.map(({ name, id, ruleset, bundle_items }) => ({
      id: id ?? name.toLowerCase().replaceAll(" ", "-"), name, ruleset: ruleset ?? null,
      source_document_key: ruleset ? `srd-${ruleset}` : "grimoire-bundled",
      bundle_items: bundle_items ?? null,
    })));
  }

  const seatCharacter = (classChoices: Record<string, unknown>) =>
    fake.seed("party_members", [{ id: "pm1", class_choices: classChoices, ruleset: "2024" }]);
  const choicesOf = () => fake.rows("party_members")[0]?.class_choices;

  it("grants the loadout into the table's inventory, takes the marker off, and keeps every other choice", async () => {
    seatCharacter({ starting_grants: marker, fighting_style: ["defense"] });

    expect(await replayStartingGrants("pm1", "camp-1", client)).toBe(true);

    expect(fake.rows("party_inventory")).toMatchObject([
      { name: "Dagger", library_item_id: "dagger", item_id: null, carried_by: "pm1", campaign_id: "camp-1", user_id: "user-1", location: "backpack" },
      { name: "Map", library_item_id: "map", item_id: null, carried_by: "pm1", campaign_id: "camp-1" },
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
      seedLibrary(bundle[choice].items);
      seatCharacter({ starting_grants: { class_name: name, class_choice: choice, background_items: [] } });
      await replayStartingGrants("pm1", "camp-1", client);
      expect(fake.rows("party_inventory").map((r) => r.name).sort()).toEqual(bundle[choice].items.map((e) => e.name).sort());
    }
  });

  it("links the character's edition of gear, alternate catalogue names, and pack contents", async () => {
    seatCharacter({ starting_grants: { class_name: "Cleric", class_choice: "a", background_items: ["A note from home"] } });
    seedLibrary([
      { name: "Scale Mail", id: "scale-2014", ruleset: "2014" },
      { name: "Scale Mail", id: "scale-2024", ruleset: "2024" },
      { name: "Crossbow, Light", id: "light-crossbow-2024", ruleset: "2024" },
      { name: "Priest's Pack", bundle_items: [{ name: "Candle", quantity: 10 }, { name: "Missing item" }] },
      { name: "Candle" },
    ]);

    await replayStartingGrants("pm1", "camp-1", client);

    const rows = fake.rows("party_inventory");
    expect(rows).toHaveLength(4);
    const pack = rows.find((row) => row.is_container);
    expect(pack).toMatchObject({ name: "Priest's Pack", library_item_id: "priest's-pack" });
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Scale Mail", library_item_id: "scale-2024" }),
      expect.objectContaining({ name: "Crossbow, Light", library_item_id: "light-crossbow-2024" }),
      expect.objectContaining({ name: "Candle", library_item_id: "candle", quantity: 10, container_id: pack?.id }),
    ]));
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
    seedLibrary([...CLASS_EQUIPMENT.Rogue!.a.items.filter((item) => item.name !== "Burglar's Pack"),
      { name: "Burglar's Pack", bundle_items: [{ name: "Bedroll", quantity: 1 }] },
      { name: "Bedroll" },
    ]);
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
