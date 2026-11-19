// The level plan on the Quests page (#1021 row 27, the Level Plan canvas): what the party's next levels wait on, and
// which prepared fight will be wrong for the level the party will have by then. Pure; the strip reads it.

import { encounterDifficulty, type DifficultyLookups, type DifficultySource } from "@/lib/encounters/difficulty";
import { levelForXp } from "@/types/party.types";
import type { DifficultyLabel } from "@/types/encounter.types";

/** A milestone as the plan reads it (`useLevelMilestones` gives these). */
export interface PlanMilestone {
  id: string;
  level: number;
  reachedAt: string | null;
}

export interface LevelStations<M extends PlanMilestone = PlanMilestone> {
  /** The highest milestone reached, shown quietly for where the party has come from. */
  reached: M | null;
  /** The next milestone, then the one after it: the two the table is playing toward. */
  upcoming: M[];
  /** The first level above every one set, when there is still one to set (an empty slot that asks for it). */
  open: number | null;
}

/** The plan's columns: the last level reached, the next two, and the first level nobody has set yet. */
export function levelStations<M extends PlanMilestone>(milestones: readonly M[], partyLevel: number | null): LevelStations<M> {
  const sorted = [...milestones].sort((a, b) => a.level - b.level);
  const reachedAll = sorted.filter((m) => m.reachedAt !== null);
  const upcoming = sorted.filter((m) => m.reachedAt === null).slice(0, 2);
  const highest = Math.max(partyLevel ?? 1, ...sorted.map((m) => m.level));
  return {
    reached: reachedAll.at(-1) ?? null,
    upcoming,
    open: highest < 20 ? highest + 1 : null,
  };
}

/** Only the extremes are worth a line: a fight that will likely kill them, or one not worth their time. */
const FLAGGED: ReadonlySet<DifficultyLabel> = new Set(["Trivial", "Deadly", "Legendary"]);

export interface FightFlag {
  encounterId: string;
  name: string;
  label: DifficultyLabel;
}

/**
 * The prepared fights of these quests that will be badly judged at `level`: the encounter's own rating (the same one
 * its page and the Encounters list show), with every character at that level. An encounter with no party of its own
 * is judged against the whole party, which is who will meet it. A finished one is past.
 */
export function fightFlags(input: {
  questIds: ReadonlySet<string>;
  links: ReadonlyArray<{ encounterId: string; questId: string }>;
  encounters: ReadonlyArray<DifficultySource & { id: string; name: string; is_finished: boolean }>;
  partyIds: readonly string[];
  level: number;
  lookups: DifficultyLookups;
}): FightFlag[] {
  const wanted = new Set(input.links.filter((l) => input.questIds.has(l.questId)).map((l) => l.encounterId));
  const atLevel: DifficultyLookups = { ...input.lookups, memberLevel: () => input.level };
  return input.encounters
    .filter((e) => wanted.has(e.id) && !e.is_finished)
    .flatMap((e) => {
      const source = e.party_member_ids.length > 0 ? e : { ...e, party_member_ids: [...input.partyIds] };
      const label = encounterDifficulty(source, atLevel).label;
      return FLAGGED.has(label) ? [{ encounterId: e.id, name: e.name, label }] : [];
    });
}

/** How a flagged fight is said: "Deadly for a level-4 party of four". */
export function flagText(flag: FightFlag, level: number, partySize: number): string {
  const verdict = flag.label === "Trivial" ? "Trivial" : flag.label === "Legendary" ? "Far beyond Deadly" : "Deadly";
  return `${verdict} for a level-${level} party of ${partySize === 1 ? "one" : NUMBER_WORDS[partySize] ?? partySize}`;
}

const NUMBER_WORDS: Record<number, string> = { 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight" };

export interface QuestWorth {
  questId: string;
  title: string;
  /** Null when the quest has no worth set. */
  xp: number | null;
  /** Each character's share, rounded down as the database gives it. */
  each: number | null;
  /** The level every character reaches with it, when it takes all of them up at least one. */
  bringsAllTo: number | null;
}

/**
 * What each open quest is worth to the party in an Experience campaign: the share each character gets (the database
 * rounds down, `20261119192723`), and the level all of them reach with it when it lifts everyone.
 */
export function questWorths(
  quests: ReadonlyArray<{ id: string; title: string; xp_reward: number | null }>,
  party: ReadonlyArray<{ level: number; experience_points: number }>,
): QuestWorth[] {
  return quests.map((q) => {
    if (q.xp_reward === null || party.length === 0) return { questId: q.id, title: q.title, xp: q.xp_reward, each: null, bringsAllTo: null };
    const each = Math.floor(q.xp_reward / party.length);
    const after = party.map((m) => levelForXp(m.experience_points + each));
    const lifted = party.every((m, i) => after[i] > m.level);
    return { questId: q.id, title: q.title, xp: q.xp_reward, each, bringsAllTo: lifted ? Math.min(...after) : null };
  });
}
