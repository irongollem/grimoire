/**
 * The pure core of `npm run stat-blocks:structure` (#1017): one stat block in, the
 * block the "expand" release step should store out.
 *
 * Expand is additive on purpose. The client in production still reads the four
 * defense strings and ignores `structured` / `defenses`, so those strings are put
 * back after `structureStatBlock` drops them; the contract step (a later
 * migration) removes them once the new client is out.
 */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { StatBlockListKey } from "../../src/rules/statBlock/parseAction.ts";
import { type ProseStatBlockFields, structureStatBlock } from "../../src/rules/statBlock/structureStatBlock.ts";
import type { ActionKind, ActionStructure } from "../../src/types/statBlock.types.ts";

export const LIST_KEYS = [
  "special_abilities",
  "actions",
  "bonus_actions",
  "reactions",
  "legendary_actions",
  "lair_actions",
] as const satisfies readonly StatBlockListKey[];

const DEFENSE_STRING_KEYS = [
  "damage_resistances",
  "damage_immunities",
  "damage_vulnerabilities",
  "condition_immunities",
] as const;

/** One agent-read structure from `library-extracted-actions.json`. */
export interface ExtractedAction {
  id: string;
  list: StatBlockListKey;
  idx: number;
  name: string;
  /** sha1 of the entry's description when the agent read it; a mismatch means the prose changed since. */
  description_sha1: string;
  structured: ActionStructure;
}

export interface ExpandStats {
  /** Entries by the kind of their final structure. */
  kinds: Record<ActionKind, number>;
  review: number;
  extractedApplied: number;
  extractedStale: number;
}

export interface ExpandResult {
  next: unknown;
  changed: boolean;
  /** True when every entry already carried `structured` and the block carried `defenses` before this run. */
  alreadyStructured: boolean;
  stats: ExpandStats;
}

export function sha1(text: string): string {
  return createHash("sha1").update(text, "utf8").digest("hex");
}

/** The key under which one row's extractions are looked up: list plus position. */
export function entryKey(list: StatBlockListKey, idx: number): string {
  return `${list}:${idx}`;
}

/** Groups the data file by row id, each row's extractions keyed by `entryKey`. */
export function groupExtractions(all: readonly ExtractedAction[]): Map<string, Map<string, ExtractedAction>> {
  const byRow = new Map<string, Map<string, ExtractedAction>>();
  for (const e of all) {
    const row = byRow.get(e.id) ?? new Map<string, ExtractedAction>();
    row.set(entryKey(e.list, e.idx), e);
    byRow.set(e.id, row);
  }
  return byRow;
}

type Entry = { name: string; description: string; structured?: ActionStructure };

function emptyStats(): ExpandStats {
  return { kinds: { attack: 0, save: 0, multiattack: 0, options: 0, other: 0 }, review: 0, extractedApplied: 0, extractedStale: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAlreadyStructured(block: Record<string, unknown>): boolean {
  if (!isRecord(block.defenses)) return false;
  return LIST_KEYS.every((key) => {
    const list = block[key];
    return !Array.isArray(list) || list.every((e) => isRecord(e) && isRecord(e.structured));
  });
}

/**
 * `extracted` holds this row's extractions keyed by `entryKey`. A non-object block
 * (a null column, a malformed value) is returned untouched.
 */
export function expandStatBlock(
  block: unknown,
  extracted?: Map<string, ExtractedAction>,
  options: { keepLegacyStrings: boolean } = { keepLegacyStrings: true },
): ExpandResult {
  const stats = emptyStats();
  if (!isRecord(block)) return { next: block, changed: false, alreadyStructured: true, stats };

  const alreadyStructured = isAlreadyStructured(block);
  const input: Record<string, unknown> = { ...block };

  for (const list of LIST_KEYS) {
    const entries = input[list];
    if (!Array.isArray(entries)) continue;
    input[list] = (entries as Entry[]).map((entry, idx) => {
      const hit = extracted?.get(entryKey(list, idx));
      if (!hit) return entry;
      // A DM's structure is never replaced, and a changed description voids the extraction.
      if (entry.structured?.source === "manual") return entry;
      if (hit.name !== entry.name || hit.description_sha1 !== sha1(entry.description)) {
        stats.extractedStale++;
        return entry;
      }
      return { ...entry, structured: hit.structured };
    });
  }

  const structured: Record<string, unknown> = { ...structureStatBlock(input as ProseStatBlockFields) };
  // Before the contract migration the old strings stay (only those that existed),
  // so the write is purely additive for the client that is live. After it, a row
  // converted late (a straggler the old client wrote in between) drops them, as the
  // migration did for everyone else.
  if (options.keepLegacyStrings) {
    for (const key of DEFENSE_STRING_KEYS) {
      if (key in block) structured[key] = block[key];
    }
  }

  for (const list of LIST_KEYS) {
    const entries = structured[list];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries as { structured: ActionStructure }[]) {
      stats.kinds[entry.structured.kind]++;
      if (entry.structured.review !== undefined) stats.review++;
    }
    if (extracted) {
      for (const [key, hit] of extracted) {
        if (!key.startsWith(`${list}:`)) continue;
        const entry = (entries as { structured: ActionStructure }[])[hit.idx];
        if (entry?.structured.source === "extracted" && isDeepStrictEqual(entry.structured, hit.structured)) {
          stats.extractedApplied++;
        }
      }
    }
  }

  return { next: structured, changed: !isDeepStrictEqual(structured, block), alreadyStructured, stats };
}

const LEGACY_DEFENSE_KEYS = ["damage_resistances", "damage_immunities", "damage_vulnerabilities", "condition_immunities"] as const;
const DEFENSE_LISTS = ["resistances", "immunities", "vulnerabilities", "condition_immunities"] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Why the contract migration (`20261010004946_stat_blocks_drop_prose_defense_strings`)
 * would refuse this stat block, or null when it would pass. The same two rules as
 * that migration's SQL, restated so the guarded release (`release.ts`) can prove
 * production passes before the PR merges, instead of finding out from a red CI job:
 *
 * - `unstructured`: no `defenses` object, or an entry with no `structured` object;
 * - `text-without-defenses`: an old defense string still says something (not empty,
 *   "false" in any case, or "[]"), yet `defenses` holds no typed entry and no note.
 *
 * A null or non-object block passes, as in the SQL.
 */
export function contractBlocker(block: unknown): "unstructured" | "text-without-defenses" | null {
  if (!isObject(block)) return null;
  const defenses = block.defenses;
  if (!isObject(defenses)) return "unstructured";
  for (const list of LIST_KEYS) {
    const entries = block[list];
    if (!Array.isArray(entries)) continue;
    if (entries.some((entry) => !isObject(entry) || !isObject(entry.structured))) return "unstructured";
  }
  const saysSomething = LEGACY_DEFENSE_KEYS.some((key) => {
    const value = block[key];
    return typeof value === "string" && !["", "false", "[]"].includes(value.trim().toLowerCase());
  });
  if (!saysSomething) return null;
  const holdsNothing =
    DEFENSE_LISTS.every((list) => {
      const value = defenses[list];
      return !Array.isArray(value) || value.length === 0;
    }) && !(typeof defenses.notes === "string" && defenses.notes.trim() !== "");
  return holdsNothing ? "text-without-defenses" : null;
}
