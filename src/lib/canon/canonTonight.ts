import { clockFilled, stepOverdue } from "@/lib/canon/canonForces";
import { looseEnds as sharedLooseEnds, type LooseEndKind } from "@edge-shared/canonLooseEnds.ts";
import type { WorldDate } from "@/lib/canon/canonLore";
import { openThreads, type BackstoryThreadLink } from "@/lib/canon/backstoryThreads";
import { isPlayersPassage } from "@/lib/canon/canonBackstory";
import { unreviewedCount } from "@/lib/canon/canonTableFacts";
import type { StoryFact } from "@/lib/table/solo/storyRecord";
import type { CanonClue, CanonEntry, CanonEntryQuest, CanonForceStep, CanonForceTick, CanonLorePassage, CanonTonightPin } from "@/types/canon.types";
import type { PartyMember } from "@/types/party.types";
import type { Quest } from "@/types/quest.types";
import type { CampaignSession } from "@/types/session.types";

/**
 * "Tonight" (#1255 item 14): what a DM needs for the next session, gathered from the canon and nothing new stored. Pure:
 * it takes the rows the Canon page already reads and returns the five blocks' data. Names of places, people and beats
 * are the view's to look up (`useClueWhere`); here a place is only its ids.
 */

/**
 * Where something comes out: at most one is set, as on a clue (a passage has no item or handout, so those two may be absent).
 * An item or a handout has no place, so "Where the party is" never holds them; "Everything" groups by them.
 */
export type TonightWhere = Pick<CanonClue, "location_id" | "npc_id" | "quest_beat_id"> & Partial<Pick<CanonClue, "item_id" | "document_id">>;

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
  /** The character a backstory passage is told to; null for lore, which is told to the whole party. */
  tellTo: string | null;
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
  /** The step behind `nextStep`, for pinning it. */
  nextStepId: string | null;
  /** Steps whose date has come (today is in the period they are due) or gone by, not yet reached. */
  dueSteps: TonightDueStep[];
  clock: { filled: number; size: number; full: boolean } | null;
}

/** A step whose due date has come ("due") or gone by ("overdue") in the world's calendar. */
export interface TonightDueStep {
  stepId: string;
  title: string;
  state: "due" | "overdue";
}

export interface TonightThreads {
  memberId: string;
  name: string;
  threads: string[];
  /** The entry ids of `threads`, in the same order, for pinning one. */
  threadIds: string[];
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
  /** The campaign's date in the world; null when it keeps no calendar, and then no step is due or late. */
  today?: WorldDate | null;
}

export interface Tonight {
  lore: TonightGroup<TonightLore>[];
  clues: TonightGroup<TonightClue>[];
  forces: TonightForce[];
  threads: TonightThreads[];
  /** Table facts not yet reviewed; the block is shown only above zero. */
  tableUnreviewed: number;
}

const KIND_ORDER = ["location_id", "npc_id", "quest_beat_id", "item_id", "document_id"] as const;

function whereOf(source: TonightWhere): TonightWhere | null {
  const none = { location_id: null, npc_id: null, quest_beat_id: null, item_id: null, document_id: null };
  for (const kind of KIND_ORDER) {
    const id = source[kind];
    if (id !== null && id !== undefined) return { ...none, [kind]: id };
  }
  return null;
}

function keyOf(at: TonightWhere | null): string {
  if (at === null) return "none";
  const kind = KIND_ORDER.find((k) => at[k] !== null && at[k] !== undefined);
  return kind === undefined ? "none" : `${kind}:${at[kind]}`;
}

/** Places first, then people, beats, items and handouts, each in the order met; what lies nowhere last. */
function grouped<T>(rows: readonly { at: TonightWhere | null; item: T }[]): TonightGroup<T>[] {
  const groups = new Map<string, TonightGroup<T>>();
  for (const { at, item } of rows) {
    const key = keyOf(at);
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { at, items: [item] });
  }
  const rank = (g: TonightGroup<T>) => (g.at === null ? KIND_ORDER.length : KIND_ORDER.findIndex((k) => g.at?.[k] !== null && g.at?.[k] !== undefined));
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
    rows.push({ at, item: { passageId: p.id, passageTitle: p.title, entryId: entry.id, entryTitle: entry.title, tellTo: entry.part === "backstory" ? entry.party_member_id : null } });
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

