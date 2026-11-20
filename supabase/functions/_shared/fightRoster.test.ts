import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake, type SupabaseFake } from "@/test/supabaseFake";
import type { Item } from "@/types/item.types";
import type { Monster } from "@/types/monster.types";
import type { NpcListRow } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";
import type { WildshapeState } from "@/types/encounter.types";
import { emptyDefenses } from "@/types/statBlock.types";
import { assembleRoster, loadRoster, type RosterEncounter, type RosterRows } from "./fightRoster";

const member = (id: string, over: Partial<PartyMember> = {}): PartyMember =>
  ({
    id, campaign_id: "c1", name: id, ruleset: "2014", class: "Fighter", subclass: null, current_hp: 10, max_hp: 10, temp_hp: 0, conditions: [], curses: [],
    death_save_successes: 0, death_save_failures: 0, str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 10, portrait_url: null, portrait_focal_point: null,
    wildshape_state: null, species_id: null, subrace: null, initiative_bonus: 0, proficiency_bonus: 2, ac_formula: null, class_choices: null, sort_order: 0,
    ai_speaks: false, ...over,
  }) as unknown as PartyMember;

const statBlock = (over: Partial<Monster["stat_block"]> = {}): Monster["stat_block"] =>
  ({ armor_class: 13, hit_points: "2d8+2", speed: "30 ft.", str: 10, dex: 14, con: 12, int: 6, wis: 10, cha: 8, challenge_rating: "1", defenses: emptyDefenses(), ...over });

const monster = (id: string, over: Partial<Monster> = {}): Monster =>
  ({ id, user_id: "dm", campaign_id: null, name: id, size: "medium", stat_block: statBlock(), image_url: null, cutout_url: null, portrait_focal_point: null, ...over }) as unknown as Monster;

const npc = (id: string, over: Partial<NpcListRow> = {}): NpcListRow =>
  ({
    id, name: id, stat_block: null, portrait_url: null, portrait_focal_point: null, cutout_url: null, size: "medium", location_id: null,
    disguise_name: null, disguise_portrait_url: null, disguise_portrait_focal_point: null, is_revealed: false, unmasked_at: null, ...over,
  }) as unknown as NpcListRow;

const encounter = (over: Partial<RosterEncounter> = {}): RosterEncounter => ({
  party_member_ids: [], companion_ids: [], party_member_factions: {}, location_id: "room",
  combatants: [{ id: "def-1", monster_id: "goblin", npc_id: null, count: 1, faction_id: "enemy", custom_name: null }],
  ...over,
});

const rows = (over: Partial<RosterRows> = {}): RosterRows => ({
  encounter: encounter({ party_member_ids: ["nessa", "tam"] }),
  party: [member("nessa"), member("tam")],
  memorials: [],
  companions: [],
  monsters: [monster("goblin")],
  npcs: [],
  species: [],
  wornGear: {},
  classRows: [],
  ...over,
});

const playerIds = (r: ReturnType<typeof assembleRoster>) => r.combatants.filter((c) => c.party_member_id).map((c) => c.party_member_id);

describe("assembleRoster: who is fielded", () => {
  // Bug: a character on the memorial wall fighting (the table reads their sheet as alive), or a restored one left out for ever.
  it("leaves out a member whose memorial is in effect and keeps one who was restored", () => {
    const r = assembleRoster(rows({
      memorials: [{ party_member_id: "nessa", restored_at: null }, { party_member_id: "tam", restored_at: "2026-11-01T00:00:00Z" }],
    }), null);
    expect(playerIds(r)).toEqual(["tam"]);
  });

  // Bug: the AI table fielding every party member the encounter lists (another player's sheet handed to a solo player), or leaving out
  // the allies the AI plays, or leaving the room's characters off the field.
  it("fields the played member and the AI's allies only, with the room's NPCs beside them", () => {
    const r = assembleRoster(rows({
      encounter: encounter({ party_member_ids: ["nessa", "tam", "ori"] }),
      party: [member("nessa"), member("tam", { ai_speaks: true }), member("ori")],
      npcs: [npc("innkeeper", { location_id: "room" }), npc("away", { location_id: "elsewhere" })],
    }), "nessa");
    expect(playerIds(r)).toEqual(["nessa", "tam"]);
    const helpers = r.combatants.filter((c) => c.instance_id.startsWith("b-"));
    expect(helpers.map((c) => c.npc_id)).toEqual(["innkeeper"]);
    expect(helpers[0]).toMatchObject({ bystander: true, faction_id: "players" });
  });

  // Bug: the DM's own fight pulling in the room's characters (the browser added bystanders only for the AI table), or dropping party members.
  it("fields the encounter's party and no bystanders in a DM's own fight", () => {
    const r = assembleRoster(rows({ npcs: [npc("innkeeper", { location_id: "room" })] }), null);
    expect(playerIds(r)).toEqual(["nessa", "tam"]);
    expect(r.combatants.some((c) => c.instance_id.startsWith("b-"))).toBe(false);
  });

  // Bug: a played member who has fallen taking a seat at the table.
  it("refuses a played member who is on the wall", () => {
    expect(() => assembleRoster(rows({ memorials: [{ party_member_id: "nessa", restored_at: null }] }), "nessa")).toThrow(/not an active member/);
  });
});

