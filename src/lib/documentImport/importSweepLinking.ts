/**
 * `runImportSweep`'s (`importSweep.ts`) two array-shaped resolvers — encounter
 * combatants and a quest beat's cross-entity references — split out purely to
 * keep `importSweep.ts` under its soft line cap. Both run in the sweep's
 * single linking phase, after every kind has imported and the sweep-wide name
 * registry is complete; see `importSweep.ts`'s own file header for why that
 * ordering is the whole point of #893.
 *
 * Neither function is exported for reuse elsewhere — this file exists to be
 * imported by `importSweep.ts` alone, not as a second entry point.
 */
import { normalizeEntityName } from "./entityName";
import { resolveEncounterCombatants } from "./normalize";
import type { ImportEntityKind, ExtractedQuestBeat } from "@/types/documentImport.types";
import type { CombatantDef } from "@/types/encounter.types";
import type { QuestBeatAttachmentType, QuestRefType } from "@/types/quest.types";
import { refusalReason, writeBatchIsolatingFailures } from "@/lib/batchWrite";
import {
  plainRows,
  type BeatAttachmentWrite,
  type ImportSweepDeps,
  type LootPlacementHome,
  type LootPlacementWrite,
  type SourcedRow,
} from "./importSweep";

export interface QuestBeatContext {
  questId: string;
  campaignId: string;
  questDisplayName: string;
  beatIdByKey: Map<string, string>;
  beats: ExtractedQuestBeat[];
  /** Where each beat was staged, by spine key, resolved before the spine was
   *  written so the location rode in on the beat insert (#951). A beat with
   *  a `location_name` and no entry here named a place that matched nothing. */
  stagedLocationIdByKey: ReadonlyMap<string, string>;
}

export interface EncounterCombatantContext {
  id: string;
  name: string;
  combatants: CombatantDef[];
}

/** One room whose own `item_names` (`ExtractedLocation`) need resolving into
 *  `loot_placements` rows homed on it directly — see `resolveLocationLoot`. */
export interface LocationLootContext {
  locationId: string;
  locationName: string;
  itemNames: readonly string[];
}

/**
 * Which resolved location ids are a "site" (has at least one room of its
 * own, per THIS sweep's own `parent_name` wiring) and which are a room of
 * one — built once per sweep by `buildSiteRoomIndex`, from this batch's own
 * `locations` entities and the ids the sweep-wide registry gave them. Never a
 * database query: the whole point is "what did this import's own page wire
 * together," not the campaign's full location tree, which a beat staged at
 * an unrelated pre-existing location has no business reaching into.
 */
