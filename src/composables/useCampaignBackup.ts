import { ref } from "vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Campaign } from "@/types/campaign.types";
import {
  sortByHierarchy,
  buildIdMapFromArrays,
  remapKeep as r,
  remapKeepArr as rArr,
  type IdMap,
} from "@/lib/campaignSerialization";
import { disposeHomebrewAndDeleteCampaign } from "@/composables/useCampaigns";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export interface GrimoireBackup {
  version: "1";
  file_type: "backup";
  exported_at: string;
  campaign: Row;
  party_members: Row[];
  character_classes: Row[];
  character_spells: Row[];
  companions: Row[];
  notes: Row[];
  calendar_events: Row[];
  npcs: Row[];
  npc_relationships: Row[];
  npc_pc_notes: Row[];
  npc_inventory: Row[];
  factions: Row[];
  faction_npcs: Row[];
  faction_locations: Row[];
  faction_items: Row[];
  faction_party_members: Row[];
  faction_relations: Row[];
  locations: Row[];
  store_items: Row[];
  quests: Row[];
  quest_objectives: Row[];
  quest_refs: Row[];
  quest_triggers: Row[];
  quest_trigger_scheduled: Row[];
  encounters: Row[];
  discovered_monsters: Row[];
  party_inventory: Row[];
  sounds: Row[];
  campaign_rules: Row[];
  crafting_recipes: Row[];
  crafting_recipe_ingredients: Row[];
  crafting_recipe_modifiers: Row[];
  crafting_recipe_outputs: Row[];
  crafting_recipe_grants: Row[];
  party_member_tracker_state: Row[];
  roll_tables: Row[];
  loot_tables: Row[];
  puzzle_rooms: Row[];
  pinned_forms: Row[];
  session_proposals: Row[];
  session_availability: Row[];
  chronicler_images: Row[];
  entity_notes: Row[];
  _meta: {
    entity_counts: Record<string, number>;
    app_version: string;
  };
}

export interface BackupPreview {
  campaignName: string;
  exportedAt: string;
  entityCounts: Record<string, number>;
}

// ── Query helpers ────────────────────────────────────────────────────────────

async function qByCampaign(table: string, campaignId: string): Promise<Row[]> {
  const { data, error } = await (supabase.from(table as never) as ReturnType<typeof supabase.from>)
    .select("*")
    .eq("campaign_id", campaignId);
  if (error) throw error;
  return (data ?? []) as Row[];
}

async function qByIds(table: string, field: string, ids: string[]): Promise<Row[]> {
  if (ids.length === 0) return [];
  const { data, error } = await (supabase.from(table as never) as ReturnType<typeof supabase.from>)
    .select("*")
    .in(field, ids);
  if (error) throw error;
  return (data ?? []) as Row[];
}

// ── Export ───────────────────────────────────────────────────────────────────

/** Sensitive campaign fields that must be stripped before export. */
const CAMPAIGN_STRIP_FIELDS = [
  "user_id",
  "openai_api_key",
  "anthropic_api_key",
  "gemini_api_key",
  "falai_api_key",
  "spotify_client_id",
  "ical_token",
];

