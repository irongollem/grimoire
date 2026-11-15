/**
 * The judged rerank of campaign search (#1061), pure with every effect
 * injected so rerank.test.ts runs under vitest. index.ts owns the Deno parts:
 * the platform key, the row reads, the TypeSafe call and the ledger row.
 *
 * Contract: this never throws. A request that failed, timed out or answered
 * without a probability leaves its entries unjudged, and any unjudged entry
 * makes `hits` null so the caller keeps the distance ranking.
 */

import {
  applyProbabilities,
  hitKey,
  RERANK_BATCH,
  type CampaignSearchHit,
  type CampaignSearchKind,
} from "../_shared/campaignSearch.ts";
import { buildStoredText, JUDGE_ROW_SELECT, judgeTable } from "../import-match/judging.ts";
import type { SemanticKind } from "../import-match/matching.ts";
import type { JudgeRequest, NoulQuestion } from "../_shared/typesafe.ts";

/**
 * The search judges only with AI switched on for the campaign AND a platform
 * key: the query and row text go to a third party. Anything but a literal
 * `true` (null, undefined, a missing column) is off.
 */
export function rerankKey(aiEnabled: unknown, platformKey: string | undefined): string | null {
  if (aiEnabled !== true) return null;
  return platformKey && platformKey.length > 0 ? platformKey : null;
}

/** Each text field of an entry is cut to about this many characters, as in the measurement. */
export const FIELD_CHARS = 220;
/** A stored row's text (the embed text) holds several fields, so it gets room for about three. */
export const STORED_TEXT_CHARS = 600;

export type EntryFields = Record<string, string>;

export function cut(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 3).trimEnd()}...`;
}

// ── Where a hit's text lives ─────────────────────────────────────────────────

export interface RowSource {
  table: string;
  select: string;
  /** Set for kinds whose text the import-match reader builds. */
  semantic: SemanticKind | null;
}

const SEMANTIC_OF: Partial<Record<CampaignSearchKind, SemanticKind>> = {
  npc: "npcs",
  faction: "factions",
  location: "locations",
  item: "items",
  library_item: "items",
  monster: "monsters",
  library_monster: "monsters",
};

/** The same columns embed-content reads for notes and quests (title and the body). */
const NOTE_SOURCE: RowSource = { table: "notes", select: "id, title, content", semantic: null };
const QUEST_SOURCE: RowSource = { table: "quests", select: "id, title, summary", semantic: null };

export function semanticOf(kind: CampaignSearchKind): SemanticKind | null {
  return SEMANTIC_OF[kind] ?? null;
}

/** The table and columns holding this hit's text, or null when the kind has no readable table. */
export function rowSourceFor(kind: CampaignSearchKind): RowSource | null {
  if (kind === "note") return NOTE_SOURCE;
  if (kind === "quest") return QUEST_SOURCE;
  const semantic = semanticOf(kind);
  if (semantic === null) return null;
  const table = judgeTable(semantic, kind === "library_item" || kind === "library_monster" ? "library" : "campaign");
  return table === null ? null : { table, select: JUDGE_ROW_SELECT[semantic], semantic };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/** An entry's text: the name and descriptor always, plus what the row says when it could be read. */
export function buildEntry(hit: CampaignSearchHit, row: Record<string, unknown> | undefined): EntryFields {
  const entry: EntryFields = { name: cut(hit.name, FIELD_CHARS) };
  if (hit.descriptor) entry.about = cut(hit.descriptor, FIELD_CHARS);
  if (!row) return entry;
  if (hit.kind === "note") {
    const body = str(row.content);
    if (body) entry.text = cut(body, FIELD_CHARS);
    return entry;
  }
  if (hit.kind === "quest") {
    const summary = str(row.summary);
    if (summary) entry.text = cut(summary, FIELD_CHARS);
    return entry;
  }
  const semantic = semanticOf(hit.kind);
  if (semantic === null) return entry;
  const stored = buildStoredText(semantic, row);
  if (stored !== null) entry.text = cut(stored, STORED_TEXT_CHARS);
  return entry;
}

// ── The question ─────────────────────────────────────────────────────────────

/** The wording that was measured (60 labelled questions); changing it voids that measurement. */
export function entryQuestion(entryKey: string): NoulQuestion {
  return {
    type: "noul",
    instructions: `Is \`entries.${entryKey}\` what the person searching their campaign notes with \`query\` is looking for?`,
    criteria: {
      true: "That entry is the person, place, group, item or creature the query describes or asks about.",
      false: "That entry is something else, even if it shares a word, a place or a theme with the query.",
    },
  };
}

export function buildRerankRequest(query: string, entries: Record<string, EntryFields>): JudgeRequest {
  const questions: Record<string, NoulQuestion> = {};
  for (const key of Object.keys(entries)) questions[key] = entryQuestion(key);
  return { state: { query, entries }, questions };
}

// ── Orchestration ────────────────────────────────────────────────────────────

export interface BatchAnswer {
  /** Probability per entry key, null when the answer carried none for it. */
  probabilities: Record<string, number | null>;
  inputTokens: number;
}

export interface RerankResult {
  /** The judged list, or null when the caller must keep the distance ranking. */
  hits: CampaignSearchHit[] | null;
  /** Requests that answered, for the ledger row. */
  succeeded: number;
  inputTokens: number;
}

export async function rerankHits(
  query: string,
  pool: CampaignSearchHit[],
  entries: ReadonlyMap<string, EntryFields>,
  judgeBatch: (request: JudgeRequest) => Promise<BatchAnswer>,
): Promise<RerankResult> {
  const result: RerankResult = { hits: null, succeeded: 0, inputTokens: 0 };
  if (pool.length === 0) return result;

  const batches: CampaignSearchHit[][] = [];
  for (let i = 0; i < pool.length; i += RERANK_BATCH) batches.push(pool.slice(i, i + RERANK_BATCH));

  const probabilities = new Map<string, number>();
  await Promise.all(batches.map(async (batch) => {
    const keyed = new Map<string, CampaignSearchHit>();
    const byEntry: Record<string, EntryFields> = {};
    batch.forEach((hit, i) => {
      const entryKey = `e${i}`;
      keyed.set(entryKey, hit);
      byEntry[entryKey] = entries.get(hitKey(hit)) ?? buildEntry(hit, undefined);
    });
    try {
      const answer = await judgeBatch(buildRerankRequest(query, byEntry));
      result.succeeded++;
      result.inputTokens += answer.inputTokens;
      for (const [entryKey, hit] of keyed) {
        const p = answer.probabilities[entryKey];
        if (typeof p === "number") probabilities.set(hitKey(hit), p);
      }
    } catch {
      // This batch's entries stay unjudged, which sends the search back to distance.
    }
  }));

  result.hits = applyProbabilities(pool, probabilities);
  return result;
}
