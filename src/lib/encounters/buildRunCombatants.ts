import { sizeToFootprint } from "@/lib/battlemap/tokenFootprint";
import { hitPointsToMax } from "@/lib/dice/dice";
import type { Encounter, RunCombatant } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { Npc } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";
import type { Companion } from "@/types/companion.types";

/**
 * An encounter definition + the DM's rosters → the combatant list the runner
 * starts a fight with.
 *
 * Extracted from EncounterRunView so the resolution rule below is testable.
 * Every roster passed in must be UNSCOPED (`includeAllScopes`): an encounter's
 * `combatants[].monster_id` is a stored reference that outlives any later
 * scoping decision, so resolving it against a campaign-filtered bestiary would
 * drop a creature the DM deliberately put in this fight — with no error, no
 * toast, and nobody noticing until the party asks what happened to the second
 * owlbear (#597).
 *
 * A reference that resolves to nothing is still skipped rather than faked: a
 * monster that was genuinely deleted has no stat block to run.
 */
/* The rosters are narrowed to the fields the runner actually reads. Two things
 * fall out of that, both wanted: a test can state a case in six lines instead
 * of constructing a sixty-field PartyMember to assert something about two of
 * them, and `campaign_id` is not in scope here at all — so no future edit can
 * quietly reintroduce a scope filter inside the builder. A real row satisfies
 * these by construction. */
type RunPartyMember = Pick<
  PartyMember,
  | "id" | "name" | "current_hp" | "max_hp" | "temp_hp" | "ac" | "conditions" | "curses"
  | "death_save_successes" | "death_save_failures" | "dex" | "portrait_url"
>;

type RunCompanionSource = Pick<
  Companion,
  | "id" | "name" | "current_hp" | "max_hp" | "ac" | "conditions" | "combat_ready"
  | "portrait_url" | "portrait_focal_point"
>;

type RunMonsterSource = Pick<
  Monster,
  "id" | "name" | "size" | "stat_block" | "image_url" | "portrait_focal_point"
>;

type RunNpcSource = Pick<Npc, "id" | "name" | "stat_block" | "portrait_url" | "portrait_focal_point">;

export interface RunCombatantSources {
  encounter: Pick<
    Encounter,
    "party_member_ids" | "companion_ids" | "party_member_factions" | "combatants"
  >;
  party: RunPartyMember[];
  companions: RunCompanionSource[];
  /** Custom + library monsters, unscoped. */
  monsters: RunMonsterSource[];
  npcs: RunNpcSource[];
}

