/**
 * Reading and writing stored stat blocks for the #1017 conversion, shared by
 * `structure-stat-blocks.ts` (the plain tool) and `release.ts` (the guarded
 * production release). Counts only, never row content: `monsters`, `npcs` and
 * `companions` hold real accounts' rows.
 */
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { assertDemoKey, assertRemoteUrl, readLocalStack } from "../lib/dev-stack.ts";
import { type ExpandStats, type ExtractedAction, contractBlocker, expandStatBlock, groupExtractions } from "./structureRows.ts";

export const TABLES = ["library_monsters", "monsters", "npcs", "companions"] as const;
export type Table = (typeof TABLES)[number];

/** PostgREST's page cap; a page of exactly this size may have a successor. */
const PAGE = 1000;
const WRITE_CONCURRENCY = 8;
const RETRIES = 3;

export interface Target {
  origin: string;
  key: string;
  label: string;
}

export interface Row {
  id: string;
  stat_block: unknown;
}

export function isTable(value: string): value is Table {
  return (TABLES as readonly string[]).includes(value);
}

function headers(target: Target, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: target.key, Authorization: `Bearer ${target.key}`, ...extra };
}

export function resolveTarget(production: boolean): Target {
  if (production) {
    const url = assertRemoteUrl(process.env.VITE_SUPABASE_URL);
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Run through the npm script, which loads .env.local.");
    return { origin: url.origin, key, label: "production" };
  }
  // readLocalStack refuses anything but loopback; the demo-key check refuses a hosted key behind a local-looking URL.
  const stack = readLocalStack();
  assertDemoKey("SERVICE_ROLE_KEY", stack.SERVICE_ROLE_KEY);
  return { origin: new URL(stack.API_URL).origin, key: stack.SERVICE_ROLE_KEY, label: "local" };
}

export async function readRows(target: Target, table: Table): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${target.origin}/rest/v1/${table}?select=id,stat_block&order=id&limit=${PAGE}&offset=${offset}`;
    const response = await fetch(url, { headers: headers(target) });
    // Status only: a body could echo row content.
    if (!response.ok) throw new Error(`Could not read ${table} from ${target.label} (${response.status}).`);
    const page = (await response.json()) as Row[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Updates one row by primary key, retrying transient failures. Returns false on a lasting failure. */
async function writeRow(target: Target, table: Table, id: string, statBlock: unknown): Promise<boolean> {
  const url = `${target.origin}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: headers(target, { "Content-Type": "application/json", Prefer: "return=minimal" }),
        body: JSON.stringify({ stat_block: statBlock }),
      });
      if (response.ok) return true;
      if (response.status < 500 && response.status !== 429) return false;
    } catch {
      // Network error: retried below.
    }
    await sleep(500 * 2 ** attempt);
  }
  return false;
}

export function loadExtractions(): Map<string, Map<string, ExtractedAction>> {
  const text = readFileSync(new URL("./library-extracted-actions.json", import.meta.url), "utf8").trim();
  if (text === "") return new Map();
  return groupExtractions(JSON.parse(text) as ExtractedAction[]);
}

export interface Tally extends ExpandStats {
  total: number;
  alreadyStructured: number;
  toWrite: number;
  written: number;
  failed: number;
}

export async function processTable(
  target: Target,
  table: Table,
  write: boolean,
  extractions: Map<string, Map<string, ExtractedAction>>,
): Promise<Tally> {
  const rows = await readRows(target, table);
  const tally: Tally = {
    total: rows.length,
    alreadyStructured: 0,
    toWrite: 0,
    written: 0,
    failed: 0,
    kinds: { attack: 0, save: 0, multiattack: 0, options: 0, other: 0 },
    review: 0,
    extractedApplied: 0,
    extractedStale: 0,
  };
  const pending: { id: string; next: unknown }[] = [];

  for (const row of rows) {
    // Only the shared library has agent extractions.
    const result = expandStatBlock(row.stat_block, table === "library_monsters" ? extractions.get(row.id) : undefined);
    if (result.alreadyStructured) tally.alreadyStructured++;
    for (const kind of Object.keys(tally.kinds) as (keyof Tally["kinds"])[]) tally.kinds[kind] += result.stats.kinds[kind];
    tally.review += result.stats.review;
    tally.extractedApplied += result.stats.extractedApplied;
    tally.extractedStale += result.stats.extractedStale;
    if (result.changed && !isDeepStrictEqual(result.next, row.stat_block)) pending.push({ id: row.id, next: result.next });
  }
  tally.toWrite = pending.length;

  if (write) {
    for (let i = 0; i < pending.length; i += WRITE_CONCURRENCY) {
      const batch = pending.slice(i, i + WRITE_CONCURRENCY);
      const ok = await Promise.all(batch.map((p) => writeRow(target, table, p.id, p.next)));
      for (const success of ok) {
        if (success) tally.written++;
        else tally.failed++;
      }
    }
  }
  return tally;
}

export function print(table: Table, t: Tally, write: boolean): void {
  console.log(`\n${table}`);
  console.log(`  rows total               ${t.total}`);
  console.log(`  rows already structured  ${t.alreadyStructured}`);
  console.log(`  rows to write            ${t.toWrite}`);
  if (write) console.log(`  rows written / failed    ${t.written} / ${t.failed}`);
  console.log(
    `  entries by kind          attack ${t.kinds.attack}, save ${t.kinds.save}, multiattack ${t.kinds.multiattack}, options ${t.kinds.options}, other ${t.kinds.other}`,
  );
  console.log(`  entries with review      ${t.review}`);
  console.log(`  extracted applied/stale  ${t.extractedApplied} / ${t.extractedStale}`);
}

export interface BlockerCount {
  total: number;
  unstructured: number;
  textWithoutDefenses: number;
  /** Rows still carrying any of the four old defense strings (0 once the contract migration has run). */
  withLegacyStrings: number;
}

const LEGACY_KEYS = ["damage_resistances", "damage_immunities", "damage_vulnerabilities", "condition_immunities"];

/** How many rows of a table the contract migration would refuse right now (`contractBlocker`). */
export async function countBlockers(target: Target, table: Table): Promise<BlockerCount> {
  const rows = await readRows(target, table);
  const count: BlockerCount = { total: rows.length, unstructured: 0, textWithoutDefenses: 0, withLegacyStrings: 0 };
  for (const row of rows) {
    const blocker = contractBlocker(row.stat_block);
    if (blocker === "unstructured") count.unstructured++;
    if (blocker === "text-without-defenses") count.textWithoutDefenses++;
    const block = row.stat_block;
    if (typeof block === "object" && block !== null && LEGACY_KEYS.some((k) => k in block)) count.withLegacyStrings++;
  }
  return count;
}
