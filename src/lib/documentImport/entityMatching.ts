/**
 * The document importer's per-entity DECISION model — link to an existing
 * row, create a fresh one, generate one (monsters only), or ignore the
 * extraction entirely.
 *
 * This replaced #837/#838's "selected + linked" model, which only ever asked
 * one question per entity ("create, or link to the one best match?") and only
 * for monsters and items. The candidates themselves now come from
 * `public.match_import_entity_names` (name tier) plus an embedding fallback,
 * both wrapped by the `import-match` edge function — every kind that can
 * duplicate something the DM already owns (npcs, factions, locations,
 * encounters, monsters, items, spells; quests are a duplicate *warning* only,
 * see `defaultDecision` below) gets candidates, not just the original two.
 *
 * Pure by the same rule as `importPlan.ts` and `normalize.ts`: no Supabase
 * client, no network. `parseImportMatches` is the untrusted-JSON boundary —
 * everything past it is a validated `EntityCandidate`, never a guess.
 */
import type { ImportEntityKind } from "@/types/documentImport.types";

// ── Candidates ───────────────────────────────────────────────────────────────

/** Where a candidate row lives — the caller's own campaign (or their global,
 *  campaign-less rows) versus the shared library. Mirrors the RPC's own
 *  `source` column (`match_import_entity_names`). */
export type EntityMatchSource = "campaign" | "library";

/**
 * How a candidate was found. `exact`/`contains` are the name tier
 * (`match_import_entity_names`, whole-word substring in either direction);
 * `similar` is the embedding fallback the edge function adds on top, for a
 * renamed variant or a creature described but never named on the page.
 */
export type EntityMatchKind = "exact" | "contains" | "similar";

/** One existing row the DM might mean to reuse instead of creating a
 *  duplicate. */
export interface EntityCandidate {
  /** A campaign row's uuid, or a library row's stable text id — never both;
   *  `source` says which. */
  targetId: string;
  source: EntityMatchSource;
  /** The existing row's own name, which may differ from what the page
   *  printed ("Icewind kobold" query → "Kobold" matched). */
  name: string;
  matchKind: EntityMatchKind;
  /** A short qualifier for display — a publisher/ruleset for a library hit
   *  ("Black Flag SRD"), or a free-text hint for a campaign hit ("blacksmith").
   *  `null` when the source has nothing to show. */
  detail: string | null;
  /** Cosine distance for a `similar` candidate; `null` for `exact`/`contains`,
   *  which have no embedding involved. */
  distance: number | null;
}

// ── Decisions ────────────────────────────────────────────────────────────────

/**
 * What the DM chose to do with one extracted entity. Every kind supports
 * `link`/`create`/`ignore`; `generate` exists only for monsters (see
 * `canCreateFromPage` and `defaultDecision` below) — nothing stops another
 * kind's decision map from holding one structurally, but `runImportKind.ts`
 * only ever honours it for `kind === "monsters"`.
 */
export type ImportDecision =
  | { action: "link"; candidate: EntityCandidate }
  | { action: "create" }
  | { action: "generate" }
  | { action: "ignore" };

// ── Parsing the edge function's response ────────────────────────────────────

function asMatchSource(value: unknown): EntityMatchSource | null {
  return value === "campaign" || value === "library" ? value : null;
}

function asMatchKind(value: unknown): EntityMatchKind | null {
  return value === "exact" || value === "contains" || value === "similar" ? value : null;
}

function asImportEntityKind(value: string): value is ImportEntityKind {
  return (
    value === "monsters" ||
    value === "npcs" ||
    value === "locations" ||
    value === "items" ||
    value === "spells" ||
    value === "quests" ||
    value === "factions" ||
    value === "encounters"
  );
}

/**
 * Validates one raw candidate field by field, dropping it (never guessing a
 * value) the moment anything required is missing or the wrong shape — the
 * same non-guessing rule `entityMatching.ts`'s predecessor and
 * `resolveLinks` (importPlan.ts) both follow. `detail` and `distance` are the
 * two genuinely optional fields; everything else is required.
 *
 * Reads the same camelCase field names `EntityCandidate` itself uses —
 * `supabase/functions/import-match/matching.ts`'s own `Candidate` type
 * already carries `targetId`/`source`/`name`/`matchKind`/`detail`/`distance`,
 * built there from the (snake_case) `match_import_entity_names` RPC rows, so
 * this boundary has nothing left to rename, only to verify.
 */
