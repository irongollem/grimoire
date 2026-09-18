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
import { plainRows, type ImportSweepDeps, type LootPlacementHome, type SourcedRow } from "./importSweep";

export interface QuestBeatContext {
  questId: string;
  campaignId: string;
  questDisplayName: string;
  beatIdByKey: Map<string, string>;
  beats: ExtractedQuestBeat[];
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

function findByNameSourced(rows: readonly SourcedRow[], name: string): SourcedRow | undefined {
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

  for (const context of contexts) {
    const names = [...new Set(context.combatants.map((c) => c.custom_name).filter((n): n is string => n !== null))];
    if (names.length === 0) continue;

    // The sweep's own monster registry (created/linked this run, campaign OR
    // library) first — a combatant naming a monster this same sweep already
    // resolved should use *that* row, not a fresh RPC lookup that might rank
    // a different candidate. Only names it doesn't cover go to the RPC.
    const monsterMatches = new Map<string, { targetId: string }>();
    const needRpc: string[] = [];
    for (const name of names) {
      const match = findByNameSourced(monsterLookup, name);
      if (match) monsterMatches.set(name, { targetId: match.id });
      else needRpc.push(name);
    }
    if (needRpc.length > 0) {
      for (const [name, match] of await deps.resolveMonsterNames(needRpc)) monsterMatches.set(name, match);
    }

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

    try {
      await deps.updateEncounterCombatants(context.id, resolved);
    } catch {
      // Best-effort: the encounter already landed and is already counted.
    }
  }
}

// ── Item loot (shared by a beat's own loot and a room's own loot) ───────────

/**
 * Resolves one item name against `itemsLookup` and, when it lands on a
 * campaign row, writes the `loot_placements` row for it — parameterised by
 * `home` rather than duplicated per caller, since a beat's loot
 * (`beat_id`+`quest_id`) and a room's loot (`location_id`) differ only in
 * which column carries the placement (`loot_placements_one_home`,
 * `loot_placements_beat_pair` in the database — see `LootPlacementHome`,
 * importSweep.ts). An unresolved name, or one that only resolves to a
 * shared-library item (`loot_placements.item_id` is a uuid FK into `items`,
 * so a library id can never satisfy it), is reported rather than silently
 * dropped — a beat's failure still names the quest fallback it has
 * (`quest_refs`, via the registry), a room's does not, since a location has
 * no quest to fall back to linking at.
 */
async function attachItemLoot(
  name: string,
  home: LootPlacementHome,
  contextLabel: string,
  campaignId: string,
  itemsLookup: readonly SourcedRow[],
  deps: Pick<ImportSweepDeps, "insertLootPlacement">,
  unresolvedLinks: string[],
  addSweepRef: (refType: QuestRefType, refId: string) => void,
  /** Called with the resolved item id right after a successful insert —
   *  `resolveLocationLoot` uses this to record which items landed in which
   *  room, so a later beat staged at that room's site doesn't re-list them
   *  (see `SiteRoomIndex`). A beat's own loot has nothing downstream that
   *  needs to know about it, so it passes no callback at all. */
  onPlaced?: (itemId: string) => void,
): Promise<void> {
  const match = findByNameSourced(itemsLookup, name);
  if (!match) {
    unresolvedLinks.push(`${contextLabel} → item "${name}"`);
    return;
  }
  addSweepRef("item", match.id);
  if (match.source !== "campaign") {
    const targetPhrase =
      "location_id" in home
        ? "a loot placement can't target a library row."
        : "linked to the quest, but a loot placement can't target a library row.";
    unresolvedLinks.push(`${contextLabel} → item "${name}" is a shared-library item; ${targetPhrase}`);
    return;
  }
  try {
    await deps.insertLootPlacement({ home, campaign_id: campaignId, kind: "item", item_id: match.id, quantity: 1, label: name });
    onPlaced?.(match.id);
  } catch {
    // Best-effort.
  }
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
  deps: Pick<ImportSweepDeps, "insertLootPlacement">,
  unresolvedLinks: string[],
  addSweepRef: (refType: QuestRefType, refId: string) => void,
  /** Records `(context.locationId, resolved item id)` for every placement
   *  that actually landed — `importSweep.ts` feeds this into a map so
   *  `resolveBeatCrossReferences` (which must run afterward) can tell a beat
   *  staged at the same site not to re-list it. */
  recordPlacement: (locationId: string, itemId: string) => void,
): Promise<void> {
  for (const context of contexts) {
    for (const name of context.itemNames) {
      await attachItemLoot(
        name,
        { location_id: context.locationId },
        `Location "${context.locationName}"`,
        campaignId,
        itemsLookup,
        deps,
        unresolvedLinks,
        addSweepRef,
        (itemId) => recordPlacement(context.locationId, itemId),
      );
    }
  }
}

// ── Beat cross-references ────────────────────────────────────────────────────

export async function resolveBeatCrossReferences(
  contexts: readonly QuestBeatContext[],
  lookups: Partial<Record<ImportEntityKind, SourcedRow[]>>,
  deps: Pick<ImportSweepDeps, "updateBeatLocation" | "insertBeatAttachment" | "insertLootPlacement">,
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
  for (const context of contexts) {
    for (const beat of context.beats) {
      const beatId = context.beatIdByKey.get(beat.key);
      if (!beatId) continue; // the beat itself failed to create — best-effort skip, like every other write in this pass

      let stagedLocationId: string | undefined;
      if (beat.location_name) {
        const match = findByNameSourced(lookups.locations ?? [], beat.location_name);
        if (match) {
          stagedLocationId = match.id;
          addSweepRef("location", match.id);
          try {
            await deps.updateBeatLocation(beatId, match.id);
          } catch {
            // Best-effort.
          }
        } else {
          unresolvedLinks.push(`Beat "${beat.title}" → location "${beat.location_name}"`);
        }
      }

      // `null` when the staged location is neither a site nor a room of one
      // (per THIS sweep's own wiring) — every reference below then resolves
      // exactly as it always has, with no skip at all.
      const siteExcludeIds = stagedLocationId ? siteAndRoomIds(stagedLocationId, siteRoomIndex) : null;

      let sortOrder = 0;
      const attach = async (attachmentType: QuestBeatAttachmentType, refId: string) => {
        try {
          await deps.insertBeatAttachment({
            beat_id: beatId,
            quest_id: context.questId,
            campaign_id: context.campaignId,
            attachment_type: attachmentType,
            ref_id: refId,
            sort_order: sortOrder++,
          });
        } catch {
          // Best-effort.
        }
      };

      for (const name of beat.npc_names ?? []) {
        const match = findByNameSourced(lookups.npcs ?? [], name);
        if (!match) { unresolvedLinks.push(`Beat "${beat.title}" → npc "${name}"`); continue; }
        addSweepRef("npc", match.id);
        await attach("npc", match.id);
      }
      for (const name of beat.faction_names ?? []) {
        const match = findByNameSourced(lookups.factions ?? [], name);
        if (!match) { unresolvedLinks.push(`Beat "${beat.title}" → faction "${name}"`); continue; }
        addSweepRef("faction", match.id);
        await attach("faction", match.id);
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
        await attach("encounter", match.id);
      }
      for (const name of beat.monster_names ?? []) {
        const match = findByNameSourced(lookups.monsters ?? [], name);
        if (!match) { unresolvedLinks.push(`Beat "${beat.title}" → monster "${name}"`); continue; }
        addSweepRef("monster", match.id);
        if (match.source === "campaign") {
          await attach("monster", match.id);
        } else {
          unresolvedLinks.push(
            `Beat "${beat.title}" → monster "${name}" is a shared-library creature; linked to the quest, but a beat attachment can't target a library row.`,
          );
        }
      }
      for (const name of beat.item_names ?? []) {
        // Loot this same sweep already placed in one of the site's own rooms
        // is the room's, not the beat's — see `siteExcludeIds` above. Checked
        // by resolved item id, since (unlike an encounter) an item has no
        // location of its own to look up — `roomLootByLocation` already
        // records WHERE it landed.
        if (siteExcludeIds) {
          const itemsLookup = lookups.items ?? [];
          const match = findByNameSourced(itemsLookup, name);
          if (match && itemAlreadyRoomed(match.id, siteExcludeIds, roomLootByLocation)) continue;
        }
        await attachItemLoot(
          name,
          { beat_id: beatId, quest_id: context.questId },
          `Beat "${beat.title}"`,
          context.campaignId,
          lookups.items ?? [],
          deps,
          unresolvedLinks,
          addSweepRef,
        );
      }
    }
  }
}