async function buildExport(campaignId: string): Promise<GrimoireBackup> {
  // Phase 1: campaign-scoped entities (parallel)
  const [
    campaignRow,
    partyMembers,
    companions,
    notes,
    calendarEvents,
    npcs,
    factions,
    locations,
    quests,
    encounters,
    sounds,
    campaignRules,
    craftingRecipes,
    rollTables,
    lootTables,
    puzzleRooms,
    sessionProposals,
    discoveredMonsters,
    partyInventory,
    trackerState,
    pinnedForms,
    npcPcNotes,
    npcInventory,
    npcRelationships,
    questTriggerScheduled,
    chroniclerImages,
    entityNotes,
  ] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", campaignId).single().then(({ data, error }) => {
      if (error) throw error;
      return data as Row;
    }),
    qByCampaign("party_members", campaignId),
    qByCampaign("companions", campaignId),
    qByCampaign("notes", campaignId),
    qByCampaign("calendar_events", campaignId),
    qByCampaign("npcs", campaignId),
    qByCampaign("factions", campaignId),
    qByCampaign("locations", campaignId),
    qByCampaign("quests", campaignId),
    qByCampaign("encounters", campaignId),
    qByCampaign("sounds", campaignId),
    qByCampaign("campaign_rules", campaignId),
    qByCampaign("crafting_recipes", campaignId),
    qByCampaign("roll_tables", campaignId),
    qByCampaign("loot_tables", campaignId),
    qByCampaign("puzzle_rooms", campaignId),
    qByCampaign("session_proposals", campaignId),
    qByCampaign("discovered_monsters", campaignId),
    qByCampaign("party_inventory", campaignId),
    qByCampaign("party_member_tracker_state", campaignId),
    qByCampaign("pinned_forms", campaignId),
    qByCampaign("npc_pc_notes", campaignId),
    qByCampaign("npc_inventory", campaignId),
    qByCampaign("npc_relationships", campaignId),
    qByCampaign("quest_trigger_scheduled", campaignId),
    qByCampaign("chronicler_images", campaignId),
    qByCampaign("entity_notes", campaignId),
  ]);

  // Phase 2: child entities keyed by parent IDs (parallel)
  const pmIds = partyMembers.map((r) => r.id as string);
  const factionIds = factions.map((r) => r.id as string);
  const questIds = quests.map((r) => r.id as string);
  const recipeIds = craftingRecipes.map((r) => r.id as string);
  const proposalIds = sessionProposals.map((r) => r.id as string);
  const locationIds = locations.map((r) => r.id as string);

  const [
    characterClasses,
    characterSpells,
    factionNpcs,
    factionLocations,
    factionItems,
    factionPartyMembers,
    factionRelations,
    questObjectives,
    questRefs,
    questTriggers,
    recipeIngredients,
    recipeModifiers,
    recipeOutputs,
    recipeGrants,
    sessionAvailability,
    storeItems,
  ] = await Promise.all([
    qByIds("character_classes", "party_member_id", pmIds),
    qByIds("character_spells", "party_member_id", pmIds),
    qByIds("faction_npcs", "faction_id", factionIds),
    qByIds("faction_locations", "faction_id", factionIds),
    qByIds("faction_items", "faction_id", factionIds),
    qByIds("faction_party_members", "faction_id", factionIds),
    qByIds("faction_relations", "faction_id", factionIds),
    qByIds("quest_objectives", "quest_id", questIds),
    qByIds("quest_refs", "quest_id", questIds),
    qByIds("quest_triggers", "quest_id", questIds),
    qByIds("crafting_recipe_ingredients", "recipe_id", recipeIds),
    qByIds("crafting_recipe_modifiers", "recipe_id", recipeIds),
    qByIds("crafting_recipe_outputs", "recipe_id", recipeIds),
    qByIds("crafting_recipe_grants", "recipe_id", recipeIds),
    qByIds("session_availability", "session_proposal_id", proposalIds),
    qByIds("store_items", "location_id", locationIds),
  ]);

  // Strip sensitive fields from campaign row
  const campaignExport = { ...campaignRow };
  for (const field of CAMPAIGN_STRIP_FIELDS) delete campaignExport[field];

  const entityCounts: Record<string, number> = {
    party_members: partyMembers.length,
    companions: companions.length,
    notes: notes.length,
    calendar_events: calendarEvents.length,
    npcs: npcs.length,
    factions: factions.length,
    locations: locations.length,
    quests: quests.length,
    encounters: encounters.length,
    sounds: sounds.length,
    crafting_recipes: craftingRecipes.length,
    roll_tables: rollTables.length,
    loot_tables: lootTables.length,
    puzzle_rooms: puzzleRooms.length,
    session_proposals: sessionProposals.length,
    discovered_monsters: discoveredMonsters.length,
    party_inventory: partyInventory.length,
  };

  return {
    version: "1",
    file_type: "backup",
    exported_at: new Date().toISOString(),
    campaign: campaignExport,
    party_members: partyMembers,
    character_classes: characterClasses,
    character_spells: characterSpells,
    companions,
    notes,
    calendar_events: calendarEvents,
    npcs,
    npc_relationships: npcRelationships,
    npc_pc_notes: npcPcNotes,
    npc_inventory: npcInventory,
    factions,
    faction_npcs: factionNpcs,
    faction_locations: factionLocations,
    faction_items: factionItems,
    faction_party_members: factionPartyMembers,
    faction_relations: factionRelations,
    locations,
    store_items: storeItems,
    quests,
    quest_objectives: questObjectives,
    quest_refs: questRefs,
    quest_triggers: questTriggers,
    quest_trigger_scheduled: questTriggerScheduled,
    encounters,
    discovered_monsters: discoveredMonsters,
    party_inventory: partyInventory,
    sounds,
    campaign_rules: campaignRules,
    crafting_recipes: craftingRecipes,
    crafting_recipe_ingredients: recipeIngredients,
    crafting_recipe_modifiers: recipeModifiers,
    crafting_recipe_outputs: recipeOutputs,
    crafting_recipe_grants: recipeGrants,
    party_member_tracker_state: trackerState,
    roll_tables: rollTables,
    loot_tables: lootTables,
    puzzle_rooms: puzzleRooms,
    pinned_forms: pinnedForms,
    session_proposals: sessionProposals,
    session_availability: sessionAvailability,
    chronicler_images: chroniclerImages,
    entity_notes: entityNotes,
    _meta: { entity_counts: entityCounts, app_version: "1.0.0" },
  };
}