describe("assembleRoster: the numbers a combatant carries", () => {
  const sheet: Item = { id: "mail", user_id: "u", name: "Chain Mail", item_type: "armor", armor_class: "16", conceptual_key: "chain_mail" } as unknown as Item;
  const gear = { slot: "body" as const, attuned: false, item: sheet };
  const beast: WildshapeState = { monster_id: "bear", beast_name: "Bear", beast_image_url: null, beast_hp: 34, beast_max_hp: 34, beast_ac: "11", beast_dex: 10 };

  // Bug: playerArmorClass used in the roster: a Wild Shaped druid's combatant would start with the beast's AC in `ac`, and `wildshape`
  // would then apply it a second time (or never restore the druid's own). The rule: `ac` is the gear's (chain mail, 16), the form rides alongside.
  it("gives a member in Wild Shape the armour class of their gear, with the form beside it", () => {
    const r = assembleRoster(rows({
      encounter: encounter({ party_member_ids: ["nessa"] }),
      party: [member("nessa", { wildshape_state: beast })],
      wornGear: { nessa: [gear] },
    }), null);
    expect(r.combatants[0]).toMatchObject({ ac: "16", wildshape: { beast_ac: "11" } });
  });

  // Bug: the gear of one member counted for another (keyed wrongly): tam wears nothing, so 10 + Dex 14 (+2).
  it("works each member's armour class from their own gear", () => {
    const r = assembleRoster(rows({ wornGear: { nessa: [gear] } }), null);
    expect(r.combatants.filter((c) => c.party_member_id).map((c) => c.ac)).toEqual(["16", "12"]);
  });

  // Bug: Jack of All Trades not read from the class rows: initiative is an ability check, so a 2014 Bard at proficiency 4 adds half of it, 2.
  it("adds Jack of All Trades to a Bard's initiative, and only to the Bard", () => {
    const r = assembleRoster(rows({
      party: [member("nessa", { proficiency_bonus: 4 }), member("tam", { proficiency_bonus: 4 })],
      classRows: [
        { party_member_id: "nessa", capabilities: ["jack_of_all_trades"], levels: 2 },
        { party_member_id: "tam", capabilities: [], levels: 5 },
      ],
    }), null);
    expect(r.combatants.filter((c) => c.party_member_id).map((c) => c.initiative_extra)).toEqual([2, 0]);
  });

  // Bug: legendary caps left empty (the lair boss never gets its pool) or given to every monster.
  it("caps legendary actions at 3 for a monster with legendary actions and none for the rest", () => {
    const legendary = monster("dragon", { stat_block: statBlock({ legendary_actions: [{ name: "Tail", description: "x" }] as never }) });
    const r = assembleRoster(rows({
      encounter: encounter({
        party_member_ids: [],
        combatants: [
          { id: "d", monster_id: "dragon", npc_id: null, count: 1, faction_id: "enemy", custom_name: null },
          { id: "g", monster_id: "goblin", npc_id: null, count: 1, faction_id: "enemy", custom_name: null },
        ],
      }),
      monsters: [legendary, monster("goblin")],
    }), null);
    expect(r.legendaryCaps).toEqual({ "m-d-0": 3 });
  });
});

