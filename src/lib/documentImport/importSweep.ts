/**
 * `runImportSweep` — the whole document import in one pass: every kind
 * imports first, and only once every kind has landed does a single linking
 * phase resolve every name reference the extraction carried.
 *
 * ── Why this exists (#893) ────────────────────────────────────────────────
 *
 * The old shape resolved links **per kind**, in `IMPORT_ENTITY_KINDS` order —
 * fine for a link that only ever points *backward* (an NPC's `faction_name`,
 * since `factions` leads the order), but it meant a link to a kind imported
 * *later* could never resolve, silently. Two of the new fields this sweep
 * exists for are exactly that case: an NPC's `location_name` (`locations`
 * extracts after `npcs`) and a quest beat's `encounter_names` (`encounters`
 * is last). One linking phase over a registry built from the *whole* sweep
 * fixes both, and every pre-existing link besides.
 *
 * ── The registry ─────────────────────────────────────────────────────────
 *
 * As each kind imports, every entity that ended up `create`d, `generate`d, or
 * `link`ed adds one entry to a sweep-wide map: `normalizeEntityName(printed
 * name) → { id, source }`. A beat's `npc_names`/`monster_names`/etc, and
 * every scalar/list link field, are resolved against this registry first and
 * the campaign's own existing rows (`fetchNameLookup`) second — mirroring the
 * "linked rows first" precedence the old per-kind resolution already used.
 *
 * ── Where a resolved name can and cannot land — and why a library link now
 *    ADOPTS instead of just reporting ─────────────────────────────────────
 *
 * Only `monsters` and `items` have a shared library (`match_import_entity_names`,
 * migration `20260918141022` — every other kind's candidates are always
 * `source: "campaign"`), and only those two kinds' library rows carry a
 * stable **text** id that isn't a uuid. That matters here because two of the
 * write targets this module uses are schema-validated against a real
 * campaign row: `quest_beat_attachments`'s `validate_quest_beat_attachment`
 * trigger casts `ref_id::uuid` and checks the campaign's own `monsters`/`items`
 * table (never `library_monsters`/`library_items`), and
 * `loot_placements.item_id` is a genuine `uuid` FK into `items`.
 *
 * Before this, a beat referencing a *library* monster or item was linked at
 * the quest level only (`quest_refs`, whose `ref_id` is plain, unvalidated
 * text) and reported rather than attached — correct as far as it went, but
 * it meant most monsters and most loot of a normal adventure landed nowhere
 * a beat, an encounter, or a loot list could actually show them. The fix:
 * **choosing a library candidate now means "add it from the library."**
 * `adoptLibraryLinks` (below) walks every `link` decision for `monsters`/
 * `items` whose candidate is `source: "library"`, copies that row into the
 * DM's own content via `deps.adoptLibraryMonster`/`adoptLibraryItem` — the
 * exact "own a copy" idiom the app already uses everywhere else a DM reuses
 * shared content — and rewrites the decision to point at the new owned row
 * (`source: "campaign"`) before the sweep-wide registry is ever built. Every
 * downstream consumer (the registry, beat attachments, loot placements,
 * `quest_refs`, encounter combatants) then sees an ordinary campaign row and
 * needs no special case at all. A link left unrewritten (adoption failed, or
 * a quota refusal stopped further copies of that kind) falls back to
 * exactly the old behaviour — reported in `unresolvedLinks`, linked at the
 * quest level only — so nothing is silently dropped either way. See
 * `context/features/document-import.md` for the full accounting.
 *
 * Pure by the same rule as `runImportKind.ts`: every side effect is injected
 * via `ImportSweepDeps`. `useDocumentImportRunner.ts` is the Supabase-backed
 * half.
 */
