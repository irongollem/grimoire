/**
 * Name repair (#1061): the generators offer the model a list of the DM's real
 * rows and ask it to use their names, and the client then resolves the answer
 * back to rows by exact name. A near miss ("Skeletal Archers" for "Skeleton
 * Archer") used to reach the DM as an unmatched name to add by hand. This puts
 * each such name to Jev as a pick-one over the names the prompt offered, and
 * maps it onto the offered name only when the pick is confident. It never
 * invents a row: the only strings it can return are ones the prompt offered.
 *
 * Pure, with the judging call injected so it is unit-tested under vitest.
 * Contract: this never throws. A request that failed, a name over a cap and a
 * name the deadline cut off are simply absent from `repairs`.
 */

import { runBounded } from "../import-match/judging.ts";
import { choiceOf, type JudgeRequest, type JudgeResult } from "./typesafe.ts";

/** The probability the picked entry needs before a name is rewritten. A first setting, to be confirmed by a live
 *  check against real near misses: too low rewrites a different creature, too high leaves the chore as it was. */
export const REPAIR_MIN_PROBABILITY = 0.7;
export const REPAIR_MAX_NAMES = 24;
export const REPAIR_SHORTLIST = 12;
export const REPAIR_CONCURRENCY = 8;
export const REPAIR_DEADLINE_MS = 15_000;
/** The option that lets the model refuse every listed entry. */
export const NONE_OPTION = "none of these";
export const CHOICE_QUESTION = "entry";

export interface OfferedName {
  name: string;
  /** A short qualifier such as "CR 1/4 humanoid" or "uncommon wondrous item". */
  hint?: string;
}

export interface NameToCheck {
  name: string;
  /** The entry's own note or role text, when the caller has it. */
  note?: string;
}

export interface RepairInput {
  names: NameToCheck[];
  offered: OfferedName[];
  /** One or two sentences of what is being generated. */
  context: string;
}

export interface RepairDeps {
  judge: (request: JudgeRequest, signal: AbortSignal) => Promise<JudgeResult>;
  concurrency?: number;
  deadlineMs?: number;
  maxNames?: number;
  shortlist?: number;
}

export interface RepairResult {
  /** Output name (as given) to the exact offered name. Confident repairs only. */
  repairs: Map<string, string>;
  /** Input tokens of the judgments that finished. */
  inputTokens: number;
  /** Judgments that finished (their tokens were spent whatever they picked). */
  judged: number;
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Lowercase word tokens with one trailing "s" dropped, so a plural overlaps its singular. */
function tokens(s: string): string[] {
  return norm(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = row;
  }
  return prev[b.length];
}

/** Shared-token share plus whole-string edit similarity, or 0 when too far apart to be worth asking about. */
function closeness(generated: string, offered: string): number {
  const g = tokens(generated);
  const o = tokens(offered);
  const shared = g.filter((t) => o.includes(t)).length;
  const overlap = shared / Math.max(g.length, o.length, 1);
  const a = norm(generated);
  const b = norm(offered);
  const similarity = 1 - editDistance(a, b) / Math.max(a.length, b.length, 1);
  if (shared === 0 && similarity < 0.5) return 0;
  return overlap + similarity;
}

/** At most `limit` offered entries, closest first; ties keep the offered order. */
export function shortlistOffered(name: string, offered: OfferedName[], limit: number): OfferedName[] {
  return offered
    .map((entry, index) => ({ entry, index, score: closeness(name, entry.name) }))
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score || x.index - y.index)
    .slice(0, limit)
    .map((r) => r.entry);
}

export function buildChoiceRequest(target: NameToCheck, options: OfferedName[], context: string): JudgeRequest {
  const criteria: Record<string, string> = {};
  for (const o of options) criteria[o.name] = o.hint && o.hint.trim() ? o.hint : "No further detail";
  criteria[NONE_OPTION] = "The generated name is not any of the listed entries: a different creature, item, person or place.";
  const generated = target.note && target.note.trim() ? `${target.name} (${target.note.trim()})` : target.name;
  return {
    state: { generated, context },
    questions: {
      [CHOICE_QUESTION]: {
        type: "choice",
        instructions:
          "Which listed entry does the generated name refer to? Pick an entry only when the generated name is clearly that entry under a plural, a variant spelling, an added or dropped qualifier, or a different word order.",
        criteria,
      },
    },
  };
}

