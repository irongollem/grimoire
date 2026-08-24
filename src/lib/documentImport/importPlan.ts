/**
 * The document importer's (#353) insert planning and link resolution — the
 * pure logic between "the DM ticked these review cards" and "here is what the
 * composable sends to Supabase."
 *
 * Pure by the same rule as normalize.ts: no Supabase client, no network, no
 * Vue. This module never inserts a row; it decides *what* to insert, in what
 * order, and later how to fold the results (including a mid-batch quota
 * refusal) and any resolved cross-entity links back into a report the wizard
 * can render honestly.
 *
 * ── Why insert order is deterministic and caller-independent ────────────────
 *
 * `enforce_quota` is a BEFORE INSERT trigger (documentImport.types.ts header,
 * entityKinds.ts `quotaResource` doc), so a free DM importing 40 monsters can
 * be refused partway through — which monsters "partway" means depends
 * entirely on insert order. `buildImportPlan` orders the plan by `entities`'
 * own order (the extraction's page order), never by the iteration order of
 * whatever selection structure the UI happens to be using, so re-running an
 * import with the same selections always stops at the same monster.
 *
 * ── Why partial-failure accounting is a separate pass from planning ─────────
 *
 * The plan is built before a single row exists; the report can only be built
 * after the composable has actually attempted each insert (or been stopped by
 * a quota refusal partway through). `buildImportRunReport` is therefore fed
 * the outcomes the composable observed, not something this module could ever
 * compute itself — it has no way to know which rows landed. What it *does* own
 * is the policy of what a missing outcome means: a ref present in `plan` but
 * absent from `outcomes` was never attempted, which is what "stopped at 12 of
 * 40" actually looks like once the loop that hit quota stops trying the rest.
 *
 * ── Why link resolution reports two different write shapes ──────────────────
 *
 * Three of the four raw names `normalize.ts` defers (`EntityLinks`) resolve to
 * a plain FK column on the row that carries them: `locations.parent_id`,
 * `quests.giver_npc_id`, `quests.location_id`. NPC → faction is not a fourth
 * column — `npcs` has no `faction_id` at all. Faction membership is the
 * `faction_npcs` join table (id, faction_id, npc_id, role, status — see
 * `useFactions.ts` / `FactionNpc` in faction.types.ts), the same table a
 * hand-created membership goes through. `resolveLinks` reports which shape a
 * resolved link needs (`fk_update` vs. `join_insert`) rather than pretending
 * every link is a column update — the composable, which actually talks to
 * Supabase, still decides how to issue the write, but it doesn't have to
 * re-derive which of the four cases is the odd one out.
 */
import type { AiProvenance } from "@/ai/provenance";
import type {
  ExtractedEntity,
  ExtractedFaction,
  ExtractedItem,
  ExtractedLocation,
  ExtractedMonster,
  ExtractedNpc,
  ExtractedPayloadMap,
  ExtractedQuest,
  ExtractedSpell,
  ImportEntityKind,
} from "@/types/documentImport.types";
import { ENTITY_MAPPERS, type EntityLinks, type ImportRowMap, type MappedEntity } from "./normalize";

// ── Building the plan ────────────────────────────────────────────────────────

/** One row to insert, still carrying the `ref` it came from so the caller can
 *  correlate a later Supabase result (or error) back to the review card that
 *  produced it, and the raw-name `links` a second pass will try to resolve. */
export interface PlannedInsert<K extends ImportEntityKind = ImportEntityKind> {
  ref: string;
  row: ImportRowMap[K];
  links: EntityLinks;
}

/**
 * Dispatches to the one correctly-typed mapper in `ENTITY_MAPPERS` for `kind`.
 *
 * A direct `ENTITY_MAPPERS[kind](data, ...)` does not type-check when `kind`
 * and `data` are both generic in the same `K`: TypeScript does not narrow a
 * *derived* indexed-access type (`ExtractedPayloadMap[K]`) just because the
 * unrelated `kind` value has been compared to a literal in a switch —
 * "correlated records" narrowing like that is a known, still-open TypeScript
 * limitation (microsoft/TypeScript#33014), not something to work around with
 * `any`. The switch below gives the compiler a literal `kind` at each branch
 * so every `ENTITY_MAPPERS` call is the exact pair it was actually typed for;
 * the `as` casts only restate, at each already-proven-correct branch, what
 * `kind === K`'s single possible value in that branch already establishes.
 */
