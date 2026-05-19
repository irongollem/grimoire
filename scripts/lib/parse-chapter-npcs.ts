/**
 * Pure parsing logic for chapter NPC markdown files.
 *
 * No I/O, no Supabase, no console output — keep this module testable.
 * The CLI entry point (`scripts/import-chapter-npcs.ts`) and the DB helpers
 * (`scripts/lib/import-chapter-npcs-db.ts`) consume what this module returns.
 *
 * ── Presence-check rule (REQUIRED INVARIANT) ──────────────────────────────
 *
 * Only NPCs with a top-level `## NAME` section header in the source markdown
 * are extracted. We do NOT infer NPCs from:
 *
 *   - `### NAME` subsection headers (used for nested groups like
 *     "### The Channel Camp's other Slips" — these are group prose, not
 *     individual NPC entries)
 *   - Inline `**Name**` bold within paragraphs (used in Ch4 to list
 *     background slips in a single sentence)
 *   - Bullet-point references (`- **Name** — ...`) used as cross-references
 *   - Body mentions of names already established elsewhere
 *
 * This is enforced by `splitNpcBlocks` splitting only on `\n## ` markers.
 * Do not relax this. Past ad-hoc imports inserted some inline-bold names by
 * hand; future imports should require those NPCs to be given their own
 * `## NAME` heading in the source if they're meant to exist as DB rows.
 */

import type { NpcRelationship, NpcStatus } from "@/types/npc.types";
import type { LocationType } from "@/types/location.types";

/** Top-level `## NAME` headings that are NOT NPCs and must be skipped. */
const SKIP_HEADING_PREFIXES = [
  "Chapter ",         // "Chapter One NPCs", "Chapter Five — NPCs"
  "Atlas Update",     // "Atlas Update Summary" (Ch5)
  "NPC Atlas",        // "NPC Atlas — Update Summary" (Ch4 variant)
  "Encountered ",     // prologue group heading
  "Available for ",   // prologue group heading
  "Locus NPCs",       // "Locus NPCs (Prologue Gazetteer)" + Ch4 "Locus NPCs — Full Entries"
  "Additional Locus", // Ch4 "Additional Locus NPCs (Background, Lightly Sketched)" group
  "Prologue ",        // prologue file title heading
];

/** Section headings we extract. Patterns tolerate trailing parentheticals. */
const SECTION_PATTERNS = {
  visual:      "(?:Visual(?:\\s+Description)?|Appearance)\\b",
  personality: "Personality\\b",
  background:  "Background\\b",
  speech:      "Speech and Mannerisms\\b",
  lens:        "Lens Variations\\b",
  emotional:   "Emotional Core\\b",
  encounters:  "Encounter Scenes\\b",
  carries:     "Cross-Chapter Carries\\b",
} as const;

/** Per-NPC override from a sidecar config file. */
export interface NpcOverride {
  display_name?: string;
  location?: string;
  status?: NpcStatus;
  relationship?: NpcRelationship;
  relevance?: number;
  /** Full tag replacement. */
  tags?: string[];
  /** Append-only tag merge. */
  extra_tags?: string[];
  race?: string;
  occupation?: string;
}

/** A location to create or reuse, declared in the sidecar config. */
export interface LocationSpec {
  key: string;
  name: string;
  type: LocationType;
  parent_name: string | null;
  description: string;
  tags: string[];
}

/** Shape of the sidecar JSON config (all fields optional). */
export interface SidecarConfig {
  default_location_key?: string;
  locations?: Array<{
    key: string;
    name: string;
    type?: LocationType;
    parent_name?: string;
    description?: string;
    tags?: string[];
  }>;
  npcs?: Record<string, NpcOverride>;
}

/**
 * A parsed NPC ready for insertion (or comparison against an existing DB row).
 * Fields are a strict subset of `NpcInsert` plus the unresolved `location_key`.
 */
export interface NpcRecord {
  /** Display name written to `npcs.name`. */
  name: string;
  /** Original `## ...` heading text, used to look up sidecar overrides. */
  raw_heading: string;
  race: string;
  occupation: string;
  appearance: string;
  personality: string;
  backstory: string;
  notes: string;
  status: NpcStatus;
  relationship: NpcRelationship;
  relevance: number;
  tags: string[];
  /** Key into the sidecar config's `locations` array (resolved to a UUID later). */
  location_key: string | null;
}

const VALID_STATUS: ReadonlySet<NpcStatus> = new Set(["alive", "dead", "missing", "unknown"]);
const VALID_RELATIONSHIP: ReadonlySet<NpcRelationship> = new Set(["ally", "enemy", "neutral", "unknown"]);