import type { AiProvenance } from "@/ai/provenance";
import type { QuestObjectiveResult, QuestSpineRouteResult } from "@/ai/types";
import {
  IMPORT_ENTITY_KINDS,
  type DocumentImport,
  type ExtractedEntity,
  type ExtractedQuestBeat,
  type ImportEntityKind,
} from "@/types/documentImport.types";
import type { CombatantDef } from "@/types/encounter.types";
import type { ExtractedPayloadMap } from "@/types/documentImport.types";
import type { QuestBeatAttachmentType, QuestRefType } from "@/types/quest.types";
import type { UsableEntity } from "./sanitizeEntities";
import type { EntityMatchSource, ImportDecision } from "./entityMatching";
import { getEntityKindEntry } from "./entityKinds";
import { normalizeEntityName } from "./entityName";
import {
  resolveBeatCrossReferences,
  resolveEncounters,
  type EncounterCombatantContext,
  type QuestBeatContext,
} from "./importSweepLinking";
import {
  mapEntity,
  resolveLinkLists,
  resolveLinks,
  type ImportRunReport,
  type LinkedRow,
  type LinkedRowList,
  type LinkResolution,
  type NameLookupRow,
} from "./importPlan";
import { runImportKind, type InsertRowOutcome, type RunImportKindLinkedEntity } from "./runImportKind";

// ── The public contract ──────────────────────────────────────────────────────

export interface ImportSweepInput {
  /** Every kind's reviewed entities, with the DM's edits already applied to
   *  `data` (quest title/summary edits included). */
  entitiesByKind: Partial<Record<ImportEntityKind, readonly UsableEntity[]>>;
  /** Per kind, per ref. An entity with no decision is NOT imported (absence
   *  is not consent) — see `buildImportPlan`'s own doc comment. */
  decisions: ReadonlyMap<ImportEntityKind, ReadonlyMap<string, ImportDecision>>;
  /** `QuestFlowStarter`'s sub-quest parent, applied to the quest this sweep
   *  creates. A sweep that creates more than one quest (the settings wizard,
   *  bulk-importing a chapter) applies it to the *first* one — the compact
   *  paste review (#839), the caller this parameter actually serves, only
   *  ever creates one. */
  parentQuestId: string | null;
}

export type ImportSweepPhase = "importing" | "linking";

export interface ImportSweepProgress {
  phase: ImportSweepPhase;
  kind: ImportEntityKind | null;
  done: number;
  total: number;
}

export interface ImportKindOutcome extends ImportRunReport {
  linked: number;
  ignored: number;
  /** Link decisions this sweep resolved by copying a shared library row into
   *  the DM's own content first ("add it from the library" — see the file
   *  header). Counted separately from `linked`, which keeps meaning "linked
   *  to a row the DM already owned" before this sweep ever ran. Only
   *  `monsters`/`items` can ever be nonzero here — no other kind's
   *  candidates are ever `source: "library"`. */
  adopted: number;
}

export interface ImportSweepReport {
  perKind: Partial<Record<ImportEntityKind, ImportKindOutcome>>;
  /** The id of the first quest this sweep created, or `null` if it created
   *  none. */
  createdQuestId: string | null;
  /**
   * Names a link pointed at that matched nothing, e.g. "Beat 'The Flooded
   * Shaft' → encounter 'Rat swarm'". Reported, never dropped — a page can
   * genuinely reference something outside what this sweep imported. Also
   * carries the (rarer) case of a name that *did* resolve but to a shared
   * library row a beat attachment or loot placement can't structurally point
   * at — see the file header.
   */
  unresolvedLinks: string[];
}

export interface BeatAttachmentWrite {
  beat_id: string;
  quest_id: string;
  campaign_id: string;
  attachment_type: QuestBeatAttachmentType;
  ref_id: string;
  sort_order: number;
}

export interface LootPlacementWrite {
  beat_id: string;
  quest_id: string;
  campaign_id: string;
  kind: "item";
  item_id: string;
  quantity: number;
  label: string;
}

export interface QuestRefWrite {
  quest_id: string;
  ref_type: QuestRefType;
  ref_id: string;
}

export interface WriteQuestSpineOutcome {
  beatIdByKey: Map<string, string>;
}

/** The outcome of copying one shared library row into the DM's own content —
 *  see `adoptLibraryLinks`'s own doc comment for when this runs. */
