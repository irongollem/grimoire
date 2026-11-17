// What can be done to a creature without a weapon: whether words reach it, whether it can be frightened or charmed,
// and whether it ever gives in (#1021). The Dungeon Master at the AI table rules on a threat, a plea or a calming
// word in the middle of a fight, and needs something firmer than its own guess: a spun-glass construct was talked
// into standing down with a Persuasion check, and nothing said whether such a thing can be talked to at all.
//
// Everything here is read from what the stat block already says, the way a DM reads it at the table, plus the
// morale rule the tactics already use (`profile.ts`). A DM's own morale on the creature overrides the default.

import type { MonsterStatBlock, MonsterType } from "../../../types/monster.types.ts";
import { tacticalProfile } from "./profile.ts";

export interface Temper {
  kind: MonsterType | null;
  /**
   * `words`: it understands a language and has a will of its own, so it can be persuaded, deceived or bargained with.
   * `handling`: it understands no speech; it is calmed or driven the way an animal is (Wisdom (Animal Handling)).
   * `none`: words do not move it: it does what it was made or raised to do.
   */
  reached: "words" | "handling" | "none";
  frightened: boolean;
  charmed: boolean;
  /** Whether it ever gives in or flees. */
  yields: boolean;
}

/** RULE will-less: these do what they were made, grown or raised to do, whatever they understand. */
const WILL_LESS: readonly MonsterType[] = ["construct", "ooze", "plant"];
/** RULE will-less-undead: the mindless dead (Intelligence 5 or less: zombies, skeletons) obey; a wight or a vampire has a will. */
const MINDLESS_UNDEAD_INT = 5;
/** RULE handled: a creature of animal wits (Intelligence 3 or less) is reached by handling, not by argument. */
const ANIMAL_INT = 3;

/** Whether the Languages line names a language it understands ("—" and an empty line are none). */
function understandsSpeech(languages: string | undefined): boolean {
  if (languages === undefined) return false;
  const text = languages.trim().toLowerCase();
  return text !== "" && text !== "—" && text !== "-" && text !== "none";
}

export function temperOf(statBlock: MonsterStatBlock, creatureType: MonsterType | null): Temper {
  const immune = statBlock.defenses?.condition_immunities ?? [];
  const willLess =
    (creatureType !== null && WILL_LESS.includes(creatureType)) || (creatureType === "undead" && statBlock.int <= MINDLESS_UNDEAD_INT);
  const reached: Temper["reached"] = willLess ? "none" : statBlock.int <= ANIMAL_INT || !understandsSpeech(statBlock.languages) ? "handling" : "words";
  return {
    kind: creatureType,
    reached,
    frightened: !immune.includes("Frightened"),
    charmed: !immune.includes("Charmed"),
    // The same morale the creature fights by: a fearless type or a DM's own "fights to the death" never yields.
    yields: tacticalProfile(statBlock, creatureType).morale.then !== "fight_on",
  };
}

/** The temper in a line, for whoever rules on what is tried against the creature. */
export function temperLine(t: Temper): string {
  const reached =
    t.reached === "words"
      ? "can be reasoned with (Persuasion, Deception, Intimidation)"
      : t.reached === "handling"
        ? "understands no speech: only handling reaches it (Animal Handling), not argument"
        : "words do not move it: it does what it was made to do";
  const fear = t.frightened ? "can be frightened" : "cannot be frightened";
  const charm = t.charmed ? null : "cannot be charmed";
  const yields = t.yields ? "can be made to give in or flee" : "never gives in or flees";
  return [t.kind, reached, fear, charm, yields].filter((p): p is string => p !== null).join("; ");
}