/**
 * Whether an unreached step is due today or late. The due date is read at its own precision, as `stepOverdue` reads it:
 * a step due in a month is "due" all that month and "overdue" after it. A step with no date, a reached one, a future one
 * or an unknown today is neither.
 */
export function stepDueState(step: Pick<CanonForceStep, "due_year" | "due_month" | "due_day" | "reached_at">, today: WorldDate | null): "due" | "overdue" | null {
  if (step.reached_at !== null || step.due_year === null || today === null || today.year === null) return null;
  if (stepOverdue(step, today)) return "overdue";
  if (today.year !== step.due_year) return null; // due in a later year
  if (step.due_month === null) return "due";
  if (today.month !== step.due_month) return null;
  if (step.due_day === null) return "due";
  return today.day === step.due_day ? "due" : null;
}

/** Each force still moving: what it does next, which steps are due or late, and where its clock stands. */
export function forcesMoving(entries: readonly CanonEntry[], steps: readonly CanonForceStep[], ticks: readonly CanonForceTick[], today: WorldDate | null = null): TonightForce[] {
  return entries
    .filter((e) => e.part === "force" && e.closed_as === null)
    .map((force) => {
      const open = steps.filter((s) => s.force_id === force.id && s.reached_at === null).sort(byOrder);
      const next = open[0];
      const dueSteps = open.flatMap((s) => {
        const state = stepDueState(s, today);
        return state === null ? [] : [{ stepId: s.id, title: s.title, state }];
      });
      const size = force.clock_size;
      const filled = size === null ? 0 : clockFilled(ticks.filter((t) => t.force_id === force.id), size);
      return {
        entryId: force.id,
        title: force.title,
        nextStep: next?.title ?? null,
        nextStepId: next?.id ?? null,
        dueSteps,
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
    const open = openThreads(entry.id, entries, links);
    const threads = open.map((e) => e.title);
    const untoldPassages = passages.filter((p) => p.entry_id === entry.id && p.told_at === null && !isPlayersPassage(p, member)).length;
    if (threads.length > 0 || untoldPassages > 0) result.push({ memberId: member.id, name: member.name, threads, threadIds: open.map((e) => e.id), untoldPassages });
  }
  return result;
}

export function tonight(input: TonightInput): Tonight {
  return {
    lore: loreToTell(input.entries, input.passages),
    clues: cluesToFind(input.entries, input.clues, input.passages),
    forces: forcesMoving(input.entries, input.steps, input.ticks, input.today ?? null),
    threads: threadsLeftOpen(input.entries, input.passages, input.party, input.links),
    tableUnreviewed: unreviewedCount(input.facts),
  };
}

/** True when nothing waits: the page then says so instead of five empty blocks. */
export function nothingTonight(t: Tonight): boolean {
  return t.lore.length === 0 && t.clues.length === 0 && t.forces.length === 0 && t.threads.length === 0 && t.tableUnreviewed === 0;
}

// ── Scope (#1258 item 1): Tonight is run from, so it narrows to where the table is ────────────────────────────────

/** "Where the party is" (the default), the beats of the quests being played, or everything the canon holds. */
export type TonightScope = "party" | "quests" | "all";
export const TONIGHT_SCOPES: readonly { id: TonightScope; label: string }[] = [
  { id: "party", label: "Where the party is" },
  { id: "quests", label: "Active quests" },
  { id: "all", label: "Everything" },
];
export const DEFAULT_TONIGHT_SCOPE: TonightScope = "party";

export interface TonightScopeContext {
  /** `campaigns.current_location_id`; null when the party has no place set. */
  currentLocationId: string | null;
  /** Every place of the campaign, for walking `parent_id` down from the current one. */
  locations: readonly { id: string; parent_id: string | null }[];
  /** The beats of quests whose status is active. */
  activeBeatIds: ReadonlySet<string>;
  /** Where each person is (`npcs.location_id`), so what lies with a person counts as lying where they are. */
  npcLocationIds?: ReadonlyMap<string, string | null>;
}

/** The place and every place inside it, however deep (a room in a dungeon in the party's town). */
export function placesWithin(rootId: string, locations: readonly { id: string; parent_id: string | null }[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const l of locations) {
    if (l.parent_id === null) continue;
    childrenOf.set(l.parent_id, [...(childrenOf.get(l.parent_id) ?? []), l.id]);
  }
  const within = new Set<string>([rootId]);
  const queue = [rootId];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const child of childrenOf.get(id) ?? []) {
      if (within.has(child)) continue; // a loop in the tree must not hang the page
      within.add(child);
      queue.push(child);
    }
  }
  return within;
}

