/**
 * When a foe says something in a fight at the AI table (#1021 row 24).
 *
 * The maintainer, 18 Nov 2026: "smart enemies may speak and or mock players during a fight". A line is a turn of
 * the story: a model call, a few seconds and a credit or so, like a helper's turn (`helperTurn.ts`). So a foe does
 * not talk every turn. It speaks when the moment earns a line, the way a Dungeon Master gives a villain one:
 *   - it has just put the played character down;
 *   - it has just hit them hard (a quarter of their hit points or more in one turn);
 *   - one of its own side has fallen since its last turn;
 *   - it has been brought below half its hit points since its last turn;
 *   - it has just found out that what it does barely hurts its target (a defence shown this turn), which is also how
 *     the rest of its side comes to hear of it.
 * And never twice in a row: one line a round for the whole fight, and the same foe not again for two rounds after.
 * Whether a creature can speak at all is the server's to say (`speaksInAFight`: a mind and a tongue), on the turn
 * it reports. Pure: no I/O.
 */

/** Why a foe speaks. The server turns each into its own instruction; the page never sends words. */
export type FoeMoment = "dropped_you" | "hit_hard" | "ally_fell" | "badly_hurt" | "learned";

export const FOE_MOMENTS: readonly FoeMoment[] = ["dropped_you", "hit_hard", "ally_fell", "badly_hurt", "learned"];

/** A blow is hard when one turn takes this share of the played character's hit points. app convention. */
export const HARD_BLOW_SHARE = 0.25;
/** After speaking, a foe holds its tongue for this many rounds. app convention. */
export const FOE_QUIET_ROUNDS = 2;

/** What a foe saw of the fight when its turn last ended; `null` hit points before its first. */
export interface FoeSeen {
  hp: number | null;
  /** How many of its own side were standing. */
  alliesStanding: number;
}

export const FOE_NEVER_SEEN: FoeSeen = { hp: null, alliesStanding: 0 };

/** Who spoke last and when, for the whole fight. */
export interface FoeTalk {
  /** The round the last foe line was said in; null when none has been. */
  lastRound: number | null;
  /** The round each foe last spoke in, by instance id. */
  spokeIn: Readonly<Record<string, number>>;
}

export const NO_FOE_TALK: FoeTalk = { lastRound: null, spokeIn: {} };

export interface FoeTurnSeen {
  instanceId: string;
  /** The server's word that this creature has a mind and a tongue (`TurnTaken.speaks`). */
  speaks: boolean;
  round: number;
  /** The foe's own hit points now, after its turn. */
  hp: number;
  maxHp: number;
  alliesStanding: number;
  /** The played character before and after this foe's turn; null when nobody is played or they are not in the fight. */
  played: { hpBefore: number; hpAfter: number; maxHp: number } | null;
  /** How many defences the foe's targets had shown before its turn, and after it. */
  defencesShown: { before: number; after: number };
}

/**
 * The moment this foe's turn earned a line for, or null when it says nothing. The strongest moment wins: a foe
 * that drops the character and has lost a friend gloats, it does not grieve.
 */
export function foeMoment(now: FoeTurnSeen, last: FoeSeen, talk: FoeTalk, foesTalk = true): FoeMoment | null {
  // The player's switch, and the creature itself: a beast earns no line however hard it bites.
  if (!foesTalk || !now.speaks) return null;
  if (talk.lastRound === now.round) return null;
  const spoke = talk.spokeIn[now.instanceId];
  if (spoke !== undefined && now.round - spoke <= FOE_QUIET_ROUNDS) return null;
  if (now.played !== null && now.played.hpBefore > 0) {
    if (now.played.hpAfter <= 0) return "dropped_you";
    if (now.played.maxHp > 0 && (now.played.hpBefore - now.played.hpAfter) / now.played.maxHp >= HARD_BLOW_SHARE) return "hit_hard";
  }
  // Against what it last saw: on its first turn it has seen nothing fall and was never whole in front of us.
  if (last.hp !== null) {
    if (now.alliesStanding < last.alliesStanding) return "ally_fell";
    if (now.maxHp > 0 && now.hp * 2 < now.maxHp && last.hp * 2 >= now.maxHp) return "badly_hurt";
  }
  if (now.defencesShown.after > now.defencesShown.before) return "learned";
  return null;
}

/** The talk of the fight once this foe has spoken in this round. */
export function afterFoeSpoke(talk: FoeTalk, instanceId: string, round: number): FoeTalk {
  return { lastRound: round, spokeIn: { ...talk.spokeIn, [instanceId]: round } };
}
