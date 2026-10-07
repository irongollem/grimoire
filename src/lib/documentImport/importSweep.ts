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
 * ── A library pick is a reference, never a copy ─────────────────────────
 *
 * Only `monsters` and `items` have a shared library (`match_import_entity_names`,
 * migration `20260918141022` — every other kind's candidates are always
 * `source: "campaign"`), and their library rows carry a stable **text** id
 * that isn't a uuid. A `link` decision whose candidate is `source: "library"`
 * flows through the sweep as that id, untouched: the registry holds it, a
 * beat's monster attachment writes it into `quest_beat_attachments.ref_id`,
 * `quest_refs.ref_id` is text, an encounter combatant's `monster_id` takes it,
 * and loot lands in `loot_placements.library_item_id` (migration
 * `20261003083553`). The importer used to clone the library row into the DM's
 * own `monsters`/`items` first ("adopt" it), which is what filled production
 * with "(customized)" copies; a copy now only ever exists when the DM presses
 * Customize. See `context/features/document-import.md`.
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
  type ExtractedLocation,
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
  buildSiteRoomIndex,
  findByNameSourced,
  plainRows,
  resolveBeatCrossReferences,
  resolveEncounters,
  resolveLocationLoot,
  type EncounterCombatantContext,
  type LocationLootContext,
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
import {
  runImportKind,
  runLocationsImportKind,
  type InsertRowOutcome,
  type LocationParentCandidate,
  type RunImportKindLinkedEntity,
  type RunImportKindResult,
} from "./runImportKind";

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
  /**
   * The DM's chosen "Source book" (#site-workbench decision, 18 Sep 2026) —
   * written as `source` on every CREATED monster/item/spell this sweep
   * inserts (`mapEntity`'s own doc comment, importPlan.ts, says which kinds
   * actually read it). Trimmed, empty → `null` — see `normalizeSourceTitle`
   * (`src/lib/documentImport/sourceTitle.ts`), which the review surface runs
   * this through before it ever reaches here. `null` means the DM left the
   * field blank, which every created row then carries honestly as "no book
   * on file" rather than an invented value.
   */
  sourceTitle: string | null;
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
}

