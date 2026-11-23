import { clockFilled } from "@/composables/canon/useCanonForces";
import { openThreads, type BackstoryThreadLink } from "@/lib/canon/backstoryThreads";
import { isPlayersPassage } from "@/lib/canon/canonBackstory";
import { unreviewedCount } from "@/lib/canon/canonTableFacts";
import type { StoryFact } from "@/lib/table/solo/storyRecord";
import type { CanonClue, CanonEntry, CanonForceStep, CanonForceTick, CanonLorePassage } from "@/types/canon.types";
import type { PartyMember } from "@/types/party.types";

/**
 * "Tonight" (#1255 item 14): what a DM needs for the next session, gathered from the canon and nothing new stored. Pure:
 * it takes the rows the Canon page already reads and returns the five blocks' data. Names of places, people and beats
 * are the view's to look up (`useClueWhere`); here a place is only its ids.
 */

/** Where something comes out: at most one of the three is set, as on a clue and a passage. */
export type TonightWhere = Pick<CanonClue, "location_id" | "npc_id" | "quest_beat_id">;

export interface TonightGroup<T> {
  /** Null for what lies nowhere yet; such a group is always last. */
  at: TonightWhere | null;
  items: T[];
}

export interface TonightLore {
  passageId: string;
  passageTitle: string;
  entryId: string;
  entryTitle: string;
}

export interface TonightClue {
  clueId: string;
  title: string;
  secretId: string;
  secretTitle: string;
}

export interface TonightForce {
  entryId: string;
  title: string;
  /** The first step not reached, in order; null when none is written (or all are reached). */
  nextStep: string | null;
  clock: { filled: number; size: number; full: boolean } | null;
}

export interface TonightThreads {
  memberId: string;
  name: string;
  threads: string[];
  untoldPassages: number;
}

export interface TonightInput {
  entries: readonly CanonEntry[];
  passages: readonly CanonLorePassage[];
  clues: readonly CanonClue[];
  steps: readonly CanonForceStep[];
  ticks: readonly CanonForceTick[];
  party: readonly PartyMember[];
  links: readonly BackstoryThreadLink[];
  facts: readonly StoryFact[];
}

export interface Tonight {
  lore: TonightGroup<TonightLore>[];
  clues: TonightGroup<TonightClue>[];
  forces: TonightForce[];
  threads: TonightThreads[];
  /** Table facts not yet reviewed; the block is shown only above zero. */
  tableUnreviewed: number;
}

const KIND_ORDER = ["location_id", "npc_id", "quest_beat_id"] as const;

function whereOf(source: TonightWhere): TonightWhere | null {
  if (source.location_id !== null) return { location_id: source.location_id, npc_id: null, quest_beat_id: null };
  if (source.npc_id !== null) return { location_id: null, npc_id: source.npc_id, quest_beat_id: null };
  if (source.quest_beat_id !== null) return { location_id: null, npc_id: null, quest_beat_id: source.quest_beat_id };
  return null;
}

function keyOf(at: TonightWhere | null): string {
  if (at === null) return "none";
  return at.location_id !== null ? `l:${at.location_id}` : at.npc_id !== null ? `n:${at.npc_id}` : `b:${at.quest_beat_id}`;
}

/** Places first, then people, then beats, each in the order met; what lies nowhere last. */
function grouped<T>(rows: readonly { at: TonightWhere | null; item: T }[]): TonightGroup<T>[] {
  const groups = new Map<string, TonightGroup<T>>();
  for (const { at, item } of rows) {
    const key = keyOf(at);
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { at, items: [item] });
  }
  const rank = (g: TonightGroup<T>) => (g.at === null ? KIND_ORDER.length : KIND_ORDER.findIndex((k) => g.at?.[k] !== null));
  return [...groups.values()].sort((a, b) => rank(a) - rank(b)); // stable: ties keep the order met
}

const byOrder = <T extends { sort_order: number; created_at: string }>(a: T, b: T) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

/** The passage each entry tells with itself: the one first in order. */
function firstPassageIds(passages: readonly CanonLorePassage[]): Set<string> {
  const first = new Map<string, CanonLorePassage>();
  for (const p of passages) {
    const current = first.get(p.entry_id);
    if (current === undefined || byOrder(p, current) < 0) first.set(p.entry_id, p);
  }
  return new Set([...first.values()].map((p) => p.id));
}