describe("loadRoster: every read stays in this campaign", () => {
  let fake: SupabaseFake;
  const CAMPAIGN_MONSTER = "22222222-2222-4222-8222-222222222222";
  const load = (played: string | null, enc: RosterEncounter) =>
    loadRoster(fake.client as unknown as SupabaseClient, { campaignId: "c1", userId: "dm1", encounter: enc }, played);

  beforeEach(() => {
    fake = createSupabaseFake();
    fake.seed("campaigns", [{ id: "c1", user_id: "dm1" }]);
    fake.seed("campaign_members", []);
    fake.seed("party_members", [
      { ...member("nessa"), campaign_id: "c1" },
      { ...member("tam"), campaign_id: "c1" },
      { ...member("stranger"), campaign_id: "c2" },
    ]);
    fake.seed("character_memorials", [{ party_member_id: "nessa", campaign_id: "c1", restored_at: null }]);
    fake.seed("library_monsters", [{ id: "srd_goblin", name: "Goblin", size: "small", stat_block: statBlock() }]);
    fake.seed("library_monster_art_canonical", [{ entry_id: "srd_goblin", image_url: "canon.png", cutout_url: null, portrait_focal_point: null }]);
    fake.seed("library_monster_art", [
      { entry_id: "srd_goblin", user_id: "someone-else", image_url: "theirs.png", cutout_url: null, portrait_focal_point: null },
      { entry_id: "srd_goblin", user_id: "dm1", image_url: "dm1.png", cutout_url: null, portrait_focal_point: null },
    ]);
    fake.seed("monsters", [{ ...monster(CAMPAIGN_MONSTER), campaign_id: "c2", user_id: "stranger" }]);
    fake.seed("npcs", [
      { ...npc("here", { location_id: "room" }), campaign_id: "c1" },
      { ...npc("there", { location_id: "room" }), campaign_id: "c2" },
    ]);
    fake.seed("companions", []);
    fake.seed("party_inventory", []);
    fake.seed("character_classes", []);
    fake.seed("species", []);
    fake.seed("library_species", []);
  });

  const goblinEncounter = (over: Partial<RosterEncounter> = {}) =>
    encounter({ combatants: [{ id: "d", monster_id: "srd_goblin", npc_id: null, count: 1, faction_id: "enemy", custom_name: null }], ...over });

  // Bug: the art override read without the caller's id: the service role returns every account's override, so another DM's picture
  // (or none, by row order) would be the goblin's portrait.
  it("takes the caller's own art override and never another account's", async () => {
    const r = await load(null, goblinEncounter());
    expect(r.combatants[0].portrait_url).toBe("dm1.png");
  });

  // Bug: another campaign's party member named by the encounter turning up in this fight with their sheet.
  it("never fields a party member of another campaign", async () => {
    const r = await load(null, goblinEncounter({ party_member_ids: ["stranger"] }));
    expect(r.combatants.map((c) => c.party_member_id)).toEqual([undefined]);
  });

  // Bug: the fallen read from another campaign's memorials (or not read at all): nessa is on the wall here and is not fielded.
  it("leaves out a member on this campaign's wall", async () => {
    const r = await load(null, goblinEncounter({ party_member_ids: ["nessa"] }));
    expect(r.combatants.some((c) => c.party_member_id === "nessa")).toBe(false);
  });

  // Bug: the room's NPCs read without the campaign: another campaign's character in the same-named room joins the party's side.
  it("seats the room's characters of this campaign only", async () => {
    const r = await load("tam", goblinEncounter({ party_member_ids: ["tam"] }));
    expect(r.combatants.filter((c) => c.instance_id.startsWith("b-")).map((c) => c.npc_id)).toEqual(["here"]);
  });

  // Bug: a custom monster of another campaign (and another account) named in the encounter turning up as a combatant.
  it("does not resolve another account's custom monster", async () => {
    const r = await load(null, encounter({ combatants: [{ id: "d", monster_id: CAMPAIGN_MONSTER, npc_id: null, count: 1, faction_id: "enemy", custom_name: null }] }));
    expect(r.combatants).toEqual([]);
  });

  // Bug: a failed read taken for "nobody": a fight opened with an empty party.
  it("throws a failed read", async () => {
    fake.failNext("party_members", { message: "down" });
    await expect(load(null, goblinEncounter())).rejects.toThrow(/party_members/);
  });
});
