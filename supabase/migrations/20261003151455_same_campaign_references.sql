-- Write-time "same campaign" check for every foreign key between two
-- campaign-scoped tables (#892).
--
-- A foreign key only proves the referenced row exists. The write policies on
-- these tables check who may write the row, never where its references point,
-- so any signed-in user could PATCH their own encounter's location_id to
-- another account's location. On its own that only corrupts the writer's row;
-- it becomes a disclosure the moment a SECURITY DEFINER read joins across the
-- reference without re-scoping the joined row, which bypasses the referenced
-- table's RLS. The first draft of match_import_entity_names (20260918141022)
-- did exactly that. Every definer read since re-checks the campaign itself,
-- but per reader, so the next unscoped join reopens it. This closes it at the
-- write instead, for all 76 such columns, enumerated from pg_constraint.
--
-- A reference is allowed when the referenced row:
--   * is in the same campaign; or
--   * is a global row (campaign_id null) owned by the writer, the campaign's
--     owner or any of its members: the vault item a player adds to their
--     inventory, the homebrew NPC a DM stages a quest at, a player's own
--     character seated at the table through campaign_members.party_member_id
--     (which the DM then grants downtime to), the orphans a campaign delete
--     leaves under SET NULL; or
--   * belongs to the row's owner, when either side is global: a DM's homebrew
--     location nested under one of their campaign locations.
-- For a direct client write "the owner" is auth.uid(), never the row's own
-- user_id: a client chooses what it writes there, and party_inventory's insert
-- policy did not pin it, so trusting it let a member claim to be a victim and
-- reference the victim's global item (found in the pre-push audit). Inside a
-- SECURITY DEFINER RPC the row's user_id is trusted, because the RPC wrote it;
-- see the function. A write with no auth.uid() at all is server code (service
-- role, a migration, a cron), which RLS already trusts; it is let through
-- explicitly rather than by a NULL comparison falling one way or the other.
--
-- Measured before shipping, reading each row's owner as its writer: this rule
-- admits every one of the 2,306 linked rows in production (137 of them cross a campaign line or point at a global
-- row, all under the allowances above), so no existing data violates it.
--
-- `UPDATE OF <references>, campaign_id` keeps the check off the hot paths: a
-- combat update to encounter_state that sets only `state` never fires it. A
-- row moving to another campaign re-checks every reference it carries; a row
-- going global (a campaign delete promoting homebrew) does not, because the
-- references that pointed into the dying campaign are about to be cleared by
-- its own cascade. The check runs on the row that holds the reference: moving
-- the *referenced* row to another campaign does not re-judge the rows pointing
-- at it. The app moves records between campaigns by copying them
-- (copyToCampaign drops a reference the target cannot see), never by updating
-- campaign_id, so that direction has no writer today.
--
-- The trigger is named zz_same_campaign_refs so it fires after every other
-- BEFORE trigger on the table (same-event triggers fire in name order) and
-- judges the row as it will be stored.
--
-- private.validate_quest_beat_attachment keeps its own, stricter check: its
-- ref_id is text and polymorphic, so it is not a foreign key and not here.
-- supabase/tests/same_campaign_refs.test.sql fails if a new foreign key
-- between campaign-scoped tables lands without this trigger naming it.

-- The referenced row's campaign and owner, read past RLS: a reference may be
-- legitimate although the writer cannot select the row (a player's note on an
-- NPC they only see through a projection). Private, so PostgREST never exposes
-- it; authenticated keeps EXECUTE because the invoker trigger below runs as
-- the writer. v_table comes only from TG_ARGV, fixed by migration.
create or replace function private.campaign_ref_scope(p_table text, p_id uuid, p_owned boolean, out campaign_id uuid, out user_id uuid, out found boolean)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if p_owned then
    execute format('select campaign_id, user_id from public.%I where id = $1', p_table) into campaign_id, user_id using p_id;
  else
    execute format('select campaign_id, null::uuid from public.%I where id = $1', p_table) into campaign_id, user_id using p_id;
  end if;
  get diagnostics found = row_count;
end;
$$;

revoke execute on function private.campaign_ref_scope(text, uuid, boolean) from public, anon;
grant execute on function private.campaign_ref_scope(text, uuid, boolean) to authenticated, service_role;

-- SECURITY INVOKER on purpose: `current_user` must say who is writing. A direct
-- client write runs as `authenticated`, and there a row's user_id is whatever
-- the client sent, so only auth.uid() counts as the owner. Inside a SECURITY
-- DEFINER RPC current_user is the function's owner: that code chose user_id
-- deliberately (transfer_campaign_ownership clones a global NPC and its linked
-- monster for the incoming owner while the outgoing one is the caller), so the
-- row's own user_id is trusted there.
create or replace function private.enforce_same_campaign_refs()
returns trigger
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  -- Arguments come in triples: (column, referenced table, 'owned' when the
  -- referenced table has a user_id column, else 'unowned').
  v_row jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_campaign uuid := (v_row ->> 'campaign_id')::uuid;
  v_writer uuid := auth.uid();
  v_owner uuid;
  v_moved boolean := tg_op = 'UPDATE'
    and v_campaign is not null
    and v_campaign is distinct from (v_old ->> 'campaign_id')::uuid;
  v_column text;
  v_table text;
  v_ref uuid;
  v_scope record;
  i integer := 0;
begin
  -- Server code: see the header. Explicit, so no allowance below ever has to
  -- reason about a NULL writer.
  if v_writer is null then
    return new;
  end if;
  v_owner := case
    when current_user in ('authenticated', 'anon') then v_writer
    else coalesce((v_row ->> 'user_id')::uuid, v_writer)
  end;

  while i < tg_nargs loop
    v_column := tg_argv[i];
    v_table := tg_argv[i + 1];
    i := i + 3;

    v_ref := (v_row ->> v_column)::uuid;
    continue when v_ref is null;
    continue when tg_op = 'UPDATE' and not v_moved
      and v_ref is not distinct from (v_old ->> v_column)::uuid;

    select * into v_scope from private.campaign_ref_scope(v_table, v_ref, tg_argv[i - 1] = 'owned');
    -- A missing row is the foreign key's to report, with its own message.
    continue when not v_scope.found;

    continue when v_scope.campaign_id = v_campaign;

    continue when v_scope.campaign_id is null and v_scope.user_id is not null and (
      v_scope.user_id = v_writer
      or exists (select 1 from public.campaigns c where c.id = v_campaign and c.user_id = v_scope.user_id)
      or exists (select 1 from public.campaign_members m
                  where m.campaign_id = v_campaign and m.user_id = v_scope.user_id));

    continue when (v_campaign is null or v_scope.campaign_id is null)
      and v_scope.user_id is not null and v_scope.user_id = v_owner;

    raise exception using
      errcode = '23514',
      message = format('%s.%s must point at a row in the same campaign', tg_table_name, v_column),
      hint = 'A reference may cross into a global row its owner may use, never into another campaign.';
  end loop;
  return new;
end;
$$;

-- A trigger function never needs EXECUTE: the trigger system does not check it.
revoke execute on function private.enforce_same_campaign_refs() from public, anon, authenticated;


drop trigger if exists zz_same_campaign_refs on public.calendar_events;
create trigger zz_same_campaign_refs
  before insert or update of linked_encounter_id, linked_location_id, linked_note_id, linked_quest_id, campaign_id on public.calendar_events
  for each row execute procedure private.enforce_same_campaign_refs('linked_encounter_id', 'encounters', 'owned', 'linked_location_id', 'locations', 'owned', 'linked_note_id', 'notes', 'owned', 'linked_quest_id', 'quests', 'owned');

drop trigger if exists zz_same_campaign_refs on public.campaign_join_requests;
create trigger zz_same_campaign_refs
  before insert or update of invite_id, party_member_id, campaign_id on public.campaign_join_requests
  for each row execute procedure private.enforce_same_campaign_refs('invite_id', 'campaign_invites', 'unowned', 'party_member_id', 'party_members', 'owned');

drop trigger if exists zz_same_campaign_refs on public.campaign_members;
create trigger zz_same_campaign_refs
  before insert or update of party_member_id, campaign_id on public.campaign_members
  for each row execute procedure private.enforce_same_campaign_refs('party_member_id', 'party_members', 'owned');

drop trigger if exists zz_same_campaign_refs on public.character_content_reviews;
create trigger zz_same_campaign_refs
  before insert or update of party_member_id, campaign_id on public.character_content_reviews
  for each row execute procedure private.enforce_same_campaign_refs('party_member_id', 'party_members', 'owned');

drop trigger if exists zz_same_campaign_refs on public.companions;
create trigger zz_same_campaign_refs
  before insert or update of owner_party_member_id, source_npc_id, campaign_id on public.companions
  for each row execute procedure private.enforce_same_campaign_refs('owner_party_member_id', 'party_members', 'owned', 'source_npc_id', 'npcs', 'owned');

drop trigger if exists zz_same_campaign_refs on public.deities;
create trigger zz_same_campaign_refs
  before insert or update of pantheon_id, campaign_id on public.deities
  for each row execute procedure private.enforce_same_campaign_refs('pantheon_id', 'pantheons', 'owned');

drop trigger if exists zz_same_campaign_refs on public.discovered_monsters;
create trigger zz_same_campaign_refs
  before insert or update of monster_id, campaign_id on public.discovered_monsters
  for each row execute procedure private.enforce_same_campaign_refs('monster_id', 'monsters', 'owned');

drop trigger if exists zz_same_campaign_refs on public.downtime_draws;
create trigger zz_same_campaign_refs
  before insert or update of party_member_id, campaign_id on public.downtime_draws
  for each row execute procedure private.enforce_same_campaign_refs('party_member_id', 'party_members', 'owned');

drop trigger if exists zz_same_campaign_refs on public.downtime_grants;
create trigger zz_same_campaign_refs
  before insert or update of party_member_id, campaign_id on public.downtime_grants
  for each row execute procedure private.enforce_same_campaign_refs('party_member_id', 'party_members', 'owned');

drop trigger if exists zz_same_campaign_refs on public.downtime_outcomes;
create trigger zz_same_campaign_refs
  before insert or update of draw_id, campaign_id on public.downtime_outcomes
  for each row execute procedure private.enforce_same_campaign_refs('draw_id', 'downtime_draws', 'unowned');

drop trigger if exists zz_same_campaign_refs on public.encounter_state;
create trigger zz_same_campaign_refs
  before insert or update of encounter_id, session_id, campaign_id on public.encounter_state
  for each row execute procedure private.enforce_same_campaign_refs('encounter_id', 'encounters', 'owned', 'session_id', 'campaign_session_state', 'owned');

drop trigger if exists zz_same_campaign_refs on public.encounter_state_player_updates;
create trigger zz_same_campaign_refs
  before insert or update of encounter_id, encounter_state_id, campaign_id on public.encounter_state_player_updates
  for each row execute procedure private.enforce_same_campaign_refs('encounter_id', 'encounters', 'owned', 'encounter_state_id', 'encounter_state', 'owned');

drop trigger if exists zz_same_campaign_refs on public.encounters;
create trigger zz_same_campaign_refs
  before insert or update of location_id, campaign_id on public.encounters
  for each row execute procedure private.enforce_same_campaign_refs('location_id', 'locations', 'owned');

drop trigger if exists zz_same_campaign_refs on public.faction_deities;
create trigger zz_same_campaign_refs
  before insert or update of deity_id, faction_id, campaign_id on public.faction_deities
  for each row execute procedure private.enforce_same_campaign_refs('deity_id', 'deities', 'owned', 'faction_id', 'factions', 'owned');

drop trigger if exists zz_same_campaign_refs on public.item_entries;
create trigger zz_same_campaign_refs
  before insert or update of item_id, party_member_id, campaign_id on public.item_entries
  for each row execute procedure private.enforce_same_campaign_refs('item_id', 'items', 'owned', 'party_member_id', 'party_members', 'owned');

drop trigger if exists zz_same_campaign_refs on public.locations;
create trigger zz_same_campaign_refs
  before insert or update of npc_owner_id, parent_id, source_map_id, campaign_id on public.locations
  for each row execute procedure private.enforce_same_campaign_refs('npc_owner_id', 'npcs', 'owned', 'parent_id', 'locations', 'owned', 'source_map_id', 'dungeon_maps', 'owned');

drop trigger if exists zz_same_campaign_refs on public.minis;
create trigger zz_same_campaign_refs
  before insert or update of stylize_job_id, campaign_id on public.minis
  for each row execute procedure private.enforce_same_campaign_refs('stylize_job_id', 'image_generation_jobs', 'owned');

drop trigger if exists zz_same_campaign_refs on public.monsters;
create trigger zz_same_campaign_refs
  before insert or update of lair_location_id, campaign_id on public.monsters
  for each row execute procedure private.enforce_same_campaign_refs('lair_location_id', 'locations', 'owned');

drop trigger if exists zz_same_campaign_refs on public.notes;
create trigger zz_same_campaign_refs
  before insert or update of linked_calendar_event_id, campaign_id on public.notes
  for each row execute procedure private.enforce_same_campaign_refs('linked_calendar_event_id', 'calendar_events', 'owned');

drop trigger if exists zz_same_campaign_refs on public.npc_favors;
create trigger zz_same_campaign_refs
  before insert or update of npc_id, quest_id, source_event_id, campaign_id on public.npc_favors
  for each row execute procedure private.enforce_same_campaign_refs('npc_id', 'npcs', 'owned', 'quest_id', 'quests', 'owned', 'source_event_id', 'quest_consequence_events', 'unowned');

drop trigger if exists zz_same_campaign_refs on public.npc_inventory;
create trigger zz_same_campaign_refs
  before insert or update of item_id, npc_id, campaign_id on public.npc_inventory
  for each row execute procedure private.enforce_same_campaign_refs('item_id', 'items', 'owned', 'npc_id', 'npcs', 'owned');

drop trigger if exists zz_same_campaign_refs on public.npc_pc_notes;
create trigger zz_same_campaign_refs
  before insert or update of npc_id, party_member_id, campaign_id on public.npc_pc_notes
  for each row execute procedure private.enforce_same_campaign_refs('npc_id', 'npcs', 'owned', 'party_member_id', 'party_members', 'owned');

drop trigger if exists zz_same_campaign_refs on public.npc_relationships;
create trigger zz_same_campaign_refs
  before insert or update of npc_id, related_npc_id, campaign_id on public.npc_relationships
  for each row execute procedure private.enforce_same_campaign_refs('npc_id', 'npcs', 'owned', 'related_npc_id', 'npcs', 'owned');

drop trigger if exists zz_same_campaign_refs on public.npcs;
create trigger zz_same_campaign_refs
  before insert or update of linked_monster_id, location_id, scriptorium_doc_id, campaign_id on public.npcs
  for each row execute procedure private.enforce_same_campaign_refs('linked_monster_id', 'monsters', 'owned', 'location_id', 'locations', 'owned', 'scriptorium_doc_id', 'scriptorium_documents', 'owned');

drop trigger if exists zz_same_campaign_refs on public.party_inventory;
create trigger zz_same_campaign_refs
  before insert or update of carried_by, container_id, item_id, campaign_id on public.party_inventory
  for each row execute procedure private.enforce_same_campaign_refs('carried_by', 'party_members', 'owned', 'container_id', 'party_inventory', 'owned', 'item_id', 'items', 'owned');

drop trigger if exists zz_same_campaign_refs on public.party_member_tracker_state;
create trigger zz_same_campaign_refs
  before insert or update of party_member_id, rule_id, campaign_id on public.party_member_tracker_state
  for each row execute procedure private.enforce_same_campaign_refs('party_member_id', 'party_members', 'owned', 'rule_id', 'rules', 'owned');

drop trigger if exists zz_same_campaign_refs on public.party_members;
create trigger zz_same_campaign_refs
  before insert or update of current_location_id, deity_id, campaign_id on public.party_members
  for each row execute procedure private.enforce_same_campaign_refs('current_location_id', 'locations', 'owned', 'deity_id', 'deities', 'owned');

drop trigger if exists zz_same_campaign_refs on public.party_milestones;
create trigger zz_same_campaign_refs
  before insert or update of quest_id, source_event_id, campaign_id on public.party_milestones
  for each row execute procedure private.enforce_same_campaign_refs('quest_id', 'quests', 'owned', 'source_event_id', 'quest_consequence_events', 'unowned');

drop trigger if exists zz_same_campaign_refs on public.pinned_forms;
create trigger zz_same_campaign_refs
  before insert or update of monster_id, party_member_id, campaign_id on public.pinned_forms
  for each row execute procedure private.enforce_same_campaign_refs('monster_id', 'monsters', 'owned', 'party_member_id', 'party_members', 'owned');

drop trigger if exists zz_same_campaign_refs on public.player_npc_ratings;
create trigger zz_same_campaign_refs
  before insert or update of npc_id, campaign_id on public.player_npc_ratings
  for each row execute procedure private.enforce_same_campaign_refs('npc_id', 'npcs', 'owned');

drop trigger if exists zz_same_campaign_refs on public.puzzle_rooms;
create trigger zz_same_campaign_refs
  before insert or update of dungeon_feature_id, location_id, campaign_id on public.puzzle_rooms
  for each row execute procedure private.enforce_same_campaign_refs('dungeon_feature_id', 'dungeon_features', 'owned', 'location_id', 'locations', 'owned');

drop trigger if exists zz_same_campaign_refs on public.quest_beat_transitions;
create trigger zz_same_campaign_refs
  before insert or update of thread_id, campaign_id on public.quest_beat_transitions
  for each row execute procedure private.enforce_same_campaign_refs('thread_id', 'quest_threads', 'unowned');

drop trigger if exists zz_same_campaign_refs on public.quest_beats;
create trigger zz_same_campaign_refs
  before insert or update of staged_at_location_id, campaign_id on public.quest_beats
  for each row execute procedure private.enforce_same_campaign_refs('staged_at_location_id', 'locations', 'owned');

drop trigger if exists zz_same_campaign_refs on public.quest_consequence_events;
create trigger zz_same_campaign_refs
  before insert or update of calendar_event_id, favor_id, journal_entry_id, message_id, milestone_id, quest_id, transition_id, campaign_id on public.quest_consequence_events
  for each row execute procedure private.enforce_same_campaign_refs('calendar_event_id', 'calendar_events', 'owned', 'favor_id', 'npc_favors', 'unowned', 'journal_entry_id', 'player_journal_entries', 'owned', 'message_id', 'campaign_messages', 'owned', 'milestone_id', 'party_milestones', 'unowned', 'quest_id', 'quests', 'owned', 'transition_id', 'quest_beat_transitions', 'unowned');

drop trigger if exists zz_same_campaign_refs on public.quest_threads;
create trigger zz_same_campaign_refs
  before insert or update of merged_into_thread_id, opened_by_edge_id, parent_thread_id, campaign_id on public.quest_threads
  for each row execute procedure private.enforce_same_campaign_refs('merged_into_thread_id', 'quest_threads', 'unowned', 'opened_by_edge_id', 'quest_beat_edges', 'unowned', 'parent_thread_id', 'quest_threads', 'unowned');

drop trigger if exists zz_same_campaign_refs on public.quests;
create trigger zz_same_campaign_refs
  before insert or update of giver_npc_id, location_id, parent_quest_id, campaign_id on public.quests
  for each row execute procedure private.enforce_same_campaign_refs('giver_npc_id', 'npcs', 'owned', 'location_id', 'locations', 'owned', 'parent_quest_id', 'quests', 'owned');

drop trigger if exists zz_same_campaign_refs on public.session_availability;
create trigger zz_same_campaign_refs
  before insert or update of session_proposal_id, campaign_id on public.session_availability
  for each row execute procedure private.enforce_same_campaign_refs('session_proposal_id', 'session_proposals', 'owned');

drop trigger if exists zz_same_campaign_refs on public.session_proposal_invites;
create trigger zz_same_campaign_refs
  before insert or update of session_proposal_id, campaign_id on public.session_proposal_invites
  for each row execute procedure private.enforce_same_campaign_refs('session_proposal_id', 'session_proposals', 'owned');

drop trigger if exists zz_same_campaign_refs on public.soundboard_broadcast;
create trigger zz_same_campaign_refs
  before insert or update of sound_id, campaign_id on public.soundboard_broadcast
  for each row execute procedure private.enforce_same_campaign_refs('sound_id', 'sounds', 'owned');

drop trigger if exists zz_same_campaign_refs on public.soundboard_playlists;
create trigger zz_same_campaign_refs
  before insert or update of page_id, campaign_id on public.soundboard_playlists
  for each row execute procedure private.enforce_same_campaign_refs('page_id', 'soundboard_pages', 'owned');

drop trigger if exists zz_same_campaign_refs on public.sounds;
create trigger zz_same_campaign_refs
  before insert or update of page_id, campaign_id on public.sounds
  for each row execute procedure private.enforce_same_campaign_refs('page_id', 'soundboard_pages', 'owned');

-- party_inventory's insert policy checked campaign membership and nothing
-- else, so a member could write a row in another account's name. Every client
-- insert stamps the caller (usePartyInventory.ts); rows written for someone
-- else come from definer RPCs, which RLS does not see. Pinned here because the
-- audit of the check above found it, and a row's owner should never be the
-- writer's to choose.
drop policy if exists party_inventory_member_insert on public.party_inventory;
create policy party_inventory_member_insert on public.party_inventory
  for insert with check (private.is_campaign_member(campaign_id) and user_id = (select auth.uid()));