/** Lore (and the DM's backstory passages) not yet told that come out at a place, a person or a beat. */
export function loreToTell(entries: readonly CanonEntry[], passages: readonly CanonLorePassage[]): TonightGroup<TonightLore>[] {
  const told = firstPassageIds(passages);
  const entryOf = new Map(entries.filter((e) => e.part === "lore" || e.part === "backstory").map((e) => [e.id, e]));
  const rows: { at: TonightWhere | null; item: TonightLore }[] = [];
  for (const p of [...passages].sort(byOrder)) {
    const entry = entryOf.get(p.entry_id);
    const at = whereOf(p);
    if (entry === undefined || at === null || p.told_at !== null || told.has(p.id)) continue;
    rows.push({ at, item: { passageId: p.id, passageTitle: p.title, entryId: entry.id, entryTitle: entry.title } });
  }
  return grouped(rows);
}

/** Clues not yet found, of secrets not yet revealed, where they lie (a clue that is a passage lies where it comes out). */
export function cluesToFind(entries: readonly CanonEntry[], clues: readonly CanonClue[], passages: readonly CanonLorePassage[]): TonightGroup<TonightClue>[] {
  const secrets = new Map(entries.filter((e) => e.part === "secret").map((e) => [e.id, e]));
  const passageById = new Map(passages.map((p) => [p.id, p]));
  const rows: { at: TonightWhere | null; item: TonightClue }[] = [];
  for (const clue of [...clues].sort(byOrder)) {
    const secret = secrets.get(clue.secret_id);
    if (secret === undefined || secret.revealed_at !== null || clue.found_at !== null) continue;
    const passage = clue.passage_id === null ? undefined : passageById.get(clue.passage_id);
    const at = whereOf(passage ?? clue);
    rows.push({ at, item: { clueId: clue.id, title: clue.title, secretId: secret.id, secretTitle: secret.title } });
  }
  return grouped(rows);
}

/** Each force still moving: what it does next and where its clock stands. */
export function forcesMoving(entries: readonly CanonEntry[], steps: readonly CanonForceStep[], ticks: readonly CanonForceTick[]): TonightForce[] {
  return entries
    .filter((e) => e.part === "force" && e.closed_as === null)
    .map((force) => {
      const next = steps.filter((s) => s.force_id === force.id && s.reached_at === null).sort(byOrder)[0];
      const size = force.clock_size;
      const filled = size === null ? 0 : clockFilled(ticks.filter((t) => t.force_id === force.id), size);
      return {
        entryId: force.id,
        title: force.title,
        nextStep: next?.title ?? null,
        clock: size === null ? null : { filled, size, full: filled >= size },
      };
    });
}

/** Per character: the threads their past leaves open and the DM's passages not yet told to them. Others are left out. */
export function threadsLeftOpen(
  entries: readonly CanonEntry[],
  passages: readonly CanonLorePassage[],
  party: readonly PartyMember[],
  links: readonly BackstoryThreadLink[],
): TonightThreads[] {
  const result: TonightThreads[] = [];
  for (const member of party) {
    const entry = entries.find((e) => e.part === "backstory" && e.party_member_id === member.id);
    if (entry === undefined) continue;
    const threads = openThreads(entry.id, entries, links).map((e) => e.title);
    const untoldPassages = passages.filter((p) => p.entry_id === entry.id && p.told_at === null && !isPlayersPassage(p, member)).length;
    if (threads.length > 0 || untoldPassages > 0) result.push({ memberId: member.id, name: member.name, threads, untoldPassages });
  }
  return result;
}

export function tonight(input: TonightInput): Tonight {
  return {
    lore: loreToTell(input.entries, input.passages),
    clues: cluesToFind(input.entries, input.clues, input.passages),
    forces: forcesMoving(input.entries, input.steps, input.ticks),
    threads: threadsLeftOpen(input.entries, input.passages, input.party, input.links),
    tableUnreviewed: unreviewedCount(input.facts),
  };
}

/** True when nothing waits: the page then says so instead of five empty blocks. */
export function nothingTonight(t: Tonight): boolean {
  return t.lore.length === 0 && t.clues.length === 0 && t.forces.length === 0 && t.threads.length === 0 && t.tableUnreviewed === 0;
}