// ────────────────────────────────────────────────────────────────────────────
// String helpers
// ────────────────────────────────────────────────────────────────────────────

/** Lowercase, collapse non-alphanumeric runs to single hyphens, trim. */
export function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Re-export the shared name-matching primitives so existing import sites
// (`import { normalizeName, findPotentialDuplicates } from "./parse-chapter-npcs"`)
// keep working. The actual implementation — substring + Levenshtein fuzzy
// matching — lives in `./name-matching.ts` and is shared with the faiths
// importer's parser.
export { normalizeName, findPotentialDuplicates } from "./name-matching";

/** Remove a trailing `---` horizontal-rule fragment. */
function stripTrailingHr(text: string): string {
  return text.replace(/\n*-{3,}\s*$/, "").replace(/\s+$/, "");
}

/** First sentence, capped. */
function truncateFirstSentence(s: string, cap = 200): string {
  if (!s) return "";
  const m = s.match(/^[^.!?]*[.!?]/);
  const first = m ? m[0] : s;
  return first.slice(0, cap);
}

// ────────────────────────────────────────────────────────────────────────────
// Markdown extraction
// ────────────────────────────────────────────────────────────────────────────

/** Split markdown on top-level `## ` headings. */
export function splitNpcBlocks(text: string): Array<{ heading: string; body: string }> {
  const parts = text.split(/\n## /);
  const out: Array<{ heading: string; body: string }> = [];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i] ?? "";
    const nlIdx = part.indexOf("\n");
    const heading = (nlIdx === -1 ? part : part.slice(0, nlIdx)).trim();
    const body = nlIdx === -1 ? "" : part.slice(nlIdx + 1);
    out.push({ heading, body });
  }
  return out;
}

export function isSkipHeading(heading: string): boolean {
  return SKIP_HEADING_PREFIXES.some((p) => heading.startsWith(p));
}

/** Extract a `**Field:** value` line under an NPC heading. */
function parseMeta(body: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\*\\*${escaped}:\\*\\*\\s*(.*?)$`, "m");
  const m = body.match(re);
  return m ? (m[1] ?? "").trim() : "";
}

/**
 * Extract content of all `### <regex>` sections; concatenate with blank line.
 *
 * Note: we deliberately use the `g` flag without `m`. With `m`, `$` matches
 * end-of-line and the non-greedy capture truncates at the first paragraph
 * break. Without `m`, `$` matches end-of-string. We compensate for `^`'s
 * loss by using `(?:^|\n)` to anchor to line start.
 */
function parseSection(body: string, regex: string): string {
  const re = new RegExp(
    `(?:^|\\n)### (?:${regex})(?:\\s*\\([^)]*\\))?\\s*\\n([\\s\\S]*?)(?=\\n### |\\n## |$)`,
    "g",
  );
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const chunk = (m[1] ?? "").trim();
    if (chunk) parts.push(chunk);
  }
  return parts.join("\n\n");
}

// ────────────────────────────────────────────────────────────────────────────
// Tag derivation
// ────────────────────────────────────────────────────────────────────────────

