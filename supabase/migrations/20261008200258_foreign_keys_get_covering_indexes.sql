-- Every foreign key in public gets an index its key lookups can use.
--
-- Without one, deleting or re-keying a parent row makes Postgres scan the whole
-- child table for the rows the key's ON DELETE action applies to (or to prove
-- there are none), and a join from parent to child cannot use an index. The
-- advisor listed 76 such keys on 8 Oct 2026. All sat on small tables then (the
-- largest held 875 rows), which is why nothing felt slow; they are mostly the
-- quest system's tables, which grow with every campaign, and the created_by /
-- user_id keys an account erasure walks.
--
-- A key counts as covered when some index (with no predicate, or only
-- "<its leading column> IS NOT NULL", which a lookup on a non-null key can use)
-- either leads with the key's first column, or starts with exactly the key's
-- columns in any order. That covers 13 of the advisor's 76 already, so 63 are
-- indexed here. The advisor will keep listing those 13, because it wants every
-- key column in key order:
--   * the quest system's composite keys (beat_id, quest_id, campaign_id) exist
--     to keep a reference inside one quest and campaign; their leading id is
--     unique on its own, so an index on it finds the row as well as one on all
--     three, at a third of the width;
--   * quest_runtime_state's keys are served by its primary key, whose columns
--     are the same in another order, which an equality lookup does not mind.
-- The new indexes follow the same rule: the leading column only, partial on
-- IS NOT NULL where the column is nullable.
--
-- supabase/tests/foreign_key_indexes.test.sql applies the rule to the live
-- schema and fails when a key lands without such an index. Every table here is
-- small, so a plain (locking) create is a sub-second lock.

create index admin_audit_log_admin_user_id_idx on public.admin_audit_log (admin_user_id) where admin_user_id is not null;

create index campaign_join_requests_invite_id_idx on public.campaign_join_requests (invite_id) where invite_id is not null;
create index campaign_join_requests_party_member_id_idx on public.campaign_join_requests (party_member_id) where party_member_id is not null;

create index character_content_reviews_decided_by_idx on public.character_content_reviews (decided_by) where decided_by is not null;

create index character_memorials_marked_by_idx on public.character_memorials (marked_by) where marked_by is not null;

create index crafting_recipe_ingredients_library_item_id_idx on public.crafting_recipe_ingredients (library_item_id) where library_item_id is not null;

create index crafting_recipe_outputs_library_item_id_idx on public.crafting_recipe_outputs (library_item_id) where library_item_id is not null;

create index dashboard_layouts_campaign_id_idx on public.dashboard_layouts (campaign_id);

create index discovered_monsters_campaign_id_idx on public.discovered_monsters (campaign_id);

create index dm_note_touches_campaign_id_idx on public.dm_note_touches (campaign_id);

create index document_imports_campaign_id_idx on public.document_imports (campaign_id);
create index document_imports_user_id_idx on public.document_imports (user_id);

create index faction_items_library_item_id_idx on public.faction_items (library_item_id) where library_item_id is not null;

create index item_entries_campaign_id_idx on public.item_entries (campaign_id);
create index item_entries_party_member_id_idx on public.item_entries (party_member_id) where party_member_id is not null;
create index item_entries_user_id_idx on public.item_entries (user_id);

create index library_tile_packs_content_source_key_idx on public.library_tile_packs (content_source_key) where content_source_key is not null;

create index location_doors_user_id_idx on public.location_doors (user_id);

create index location_map_regions_user_id_idx on public.location_map_regions (user_id);

create index location_placements_user_id_idx on public.location_placements (user_id);

create index location_state_events_user_id_idx on public.location_state_events (user_id);

create index loot_placements_beat_id_idx on public.loot_placements (beat_id) where beat_id is not null;
create index loot_placements_created_by_idx on public.loot_placements (created_by) where created_by is not null;

create index npc_favors_campaign_id_idx on public.npc_favors (campaign_id);
create index npc_favors_created_by_idx on public.npc_favors (created_by) where created_by is not null;
create index npc_favors_quest_id_idx on public.npc_favors (quest_id) where quest_id is not null;
create index npc_favors_source_event_id_idx on public.npc_favors (source_event_id) where source_event_id is not null;