export function buildRunCombatants({
  encounter,
  party,
  companions,
  monsters,
  npcs,
}: RunCombatantSources): RunCombatant[] {
  const combatants: RunCombatant[] = [];

  for (const memberId of encounter.party_member_ids) {
    const member = party.find((m) => m.id === memberId);
    if (!member) continue;
    combatants.push({
      instance_id: `p-${member.id}`,
      type: "player",
      name: member.name,
      faction_id: encounter.party_member_factions?.[member.id] ?? "players",
      // Start every encounter with a blank initiative so players roll fresh each
      // time (and the DM can roll for any who don't). We deliberately no longer
      // seed from the persistent party_members.current_initiative, which carried
      // stale values between encounters. See #504.
      initiative: null,
      hp: member.current_hp,
      max_hp: member.max_hp,
      // Temp HP the character walked in with (Aid, Inspiring Leader, a fiend
      // warlock's kills) has to come along, or the runner shows none and the
      // first HP write persists temp_hp: 0 back over it.
      temp_hp: member.temp_hp > 0 ? member.temp_hp : undefined,
      ac: String(member.ac),
      conditions: [...(member.conditions ?? [])],
      curses: [...(member.curses ?? [])],
      death_saves: {
        successes: member.death_save_successes ?? 0,
        failures: member.death_save_failures ?? 0,
      },
      party_member_id: member.id,
      dex_mod: Math.floor(((member.dex ?? 10) - 10) / 2),
      portrait_url: member.portrait_url ?? null,
      portrait_focal_point: null, // party members don't store focal_point yet
    });
  }

  for (const compId of encounter.companion_ids ?? []) {
    const comp = companions.find((c) => c.id === compId);
    if (!comp) continue;
    // Benched ("elsewhere") companions sit out combat entirely until the DM or
    // player flips them back to "with the party" (#569).
    if (comp.combat_ready === false) continue;
    combatants.push({
      instance_id: `c-${comp.id}`,
      type: "player",
      name: comp.name,
      faction_id: encounter.party_member_factions?.[comp.id] ?? "players",
      initiative: null,
      hp: comp.current_hp,
      max_hp: comp.max_hp,
      ac: String(comp.ac),
      conditions: [...comp.conditions],
      curses: [],
      death_saves: { successes: 0, failures: 0 },
      dex_mod: 0,
      portrait_url: comp.portrait_url ?? null,
      portrait_focal_point: comp.portrait_focal_point ?? null,
      companion_id: comp.id,
    });
  }

  for (const entry of encounter.combatants) {
    if (entry.monster_id) {
      const monster = monsters.find((m) => m.id === entry.monster_id);
      if (!monster) continue;
      const sb = monster.stat_block;
      const maxHp = hitPointsToMax(sb?.hit_points, 1);
      const dex = Number(sb?.dex ?? 10);
      const dexMod = Math.floor((dex - 10) / 2);
      const ac = String(sb?.armor_class ?? 10);
      for (let i = 0; i < entry.count; i++) {
        const displayName =
          entry.count > 1
            ? `${entry.custom_name || monster.name} ${i + 1}`
            : entry.custom_name || monster.name;
        combatants.push({
          instance_id: `m-${entry.id}-${i}`,
          type: "monster",
          name: displayName,
          faction_id: entry.faction_id,
          initiative: null,
          hp: maxHp,
          max_hp: maxHp,
          ac,
          conditions: [],
          curses: [],
          death_saves: { successes: 0, failures: 0 },
          monster_id: monster.id,
          def_id: entry.id,
          dex_mod: dexMod,
          initiative_bonus: sb?.initiative_bonus ?? null,
          reveal_state: "hidden",
          portrait_url: monster.image_url ?? null,
          portrait_focal_point: monster.portrait_focal_point ?? null,
          position: entry.starting_positions?.[i] ?? null,
          footprint: sizeToFootprint(monster.size),
        });
      }
    } else if (entry.npc_id) {
      const npc = npcs.find((n) => n.id === entry.npc_id);
      if (!npc) continue;
      const sb = npc.stat_block;
      const maxHp = hitPointsToMax(sb?.hit_points, 10);
      const dex = Number(sb?.dex ?? 10);
      const dexMod = Math.floor((dex - 10) / 2);
      const ac = String(sb?.armor_class ?? 10);
      for (let i = 0; i < entry.count; i++) {
        const displayName =
          entry.count > 1
            ? `${entry.custom_name || npc.name} ${i + 1}`
            : entry.custom_name || npc.name;
        combatants.push({
          instance_id: `n-${entry.id}-${i}`,
          type: "monster",
          name: displayName,
          faction_id: entry.faction_id,
          initiative: null,
          hp: maxHp,
          max_hp: maxHp,
          ac,
          conditions: [],
          curses: [],
          death_saves: { successes: 0, failures: 0 },
          npc_id: npc.id,
          def_id: entry.id,
          dex_mod: dexMod,
          reveal_state: "hidden",
          portrait_url: npc.portrait_url ?? null,
          portrait_focal_point: npc.portrait_focal_point ?? null,
          position: entry.starting_positions?.[i] ?? null,
          footprint: 1,
        });
      }
    }
  }

  return combatants;
}

/**
 * Legendary-action caps for the combatants whose stat block declares any.
 * 3 per 5e RAW; if a stat block ever declares `legendary_action_uses` we'd read
 * that instead, but the hard default keeps things simple until it does.
 */
export function legendaryActionCaps(
  combatants: RunCombatant[],
  monsters: Pick<Monster, "id" | "stat_block">[],
): Record<string, number> {
  const caps: Record<string, number> = {};
  for (const c of combatants) {
    if (!c.monster_id) continue;
    const monster = monsters.find((m) => m.id === c.monster_id);
    if (monster?.stat_block?.legendary_actions?.length) {
      caps[c.instance_id] = 3;
    }
  }
  return caps;
}