function deriveDefaultTags(
  chapter: number,
  race: string,
  stage: string,
  role: string,
  locationKey: string | null,
): string[] {
  const tags: string[] = [`chapter-${chapter}`];
  const push = (t: string) => {
    if (t && !tags.includes(t)) tags.push(t);
  };

  if (race) {
    for (const tok of race.match(/[A-Za-z]+/g) ?? []) push(tok.toLowerCase());
  }
  if (stage) {
    const head = stage.split(/[(;.]/)[0] ?? "";
    const toks = (head.match(/[A-Za-z][A-Za-z-]+/g) ?? []).map(slug);
    for (const t of toks.slice(0, 3)) push(t);
  }
  if (role) {
    const head = role.split(/[.;,]/)[0] ?? "";
    const stop = new Set(["the", "a", "an", "of", "at", "in", "to", "for", "and", "or"]);
    const toks = (head.match(/[A-Za-z][A-Za-z-]+/g) ?? [])
      .map(slug)
      .filter((t) => t && !stop.has(t));
    for (const t of toks.slice(0, 2)) push(t);
  }
  if (locationKey) push(slug(locationKey));
  return tags;
}

// ────────────────────────────────────────────────────────────────────────────
// Per-NPC parsing
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse one `## NAME` block. Returns null for skip-headings.
 * Default status/relationship/relevance are applied here and may be overridden
 * by `applySidecar` later.
 */
export function parseNpc(
  heading: string,
  body: string,
  chapter: number,
  defaultLocationKey: string | null,
): NpcRecord | null {
  if (isSkipHeading(heading)) return null;

  const race = parseMeta(body, "Race");
  const stage = parseMeta(body, "Stage");
  const role = parseMeta(body, "Role");
  const age = parseMeta(body, "Apparent age");

  const appearance = stripTrailingHr(parseSection(body, SECTION_PATTERNS.visual));
  const personality = stripTrailingHr(parseSection(body, SECTION_PATTERNS.personality));
  const backstory = stripTrailingHr(parseSection(body, SECTION_PATTERNS.background));
  const speech = stripTrailingHr(parseSection(body, SECTION_PATTERNS.speech));
  const lens = stripTrailingHr(parseSection(body, SECTION_PATTERNS.lens));
  const emotional = stripTrailingHr(parseSection(body, SECTION_PATTERNS.emotional));
  const encounters = stripTrailingHr(parseSection(body, SECTION_PATTERNS.encounters));
  const carries = stripTrailingHr(parseSection(body, SECTION_PATTERNS.carries));

  const occupation = truncateFirstSentence(role);

  const notesParts: string[] = [];
  const pushBlock = (label: string, val: string) => {
    if (val) notesParts.push(`**${label}**\n${val}`);
  };
  pushBlock("Emotional Core", emotional);
  pushBlock("Stage", stage);
  pushBlock("Apparent age", age);
  if (role && role.length > occupation.length) pushBlock("Role", role);
  pushBlock("Speech and Mannerisms", speech);
  pushBlock("Lens Variations", lens);
  pushBlock("Encounter Scenes", encounters);
  pushBlock("Cross-Chapter Carries", carries);
  const notes = notesParts.join("\n\n");

  return {
    name: heading,
    raw_heading: heading,
    race,
    occupation,
    appearance,
    personality,
    backstory,
    notes,
    status: "alive",
    relationship: "neutral",
    relevance: 3,
    tags: deriveDefaultTags(chapter, race, stage, role, defaultLocationKey),
    location_key: defaultLocationKey,
  };
}

/** Merge sidecar overrides into parsed records. Mutates in place. */
export function applySidecar(records: NpcRecord[], config: SidecarConfig): void {
  const overrides = config.npcs ?? {};
  for (const r of records) {
    const ov = overrides[r.raw_heading];
    if (!ov) continue;

    if (ov.display_name) r.name = ov.display_name;
    if (ov.location !== undefined) r.location_key = ov.location;

    if (ov.status !== undefined) {
      if (!VALID_STATUS.has(ov.status)) {
        // eslint-disable-next-line no-console
        console.warn(`WARN: ${r.name}: status ${ov.status} not in ${[...VALID_STATUS].join("|")}`);
      }
      r.status = ov.status;
    }
    if (ov.relationship !== undefined) {
      if (!VALID_RELATIONSHIP.has(ov.relationship)) {
        // eslint-disable-next-line no-console
        console.warn(`WARN: ${r.name}: relationship ${ov.relationship} not in ${[...VALID_RELATIONSHIP].join("|")}`);
      }
      r.relationship = ov.relationship;
    }
    if (ov.relevance !== undefined) r.relevance = ov.relevance;

    if (ov.tags) {
      r.tags = [...ov.tags];
    } else if (ov.extra_tags) {
      for (const t of ov.extra_tags) {
        if (!r.tags.includes(t)) r.tags.push(t);
      }
    }
    if (ov.race !== undefined) r.race = ov.race;
    if (ov.occupation !== undefined) r.occupation = ov.occupation;

    // If config moved the NPC to a different location and didn't set tags,
    // tag the new location key.
    if (ov.location !== undefined && !ov.tags && !ov.extra_tags && r.location_key) {
      const lk = slug(r.location_key);
      if (lk && !r.tags.includes(lk)) r.tags.push(lk);
    }
  }
}

/** Resolve `LocationSpec`s from sidecar config + apply CLI default parent. */
export function resolveLocationSpecs(
  config: SidecarConfig,
  defaultParent: string | null,
): LocationSpec[] {
  return (config.locations ?? []).map((entry) => ({
    key: entry.key,
    name: entry.name,
    type: entry.type ?? "other",
    parent_name: entry.parent_name ?? defaultParent,
    description: entry.description ?? "",
    tags: [...(entry.tags ?? [])],
  }));
}