/** The beats that belong to a quest being played now. */
export function activeQuestBeatIds(beats: readonly { id: string; quest_id: string }[], quests: readonly Pick<Quest, "id" | "status">[]): Set<string> {
  const active = new Set(quests.filter((q) => q.status === "active").map((q) => q.id));
  return new Set(beats.filter((b) => active.has(b.quest_id)).map((b) => b.id));
}

function scopedGroups<T>(groups: TonightGroup<T>[], keep: (at: TonightWhere) => boolean): TonightGroup<T>[] {
  return groups.filter((g) => g.at !== null && keep(g.at));
}

/**
 * Narrows what lies somewhere to the scope. Lore and clues are the two blocks that come out at a place or a beat, so they
 * are the two that narrow; what moves and the open threads belong to the whole campaign and are never cut. A scope keeps
 * a group only when it can say it is there, so what lies nowhere (or with a person who is elsewhere) is left out of "party"
 * and "quests". With "party", a person counts by where they are (`npcLocationIds`).
 */
export function scopeTonight(t: Tonight, scope: TonightScope, ctx: TonightScopeContext): Tonight {
  if (scope === "all") return t;
  let keep: (at: TonightWhere) => boolean;
  if (scope === "party") {
    const here = ctx.currentLocationId === null ? new Set<string>() : placesWithin(ctx.currentLocationId, ctx.locations);
    const npcPlace = ctx.npcLocationIds;
    keep = (at) => {
      if (at.location_id !== null) return here.has(at.location_id);
      // A clue or passage with a person lies where that person is, when it is in the party's place or inside it.
      const home = at.npc_id === null ? undefined : npcPlace?.get(at.npc_id);
      return home !== undefined && home !== null && here.has(home);
    };
  } else {
    keep = (at) => at.quest_beat_id !== null && ctx.activeBeatIds.has(at.quest_beat_id);
  }
  return { ...t, lore: scopedGroups(t.lore, keep), clues: scopedGroups(t.clues, keep) };
}

const countItems = (t: Tonight) => t.lore.reduce((n, g) => n + g.items.length, 0) + t.clues.reduce((n, g) => n + g.items.length, 0);

/** How many lore passages and clues each scope holds, so an option says what choosing it shows. */
export function scopeCounts(full: Tonight, ctx: TonightScopeContext): Record<TonightScope, number> {
  return { party: countItems(scopeTonight(full, "party", ctx)), quests: countItems(scopeTonight(full, "quests", ctx)), all: countItems(full) };
}

/** True when the scope hid every lore passage and clue that something else (the unscoped plan) had: the page says so. */
export function scopeHidAll(full: Tonight, scoped: Tonight): boolean {
  return (full.lore.length > 0 || full.clues.length > 0) && scoped.lore.length === 0 && scoped.clues.length === 0;
}

// ── Loose ends (#1258 item 31): what the canon promises and has not yet got ready ────────────────────────────────

export type { LooseEndKind };

export interface LooseEnd {
  key: string;
  kind: LooseEndKind;
  title: string;
  reasons: string[];
  /** The entry to pin; null for an arc, which is not an entry (it is left through `subjectId`). */
  entryId: string | null;
  /** What "Leave it" writes to: the entry's id, or the arc's. */
  subjectId: string;
  /** Where the row opens: the entry, the character's backstory, or the Arcs chapter for an arc (which has no entry of its own). */
  to: { path: "/canon" | "/canon/arcs"; query: Record<string, string> };
}

export interface LooseEndsInput {
  entries: readonly CanonEntry[];
  clues: readonly CanonClue[];
  steps: readonly CanonForceStep[];
  entryQuests: readonly Pick<CanonEntryQuest, "entry_id">[];
  links: readonly BackstoryThreadLink[];
  arcs: readonly { id: string; name: string; status: string; loose_end_left_at?: string | null }[];
  quests: readonly Pick<Quest, "id" | "status" | "arc_id">[];
  sessions: readonly Pick<CampaignSession, "created_at">[];
}

const entryTo = (id: string): LooseEnd["to"] => ({ path: "/canon", query: { entry: id } });