export interface SiteRoomIndex {
  siteIdOfRoom: ReadonlyMap<string, string>;
  roomIdsOfSite: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Matches the same way `orderLocationsParentsFirst`/`runLocationsImportKind`
 * (runImportKind.ts) match a room to its container — `parent_name` normalized
 * against another entity's own `name` — except here both ends must already
 * have a *resolved* id (`resolvedIdByName`, the sweep's `locations` registry
 * collapsed to name → id) for the pair to mean anything: an entity this sweep
 * ignored, or whose insert never landed, contributes no site/room fact.
 */
export function buildSiteRoomIndex(
  locationEntities: readonly { data: { name: string; parent_name?: string } }[],
  resolvedIdByName: ReadonlyMap<string, string>,
): SiteRoomIndex {
  const siteIdOfRoom = new Map<string, string>();
  const roomIdsOfSite = new Map<string, Set<string>>();

  for (const entity of locationEntities) {
    const parentName = entity.data.parent_name;
    if (typeof parentName !== "string") continue;
    const ownNorm = normalizeEntityName(entity.data.name);
    const parentNorm = normalizeEntityName(parentName);
    if (ownNorm === null || parentNorm === null) continue;

    const ownId = resolvedIdByName.get(ownNorm);
    const parentId = resolvedIdByName.get(parentNorm);
    if (!ownId || !parentId || ownId === parentId) continue; // unresolved, or a self-reference — never a real site/room pair

    siteIdOfRoom.set(ownId, parentId);
    let rooms = roomIdsOfSite.get(parentId);
    if (!rooms) {
      rooms = new Set();
      roomIdsOfSite.set(parentId, rooms);
    }
    rooms.add(ownId);
  }

  return { siteIdOfRoom, roomIdsOfSite };
}

/**
 * The set to exclude when a beat is staged at `locationId` — that site's own
 * id plus every room of it — or `null` when `locationId` is neither a site
 * (no known rooms) nor a room of one, in which case no site/room skip applies
 * at all and every reference resolves exactly as it always has.
 */
function siteAndRoomIds(locationId: string, index: SiteRoomIndex): ReadonlySet<string> | null {
  const siteId = index.siteIdOfRoom.get(locationId) ?? locationId;
  const rooms = index.roomIdsOfSite.get(siteId);
  if (!rooms) return null;
  return new Set([siteId, ...rooms]);
}

/** Whether `itemId` was already placed as loot in one of `locationIds` — used
 *  to stop a beat re-listing loot its site's own rooms already hold. */
function itemAlreadyRoomed(
  itemId: string,
  locationIds: ReadonlySet<string>,
  roomLootByLocation: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  for (const locationId of locationIds) {
    if (roomLootByLocation.get(locationId)?.has(itemId)) return true;
  }
  return false;
}

export function findByNameSourced(rows: readonly SourcedRow[], name: string): SourcedRow | undefined {
  const needle = normalizeEntityName(name);
  if (needle === null) return undefined;
  return rows.find((row) => normalizeEntityName(row.name) === needle);
}

// ── Encounter combatants (moved here from the old per-kind pass — #893) ─────

export async function resolveEncounters(
  contexts: readonly EncounterCombatantContext[],
  lookups: Partial<Record<ImportEntityKind, SourcedRow[]>>,
  deps: Pick<ImportSweepDeps, "resolveMonsterNames" | "updateEncounterCombatants">,
  unresolvedLinks: string[],
  addSweepRef: (refType: QuestRefType, refId: string) => void,
): Promise<void> {
  if (contexts.length === 0) return;
  const npcLookup = plainRows(lookups.npcs);
  const monsterLookup = lookups.monsters ?? [];

  // The sweep's own monster registry (created/linked this run, campaign OR
  // library) first — a combatant naming a monster this same sweep already
  // resolved should use *that* row, not a fresh RPC lookup that might rank
  // a different candidate. Every name it doesn't cover, across every
  // encounter, goes to the RPC in ONE call (#951): the RPC is keyed by the
  // queried name, so one encounter's answer is every encounter's answer.
  const registryMatches = new Map<string, { targetId: string }>();
  const needRpc = new Set<string>();
  for (const context of contexts) {
    for (const combatant of context.combatants) {
      const name = combatant.custom_name;
      if (name === null || registryMatches.has(name) || needRpc.has(name)) continue;
      const match = findByNameSourced(monsterLookup, name);
      if (match) registryMatches.set(name, { targetId: match.id });
      else needRpc.add(name);
    }
  }
  const rpcMatches = needRpc.size > 0 ? await deps.resolveMonsterNames([...needRpc]) : new Map<string, { targetId: string }>();
  const monsterMatches = new Map([...rpcMatches, ...registryMatches]);

  const updates: Promise<void>[] = [];
  for (const context of contexts) {
    if (!context.combatants.some((c) => c.custom_name !== null)) continue;

    const resolved = resolveEncounterCombatants(context.combatants, npcLookup, monsterMatches);
    for (const combatant of resolved) {
      if (combatant.npc_id) {
        addSweepRef("npc", combatant.npc_id);
      } else if (combatant.monster_id) {
        // `quest_refs.ref_id` is unvalidated text, so a library monster's
        // stable text id is just as good a ref here as a campaign uuid.
        addSweepRef("monster", combatant.monster_id);
      } else if (combatant.custom_name) {
        unresolvedLinks.push(`Encounter "${context.name}" → combatant "${combatant.custom_name}"`);
      }
    }
    // Each encounter gets its own combatant list, so these stay one update
    // per encounter — sent together rather than one after another.
    updates.push(deps.updateEncounterCombatants(context.id, resolved));
  }
  // Best-effort: every encounter already landed and is already counted.
  await Promise.allSettled(updates);
}

/**
 * A rejected reference write is still best-effort (the sweep carries on and the
 * row it points from already landed), but never silent: the DM sees it in the
 * same unresolved-links report as a name that matched nothing. The case that
 * made this matter (#954): a library entry matched at review time and removed
 * before confirm fails the write's foreign key or validator, and without this
 * the sweep would report the link as made.
 */
function writeFailure(label: string, err: unknown): string {
  return `${label} (not saved: ${refusalReason(err)})`;
}

/** A planned write and the label its refusal is reported under. */
interface LabelledWrite<Row> {
  row: Row;
  label: string;
}

/**
 * Writes every planned row in one request and reports each refused one in
 * `unresolvedLinks` (#951). Returns the rows that landed. See
 * `writeBatchIsolatingFailures` for why one refused row costs only itself.
 */
async function writeLabelled<Row>(
  writes: readonly LabelledWrite<Row>[],
  writeMany: (rows: Row[]) => Promise<void>,
  unresolvedLinks: string[],
): Promise<Row[]> {
  const { refused } = await writeBatchIsolatingFailures(writes, (batch) => writeMany(batch.map((write) => write.row)));
  const refusedWrites = new Set(refused.map(({ item }) => item));
  for (const { item, error } of refused) unresolvedLinks.push(writeFailure(item.label, error));
  return writes.filter((write) => !refusedWrites.has(write)).map((write) => write.row);
}

// ── Item loot (shared by a beat's own loot and a room's own loot) ───────────

/**
 * Resolves one item name against `itemsLookup` and, when it matches, plans
 * the `loot_placements` row for it (a library match is stored as a
 * `library_item_id` reference, never cloned — the runner splits the id) —
 * parameterised by `home` rather than duplicated per caller, since a beat's
 * loot (`beat_id`+`quest_id`) and a room's loot (`location_id`) differ only
 * in which column carries the placement (`loot_placements_one_home`,
 * `loot_placements_beat_pair` in the database — see `LootPlacementHome`,
 * importSweep.ts). An unresolved name is reported rather than silently
 * dropped. The caller writes every planned row together.
 */
function planItemLoot(
  name: string,
  home: LootPlacementHome,
  contextLabel: string,
  campaignId: string,
  itemsLookup: readonly SourcedRow[],
  unresolvedLinks: string[],
  addSweepRef: (refType: QuestRefType, refId: string) => void,
): LabelledWrite<LootPlacementWrite> | null {
  const match = findByNameSourced(itemsLookup, name);
  if (!match) {
    unresolvedLinks.push(`${contextLabel} → item "${name}"`);
    return null;
  }
  addSweepRef("item", match.id);
  return {
    row: { home, campaign_id: campaignId, kind: "item", item_ref: match.id, quantity: 1, label: name },
    label: `${contextLabel} → item "${name}"`,
  };
}

// ── A room's own loot (`ExtractedLocation.item_names`) ──────────────────────

/**
 * Resolves every room's own `item_names` into a `location_id`-homed
 * `loot_placements` row per name — the design's "loot found in a keyed room
 * lives in the room" (context/features/document-import.md). `contexts` is
 * built by `importSweep.ts` from the sweep-wide `locations` registry, which
 * already covers a `create`d, `generate`d (n/a for locations, but the same
 * registry), or `link`ed room — a room the DM linked to an existing one still
 * gets the page's loot, the same "linked rows still get the page's facts"
 * rule the faction/location join rows already follow.
 */
export async function resolveLocationLoot(
  contexts: readonly LocationLootContext[],
  itemsLookup: readonly SourcedRow[],
  campaignId: string,
  deps: Pick<ImportSweepDeps, "insertLootPlacements">,
  unresolvedLinks: string[],
  addSweepRef: (refType: QuestRefType, refId: string) => void,
  /** Records `(context.locationId, resolved item id)` for every placement
   *  that actually landed — `importSweep.ts` feeds this into a map so
   *  `resolveBeatCrossReferences` (which must run afterward) can tell a beat
   *  staged at the same site not to re-list it. */
  recordPlacement: (locationId: string, itemId: string) => void,
): Promise<void> {
  const planned: LabelledWrite<LootPlacementWrite>[] = [];
  for (const context of contexts) {
    for (const name of context.itemNames) {
      const write = planItemLoot(
        name,
        { location_id: context.locationId },
        `Location "${context.locationName}"`,
        campaignId,
        itemsLookup,
        unresolvedLinks,
        addSweepRef,
      );
      if (write) planned.push(write);
    }
  }
  for (const row of await writeLabelled(planned, deps.insertLootPlacements, unresolvedLinks)) {
    if ("location_id" in row.home) recordPlacement(row.home.location_id, row.item_ref);
  }
}

// ── Beat cross-references ────────────────────────────────────────────────────

export async function resolveBeatCrossReferences(
  contexts: readonly QuestBeatContext[],
  lookups: Partial<Record<ImportEntityKind, SourcedRow[]>>,
  deps: Pick<ImportSweepDeps, "insertBeatAttachments" | "insertLootPlacements">,
  unresolvedLinks: string[],
  addSweepRef: (refType: QuestRefType, refId: string) => void,
  /** Built by `importSweep.ts` from this batch's own `locations` — see
   *  `SiteRoomIndex`'s own doc comment. Used to stop a beat staged at a site
   *  (or one of its rooms) from re-listing an encounter or a loot item the
   *  site's own room structure already supplies — "a dungeon needs no beats
   *  inside it… rooms are places, not events" (context/features/quests.md,
   *  quoting the Sites sheet). */
  siteRoomIndex: SiteRoomIndex,
  /** Every item this same sweep already placed as a specific room's own loot
   *  (`resolveLocationLoot`, which must run before this function for the map
   *  to be complete) — a beat item resolving to one of these, staged at that
   *  room's own site, is skipped rather than duplicated onto the beat. */
  roomLootByLocation: ReadonlyMap<string, ReadonlySet<string>>,
  /** Every encounter's own resolved `location_id` this sweep wrote
   *  (captured from the earlier `encounters` pass of `resolveLinks` — see
   *  `importSweep.ts`) — an encounter's *own* id says nothing about where it
   *  is staged, so checking it against `siteRoomIndex` needs this lookup. */
  encounterLocationById: ReadonlyMap<string, string>,
): Promise<void> {
  // Every beat's attachments and loot are planned first and written in one
  // request each (#951) — they were one request per row, 39 attachments on
  // a single chapter. Nothing below needs a written row's result.
  const attachments: LabelledWrite<BeatAttachmentWrite>[] = [];
  const beatLoot: LabelledWrite<LootPlacementWrite>[] = [];

  for (const context of contexts) {
    for (const beat of context.beats) {
      const beatId = context.beatIdByKey.get(beat.key);
      if (!beatId) continue; // the beat itself failed to create — best-effort skip, like every other write in this pass

      // Staged with the beat insert itself (`QuestBeatContext.stagedLocationIdByKey`).
      const stagedLocationId = context.stagedLocationIdByKey.get(beat.key);
      if (stagedLocationId) addSweepRef("location", stagedLocationId);
      else if (beat.location_name) unresolvedLinks.push(`Beat "${beat.title}" → location "${beat.location_name}"`);

      // `null` when the staged location is neither a site nor a room of one
      // (per THIS sweep's own wiring) — every reference below then resolves
      // exactly as it always has, with no skip at all.
      const siteExcludeIds = stagedLocationId ? siteAndRoomIds(stagedLocationId, siteRoomIndex) : null;

      let sortOrder = 0;
      // `quest_beat_attachments` is unique on (beat, type, ref, role): a page
      // naming the same NPC twice in one beat attaches it once, rather than a
      // duplicate refusing the whole batch into its row-by-row fallback.
      const attachedHere = new Set<string>();
      const attach = (attachmentType: QuestBeatAttachmentType, refId: string, name: string) => {
        const key = `${attachmentType}:${refId}`;
        if (attachedHere.has(key)) return;
        attachedHere.add(key);
        attachments.push({
          row: {
            beat_id: beatId,
            quest_id: context.questId,
            campaign_id: context.campaignId,
            attachment_type: attachmentType,
            ref_id: refId,
            sort_order: sortOrder++,
          },
          label: `Beat "${beat.title}" → ${attachmentType} "${name}"`,
        });
      };

      for (const name of beat.npc_names ?? []) {
        const match = findByNameSourced(lookups.npcs ?? [], name);
        if (!match) { unresolvedLinks.push(`Beat "${beat.title}" → npc "${name}"`); continue; }
        addSweepRef("npc", match.id);
        attach("npc", match.id, name);
      }
      for (const name of beat.faction_names ?? []) {
        const match = findByNameSourced(lookups.factions ?? [], name);
        if (!match) { unresolvedLinks.push(`Beat "${beat.title}" → faction "${name}"`); continue; }
        addSweepRef("faction", match.id);
        attach("faction", match.id, name);
      }
      for (const name of beat.encounter_names ?? []) {
        const match = findByNameSourced(lookups.encounters ?? [], name);
        if (!match) { unresolvedLinks.push(`Beat "${beat.title}" → encounter "${name}"`); continue; }
        // A fight already homed in this site's own room structure
        // (`encounters.location_id`) is the room's, not the beat's — the
        // beat covers the whole site, and re-listing it would duplicate what
        // the room view already shows. The encounter's OWN id says nothing
        // about where it's staged, hence the separate lookup.
        const encounterLocationId = encounterLocationById.get(match.id);
        if (siteExcludeIds && encounterLocationId && siteExcludeIds.has(encounterLocationId)) continue;
        addSweepRef("encounter", match.id);
        attach("encounter", match.id, name);
      }
      for (const name of beat.monster_names ?? []) {
        const match = findByNameSourced(lookups.monsters ?? [], name);
        if (!match) { unresolvedLinks.push(`Beat "${beat.title}" → monster "${name}"`); continue; }
        addSweepRef("monster", match.id);
        // A library monster's text id is a valid attachment ref as it stands.
        attach("monster", match.id, name);
      }
      for (const name of beat.item_names ?? []) {
        // Loot this same sweep already placed in one of the site's own rooms
        // is the room's, not the beat's — see `siteExcludeIds` above. Checked
        // by resolved item id, since (unlike an encounter) an item has no
        // location of its own to look up — `roomLootByLocation` already
        // records WHERE it landed.
        if (siteExcludeIds) {
          const match = findByNameSourced(lookups.items ?? [], name);
          if (match && itemAlreadyRoomed(match.id, siteExcludeIds, roomLootByLocation)) continue;
        }
        const write = planItemLoot(
          name,
          { beat_id: beatId, quest_id: context.questId },
          `Beat "${beat.title}"`,
          context.campaignId,
          lookups.items ?? [],
          unresolvedLinks,
          addSweepRef,
        );
        if (write) beatLoot.push(write);
      }
    }
  }

  await Promise.all([
    writeLabelled(attachments, deps.insertBeatAttachments, unresolvedLinks),
    writeLabelled(beatLoot, deps.insertLootPlacements, unresolvedLinks),
  ]);
}