function mapEntity<K extends ImportEntityKind>(
  kind: K,
  data: ExtractedPayloadMap[K],
  campaignId: string,
  provenance: AiProvenance,
): MappedEntity<K> {
  switch (kind) {
    case "monsters":
      return ENTITY_MAPPERS.monsters(data as ExtractedMonster, campaignId, provenance) as MappedEntity<K>;
    case "npcs":
      return ENTITY_MAPPERS.npcs(data as ExtractedNpc, campaignId, provenance) as MappedEntity<K>;
    case "locations":
      return ENTITY_MAPPERS.locations(data as ExtractedLocation, campaignId, provenance) as MappedEntity<K>;
    case "items":
      return ENTITY_MAPPERS.items(data as ExtractedItem, campaignId, provenance) as MappedEntity<K>;
    case "spells":
      return ENTITY_MAPPERS.spells(data as ExtractedSpell, campaignId, provenance) as MappedEntity<K>;
    case "quests":
      return ENTITY_MAPPERS.quests(data as ExtractedQuest, campaignId, provenance) as MappedEntity<K>;
    case "factions":
      return ENTITY_MAPPERS.factions(data as ExtractedFaction, campaignId, provenance) as MappedEntity<K>;
  }
}

/**
 * Turns one wizard step's review-card selections into an ordered insert plan.
 *
 * `selectedRefs` accepts anything iterable of ref strings — a `Set` built from
 * checkbox state is the expected caller shape, but the order it iterates in is
 * never what decides plan order (see file header): `entities`' own order does.
 */
export function buildImportPlan<K extends ImportEntityKind>(
  kind: K,
  entities: readonly ExtractedEntity<K>[],
  selectedRefs: Iterable<string>,
  campaignId: string,
  provenance: AiProvenance,
): PlannedInsert<K>[] {
  const selected = new Set(selectedRefs);
  return entities
    .filter((entity) => selected.has(entity.ref))
    .map((entity) => {
      const { row, links } = mapEntity(kind, entity.data, campaignId, provenance);
      return { ref: entity.ref, row, links };
    });
}

// ── Partial-failure accounting ───────────────────────────────────────────────

/**
 * What actually happened when the composable tried to insert one planned row.
 * `quota_exceeded` is its own status rather than folding into `failed` because
 * it is the one outcome the wizard reacts to differently — it means "stop
 * attempting the rest of this kind," not "this particular row was bad." The
 * composable is expected to classify a caught error with `isQuotaExceeded`
 * (quotaError.ts) before reporting it here; this module has no Supabase error
 * shape to inspect and does not try to guess one.
 */
export type ImportRowOutcome =
  | { ref: string; status: "inserted"; id: string }
  | { ref: string; status: "quota_exceeded" }
  | { ref: string; status: "failed"; message: string };

/** `ImportRowOutcome` plus the fourth state a row can end up in: never attempted. */
export type ReportedRow = ImportRowOutcome | { ref: string; status: "not_attempted" };

export interface ImportRunReport {
  kind: ImportEntityKind;
  /** Total rows the plan intended to insert. */
  planned: number;
  /** Rows that actually landed. */
  imported: number;
  /** True when a quota refusal is why fewer than `planned` rows were attempted. */
  stoppedAtQuota: boolean;
  /** One entry per planned row, in plan order. */
  rows: ReportedRow[];
}

/**
 * Folds however far the composable got into a full accounting of the plan —
 * "12 of 40 imported, stopped at quota" instead of a boolean. `outcomes` may
 * be shorter than `plan`: once a `quota_exceeded` outcome is observed for a
 * quota-limited kind, retrying the remaining rows would fail identically for
 * every one of them (same resource, same cap), so the composable is expected
 * to stop there rather than attempt — and report — each remaining row. Every
 * planned ref with no matching outcome is reported `not_attempted`, which is
 * the honest read of "never sent," not a failure of that specific row.
 */
export function buildImportRunReport(
  kind: ImportEntityKind,
  plan: readonly Pick<PlannedInsert, "ref">[],
  outcomes: readonly ImportRowOutcome[],
): ImportRunReport {
  const outcomeByRef = new Map(outcomes.map((outcome) => [outcome.ref, outcome] as const));
  const rows: ReportedRow[] = plan.map(
    (planned) => outcomeByRef.get(planned.ref) ?? { ref: planned.ref, status: "not_attempted" },
  );
  const imported = rows.filter((row) => row.status === "inserted").length;
  const stoppedAtQuota = rows.some((row) => row.status === "quota_exceeded");

  return { kind, planned: plan.length, imported, stoppedAtQuota, rows };
}

