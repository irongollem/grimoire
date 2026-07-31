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
 * in production (library_spells, library_monsters) and changing the format would
 * break every existing reference to them.
 *
 * The `srd_` here deliberately survived #583, which renamed the shared tables
 * to `library_*` but left row ids alone. The name is kept for the same reason:
 * this function's output IS an `srd_`-prefixed id, and calling it
 * `stableLibraryId` would describe the ids as something they are not. Ids are
 * never shown to users, so the misnomer costs nothing here — whereas re-keying
 * 6,739 rows would mean remapping twelve referrer columns, five of them jsonb,
 * with one id sitting inside user prose in `notes.content`. See
 * supabase/checks/content_integrity.sql for what guards that blast radius.
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

/**
 * Open5e v2 license keys that permit hosted redistribution of the content
 * they're attached to. Any key outside this set, or a document with no
 * license keys at all, must be refused rather than defaulted to allowed (see
 * `isRedistributable`).
 *
 * `orc` (the ORC License) is included even though Open5e's own API never
 * emits it: Kobold Press's site states the Black Flag Reference Document is
 * ORC-licensed, but Open5e's license taxonomy has no ORC entry, so it tags
 * that document `cc-by-40` instead (the nearest bucket it has). Upstream
 * license metadata is authoritative-ish, not gospel — `content_sources` rows
 * with `is_metadata_curated: true` (Black Flag among them) hand-correct
 * exactly this kind of upstream mistake, and `scripts/seed-content-sources.ts`
 * must never let a re-seed clobber that correction back to `cc-by-40`.
 */
export const REDISTRIBUTABLE_LICENSE_KEYS = ["ogl-10a", "cc-by-40", "cc0", "orc"] as const;

/**
 * Maps OUR `source_document_key` values to the current Open5e v2 document
 * key, for the documents where the two differ. These are PRE-v2 Open5e
 * slugs that are still live as `source_document_key` on rows already in
 * production (library_monsters, library_spells, library_items, library_species) — they must
 * NEVER be "cleaned up" to match the upstream key, or every existing row
 * referencing them would silently orphan from its source document.
 *
 * Keys not listed here (`srd-2014`, `srd-2024`, `tob`, `tob2`, `tob3`,
 * `tob-2023`, `toh`, `kp`) are already identical upstream and need no alias.
 * `grimoire-bundled` is our own non-Open5e content and must never be looked
 * up against this map or fetched upstream.
 */
export const LEGACY_DOCUMENT_KEY_ALIASES: Readonly<Record<string, string>> = {
  cc: "ccdx",
  blackflag: "bfrd",
  menagerie: "a5e-mm",
  dmag: "deepm",
  "dmag-e": "deepmx",
  warlock: "wz",
  a5e: "a5e-ag",
  o5e: "open5e",
  taldorei: "tdcs",
};

/** Every license key attached to a document; `[]` when the document has none. */
export function licenseKeysFor(document: Open5eDocumentRef): string[] {
  return document.licenses?.map((license) => license.key) ?? [];
}

/**
 * True only when a document carries at least one license AND every one of
 * its license keys is in `REDISTRIBUTABLE_LICENSE_KEYS`. A document with an
 * empty or missing `licenses` array is NOT redistributable — unknown
 * licensing is always a refusal, never a default-allow.
 */
export function isRedistributable(document: Open5eDocumentRef): boolean {
  const keys = licenseKeysFor(document);
  const allowed = new Set<string>(REDISTRIBUTABLE_LICENSE_KEYS);
  return keys.length > 0 && keys.every((key) => allowed.has(key));
}

/**
 * Comma-space joined license key list, matching the format already stored in
 * `source_license` on existing rows (e.g. `"cc-by-40, ogl-10a"`) — mirrors
 * `src/lib/library/open5eSpellImport.ts`'s `document.licenses?.map(...).join(", ")`
 * exactly so old and new rows agree. `null` for an empty list.
 */
export function formatLicenseKeys(keys: readonly string[]): string | null {
  return keys.length ? keys.join(", ") : null;
}

/**
 * Looks up a document by key in a document-metadata map and formats its
 * license keys for `source_license`; `null` when the document is missing
 * from the map (no metadata plumbed through) or carries no licenses at all.
 * Shared by every Open5e mapper (monster/item/species) that plumbs a
 * `Map<string, Open5eDocumentRef>` — built from `fetchOpen5eDocumentRefs()`
 * — through to populate `source_license`. `open5eSpellImport.ts` predates
 * this helper and has its own equivalent inline; left as-is intentionally.
 */
export function licenseForDocumentKey(
  documentMetadata: ReadonlyMap<string, Open5eDocumentRef> | undefined,
  documentKey: string,
): string | null {
  const document = documentMetadata?.get(documentKey);
  return document ? formatLicenseKeys(licenseKeysFor(document)) : null;
}

/** Raw Open5e v2 `/v2/documents/` list — every field (`licenses`, `publisher`, `permalink`, `gamesystem`) intact, undiscarded. */
export async function fetchOpen5eDocumentRefs(): Promise<Open5eDocumentRef[]> {
  return fetchAll<Open5eDocumentRef>("https://api.open5e.com/v2/documents/");
}

/**
 * Document keys for every 5e-gamesystem document (2014 or 2024) that ALSO
 * permits hosted redistribution, excluding a5e and other non-5e gamesystems.
 * A document whose license doesn't clear `isRedistributable` is filtered out
 * here just as firmly as an unsupported gamesystem — this is the "--all"
 * seeding path's own defense against ingesting content we may not host.
 */
export async function fetchSupported5eDocumentKeys(): Promise<string[]> {
  const documents = await fetchOpen5eDocumentRefs();
  return documents
    .filter((document) => rulesetForDocument(document) !== null && isRedistributable(document))
    .map((document) => document.key);
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
