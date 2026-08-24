import { describe, it, expect } from "vitest";
import type { Encounter } from "@/types/encounter.types";
import { deriveEncounterGapRows } from "./encounterGaps";

let seq = 0;

/** A fully-ready encounter — one combatant, a location, and an item reward. */
function baseEncounter(overrides: Partial<Encounter> = {}): Encounter {
  seq += 1;
  return {
    id: `encounter-${seq}`,
    user_id: "user-1",
    campaign_id: "campaign-1",
    name: `Encounter ${seq}`,
    description: null,
    party_member_ids: [],
    companion_ids: [],
    party_member_factions: {},
    combatants: [
      {
        id: "combatant-1",
        monster_id: "monster-1",
        npc_id: null,
        count: 1,
        faction_id: "enemy",
        custom_name: null,
      },
    ],
    factions: [],
    item_ids: ["item-1"],
    trap_ids: [],
    reward_currency_pools: [],
    art_objects: [],
    location_id: "location-1",
    is_finished: false,
    lair_enabled: false,
    lair_owner_def_id: null,
    audio_theme: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("deriveEncounterGapRows", () => {
  it("returns nothing for no encounters", () => {
    expect(deriveEncounterGapRows([])).toEqual([]);
  });

  it("excludes a complete encounter", () => {
    expect(deriveEncounterGapRows([baseEncounter()])).toEqual([]);
  });

  it("flags a missing location alone", () => {
    const encounter = baseEncounter({ location_id: null });
    const rows = deriveEncounterGapRows([encounter]);
    expect(rows).toEqual([
      { encounterId: encounter.id, encounterName: encounter.name, gaps: ["location"] },
    ]);
  });

  it("flags missing combatants alone", () => {
    const rows = deriveEncounterGapRows([baseEncounter({ combatants: [] })]);
    // Reward is not additionally flagged here even though item_ids is set on
    // the fixture's default — combatants is the only real signal, and it is
    // already reporting the stronger gap. (Covered explicitly below too.)
    expect(rows.map((r) => r.gaps)).toEqual([["combatants"]]);
  });

  it("flags a missing reward alone, on an otherwise-complete combat encounter", () => {
    const rows = deriveEncounterGapRows([baseEncounter({ item_ids: [], reward_currency_pools: [] })]);
    expect(rows.map((r) => r.gaps)).toEqual([["reward"]]);
  });

  it("names every missing piece when several are absent", () => {
    const rows = deriveEncounterGapRows([
      baseEncounter({ location_id: null, item_ids: [], reward_currency_pools: [] }),
    ]);
    expect(rows.map((r) => r.gaps)).toEqual([["location", "reward"]]);
  });

  it("does not flag a missing reward on an encounter with no combatants — a social encounter legitimately has none", () => {
    const rows = deriveEncounterGapRows([
      baseEncounter({ combatants: [], item_ids: [], reward_currency_pools: [] }),
    ]);
    // Only "combatants" — the kind-specific gap that does not apply here
    // (reward) stays silent rather than piling on.
    expect(rows.map((r) => r.gaps)).toEqual([["combatants"]]);
  });

  it("excludes a finished encounter even if every piece is missing", () => {
    const rows = deriveEncounterGapRows([
      baseEncounter({
        is_finished: true,
        combatants: [],
        location_id: null,
        item_ids: [],
        reward_currency_pools: [],
      }),
    ]);
    expect(rows).toEqual([]);
  });

  it("orders by the severity of the worst gap: combatants, then location, then reward", () => {
    const rewardGap = baseEncounter({ name: "Reward Gap", item_ids: [], reward_currency_pools: [] });
    const locationGap = baseEncounter({ name: "Location Gap", location_id: null });
    const combatantsGap = baseEncounter({ name: "Combatants Gap", combatants: [] });
    const rows = deriveEncounterGapRows([rewardGap, locationGap, combatantsGap]);
    expect(rows.map((r) => r.encounterName)).toEqual(["Combatants Gap", "Location Gap", "Reward Gap"]);
  });

  it("breaks a severity tie by the number of missing pieces, most-missing first", () => {
    const oneGap = baseEncounter({ name: "One Gap", location_id: null });
    const twoGaps = baseEncounter({ name: "Two Gaps", location_id: null, item_ids: [], reward_currency_pools: [] });
    const rows = deriveEncounterGapRows([oneGap, twoGaps]);
    expect(rows.map((r) => r.encounterName)).toEqual(["Two Gaps", "One Gap"]);
  });

  it("breaks a full tie by encounter name", () => {
    const zebra = baseEncounter({ name: "Zebra Ambush", location_id: null });
    const alpha = baseEncounter({ name: "Alpha Ambush", location_id: null });
    const rows = deriveEncounterGapRows([zebra, alpha]);
    expect(rows.map((r) => r.encounterName)).toEqual(["Alpha Ambush", "Zebra Ambush"]);
  });

  it("falls back to a name for an unnamed encounter", () => {
    const rows = deriveEncounterGapRows([baseEncounter({ name: "", location_id: null })]);
    expect(rows[0]?.encounterName).toBe("Unnamed Encounter");
  });
});