export type AdoptLibraryOutcome =
  | { status: "adopted"; id: string }
  | { status: "quota_exceeded" }
  | { status: "failed"; message: string };

/** Everything the sweep needs from the outside world. */
export interface ImportSweepDeps {
  insertRow: (kind: ImportEntityKind, row: Record<string, unknown>) => Promise<InsertRowOutcome>;
  generateMonster: (data: Record<string, unknown>) => Promise<InsertRowOutcome>;
  /** Get-or-create the DM's own copy of a shared `library_monsters` row
   *  (`libraryId` is that row's stable text id) — "add it from the library."
   *  Idempotent: a second sweep, or a beat's own reference, naming the same
   *  library monster reuses the DM's existing copy rather than adopting it
   *  twice. Only ever invoked for a `link` decision on the `monsters` kind
   *  whose candidate is `source: "library"`. */
  adoptLibraryMonster: (libraryId: string) => Promise<AdoptLibraryOutcome>;
  /** The `items` counterpart of `adoptLibraryMonster`, over `library_items`. */
  adoptLibraryItem: (libraryId: string) => Promise<AdoptLibraryOutcome>;
  /** Existing rows of `targetKind` in this campaign (plus the caller's own
   *  global rows) — the fallback lookup once the sweep's own registry has
   *  been consulted. */
  fetchNameLookup: (targetKind: ImportEntityKind) => Promise<readonly NameLookupRow[]>;
  /** Applies one resolved scalar or list link. Best-effort by convention: a
   *  link write failing must not undo the row it points from. */
  applyLinkResolution: (resolution: Extract<LinkResolution, { status: "resolved" }>) => Promise<void>;
  /** Only ever invoked once per inserted quest that carries a spine. */
  writeQuestSpine: (input: {
    questId: string;
    campaignId: string;
    beats: ExtractedQuestBeat[] | undefined;
    routes: QuestSpineRouteResult[] | undefined;
    objectives: QuestObjectiveResult[] | undefined;
  }) => Promise<WriteQuestSpineOutcome>;
  /** Resolves combatant names against this campaign's monsters and the
   *  shared library, keyed by the name that was queried — mirrors
   *  `resolve_monster_references`'s own `distinct on (query_name)` contract. */
  resolveMonsterNames: (names: readonly string[]) => Promise<ReadonlyMap<string, { targetId: string }>>;
  updateEncounterCombatants: (encounterId: string, combatants: readonly CombatantDef[]) => Promise<void>;
  /** `quest_beats.staged_at_location_id`. */
  updateBeatLocation: (beatId: string, locationId: string) => Promise<void>;
  insertBeatAttachment: (attachment: BeatAttachmentWrite) => Promise<void>;
  insertLootPlacement: (placement: LootPlacementWrite) => Promise<void>;
  /** Best-effort and idempotent from the caller's side: `quest_refs` carries
   *  a unique `(quest_id, ref_type, ref_id)` constraint, and a beat
   *  attachment's own sync trigger may already have inserted the same row —
   *  a duplicate here is expected and must not surface as an error. */
  insertQuestRef: (ref: QuestRefWrite) => Promise<void>;
  updateQuestParent: (questId: string, parentQuestId: string) => Promise<void>;
  /** Persists the *complete*, accumulated `imported_counts` so far — called
   *  after every kind, so a crash mid-sweep resumes from the last kind that
   *  finished rather than from scratch. */
  persistImportedCounts: (counts: Partial<Record<ImportEntityKind, number>>) => Promise<void>;
  /** Marks the row `complete` once every phase is done. */
  markComplete: (counts: Partial<Record<ImportEntityKind, number>>) => Promise<void>;
}

// ── The sweep-wide name registry ─────────────────────────────────────────────

interface RegistryEntry {
  id: string;
  source: EntityMatchSource;
}

type SweepRegistry = Partial<Record<ImportEntityKind, Map<string, RegistryEntry>>>;