function asEntityCandidate(raw: unknown): EntityCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;

  const targetId = rec.targetId;
  const source = asMatchSource(rec.source);
  const name = rec.name;
  const matchKind = asMatchKind(rec.matchKind);
  if (typeof targetId !== "string" || targetId.length === 0) return null;
  if (!source) return null;
  if (typeof name !== "string" || name.length === 0) return null;
  if (!matchKind) return null;

  const rawDetail = rec.detail;
  const detail = typeof rawDetail === "string" && rawDetail.length > 0 ? rawDetail : null;

  const rawDistance = rec.distance;
  const distance = typeof rawDistance === "number" && Number.isFinite(rawDistance) ? rawDistance : null;

  return { targetId, source, name, matchKind, detail, distance };
}

/**
 * Parses the `import-match` edge function's response —
 * `{ matches: { [kind]: { [ref]: Candidate[] } }, semantic: boolean }` — from
 * `unknown`. `semantic` reports whether the embedding tier actually ran (it
 * can be skipped, e.g. on a provider error), which the review surface uses to
 * explain why every candidate it shows is `exact`/`contains` only.
 *
 * A malformed `matches` entry (wrong kind key, wrong shape) is dropped rather
 * than thrown on — one bad candidate must not cost the DM every other kind's
 * matches, which already came back correctly.
 */
export function parseImportMatches(raw: unknown): {
  matches: Map<ImportEntityKind, Map<string, EntityCandidate[]>>;
  semantic: boolean;
} {
  const matches = new Map<ImportEntityKind, Map<string, EntityCandidate[]>>();
  if (!raw || typeof raw !== "object") return { matches, semantic: false };
  const rec = raw as Record<string, unknown>;

  const rawMatches = rec.matches;
  if (rawMatches && typeof rawMatches === "object") {
    for (const [kindKey, byRef] of Object.entries(rawMatches as Record<string, unknown>)) {
      if (!asImportEntityKind(kindKey)) continue;
      if (!byRef || typeof byRef !== "object") continue;

      const refMap = new Map<string, EntityCandidate[]>();
      for (const [ref, rawCandidates] of Object.entries(byRef as Record<string, unknown>)) {
        if (!Array.isArray(rawCandidates)) continue;
        const candidates = rawCandidates
          .map(asEntityCandidate)
          .filter((c): c is EntityCandidate => c !== null);
        if (candidates.length > 0) refMap.set(ref, candidates);
      }
      if (refMap.size > 0) matches.set(kindKey, refMap);
    }
  }

  const semantic = rec.semantic === true;
  return { matches, semantic };
}

// ── Can this kind's entity be created from what the page actually gave us? ──

/**
 * Monster-specific fields of `MonsterStatBlock` (`src/types/monster.types.ts`)
 * whose presence means the extractor actually recovered some crunch, rather
 * than the model returning an empty `{}` because the page named a creature
 * without ever printing its numbers. Deliberately every stat-block field, not
 * a hand-picked "important" subset: any one of them present is evidence of a
 * real stat block, and enumerating them here (rather than checking
 * `Object.keys(...).length > 0`) protects against a future field landing on
 * `ExtractedMonster.stat_block` that isn't really stat-block crunch.
 */
const MEANINGFUL_STAT_BLOCK_FIELDS = [
  "armor_class",
  "hit_points",
  "speed",
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
  "challenge_rating",
  "proficiency_bonus",
  "initiative_bonus",
  "saving_throws",
  "skills",
  "damage_vulnerabilities",
  "damage_resistances",
  "damage_immunities",
  "condition_immunities",
  "senses",
  "languages",
  "special_abilities",
  "actions",
  "bonus_actions",
  "reactions",
  "legendary_resistance",
  "legendary_actions",
  "lair_actions",
  "spellcasting",
] as const;