export interface ImportSweepReport {
  perKind: Partial<Record<ImportEntityKind, ImportKindOutcome>>;
  /** The id of the first quest this sweep created, or `null` if it created
   *  none. */
  createdQuestId: string | null;
  /**
   * Names a link pointed at that matched nothing, e.g. "Beat 'The Flooded
   * Shaft' → encounter 'Rat swarm'". Reported, never dropped — a page can
   * genuinely reference something outside what this sweep imported.
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

/** A loot placement's home — exactly one, mirroring `loot_placements_one_home`
 *  / `loot_placements_beat_pair` in the database. A beat's own loot
 *  (`ExtractedQuestBeat.item_names`) is `beat_id`+`quest_id`; a room's own
 *  loot (`ExtractedLocation.item_names`) is `location_id` alone — see
 *  `context/features/document-import.md`'s "loot found in a keyed room lives
 *  in the ROOM" for why the two are different rows rather than the room's
 *  loot riding on the beat staged at its site. */
export type LootPlacementHome = { beat_id: string; quest_id: string } | { location_id: string };

export interface LootPlacementWrite {
  home: LootPlacementHome;
  campaign_id: string;
  kind: "item";
  /** The picked item's id: a campaign uuid or a library text id. The runner
   *  splits it into `item_id` / `library_item_id` (`itemRefColumns`). */
  item_ref: string;
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

/** Everything the sweep needs from the outside world. */
export interface ImportSweepDeps {
  insertRow: (kind: ImportEntityKind, row: Record<string, unknown>) => Promise<InsertRowOutcome>;
  generateMonster: (data: Record<string, unknown>) => Promise<InsertRowOutcome>;
  /** Existing rows of `targetKind` in this campaign (plus the caller's own
   *  global rows) — the fallback lookup once the sweep's own registry has
   *  been consulted. */
  fetchNameLookup: (targetKind: ImportEntityKind) => Promise<readonly NameLookupRow[]>;
  /** Applies every resolved scalar and list link of the sweep, together —
   *  grouped per table by the implementation rather than one request per
   *  link (#951). Best-effort by convention: a link write failing must not
   *  undo the row it points from. */
  applyLinkResolutions: (resolutions: readonly Extract<LinkResolution, { status: "resolved" }>[]) => Promise<void>;
  /** Only ever invoked once per inserted quest that carries a spine. */
  writeQuestSpine: (input: {
    questId: string;
    campaignId: string;
    beats: ExtractedQuestBeat[] | undefined;
    routes: QuestSpineRouteResult[] | undefined;
    objectives: QuestObjectiveResult[] | undefined;
    /** Written with each beat (`quest_beats.staged_at_location_id`) rather
     *  than as an update per beat afterwards (#951). */
    stagedLocationIdByKey: ReadonlyMap<string, string>;
  }) => Promise<WriteQuestSpineOutcome>;
  /** Resolves combatant names against this campaign's monsters and the
   *  shared library, keyed by the name that was queried — mirrors
   *  `resolve_monster_references`'s own `distinct on (query_name)` contract.
   *  Called once per sweep with every encounter's names. */
  resolveMonsterNames: (names: readonly string[]) => Promise<ReadonlyMap<string, { targetId: string }>>;
  updateEncounterCombatants: (encounterId: string, combatants: readonly CombatantDef[]) => Promise<void>;
  /** Every row in ONE request; throws when the database refuses it, and the
   *  sweep then writes row by row so a refusal costs only its own row and is
   *  reported in `unresolvedLinks` (`writeBatchIsolatingFailures`). */
  insertBeatAttachments: (attachments: BeatAttachmentWrite[]) => Promise<void>;
  /** As `insertBeatAttachments`. */
  insertLootPlacements: (placements: LootPlacementWrite[]) => Promise<void>;
  /** Every quest ref of the sweep, in ONE write that skips a row already
   *  there. `quest_refs` carries a unique `(quest_id, ref_type, ref_id)`
   *  constraint, and a beat attachment's own sync trigger has usually written
   *  some of these rows first — on a real chapter, 17 of 39. Sent one insert
   *  at a time, each of those came back 409: harmless and swallowed, but 39
   *  requests and a console full of errors for an import that had worked. So a
   *  duplicate is the write's own business (`on conflict do nothing`), never
   *  an error for the caller to absorb. Still best-effort as a whole. */
  insertQuestRefs: (refs: readonly QuestRefWrite[]) => Promise<void>;
  updateQuestParent: (questId: string, parentQuestId: string) => Promise<void>;
  /** Persists the *complete*, accumulated `imported_counts` so far — called
   *  after every kind that had anything to import, so a crash mid-sweep
   *  resumes from the last kind that finished rather than from scratch. */
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

/** Counts `linked`/`ignored` off the decisions as the DM made them. A link to
 *  a library candidate is a link like any other: it adds no row, and the
 *  sweep stores the library id as the reference. */
function countDecisions(entities: readonly { ref: string }[], decisions: ReadonlyMap<string, ImportDecision>): { linked: number; ignored: number } {
  let linked = 0;
  let ignored = 0;
  for (const entity of entities) {
    const decision = decisions.get(entity.ref);
    if (decision?.action === "link") linked++;
    else if (decision?.action === "ignore") ignored++;
  }
  return { linked, ignored };
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

/** One kind's link targets: this sweep's own registry first, then the
 *  campaign's existing rows. */
async function buildLookup(
  kind: ImportEntityKind,
  registry: SweepRegistry,
  fetchNameLookup: ImportSweepDeps["fetchNameLookup"],
): Promise<SourcedRow[]> {
  // Every existing campaign row `fetchNameLookup` returns is, by
  // construction, a `monsters`/`items`/etc row in THIS app's own tables —
  // never a library row (a library id would never satisfy that query) — so
  // `source: "campaign"` is correct here, not a guess.
  const fetched = (await fetchNameLookup(kind)).map((row) => ({ ...row, source: "campaign" as const }));
  return [...registryToSourcedRows(registry[kind]), ...fetched];
}

async function buildLookups(
  registry: SweepRegistry,
  fetchNameLookup: ImportSweepDeps["fetchNameLookup"],
): Promise<Partial<Record<ImportEntityKind, SourcedRow[]>>> {
  const lookups: Partial<Record<ImportEntityKind, SourcedRow[]>> = {};
  // Independent reads, so sent together rather than one after another.
  await Promise.all(
    LOOKUP_TARGET_KINDS.map(async (kind) => {
      lookups[kind] = await buildLookup(kind, registry, fetchNameLookup);
    }),
  );
  return lookups;
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
  const { entitiesByKind, decisions, parentQuestId, sourceTitle } = input;

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
    const kindDecisions = decisions.get(kind) ?? new Map<string, ImportDecision>();
    const { linked, ignored } = countDecisions(entities, kindDecisions);

    if (importedCounts[kind] !== undefined) {
      // Resumed after a crash — this kind's rows already landed in an
      // earlier call. They're real DB rows now, so `fetchNameLookup` (in
      // `buildLookups` below) finds them exactly like any pre-existing
      // campaign row would; a `link` decision's target id is still knowable
      // straight from `decisions`, so it's still worth registering here.
      perKind[kind] = { kind, planned: 0, imported: importedCounts[kind]!, stoppedAtQuota: false, rows: [], linked, ignored };
      registry[kind] = buildKindRegistry(kind, entities, kindDecisions, new Map());
      step++;
      continue;
    }

    let result: RunImportKindResult;
    if (kind === "locations") {
      // `locations` resolves its own `parent_name` at insert, not in phase 2
      // below — see `runLocationsImportKind`'s own file header
      // (runImportKind.ts) for why the sweep's usual post-import linking
      // phase runs too late for this one column.
      const existingRaw = await deps.fetchNameLookup("locations");
      const existingLocations: LocationParentCandidate[] = [];
      for (const row of existingRaw) {
        if (row.locationType) existingLocations.push({ id: row.id, name: row.name, locationType: row.locationType });
      }
      const locationsResult = await runLocationsImportKind(
        {
          entities: entities as unknown as readonly ExtractedEntity<"locations">[],
          decisions: kindDecisions,
          campaignId,
          provenance,
          existingLocations,
        },
        { insertRow: (row) => deps.insertRow(kind, row) },
      );
      unresolvedLinks.push(...locationsResult.parentFallbackMessages);
      result = locationsResult;
    } else {
      result = await runImportKind(
        { kind, entities, decisions: kindDecisions, campaignId, provenance, sourceTitle },
        { insertRow: (row) => deps.insertRow(kind, row), generateMonster: deps.generateMonster },
      );
    }

    perKind[kind] = { ...result.report, linked, ignored };
    importedCounts[kind] = result.report.imported;
    // A kind the page had none of wrote nothing, so there is nothing for a
    // resume to skip and no checkpoint worth a request (#951).
    if (entities.length > 0) {
      try {
        await deps.persistImportedCounts({ ...importedCounts });
      } catch {
        // Best-effort checkpoint: losing it costs a from-scratch resume, not
        // the rows that already landed.
      }
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
      // `locations` imports before `quests`, so where each beat is staged is
      // already knowable here, and rides in on the beat insert instead of an
      // update per beat afterwards (#951). Read once, and only when a quest
      // actually has a spine.
      let beatLocationLookup: SourcedRow[] | null = null;
      for (const [ref, id] of result.insertedIds) {
        createdQuestIds.push(id);
        const meta = result.linkedEntities.get(ref);
        if (!meta?.questSpine) continue;
        try {
          const stagedLocationIdByKey = new Map<string, string>();
          for (const beat of meta.questSpine.beats) {
            if (!beat.location_name) continue;
            beatLocationLookup ??= await buildLookup("locations", registry, deps.fetchNameLookup);
            const match = findByNameSourced(beatLocationLookup, beat.location_name);
            if (match) stagedLocationIdByKey.set(beat.key, match.id);
          }
          const spineResult = await deps.writeQuestSpine({
            questId: id,
            campaignId,
            beats: meta.questSpine.beats,
            routes: meta.questSpine.routes,
            objectives: meta.questSpine.objectives,
            stagedLocationIdByKey,
          });
          questContexts.push({
            questId: id,
            campaignId,
            questDisplayName: displayNameById.get(id) ?? id,
            beatIdByKey: spineResult.beatIdByKey,
            beats: meta.questSpine.beats,
            stagedLocationIdByKey,
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

  // An encounter's own resolved `location_id`, captured off this same loop's
  // `encounters` pass — a beat's site/room skip (below) needs to know WHERE
  // an encounter is staged, which its own id can't say.
  const encounterLocationById = new Map<string, string>();

  const resolvedLinks: Extract<LinkResolution, { status: "resolved" }>[] = [];
  for (const kind of LINK_SOURCE_KINDS) {
    const rows = linkedRowsByKind[kind] ?? [];
    for (const resolution of resolveLinks(kind, rows, plainLookups)) {
      if (resolution.status === "unresolved") {
        unresolvedLinks.push(formatUnresolvedLink(kind, resolution, displayNameById));
        continue;
      }
      if (kind === "encounters" && resolution.field === "encounter_location_name") {
        encounterLocationById.set(resolution.sourceId, resolution.targetId);
      }
      resolvedLinks.push(resolution);
    }
  }

  for (const kind of LINK_LIST_SOURCE_KINDS) {
    const rows = linkListRowsByKind[kind] ?? [];
    for (const resolution of resolveLinkLists(kind, rows, plainLookups)) {
      if (resolution.status === "unresolved") {
        unresolvedLinks.push(formatUnresolvedLink(kind, resolution, displayNameById));
        continue;
      }
      resolvedLinks.push(resolution);
    }
  }

  if (resolvedLinks.length > 0) {
    try {
      await deps.applyLinkResolutions(resolvedLinks);
    } catch {
      // Best-effort: see the file header on every other write in this pass.
    }
  }

  await resolveEncounters(encounterContexts, lookups, deps, unresolvedLinks, addSweepRef);

  // Which resolved location ids are a site (has rooms) or a room of one, per
  // THIS sweep's own `parent_name` wiring — built before the room-loot pass
  // below so both it and the beat pass that follows can consult it. See
  // `SiteRoomIndex`'s own doc comment (importSweepLinking.ts).
  const locationsRegistry = registry.locations;
  const locationsRegistryIdByName = new Map<string, string>();
  if (locationsRegistry) for (const [name, entry] of locationsRegistry) locationsRegistryIdByName.set(name, entry.id);
  const siteRoomIndex = buildSiteRoomIndex(
    (entitiesByKind.locations ?? []) as unknown as readonly ExtractedEntity<"locations">[],
    locationsRegistryIdByName,
  );

  // A room's own `item_names` (`ExtractedLocation`) — resolved against the
  // sweep-wide `locations` registry (already covers a `create`d/`link`ed
  // room, exactly what `buildKindRegistry` built while the `locations` kind
  // imported) rather than a context list built during phase 1, since the
  // registry already IS "this entity's own printed name → its resolved id."
  // A location with no registry entry (ignored, undecided, or — the same
  // documented resume gap `buildKindRegistry` already carries — a `create`
  // from a call that crashed before this one) contributes no loot; that
  // mirrors "absence is not consent" for the location itself.
  //
  // Runs BEFORE the beat pass below, on purpose: `roomLootByLocation` is what
  // lets a beat staged at the same site know not to re-list an item its own
  // room already holds.
  const locationLootContexts: LocationLootContext[] = [];
  if (locationsRegistry) {
    for (const entity of (entitiesByKind.locations ?? []) as unknown as readonly ExtractedEntity<"locations">[]) {
      const data = entity.data as ExtractedLocation;
      const itemNames = data.item_names;
      if (!itemNames || itemNames.length === 0) continue;
      if (typeof data.name !== "string") continue;
      const norm = normalizeEntityName(data.name);
      if (norm === null) continue;
      const resolved = locationsRegistry.get(norm);
      if (!resolved) continue;
      locationLootContexts.push({ locationId: resolved.id, locationName: data.name, itemNames });
    }
  }
  const roomLootByLocation = new Map<string, Set<string>>();
  const recordRoomLoot = (locationId: string, itemId: string) => {
    let placed = roomLootByLocation.get(locationId);
    if (!placed) {
      placed = new Set();
      roomLootByLocation.set(locationId, placed);
    }
    placed.add(itemId);
  };
  await resolveLocationLoot(locationLootContexts, lookups.items ?? [], campaignId, deps, unresolvedLinks, addSweepRef, recordRoomLoot);

  await resolveBeatCrossReferences(
    questContexts,
    lookups,
    deps,
    unresolvedLinks,
    addSweepRef,
    siteRoomIndex,
    roomLootByLocation,
    encounterLocationById,
  );

  // Every entity this sweep created or linked (any kind but quests/spells —
  // QuestRefType has no member for either) becomes a quest_refs row for
  // every quest this sweep created, written together — see `insertQuestRefs`'s
  // doc comment for why this is one write and not one per ref.
  const questRefs: QuestRefWrite[] = [];
  for (const questId of createdQuestIds) {
    for (const key of sweepRefs) {
      const separator = key.indexOf(":");
      const refType = key.slice(0, separator) as QuestRefType;
      const refId = key.slice(separator + 1);
      questRefs.push({ quest_id: questId, ref_type: refType, ref_id: refId });
    }
  }
  if (questRefs.length > 0) {
    try {
      await deps.insertQuestRefs(questRefs);
    } catch {
      // Best-effort: the quest and everything it names already landed.
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