function downloadBackup(backup: GrimoireBackup): void {
  const name = (backup.campaign.name as string) ?? "campaign";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}.grimoire-backup`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import ───────────────────────────────────────────────────────────────────

/** Remap child_location_id in each map pin so location links survive import. */
function remapMapPins(pins: unknown, map: IdMap): unknown {
  if (!Array.isArray(pins)) return pins;
  return pins.map((pin) => ({
    ...(pin as Row),
    child_location_id: r(pin.child_location_id, map),
  }));
}

/** Build a Map<oldId → newId> for all entities that have their own UUID id column. */
function buildIdMap(backup: GrimoireBackup): IdMap {
  const entityArrays: Row[][] = [
    backup.party_members,
    backup.character_classes,
    backup.character_spells,
    backup.companions,
    backup.notes,
    backup.calendar_events,
    backup.npcs,
    backup.npc_relationships,
    backup.npc_pc_notes,
    backup.npc_inventory,
    backup.factions,
    backup.faction_npcs,
    backup.faction_locations,
    backup.faction_items,
    backup.faction_party_members,
    backup.faction_relations,
    backup.locations,
    backup.store_items,
    backup.quests,
    backup.quest_objectives,
    backup.quest_refs,
    backup.quest_triggers,
    backup.quest_trigger_scheduled,
    backup.encounters,
    backup.discovered_monsters,
    backup.party_inventory,
    backup.sounds,
    backup.crafting_recipes,
    backup.crafting_recipe_ingredients,
    backup.crafting_recipe_modifiers,
    backup.crafting_recipe_outputs,
    backup.party_member_tracker_state,
    backup.roll_tables,
    backup.loot_tables,
    backup.puzzle_rooms,
    backup.pinned_forms,
    backup.session_proposals,
    backup.session_availability,
    backup.chronicler_images,
  ];

  return buildIdMapFromArrays(entityArrays);
}

/** Insert rows in batches, omitting specified fields. */
async function batchInsert(table: string, rows: Row[], omit: string[] = []): Promise<void> {
  if (rows.length === 0) return;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => {
      const copy = { ...r };
      for (const f of omit) delete copy[f];
      return copy;
    });
    const { error } = await (supabase.from(table as never) as ReturnType<typeof supabase.from>).insert(batch as never);
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
  }
}

async function executeImport(
  backup: GrimoireBackup,
  newName: string,
): Promise<Campaign> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const userId = user.id;

  const newCampaignId = crypto.randomUUID();
  const idMap = buildIdMap(backup);
  idMap.set(backup.campaign.id as string, newCampaignId);

  // 1. Insert campaign
  const campaignInsert: Row = {
    ...backup.campaign,
    id: newCampaignId,
    user_id: userId,
    name: newName,
    is_archived: false,
    ical_token: crypto.randomUUID(),
    // Strip API keys — they don't exist in the backup but just in case
    openai_api_key: null,
    anthropic_api_key: null,
    gemini_api_key: null,
    falai_api_key: null,
    spotify_client_id: null,
  };
  const { data: createdCampaign, error: campErr } = await supabase
    .from("campaigns")
    .insert(campaignInsert)
    .select()
    .single();
  if (campErr) throw new Error(`Campaign insert failed: ${campErr.message}`);

  try {
    // 2. Party members
    await batchInsert(
      "party_members",
      backup.party_members.map((pm) => ({
        ...pm,
        id: r(pm.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        current_location_id: r(pm.current_location_id, idMap),
        owner_user_id: null,  // players re-link after import
      })),
    );

    // 3. Locations (topological: parents before children)
    const sortedLocations = sortByHierarchy(backup.locations, "parent_id");
    await batchInsert(
      "locations",
      sortedLocations.map((loc) => ({
        ...loc,
        id: r(loc.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        parent_id: r(loc.parent_id, idMap),
        npc_owner_id: r(loc.npc_owner_id, idMap),
        player_visible_to: rArr(loc.player_visible_to, idMap),
        map_pins: remapMapPins(loc.map_pins, idMap),
      })),
    );

    // 4. NPCs (may reference locations)
    await batchInsert(
      "npcs",
      backup.npcs.map((npc) => ({
        ...npc,
        id: r(npc.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        location_id: r(npc.location_id, idMap),
        player_visible_to: rArr(npc.player_visible_to, idMap),
        // linked_monster_id and scriptorium_doc_id kept as-is (user-library refs)
      })),
    );

    // 5. Factions
    await batchInsert(
      "factions",
      backup.factions.map((f) => ({
        ...f,
        id: r(f.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        player_visible_to: rArr(f.player_visible_to, idMap),
      })),
    );

    // 6. Quests (topological: parents before sub-quests)
    const sortedQuests = sortByHierarchy(backup.quests, "parent_quest_id");
    await batchInsert(
      "quests",
      sortedQuests.map((q) => ({
        ...q,
        id: r(q.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        parent_quest_id: r(q.parent_quest_id, idMap),
        giver_npc_id: r(q.giver_npc_id, idMap),
        location_id: r(q.location_id, idMap),
        player_visible_to: rArr(q.player_visible_to, idMap),
        // reward_item_ids kept as-is (user-library refs)
      })),
    );

    // 7. Quest objectives (needed before triggers)
    await batchInsert(
      "quest_objectives",
      backup.quest_objectives.map((obj) => ({
        ...obj,
        id: r(obj.id, idMap),
        quest_id: r(obj.quest_id, idMap),
      })),
    );

    // 8. Encounters
    await batchInsert(
      "encounters",
      backup.encounters.map((enc) => ({
        ...enc,
        id: r(enc.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        location_id: r(enc.location_id, idMap),
        party_member_ids: rArr(enc.party_member_ids, idMap),
        companion_ids: rArr(enc.companion_ids, idMap),
        // item_ids, trap_ids, combatants JSONB kept as-is (user-library refs)
      })),
    );

    // 9. Notes
    await batchInsert(
      "notes",
      backup.notes.map((n) => ({
        ...n,
        id: r(n.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        linked_calendar_event_id: r(n.linked_calendar_event_id, idMap),
        player_visible_to: rArr(n.player_visible_to, idMap),
      })),
    );

    // 10. Calendar events
    await batchInsert(
      "calendar_events",
      backup.calendar_events.map((ev) => ({
        ...ev,
        id: r(ev.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        linked_quest_id: r(ev.linked_quest_id, idMap),
        linked_encounter_id: r(ev.linked_encounter_id, idMap),
        linked_location_id: r(ev.linked_location_id, idMap),
        linked_note_id: r(ev.linked_note_id, idMap),
        travel_party_member_ids: rArr(ev.travel_party_member_ids, idMap),
      })),
    );

    // 11. Companions
    await batchInsert(
      "companions",
      backup.companions.map((c) => ({
        ...c,
        id: r(c.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        owner_party_member_id: r(c.owner_party_member_id, idMap),
        source_npc_id: r(c.source_npc_id, idMap),
      })),
    );

    // 12. Sounds
    await batchInsert(
      "sounds",
      backup.sounds.map((s) => ({
        ...s,
        id: r(s.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
      })),
    );

    // 13. Campaign rules (no id column — PK is campaign_id+rule_key)
    await batchInsert(
      "campaign_rules",
      backup.campaign_rules.map((cr) => ({
        ...cr,
        campaign_id: newCampaignId,
      })),
    );

    // 14. Crafting recipes
    await batchInsert(
      "crafting_recipes",
      backup.crafting_recipes.map((rec) => ({
        ...rec,
        id: r(rec.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        player_visible_to: rArr(rec.player_visible_to, idMap),
      })),
    );

    // 15. Roll / loot tables
    await batchInsert(
      "roll_tables",
      backup.roll_tables.map((rt) => ({
        ...rt,
        id: r(rt.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
      })),
    );
    await batchInsert(
      "loot_tables",
      backup.loot_tables.map((lt) => ({
        ...lt,
        id: r(lt.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        // monster_ids kept as-is (user-library refs)
      })),
    );

    // 16. Puzzle rooms
    await batchInsert(
      "puzzle_rooms",
      backup.puzzle_rooms.map((pz) => ({
        ...pz,
        id: r(pz.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        player_visible_to: rArr(pz.player_visible_to, idMap),
      })),
    );

    // 17. Session proposals + availability
    await batchInsert(
      "session_proposals",
      backup.session_proposals.map((sp) => ({
        ...sp,
        id: r(sp.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
      })),
    );
    await batchInsert(
      "session_availability",
      backup.session_availability.map((sa) => ({
        ...sa,
        id: r(sa.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        session_proposal_id: r(sa.session_proposal_id, idMap),
      })),
    );

    // 18. Discovered monsters
    await batchInsert(
      "discovered_monsters",
      backup.discovered_monsters.map((dm) => ({
        ...dm,
        id: r(dm.id, idMap),
        campaign_id: newCampaignId,
        visible_to: rArr(dm.visible_to, idMap),
        // monster_id kept as-is (user-library ref)
      })),
    );

    // 19. Party inventory (containers before items in containers)
    const sortedInventory = sortByHierarchy(backup.party_inventory, "container_id");
    await batchInsert(
      "party_inventory",
      sortedInventory.map((inv) => ({
        ...inv,
        id: r(inv.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        carried_by: r(inv.carried_by, idMap),
        container_id: r(inv.container_id, idMap),
        // item_id kept as-is (user-library ref)
      })),
    );

    // 20. NPC relations and cross-links
    await batchInsert(
      "npc_relationships",
      backup.npc_relationships.map((rel) => ({
        ...rel,
        id: r(rel.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        npc_id: r(rel.npc_id, idMap),
        related_npc_id: r(rel.related_npc_id, idMap),
      })),
    );
    await batchInsert(
      "npc_pc_notes",
      backup.npc_pc_notes.map((note) => ({
        ...note,
        id: r(note.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        npc_id: r(note.npc_id, idMap),
        party_member_id: r(note.party_member_id, idMap),
      })),
    );
    await batchInsert(
      "npc_inventory",
      backup.npc_inventory.map((inv) => ({
        ...inv,
        id: r(inv.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        npc_id: r(inv.npc_id, idMap),
        // item_id kept as-is (user-library ref)
      })),
    );

    // 21. Faction junction tables
    await batchInsert(
      "faction_npcs",
      backup.faction_npcs.map((fn) => ({
        ...fn,
        id: r(fn.id, idMap),
        user_id: userId,
        faction_id: r(fn.faction_id, idMap),
        npc_id: r(fn.npc_id, idMap),
      })),
    );
    await batchInsert(
      "faction_locations",
      backup.faction_locations.map((fl) => ({
        ...fl,
        id: r(fl.id, idMap),
        user_id: userId,
        faction_id: r(fl.faction_id, idMap),
        location_id: r(fl.location_id, idMap),
      })),
    );
    await batchInsert(
      "faction_items",
      backup.faction_items.map((fi) => ({
        ...fi,
        id: r(fi.id, idMap),
        user_id: userId,
        faction_id: r(fi.faction_id, idMap),
        // item_id kept as-is (user-library ref)
      })),
    );
    await batchInsert(
      "faction_party_members",
      backup.faction_party_members.map((fpm) => ({
        ...fpm,
        id: r(fpm.id, idMap),
        user_id: userId,
        faction_id: r(fpm.faction_id, idMap),
        party_member_id: r(fpm.party_member_id, idMap),
      })),
    );
    await batchInsert(
      "faction_relations",
      backup.faction_relations.map((fr) => ({
        ...fr,
        id: r(fr.id, idMap),
        user_id: userId,
        faction_id: r(fr.faction_id, idMap),
        target_faction_id: r(fr.target_faction_id, idMap),
      })),
    );

    // 22. Quest child tables
    await batchInsert(
      "quest_refs",
      backup.quest_refs.map((qr) => ({
        ...qr,
        id: r(qr.id, idMap),
        quest_id: r(qr.quest_id, idMap),
        // ref_id: remap based on ref_type for campaign entities
        ref_id: ["npc", "location", "encounter"].includes(qr.ref_type as string)
          ? r(qr.ref_id, idMap)
          : (qr.ref_id as string),
      })),
    );
    await batchInsert(
      "quest_triggers",
      backup.quest_triggers.map((qt) => ({
        ...qt,
        id: r(qt.id, idMap),
        user_id: userId,
        quest_id: r(qt.quest_id, idMap),
        objective_id: r(qt.objective_id, idMap),
      })),
    );
    await batchInsert(
      "quest_trigger_scheduled",
      backup.quest_trigger_scheduled.map((qts) => ({
        ...qts,
        id: r(qts.id, idMap),
        user_id: userId,
        campaign_id: newCampaignId,
        trigger_id: r(qts.trigger_id, idMap),
        quest_id: r(qts.quest_id, idMap),
      })),
    );

    // 23. Character classes + spells
    await batchInsert(
      "character_classes",
      backup.character_classes.map((cc) => ({
        ...cc,
        id: r(cc.id, idMap),
        party_member_id: r(cc.party_member_id, idMap),
        class_definition_id: cc.class_definition_kind === "custom"
          ? r(cc.class_definition_id, idMap)
          : cc.class_definition_id,
        subclass_definition_id: r(cc.subclass_definition_id, idMap),
      })),
    );
    await batchInsert(
      "character_spells",
      backup.character_spells.map((cs) => ({
        ...cs,
        id: r(cs.id, idMap),
        party_member_id: r(cs.party_member_id, idMap),
        source_class_id: r(cs.source_class_id, idMap),
        // spell_id kept as-is (user-library ref)
      })),
    );

    // 24. Crafting recipe children
    await batchInsert(
      "crafting_recipe_ingredients",
      backup.crafting_recipe_ingredients.map((ing) => ({
        ...ing,
        id: r(ing.id, idMap),
        recipe_id: r(ing.recipe_id, idMap),
        // item_id kept as-is
      })),
    );
    await batchInsert(
      "crafting_recipe_modifiers",
      backup.crafting_recipe_modifiers.map((mod) => ({
        ...mod,
        id: r(mod.id, idMap),
        recipe_id: r(mod.recipe_id, idMap),
      })),
    );
    await batchInsert(
      "crafting_recipe_outputs",
      backup.crafting_recipe_outputs.map((out) => ({
        ...out,
        id: r(out.id, idMap),
        recipe_id: r(out.recipe_id, idMap),
        // item_id kept as-is
      })),
    );
    // crafting_recipe_grants has no id column
    await batchInsert(
      "crafting_recipe_grants",
      backup.crafting_recipe_grants.map((grant) => ({
        ...grant,
        recipe_id: r(grant.recipe_id, idMap),
        party_member_id: r(grant.party_member_id, idMap),
      })),
    );

    // 25. Tracker state, pinned forms, store items, chronicler images
    await batchInsert(
      "party_member_tracker_state",
      backup.party_member_tracker_state.map((ts) => ({
        ...ts,
        id: r(ts.id, idMap),
        campaign_id: newCampaignId,
        party_member_id: r(ts.party_member_id, idMap),
        // rule_id kept as-is (user-library ref)
      })),
    );
    await batchInsert(
      "pinned_forms",
      backup.pinned_forms.map((pf) => ({
        ...pf,
        id: r(pf.id, idMap),
        campaign_id: newCampaignId,
        party_member_id: r(pf.party_member_id, idMap),
        // monster_id kept as-is (user-library ref)
      })),
    );
    await batchInsert(
      "store_items",
      backup.store_items.map((si) => ({
        ...si,
        id: r(si.id, idMap),
        user_id: userId,
        location_id: r(si.location_id, idMap),
        // item_id kept as-is
      })),
    );
    await batchInsert(
      "chronicler_images",
      backup.chronicler_images.map((ci) => ({
        ...ci,
        id: r(ci.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
      })),
    );

    // 26. Entity notes — entity_id holds UUIDs of campaign entities, remap them
    await batchInsert(
      "entity_notes",
      (backup.entity_notes ?? []).map((en) => ({
        ...en,
        id: r(en.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        entity_id: r(en.entity_id, idMap) ?? en.entity_id,
      })),
    );
  } catch (err) {
    // Attempt rollback — delete the partially-created campaign. Route through
    // the shared homebrew-aware path (#585): custom_classes/custom_subclasses/
    // class_features FKs are NO ACTION, so a bare `campaigns` delete throws if
    // this import had already created campaign-scoped homebrew. "delete" is
    // correct here — a rollback undoes the import's own work, it never
    // touches pre-existing user content.
    await disposeHomebrewAndDeleteCampaign(newCampaignId, "delete");
    throw err;
  }

  return createdCampaign as Campaign;
}

// ── Parse + preview ──────────────────────────────────────────────────────────

export function parseBackupFile(file: File): Promise<GrimoireBackup> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target!.result as string) as GrimoireBackup;
        if (json.file_type !== "backup") {
          reject(new Error("Invalid file type. This appears to be a world bundle (.grimoire), not a campaign backup."));
          return;
        }
        if (json.version !== "1") {
          reject(new Error(`Unsupported backup version: ${json.version}`));
          return;
        }
        resolve(json);
      } catch {
        reject(new Error("Could not parse backup file. Make sure you selected a valid .grimoire-backup file."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export function getBackupPreview(backup: GrimoireBackup): BackupPreview {
  return {
    campaignName: backup.campaign.name as string,
    exportedAt: backup.exported_at,
    entityCounts: backup._meta.entity_counts,
  };
}

// ── Composables ──────────────────────────────────────────────────────────────

export function useExportCampaign() {
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const backup = await buildExport(campaignId);
      downloadBackup(backup);
    },
  });
}

export function useImportCampaign() {
  const queryClient = useQueryClient();
  const backup = ref<GrimoireBackup | null>(null);
  const parseError = ref<string | null>(null);

  function reset() {
    backup.value = null;
    parseError.value = null;
  }

  async function parseFile(file: File) {
    parseError.value = null;
    try {
      backup.value = await parseBackupFile(file);
    } catch (err) {
      parseError.value = err instanceof Error ? err.message : "Unknown error";
      backup.value = null;
    }
  }

  const { mutateAsync, isPending } = useMutation({
    mutationFn: ({ newName }: { newName: string }) => {
      if (!backup.value) throw new Error("No backup loaded");
      return executeImport(backup.value, newName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });

  return {
    backup,
    parseError,
    preview: () => backup.value ? getBackupPreview(backup.value) : null,
    parseFile,
    executeImport: (newName: string) => mutateAsync({ newName }),
    isPending,
    reset,
  };
}
