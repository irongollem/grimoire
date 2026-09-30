-- #936 story 4: stop bypassing RLS where RLS already authorizes the caller.
--
-- Every SECURITY DEFINER function a client can call runs as postgres, so its
-- own guard is the only thing between the caller and every row; one mistake in
-- that guard is a hole (the NULL-predicate bypass fixed in
-- 20260930224547 is the latest example). The functions below were audited one
-- by one against the live policies and grants: for each, every table it reads or
-- writes already admits the legitimate caller through a policy of the same
-- scope as the function's guard, and refuses the wrong caller on its own. So
-- they run as the caller from now on. Their guards stay, as a second check.
--
-- What decided the ones that stay definers, so the next audit does not redo it:
--   * player projections of DM-owned tables (get_player_visible_*, encounter and
--     session state) exist because players cannot read those tables at all;
--   * claims and transfers write rows the caller does not own (chat drops,
--     offers, ownership transfer, family decisions, admin writes);
--   * quest runtime writes need privileges authenticated does not have on
--     quest_runtime_state and quest_beat_transitions, and private helpers only
--     postgres may execute. (close_quest_thread and improvise_quest_runtime are
--     converted below all the same: they only read the runtime state, and hand
--     every runtime write to transition_quest_runtime, which stays a definer.)
--   * the quests, items, npcs and locations SELECT policies are owner-only while
--     private.is_campaign_dm() admits any member with role 'dm', so a quest or
--     loot reader run as the caller would return less to a DM who is not the
--     owner (get_campaign_live_quests, get_loot_placements,
--     search_quest_runtime_jump_targets and the like);
--   * character_classes and character_spells policies do not admit the campaign
--     DM, so the spellcasting and levelling functions cannot run as the caller;
--   * check_quota / check_all_quotas count rows the caller's policies hide
--     (factions, deities, pantheons), so as the caller they would under-count.

-- Shared library content: the policies are `using (true)` for anon and
-- authenticated alike, so there is nothing for a definer to add.
alter function public.get_library_item_sources(text) security invoker;
alter function public.get_library_monster_sources(text) security invoker;
alter function public.get_library_species_sources(text) security invoker;
alter function public.get_library_spell_sources(text) security invoker;

-- Admin art sync: library_*_update policies are private.is_app_admin().
alter function public.sync_library_item_art() security invoker;
alter function public.sync_library_monster_art() security invoker;
alter function public.sync_library_spell_art() security invoker;

-- Reordering the caller's own rows: each table's UPDATE policy has the same
-- scope as the function's precheck.
alter function public.reorder_notes(uuid[], integer[]) security invoker;
alter function public.reorder_party_inventory(uuid[], integer[]) security invoker;
alter function public.reorder_player_journal_entries(uuid[], integer[]) security invoker;
alter function public.reorder_soundboard_pages(uuid[], integer[]) security invoker;
alter function public.reorder_sounds(uuid[], integer[]) security invoker;

-- The caller's own character: party_members_creator_update and
-- party_members_player_update cover every caller the guard admits.
alter function public.set_shapeshifter_appearance(uuid, uuid) security invoker;
alter function public.clear_shapeshifter_appearance(uuid) security invoker;
alter function public.end_innate_sorcery(uuid) security invoker;

-- DM-only campaign state whose policies are private.is_campaign_dm().
alter function public.start_campaign_session(uuid) security invoker;
alter function public.end_campaign_session(uuid) security invoker;
alter function public.close_quest_thread(uuid, uuid, uuid, text) security invoker;
alter function public.improvise_quest_runtime(uuid, uuid, uuid, bigint, text, text, text, text, text, boolean, boolean) security invoker;
alter function public.resolve_downtime_draw(uuid, text, text, text, uuid, jsonb, uuid, jsonb) security invoker;

-- Every member may already read every campaign_members row, and
-- private.may_whisper is the same check the message INSERT policy runs.
alter function public.get_whisper_recipients(uuid) security invoker;

-- Name matching against the caller's own items/monsters and the shared library.
-- Its only obstacle was the pure text normaliser, which authenticated could not
-- execute.
grant execute on function private.normalize_entity_name(text) to authenticated;
alter function public.resolve_item_references(uuid, text[]) security invoker;
alter function public.resolve_monster_references(uuid, text[]) security invoker;