/**
 * One kind's contribution to the sweep registry: every entity that ended up
 * `create`d, `generate`d, or `link`ed, keyed by its normalized printed name.
 * `ignore`d and undecided entities contribute nothing — same "absence is not
 * consent" rule `buildImportPlan` already applies to inserts.
 */
function buildKindRegistry<K extends ImportEntityKind>(
  kind: K,
  entities: readonly ExtractedEntity<K>[],
  decisions: ReadonlyMap<string, ImportDecision>,
  insertedIds: ReadonlyMap<string, string>,
): Map<string, RegistryEntry> {
  const displayField = getEntityKindEntry(kind).displayField;
  const registry = new Map<string, RegistryEntry>();
  for (const entity of entities) {
    const decision = decisions.get(entity.ref);
    if (!decision || decision.action === "ignore") continue;

    const rawName = (entity.data as unknown as Record<string, unknown>)[displayField];
    if (typeof rawName !== "string") continue;
    const norm = normalizeEntityName(rawName);
    if (norm === null) continue;

    if (decision.action === "link") {
      registry.set(norm, { id: decision.candidate.targetId, source: decision.candidate.source });
    } else {
      const id = insertedIds.get(entity.ref);
      if (id) registry.set(norm, { id, source: "campaign" }); // a create/generate always lands a real campaign row
    }
  }
  return registry;
}

/**
 * Counts `linked`/`ignored` off the decisions as the DM actually made them —
 * called with the PRE-adoption map, before `adoptLibraryLinks` has rewritten
 * anything, so a `link` to a library candidate is excluded from `linked`
 * here regardless of whether its adoption goes on to succeed or fail:
 * success is `adoptLibraryLinks`'s own `adopted` count, and a failure is
 * reported through `unresolvedLinks` rather than counted in either bucket —
 * "attempted but didn't land" has no `ImportKindOutcome` field of its own,
 * the same way a `create` that fails outright is only visible in `rows`.
 */
function countDecisions(entities: readonly { ref: string }[], decisions: ReadonlyMap<string, ImportDecision>): { linked: number; ignored: number } {
  let linked = 0;
  let ignored = 0;
  for (const entity of entities) {
    const decision = decisions.get(entity.ref);
    if (decision?.action === "link") {
      if (decision.candidate.source !== "library") linked++;
    } else if (decision?.action === "ignore") {
      ignored++;
    }
  }
  return { linked, ignored };
}

/** The two kinds whose candidates can ever be `source: "library"`
 *  (`match_import_entity_names` never returns a library row for any other
 *  kind — verified against the migration, `entityMatching.ts`'s own doc
 *  comment). */
const ADOPTABLE_LIBRARY_KINDS: ReadonlySet<ImportEntityKind> = new Set(["monsters", "items"]);

/**
 * Rewrites this kind's `link`-to-library decisions into `link`-to-owned-copy
 * decisions — "choosing a library candidate means add it from the library"
 * (see the file header). Returns the (possibly unchanged) decision map and
 * how many adoptions actually landed; every other kind's decisions pass
 * through untouched and free (`decisions` itself, not a copy).
 *
 * Order matches `runImportKind.ts`'s own reasoning for `create`/`generate`
 * attempts: row by row, stopping further *adoption* attempts the moment one
 * hits the `monsters` quota (an adopted monster is a real `monsters` insert
 * and counts against the same resource a `create` does), since retrying the
 * rest would fail identically. A link that never got its turn, or whose
 * adoption failed outright, is left pointing at the library candidate
 * exactly as before this feature existed — the registry still resolves it
 * at the `quest_refs` level, and `unresolvedLinks` says why a beat/loot
 * reference couldn't go further, so nothing here is ever silently dropped.
 */