// ── Link resolution (second pass) ────────────────────────────────────────────

/** One already-inserted row's captured links, keyed by the id it actually got
 *  from the database — link resolution has to wait for that id to exist. */
export interface LinkedRow {
  id: string;
  links: EntityLinks;
}

/** An existing row usable as a link target: whatever the referenced kind's
 *  rows expose as an id and the name a raw link string is matched against. */
export interface NameLookupRow {
  id: string;
  name: string;
}

/** How a resolved link becomes a write — see the file header for why NPC →
 *  faction is a join-table insert rather than a fourth FK column. */
export type LinkApplication =
  | { kind: "fk_update"; table: string; column: string }
  | { kind: "join_insert"; table: string; sourceColumn: string; targetColumn: string };

interface LinkTarget {
  sourceKind: ImportEntityKind;
  targetKind: ImportEntityKind;
  apply: LinkApplication;
}

/**
 * Every raw-name field `EntityLinks` (normalize.ts) can carry, and what
 * resolving it means. Keyed by field name with `satisfies Record<keyof
 * EntityLinks, …>` so a fifth link field added to `EntityLinks` without an
 * entry here is a compile error, the same exhaustiveness idiom entityKinds.ts
 * uses for `ImportEntityKind` itself.
 */
const LINK_TARGETS = {
  faction_name: {
    sourceKind: "npcs",
    targetKind: "factions",
    apply: { kind: "join_insert", table: "faction_npcs", sourceColumn: "npc_id", targetColumn: "faction_id" },
  },
  parent_name: {
    sourceKind: "locations",
    targetKind: "locations",
    apply: { kind: "fk_update", table: "locations", column: "parent_id" },
  },
  giver_npc_name: {
    sourceKind: "quests",
    targetKind: "npcs",
    apply: { kind: "fk_update", table: "quests", column: "giver_npc_id" },
  },
  location_name: {
    sourceKind: "quests",
    targetKind: "locations",
    apply: { kind: "fk_update", table: "quests", column: "location_id" },
  },
} as const satisfies Record<keyof EntityLinks, LinkTarget>;

export type LinkResolution =
  | { status: "resolved"; sourceId: string; field: keyof EntityLinks; name: string; targetId: string; apply: LinkApplication }
  | { status: "unresolved"; sourceId: string; field: keyof EntityLinks; name: string };

/**
 * Case-insensitive name match, same rule as `matchSettingRowIds`
 * (`src/lib/populateSetting/settingContent.ts`): a document's printed name and
 * the DM's edited row name only need to agree on casing, not on it exactly.
 */
function findByName(candidates: readonly NameLookupRow[], name: string): NameLookupRow | undefined {
  const needle = name.trim().toLowerCase();
  return candidates.find((candidate) => candidate.name.trim().toLowerCase() === needle);
}

/**
 * The second pass over one kind's already-inserted rows: for each captured
 * link, look up its raw name against the target kind's existing rows and
 * report what to do about it.
 *
 * An unresolved name — the document referenced "Captain Reyes" but no NPC by
 * that name was imported or already existed — is reported, never thrown and
 * never guessed at with an invented id: the referent may simply not exist in
 * this campaign, which is a fact the DM needs to see, not an error in this
 * code. `lookups` is `Partial` because a kind with no rows of the relevant
 * target type yet (a fresh campaign with zero factions) is a normal starting
 * point, not a caller mistake.
 */
export function resolveLinks(
  sourceKind: ImportEntityKind,
  rows: readonly LinkedRow[],
  lookups: Partial<Record<ImportEntityKind, readonly NameLookupRow[]>>,
): LinkResolution[] {
  const fields = (Object.keys(LINK_TARGETS) as (keyof EntityLinks)[]).filter(
    (field) => LINK_TARGETS[field].sourceKind === sourceKind,
  );
  if (fields.length === 0) return [];

  const results: LinkResolution[] = [];
  for (const row of rows) {
    for (const field of fields) {
      const name = row.links[field];
      if (name === undefined) continue; // no link of this kind captured for this row — not a failure

      const target = LINK_TARGETS[field];
      const candidates = lookups[target.targetKind] ?? [];
      const match = findByName(candidates, name);

      results.push(
        match
          ? { status: "resolved", sourceId: row.id, field, name, targetId: match.id, apply: target.apply }
          : { status: "unresolved", sourceId: row.id, field, name },
      );
    }
  }
  return results;
}