/** The offered name a name was repaired to, or the name as the model wrote it. */
export function repaired(repairs: Map<string, string>, name: string): string {
  const to = repairs.get(name);
  return to === undefined ? name : to;
}

/** True when at least one name is not already an offered name, so a caller can skip reading a key for nothing. */
export function hasUnmatchedName(input: RepairInput): boolean {
  const offeredKeys = new Set(input.offered.map((o) => norm(o.name)));
  return input.names.some((n) => norm(n.name) !== "" && !offeredKeys.has(norm(n.name)));
}

export async function repairNames(input: RepairInput, deps: RepairDeps): Promise<RepairResult> {
  const out: RepairResult = { repairs: new Map(), inputTokens: 0, judged: 0 };
  try {
    // Offered names, deduplicated; the option that means "none" can never also be an entry.
    const offered: OfferedName[] = [];
    const offeredKeys = new Set<string>();
    for (const o of input.offered) {
      const key = norm(o.name);
      if (key === "" || key === NONE_OPTION || offeredKeys.has(key)) continue;
      offeredKeys.add(key);
      offered.push(o);
    }
    if (offered.length === 0) return out;

    // An exact match is already resolved by the client and is never sent.
    const seen = new Set<string>();
    const unmatched: NameToCheck[] = [];
    for (const n of input.names) {
      const key = norm(n.name);
      if (key === "" || offeredKeys.has(key) || seen.has(key)) continue;
      seen.add(key);
      unmatched.push(n);
    }

    const limit = deps.shortlist ?? REPAIR_SHORTLIST;
    const jobs: { target: NameToCheck; options: OfferedName[] }[] = [];
    for (const target of unmatched.slice(0, deps.maxNames ?? REPAIR_MAX_NAMES)) {
      const options = shortlistOffered(target.name, offered, limit);
      if (options.length > 0) jobs.push({ target, options });
    }
    if (jobs.length === 0) return out;

    const outcomes = await runBounded(
      jobs.map((job) => (signal: AbortSignal) => deps.judge(buildChoiceRequest(job.target, job.options, input.context), signal)),
      { concurrency: deps.concurrency ?? REPAIR_CONCURRENCY, deadlineMs: deps.deadlineMs ?? REPAIR_DEADLINE_MS },
    );

    outcomes.forEach((outcome, i) => {
      if (!outcome.done) return;
      out.inputTokens += outcome.value.inputTokens;
      out.judged++;
      const pick = choiceOf(outcome.value, CHOICE_QUESTION);
      if (!pick) return;
      // Only a name the request offered can come back as a repair; "none of these" is never one of them.
      const chosen = jobs[i].options.find((o) => o.name === pick.choice);
      if (!chosen) return;
      const probability = pick.probabilities[pick.choice];
      if (typeof probability !== "number" || probability < REPAIR_MIN_PROBABILITY) return;
      out.repairs.set(jobs[i].target.name, chosen.name);
    });
  } catch {
    // Repair is an enhancement: whatever is missing stays as the model wrote it.
  }
  return out;
}

// ── Campaign entities (quest hooks and roll tables) ──────────────────────────

export const ENTITY_KINDS = ["npcs", "locations", "factions"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/**
 * One repair group per entity kind, in ENTITY_KINDS order. The client resolves
 * each kind against its own list, so a place's name is only ever repaired onto
 * a place the prompt offered, never onto a person.
 */
export function entityRepairGroups(
  offered: Record<EntityKind, { name: string; descriptor: string | null }[]>,
  named: Record<EntityKind, string[]>,
  subject: string,
): RepairInput[] {
  const label: Record<EntityKind, string> = { npcs: "NPC", locations: "location", factions: "faction" };
  return ENTITY_KINDS.map((kind) => ({
    names: named[kind].map((name) => ({ name })),
    offered: offered[kind].map((c) => (c.descriptor ? { name: c.name, hint: c.descriptor } : { name: c.name })),
    context: `${subject} Each name is a ${label[kind]} of the campaign.`,
  }));
}

/** The strings of a model-written list (anything else in it is ignored), or [] for a missing or non-array one. */
export function namesIn(list: unknown): string[] {
  return Array.isArray(list) ? list.filter((n): n is string => typeof n === "string") : [];
}

/** The list with each name repaired; a missing list stays missing and non-string items stay as they were. */
export function repairedList(repairs: Map<string, string>, list: unknown[] | undefined): unknown[] | undefined {
  return list === undefined ? undefined : list.map((n) => (typeof n === "string" ? repaired(repairs, n) : n));
}
