#!/usr/bin/env tsx
/**
 * Shared helpers for SRD seeding scripts (spells, monsters) — Open5e v2.
 * Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in environment.
 */

export interface SupabaseEnv {
  supabaseUrl: string;
  serviceKey: string;
}

/**
 * Validates required env vars and returns them. Exits the process (not a
 * thrown error) on failure, matching the other seed/import scripts' CLI
 * convention. `process.exit()` is typed `never`, so callers get a
 * non-nullable `SupabaseEnv` back with no `?? ""` coercion anywhere.
 */
export function requireEnv(): SupabaseEnv {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
    process.exit(1);
  }
  return { supabaseUrl, serviceKey };
}

// ── Open5e User-Agent ────────────────────────────────────────────────────────
// Open5e's Cloudflare 403s requests with a missing/blocklisted User-Agent
// (see supabase/functions/sync-srd-rules/index.ts's FETCH_HEADERS for the
// convention). The shared mappers in src/lib/open5e*Import.ts also run in
// the browser, where "User-Agent" can't be set on fetch — so the header is
// injected only here, at the Node seed entrypoint, via a scoped monkeypatch
// of global fetch, rather than in the shared (browser-safe) mapper code.

const OPEN5E_USER_AGENT = "grimoire-seed-script (+https://dungeongrimoire.com)";
const OPEN5E_HOST = "api.open5e.com";

// Node's global `fetch` type (from @types/node's web-globals/fetch.d.ts) doesn't
// expose the DOM lib's `HeadersInit`/`RequestInfo` aliases, so headers/input are
// typed directly off `RequestInit`/the global `fetch` signature instead.
type FetchHeaders = RequestInit["headers"];
type FetchInput = Parameters<typeof fetch>[0];

/** Pure: adds the Open5e User-Agent header only for requests to api.open5e.com. */
export function withOpen5eUserAgent(url: string, headers?: FetchHeaders): FetchHeaders | undefined {
  if (!url.includes(OPEN5E_HOST)) return headers;
  const merged = new Headers(headers);
  merged.set("User-Agent", OPEN5E_USER_AGENT);
  return merged;
}

/** Wraps globalThis.fetch so every Open5e request carries a descriptive User-Agent. */
export function installOpen5eUserAgent(): void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: FetchInput, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return originalFetch(input, { ...init, headers: withOpen5eUserAgent(url, init?.headers) });
  }) as typeof fetch;
}

// ── Supabase REST ──────────────────────────────────────────────────────────────

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export async function supabaseRequest(env: SupabaseEnv, path: string, options: RequestOptions = {}): Promise<unknown> {
  const { headers: extraHeaders, ...restOptions } = options;
  const res = await fetch(`${env.supabaseUrl}/rest/v1${path}`, {
    ...restOptions,
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
      ...extraHeaders,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${path}: HTTP ${res.status} — ${text}`);
  return text ? JSON.parse(text) : [];
}

const READ_PAGE_SIZE = 1000;

/**
 * Paginated Supabase REST GET. PostgREST caps a plain (unpaginated) GET at
 * its `max-rows` setting — observed as ~1000 on this project — so a table
 * like srd_spells (~1400 rows) silently truncates under `supabaseRequest`
 * alone. Loops via `?limit=&offset=` (appended after any existing query
 * string) until a short page (fewer than `READ_PAGE_SIZE` rows) signals the
 * end, concatenating every page's rows.
 */
export async function supabaseRequestPaginated<T>(
  env: SupabaseEnv,
  path: string,
  options: RequestOptions = {},
): Promise<T[]> {
  const sep = path.includes("?") ? "&" : "?";
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const page = (await supabaseRequest(
      env,
      `${path}${sep}limit=${READ_PAGE_SIZE}&offset=${offset}`,
      options,
    )) as T[];
    all.push(...page);
    if (page.length < READ_PAGE_SIZE) break;
    offset += READ_PAGE_SIZE;
  }
  return all;
}

/**
 * Upserts rows keyed on `onConflict` — pass the table's source-identity
 * unique constraint columns (`source_document_key,source_record_key`), NOT
 * the `id` primary key. `id` is an app-facing convenience key; source
 * identity is the real re-run/dedup identity per the versioning migrations
 * (20260720000012, 20260720000018).
 */
export async function upsertBatch<T>(
  env: SupabaseEnv,
  table: string,
  rows: ReadonlyArray<T>,
  onConflict: string,
  batchSize = 50,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    await supabaseRequest(env, `/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + batchSize)),
    });
    process.stdout.write(`\r  Upserted ${Math.min(i + batchSize, rows.length)} / ${rows.length}`);
  }
  console.log();
}

// ── CLI arg parsing ─────────────────────────────────────────────────────────────

export interface ParsedSeedArgs {
  list: boolean;
  all: boolean;
  dryRun: boolean;
  /** Explicit Open5e v2 document keys passed as bare args, e.g. "srd-2014". */
  documentKeys: string[];
}

/** Pure: parses the CLI flags/args shared by both seed scripts. */
export function parseSeedCliArgs(args: readonly string[]): ParsedSeedArgs {
  return {
    list: args.includes("--list"),
    all: args.includes("--all"),
    dryRun: args.includes("--dry-run"),
    documentKeys: args.filter((arg) => !arg.startsWith("--")),
  };
}

/** Default seed scope: both 2014 (SRD 5.1) and 2024 (SRD 5.2) documents. */
export const DEFAULT_SRD_DOCUMENT_KEYS: readonly string[] = ["srd-2014", "srd-2024"];

export interface DocumentSummary {
  slug: string;
  title: string;
}

export function printAvailableDocuments(docs: ReadonlyArray<DocumentSummary>): void {
  docs.forEach((doc) => console.log(`  ${doc.slug.padEnd(30)} ${doc.title}`));
}

/** Pure: tallies mapped rows per ruleset, for the --dry-run summary. */
export function countByRuleset(rows: ReadonlyArray<{ ruleset: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.ruleset] = (counts[row.ruleset] ?? 0) + 1;
  return counts;
}