create index npc_inventory_library_item_id_idx on public.npc_inventory (library_item_id) where library_item_id is not null;

create index party_inventory_library_item_id_idx on public.party_inventory (library_item_id) where library_item_id is not null;

create index party_milestones_created_by_idx on public.party_milestones (created_by) where created_by is not null;
create index party_milestones_quest_id_idx on public.party_milestones (quest_id) where quest_id is not null;
create index party_milestones_source_event_id_idx on public.party_milestones (source_event_id) where source_event_id is not null;

create index prompt_screenings_user_id_idx on public.prompt_screenings (user_id);

create index quest_beat_attachments_created_by_idx on public.quest_beat_attachments (created_by) where created_by is not null;

create index quest_beat_edges_created_by_idx on public.quest_beat_edges (created_by) where created_by is not null;

create index quest_beat_transitions_created_by_idx on public.quest_beat_transitions (created_by) where created_by is not null;
create index quest_beat_transitions_from_beat_id_idx on public.quest_beat_transitions (from_beat_id) where from_beat_id is not null;

create index quest_beats_created_by_idx on public.quest_beats (created_by) where created_by is not null;

create index quest_consequence_events_calendar_event_id_idx on public.quest_consequence_events (calendar_event_id) where calendar_event_id is not null;
create index quest_consequence_events_consequence_id_idx on public.quest_consequence_events (consequence_id) where consequence_id is not null;
create index quest_consequence_events_favor_id_idx on public.quest_consequence_events (favor_id) where favor_id is not null;
create index quest_consequence_events_journal_entry_id_idx on public.quest_consequence_events (journal_entry_id) where journal_entry_id is not null;
create index quest_consequence_events_message_id_idx on public.quest_consequence_events (message_id) where message_id is not null;
create index quest_consequence_events_milestone_id_idx on public.quest_consequence_events (milestone_id) where milestone_id is not null;
create index quest_consequence_events_quest_id_idx on public.quest_consequence_events (quest_id);
create index quest_consequence_events_target_document_id_idx on public.quest_consequence_events (target_document_id) where target_document_id is not null;
create index quest_consequence_events_target_objective_id_idx on public.quest_consequence_events (target_objective_id) where target_objective_id is not null;

create index quest_consequences_entry_beat_id_idx on public.quest_consequences (entry_beat_id) where entry_beat_id is not null;
create index quest_consequences_target_clock_id_idx on public.quest_consequences (target_clock_id) where target_clock_id is not null;
create index quest_consequences_target_faction_id_idx on public.quest_consequences (target_faction_id) where target_faction_id is not null;
create index quest_consequences_target_location_id_idx on public.quest_consequences (target_location_id) where target_location_id is not null;
create index quest_consequences_target_npc_id_idx on public.quest_consequences (target_npc_id) where target_npc_id is not null;
create index quest_consequences_target_objective_id_idx on public.quest_consequences (target_objective_id) where target_objective_id is not null;
create index quest_consequences_target_quest_id_idx on public.quest_consequences (target_quest_id) where target_quest_id is not null;

create index quest_runtime_state_current_beat_id_idx on public.quest_runtime_state (current_beat_id) where current_beat_id is not null;
create index quest_runtime_state_updated_by_idx on public.quest_runtime_state (updated_by) where updated_by is not null;

create index quest_threads_campaign_id_idx on public.quest_threads (campaign_id);
create index quest_threads_created_by_idx on public.quest_threads (created_by) where created_by is not null;
create index quest_threads_merged_into_thread_id_idx on public.quest_threads (merged_into_thread_id) where merged_into_thread_id is not null;
create index quest_threads_opened_by_edge_id_idx on public.quest_threads (opened_by_edge_id) where opened_by_edge_id is not null;
create index quest_threads_parent_thread_id_idx on public.quest_threads (parent_thread_id) where parent_thread_id is not null;

create index store_items_library_item_id_idx on public.store_items (library_item_id) where library_item_id is not null;

create index tile_pack_generation_runs_tile_pack_id_idx on public.tile_pack_generation_runs (tile_pack_id) where tile_pack_id is not null;
