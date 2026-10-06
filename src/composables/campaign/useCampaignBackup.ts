import { stripRetiredQuestColumns } from "@/lib/quests/retiredQuestColumns";
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
} from "@/lib/campaign/campaignSerialization";
import { restoreSessions } from "@/lib/campaign/backupSessions";
import { remapMentionIds as rMention } from "@/lib/campaign/mentionRemap";
import { disposeHomebrewAndDeleteCampaign } from "@/composables/campaign/useCampaigns";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export interface GrimoireBackup {
  version: "2";
  file_type: "backup";
  exported_at: string;
  campaign: Row;
  party_members: Row[];
  character_classes: Row[];
  /** The class and subclass definitions the characters are pinned to: the
   *  campaign's own, plus any campaign-less one a character plays. */
  custom_classes: Row[];
  custom_subclasses: Row[];
  character_spells: Row[];
  companions: Row[];
  notes: Row[];
  /** The session log; notes and session proposals point into it. Absent from a
   *  backup taken before the log existed (see `restoreSessions`). */
  campaign_sessions?: Row[];
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
  /**
   * The merged consequence rule table (#794). Excludes any rule conditioned on
   * a beat or edge (`on_beat_id` / `on_edge_id` non-null) — this backup format
   * has never carried the beats/flow system (`quest_beats`, `quest_beat_edges`,
   * ...), so a beat- or edge-scoped rule has no beat to import against and
   * would either dangle or violate the FK. Only objective-became and
   * quest-settled rules travel; see the fetch in `buildExport`.
   */
  quest_consequences: Row[];
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
  /** The campaign's own Scriptorium documents (#915). Absent from a backup
   *  taken before documents could belong to a campaign. */
  scriptorium_documents?: Row[];
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

/**
 * Every custom class (or subclass) the campaign owns, plus any a character is
 * pinned to that sits outside it (a campaign-less one). A pinned definition the
 * exporter cannot read would restore as a pin to nothing, so it refuses.
 */
async function qDefinitions(
  table: "custom_classes" | "custom_subclasses",
  campaignId: string,
  pinnedIds: string[],
): Promise<Row[]> {
  const own = await qByCampaign(table, campaignId);
  const have = new Set(own.map((d) => d.id as string));
  const missing = [...new Set(pinnedIds)].filter((id) => !have.has(id));
  const extra = await qByIds(table, "id", missing);
  if (extra.length < missing.length) {
    throw new Error(
      "A character in this campaign plays a homebrew class or subclass you cannot see, so the campaign cannot be backed up. Approve it for your table first (that copies it into your table's content).",
    );
  }
  return [...own, ...extra];
}

/**
 * `quest_consequences` for these quests, excluding any rule conditioned on a
 * beat or edge — this backup format has never carried the beats/flow system,
 * so a beat-/edge-scoped rule has nothing to import against on the other end.
 * See the field comment on `GrimoireBackup.quest_consequences`.
 */
async function qQuestConsequences(questIds: string[]): Promise<Row[]> {
  if (questIds.length === 0) return [];
  const { data, error } = await supabase
    .from("quest_consequences")
    .select("*")
    .in("quest_id", questIds)
    .is("on_beat_id", null)
    .is("on_edge_id", null);
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
    campaignSessions,
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
    chroniclerImages,
    entityNotes,
    scriptoriumDocuments,
  ] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", campaignId).single().then(({ data, error }) => {
      if (error) throw error;
      return data as Row;
    }),
    qByCampaign("party_members", campaignId),
    qByCampaign("companions", campaignId),
    qByCampaign("notes", campaignId),
    qByCampaign("campaign_sessions", campaignId),
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
    qByCampaign("chronicler_images", campaignId),
    qByCampaign("entity_notes", campaignId),
    qByCampaign("scriptorium_documents", campaignId),
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
    questConsequences,
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
    qQuestConsequences(questIds),
    qByIds("crafting_recipe_ingredients", "recipe_id", recipeIds),
    qByIds("crafting_recipe_modifiers", "recipe_id", recipeIds),
    qByIds("crafting_recipe_outputs", "recipe_id", recipeIds),
    qByIds("crafting_recipe_grants", "recipe_id", recipeIds),
    qByIds("session_availability", "session_proposal_id", proposalIds),
    qByIds("store_items", "location_id", locationIds),
  ]);

  const [customClasses, customSubclasses] = await Promise.all([
    qDefinitions(
      "custom_classes",
      campaignId,
      characterClasses
        .filter((cc) => cc.class_definition_kind === "custom")
        .map((cc) => cc.class_definition_id as string),
    ),
    qDefinitions(
      "custom_subclasses",
      campaignId,
      characterClasses
        .map((cc) => cc.subclass_definition_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ]);

  // Strip sensitive fields from campaign row
  const campaignExport = { ...campaignRow };
  for (const field of CAMPAIGN_STRIP_FIELDS) delete campaignExport[field];

  const entityCounts: Record<string, number> = {
    party_members: partyMembers.length,
    companions: companions.length,
    notes: notes.length,
    campaign_sessions: campaignSessions.length,
    scriptorium_documents: scriptoriumDocuments.length,
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
    custom_classes: customClasses.length,
    custom_subclasses: customSubclasses.length,
  };

  return {
    version: "2",
    file_type: "backup",
    exported_at: new Date().toISOString(),
    campaign: campaignExport,
    party_members: partyMembers,
    character_classes: characterClasses,
    custom_classes: customClasses,
    custom_subclasses: customSubclasses,
    character_spells: characterSpells,
    companions,
    notes,
    campaign_sessions: campaignSessions,
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
    quest_consequences: questConsequences,
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
    scriptorium_documents: scriptoriumDocuments,
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
    backup.custom_classes,
    backup.custom_subclasses,
    backup.character_spells,
    backup.companions,
    backup.notes,
    backup.campaign_sessions ?? [],
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
    backup.quest_consequences,
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
    backup.scriptorium_documents ?? [],
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

export async function executeImport(
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
    // `ruleset` and `allows_mixed_rulesets` ride along in this spread: the
    // restored campaign must keep both for its characters' editions to stay valid.
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
      backup.party_members.map(({ class: _class, subclass: _subclass, ...own }) => ({
        // A character's own edition rides along in this spread, including one
        // the restored campaign would not admit at its door: a table that
        // switched edition keeps its characters, flagged, and a restore puts
        // that state back. Dropping the edition (as this did) had the database
        // stamp the campaign's on a character whose classes and spells were
        // still the other's. The restorer owns the new campaign, and the
        // database lets a table's own DM place a roster character as it is.
        // `class` and `subclass` are left out: the database keeps them as a
        // mirror of the `character_classes` rows restored below.
        ...own,
        id: r(own.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        current_location_id: r(own.current_location_id, idMap),
        owner_user_id: null,  // players re-link after import
        notes: rMention(own.notes, idMap),
        physical_description: rMention(own.physical_description, idMap),
        personality_traits: rMention(own.personality_traits, idMap),
        ideals: rMention(own.ideals, idMap),
        bonds: rMention(own.bonds, idMap),
        flaws: rMention(own.flaws, idMap),
        player_description: rMention(own.player_description, idMap),
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
        description: rMention(loc.description, idMap),
      })),
    );

    // 4. Scriptorium documents, before the NPCs whose handout they may be
    await batchInsert(
      "scriptorium_documents",
      (backup.scriptorium_documents ?? []).map((doc) => ({
        ...doc,
        id: r(doc.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        // Party-member ids, remapped like notes and NPCs; the restored
        // campaign has its party, so the audience carries over.
        player_visible_to: rArr(doc.player_visible_to, idMap),
        content: rMention(doc.content, idMap),
      })),
    );

    // 4b. NPCs (may reference locations and documents)
    await batchInsert(
      "npcs",
      backup.npcs.map((npc) => ({
        ...npc,
        id: r(npc.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        location_id: r(npc.location_id, idMap),
        player_visible_to: rArr(npc.player_visible_to, idMap),
        // A handout the backup carries is remapped to its copy; an
        // account-wide one keeps its id. linked_monster_id is a user-library
        // ref and is kept as-is.
        scriptorium_doc_id: r(npc.scriptorium_doc_id, idMap),
        appearance: rMention(npc.appearance, idMap),
        personality: rMention(npc.personality, idMap),
        backstory: rMention(npc.backstory, idMap),
        notes: rMention(npc.notes, idMap),
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
        description: rMention(f.description, idMap),
      })),
    );

    // 6. Quests (topological: parents before sub-quests)
    const sortedQuests = sortByHierarchy(backup.quests, "parent_quest_id");
    await batchInsert(
      "quests",
      sortedQuests.map((q) => {
        // A backup taken before #793 or #799 still carries columns the live
        // table no longer has, and a raw spread would fail the whole restore.
        // Shared with the world-bundle importer, which had the same job and a
        // shorter list — see `retiredQuestColumns`.
        const quest = stripRetiredQuestColumns(q);
        return {
          ...quest,
          id: r(q.id, idMap),
          campaign_id: newCampaignId,
          user_id: userId,
          parent_quest_id: r(q.parent_quest_id, idMap),
          giver_npc_id: r(q.giver_npc_id, idMap),
          location_id: r(q.location_id, idMap),
          player_visible_to: rArr(q.player_visible_to, idMap),
          // This backup format has never carried the beat graph (see the
          // on_beat_id/on_edge_id note on quest_consequences below), so a
          // spread-through entry_beat_id would point at a beat that was never
          // restored. Null and let the DB's own default-entry trigger pick it
          // once the quest's beats land.
          entry_beat_id: null,
        };
      }),
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
        // item_ids (text[]: own uuid or library text id), trap_ids and combatants
        // are kept as-is: a library id is global and must not be remapped.
        description: rMention(enc.description, idMap),
      })),
    );

    // 9. Session log, then notes: a session note points at its session, and a
    // session proposal (step 17) may too, so the log goes in first.
    const restored = restoreSessions(backup, idMap, newCampaignId, userId);
    await batchInsert("campaign_sessions", restored.sessions);

    // 10a. Notes
    await batchInsert(
      "notes",
      restored.notes.map((n) => ({
        ...n,
        id: r(n.id, idMap),
        campaign_id: newCampaignId,
        user_id: userId,
        linked_calendar_event_id: r(n.linked_calendar_event_id, idMap),
        player_visible_to: rArr(n.player_visible_to, idMap),
        content: rMention(n.content, idMap),
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
        description: rMention(ev.description, idMap),
      })),
    );

    // 11. Companions. A backup taken before 20260926155338 still carries the
    // `notes` / `party_notes` columns that migration dropped; the insert would
    // reject the whole batch over them, so they are left out.
    await batchInsert(
      "companions",
      backup.companions.map(({ notes: _notes, party_notes: _partyNotes, ...c }) => ({
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
        description: rMention(rec.description, idMap),
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
        description: rMention(pz.description, idMap),
        solution: rMention(pz.solution, idMap),
        success_outcome: rMention(pz.success_outcome, idMap),
        failure_consequence: rMention(pz.failure_consequence, idMap),
        notes: rMention(pz.notes, idMap),
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
        session_id: r(sp.session_id, idMap),
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
        session_id: r(dm.session_id, idMap),
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
        notes: rMention(inv.notes, idMap),
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
        notes: rMention(note.notes, idMap),
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
    // `quest_consequences` carries no `user_id` of its own — RLS gates through
    // the quest it belongs to. Beat/edge-scoped rules never reach this array
    // (see the field comment on `GrimoireBackup.quest_consequences`).
    await batchInsert(
      "quest_consequences",
      backup.quest_consequences.map((qc) => ({
        ...qc,
        id: r(qc.id, idMap),
        quest_id: r(qc.quest_id, idMap),
        on_objective_id: r(qc.on_objective_id, idMap),
        target_objective_id: r(qc.target_objective_id, idMap),
        // Added by #831 and #836 after this block was written, and both carry
        // a foreign key — so leaving them unremapped does not dangle quietly,
        // it either violates the FK and fails the whole restore, or (when the
        // originals still exist) silently points the restored campaign's rule
        // at the *original* campaign's NPC or quest.
        //
        // `on_beat_id` and `on_edge_id` are the only uuid columns left off this
        // list, and deliberately: the export filters beat- and
        // edge-scoped rules out entirely, because this backup format has never
        // carried the beat graph and there would be nothing to point them at.
        target_npc_id: r(qc.target_npc_id, idMap),
        target_quest_id: r(qc.target_quest_id, idMap),
        // Scriptorium documents are restored at step 4, so the copy exists.
        target_document_id: r(qc.target_document_id, idMap),
        // Same reasoning as on_beat_id/on_edge_id above: entry_beat_id names a
        // beat of target_quest_id, and this backup format never carried the
        // beat graph, so there is nothing to remap it onto. Null means "the
        // target's own entry" — the honest fallback, not a lost bridge.
        entry_beat_id: null,
      })),
    );

    // 23. Class definitions, then character classes + spells. The definitions
    // come first so each character's pin can be remapped onto the restored copy;
    // a pin left on the old campaign's definition is refused by the database.
    // Timestamps are left to the database, as the world bundle does.
    const definitionScope = { campaign_id: newCampaignId, user_id: userId };
    await batchInsert(
      "custom_classes",
      backup.custom_classes.map((cc) => ({ ...cc, id: r(cc.id, idMap), ...definitionScope })),
      ["created_at", "updated_at"],
    );
    await batchInsert(
      "custom_subclasses",
      backup.custom_subclasses.map((cs) => ({ ...cs, id: r(cs.id, idMap), ...definitionScope })),
      ["created_at", "updated_at"],
    );
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
        content: rMention(en.content, idMap),
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

class RefusedBackupError extends Error {}

/**
 * A backup is only restored if it carries what the app writes today: each
 * character's own edition and a pinned definition on every class row. There is
 * no upgrade path for a file without them. Guessing an edition or a class would
 * put a character in the wrong rules, and the database would otherwise refuse
 * a row mid-restore, after the campaign row was already made.
 */
export function assertBackupCarriesCharacterEditions(backup: GrimoireBackup): void {
  const outdated = "This backup was made by an older version of Grimoire and cannot be restored. Restore it with the version that made it, or make a new backup.";
  const unedited = backup.party_members.filter((pm) => pm.ruleset !== "2014" && pm.ruleset !== "2024");
  if (unedited.length > 0) {
    throw new RefusedBackupError(`${outdated} (${unedited.length} character(s) do not record their edition.)`);
  }
  const unpinned = backup.character_classes.filter(
    (cc) => typeof cc.class_definition_id !== "string" || (cc.class_definition_kind !== "system" && cc.class_definition_kind !== "custom"),
  );
  if (unpinned.length > 0) {
    throw new RefusedBackupError(`${outdated} (${unpinned.length} character class(es) are not linked to a class definition.)`);
  }
  if (!Array.isArray(backup.custom_classes) || !Array.isArray(backup.custom_subclasses)) {
    throw new RefusedBackupError(`${outdated} (It does not carry the class definitions its characters play.)`);
  }
  const classIds = new Set(backup.custom_classes.map((c) => c.id));
  const subclassIds = new Set(backup.custom_subclasses.map((c) => c.id));
  const dangling = backup.character_classes.filter(
    (cc) =>
      (cc.class_definition_kind === "custom" && !classIds.has(cc.class_definition_id)) ||
      (cc.subclass_definition_id != null && !subclassIds.has(cc.subclass_definition_id)),
  );
  if (dangling.length > 0) {
    throw new RefusedBackupError(
      `This backup is incomplete: ${dangling.length} character class(es) point at a class or subclass the file does not carry. Make a new backup from the campaign it came from.`,
    );
  }
}

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
        if (json.version !== "2") {
          reject(new Error(`This backup is format version ${json.version}, and Grimoire only restores version 2. Restore it with the version of Grimoire that made it, or make a new backup.`));
          return;
        }
        if (!Array.isArray(json.quest_consequences)) {
          reject(new Error("Malformed backup: a version 2 file must carry quest_consequences."));
          return;
        }
        assertBackupCarriesCharacterEditions(json);
        resolve(json);
      } catch (err) {
        if (err instanceof RefusedBackupError) {
          reject(err);
          return;
        }
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
