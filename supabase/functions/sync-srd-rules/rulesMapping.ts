/**
 * Pure mapping layer for sync-srd-rules — NO Deno/network imports — so it can be
 * unit-tested by vitest (Node) AND imported by the Deno edge function. Turns
 * Open5e v2 `/v2/rulesets/` (sections/groupings, e.g. "Combat") and `/v2/rules/`
 * (glossary entries) into `srd_rules` rows for both the 2014 and 2024 editions.
 *
 * Tree shape: a ruleset becomes a top-level (parent) row; each rule nests under
 * its parent via `parent_slug` = the ruleset's `key`. Verified against the live
 * API (2026-07-22): ruleset keys and rule keys never collide with each other,
 * so `slug` (used for the client-side tree lookup) can be the record's own
 * Open5e `key` directly — it doubles as `source_record_key`.
 */

export type RulesetEdition = "2014" | "2024";

export interface Open5eListResponse<T> {
  count: number;
  next: string | null;
  results: T[];
}

export interface Open5eV2Ruleset {
  key: string;
  name: string;
  desc: string;
  document: { key: string };
}

export interface Open5eV2Rule {
  key: string;
  name: string;
  desc: string;
  document: string; // document key, e.g. "srd-2014" — a bare string here (unlike Open5eV2Ruleset.document)
  ruleset: string; // parent ruleset's `key`
  index: number;
}

export interface SrdRuleRow {
  slug: string;
  name: string;
  content: string;
  parent_slug: string | null;
  doc_slug: string;
  ruleset: RulesetEdition;
  conceptual_key: string;
  source_document_key: string;
  source_record_key: string;
  source_revision: string;
  source_license: string;
  provenance: Record<string, unknown>;
}

/** The two documents this sync fetches — used to build the `document__key__in` filter. */
export const DOCUMENT_KEYS = ["srd-2014", "srd-2024"] as const;

const EDITION_BY_DOCUMENT: Record<string, RulesetEdition> = {
  "srd-2014": "2014",
  "srd-2024": "2024",
};

// Open5e's /v2/documents/ entries for srd-2014 / srd-2024 (verified 2026-07-22):
// srd-2014 (SRD 5.1) ships under CC-BY-4.0 + OGL 1.0a; srd-2024 (SRD 5.2) is
// CC-BY-4.0 only (no OGL). Hardcoded since these two documents' licensing is
// fixed — mirrors the license-key-join convention used by open5eBackgroundImport.ts.
const LICENSE_BY_DOCUMENT: Record<string, string> = {
  "srd-2014": "cc-by-40, ogl-10a",
  "srd-2024": "cc-by-40",
};

export function editionForDocument(documentKey: string): RulesetEdition {
  const edition = EDITION_BY_DOCUMENT[documentKey];
  if (!edition) {
    throw new Error(`sync-srd-rules: unexpected Open5e document key "${documentKey}"`);
  }
  return edition;
}

export function licenseForDocument(documentKey: string): string {
  const license = LICENSE_BY_DOCUMENT[documentKey];
  if (!license) {
    throw new Error(`sync-srd-rules: unexpected Open5e document key "${documentKey}"`);
  }
  return license;
}

/**
 * Slugify a display name into a conceptual key, matching the SQL convention used
 * for `conceptual_key` elsewhere (migration 20260720000018): lowercase, runs of
 * non-alphanumerics collapsed to a single underscore, leading/trailing
 * underscores trimmed.
 */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** A v2 ruleset ("Combat", "Exploration", …) becomes the Compendium sidebar's
 * top-level category node. */
export function buildRulesetRow(ruleset: Open5eV2Ruleset): SrdRuleRow {
  const documentKey = ruleset.document.key;
  return {
    slug: ruleset.key,
    name: ruleset.name,
    content: ruleset.desc,
    parent_slug: null,
    doc_slug: documentKey,
    ruleset: editionForDocument(documentKey),
    conceptual_key: slugifyName(ruleset.name),
    source_document_key: documentKey,
    source_record_key: ruleset.key,
    source_revision: "open5e-v2",
    source_license: licenseForDocument(documentKey),
    provenance: { source: "open5e", api_version: "v2", endpoint: "rulesets" },
  };
}

/** A v2 rule (glossary entry) becomes a leaf row nested under its parent ruleset. */
export function buildRuleRow(rule: Open5eV2Rule): SrdRuleRow {
  const documentKey = rule.document;
  return {
    slug: rule.key,
    name: rule.name,
    content: rule.desc,
    parent_slug: rule.ruleset,
    doc_slug: documentKey,
    ruleset: editionForDocument(documentKey),
    conceptual_key: slugifyName(rule.name),
    source_document_key: documentKey,
    source_record_key: rule.key,
    source_revision: "open5e-v2",
    source_license: licenseForDocument(documentKey),
    provenance: { source: "open5e", api_version: "v2", endpoint: "rules", index: rule.index },
  };
}
