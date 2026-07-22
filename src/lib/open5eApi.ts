import type { RulesetKey } from "@/types/ruleset.types";

export interface Open5eListResponse<T> {
  count: number;
  next: string | null;
  results: T[];
}

export async function fetchAll<T>(baseUrl: string): Promise<T[]> {
  const results: T[] = [];
  const sep = baseUrl.includes("?") ? "&" : "?";
  let url: string | null = `${baseUrl}${sep}limit=500&format=json`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`open5e fetch failed: ${res.status} ${url}`);
    const json = (await res.json()) as Open5eListResponse<T>;
    results.push(...json.results);
    url = json.next;
  }
  return results;
}

/** Shared shape of an Open5e v2 `document` reference, as embedded on records or listed at /v2/documents/. */
export interface Open5eDocumentRef {
  key: string;
  name: string;
  display_name?: string;
  permalink?: string | null;
  publisher?: { name: string; key: string };
  gamesystem?: { name: string; key: string };
  licenses?: Array<{ name: string; key: string }>;
}

/**
 * Canonical slugify: lowercases, collapses any run of non-alphanumeric
 * characters to a single underscore, and trims leading/trailing underscores.
 * The one shared implementation of a pattern every Open5e mapper (and the
 * seed scripts) used to duplicate locally — conceptual keys, app-facing SRD
 * ids, and legacy item slugs all derive from this.
 */
export function slugifyKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Derives a stable, app-facing id (e.g. `srd_srd_2024_owlbear`) from an
 * Open5e v2 `source_record_key`. Open5e record keys are frequently already
 * "srd"/"srd-2024"-prefixed themselves (e.g. "srd-2024_owlbear"), so
 * prefixing again yields a double `srd_srd_…` id — this is INTENTIONAL and
 * must not be "cleaned up": ids of this exact double-prefixed shape are live
 * in production (srd_spells, srd_monsters) and changing the format would
 * break every existing reference to them.
 */
export function stableSrdId(sourceRecordKey: string): string {
  return `srd_${slugifyKey(sourceRecordKey)}`;
}

/** Maps an Open5e document's gamesystem to our ruleset key; null for non-5e gamesystems (e.g. a5e) or unset ones. */
export function rulesetForDocument(document: Open5eDocumentRef | null | undefined): RulesetKey | null {
  const key = document?.gamesystem?.key?.toLowerCase();
  if (key === "5e-2024") return "2024";
  if (key === "5e-2014" || key === "5e") return "2014";
  return null;
}

/** Document keys for every 5e-gamesystem document (2014 or 2024), excluding a5e and other non-5e gamesystems. */
export async function fetchSupported5eDocumentKeys(): Promise<string[]> {
  const documents = await fetchAll<Open5eDocumentRef>("https://api.open5e.com/v2/documents/");
  return documents.filter((document) => rulesetForDocument(document) !== null).map((document) => document.key);
}

/**
 * Fetches a v2 list endpoint scoped to the given document keys via `document__key__in`.
 *
 * `?document__key=` is SILENTLY IGNORED on /v2/items/, /v2/weapons/, and /v2/magicitems/ —
 * those endpoints return the full, unfiltered, cross-publisher set with no error. Never
 * "simplify" this back to `document__key`; `document__key__in` is the only filter that
 * actually works on every v2 endpoint. As a guard against that failure mode recurring
 * (here or on some future endpoint), every returned record's document key is asserted
 * against the requested set.
 */
export async function fetchAllFromDocuments<T extends { document: { key: string } }>(
  baseUrl: string,
  documentKeys: string[],
): Promise<T[]> {
  const sep = baseUrl.includes("?") ? "&" : "?";
  const url = `${baseUrl}${sep}document__key__in=${encodeURIComponent(documentKeys.join(","))}`;
  const results = await fetchAll<T>(url);
  const allowed = new Set(documentKeys);
  const stray = results.find((record) => !allowed.has(record.document.key));
  if (stray) {
    throw new Error(
      `${baseUrl}: document__key__in filter was not honored — received a record from document "${stray.document.key}", outside the requested set`,
    );
  }
  return results;
}