/** Whether a single stat-block field's value is real content rather than an
 *  empty placeholder (`""`, `[]`, `{}`) the model returned for a key it has
 *  no answer for. */
function isMeaningfulValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true; // a real number, e.g. `armor_class: 15` or `legendary_resistance: 3`
}

/**
 * A monster may be "created" from the page only when it carried a real stat
 * block — otherwise the row would land with `BLANK_MONSTER_STAT_BLOCK`
 * (`normalize.ts`), i.e. CR 0, 1 hit point, every ability score 10, and no
 * actions: a useless stub the DM would have to fully rebuild by hand, which
 * is strictly worse than the AI generator producing a real one from the same
 * name and description. Every other kind can always be created from the
 * page, because none of them has an equivalent "hollow but technically
 * valid" row shape — an NPC or location with only a name is still a normal,
 * usable starting point.
 */
export function canCreateFromPage(kind: ImportEntityKind, data: Record<string, unknown>): boolean {
  if (kind !== "monsters") return true;

  const statBlock = data.stat_block;
  if (!statBlock || typeof statBlock !== "object" || Array.isArray(statBlock)) return false;

  const rec = statBlock as Record<string, unknown>;
  return MEANINGFUL_STAT_BLOCK_FIELDS.some((field) => isMeaningfulValue(rec[field]));
}

// ── The default decision ────────────────────────────────────────────────────

/**
 * The product default for one entity, before the DM touches anything:
 *
 *   - any candidate at all → link to `candidates[0]` (the caller's own rank
 *     order — `match_import_entity_names` already sorts own-campaign before
 *     library, exact before contains, and the embedding tier is expected to
 *     merge in on the same convention), **except** quests;
 *   - quests always default to `create` — a printed adventure's headline
 *     quest is never linked, even when the campaign already has a
 *     same-titled quest. A quest candidate is a duplicate *warning* the
 *     review surface can show, not something this importer ever merges into;
 *   - a monster the page didn't give real stats for defaults to `generate`
 *     rather than `create`, since `create` would land a CR-0 stub
 *     (`canCreateFromPage`);
 *   - everything else defaults to `create`.
 */
export function defaultDecision(
  kind: ImportEntityKind,
  data: Record<string, unknown>,
  candidates: readonly EntityCandidate[],
): ImportDecision {
  if (kind !== "quests" && candidates.length > 0) {
    return { action: "link", candidate: candidates[0]! };
  }
  if (kind === "monsters" && !canCreateFromPage(kind, data)) {
    return { action: "generate" };
  }
  return { action: "create" };
}

// ── The one RPC path this module still serves directly ─────────────────────

/**
 * One row of `resolve_monster_references` (#837) — kept narrow and separate
 * from `EntityCandidate` above because `useDocumentImportRunner.ts` still
 * calls that RPC directly for encounter-combatant resolution only (a
 * combatant needs a single target id, never a ranked candidate list to show
 * the DM), and that RPC's row shape genuinely differs: `monster_id` /
 * `library_monster_id` instead of one `target_id` column, and only
 * `exact`/`contains` match kinds. `runImportKind.ts`'s `resolveMonsterNames`
 * dep only ever reads `targetId`, so nothing else is carried.
 */
export interface MonsterReferenceMatch {
  queryName: string;
  targetId: string;
}

/**
 * Normalizes `resolve_monster_references` rows, dropping any row missing
 * what it needs rather than guessing — same rule as `asEntityCandidate`
 * above and the predecessor this replaces.
 */
export function normalizeMonsterReferenceRows(rows: readonly unknown[]): MonsterReferenceMatch[] {
  const out: MonsterReferenceMatch[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;

    const queryName = rec.query_name;
    if (typeof queryName !== "string") continue;

    const source = asMatchSource(rec.source);
    if (!source) continue;

    const targetId = source === "campaign" ? rec.monster_id : rec.library_monster_id;
    if (typeof targetId !== "string" || targetId.length === 0) continue;

    out.push({ queryName, targetId });
  }
  return out;
}
