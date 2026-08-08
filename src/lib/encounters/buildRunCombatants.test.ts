import { describe, it, expect } from "vitest";
import { buildRunCombatants, legendaryActionCaps, type RunCombatantSources } from "./buildRunCombatants";
import type { CombatantDef } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";

const CAMPAIGN = "campaign-here";
const OTHER_CAMPAIGN = "campaign-elsewhere";

function statBlock(overrides: Partial<Monster["stat_block"]> = {}): Monster["stat_block"] {
  return {
    armor_class: 13,
    hit_points: "2d8+2",
    speed: "30 ft.",
    str: 10, dex: 14, con: 12, int: 6, wis: 10, cha: 8,
    challenge_rating: "1/2",
    ...overrides,
  };
}

/** A whole `Monster` row, not the narrowed shape the builder asks for — the
 *  cross-campaign cases below are only worth anything if what they hand over is
 *  what the app would hand over, `campaign_id` and all. */
function monster(overrides: Partial<Monster> = {}): Monster {
  return {
    id: "m-owlbear",
    user_id: "dm-1",
    campaign_id: null,
    name: "Owlbear",
    monster_type: "monstrosity",
    size: "large",
    alignment: "unaligned",
    habitat: null,
    source: null,
    tags: [],
    stat_block: statBlock(),
    notes: null,
    image_url: null,
    portrait_focal_point: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function slot(overrides: Partial<CombatantDef> = {}): CombatantDef {
  return {
    id: "def-1",
    monster_id: "m-owlbear",
    npc_id: null,
    count: 1,
    faction_id: "enemy",
    custom_name: null,
    ...overrides,
  };
}

function sources(overrides: Partial<RunCombatantSources> = {}): RunCombatantSources {
  return {
    encounter: {
      party_member_ids: [],
      companion_ids: [],
      party_member_factions: {},
      combatants: [slot()],
    },
    party: [],
    companions: [],
    monsters: [monster()],
    npcs: [],
    ...overrides,
  };
}

describe("buildRunCombatants", () => {
  // The reason this module exists. An encounter stores a monster id; the DM
  // may afterwards scope that monster to a different campaign. The fight was
  // still built around it, so it has to turn up — and the only thing standing
  // between the DM and a combatant that quietly never appears is that the
  // caller hands over an unscoped roster (#597).
  it("resolves a monster scoped to another campaign", () => {
    const combatants = buildRunCombatants(sources({
      monsters: [monster({ campaign_id: OTHER_CAMPAIGN })],
    }));
    expect(combatants).toHaveLength(1);
    expect(combatants[0]).toMatchObject({ monster_id: "m-owlbear", name: "Owlbear" });
  });

  it("resolves a monster with no campaign at all, and one scoped to this campaign", () => {
    for (const campaign_id of [null, CAMPAIGN]) {
      const combatants = buildRunCombatants(sources({ monsters: [monster({ campaign_id })] }));
      expect(combatants).toHaveLength(1);
    }
  });

  // The corollary, and the reason the roster is passed in rather than fetched:
  // an id with nothing behind it is skipped, because a deleted monster has no
  // stat block to run. If that ever fires for a merely out-of-scope monster,
  // some caller has stopped passing includeAllScopes.
  it("skips a combatant whose monster is not in the roster at all", () => {
    expect(buildRunCombatants(sources({ monsters: [] }))).toEqual([]);
  });

  it("expands count into separately numbered instances", () => {
    const combatants = buildRunCombatants(sources({
      encounter: {
        party_member_ids: [],
        companion_ids: [],
        party_member_factions: {},
        combatants: [slot({ count: 3 })],
      },
    }));
    expect(combatants.map((c) => c.name)).toEqual(["Owlbear 1", "Owlbear 2", "Owlbear 3"]);
    expect(new Set(combatants.map((c) => c.instance_id)).size).toBe(3);
  });

  it("takes HP, AC and initiative modifier from the stat block", () => {
    const combatants = buildRunCombatants(sources({
      monsters: [monster({ stat_block: statBlock({ hit_points: "4d8", armor_class: 17, dex: 18 }) })],
    }));
    expect(combatants[0]).toMatchObject({ max_hp: 18, hp: 18, ac: "17", dex_mod: 4 });
  });

  it("uses a custom name over the monster's own, singular and plural", () => {
    const one = buildRunCombatants(sources({
      encounter: {
        party_member_ids: [], companion_ids: [], party_member_factions: {},
        combatants: [slot({ custom_name: "Gorehoot" })],
      },
    }));
    expect(one[0]?.name).toBe("Gorehoot");

    const many = buildRunCombatants(sources({
      encounter: {
        party_member_ids: [], companion_ids: [], party_member_factions: {},
        combatants: [slot({ custom_name: "Gorehoot", count: 2 })],
      },
    }));
    expect(many.map((c) => c.name)).toEqual(["Gorehoot 1", "Gorehoot 2"]);
  });

  it("leaves out a party member the encounter lists but the party no longer has", () => {
    const combatants = buildRunCombatants(sources({
      encounter: {
        party_member_ids: ["pm-gone"], companion_ids: [], party_member_factions: {},
        combatants: [],
      },
    }));
    expect(combatants).toEqual([]);
  });

  it("benches a companion that is not combat_ready", () => {
    const companion = {
      id: "c-1",
      name: "Nibbles",
      current_hp: 5, max_hp: 5, ac: 12,
      conditions: [],
      combat_ready: false,
      portrait_url: null,
      portrait_focal_point: null,
    };
    const encounter = {
      party_member_ids: [], companion_ids: ["c-1"], party_member_factions: {}, combatants: [],
    };
    expect(buildRunCombatants(sources({ encounter, companions: [companion] }))).toEqual([]);
    expect(
      buildRunCombatants(sources({ encounter, companions: [{ ...companion, combat_ready: true }] })),
    ).toHaveLength(1);
  });
});

describe("legendaryActionCaps", () => {
  it("caps only the combatants whose stat block declares legendary actions", () => {
    const boss = monster({
      id: "m-lich",
      stat_block: statBlock({ legendary_actions: [{ name: "Cantrip", description: "…" }] }),
    });
    const combatants = buildRunCombatants(sources({
      encounter: {
        party_member_ids: [], companion_ids: [], party_member_factions: {},
        combatants: [slot(), slot({ id: "def-2", monster_id: "m-lich" })],
      },
      monsters: [monster(), boss],
    }));
    const caps = legendaryActionCaps(combatants, [monster(), boss]);
    const lich = combatants.find((c) => c.monster_id === "m-lich")!;
    expect(caps).toEqual({ [lich.instance_id]: 3 });
  });
});
