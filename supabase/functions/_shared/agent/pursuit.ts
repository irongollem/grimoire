import type { FightState } from "./fight.ts";
import { isRecord } from "./parse.ts";

/**
 * The fight that follows the party.
 *
 * Getting away ends a fight on the board, not the danger. The creatures that give chase are the same creatures:
 * when they catch the party the fight is started again where the party is, with those who followed, as the first
 * fight left them. Those who were down stay behind, and so do the ones that never leave their place.
 */

/** The foes still standing who may follow: every one but those whose nature keeps them at their place. */
export function followersOf(fight: FightState | null): string[] {
  if (fight === null) return [];
  return fight.fighters.filter((f) => f.side === "enemy" && f.hp > 0 && (f.nature === undefined || f.nature.pursuit !== "stays")).map((f) => f.name);
}

/** What ends at the start of the bearer's next turn, or with the fight that was left: not carried to the next one. */
const LEFT_BEHIND = new Set(["Dodging", "Disengaged", "Hidden"]);

/**
 * The fight's roster as it arrives where the party is caught: the played characters and the foes who followed,
 * with the hit points and the lasting conditions they left with. Nobody has a place on the new map or a place in
 * the order yet: they are seated and roll initiative again. Whoever was down, stayed, or only stood by is left out.
 */
export function carriedRoster(combatants: unknown, followers: readonly string[]): Record<string, unknown>[] {
  if (!Array.isArray(combatants)) return [];
  const follows = new Set(followers);
  return combatants.flatMap((raw: unknown): Record<string, unknown>[] => {
    if (!isRecord(raw)) return [];
    const player = raw.type === "player";
    if (!player) {
      if (raw.bystander === true || typeof raw.name !== "string" || !follows.has(raw.name)) return [];
      if (typeof raw.hp !== "number" || raw.hp <= 0) return [];
    }
    const conditions = Array.isArray(raw.conditions) ? raw.conditions.filter((c: unknown) => !(isRecord(c) && typeof c.name === "string" && LEFT_BEHIND.has(c.name))) : [];
    return [{ ...raw, position: null, initiative: null, conditions }];
  });
}

/** The lines of the table's state about who is on the party's heels. Nothing when nobody follows. */
export function pursuitLines(pursuit: FightState | null): string[] {
  const followers = followersOf(pursuit);
  if (pursuit === null || followers.length === 0) return [];
  const standing = pursuit.fighters.filter((f) => followers.includes(f.name));
  return [
    `Giving chase from the fight "${pursuit.name}" the party got away from: ${standing.map((f) => `${f.name} (${f.hp} of ${f.maxHp} hit points)`).join(", ")}. ` +
      "They are the same creatures, hurt as they were left. When they catch the party (it stops, hides badly, is cornered, or goes back), " +
      `start that fight again where the party is with start_fight and encounter_id ${pursuit.encounterId}: never put a new fight together for them. ` +
      "If the story shakes them off for good, they simply stop coming.",
  ];
}