/** What the canon leaves loose, by the one rule Tonight and the read-through share (`canonLooseEnds.ts`), with where each opens. */
export function looseEnds(input: LooseEndsInput): LooseEnd[] {
  const byId = new Map(input.entries.map((e) => [e.id, e]));
  return sharedLooseEnds(input).map((end) => {
    const base = { key: end.key, kind: end.kind, title: end.title, reasons: end.reasons, subjectId: end.subjectId };
    if (end.kind === "arc") return { ...base, entryId: null, to: { path: "/canon/arcs" as const, query: { arc: end.subjectId } } };
    const memberId = end.kind === "backstory" ? byId.get(end.subjectId)?.party_member_id ?? null : null;
    return { ...base, entryId: end.subjectId, to: memberId === null ? entryTo(end.subjectId) : { path: "/canon" as const, query: { backstory: memberId } } };
  });
}

// ── The plan (#1279 item 20): what the DM pinned for the next session ───────────────────────────────────────────

export type PinnedKind = "clue" | "passage" | "step" | "entry";

/** One pinned thing, resolved against the canon: what it is called, where it comes from, where it opens. */
export interface PinnedItem {
  pinId: string;
  kind: PinnedKind;
  title: string;
  /** "Clue to: The mayor", "From: The old mill", "Step of: The Guild", "Thread". */
  context: string;
  to: { path: "/canon"; query: Record<string, string> };
}

/**
 * The pins in the DM's order, each resolved to what it names. A pin whose target is gone or already done is left out
 * (a clue found, a passage told, a step reached): it has been played, and the DM does not have to unpin it. The scope
 * never cuts a pin; the DM chose it.
 */
export function plannedItems(
  pins: readonly CanonTonightPin[],
  input: Pick<TonightInput, "entries" | "passages" | "clues" | "steps">,
): PinnedItem[] {
  const entry = new Map(input.entries.map((e) => [e.id, e]));
  const out: PinnedItem[] = [];
  for (const pin of [...pins].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))) {
    if (pin.clue_id !== null) {
      const clue = input.clues.find((c) => c.id === pin.clue_id);
      const secret = clue === undefined ? undefined : entry.get(clue.secret_id);
      if (clue === undefined || secret === undefined || clue.found_at !== null) continue;
      out.push({ pinId: pin.id, kind: "clue", title: clue.title, context: `Clue to: ${secret.title}`, to: { path: "/canon", query: { entry: secret.id } } });
    } else if (pin.passage_id !== null) {
      const passage = input.passages.find((p) => p.id === pin.passage_id);
      const owner = passage === undefined ? undefined : entry.get(passage.entry_id);
      if (passage === undefined || owner === undefined || passage.told_at !== null) continue;
      out.push({ pinId: pin.id, kind: "passage", title: passage.title || "An untitled passage", context: `From: ${owner.title}`, to: { path: "/canon", query: { entry: owner.id } } });
    } else if (pin.step_id !== null) {
      const step = input.steps.find((s) => s.id === pin.step_id);
      const force = step === undefined ? undefined : entry.get(step.force_id);
      if (step === undefined || force === undefined || step.reached_at !== null) continue;
      out.push({ pinId: pin.id, kind: "step", title: step.title || "An unwritten step", context: `Step of: ${force.title}`, to: { path: "/canon", query: { entry: force.id } } });
    } else if (pin.entry_id !== null) {
      const target = entry.get(pin.entry_id);
      if (target === undefined) continue;
      const to: Record<string, string> = target.part === "backstory" && target.party_member_id !== null ? { backstory: target.party_member_id } : { entry: target.id };
      out.push({ pinId: pin.id, kind: "entry", title: target.title, context: "Thread to follow", to: { path: "/canon", query: to } });
    }
  }
  return out;
}

// ── Done this session (#1279 item 19): what Tonight's actions did, kept in view so each can be taken back ─────────

export type TonightDoneKind = "tell" | "found" | "tick" | "reach" | "leave";

/** One action done on this visit; the page keeps these under a fold instead of letting the row vanish. */
export interface TonightDone {
  key: string;
  kind: TonightDoneKind;
  /** The passage, clue, force, step or entry it was done to. */
  title: string;
}

export const DONE_VERB: Record<TonightDoneKind, string> = { tell: "Told", found: "Found", tick: "Ticked", reach: "Reached", leave: "Left" };

/** Drops the groups' items the visit has already done (the plan refetches a moment later; until then they must not show twice). */
export function withoutDone<T>(groups: readonly TonightGroup<T>[], isDone: (item: T) => boolean): TonightGroup<T>[] {
  return groups.map((g) => ({ ...g, items: g.items.filter((i) => !isDone(i)) })).filter((g) => g.items.length > 0);
}