async function adoptLibraryLinks<K extends ImportEntityKind>(
  kind: K,
  entities: readonly ExtractedEntity<K>[],
  decisions: ReadonlyMap<string, ImportDecision>,
  deps: Pick<ImportSweepDeps, "adoptLibraryMonster" | "adoptLibraryItem">,
  unresolvedLinks: string[],
): Promise<{ decisions: ReadonlyMap<string, ImportDecision>; adopted: number }> {
  if (!ADOPTABLE_LIBRARY_KINDS.has(kind)) return { decisions, adopted: 0 };

  const entry = getEntityKindEntry(kind);
  let next: Map<string, ImportDecision> | null = null;
  let adopted = 0;
  let quotaHit = false;

  for (const entity of entities) {
    const decision = decisions.get(entity.ref);
    if (!decision || decision.action !== "link" || decision.candidate.source !== "library") continue;

    const rawName = (entity.data as unknown as Record<string, unknown>)[entry.displayField];
    const name = typeof rawName === "string" && rawName.trim() !== "" ? rawName : decision.candidate.name;

    if (quotaHit) {
      unresolvedLinks.push(`${entry.labelSingular} "${name}": your ${entry.labelSingular.toLowerCase()} limit stopped this from being added from the library.`);
      continue;
    }

    const outcome = kind === "monsters" ? await deps.adoptLibraryMonster(decision.candidate.targetId) : await deps.adoptLibraryItem(decision.candidate.targetId);

    if (outcome.status === "adopted") {
      next ??= new Map(decisions);
      next.set(entity.ref, { action: "link", candidate: { ...decision.candidate, source: "campaign", targetId: outcome.id } });
      adopted++;
    } else if (outcome.status === "quota_exceeded") {
      quotaHit = true;
      unresolvedLinks.push(`${entry.labelSingular} "${name}": your ${entry.labelSingular.toLowerCase()} limit stopped this from being added from the library.`);
    } else {
      unresolvedLinks.push(`${entry.labelSingular} "${name}": couldn't add "${decision.candidate.name}" from the library (${outcome.message}).`);
    }
  }

  return { decisions: next ?? decisions, adopted };
}

/** A registry entry, widened with a plain display name — the key every
 *  name-matching helper below actually searches on. Built once the registry
 *  entry exists; the normalized key itself doubles as the name, since
 *  re-normalizing an already-normalized string is idempotent (`entityName.ts`'s
 *  own doc comment) and every consumer here only ever re-normalizes to
 *  compare, never to display. */
export interface SourcedRow {
  id: string;
  name: string;
  source: EntityMatchSource;
}

function registryToSourcedRows(registry: Map<string, RegistryEntry> | undefined): SourcedRow[] {
  if (!registry) return [];
  return [...registry.entries()].map(([name, entry]) => ({ id: entry.id, name, source: entry.source }));
}

/** The kinds a scalar/list link or a beat cross-reference can ever point at —
 *  `quests` and `spells` never appear as a link *target*. */
const LOOKUP_TARGET_KINDS = ["factions", "locations", "npcs", "encounters", "monsters", "items"] as const;

async function buildLookups(
  registry: SweepRegistry,
  fetchNameLookup: ImportSweepDeps["fetchNameLookup"],
): Promise<Partial<Record<ImportEntityKind, SourcedRow[]>>> {
  const lookups: Partial<Record<ImportEntityKind, SourcedRow[]>> = {};
  for (const kind of LOOKUP_TARGET_KINDS) {
    const fromRegistry = registryToSourcedRows(registry[kind]);
    // Every existing campaign row `fetchNameLookup` returns is, by
    // construction, a `monsters`/`items`/etc row in THIS app's own tables —
    // never a library row (a library id would never satisfy that query) — so
    // `source: "campaign"` is correct here, not a guess.
    const fetched = (await fetchNameLookup(kind)).map((row) => ({ ...row, source: "campaign" as const }));
    lookups[kind] = [...fromRegistry, ...fetched];
  }
  return lookups;
}

export function plainRows(rows: readonly SourcedRow[] | undefined): NameLookupRow[] {
  return (rows ?? []).map((row) => ({ id: row.id, name: row.name }));
}

// ── Unresolved-link messages ──────────────────────────────────────────────────

const LINK_FIELD_LABELS: Record<string, string> = {
  faction_name: "faction",
  parent_name: "parent location",
  giver_npc_name: "quest giver",
  location_name: "location",
  encounter_location_name: "location",
  npc_location_name: "location",
  owner_npc_name: "owner NPC",
  location_names: "location",
};

