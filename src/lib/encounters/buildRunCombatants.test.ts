import { describe, it, expect } from "vitest";
import { buildRunCombatants, legendaryActionCaps, type RunCombatantSources } from "./buildRunCombatants";
import type { CombatantDef } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import { initiativeModifier } from "@/rules/initiative";
import { emptyDefenses } from "@/types/statBlock.types";

const CAMPAIGN = "campaign-here";
const OTHER_CAMPAIGN = "campaign-elsewhere";

function statBlock(overrides: Partial<Monster["stat_block"]> = {}): Monster["stat_block"] {
  return {
    armor_class: 13,
    hit_points: "2d8+2",
    speed: "30 ft.",
    str: 10, dex: 14, con: 12, int: 6, wis: 10, cha: 8,
    challenge_rating: "1/2",
    defenses: emptyDefenses(),
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
    cutout_url: null,
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
    species: [],
    acFor: () => 10,
    jackFor: () => "none",
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

  it("brings a party member's beast form and portrait focus into the fight", () => {
    const form = { monster_id: "srd_wolf", beast_name: "Wolf", beast_image_url: null, beast_hp: 9, beast_max_hp: 11, beast_ac: "13", beast_dex: 10 };
    const member = {
      id: "pm-briar", name: "Briar", current_hp: 20, max_hp: 24, temp_hp: 0, conditions: [], curses: [],
      death_save_successes: 0, death_save_failures: 0, dex: 12, con: 12, wis: 10, cha: 8,
      species_id: null, subrace: null, ruleset: "2014" as const, class: null, subclass: null, ac_formula: null, class_choices: {}, portrait_url: null,
      portrait_focal_point: { x: 0.5, y: 0.25 }, wildshape_state: form,
      initiative_bonus: 0, proficiency_bonus: 2,
    };
    const [shaped] = buildRunCombatants(sources({
      encounter: { party_member_ids: ["pm-briar"], companion_ids: [], party_member_factions: {}, combatants: [] },
      party: [member],
    }));
    // A copy, so damage in the runner does not reach back into the query cache.
    expect(shaped?.wildshape).toEqual(form);
    expect(shaped?.wildshape).not.toBe(form);
    expect(shaped?.portrait_focal_point).toEqual({ x: 0.5, y: 0.25 });

    const [plain] = buildRunCombatants(sources({
      encounter: { party_member_ids: ["pm-briar"], companion_ids: [], party_member_factions: {}, combatants: [] },
      party: [{ ...member, wildshape_state: null }],
    }));
    expect(plain?.wildshape).toBeUndefined();
  });

  it("walks a party member in with the HP, temp HP, death saves and faction the sheet had", () => {
    const member = {
      id: "pm-briar", name: "Briar", current_hp: 7, max_hp: 24, temp_hp: 5, conditions: [{ name: "Prone" }], curses: [],
      death_save_successes: 2, death_save_failures: 1, dex: 14, con: 12, wis: 10, cha: 8,
      species_id: null, subrace: null, ruleset: "2014" as const, class: null, subclass: null, ac_formula: null, class_choices: {},
      portrait_url: null, portrait_focal_point: null, wildshape_state: null, initiative_bonus: 0, proficiency_bonus: 2,
    };
    const encounter = { party_member_ids: ["pm-briar"], companion_ids: [], party_member_factions: { "pm-briar": "neutral" }, combatants: [] };
    const [pc] = buildRunCombatants(sources({ encounter, party: [member] }));
    expect(pc).toMatchObject({
      instance_id: "p-pm-briar", type: "player", faction_id: "neutral", initiative: null,
      hp: 7, max_hp: 24, temp_hp: 5, death_saves: { successes: 2, failures: 1 }, dex_mod: 2,
    });
    expect(pc?.conditions).toEqual([{ name: "Prone" }]);
    // The runner edits its own copy; the query cache's array is not shared with it.
    expect(pc?.conditions).not.toBe(member.conditions);

    const [fresh] = buildRunCombatants(sources({
      encounter: { ...encounter, party_member_factions: {} },
      party: [{ ...member, temp_hp: 0, death_save_successes: 0, death_save_failures: 0 }],
    }));
    expect(fresh?.faction_id).toBe("players");
    expect(fresh?.temp_hp).toBeUndefined();
  });

  it("sits a companion on the party side unless the encounter says otherwise", () => {
    const companion = { id: "c-1", name: "Nibbles", current_hp: 5, max_hp: 5, ac: 12, conditions: [], combat_ready: true, companion_type: "familiar" as const, portrait_url: null, portrait_focal_point: null, size: "medium" as const };
    const encounter = { party_member_ids: [], companion_ids: ["c-1"], party_member_factions: {}, combatants: [] };
    const [plain] = buildRunCombatants(sources({ encounter, companions: [companion] }));
    expect(plain).toMatchObject({ instance_id: "c-c-1", companion_id: "c-1", faction_id: "players", ac: "12", hp: 5 });
    const [turned] = buildRunCombatants(sources({ encounter: { ...encounter, party_member_factions: { "c-1": "enemy" } }, companions: [companion] }));
    expect(turned?.faction_id).toBe("enemy");
  });

  it("starts a monster hidden, in its own faction, at its planned cell, as wide as its size", () => {
    const [orc, orc2] = buildRunCombatants(sources({
      encounter: {
        party_member_ids: [], companion_ids: [], party_member_factions: {},
        combatants: [slot({ faction_id: "neutral", count: 2, starting_positions: [{ x: 4, y: 7 }, null] })],
      },
      monsters: [monster({ image_url: "https://example.com/owlbear.webp" })],
    }));
    expect(orc).toMatchObject({ faction_id: "neutral", reveal_state: "hidden", position: { x: 4, y: 7 }, footprint: 2, portrait_url: "https://example.com/owlbear.webp", initiative: null });
    expect(orc2?.position).toBeNull();
  });

  it("falls back to 1 HP for a monster whose hit points do not parse, and to 10 HP and AC 10 for an NPC with no stat block", () => {
    const [m] = buildRunCombatants(sources({ monsters: [monster({ stat_block: statBlock({ hit_points: "" }) })] }));
    expect(m).toMatchObject({ hp: 1, max_hp: 1 });
    const npc = { id: "n-1", name: "Commoner", stat_block: null, portrait_url: null, portrait_focal_point: null, cutout_url: null, size: "medium" as const };
    const encounter = { party_member_ids: [], companion_ids: [], party_member_factions: {}, combatants: [slot({ id: "def-npc", monster_id: null, npc_id: "n-1", faction_id: "ally", count: 2, custom_name: "Guard" })] };
    const npcs = buildRunCombatants(sources({ encounter, npcs: [npc], monsters: [] }));
    expect(npcs.map((c) => c.name)).toEqual(["Guard 1", "Guard 2"]);
    expect(npcs[0]).toMatchObject({ instance_id: "n-def-npc-0", hp: 10, max_hp: 10, ac: "10", faction_id: "ally", reveal_state: "hidden", footprint: 1 });
  });

  it("snapshots the calculated AC, not a stored number", () => {
    const member = {
      id: "pm-briar", name: "Briar", current_hp: 20, max_hp: 24, temp_hp: 0, conditions: [], curses: [],
      death_save_successes: 0, death_save_failures: 0, dex: 12, con: 12, wis: 10, cha: 8,
      species_id: null, subrace: null, ruleset: "2014" as const, class: null, subclass: null, ac_formula: null, class_choices: {},
      portrait_url: null, portrait_focal_point: null, wildshape_state: null, initiative_bonus: 0, proficiency_bonus: 2,
    };
    const [pc] = buildRunCombatants(sources({
      encounter: { party_member_ids: ["pm-briar"], companion_ids: [], party_member_factions: {}, combatants: [] },
      party: [member],
      acFor: () => 18,
    }));
    expect(pc?.ac).toBe("18");
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

  it("bakes token_url from the monster's cutout, leaving it unset when there is none", () => {
    const withCutout = buildRunCombatants(sources({
      monsters: [monster({ cutout_url: "https://example.com/owlbear-cutout.webp" })],
    }));
    expect(withCutout[0].token_url).toBe("https://example.com/owlbear-cutout.webp");

    const withoutCutout = buildRunCombatants(sources({ monsters: [monster({ cutout_url: null })] }));
    expect(withoutCutout[0].token_url).toBeUndefined();
  });

  it("bakes token_url from the NPC's cutout, leaving it unset when there is none", () => {
    const npc = {
      id: "n-1",
      name: "Bartender",
      stat_block: statBlock(),
      portrait_url: null,
      portrait_focal_point: null,
      cutout_url: "https://example.com/bartender-cutout.webp",
      size: "medium" as const,
    };
    const encounter = {
      party_member_ids: [], companion_ids: [], party_member_factions: {},
      combatants: [slot({ id: "def-npc", monster_id: null, npc_id: "n-1" })],
    };
    const withCutout = buildRunCombatants(sources({ encounter, npcs: [npc], monsters: [] }));
    expect(withCutout[0].token_url).toBe("https://example.com/bartender-cutout.webp");

    const withoutCutout = buildRunCombatants(sources({
      encounter,
      npcs: [{ ...npc, cutout_url: null }],
      monsters: [],
    }));
    expect(withoutCutout[0].token_url).toBeUndefined();
  });

  // 2024 MM stat blocks list Initiative; an NPC built from one rolls it like a monster does.
  it("carries an NPC's listed initiative bonus onto its combatant, and none when the stat block lists none", () => {
    const npc = { id: "n-1", name: "Veteran", stat_block: statBlock({ initiative_bonus: 5 }), portrait_url: null, portrait_focal_point: null, cutout_url: null, size: "medium" as const };
    const encounter = {
      party_member_ids: [], companion_ids: [], party_member_factions: {},
      combatants: [slot({ id: "def-npc", monster_id: null, npc_id: "n-1" })],
    };
    expect(buildRunCombatants(sources({ encounter, npcs: [npc], monsters: [] }))[0].initiative_bonus).toBe(5);
    const plain = { ...npc, stat_block: statBlock() };
    expect(buildRunCombatants(sources({ encounter, npcs: [plain], monsters: [] }))[0].initiative_bonus).toBeNull();
  });

  it("benches a companion that is not combat_ready", () => {
    const companion = {
      id: "c-1",
      name: "Nibbles",
      current_hp: 5, max_hp: 5, ac: 12,
      conditions: [],
      combat_ready: false,
      companion_type: "familiar" as const,
      portrait_url: null,
      portrait_focal_point: null,
      size: "medium" as const,
    };
    const encounter = {
      party_member_ids: [], companion_ids: ["c-1"], party_member_factions: {}, combatants: [],
    };
    expect(buildRunCombatants(sources({ encounter, companions: [companion] }))).toEqual([]);
    expect(
      buildRunCombatants(sources({ encounter, companions: [{ ...companion, combat_ready: true }] })),
    ).toHaveLength(1);
  });

  // #1115: the row says ready (stale, or written before the check existed); a pet
  // listed on the encounter must still not become a combatant.
  it("never fields a pet, even one whose row says combat_ready", () => {
    const base = {
      name: "Nibbles", current_hp: 5, max_hp: 5, ac: 12, conditions: [], combat_ready: true,
      portrait_url: null, portrait_focal_point: null, size: "medium" as const,
    };
    const encounter = {
      party_member_ids: [], companion_ids: ["pet-1", "fam-1"], party_member_factions: {}, combatants: [],
    };
    const out = buildRunCombatants(sources({
      encounter,
      companions: [
        { ...base, id: "pet-1", companion_type: "pet" as const },
        { ...base, id: "fam-1", companion_type: "familiar" as const },
      ],
    }));
    expect(out.map((c) => c.companion_id)).toEqual(["fam-1"]);
  });
});

// PHB 2024 "Creature Size": Tiny 2½ ft, Small/Medium 5 ft, Large 10 ft, Huge 15 ft, Gargantuan 20 ft.
describe("buildRunCombatants: every creature takes its size (#1125 decision 13)", () => {
  const member = {
    id: "pm-1", name: "Pip", current_hp: 8, max_hp: 8, temp_hp: 0, conditions: [], curses: [],
    death_save_successes: 0, death_save_failures: 0, dex: 12, con: 12, wis: 10, cha: 8,
    species_id: "sp-halfling" as string | null, subrace: null as string | null,
    ruleset: "2014" as const, class: null, subclass: null, ac_formula: null, class_choices: {},
    portrait_url: null, portrait_focal_point: null, wildshape_state: null, initiative_bonus: 0, proficiency_bonus: 2,
  };
  const withMember = (over: Partial<typeof member>, species: RunCombatantSources["species"]) => buildRunCombatants(sources({
    encounter: { party_member_ids: ["pm-1"], companion_ids: [], party_member_factions: {}, combatants: [] },
    party: [{ ...member, ...over }],
    species,
  }))[0];

  it("a Huge NPC covers nine squares: three across, and keeps its size for later resizing", () => {
    const mammoth = { id: "n-1", name: "Mammoth", stat_block: null, portrait_url: null, portrait_focal_point: null, cutout_url: null, size: "huge" as const };
    const encounter = { party_member_ids: [], companion_ids: [], party_member_factions: {}, combatants: [slot({ id: "def-npc", monster_id: null, npc_id: "n-1" })] };
    const [npc] = buildRunCombatants(sources({ encounter, npcs: [mammoth], monsters: [] }));
    expect(npc).toMatchObject({ footprint: 3, size: "huge" });
  });

  it("a party member whose subrace is Small takes a Medium species' square, not its size", () => {
    const species = [{ id: "sp-halfling", size: "medium" as const, subraces: [{ name: "Lightfoot", description: "", traits: [], size: "small" as const }] }];
    expect(withMember({ subrace: "Lightfoot" }, species)).toMatchObject({ size: "small", footprint: 1 });
  });

  it("a species that is Large makes a Large character", () => {
    expect(withMember({}, [{ id: "sp-halfling", size: "large", subraces: null }])).toMatchObject({ size: "large", footprint: 2 });
  });

  it("a character with no species, or a species with no size, is Medium (app convention)", () => {
    expect(withMember({ species_id: null }, [])).toMatchObject({ size: "medium", footprint: 1 });
    expect(withMember({}, [{ id: "sp-halfling", size: null, subraces: null }])).toMatchObject({ size: "medium", footprint: 1 });
    expect(withMember({ species_id: "sp-gone" }, [{ id: "sp-halfling", size: "tiny", subraces: null }])).toMatchObject({ size: "medium", footprint: 1 });
  });

  it("a companion takes its own size", () => {
    const horse = { id: "c-1", name: "Warhorse", current_hp: 19, max_hp: 19, ac: 11, conditions: [], combat_ready: true, companion_type: "mount" as const, portrait_url: null, portrait_focal_point: null, size: "large" as const };
    const [comp] = buildRunCombatants(sources({
      encounter: { party_member_ids: [], companion_ids: ["c-1"], party_member_factions: {}, combatants: [] },
      companions: [horse],
    }));
    expect(comp).toMatchObject({ size: "large", footprint: 2 });
  });

  it("a monster bakes its size beside its footprint", () => {
    expect(buildRunCombatants(sources())[0]).toMatchObject({ size: "large", footprint: 2 });
  });
});

describe("legendaryActionCaps", () => {
  it("caps only the combatants whose stat block declares legendary actions", () => {
    const boss = monster({
      id: "m-lich",
      stat_block: statBlock({ legendary_actions: [{ name: "Cantrip", description: "…", structured: { kind: "other", source: "manual" } }] }),
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

// PHB 2014 "Initiative" is a DEX check; Alert adds +5; Jack of All Trades adds half proficiency (rounded down) to any check.
describe("buildRunCombatants: a character's initiative modifier matches their sheet (#1149)", () => {
  const hero: RunCombatantSources["party"][number] = {
    id: "pm-1", name: "Pip", current_hp: 8, max_hp: 8, temp_hp: 0, conditions: [], curses: [],
    death_save_successes: 0, death_save_failures: 0, dex: 14, con: 12, wis: 10, cha: 8,
    species_id: null, subrace: null,
    ruleset: "2014" as const, class: null, subclass: null, ac_formula: null, class_choices: {},
    portrait_url: null, portrait_focal_point: null, wildshape_state: null,
    initiative_bonus: 0, proficiency_bonus: 2,
  };
  const build = (member: RunCombatantSources["party"][number], jackFor: RunCombatantSources["jackFor"] = () => "none") =>
    buildRunCombatants(sources({
      encounter: { party_member_ids: ["pm-1"], companion_ids: [], party_member_factions: {}, combatants: [] },
      party: [member],
      jackFor,
    }))[0];

  it("an Alert character (DEX 14, +5) rolls +7, not +2", () => {
    // Bug: the runner rolled from dex_mod alone and lost Alert.
    const out = build({ ...hero, initiative_bonus: 5 });
    expect(out && initiativeModifier(out)).toBe(7);
  });

  it("a 2014 Bard 2 (DEX 16, PB 2) rolls +4: DEX +3 and Jack of All Trades +1", () => {
    // Bug: the runner lost Jack of All Trades.
    const out = build({ ...hero, dex: 16 }, () => "any_check");
    expect(out && initiativeModifier(out)).toBe(4);
  });

  it("a druid who walks in wild-shaped rolls with the form's DEX 15 (+2) plus Alert +5, not their own DEX", () => {
    const form = { monster_id: "srd_wolf", beast_name: "Wolf", beast_image_url: null, beast_hp: 11, beast_max_hp: 11, beast_ac: "13", beast_dex: 15 };
    const out = build({ ...hero, dex: 8, initiative_bonus: 5, wildshape_state: form });
    expect(out && initiativeModifier(out)).toBe(7);
  });
});
