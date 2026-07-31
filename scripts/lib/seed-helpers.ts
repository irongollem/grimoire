#!/usr/bin/env tsx
/**
 * Shared helpers for SRD seeding scripts (spells, monsters) — Open5e v2.
 * Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in environment.
 */

import { createClient, type SupabaseClient, type PostgrestError } from "@supabase/supabase-js";
import { isRedistributable, licenseKeysFor, LEGACY_DOCUMENT_KEY_ALIASES, type Open5eDocumentRef } from "@/lib/open5eApi";

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

// ── Supabase client ──────────────────────────────────────────────────────────

/**
 * Builds a service-role Supabase client for seed scripts — bypasses RLS,
 * no browser session to persist/refresh. Mirrors the reference pattern in
 * scripts/lib/import-chapter-npcs-db.ts's createServiceClient().
 */
export function createServiceClient(env: SupabaseEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Paginated reads ──────────────────────────────────────────────────────────

const READ_PAGE_SIZE = 1000;

/** Shape of a single `.range()` page response — matches supabase-js's PostgrestResponse. */
export interface PageResult<T> {
  data: T[] | null;
  error: PostgrestError | null;
}

/**
 * Paginated Supabase read via `.range()` loops. PostgREST caps a plain
 * (unpaginated) GET at its `max-rows` setting — observed as ~1000 on this
 * project — so a table like library_spells (~1400 rows) silently truncates
 * under a single unpaginated query. Loops via `.range(from, to)` until a
 * short page (fewer than `READ_PAGE_SIZE` rows) signals the end,
 * concatenating every page's rows.
 *
 * `fetchPage` gets the `[from, to]` bounds for one page and must return the
 * already-filtered/selected query response (i.e. call `.range(from, to)` as
 * the last step before awaiting) — this keeps the helper agnostic to which
 * table/columns/filters a given call site needs.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await fetchPage(offset, offset + READ_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
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
export async function upsertBatch<T extends object>(
  supabase: SupabaseClient,
  table: string,
  rows: ReadonlyArray<T>,
  onConflict: string,
  batchSize = 50,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw error;
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

// ── redistribution guard ─────────────────────────────────────────────────────

/**
 * Refuses to seed any requested document key that either doesn't resolve to
 * a real upstream Open5e v2 document, or resolves to one whose license(s)
 * don't clear `isRedistributable` — an unknown/unreviewed license is always a
 * refusal, never a default-allow. This is the guard that makes an explicit
 * `npm run seed-library-monsters some-unreviewed-key` fail just as firmly as
 * `--all` (which already only ever offers redistributable keys, via
 * `fetchSupported5eDocumentKeys`).
 *
 * `requestedKeys` are OUR keys (bare CLI args, e.g. "cc", "taldorei") — each
 * is translated through `LEGACY_DOCUMENT_KEY_ALIASES` to the current Open5e
 * v2 key before being looked up in `documents` (as fetched via
 * `fetchOpen5eDocumentRefs()`). `grimoire-bundled` is never an Open5e
 * document and must never be passed in `requestedKeys` — callers scope this
 * to the document keys they're about to fetch FROM Open5e, not to any
 * grimoire-owned bundled content they seed alongside it.
 *
 * Pure and synchronous so it stays trivially testable: callers fetch
 * `documents` once (typically via `fetchOpen5eDocumentRefs()`) and pass the
 * result straight through.
 */
export function assertRedistributableDocuments(
  requestedKeys: readonly string[],
  documents: readonly Open5eDocumentRef[],
): void {
  const byKey = new Map(documents.map((document) => [document.key, document]));
  const problems: string[] = [];

  for (const requestedKey of requestedKeys) {
    const upstreamKey = LEGACY_DOCUMENT_KEY_ALIASES[requestedKey] ?? requestedKey;
    const document = byKey.get(upstreamKey);
    if (!document) {
      problems.push(`"${requestedKey}" (looked up as "${upstreamKey}"): no such Open5e v2 document`);
      continue;
    }
    if (!isRedistributable(document)) {
      const keys = licenseKeysFor(document);
      const licenseDesc = keys.length ? keys.join(", ") : "no licenses listed";
      problems.push(`"${requestedKey}" (looked up as "${upstreamKey}"): license(s) [${licenseDesc}] do not permit hosted redistribution`);
    }
  }

  if (problems.length) {
    throw new Error(
      `Refusing to seed: the following document key(s) are unknown or not cleared for hosted redistribution:\n` +
        problems.map((problem) => `  - ${problem}`).join("\n"),
    );
  }
}