function formatUnresolvedLink(
  sourceKind: ImportEntityKind,
  resolution: Extract<LinkResolution, { status: "unresolved" }>,
  displayNameById: ReadonlyMap<string, string>,
): string {
  const sourceLabel = getEntityKindEntry(sourceKind).labelSingular;
  const sourceName = displayNameById.get(resolution.sourceId) ?? resolution.sourceId;
  const targetLabel = LINK_FIELD_LABELS[resolution.field] ?? resolution.field;
  return `${sourceLabel} "${sourceName}" → ${targetLabel} "${resolution.name}"`;
}

// ── The scalar/list link source kinds (mirrors LINK_TARGETS/LINK_LIST_TARGETS) ─

const LINK_SOURCE_KINDS: readonly ImportEntityKind[] = ["npcs", "locations", "quests", "encounters"];
const LINK_LIST_SOURCE_KINDS: readonly ImportEntityKind[] = ["factions"];

// `QuestBeatContext`/`EncounterCombatantContext` — the per-quest/per-encounter
// state carried from the importing phase to the linking one — are defined in
// `importSweepLinking.ts`, which is what actually consumes them.

/** The kinds `quest_refs` can name — `quests` and `spells` have no
 *  `QuestRefType` member, so neither ever produces a `quest_refs` row. */
const QUEST_REF_TYPE_BY_KIND: Partial<Record<ImportEntityKind, QuestRefType>> = {
  monsters: "monster",
  npcs: "npc",
  locations: "location",
  items: "item",
  factions: "faction",
  encounters: "encounter",
};

// ── The sweep ─────────────────────────────────────────────────────────────────

export async function runImportSweep(
  importRow: Pick<DocumentImport, "campaign_id" | "ai_provenance" | "imported_counts">,
  input: ImportSweepInput,
  deps: ImportSweepDeps,
  onProgress?: (progress: ImportSweepProgress) => void,
): Promise<ImportSweepReport> {
  const provenance: AiProvenance | null = importRow.ai_provenance;
  if (!provenance) {
    throw new Error("This document's generation info is missing, so nothing here can be imported.");
  }
  const campaignId = importRow.campaign_id;
  const { entitiesByKind, decisions, parentQuestId } = input;

  const importedCounts: Partial<Record<ImportEntityKind, number>> = { ...importRow.imported_counts };
  const perKind: Partial<Record<ImportEntityKind, ImportKindOutcome>> = {};
  const registry: SweepRegistry = {};
  const displayNameById = new Map<string, string>();
  const linkedRowsByKind: Partial<Record<ImportEntityKind, LinkedRow[]>> = {};
  const linkListRowsByKind: Partial<Record<ImportEntityKind, LinkedRowList[]>> = {};
  const questContexts: QuestBeatContext[] = [];
  const encounterContexts: EncounterCombatantContext[] = [];
  const sweepRefs = new Set<string>(); // `${refType}:${refId}`, deduped
  const createdQuestIds: string[] = [];
  const unresolvedLinks: string[] = [];

  const addSweepRef = (refType: QuestRefType, refId: string) => sweepRefs.add(`${refType}:${refId}`);

  const totalSteps = IMPORT_ENTITY_KINDS.length + 1; // +1 for the linking phase
  let step = 0;

  // ── Phase 1: import every kind ──────────────────────────────────────────
  for (const kind of IMPORT_ENTITY_KINDS) {
    onProgress?.({ phase: "importing", kind, done: step, total: totalSteps });

    const entities = (entitiesByKind[kind] ?? []) as unknown as readonly ExtractedEntity<typeof kind>[];
    const rawKindDecisions = decisions.get(kind) ?? new Map<string, ImportDecision>();
    // Rewrites any `link`-to-library decision into `link`-to-owned-copy
    // BEFORE anything else reads `decisions` — the registry, `runImportKind`
    // (which ignores `link` decisions entirely, so this is free for every
    // other kind), and the quota-accounting `countDecisions` below all see
    // an ordinary campaign link from here on. Re-run even for a resumed kind
    // (below): `adoptLibraryMonster`/`adoptLibraryItem` are idempotent
    // get-or-create, so re-adopting an already-owned copy is a fast no-op,
    // not a duplicate.
    const { decisions: kindDecisions, adopted } = await adoptLibraryLinks(kind, entities, rawKindDecisions, deps, unresolvedLinks);
    const { linked, ignored } = countDecisions(entities, rawKindDecisions);

    if (importedCounts[kind] !== undefined) {
      // Resumed after a crash — this kind's rows already landed in an
      // earlier call. They're real DB rows now, so `fetchNameLookup` (in
      // `buildLookups` below) finds them exactly like any pre-existing
      // campaign row would; a `link` decision's target id is still knowable
      // straight from `decisions`, so it's still worth registering here.
      perKind[kind] = { kind, planned: 0, imported: importedCounts[kind]!, stoppedAtQuota: false, rows: [], linked, ignored, adopted };
      registry[kind] = buildKindRegistry(kind, entities, kindDecisions, new Map());
      step++;
      continue;
    }

    const result = await runImportKind(
      { kind, entities, decisions: kindDecisions, campaignId, provenance },
      { insertRow: (row) => deps.insertRow(kind, row), generateMonster: deps.generateMonster },
    );

    perKind[kind] = { ...result.report, linked, ignored, adopted };
    importedCounts[kind] = result.report.imported;
    try {
      await deps.persistImportedCounts({ ...importedCounts });
    } catch {
      // Best-effort checkpoint: losing it costs a from-scratch resume, not
      // the rows that already landed.
    }

    registry[kind] = buildKindRegistry(kind, entities, kindDecisions, result.insertedIds);

    const displayField = getEntityKindEntry(kind).displayField;
    const linkedRows: LinkedRow[] = [];
    const linkListRows: LinkedRowList[] = [];
    for (const [ref, id] of result.insertedIds) {
      const entity = entities.find((e) => e.ref === ref);
      const rawName = entity ? (entity.data as unknown as Record<string, unknown>)[displayField] : undefined;
      if (typeof rawName === "string") displayNameById.set(id, rawName);

      const meta: RunImportKindLinkedEntity | undefined = result.linkedEntities.get(ref);
      if (meta) {
        linkedRows.push({ id, links: meta.links });
        linkListRows.push({ id, linkLists: meta.linkLists });
      }
    }
    // A row the DM LINKED to still carries the page's join-table facts — the
    // Council of Speakers holds the Upper Gallery whether the faction is new
    // or one they already had. Join rows are additive (the pair is unique, so
    // a place it already holds is a no-op), unlike a scalar FK, which would
    // overwrite what the DM set on their own row — those stay untouched.
    if (LINK_LIST_SOURCE_KINDS.includes(kind)) {
      for (const entity of entities) {
        const decision = kindDecisions.get(entity.ref);
        if (decision?.action !== "link" || decision.candidate.source !== "campaign") continue;
        // `data` is the sanitized extraction for this very kind (see the
        // #33014 note on `mapEntity`) — the cast restates that, it adds nothing.
        const { linkLists } = mapEntity(kind, entity.data as unknown as ExtractedPayloadMap[typeof kind], campaignId, provenance);
        if (linkLists) linkListRows.push({ id: decision.candidate.targetId, linkLists });
      }
    }
    linkedRowsByKind[kind] = linkedRows;
    linkListRowsByKind[kind] = linkListRows;

    if (kind !== "quests" && kind !== "spells") {
      const refType = QUEST_REF_TYPE_BY_KIND[kind];
      if (refType) for (const entry of registry[kind]!.values()) addSweepRef(refType, entry.id);
    }

    if (kind === "quests") {
      for (const [ref, id] of result.insertedIds) {
        createdQuestIds.push(id);
        const meta = result.linkedEntities.get(ref);
        if (!meta?.questSpine) continue;
        try {
          const spineResult = await deps.writeQuestSpine({
            questId: id,
            campaignId,
            beats: meta.questSpine.beats,
            routes: meta.questSpine.routes,
            objectives: meta.questSpine.objectives,
          });
          questContexts.push({
            questId: id,
            campaignId,
            questDisplayName: displayNameById.get(id) ?? id,
            beatIdByKey: spineResult.beatIdByKey,
            beats: meta.questSpine.beats,
          });
        } catch {
          // Best-effort: a partially wired spine doesn't undo the quest,
          // which already landed and is already counted as imported.
        }
      }
    }

    if (kind === "encounters") {
      for (const [ref, id] of result.insertedIds) {
        const meta = result.linkedEntities.get(ref);
        const combatants = (meta?.row.combatants as CombatantDef[] | undefined) ?? [];
        const name = displayNameById.get(id) ?? id;
        encounterContexts.push({ id, name, combatants });
      }
    }

    step++;
  }

  // ── Phase 2: one linking pass over the whole sweep ──────────────────────
  onProgress?.({ phase: "linking", kind: null, done: step, total: totalSteps });

  const lookups = await buildLookups(registry, deps.fetchNameLookup);
  const plainLookups: Partial<Record<ImportEntityKind, NameLookupRow[]>> = {};
  for (const kind of LOOKUP_TARGET_KINDS) plainLookups[kind] = plainRows(lookups[kind]);

  for (const kind of LINK_SOURCE_KINDS) {
    const rows = linkedRowsByKind[kind] ?? [];
    for (const resolution of resolveLinks(kind, rows, plainLookups)) {
      if (resolution.status === "unresolved") {
        unresolvedLinks.push(formatUnresolvedLink(kind, resolution, displayNameById));
        continue;
      }
      try {
        await deps.applyLinkResolution(resolution);
      } catch {
        // Best-effort: see the file header on every other write in this pass.
      }
    }
  }

  for (const kind of LINK_LIST_SOURCE_KINDS) {
    const rows = linkListRowsByKind[kind] ?? [];
    for (const resolution of resolveLinkLists(kind, rows, plainLookups)) {
      if (resolution.status === "unresolved") {
        unresolvedLinks.push(formatUnresolvedLink(kind, resolution, displayNameById));
        continue;
      }
      try {
        await deps.applyLinkResolution(resolution);
      } catch {
        // Best-effort, as above.
      }
    }
  }

  await resolveEncounters(encounterContexts, lookups, deps, unresolvedLinks, addSweepRef);
  await resolveBeatCrossReferences(questContexts, lookups, deps, unresolvedLinks, addSweepRef);

  // Every entity this sweep created or linked (any kind but quests/spells —
  // QuestRefType has no member for either) becomes a quest_refs row for
  // every quest this sweep created. `insertQuestRef`'s doc comment covers why
  // a duplicate here (the beat-attachment sync trigger may have already
  // written the same row) is expected, not an error.
  for (const questId of createdQuestIds) {
    for (const key of sweepRefs) {
      const separator = key.indexOf(":");
      const refType = key.slice(0, separator) as QuestRefType;
      const refId = key.slice(separator + 1);
      try {
        await deps.insertQuestRef({ quest_id: questId, ref_type: refType, ref_id: refId });
      } catch {
        // Best-effort — including the expected "already exists" case above.
      }
    }
  }

  const createdQuestId = createdQuestIds[0] ?? null;
  if (createdQuestId && parentQuestId) {
    try {
      await deps.updateQuestParent(createdQuestId, parentQuestId);
    } catch {
      // Best-effort: the quest itself already landed.
    }
  }

  try {
    await deps.markComplete(importedCounts);
  } catch {
    // The DM still sees every row that landed even if this last write fails;
    // a stuck "review" status is a smaller loss than pretending nothing
    // imported.
  }

  onProgress?.({ phase: "linking", kind: null, done: totalSteps, total: totalSteps });

  return { perKind, createdQuestId, unresolvedLinks };
}

