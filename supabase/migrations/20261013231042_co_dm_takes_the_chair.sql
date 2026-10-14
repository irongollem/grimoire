-- Co-DM: a second DM takes the chair, on their own account (#590).
--
-- "I can't make it tonight, can someone take my chair?" A campaign has always
-- been able to seat several `role = 'dm'` rows, and everything gated on
-- private.is_campaign_dm() (the session runtime, quest threads and beats,
-- encounter state, chat, invites) already let a second DM in. What kept one
-- out was content: about thirty tables read and edit by the author alone
-- (`auth.uid() = user_id`), so a second DM opened an empty campaign. Sharing
-- the owner's login was the only workaround, which is what this replaces.
--
-- The model, decided with the maintainer on 14 Oct 2026:
--
--   * A co-DM is a `campaign_members` row with role 'dm' that is not the
--     owner's. No new role value: every 'dm' check already means "may run
--     this table". The owner is campaigns.user_id, and private.is_campaign_owner
--     is the new predicate for what stays theirs.
--   * Any DM of a campaign reads and edits every row in it, whoever wrote it.
--     Deleting an authored row (an NPC, a quest, a place, a faction, a deity,
--     a session record: anything with its own page) stays with its author,
--     plus the owner, who may delete anything in their campaign. A stand-in
--     cannot lose the owner's prep with one click, and the owner is never left
--     with rows they cannot remove. The parts of an entity (a quest's beats,
--     edges and objectives, a recipe's ingredients, a playlist's tracks) follow
--     whoever may edit it: re-routing a quest is an edit.
--   * The DMs at one table READ each other's personal libraries (campaign_id
--     null), never write them: encounters and loot pull from the owner's, a
--     goblin added mid-session is the owner's goblin, and what a co-DM brings
--     from their own library still hydrates for the owner afterwards. Players
--     already read the owner's species, classes and spells this way. Personal
--     notes and calendar events are not a library and stay the author's. The
--     client scopes its own lists to "this campaign plus my library" in the
--     query (RLS is a ceiling, not a filter), so this arm serves reads by id
--     and the monster and item pickers, which mark such rows read-only.
--   * A row's author never changes by editing it, and only its author or the
--     owner takes it out of the campaign (private.guard_content_author).
--   * Owner-only: who is a DM (role changes, DM invites, taking a co-DM's
--     seat), deleting and transferring the campaign (unchanged RPC checks),
--     and the campaign row's keys and switches (AI keys and providers, the AI
--     opt-in, the calendar feed token, archiving). A co-DM may edit the rest of
--     the row: the date, the party's location, rules, details.
--   * Nothing a co-DM wrote is lost when they leave. Handing the chair back,
--     being removed, or deleting the account passes their rows in the campaign
--     to the owner, through the same mover a transfer uses.
--
-- Authorization stays total (CLAUDE.md item 3): every new predicate is an
-- `exists`, never NULL, and the negated uses (the guards) read the owner
-- directly from campaigns rather than through a comparison that could be.
--
-- The policy rewrites below were generated from the replayed schema's own
-- pg_policies text and are committed literally: each keeps its existing
-- condition verbatim and ORs the co-DM arm onto it, so the diff per policy is
-- exactly the new arm. Regression cover: supabase/tests/co_dm_boundary.test.sql.

-- ── Predicates ──────────────────────────────────────────────────────────────

create function private.is_campaign_owner(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaigns c
     where c.id = cid and c.user_id = (select auth.uid())
  );
$$;

comment on function private.is_campaign_owner(uuid) is
  'True when the caller owns the campaign (#590). Total: false, never NULL, for a non-owner or a missing campaign. What stays the owner''s once a campaign seats co-DMs.';

-- Who has ever sat in this campaign's DM chair. A seat rotates (DM one
-- session, player the next), and what a co-DM brought from their own library
-- (a goblin in an encounter, a minted loot item) must keep hydrating for the
-- owner after they hand the chair back. Set when a row becomes 'dm', never
-- cleared; the row's deletion (leaving the campaign) ends it.
alter table public.campaign_members
  add column held_chair boolean not null default false;

comment on column public.campaign_members.held_chair is
  'True once this member has sat in the DM chair (#590). Never cleared. Keeps their personal library readable to the table''s DMs (private.dm_library_authors) after they hand the chair back.';

update public.campaign_members set held_chair = true where role = 'dm';

create function private.mark_held_chair()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Derived, never taken from the client: a DM may update a player's row, and
  -- setting this by hand would open that player's library to them.
  new.held_chair := new.role = 'dm' or (tg_op = 'UPDATE' and old.held_chair);
  return new;
end;
$$;

revoke execute on function private.mark_held_chair() from public, anon, authenticated;

create trigger campaign_members_mark_held_chair
  before insert or update on public.campaign_members
  for each row execute procedure private.mark_held_chair();

create function private.dm_library_authors()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  -- The other DMs at any table where the caller is a DM, and those who held
  -- its chair before: whose personal library (campaign_id null) the caller
  -- may read (#590). Read only; no
  -- write policy uses it. An array rather than a per-row predicate, so a
  -- policy can write `user_id = any ((select private.dm_library_authors())::uuid[])`
  -- and Postgres evaluates it once per statement instead of once per row, on
  -- tables (monsters, items) where a DM's own library runs to thousands.
  -- Never NULL: an account at no table gets the empty array, which matches
  -- nothing.
  select coalesce(array_agg(distinct other.user_id), '{}'::uuid[])
    from public.campaign_members me
    join public.campaign_members other
      on other.campaign_id = me.campaign_id
     and (other.role = 'dm' or other.held_chair)
   where me.user_id = (select auth.uid())
     and me.role = 'dm'
     and other.user_id <> (select auth.uid());
$$;

comment on function private.dm_library_authors() is
  'The other DMs at the caller''s tables, whose personal library rows the caller may read, never write (#590). Never NULL.';

create function private.can_use_in_campaign(p_author uuid, p_row_campaign uuid, p_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- May a row (a trap, a loot table, an item) be cited from p_campaign? The
  -- caller's own, one already in that campaign, or the campaign owner's
  -- library. What "you authored" meant before a campaign could seat co-DMs.
  select coalesce(p_author = (select auth.uid()), false)
      or coalesce(p_row_campaign = p_campaign, false)
      or (p_row_campaign is null and p_campaign is not null and exists (
            select 1 from public.campaigns c where c.id = p_campaign and c.user_id = p_author));
$$;

comment on function private.can_use_in_campaign(uuid, uuid, uuid) is
  'Whether a library or campaign row may be referenced from p_campaign: the caller''s own, already in that campaign, or the campaign owner''s library (#590).';

-- ── The campaign row: a co-DM runs it, the owner keeps the keys ────────────

drop policy "campaigns_update" on public.campaigns;
create policy "campaigns_update" on public.campaigns for update to public
  using (((select auth.uid()) = user_id) or private.is_campaign_dm(id))
  with check (((select auth.uid()) = user_id) or private.is_campaign_dm(id));

create function private.guard_campaign_owner_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or old.user_id = (select auth.uid()) then
    return new;
  end if;
  -- spotify_client_id is not here: it is a public OAuth client id and travels
  -- with the campaign (#180). The AI keys are the owner's own credentials.
  if new.user_id           is distinct from old.user_id
     or new.openai_api_key    is distinct from old.openai_api_key
     or new.anthropic_api_key is distinct from old.anthropic_api_key
     or new.gemini_api_key    is distinct from old.gemini_api_key
     or new.text_provider     is distinct from old.text_provider
     or new.image_provider    is distinct from old.image_provider
     or new.ai_enabled        is distinct from old.ai_enabled
     or new.ical_token        is distinct from old.ical_token
     or new.is_archived       is distinct from old.is_archived then
    raise exception 'Only the campaign''s owner can change that'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_campaign_owner_columns() from public, anon, authenticated;

create trigger campaigns_guard_owner_columns
  before update on public.campaigns
  for each row execute procedure private.guard_campaign_owner_columns();

-- ── The DM chair: only the owner seats or unseats a DM ──────────────────────

create function private.guard_dm_seat_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_owner  uuid;
begin
  -- Leaving is always yours to do; a player row is any DM's to manage.
  if old.role <> 'dm' or v_caller is null or v_caller = old.user_id then
    return old;
  end if;
  select c.user_id into v_owner from public.campaigns c where c.id = old.campaign_id;
  -- No campaign row: it is being deleted and the seat goes with it.
  if v_owner is null or v_caller = v_owner then
    return old;
  end if;
  raise exception 'Only the campaign''s owner can take a DM''s seat away'
    using errcode = '42501';
end;
$$;

revoke execute on function private.guard_dm_seat_delete() from public, anon, authenticated;

create trigger campaign_members_guard_dm_seat_delete
  before delete on public.campaign_members
  for each row execute procedure private.guard_dm_seat_delete();

-- An invite carries its role into the membership (consume_campaign_invite), so
-- a DM invite is a seat in the chair and only the owner may mint one.
-- Reading included: a DM invite's token is a seat, so a co-DM who could read
-- one could redeem it with a second account.
drop policy "campaign_invites_dm_all" on public.campaign_invites;
create policy "campaign_invites_dm_all" on public.campaign_invites for all to public
  using (private.is_campaign_dm(campaign_id)
         and (role = 'player' or private.is_campaign_owner(campaign_id)))
  with check (private.is_campaign_dm(campaign_id)
              and (role = 'player' or private.is_campaign_owner(campaign_id)));

-- ── DM notes are the table's DMs' to read ───────────────────────────────────
-- A DM note on a quest or a faction (#983) is what the stand-in needs at the
-- table. Other DMs of the campaign read it; only its author edits it.
--
-- Which notes are DM notes is recorded when the note is written, not read off
-- the author's role now. A seat can rotate (one session in the chair, the
-- next at the table), and keyed on the current role the rule went wrong both
-- ways: while a player sat in the chair their private player notes became
-- readable by the owner, and when they stood down the DM notes they wrote
-- vanished from the owner's view.
--
-- A campaign note's flag is the server's to set: private, and written by a DM
-- of that campaign at the time. A note without a campaign (a Hall of Heroes
-- note) keeps what the client said, since no table role exists to derive it
-- from, and the read arm below needs a campaign anyway. The flag never changes
-- once written.
alter table public.entity_notes
  add column written_as_dm boolean not null default false;

comment on column public.entity_notes.written_as_dm is
  'True for a DM note: written privately by a DM of its campaign, at the time it was written (#590). Set by private.stamp_entity_note_role, never updated. The table''s DMs read campaign DM notes; a player''s notes never are.';

-- Exact for every row today. Until now a campaign seated one DM, its owner,
-- so a campaign note is a DM note exactly when its author DMs that campaign.
-- A note without a campaign is a DM note when it is a Hall of Heroes note, or
-- sits on a library entity (an entity with no campaign) of a DM-note kind and
-- was written by that entity's own author: the DM-notes box files a note
-- under its entity's campaign, while players file theirs under none, on
-- campaign entities or on shared library rows their own author never wrote.
update public.entity_notes n
   set written_as_dm = n.is_private and (
         (n.campaign_id is not null and private.is_table_dm(n.campaign_id, n.user_id))
         or (n.campaign_id is null and (
               n.entity_type = 'hero'
            or (n.entity_type = 'species'      and exists (select 1 from public.species x       where x.id::text = n.entity_id and x.campaign_id is null and x.user_id = n.user_id))
            or (n.entity_type = 'spell'        and exists (select 1 from public.spells x        where x.id::text = n.entity_id and x.campaign_id is null and x.user_id = n.user_id))
            or (n.entity_type = 'faction'      and exists (select 1 from public.factions x      where x.id::text = n.entity_id and x.campaign_id is null and x.user_id = n.user_id))
            or (n.entity_type = 'companion'    and exists (select 1 from public.companions x    where x.id::text = n.entity_id and x.campaign_id is null and x.user_id = n.user_id))
            or (n.entity_type = 'quest'        and exists (select 1 from public.quests x        where x.id::text = n.entity_id and x.campaign_id is null and x.user_id = n.user_id))
            or (n.entity_type = 'encounter'    and exists (select 1 from public.encounters x    where x.id::text = n.entity_id and x.campaign_id is null and x.user_id = n.user_id))
            or (n.entity_type = 'party_member' and exists (select 1 from public.party_members x where x.id::text = n.entity_id and x.campaign_id is null and x.user_id = n.user_id)))));

create function private.stamp_entity_note_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.written_as_dm := old.written_as_dm;
  elsif new.campaign_id is not null then
    new.written_as_dm := new.is_private and private.is_table_dm(new.campaign_id, new.user_id);
  end if;
  return new;
end;
$$;

revoke execute on function private.stamp_entity_note_role() from public, anon, authenticated;

create trigger entity_notes_stamp_role
  before insert or update on public.entity_notes
  for each row execute procedure private.stamp_entity_note_role();

drop policy "entity_notes_select" on public.entity_notes;
create policy "entity_notes_select" on public.entity_notes for select to public
  using (((select auth.uid()) = user_id)
    OR ((is_private = false) AND (EXISTS ( SELECT 1
       FROM (campaign_members cm_author
         JOIN campaign_members cm_viewer ON ((cm_author.campaign_id = cm_viewer.campaign_id)))
      WHERE ((cm_author.user_id = entity_notes.user_id) AND (cm_viewer.user_id = (select auth.uid()))))))
    OR ((shared_with_dm = true) AND (EXISTS ( SELECT 1
       FROM (campaign_members cm_author
         JOIN campaign_members cm_dm ON ((cm_author.campaign_id = cm_dm.campaign_id)))
      WHERE ((cm_author.user_id = entity_notes.user_id) AND (cm_dm.user_id = (select auth.uid())) AND (cm_dm.role = 'dm'::text)))))
    or (written_as_dm and campaign_id is not null and private.is_campaign_dm(campaign_id)));

-- ── An edit is not a theft ──────────────────────────────────────────────────
-- The update policies below let a DM edit a row someone else wrote, and a
-- policy cannot see OLD, so the row's author and campaign are pinned here.
-- Nobody re-stamps a row's author by editing it (the author no more than
-- anyone: with the DM arm in the WITH CHECK, an author could otherwise hand a
-- row, and its quota, to any account); authors change only through
-- private.move_campaign_content, which says so. Only the author moves a row
-- to another campaign. Clearing campaign_id is the author's or the owner's:
-- delete_campaign_with_homebrew returns a co-DM's homebrew to their library
-- that way, and the set-null cascades of a campaign being deleted run when
-- the campaign row is already gone. Each trigger's WHEN clause skips the call
-- unless the author or the campaign actually changes, so an ordinary edit
-- (a note autosaving every few seconds) never pays for it.
create function private.guard_content_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller   uuid := (select auth.uid());
  v_old_camp uuid := (to_jsonb(old) ->> 'campaign_id')::uuid;
  v_new_camp uuid := (to_jsonb(new) ->> 'campaign_id')::uuid;
begin
  if current_setting('grimoire.content_move', true) = 'on' or v_caller is null then
    return new;
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'A row''s author does not change by editing it'
      using errcode = '42501';
  end if;
  if v_new_camp is distinct from v_old_camp
     and old.user_id is distinct from v_caller
     and not (v_new_camp is null
              and (private.is_campaign_owner(v_old_camp)
                   or not exists (select 1 from public.campaigns c where c.id = v_old_camp))) then
    raise exception 'Only a row''s author can move it out of its campaign'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_content_author() from public, anon, authenticated;

create trigger factions_guard_content_author
  before update on public.factions
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger deities_guard_content_author
  before update on public.deities
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger pantheons_guard_content_author
  before update on public.pantheons
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger faction_deities_guard_content_author
  before update on public.faction_deities
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger npc_pc_notes_guard_content_author
  before update on public.npc_pc_notes
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger encounter_state_guard_content_author
  before update on public.encounter_state
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger session_proposals_guard_content_author
  before update on public.session_proposals
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger soundboard_broadcast_guard_content_author
  before update on public.soundboard_broadcast
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger companions_guard_content_author
  before update on public.companions
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger campaign_sessions_guard_content_author
  before update on public.campaign_sessions
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger crafting_recipes_guard_content_author
  before update on public.crafting_recipes
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger encounters_guard_content_author
  before update on public.encounters
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger items_guard_content_author
  before update on public.items
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger locations_guard_content_author
  before update on public.locations
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger loot_tables_guard_content_author
  before update on public.loot_tables
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger monsters_guard_content_author
  before update on public.monsters
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger npc_inventory_guard_content_author
  before update on public.npc_inventory
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger npc_relationships_guard_content_author
  before update on public.npc_relationships
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger npc_sets_guard_content_author
  before update on public.npc_sets
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger npcs_guard_content_author
  before update on public.npcs
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger puzzle_rooms_guard_content_author
  before update on public.puzzle_rooms
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger quests_guard_content_author
  before update on public.quests
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger roll_tables_guard_content_author
  before update on public.roll_tables
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger scriptorium_documents_guard_content_author
  before update on public.scriptorium_documents
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger soundboard_pages_guard_content_author
  before update on public.soundboard_pages
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger soundboard_playlists_guard_content_author
  before update on public.soundboard_playlists
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger sounds_guard_content_author
  before update on public.sounds
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger traps_guard_content_author
  before update on public.traps
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger dungeon_maps_guard_content_author
  before update on public.dungeon_maps
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger dungeon_features_guard_content_author
  before update on public.dungeon_features
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger notes_guard_content_author
  before update on public.notes
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger calendar_events_guard_content_author
  before update on public.calendar_events
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger rules_guard_content_author
  before update on public.rules
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger species_guard_content_author
  before update on public.species
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger custom_classes_guard_content_author
  before update on public.custom_classes
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger custom_subclasses_guard_content_author
  before update on public.custom_subclasses
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger class_features_guard_content_author
  before update on public.class_features
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger spells_guard_content_author
  before update on public.spells
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger faction_items_guard_content_author
  before update on public.faction_items
  for each row when (new.user_id is distinct from old.user_id)
  execute procedure private.guard_content_author();
create trigger faction_locations_guard_content_author
  before update on public.faction_locations
  for each row when (new.user_id is distinct from old.user_id)
  execute procedure private.guard_content_author();
create trigger faction_npcs_guard_content_author
  before update on public.faction_npcs
  for each row when (new.user_id is distinct from old.user_id)
  execute procedure private.guard_content_author();
create trigger faction_relations_guard_content_author
  before update on public.faction_relations
  for each row when (new.user_id is distinct from old.user_id)
  execute procedure private.guard_content_author();
create trigger faction_party_members_guard_content_author
  before update on public.faction_party_members
  for each row when (new.user_id is distinct from old.user_id)
  execute procedure private.guard_content_author();
create trigger location_doors_guard_content_author
  before update on public.location_doors
  for each row when (new.user_id is distinct from old.user_id)
  execute procedure private.guard_content_author();
create trigger location_map_regions_guard_content_author
  before update on public.location_map_regions
  for each row when (new.user_id is distinct from old.user_id)
  execute procedure private.guard_content_author();
create trigger location_placements_guard_content_author
  before update on public.location_placements
  for each row when (new.user_id is distinct from old.user_id)
  execute procedure private.guard_content_author();
create trigger store_items_guard_content_author
  before update on public.store_items
  for each row when (new.user_id is distinct from old.user_id)
  execute procedure private.guard_content_author();

-- ── Moving a campaign's authored rows from one account to another ──────────
-- One list for both callers: transfer_campaign_ownership (the outgoing owner's
-- rows to the new owner) and a co-DM leaving the chair (their rows to the
-- owner). Before this, transfer held the list inline and it had drifted: site
-- plans, the site state log, session records and DM item entries were never
-- moved, so after a transfer the outgoing owner, now a player, could still
-- read the floor plans, and deleting their account deleted them.
--
-- Rows written as a player move only when p_player_rows says so (below).
-- Deliberately not moved, because they are the departing account's own, not
-- the campaign's: private notes (entity_notes, dm_note_touches), chat
-- messages, document imports, minis, and attached tile packs (a per-account
-- Pro entitlement). They go with the account, as a player's do.
--
-- p_scoped_homebrew also moves the campaign-scoped monsters, traps and dungeon
-- maps/features. A transfer leaves those to the disposition the owner chose
-- (copy, promote, reassign, delete) and passes false; a departing co-DM has no
-- such choice to make, so their homebrew simply stays with the campaign.
create function private.move_campaign_content(
  p_campaign_id uuid, p_from uuid, p_to uuid, p_scoped_homebrew boolean, p_player_rows boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev_move  text := current_setting('grimoire.content_move', true);
  v_prev_quota text := current_setting('grimoire.bypass_quota', true);
begin
  -- The author guard (private.guard_content_author) lets this through, and
  -- re-stamped rows are not new rows to count against anyone's quota.
  perform set_config('grimoire.content_move', 'on', true);
  perform set_config('grimoire.bypass_quota', 'on', true);

  update public.calendar_events       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.class_features        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.crafting_recipes      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_classes        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_subclasses     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.deities               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounter_state       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounters            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.faction_deities       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.factions              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.items                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.locations             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.loot_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notes                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_inventory         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_pc_notes          set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_relationships     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_sets              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npcs                  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.pantheons             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.puzzle_rooms          set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.quests                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.roll_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.rules                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.scriptorium_documents set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.session_proposals     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_broadcast  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_pages      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_playlists  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.sounds                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.species               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.spells                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_sessions     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;

  -- What a member writes as a player (their own character, its inventory and
  -- companions, journal entries on items, class option texts). A seat that
  -- rotates has written these before it took the chair, so handing the chair
  -- back leaves them where they are; a transfer and a deleted account move
  -- them, the first because the outgoing owner wrote them as DM, the second
  -- because otherwise they cascade away.
  if p_player_rows then
    update public.class_option_texts set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.companions         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_inventory    set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_members      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.item_entries       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  -- Rows that carry an author but no campaign_id, scoped by their parent.
  update public.faction_items f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_locations f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_npcs f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_party_members f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_relations f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.store_items si set user_id = p_to
   where si.user_id = p_from
     and exists (select 1 from public.locations l where l.id = si.location_id and l.campaign_id = p_campaign_id);
  update public.location_doors d set user_id = p_to
   where d.user_id = p_from
     and exists (select 1 from public.locations l where l.id = d.from_location_id and l.campaign_id = p_campaign_id);
  update public.location_map_regions r set user_id = p_to
   where r.user_id = p_from
     and exists (select 1 from public.locations l where l.id = r.site_location_id and l.campaign_id = p_campaign_id);
  update public.location_placements lp set user_id = p_to
   where lp.user_id = p_from
     and exists (select 1 from public.locations l where l.id = lp.location_id and l.campaign_id = p_campaign_id);
  update public.location_state_events e set user_id = p_to
   where e.user_id = p_from
     and exists (select 1 from public.locations l where l.id = e.location_id and l.campaign_id = p_campaign_id);

  if p_scoped_homebrew then
    update public.monsters         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.traps            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_maps     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_features set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  perform set_config('grimoire.content_move', coalesce(v_prev_move, ''), true);
  perform set_config('grimoire.bypass_quota', coalesce(v_prev_quota, ''), true);
end;
$$;

revoke execute on function private.move_campaign_content(uuid, uuid, uuid, boolean, boolean) from public, anon, authenticated;

-- ── A co-DM leaves the chair: what they wrote stays with the campaign ───────
create function private.hand_back_dm_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if old.role <> 'dm' or (tg_op = 'UPDATE' and new.role = 'dm') then
    return null;
  end if;
  select c.user_id into v_owner from public.campaigns c where c.id = old.campaign_id;
  -- The owner's own seat (a transfer demotes them before it flips the
  -- campaign row) and a campaign being deleted both have nothing to hand back.
  if v_owner is null or v_owner = old.user_id then
    return null;
  end if;
  perform private.move_campaign_content(old.campaign_id, old.user_id, v_owner, true, false);
  return null;
end;
$$;

revoke execute on function private.hand_back_dm_content() from public, anon, authenticated;

create trigger campaign_members_hand_back_dm_content
  after update of role or delete on public.campaign_members
  for each row execute procedure private.hand_back_dm_content();

-- Deleting the account cascades every row it authored, in an order Postgres
-- does not promise relative to the membership row. So the hand-back runs here,
-- before anything cascades, like preserve_claimed_characters_on_creator_delete.
create function private.hand_back_dm_content_on_account_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select m.campaign_id, c.user_id as owner_id
      from public.campaign_members m
      join public.campaigns c on c.id = m.campaign_id
     where m.user_id = old.id and (m.role = 'dm' or m.held_chair) and c.user_id <> old.id
  loop
    perform private.move_campaign_content(r.campaign_id, old.id, r.owner_id, true, true);
    -- Library rows of theirs this campaign uses would go with the account;
    -- the owner keeps them instead, so encounters and traps still hydrate.
    perform set_config('grimoire.content_move', 'on', true);
    update public.monsters m set user_id = r.owner_id
     where m.user_id = old.id and m.campaign_id is null
       and exists (select 1 from private.campaign_referenced_monster_ids(r.campaign_id) rid where rid = m.id);
    update public.traps t set user_id = r.owner_id
     where t.user_id = old.id and t.campaign_id is null
       and exists (select 1 from private.campaign_referenced_trap_ids(r.campaign_id) rid where rid = t.id);
    perform set_config('grimoire.content_move', '', true);
  end loop;
  return old;
end;
$$;

revoke execute on function private.hand_back_dm_content_on_account_delete() from public, anon, authenticated;

create trigger hand_back_dm_content_on_account_delete
  before delete on auth.users
  for each row execute procedure private.hand_back_dm_content_on_account_delete();


-- ── Functions that assumed the author is the DM ─────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_campaign_member_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller uuid := (select auth.uid());
  v_owner  uuid;
begin
  -- A membership row belongs to one person at one table, for everyone, the DM
  -- included: moving it is how a seat would be granted without an invite or a
  -- parent's yes (#927).
  if new.user_id is distinct from old.user_id
     or new.campaign_id is distinct from old.campaign_id then
    raise exception 'A membership cannot be moved to another person or campaign';
  end if;

  if new.party_member_id is distinct from old.party_member_id
     and new.party_member_id is not null
     and exists (
       select 1 from public.character_content_reviews r
        where r.party_member_id = new.party_member_id and r.status = 'pending'
     ) then
    raise exception 'This character is waiting for the DM''s approval'
      using errcode = 'CR001';
  end if;

  -- Who sits in the DM chair is the owner's call (#590). A campaign seats its
  -- owner and any co-DM they appoint, all as role 'dm', so "is a DM here" can
  -- no longer license a role change: a co-DM would promote whoever they liked
  -- and demote the owner. The owner may set any row's role (their own too:
  -- transfer_campaign_ownership demotes them, as them, before it hands the
  -- campaign over). Anyone else may only hand their own chair back.
  if new.role is distinct from old.role then
    select c.user_id into v_owner from public.campaigns c where c.id = old.campaign_id;
    if v_caller is distinct from v_owner
       and not coalesce(old.user_id = v_caller and old.role = 'dm' and new.role = 'player', false) then
      if private.is_campaign_dm(old.campaign_id) then
        raise exception 'Only the campaign''s owner can change who is a DM'
          using errcode = '42501';
      end if;
      raise exception 'Not allowed to change role or campaign assignment';
    end if;
  end if;

  -- DMs of this campaign may change the rest (name, character).
  if private.is_campaign_dm(old.campaign_id) then
    if new.party_member_id is distinct from old.party_member_id
       and new.party_member_id is not null
       and not exists (
         select 1 from public.party_members pm
         where pm.id = new.party_member_id
           and pm.campaign_id = new.campaign_id
       ) then
      raise exception 'Cannot link a character from another campaign';
    end if;
    return new;
  end if;

  -- Admission (private.admit_campaign_member) links the character the joiner
  -- chose, and has checked it is theirs. It runs as whoever gave the last yes,
  -- usually a parent, who owns no character here, so the per-caller check
  -- below would refuse every approval that brings one.
  if current_setting('grimoire.pm_campaign_transition', true) = 'on' then
    return new;
  end if;

  -- party_member_id may change (claim / self-create / assume), but only to a
  -- character the player is allowed to take: same campaign, not owned by someone
  -- else, and not already claimed by another member. Clearing it is always allowed.
  if new.party_member_id is distinct from old.party_member_id
     and new.party_member_id is not null then

    if not exists (
      select 1 from public.party_members pm
      where pm.id = new.party_member_id
        and pm.campaign_id = new.campaign_id
        and (pm.owner_user_id is null or pm.owner_user_id = (select auth.uid()))
    ) then
      raise exception 'Cannot link a character from another campaign or owned by another player';
    end if;

    if exists (
      select 1 from public.campaign_members cm
      where cm.party_member_id = new.party_member_id
        and cm.id is distinct from new.id
    ) then
      raise exception 'That character is already claimed by another player';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.is_dm_of_my_campaigns(owner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Whose personal homebrew (species, classes, backgrounds, player-visible
  -- rules) a member reads: the owner of a campaign they sit at. Keyed on the
  -- campaign's owner, not on a 'dm' row, since a campaign can seat co-DMs
  -- (#590) and a co-DM's personal library is not the table's.
  select exists (
    select 1
    from public.campaign_members my
    join public.campaigns c on c.id = my.campaign_id
    where my.user_id = (select auth.uid())
      and c.user_id = owner_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.share_handout(p_document_id uuid, p_party_member_ids uuid[], p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_doc record;
  v_members uuid[];
  v_reveals jsonb;
begin
  select d.id, d.user_id, d.campaign_id, d.content, d.player_visible_to
    into v_doc
    from public.scriptorium_documents d
   where d.id = p_document_id;

  -- Any DM of the document's campaign, its author or not (#590): a co-DM
  -- running the session hands over the owner's handouts.
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_doc.campaign_id is null then
    raise exception 'Only a campaign''s document can be shared with its players' using errcode = '22023';
  end if;
  if not coalesce(private.is_campaign_dm(v_doc.campaign_id), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct pm.id), '{}') into v_members
    from public.party_members pm
   where pm.campaign_id = v_doc.campaign_id
     and pm.id = any (coalesce(p_party_member_ids, '{}'));

  if cardinality(v_members) <> (select count(distinct x) from unnest(coalesce(p_party_member_ids, '{}')) x) then
    raise exception 'Every recipient must be a party member of this campaign' using errcode = '22023';
  end if;

  v_reveals := private.apply_handout_reveals(v_doc.campaign_id, v_doc.content, v_members, p_dry_run);

  -- Only when the set actually changes: the write bumps updated_at, which
  -- relights every holder's "new" dot, and re-sharing to the same table (the
  -- pending-reveal banner's Reveal) changes nothing they can read.
  if not p_dry_run
     and not (v_doc.player_visible_to @> v_members and v_doc.player_visible_to <@ v_members) then
    update public.scriptorium_documents
       set player_visible_to = v_members
     where id = v_doc.id;
  end if;

  return v_reveals || jsonb_build_object(
    'added', to_jsonb(array(select x from unnest(v_members) x except select y from unnest(v_doc.player_visible_to) y)),
    'removed', to_jsonb(array(select y from unnest(v_doc.player_visible_to) y except select x from unnest(v_members) x)));
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_monster_references(p_campaign_id uuid, p_names text[])
 RETURNS TABLE(query_name text, monster_id uuid, library_monster_id text, source text, matched_name text, match_kind text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'private'
AS $function$
  with asked as (
    select distinct
      n as query_name,
      private.normalize_entity_name(n) as norm
    from unnest(coalesce(p_names, array[]::text[])) as n
    where private.normalize_entity_name(n) is not null
  ),
  -- Scoped here rather than left to RLS, which would also admit the other
  -- DMs' libraries (#590). The campaign's rows, whoever wrote them (a co-DM's
  -- included, #590), and the caller's or the owner's library.
  mine as (
    select m.id, m.name, private.normalize_entity_name(m.name) as norm
    from public.monsters m
    where m.campaign_id = p_campaign_id
       or (m.campaign_id is null
           and (m.user_id = auth.uid()
                or m.user_id = (select c.user_id from public.campaigns c where c.id = p_campaign_id)))
  ),
  shared as (
    select l.id, l.name, private.normalize_entity_name(l.name) as norm
    from public.library_monsters l
  ),
  candidates as (
    select a.query_name, mine.id as id, null::text as library_monster_id, 'campaign'::text as source, mine.name, 'exact'::text as match_kind, 1 as rank
      from asked a join mine on mine.norm = a.norm
    union all
    select a.query_name, null::uuid, shared.id, 'library', shared.name, 'exact', 2
      from asked a join shared on shared.norm = a.norm
    union all
    -- "Icewind kobold" → "kobold". Anchored as a whole-word *suffix*, so a
    -- qualifier in front still matches while "rat" never matches "pirate".
    select a.query_name, mine.id, null::text, 'campaign', mine.name, 'contains', 3
      from asked a join mine on a.norm ~ ('(^| )' || mine.norm || '$') and mine.norm <> a.norm
    union all
    select a.query_name, null::uuid, shared.id, 'library', shared.name, 'contains', 4
      from asked a join shared on a.norm ~ ('(^| )' || shared.norm || '$') and shared.norm <> a.norm
  )
  select distinct on (c.query_name)
    c.query_name, c.id, c.library_monster_id, c.source, c.name, c.match_kind
  from candidates c
  where private.is_campaign_dm(p_campaign_id)
  -- `name, id` after `rank` so a corpus holding the same creature from several
  -- publishers returns the same row every run. A resolver that picks a
  -- different duplicate each time is worse than one that picks a mediocre match
  -- consistently — the DM reviews it once.
  order by c.query_name, c.rank, c.name, c.id;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_item_references(p_campaign_id uuid, p_names text[])
 RETURNS TABLE(query_name text, item_id uuid, library_item_id text, source text, matched_name text, match_kind text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'private'
AS $function$
  with asked as (
    select distinct
      n as query_name,
      private.normalize_entity_name(n) as norm
    from unnest(coalesce(p_names, array[]::text[])) as n
    where private.normalize_entity_name(n) is not null
  ),
  -- Scoped here rather than left to RLS, which would also admit the other
  -- DMs' libraries (#590). The campaign's rows, whoever wrote them (a co-DM's
  -- included, #590), and the caller's or the owner's library.
  mine as (
    select i.id, i.name, private.normalize_entity_name(i.name) as norm
    from public.items i
    where i.campaign_id = p_campaign_id
       or (i.campaign_id is null
           and (i.user_id = auth.uid()
                or i.user_id = (select c.user_id from public.campaigns c where c.id = p_campaign_id)))
  ),
  shared as (
    select l.id, l.name, private.normalize_entity_name(l.name) as norm
    from public.library_items l
  ),
  candidates as (
    select a.query_name, mine.id as id, null::text as library_item_id, 'campaign'::text as source, mine.name, 'exact'::text as match_kind, 1 as rank
      from asked a join mine on mine.norm = a.norm
    union all
    select a.query_name, null::uuid, shared.id, 'library', shared.name, 'exact', 2
      from asked a join shared on shared.norm = a.norm
    union all
    -- "a potion of healing" → "potion of healing" is handled by the normaliser;
    -- this catches the qualifier case, anchored as a whole-word *suffix* so
    -- "rope" never matches "garrote".
    select a.query_name, mine.id, null::text, 'campaign', mine.name, 'contains', 3
      from asked a join mine on a.norm ~ ('(^| )' || mine.norm || '$') and mine.norm <> a.norm
    union all
    select a.query_name, null::uuid, shared.id, 'library', shared.name, 'contains', 4
      from asked a join shared on a.norm ~ ('(^| )' || shared.norm || '$') and shared.norm <> a.norm
  )
  select distinct on (c.query_name)
    c.query_name, c.id, c.library_item_id, c.source, c.name, c.match_kind
  from candidates c
  where private.is_campaign_dm(p_campaign_id)
  order by c.query_name, c.rank, c.name, c.id;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_notes(p_ids uuid[], p_orders integer[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;
  if array_length(p_ids, 1) is distinct from array_length(p_orders, 1) then
    raise exception 'p_ids and p_orders must be the same length';
  end if;

  if exists (
    select 1
    from unnest(p_ids) as want(id)
    where not exists (
      select 1 from public.notes n where n.id = want.id
        and (n.user_id = v_uid or (n.campaign_id is not null and private.is_campaign_dm(n.campaign_id)))
    )
  ) then
    raise exception 'Not authorized to reorder one or more of the given notes';
  end if;

  update public.notes as t
  set sort_order = d.ord
  from unnest(p_ids, p_orders) as d(id, ord)
  where t.id = d.id
    and (t.user_id = v_uid or (t.campaign_id is not null and private.is_campaign_dm(t.campaign_id)));
end;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_sounds(p_ids uuid[], p_orders integer[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;
  if array_length(p_ids, 1) is distinct from array_length(p_orders, 1) then
    raise exception 'p_ids and p_orders must be the same length';
  end if;

  if exists (
    select 1
    from unnest(p_ids) as want(id)
    where not exists (
      select 1 from public.sounds s where s.id = want.id
        and (s.user_id = v_uid or (s.campaign_id is not null and private.is_campaign_dm(s.campaign_id)))
    )
  ) then
    raise exception 'Not authorized to reorder one or more of the given sounds';
  end if;

  update public.sounds as t
  set sort_order = d.ord
  from unnest(p_ids, p_orders) as d(id, ord)
  where t.id = d.id
    and (t.user_id = v_uid or (t.campaign_id is not null and private.is_campaign_dm(t.campaign_id)));
end;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_soundboard_pages(p_ids uuid[], p_orders integer[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;
  if array_length(p_ids, 1) is distinct from array_length(p_orders, 1) then
    raise exception 'p_ids and p_orders must be the same length';
  end if;

  if exists (
    select 1
    from unnest(p_ids) as want(id)
    where not exists (
      select 1 from public.soundboard_pages sp where sp.id = want.id
        and (sp.user_id = v_uid or (sp.campaign_id is not null and private.is_campaign_dm(sp.campaign_id)))
    )
  ) then
    raise exception 'Not authorized to reorder one or more of the given soundboard pages';
  end if;

  update public.soundboard_pages as t
  set sort_order = d.ord
  from unnest(p_ids, p_orders) as d(id, ord)
  where t.id = d.id
    and (t.user_id = v_uid or (t.campaign_id is not null and private.is_campaign_dm(t.campaign_id)));
end;
$function$;

CREATE OR REPLACE FUNCTION private.validate_loot_placement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_coin text;
begin
  -- Only when the answer could have changed. This clause is *caller-dependent*
  -- (`i.user_id = auth.uid()`), so re-running it on an unrelated UPDATE asks a
  -- different question than the INSERT did: a DM may legitimately place a
  -- personal item (campaign_id null, owned by them) as loot, and a **co-DM**
  -- dispatching it later would fail this check on a row nobody edited — the
  -- bookkeeping UPDATE inside `dispatch_loot` runs as them. The entry would be
  -- undispatchable by anyone but its placer, with an error about item
  -- availability that has nothing to do with dropping it.
  --
  -- Gating on an actual change keeps the guarantee that matters — nothing can
  -- be re-homed onto an item the campaign cannot use — without re-litigating a
  -- decision already made.
  --
  -- A library item (#954) needs no availability check: shared content is
  -- public, and the foreign key already guarantees it exists.
  if new.kind = 'item'
     and new.item_id is not null
     and (tg_op = 'INSERT'
          or new.item_id is distinct from old.item_id
          or new.campaign_id is distinct from old.campaign_id)
     and not exists (
    select 1 from public.items i
    where i.id = new.item_id
      and private.can_use_in_campaign(i.user_id, i.campaign_id, new.campaign_id)
  ) then
    raise exception 'Item is not available to this campaign' using errcode = '23514';
  end if;

  -- The room/campaign agreement that used to live here is now the composite FK
  -- `loot_placements_location_fkey`, which the beat home has always had. A
  -- constraint holds continuously; a trigger only fires when this row is
  -- written, and the room could move afterwards.

  if new.kind = 'currency' then
    foreach v_coin in array array['pp', 'gp', 'ep', 'sp', 'cp'] loop
      if new.payload ? v_coin and (
        jsonb_typeof(new.payload->v_coin) <> 'number'
        or (new.payload->>v_coin)::numeric < 0
        or floor((new.payload->>v_coin)::numeric) <> (new.payload->>v_coin)::numeric
      ) then
        raise exception 'Currency % must be a non-negative integer', v_coin using errcode = '23514';
      end if;
    end loop;
    if coalesce((new.payload->>'pp')::integer, 0)
      + coalesce((new.payload->>'gp')::integer, 0)
      + coalesce((new.payload->>'ep')::integer, 0)
      + coalesce((new.payload->>'sp')::integer, 0)
      + coalesce((new.payload->>'cp')::integer, 0) = 0 then
      raise exception 'Currency loot must contain at least one coin' using errcode = '23514';
    end if;
  end if;

  if new.kind = 'loot_chest' and (
    jsonb_typeof(new.payload->'rolled_atoms') is distinct from 'array'
    or jsonb_typeof(new.payload->'claims_total') is distinct from 'number'
    or (new.payload->>'claims_total')::integer < 1
  ) then
    raise exception 'Loot chest requires rolled_atoms and a positive claims_total' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.dispatched_at is not null and (
    new.beat_id is distinct from old.beat_id
    or new.quest_id is distinct from old.quest_id
    or new.location_id is distinct from old.location_id
    or new.campaign_id is distinct from old.campaign_id
    or new.kind is distinct from old.kind
    or new.item_id is distinct from old.item_id
    or new.library_item_id is distinct from old.library_item_id
    or new.quantity is distinct from old.quantity
    or new.payload is distinct from old.payload
    or new.source_type is distinct from old.source_type
    or new.source_id is distinct from old.source_id
    or new.dispatch_message_id is distinct from old.dispatch_message_id
    or new.dispatched_at is distinct from old.dispatched_at
  ) then
    raise exception 'Dispatched loot provenance is immutable' using errcode = '23514';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_location_door_endpoints()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_from_parent uuid;
  v_to_parent   uuid;
  v_from_type   public.location_type_enum;
  v_to_type     public.location_type_enum;
begin
  select parent_id, location_type into v_from_parent, v_from_type
    from public.locations where id = new.from_location_id;

  if not (private.location_is_interior(v_from_type) or private.location_can_hold_rooms(v_from_type)) then
    raise exception 'A way out starts in a space: a room, a grounds, or a nested site with a floor plan'
      using errcode = '23514';
  end if;

  if v_from_parent is null then
    raise exception 'A way out starts in a space that sits inside a place'
      using errcode = '23514';
  end if;

  if new.to_location_id is not null then
    select parent_id, location_type into v_to_parent, v_to_type
      from public.locations where id = new.to_location_id;

    if not (private.location_is_interior(v_to_type) or private.location_can_hold_rooms(v_to_type)) then
      raise exception 'A way out connects two spaces: rooms, grounds, or nested sites with a floor plan'
        using errcode = '23514';
    end if;

    if v_from_parent is distinct from v_to_parent then
      raise exception 'A way out connects two spaces inside the same place'
        using errcode = '23514';
    end if;
  end if;

  -- The governing feature, when cited, must be the author's own. The RLS
  -- insert policy checks only the originating location, and a feature id
  -- is otherwise a free uuid.
  if new.dungeon_feature_id is not null and not exists (
    select 1 from public.dungeon_features f
     where f.id = new.dungeon_feature_id
       and private.can_use_in_campaign(f.user_id, f.campaign_id, private.location_campaign_id(new.from_location_id))
  ) then
    raise exception 'A way out may only cite a dungeon feature this campaign can use'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.transfer_campaign_ownership(p_campaign_id uuid, p_new_owner_id uuid, p_leave_campaign boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_owner     uuid;
  v_new_role  text;
  v_monsters  jsonb := '{}'::jsonb;  -- old id (text) -> new id (text)
  v_traps     jsonb := '{}'::jsonb;
  v_bgs       jsonb := '{}'::jsonb;
  v_docs      jsonb := '{}'::jsonb;
  v_items     jsonb := '{}'::jsonb;  -- (#733)
  v_npcs      jsonb := '{}'::jsonb;  -- (#733)
  v_factions  jsonb := '{}'::jsonb;  -- (#733)
  v_locations jsonb := '{}'::jsonb;  -- (#733)
  v_new       uuid;
  r           record;
begin
  -- ── Authorization ─────────────────────────────────────────────────────────
  -- SECURITY DEFINER bypasses RLS, so identity is re-derived from auth.uid() and
  -- never taken from a caller-supplied id.
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select user_id into v_owner from public.campaigns where id = p_campaign_id;

  if v_owner is null then
    raise exception 'Campaign not found';
  end if;

  if v_owner <> v_uid then
    raise exception 'Only the campaign owner can transfer it';
  end if;

  if p_new_owner_id = v_uid then
    raise exception 'You already own this campaign';
  end if;

  -- The recipient must already be a member. That is the consent step: a campaign
  -- can only be handed to someone who chose to join it via an invite link, never
  -- pushed onto an arbitrary account id.
  select role into v_new_role
  from public.campaign_members
  where campaign_id = p_campaign_id and user_id = p_new_owner_id;

  if v_new_role is null then
    raise exception 'The new owner must already be a member of this campaign';
  end if;

  -- ── 1. Clone the personal-library rows the campaign hydrates from ─────────
  perform set_config('grimoire.bypass_quota', 'on', true);

  -- monsters: referenced by encounters (blueprint combatants and spawn events),
  -- NPC stat-block links, the campaign bestiary, pinned wildshape forms,
  -- companions, live wildshape state, the campaign's monster exclusions, and
  -- (#630) quest_refs / quest_beat_attachments. The union that used to live
  -- inline here moved to private.campaign_referenced_monster_ids, shared with
  -- the scoped-copy wrapper's exclusion set so the two cannot drift again.
  for r in
    select m.*
    from public.monsters m
    where m.user_id = v_owner
      and m.id in (select private.campaign_referenced_monster_ids(p_campaign_id))
  loop
    v_new := gen_random_uuid();
    insert into public.monsters
    select (jsonb_populate_record(
              null::public.monsters,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_monsters := v_monsters || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- traps: referenced by encounters.trap_ids (uuid[], no FK). Union moved to
  -- private.campaign_referenced_trap_ids (#630) -- same sharing rationale as
  -- the monster loop above.
  for r in
    select t.*
    from public.traps t
    where t.user_id = v_owner
      and t.id in (select private.campaign_referenced_trap_ids(p_campaign_id))
  loop
    v_new := gen_random_uuid();
    insert into public.traps
    select (jsonb_populate_record(
              null::public.traps,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_traps := v_traps || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- backgrounds: character sheets resolve their origin features through
  -- party_members.background_id. Library backgrounds (text slugs) are shared and
  -- stay as they are; only a uuid, the owner's own row, is copied.
  for r in
    select b.*
    from public.backgrounds b
    where b.user_id = v_owner
      and b.id::text in (
        select pm.background_id from public.party_members pm
          where pm.campaign_id = p_campaign_id and pm.background_id is not null
      )
  loop
    v_new := gen_random_uuid();
    insert into public.backgrounds
    select (jsonb_populate_record(
              null::public.backgrounds,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_bgs := v_bgs || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- scriptorium_documents: NPC handouts / stat-block sheets. Self-contained rows
  -- (nothing else FKs into them), so a plain copy is a complete copy.
  -- (#733) Reachability extended with two unions: handouts attached directly
  -- to a quest beat, and the handout of a quest-referenced GLOBAL npc that the
  -- npc loop below is about to clone (that npc's own scriptorium_doc_id link
  -- must resolve for the new owner too).
  for r in
    select d.*
    from public.scriptorium_documents d
    where d.user_id = v_owner
      -- (#915) Only account-wide documents are copied. A document scoped to
      -- this campaign is the campaign's own content and moves with it below.
      and d.campaign_id is null
      and d.id in (
        select n.scriptorium_doc_id from public.npcs n
          where n.campaign_id = p_campaign_id and n.scriptorium_doc_id is not null
        union
        -- (#733) handouts attached directly to a quest beat.
        select qba.ref_id::uuid
          from public.quest_beat_attachments qba
         where qba.campaign_id = p_campaign_id
           and qba.attachment_type = 'handout'
           and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        union
        -- (#733) a quest-referenced GLOBAL npc's own handout.
        select n.scriptorium_doc_id
          from public.npcs n
         where n.campaign_id is null
           and n.user_id = v_owner
           and n.scriptorium_doc_id is not null
           and (
             exists (
               select 1 from public.quest_refs qr
               join public.quests q on q.id = qr.quest_id
               where q.campaign_id = p_campaign_id
                 and qr.ref_type = 'npc'
                 and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 and qr.ref_id::uuid = n.id
             )
             or exists (
               select 1 from public.quest_beat_attachments qba
               where qba.campaign_id = p_campaign_id
                 and qba.attachment_type = 'npc'
                 and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 and qba.ref_id::uuid = n.id
             )
           )
      )
  loop
    v_new := gen_random_uuid();
    insert into public.scriptorium_documents
    select (jsonb_populate_record(
              null::public.scriptorium_documents,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_docs := v_docs || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- (#733) items: referenced by quest_refs ('item') and quest_beat_attachments
  -- ('item'). Only the outgoing DM's GLOBAL items are candidates -- campaign-
  -- scoped items already move with the campaign in step 3 below, ids intact.
  for r in
    select i.*
    from public.items i
    where i.user_id = v_owner
      and i.campaign_id is null
      and (
        exists (
          select 1 from public.quest_refs qr
          join public.quests q on q.id = qr.quest_id
          where q.campaign_id = p_campaign_id
            and qr.ref_type = 'item'
            and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qr.ref_id::uuid = i.id
        )
        or exists (
          select 1 from public.quest_beat_attachments qba
          where qba.campaign_id = p_campaign_id
            and qba.attachment_type = 'item'
            and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qba.ref_id::uuid = i.id
        )
      )
  loop
    v_new := gen_random_uuid();
    insert into public.items
    select (jsonb_populate_record(
              null::public.items,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_items := v_items || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- (#733) npcs: referenced by quest_refs ('npc') and quest_beat_attachments
  -- ('npc'). A cloned npc's own linked_monster_id / scriptorium_doc_id are
  -- remapped in the second-order block below, once every map here is full.
  for r in
    select n.*
    from public.npcs n
    where n.user_id = v_owner
      and n.campaign_id is null
      and (
        exists (
          select 1 from public.quest_refs qr
          join public.quests q on q.id = qr.quest_id
          where q.campaign_id = p_campaign_id
            and qr.ref_type = 'npc'
            and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qr.ref_id::uuid = n.id
        )
        or exists (
          select 1 from public.quest_beat_attachments qba
          where qba.campaign_id = p_campaign_id
            and qba.attachment_type = 'npc'
            and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qba.ref_id::uuid = n.id
        )
      )
  loop
    v_new := gen_random_uuid();
    insert into public.npcs
    select (jsonb_populate_record(
              null::public.npcs,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_npcs := v_npcs || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- (#733) factions: referenced by quest_refs ('faction') and
  -- quest_beat_attachments ('faction'). Cloned SHALLOW -- faction_* junction
  -- rows (memberships, relations, deity/item/location links) are campaign
  -- relations, not part of the faction record itself, and are deliberately
  -- NOT cloned here. A campaign faction's own junction rows already travel
  -- with it via step 3 below (ids stable); a cloned GLOBAL faction starts
  -- with none, which is correct -- it never had campaign relations of its own.
  for r in
    select f.*
    from public.factions f
    where f.user_id = v_owner
      and f.campaign_id is null
      and (
        exists (
          select 1 from public.quest_refs qr
          join public.quests q on q.id = qr.quest_id
          where q.campaign_id = p_campaign_id
            and qr.ref_type = 'faction'
            and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qr.ref_id::uuid = f.id
        )
        or exists (
          select 1 from public.quest_beat_attachments qba
          where qba.campaign_id = p_campaign_id
            and qba.attachment_type = 'faction'
            and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qba.ref_id::uuid = f.id
        )
      )
  loop
    v_new := gen_random_uuid();
    insert into public.factions
    select (jsonb_populate_record(
              null::public.factions,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_factions := v_factions || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- (#733, rewritten by #797) locations: referenced by quest_refs ('location')
  -- and by quest_beats.staged_at_location_id -- the place a beat happens at.
  -- This used to chase a beat attachment's ref_id and the room id array beside
  -- it; both went when staging became a column, so a beat now names exactly one
  -- place and the sweep is one predicate instead of two. A cloned location's
  -- own parent_id / source_map_id are handled in the second-order block below.
  for r in
    select l.*
    from public.locations l
    where l.user_id = v_owner
      and l.campaign_id is null
      and (
        exists (
          select 1 from public.quest_refs qr
          join public.quests q on q.id = qr.quest_id
          where q.campaign_id = p_campaign_id
            and qr.ref_type = 'location'
            and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qr.ref_id::uuid = l.id
        )
        or exists (
          -- A staged place AND everything under it. The old attachment cloned
          -- rooms because metadata->'room_ids' happened to list them, which
          -- meant a room the DM forgot to list stayed behind. Staging names the
          -- site, so the site's rooms follow by descent — a dungeon that
          -- arrives without its rooms is not a dungeon.
          --
          -- No uuid-shape regex here, unlike the quest_refs arm above: ref_id is
          -- untyped text, while staged_at_location_id is a uuid column with a
          -- foreign key behind it.
          with recursive staged as (
            select qb.staged_at_location_id as id
              from public.quest_beats qb
             where qb.campaign_id = p_campaign_id
               and qb.staged_at_location_id is not null
            union
            select c.id
              from public.locations c
              join staged s on c.parent_id = s.id
          )
          select 1 from staged where staged.id = l.id
        )
      )
  loop
    v_new := gen_random_uuid();
    insert into public.locations
    select (jsonb_populate_record(
              null::public.locations,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_locations := v_locations || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- ── Second-order remaps within the newly cloned rows ───────────────────────
  -- (#733) A clone's own FK columns may point at ANOTHER row that was ALSO
  -- cloned in this same transaction (a cloned npc's linked_monster_id /
  -- scriptorium_doc_id, or a cloned location's parent_id pointing at another
  -- cloned location). Every map above is fully populated by this point, so
  -- these updates target the CLONE ids (v_npcs / v_locations values) --
  -- never campaign_id = p_campaign_id rows, which the step-2-style repoints
  -- below handle separately. npcs has no faction-reference column to remap.
  update public.npcs
     set linked_monster_id = (v_monsters->>linked_monster_id::text)::uuid
   where id in (select value::uuid from jsonb_each_text(v_npcs))
     and linked_monster_id is not null
     and v_monsters ? linked_monster_id::text;

  update public.npcs
     set scriptorium_doc_id = (v_docs->>scriptorium_doc_id::text)::uuid
   where id in (select value::uuid from jsonb_each_text(v_npcs))
     and scriptorium_doc_id is not null
     and v_docs ? scriptorium_doc_id::text;

  -- Cloned locations: remap parent_id clone-to-clone (a cloned room's parent
  -- may be another cloned location), then null source_map_id -- the new owner
  -- can open neither the outgoing DM's Cartographer map nor the deep-link
  -- target, same rule as the campaign-location source_map_id null-out below.
  update public.locations
     set parent_id = (v_locations->>parent_id::text)::uuid
   where id in (select value::uuid from jsonb_each_text(v_locations))
     and parent_id is not null
     and v_locations ? parent_id::text;

  update public.locations
     set source_map_id = null
   where id in (select value::uuid from jsonb_each_text(v_locations))
     and source_map_id is not null;

  -- ── 2. Repoint the campaign's references at the clones ────────────────────

  -- Plain FK columns.
  update public.npcs
     set linked_monster_id = (v_monsters->>linked_monster_id::text)::uuid
   where campaign_id = p_campaign_id
     and linked_monster_id is not null
     and v_monsters ? linked_monster_id::text;

  update public.discovered_monsters
     set monster_id = (v_monsters->>monster_id::text)::uuid
   where campaign_id = p_campaign_id
     and monster_id is not null
     and v_monsters ? monster_id::text;

  update public.pinned_forms
     set monster_id = (v_monsters->>monster_id::text)::uuid
   where campaign_id = p_campaign_id
     and monster_id is not null
     and v_monsters ? monster_id::text;

  -- text column, so no cast on either side.
  update public.companions
     set source_monster_id = v_monsters->>source_monster_id
   where campaign_id = p_campaign_id
     and source_monster_id is not null
     and v_monsters ? source_monster_id;

  update public.party_members
     set background_id = v_bgs->>background_id
   where campaign_id = p_campaign_id
     and background_id is not null
     and v_bgs ? background_id::text;

  update public.npcs
     set scriptorium_doc_id = (v_docs->>scriptorium_doc_id::text)::uuid
   where campaign_id = p_campaign_id
     and scriptorium_doc_id is not null
     and v_docs ? scriptorium_doc_id::text;

  -- (#733) Every remaining campaign-content FK column that can hold an
  -- npc/item/faction/location id, found by enumerating information_schema
  -- for foreign keys targeting those four tables (see the migration's own
  -- report for the full accept/reject list). Same guarded-repoint shape as
  -- the plain FK columns above: touch only campaign rows, only non-null
  -- values, only when the value is actually a key in the relevant map.
  update public.companions
     set source_npc_id = (v_npcs->>source_npc_id::text)::uuid
   where campaign_id = p_campaign_id
     and source_npc_id is not null
     and v_npcs ? source_npc_id::text;

  update public.calendar_events
     set linked_location_id = (v_locations->>linked_location_id::text)::uuid
   where campaign_id = p_campaign_id
     and linked_location_id is not null
     and v_locations ? linked_location_id::text;

  update public.campaigns
     set current_location_id = (v_locations->>current_location_id::text)::uuid
   where id = p_campaign_id
     and current_location_id is not null
     and v_locations ? current_location_id::text;

  update public.encounters
     set location_id = (v_locations->>location_id::text)::uuid
   where campaign_id = p_campaign_id
     and location_id is not null
     and v_locations ? location_id::text;

  update public.locations
     set npc_owner_id = (v_npcs->>npc_owner_id::text)::uuid
   where campaign_id = p_campaign_id
     and npc_owner_id is not null
     and v_npcs ? npc_owner_id::text;

  -- Campaign locations only -- distinct from the clone-to-clone parent_id
  -- remap in the second-order block above, which targets the fresh clones.
  update public.locations
     set parent_id = (v_locations->>parent_id::text)::uuid
   where campaign_id = p_campaign_id
     and parent_id is not null
     and v_locations ? parent_id::text;

  update public.npc_inventory
     set item_id = (v_items->>item_id::text)::uuid
   where campaign_id = p_campaign_id
     and item_id is not null
     and v_items ? item_id::text;

  update public.npc_inventory
     set npc_id = (v_npcs->>npc_id::text)::uuid
   where campaign_id = p_campaign_id
     and npc_id is not null
     and v_npcs ? npc_id::text;

  update public.npc_pc_notes
     set npc_id = (v_npcs->>npc_id::text)::uuid
   where campaign_id = p_campaign_id
     and npc_id is not null
     and v_npcs ? npc_id::text;

  update public.npc_relationships
     set npc_id = (v_npcs->>npc_id::text)::uuid
   where campaign_id = p_campaign_id
     and npc_id is not null
     and v_npcs ? npc_id::text;

  update public.npc_relationships
     set related_npc_id = (v_npcs->>related_npc_id::text)::uuid
   where campaign_id = p_campaign_id
     and related_npc_id is not null
     and v_npcs ? related_npc_id::text;

  update public.npcs
     set location_id = (v_locations->>location_id::text)::uuid
   where campaign_id = p_campaign_id
     and location_id is not null
     and v_locations ? location_id::text;

  update public.party_inventory
     set item_id = (v_items->>item_id::text)::uuid
   where campaign_id = p_campaign_id
     and item_id is not null
     and v_items ? item_id::text;

  update public.party_members
     set current_location_id = (v_locations->>current_location_id::text)::uuid
   where campaign_id = p_campaign_id
     and current_location_id is not null
     and v_locations ? current_location_id::text;

  update public.puzzle_rooms
     set location_id = (v_locations->>location_id::text)::uuid
   where campaign_id = p_campaign_id
     and location_id is not null
     and v_locations ? location_id::text;

  update public.quests
     set giver_npc_id = (v_npcs->>giver_npc_id::text)::uuid
   where campaign_id = p_campaign_id
     and giver_npc_id is not null
     and v_npcs ? giver_npc_id::text;

  update public.quests
     set location_id = (v_locations->>location_id::text)::uuid
   where campaign_id = p_campaign_id
     and location_id is not null
     and v_locations ? location_id::text;

  -- FK children reachable only through a campaign-scoped parent -- same join
  -- shape as the ownership updates for these same tables in step 3 below.
  update public.crafting_recipe_ingredients ci
     set item_id = (v_items->>ci.item_id::text)::uuid
    from public.crafting_recipes cr
   where cr.id = ci.recipe_id
     and cr.campaign_id = p_campaign_id
     and ci.item_id is not null
     and v_items ? ci.item_id::text;

  update public.crafting_recipe_outputs co
     set item_id = (v_items->>co.item_id::text)::uuid
    from public.crafting_recipes cr
   where cr.id = co.recipe_id
     and cr.campaign_id = p_campaign_id
     and co.item_id is not null
     and v_items ? co.item_id::text;

  update public.faction_items fi
     set item_id = (v_items->>fi.item_id::text)::uuid
    from public.factions f
   where f.id = fi.faction_id
     and f.campaign_id = p_campaign_id
     and v_items ? fi.item_id::text;

  update public.faction_locations fl
     set location_id = (v_locations->>fl.location_id::text)::uuid
    from public.factions f
   where f.id = fl.faction_id
     and f.campaign_id = p_campaign_id
     and v_locations ? fl.location_id::text;

  update public.faction_npcs fn
     set npc_id = (v_npcs->>fn.npc_id::text)::uuid
    from public.factions f
   where f.id = fn.faction_id
     and f.campaign_id = p_campaign_id
     and v_npcs ? fn.npc_id::text;

  update public.faction_relations fr
     set target_faction_id = (v_factions->>fr.target_faction_id::text)::uuid
    from public.factions f
   where f.id = fr.faction_id
     and f.campaign_id = p_campaign_id
     and v_factions ? fr.target_faction_id::text;

  update public.store_items si
     set item_id = (v_items->>si.item_id::text)::uuid
    from public.locations l
   where l.id = si.location_id
     and l.campaign_id = p_campaign_id
     and v_items ? si.item_id::text;

  -- uuid[] columns -- rebuilt in place, order preserved, unmapped ids untouched.
  update public.encounters e
     set trap_ids = (
           select coalesce(array_agg(coalesce((v_traps->>u.tid::text)::uuid, u.tid) order by u.ord), '{}'::uuid[])
           from unnest(e.trap_ids) with ordinality as u(tid, ord)
         )
   where e.campaign_id = p_campaign_id
     and exists (select 1 from unnest(e.trap_ids) t where v_traps ? t::text);

  update public.campaigns c
     set excluded_monster_ids = (
           select array_agg(coalesce((v_monsters->>u.mid::text)::uuid, u.mid) order by u.ord)
           from unnest(c.excluded_monster_ids) with ordinality as u(mid, ord)
         )
   where c.id = p_campaign_id
     and c.excluded_monster_ids is not null
     and exists (select 1 from unnest(c.excluded_monster_ids) m where v_monsters ? m::text);

  -- JSONB columns. `combatants`, `events` and `wildshape_state` nest monster ids
  -- at three different depths, so rather than rebuilding each shape we substitute
  -- the uuid inside the serialized document. A v4 uuid is globally unique, so a
  -- match anywhere in the document IS that monster reference -- combatant slot
  -- ids and the like are distinct uuids and cannot collide.
  for r in select key as old_id, value as new_id from jsonb_each_text(v_monsters)
  loop
    update public.encounters
       set combatants = replace(combatants::text, r.old_id, r.new_id)::jsonb
     where campaign_id = p_campaign_id
       and combatants is not null
       and position(r.old_id in combatants::text) > 0;

    update public.encounters
       set events = replace(events::text, r.old_id, r.new_id)::jsonb
     where campaign_id = p_campaign_id
       and events is not null
       and position(r.old_id in events::text) > 0;

    update public.party_members
       set wildshape_state = replace(wildshape_state::text, r.old_id, r.new_id)::jsonb
     where campaign_id = p_campaign_id
       and wildshape_state is not null
       and position(r.old_id in wildshape_state::text) > 0;
  end loop;

  -- (#733) Combatants also carry npc_id (CombatantDef: "either monster_id or
  -- npc_id is set, not both") -- events and wildshape_state never reference an
  -- npc, only combatants does, so this pass is narrower than the monster one.
  for r in select key as old_id, value as new_id from jsonb_each_text(v_npcs)
  loop
    update public.encounters
       set combatants = replace(combatants::text, r.old_id, r.new_id)::jsonb
     where campaign_id = p_campaign_id
       and combatants is not null
       and position(r.old_id in combatants::text) > 0;
  end loop;

  -- Editor deep-links into the outgoing DM's Cartographer workspace: the new
  -- owner can open neither target, so drop the link rather than keep a dead one.
  update public.locations
     set source_map_id = null
   where campaign_id = p_campaign_id and source_map_id is not null;

  update public.puzzle_rooms
     set dungeon_feature_id = null
   where campaign_id = p_campaign_id and dungeon_feature_id is not null;

  -- ── 3. Move the campaign's own content ────────────────────────────────────
  -- The authored rows move through private.move_campaign_content, shared with
  -- a co-DM handing their chair back (#590), so the two cannot drift. It also
  -- carries what this list never did: site plans (doors, regions, placements,
  -- the site state log), session records and DM item entries, which stayed
  -- the outgoing owner's, readable by them as a player and gone with their
  -- account.
  perform private.move_campaign_content(p_campaign_id, v_owner, p_new_owner_id, false, true);

  -- (#983) The outgoing DM's DM notes in this campaign (written_as_dm, #590:
  -- never their player notes, nor the new owner's player notes, which a seat
  -- that rotated may have left behind), which a notes column would have
  -- carried along with its row. A co-DM taking
  -- over may keep their own on the same entity: the outgoing text joins theirs
  -- rather than arriving as a second note the scratchpad would never show.
  update public.entity_notes n
     set content = jsonb_build_object('type', 'doc', 'content',
           private.note_blocks(n.content) || (
             select coalesce(jsonb_agg(b.blk order by o.created_at, o.id, b.ord), '[]'::jsonb)
               from public.entity_notes o
              cross join lateral jsonb_array_elements(private.note_blocks(o.content))
                    with ordinality as b(blk, ord)
              where o.campaign_id = p_campaign_id and o.user_id = v_owner
                and o.written_as_dm
                and o.entity_type = n.entity_type and o.entity_id = n.entity_id))::text
   where n.user_id = p_new_owner_id and n.written_as_dm
     -- Their oldest, which is the one the scratchpad shows.
     and n.id = (select m.id from public.entity_notes m
                  where m.user_id = n.user_id and m.written_as_dm
                    and m.entity_type = n.entity_type and m.entity_id = n.entity_id
                  order by m.created_at, m.id limit 1)
     and exists (select 1 from public.entity_notes o
                  where o.campaign_id = p_campaign_id and o.user_id = v_owner
                    and o.written_as_dm
                    and o.entity_type = n.entity_type and o.entity_id = n.entity_id);
  delete from public.entity_notes o
   where o.campaign_id = p_campaign_id and o.user_id = v_owner
     and o.written_as_dm
     and exists (select 1 from public.entity_notes n
                  where n.user_id = p_new_owner_id and n.written_as_dm
                    and n.entity_type = o.entity_type and n.entity_id = o.entity_id);
  update public.entity_notes
     set user_id = p_new_owner_id
   where campaign_id = p_campaign_id and user_id = v_owner
     and written_as_dm;
  -- A co-DM taking over may have touched the same entity; theirs is kept.
  delete from public.dm_note_touches o
   where o.campaign_id = p_campaign_id and o.user_id = v_owner
     and exists (select 1 from public.dm_note_touches n
                  where n.user_id = p_new_owner_id and n.campaign_id = o.campaign_id
                    and n.entity_type = o.entity_type and n.entity_id = o.entity_id);
  update public.dm_note_touches         set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;

  -- ── 4. Swap the roles ─────────────────────────────────────────────────────
  -- Order matters. campaign_members_guard_self_update lets a row through
  -- unconditionally when private.is_campaign_dm(campaign_id) holds for auth.uid()
  -- -- which is the OUTGOING DM here. Demoting them first would revoke that and
  -- the trigger would then reject the promotion as an illegal self role change.
  --
  -- The new owner also stops being a player: a DM has no character, and leaving
  -- the link set would make their character read as "taken" in the member list
  -- and block the DM from reassigning it to a real player.
  update public.campaign_members
     set role = 'dm', party_member_id = null
   where campaign_id = p_campaign_id and user_id = p_new_owner_id;

  if p_leave_campaign then
    delete from public.campaign_members
     where campaign_id = p_campaign_id and user_id = v_owner;
  else
    update public.campaign_members
       set role = 'player'
     where campaign_id = p_campaign_id and user_id = v_owner;
  end if;

  -- ── 5. The campaign row ───────────────────────────────────────────────────
  -- BYOK credentials belong to the outgoing DM and are cleared, never handed
  -- over. spotify_client_id stays: it is a public OAuth client id and #180 wants
  -- the campaign's Spotify setup to travel with it. falai_api_key is not
  -- listed: the column was dropped by 20260809145858 (#641, fal.ai removed as
  -- an image provider) along with every other reference to it.
  update public.campaigns
     set user_id           = p_new_owner_id,
         openai_api_key    = null,
         anthropic_api_key = null,
         gemini_api_key    = null
   where id = p_campaign_id;

  -- ── 6. Repoint quest references at the clones ─────────────────────────────
  -- Runs AFTER the campaign row flip: the patched validator arms accept a
  -- global clone through the campaign-owner branch only once campaigns.user_id
  -- is the recipient. For every synced kind, quest_refs goes FIRST: repointing
  -- an attachment fires sync_quest_ref_from_beat_attachment, whose mirror
  -- insert must land as an ON CONFLICT no-op against the already-repointed row
  -- instead of leaving an old+new duplicate pair. (#733: this now covers every
  -- ref_type the sync trigger produces -- npc, faction, location, item,
  -- monster -- not only monster. 'handout' is not in this list because the
  -- sync trigger has no 'handout' case and quest_refs' own CHECK constraint
  -- does not allow that ref_type -- attachments only, no mirror row.)
  update public.quest_refs qr
     set ref_id = v_monsters->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'monster'
     and v_monsters ? qr.ref_id;

  update public.quest_refs qr
     set ref_id = v_npcs->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'npc'
     and v_npcs ? qr.ref_id;

  update public.quest_refs qr
     set ref_id = v_locations->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'location'
     and v_locations ? qr.ref_id;

  update public.quest_refs qr
     set ref_id = v_items->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'item'
     and v_items ? qr.ref_id;

  update public.quest_refs qr
     set ref_id = v_factions->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'faction'
     and v_factions ? qr.ref_id;

  update public.quest_beat_attachments
     set ref_id = v_monsters->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'monster'
     and v_monsters ? ref_id;

  update public.quest_beat_attachments
     set ref_id = v_npcs->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'npc'
     and v_npcs ? ref_id;

  update public.quest_beat_attachments
     set ref_id = v_items->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'item'
     and v_items ? ref_id;

  update public.quest_beat_attachments
     set ref_id = v_factions->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'faction'
     and v_factions ? ref_id;

  update public.quest_beat_attachments
     set ref_id = v_docs->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'handout'
     and v_docs ? ref_id;

  -- #797: staging is a column, so repointing it is a single uuid swap. The
  -- room-id rebuild that used to sit here went with the list it maintained --
  -- production never held a non-empty room id array on any attachment, ever.
  --
  -- private.guard_beat_staging() fires on this UPDATE and passes because
  -- campaigns.user_id was already set to p_new_owner_id further up, so the
  -- clone (user_id = p_new_owner_id, campaign_id null) satisfies the
  -- campaign-owner arm. Moving this above that update would break transfers.
  update public.quest_beats qb
     set staged_at_location_id = (v_locations->>qb.staged_at_location_id::text)::uuid
   where qb.campaign_id = p_campaign_id
     and qb.staged_at_location_id is not null
     and v_locations ? qb.staged_at_location_id::text;
end;
$function$;

-- ── The policy sweep ────────────────────────────────────────────────────────

-- campaign content with a library: DM edits, co-DM reads the owner's library
drop policy "crafting_recipes_select" on public.crafting_recipes;
create policy "crafting_recipes_select" on public.crafting_recipes for select to public
  using ((((select auth.uid()) = user_id) OR ((campaign_id IS NOT NULL) AND private.is_campaign_member(campaign_id) AND (EXISTS ( SELECT 1
   FROM campaign_members cm
  WHERE ((cm.user_id = (select auth.uid())) AND (cm.campaign_id = crafting_recipes.campaign_id) AND (cm.party_member_id = ANY (crafting_recipes.player_visible_to)))))))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "crafting_recipes_update" on public.crafting_recipes;
create policy "crafting_recipes_update" on public.crafting_recipes for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "crafting_recipes_delete" on public.crafting_recipes;
create policy "crafting_recipes_delete" on public.crafting_recipes for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "owner select" on public.encounters;
create policy "owner select" on public.encounters for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "owner update" on public.encounters;
create policy "owner update" on public.encounters for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "owner delete" on public.encounters;
create policy "owner delete" on public.encounters for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "items_select" on public.items;
create policy "items_select" on public.items for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "items_update" on public.items;
create policy "items_update" on public.items for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "items_delete" on public.items;
create policy "items_delete" on public.items for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "Users can read own locations" on public.locations;
create policy "Users can read own locations" on public.locations for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "Users can update own locations" on public.locations;
create policy "Users can update own locations" on public.locations for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "Users can delete own locations" on public.locations;
create policy "Users can delete own locations" on public.locations for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "loot_tables_select" on public.loot_tables;
create policy "loot_tables_select" on public.loot_tables for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "loot_tables_update" on public.loot_tables;
create policy "loot_tables_update" on public.loot_tables for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "loot_tables_delete" on public.loot_tables;
create policy "loot_tables_delete" on public.loot_tables for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "monsters_select" on public.monsters;
create policy "monsters_select" on public.monsters for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "monsters_update" on public.monsters;
create policy "monsters_update" on public.monsters for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "monsters_delete" on public.monsters;
create policy "monsters_delete" on public.monsters for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "npc_inventory_select" on public.npc_inventory;
create policy "npc_inventory_select" on public.npc_inventory for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "npc_inventory_update" on public.npc_inventory;
create policy "npc_inventory_update" on public.npc_inventory for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "npc_inventory_delete" on public.npc_inventory;
create policy "npc_inventory_delete" on public.npc_inventory for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "npc_relationships_select" on public.npc_relationships;
create policy "npc_relationships_select" on public.npc_relationships for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "npc_relationships_update" on public.npc_relationships;
create policy "npc_relationships_update" on public.npc_relationships for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "npc_relationships_delete" on public.npc_relationships;
create policy "npc_relationships_delete" on public.npc_relationships for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "npc_sets_select" on public.npc_sets;
create policy "npc_sets_select" on public.npc_sets for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "npc_sets_update" on public.npc_sets;
create policy "npc_sets_update" on public.npc_sets for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "npc_sets_delete" on public.npc_sets;
create policy "npc_sets_delete" on public.npc_sets for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "Users see own npcs" on public.npcs;
create policy "Users see own npcs" on public.npcs for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "Users update own npcs" on public.npcs;
create policy "Users update own npcs" on public.npcs for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "Users delete own npcs" on public.npcs;
create policy "Users delete own npcs" on public.npcs for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "puzzle_rooms_select" on public.puzzle_rooms;
create policy "puzzle_rooms_select" on public.puzzle_rooms for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "puzzle_rooms_update" on public.puzzle_rooms;
create policy "puzzle_rooms_update" on public.puzzle_rooms for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "puzzle_rooms_delete" on public.puzzle_rooms;
create policy "puzzle_rooms_delete" on public.puzzle_rooms for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "quests_select" on public.quests;
create policy "quests_select" on public.quests for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "Users can update own quests" on public.quests;
create policy "Users can update own quests" on public.quests for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "Users can delete own quests" on public.quests;
create policy "Users can delete own quests" on public.quests for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "roll_tables_select" on public.roll_tables;
create policy "roll_tables_select" on public.roll_tables for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "roll_tables_update" on public.roll_tables;
create policy "roll_tables_update" on public.roll_tables for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "roll_tables_delete" on public.roll_tables;
create policy "roll_tables_delete" on public.roll_tables for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "scriptorium_documents_select" on public.scriptorium_documents;
create policy "scriptorium_documents_select" on public.scriptorium_documents for select to public
  using ((((select auth.uid()) = user_id) OR ((campaign_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM campaign_members cm
  WHERE ((cm.user_id = (select auth.uid())) AND (cm.campaign_id = scriptorium_documents.campaign_id) AND (cm.party_member_id = ANY (scriptorium_documents.player_visible_to)))))))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "Users update own docs" on public.scriptorium_documents;
create policy "Users update own docs" on public.scriptorium_documents for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "Users delete own docs" on public.scriptorium_documents;
create policy "Users delete own docs" on public.scriptorium_documents for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "soundboard_pages_select" on public.soundboard_pages;
create policy "soundboard_pages_select" on public.soundboard_pages for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "soundboard_pages_update" on public.soundboard_pages;
create policy "soundboard_pages_update" on public.soundboard_pages for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "soundboard_pages_delete" on public.soundboard_pages;
create policy "soundboard_pages_delete" on public.soundboard_pages for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "soundboard_playlists_select" on public.soundboard_playlists;
create policy "soundboard_playlists_select" on public.soundboard_playlists for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "soundboard_playlists_update" on public.soundboard_playlists;
create policy "soundboard_playlists_update" on public.soundboard_playlists for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "soundboard_playlists_delete" on public.soundboard_playlists;
create policy "soundboard_playlists_delete" on public.soundboard_playlists for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "sounds_select" on public.sounds;
create policy "sounds_select" on public.sounds for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "sounds_update" on public.sounds;
create policy "sounds_update" on public.sounds for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "sounds_delete" on public.sounds;
create policy "sounds_delete" on public.sounds for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "traps_select" on public.traps;
create policy "traps_select" on public.traps for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "traps_update" on public.traps;
create policy "traps_update" on public.traps for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "traps_delete" on public.traps;
create policy "traps_delete" on public.traps for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));

-- dungeon maps and features: also gain the campaign write gate 20260828201935 missed
drop policy "dungeon_maps_insert" on public.dungeon_maps;
create policy "dungeon_maps_insert" on public.dungeon_maps for insert to public
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id))));
drop policy "dungeon_maps_select" on public.dungeon_maps;
create policy "dungeon_maps_select" on public.dungeon_maps for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "dungeon_maps_update" on public.dungeon_maps;
create policy "dungeon_maps_update" on public.dungeon_maps for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "dungeon_maps_delete" on public.dungeon_maps;
create policy "dungeon_maps_delete" on public.dungeon_maps for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "dungeon_features_insert" on public.dungeon_features;
create policy "dungeon_features_insert" on public.dungeon_features for insert to public
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id))));
drop policy "dungeon_features_select" on public.dungeon_features;
create policy "dungeon_features_select" on public.dungeon_features for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "dungeon_features_update" on public.dungeon_features;
create policy "dungeon_features_update" on public.dungeon_features for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "dungeon_features_delete" on public.dungeon_features;
create policy "dungeon_features_delete" on public.dungeon_features for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));

-- personal content that is not a library: notes and calendar events
drop policy "notes_select" on public.notes;
create policy "notes_select" on public.notes for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "Users update own notes" on public.notes;
create policy "Users update own notes" on public.notes for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "Users delete own notes" on public.notes;
create policy "Users delete own notes" on public.notes for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "calendar_events_select" on public.calendar_events;
create policy "calendar_events_select" on public.calendar_events for select to public
  using ((((select auth.uid()) = user_id) OR ((campaign_id IS NOT NULL) AND (campaign_id IN ( SELECT campaign_members.campaign_id
   FROM campaign_members
  WHERE (campaign_members.user_id = (select auth.uid())))) AND ((player_visible = true) OR (event_type = 'session'::text))))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "Users update own events" on public.calendar_events;
create policy "Users update own events" on public.calendar_events for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "Users delete own events" on public.calendar_events;
create policy "Users delete own events" on public.calendar_events for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));

-- rules: the player arm keyed on 'the' dm row; it now keys on the owner
drop policy "rules_select" on public.rules;
create policy "rules_select" on public.rules for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[]))
    or ((is_player_visible = true) and (private.is_dm_of_my_campaigns(user_id) or (campaign_id is not null and private.is_campaign_member(campaign_id)))));
drop policy "rules_update" on public.rules;
create policy "rules_update" on public.rules for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "rules_delete" on public.rules;
create policy "rules_delete" on public.rules for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));

-- homebrew rules content: members already read the owner's; a co-DM's campaign rows join them
drop policy "species_select" on public.species;
create policy "species_select" on public.species for select to public
  using ((((select auth.uid()) = user_id) OR private.is_dm_of_my_campaigns(user_id))
    or (campaign_id is not null and private.is_campaign_member(campaign_id)));
drop policy "species_update" on public.species;
create policy "species_update" on public.species for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "species_delete" on public.species;
create policy "species_delete" on public.species for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "custom_classes_select" on public.custom_classes;
create policy "custom_classes_select" on public.custom_classes for select to public
  using ((((select auth.uid()) = user_id) OR (user_id IS NULL) OR private.is_dm_of_my_campaigns(user_id))
    or (campaign_id is not null and private.is_campaign_member(campaign_id)));
drop policy "custom_classes_update" on public.custom_classes;
create policy "custom_classes_update" on public.custom_classes for update to public
  using ((((select auth.uid()) = user_id) OR ((user_id IS NULL) AND private.is_app_admin()))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check (((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id))) OR ((user_id IS NULL) AND (campaign_id IS NULL) AND private.is_app_admin()))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "custom_classes_delete" on public.custom_classes;
create policy "custom_classes_delete" on public.custom_classes for delete to public
  using ((((select auth.uid()) = user_id) OR ((user_id IS NULL) AND private.is_app_admin()))
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "custom_subclasses_select" on public.custom_subclasses;
create policy "custom_subclasses_select" on public.custom_subclasses for select to public
  using ((((select auth.uid()) = user_id) OR (user_id IS NULL) OR private.is_dm_of_my_campaigns(user_id))
    or (campaign_id is not null and private.is_campaign_member(campaign_id)));
drop policy "custom_subclasses_update" on public.custom_subclasses;
create policy "custom_subclasses_update" on public.custom_subclasses for update to public
  using ((((select auth.uid()) = user_id) OR ((user_id IS NULL) AND private.is_app_admin()))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check (((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id))) OR ((user_id IS NULL) AND (campaign_id IS NULL) AND private.is_app_admin()))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "custom_subclasses_delete" on public.custom_subclasses;
create policy "custom_subclasses_delete" on public.custom_subclasses for delete to public
  using ((((select auth.uid()) = user_id) OR ((user_id IS NULL) AND private.is_app_admin()))
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "class_features_select" on public.class_features;
create policy "class_features_select" on public.class_features for select to public
  using ((((select auth.uid()) = user_id) OR (user_id IS NULL) OR private.is_dm_of_my_campaigns(user_id))
    or (campaign_id is not null and private.is_campaign_member(campaign_id)));
drop policy "class_features_update" on public.class_features;
create policy "class_features_update" on public.class_features for update to public
  using ((((select auth.uid()) = user_id) OR ((user_id IS NULL) AND private.is_app_admin()))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check (((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id))) OR ((user_id IS NULL) AND (campaign_id IS NULL) AND private.is_app_admin()))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "class_features_delete" on public.class_features;
create policy "class_features_delete" on public.class_features for delete to public
  using ((((select auth.uid()) = user_id) OR ((user_id IS NULL) AND private.is_app_admin()))
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));
drop policy "spells_update" on public.spells;
create policy "spells_update" on public.spells for update to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "spells_delete" on public.spells;
create policy "spells_delete" on public.spells for delete to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));

-- faction links: the faction's campaign decides
drop policy "faction_items_select" on public.faction_items;
create policy "faction_items_select" on public.faction_items for select to public
  using (((select auth.uid()) = user_id)
    or private.can_edit_faction(faction_id));
drop policy "faction_items_update" on public.faction_items;
create policy "faction_items_update" on public.faction_items for update to public
  using (((select auth.uid()) = user_id)
    or private.can_edit_faction(faction_id))
  with check (private.can_edit_faction(faction_id));
drop policy "faction_items_delete" on public.faction_items;
create policy "faction_items_delete" on public.faction_items for delete to public
  using (((select auth.uid()) = user_id)
    or (exists (select 1 from public.factions f where f.id = faction_items.faction_id and private.is_campaign_owner(f.campaign_id))));
drop policy "faction_locations_select" on public.faction_locations;
create policy "faction_locations_select" on public.faction_locations for select to public
  using (((select auth.uid()) = user_id)
    or private.can_edit_faction(faction_id));
drop policy "faction_locations_update" on public.faction_locations;
create policy "faction_locations_update" on public.faction_locations for update to public
  using (((select auth.uid()) = user_id)
    or private.can_edit_faction(faction_id))
  with check (private.can_edit_faction(faction_id));
drop policy "faction_locations_delete" on public.faction_locations;
create policy "faction_locations_delete" on public.faction_locations for delete to public
  using (((select auth.uid()) = user_id)
    or (exists (select 1 from public.factions f where f.id = faction_locations.faction_id and private.is_campaign_owner(f.campaign_id))));
drop policy "faction_npcs_select" on public.faction_npcs;
create policy "faction_npcs_select" on public.faction_npcs for select to public
  using ((((select auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM (faction_party_members fpm
     JOIN campaign_members cm ON ((cm.party_member_id = fpm.party_member_id)))
  WHERE ((fpm.faction_id = faction_npcs.faction_id) AND (cm.user_id = (select auth.uid())) AND (cm.role = 'player'::text)))))
    or private.can_edit_faction(faction_id));
drop policy "faction_npcs_update" on public.faction_npcs;
create policy "faction_npcs_update" on public.faction_npcs for update to public
  using (((select auth.uid()) = user_id)
    or private.can_edit_faction(faction_id))
  with check (private.can_edit_faction(faction_id));
drop policy "faction_npcs_delete" on public.faction_npcs;
create policy "faction_npcs_delete" on public.faction_npcs for delete to public
  using (((select auth.uid()) = user_id)
    or (exists (select 1 from public.factions f where f.id = faction_npcs.faction_id and private.is_campaign_owner(f.campaign_id))));
drop policy "faction_relations_select" on public.faction_relations;
create policy "faction_relations_select" on public.faction_relations for select to public
  using (((select auth.uid()) = user_id)
    or private.can_edit_faction(faction_id));
drop policy "faction_relations_update" on public.faction_relations;
create policy "faction_relations_update" on public.faction_relations for update to public
  using (((select auth.uid()) = user_id)
    or private.can_edit_faction(faction_id))
  with check (private.can_edit_faction(faction_id));
drop policy "faction_relations_delete" on public.faction_relations;
create policy "faction_relations_delete" on public.faction_relations for delete to public
  using (((select auth.uid()) = user_id)
    or (exists (select 1 from public.factions f where f.id = faction_relations.faction_id and private.is_campaign_owner(f.campaign_id))));
drop policy "faction_party_members_select" on public.faction_party_members;
create policy "faction_party_members_select" on public.faction_party_members for select to public
  using ((((select auth.uid()) = user_id) OR private.is_faction_pc_member(faction_id, (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM campaign_members cm
  WHERE ((cm.user_id = (select auth.uid())) AND (cm.role = 'player'::text) AND (cm.party_member_id = faction_party_members.party_member_id)))))
    or private.can_edit_faction(faction_id));
drop policy "faction_party_members_update" on public.faction_party_members;
create policy "faction_party_members_update" on public.faction_party_members for update to public
  using (((select auth.uid()) = user_id)
    or private.can_edit_faction(faction_id))
  with check (private.can_edit_faction(faction_id));
drop policy "faction_party_members_delete" on public.faction_party_members;
create policy "faction_party_members_delete" on public.faction_party_members for delete to public
  using (((select auth.uid()) = user_id)
    or (exists (select 1 from public.factions f where f.id = faction_party_members.faction_id and private.is_campaign_owner(f.campaign_id))));

-- site plans: the place's campaign decides. A library place (campaign_id null)
-- is now READABLE by the owner's co-DMs, so "a place I can see with no
-- campaign" no longer means "my own place": every write names the author.
drop policy "location_doors_insert" on public.location_doors;
create policy "location_doors_insert" on public.location_doors for insert to public
  with check (((select auth.uid()) = user_id) and (exists (select 1 from public.locations l where l.id = location_doors.from_location_id and ((l.campaign_id is null and l.user_id = (select auth.uid())) or (l.campaign_id is not null and private.is_campaign_dm(l.campaign_id))))));
drop policy "location_map_regions_insert" on public.location_map_regions;
create policy "location_map_regions_insert" on public.location_map_regions for insert to public
  with check (((select auth.uid()) = user_id) and (exists (select 1 from public.locations l where l.id = location_map_regions.site_location_id and ((l.campaign_id is null and l.user_id = (select auth.uid())) or (l.campaign_id is not null and private.is_campaign_dm(l.campaign_id))))));
drop policy "location_state_events_insert" on public.location_state_events;
create policy "location_state_events_insert" on public.location_state_events for insert to public
  with check (((select auth.uid()) = user_id) and (exists (select 1 from public.locations l where l.id = location_state_events.location_id and ((l.campaign_id is null and l.user_id = (select auth.uid())) or (l.campaign_id is not null and private.is_campaign_dm(l.campaign_id))))));
drop policy "location_doors_select" on public.location_doors;
create policy "location_doors_select" on public.location_doors for select to public
  using (((select auth.uid()) = user_id)
    or private.is_campaign_dm(private.location_campaign_id(location_doors.from_location_id))
    or ((private.location_campaign_id(location_doors.from_location_id) is null) and location_doors.user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "location_doors_update" on public.location_doors;
create policy "location_doors_update" on public.location_doors for update to public
  using (((select auth.uid()) = user_id)
    or private.is_campaign_dm(private.location_campaign_id(location_doors.from_location_id)))
  with check ((((select auth.uid()) = user_id) or private.is_campaign_dm(private.location_campaign_id(location_doors.from_location_id))) and (exists (select 1 from public.locations l where l.id = location_doors.from_location_id and ((l.campaign_id is null and l.user_id = (select auth.uid())) or (l.campaign_id is not null and private.is_campaign_dm(l.campaign_id))))));
drop policy "location_doors_delete" on public.location_doors;
create policy "location_doors_delete" on public.location_doors for delete to public
  using (((select auth.uid()) = user_id)
    or private.is_campaign_owner(private.location_campaign_id(location_doors.from_location_id)));
drop policy "location_map_regions_select" on public.location_map_regions;
create policy "location_map_regions_select" on public.location_map_regions for select to public
  using (((select auth.uid()) = user_id)
    or private.is_campaign_dm(private.location_campaign_id(location_map_regions.site_location_id))
    or ((private.location_campaign_id(location_map_regions.site_location_id) is null) and location_map_regions.user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "location_map_regions_update" on public.location_map_regions;
create policy "location_map_regions_update" on public.location_map_regions for update to public
  using (((select auth.uid()) = user_id)
    or private.is_campaign_dm(private.location_campaign_id(location_map_regions.site_location_id)))
  with check ((((select auth.uid()) = user_id) or private.is_campaign_dm(private.location_campaign_id(location_map_regions.site_location_id))) and (exists (select 1 from public.locations l where l.id = location_map_regions.site_location_id and ((l.campaign_id is null and l.user_id = (select auth.uid())) or (l.campaign_id is not null and private.is_campaign_dm(l.campaign_id))))));
drop policy "location_map_regions_delete" on public.location_map_regions;
create policy "location_map_regions_delete" on public.location_map_regions for delete to public
  using (((select auth.uid()) = user_id)
    or private.is_campaign_owner(private.location_campaign_id(location_map_regions.site_location_id)));
drop policy "location_placements_insert" on public.location_placements;
create policy "location_placements_insert" on public.location_placements for insert to public
  with check (((select auth.uid()) = user_id) and (exists (select 1 from public.locations l where l.id = location_placements.location_id and ((l.campaign_id is null and l.user_id = (select auth.uid())) or (l.campaign_id is not null and private.is_campaign_dm(l.campaign_id)))))
    and ((trap_id is null) or exists (select 1 from public.traps x where x.id = location_placements.trap_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id)))) and ((dungeon_feature_id is null) or exists (select 1 from public.dungeon_features x where x.id = location_placements.dungeon_feature_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id)))) and ((roll_table_id is null) or exists (select 1 from public.roll_tables x where x.id = location_placements.roll_table_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id)))) and ((loot_table_id is null) or exists (select 1 from public.loot_tables x where x.id = location_placements.loot_table_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id)))));
drop policy "location_placements_select" on public.location_placements;
create policy "location_placements_select" on public.location_placements for select to public
  using (((select auth.uid()) = user_id)
    or private.is_campaign_dm(private.location_campaign_id(location_placements.location_id))
    or ((private.location_campaign_id(location_placements.location_id) is null) and location_placements.user_id = any ((select private.dm_library_authors())::uuid[])));
drop policy "location_placements_update" on public.location_placements;
create policy "location_placements_update" on public.location_placements for update to public
  using (((select auth.uid()) = user_id)
    or private.is_campaign_dm(private.location_campaign_id(location_placements.location_id)))
  with check ((((select auth.uid()) = user_id) or private.is_campaign_dm(private.location_campaign_id(location_placements.location_id))) and (exists (select 1 from public.locations l where l.id = location_placements.location_id and ((l.campaign_id is null and l.user_id = (select auth.uid())) or (l.campaign_id is not null and private.is_campaign_dm(l.campaign_id)))))
    and ((trap_id is null) or exists (select 1 from public.traps x where x.id = location_placements.trap_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id)))) and ((dungeon_feature_id is null) or exists (select 1 from public.dungeon_features x where x.id = location_placements.dungeon_feature_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id)))) and ((roll_table_id is null) or exists (select 1 from public.roll_tables x where x.id = location_placements.roll_table_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id)))) and ((loot_table_id is null) or exists (select 1 from public.loot_tables x where x.id = location_placements.loot_table_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id)))));
drop policy "location_placements_delete" on public.location_placements;
create policy "location_placements_delete" on public.location_placements for delete to public
  using (((select auth.uid()) = user_id)
    or private.is_campaign_owner(private.location_campaign_id(location_placements.location_id)));

-- store stock: the store's campaign decides
drop policy "store_items_insert" on public.store_items;
create policy "store_items_insert" on public.store_items for insert to public
  with check (((select auth.uid()) = user_id) and (exists (select 1 from public.locations l where l.id = store_items.location_id and (l.user_id = (select auth.uid()) or (l.campaign_id is not null and private.is_campaign_dm(l.campaign_id))))));
drop policy "store_items_select" on public.store_items;
create policy "store_items_select" on public.store_items for select to public
  using ((((select auth.uid()) = user_id) OR ((visible = true) AND private.can_see_shared_store(location_id)))
    or private.is_campaign_dm(private.location_campaign_id(store_items.location_id)));
drop policy "store_items_update" on public.store_items;
create policy "store_items_update" on public.store_items for update to public
  using (((select auth.uid()) = user_id)
    or private.is_campaign_dm(private.location_campaign_id(store_items.location_id)))
  with check ((((select auth.uid()) = user_id) or private.is_campaign_dm(private.location_campaign_id(store_items.location_id))) and (exists (select 1 from public.locations l where l.id = store_items.location_id and (l.user_id = (select auth.uid()) or (l.campaign_id is not null and private.is_campaign_dm(l.campaign_id))))));
drop policy "store_items_delete" on public.store_items;
create policy "store_items_delete" on public.store_items for delete to public
  using (((select auth.uid()) = user_id)
    or private.is_campaign_owner(private.location_campaign_id(store_items.location_id)));

-- quest children: whoever may edit the quest may edit these. The select arm's quests subquery is
-- RLS-scoped, so it reads exactly the quests the caller may: author, campaign DM, the owner's library.
drop policy "quest_consequences_select" on public.quest_consequences;
create policy "quest_consequences_select" on public.quest_consequences for select to public
  using ((exists (select 1 from public.quests q where q.id = quest_consequences.quest_id)));
drop policy "quest_consequences_insert" on public.quest_consequences;
create policy "quest_consequences_insert" on public.quest_consequences for insert to public
  with check ((exists (select 1 from public.quests q where q.id = quest_consequences.quest_id and ((q.user_id = (select auth.uid())) or (q.campaign_id is not null and private.is_campaign_dm(q.campaign_id))))));
drop policy "quest_consequences_update" on public.quest_consequences;
create policy "quest_consequences_update" on public.quest_consequences for update to public
  using ((exists (select 1 from public.quests q where q.id = quest_consequences.quest_id and ((q.user_id = (select auth.uid())) or (q.campaign_id is not null and private.is_campaign_dm(q.campaign_id))))))
  with check ((exists (select 1 from public.quests q where q.id = quest_consequences.quest_id and ((q.user_id = (select auth.uid())) or (q.campaign_id is not null and private.is_campaign_dm(q.campaign_id))))));
drop policy "quest_consequences_delete" on public.quest_consequences;
create policy "quest_consequences_delete" on public.quest_consequences for delete to public
  using ((exists (select 1 from public.quests q where q.id = quest_consequences.quest_id and ((q.user_id = (select auth.uid())) or (q.campaign_id is not null and private.is_campaign_dm(q.campaign_id))))));
drop policy "quest_objectives_select" on public.quest_objectives;
create policy "quest_objectives_select" on public.quest_objectives for select to public
  using (((is_player_visible AND private.is_quest_player_visible(quest_id)) OR (exists (select 1 from public.quests q where q.id = quest_objectives.quest_id))));
drop policy "Users can insert objectives to own quests" on public.quest_objectives;
create policy "Users can insert objectives to own quests" on public.quest_objectives for insert to public
  with check ((exists (select 1 from public.quests q where q.id = quest_objectives.quest_id and ((q.user_id = (select auth.uid())) or (q.campaign_id is not null and private.is_campaign_dm(q.campaign_id))))));
drop policy "Users can update objectives of own quests" on public.quest_objectives;
create policy "Users can update objectives of own quests" on public.quest_objectives for update to public
  using ((exists (select 1 from public.quests q where q.id = quest_objectives.quest_id and ((q.user_id = (select auth.uid())) or (q.campaign_id is not null and private.is_campaign_dm(q.campaign_id))))))
  with check ((exists (select 1 from public.quests q where q.id = quest_objectives.quest_id and ((q.user_id = (select auth.uid())) or (q.campaign_id is not null and private.is_campaign_dm(q.campaign_id))))));
drop policy "Users can delete objectives of own quests" on public.quest_objectives;
create policy "Users can delete objectives of own quests" on public.quest_objectives for delete to public
  using ((exists (select 1 from public.quests q where q.id = quest_objectives.quest_id and ((q.user_id = (select auth.uid())) or (q.campaign_id is not null and private.is_campaign_dm(q.campaign_id))))));
drop policy "quest_refs_select" on public.quest_refs;
create policy "quest_refs_select" on public.quest_refs for select to public
  using (((is_player_visible AND private.is_quest_player_visible(quest_id)) OR (exists (select 1 from public.quests q where q.id = quest_refs.quest_id))));
drop policy "Users can insert refs to own quests" on public.quest_refs;
create policy "Users can insert refs to own quests" on public.quest_refs for insert to public
  with check ((exists (select 1 from public.quests q where q.id = quest_refs.quest_id and ((q.user_id = (select auth.uid())) or (q.campaign_id is not null and private.is_campaign_dm(q.campaign_id))))));
drop policy "quest_refs_update" on public.quest_refs;
create policy "quest_refs_update" on public.quest_refs for update to public
  using ((exists (select 1 from public.quests q where q.id = quest_refs.quest_id and ((q.user_id = (select auth.uid())) or (q.campaign_id is not null and private.is_campaign_dm(q.campaign_id))))))
  with check ((exists (select 1 from public.quests q where q.id = quest_refs.quest_id and ((q.user_id = (select auth.uid())) or (q.campaign_id is not null and private.is_campaign_dm(q.campaign_id))))));
drop policy "Users can delete refs of own quests" on public.quest_refs;
create policy "Users can delete refs of own quests" on public.quest_refs for delete to public
  using ((exists (select 1 from public.quests q where q.id = quest_refs.quest_id and ((q.user_id = (select auth.uid())) or (q.campaign_id is not null and private.is_campaign_dm(q.campaign_id))))));

-- playlist tracks: whoever may edit the playlist
drop policy "soundboard_playlist_tracks_select" on public.soundboard_playlist_tracks;
create policy "soundboard_playlist_tracks_select" on public.soundboard_playlist_tracks for select to public
  using ((exists (select 1 from public.soundboard_playlists p where p.id = soundboard_playlist_tracks.playlist_id)));
drop policy "soundboard_playlist_tracks_insert" on public.soundboard_playlist_tracks;
create policy "soundboard_playlist_tracks_insert" on public.soundboard_playlist_tracks for insert to public
  with check ((exists (select 1 from public.soundboard_playlists p where p.id = soundboard_playlist_tracks.playlist_id and ((p.user_id = (select auth.uid())) or private.is_campaign_dm(p.campaign_id)))));
drop policy "soundboard_playlist_tracks_delete" on public.soundboard_playlist_tracks;
create policy "soundboard_playlist_tracks_delete" on public.soundboard_playlist_tracks for delete to public
  using ((exists (select 1 from public.soundboard_playlists p where p.id = soundboard_playlist_tracks.playlist_id and ((p.user_id = (select auth.uid())) or private.is_campaign_dm(p.campaign_id)))));

-- recipe parts: whoever may edit the recipe
drop policy "crafting_recipe_ingredients_insert" on public.crafting_recipe_ingredients;
create policy "crafting_recipe_ingredients_insert" on public.crafting_recipe_ingredients for insert to public
  with check ((recipe_id in (select crafting_recipes.id from public.crafting_recipes where (crafting_recipes.user_id = (select auth.uid())) or private.is_campaign_dm(crafting_recipes.campaign_id))));
drop policy "crafting_recipe_ingredients_delete" on public.crafting_recipe_ingredients;
create policy "crafting_recipe_ingredients_delete" on public.crafting_recipe_ingredients for delete to public
  using ((recipe_id in (select crafting_recipes.id from public.crafting_recipes where (crafting_recipes.user_id = (select auth.uid())) or private.is_campaign_dm(crafting_recipes.campaign_id))));
drop policy "crafting_recipe_modifiers_insert" on public.crafting_recipe_modifiers;
create policy "crafting_recipe_modifiers_insert" on public.crafting_recipe_modifiers for insert to public
  with check ((recipe_id in (select crafting_recipes.id from public.crafting_recipes where (crafting_recipes.user_id = (select auth.uid())) or private.is_campaign_dm(crafting_recipes.campaign_id))));
drop policy "crafting_recipe_modifiers_delete" on public.crafting_recipe_modifiers;
create policy "crafting_recipe_modifiers_delete" on public.crafting_recipe_modifiers for delete to public
  using ((recipe_id in (select crafting_recipes.id from public.crafting_recipes where (crafting_recipes.user_id = (select auth.uid())) or private.is_campaign_dm(crafting_recipes.campaign_id))));
drop policy "crafting_recipe_outputs_insert" on public.crafting_recipe_outputs;
create policy "crafting_recipe_outputs_insert" on public.crafting_recipe_outputs for insert to public
  with check ((recipe_id in (select crafting_recipes.id from public.crafting_recipes where (crafting_recipes.user_id = (select auth.uid())) or private.is_campaign_dm(crafting_recipes.campaign_id))));
drop policy "crafting_recipe_outputs_delete" on public.crafting_recipe_outputs;
create policy "crafting_recipe_outputs_delete" on public.crafting_recipe_outputs for delete to public
  using ((recipe_id in (select crafting_recipes.id from public.crafting_recipes where (crafting_recipes.user_id = (select auth.uid())) or private.is_campaign_dm(crafting_recipes.campaign_id))));

-- ── Authored lore and records: edit as any DM, delete as author or owner ────
-- These were already DM-wide, which was right while a campaign had one DM.
-- A faction, a deity, a pantheon and a session record each have their own
-- page, so they follow the rule for authored rows above: a co-DM edits them
-- and deletes only their own. faction_deities, a link between two of them, is
-- a part and stays DM-wide.

-- factions: the update check pinned the author, so a co-DM could save the
-- owner's faction only by taking it over. The author guard pins it instead.
drop policy "factions_update" on public.factions;
create policy "factions_update" on public.factions for update to public
  using ((private.is_campaign_dm(campaign_id) OR ((campaign_id IS NULL) AND ((select auth.uid()) = user_id))))
  with check (((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id))))
    or (campaign_id is not null and private.is_campaign_dm(campaign_id)));
drop policy "factions_delete" on public.factions;
create policy "factions_delete" on public.factions for delete to public
  using ((((select auth.uid()) = user_id) and ((campaign_id is null) or private.is_campaign_dm(campaign_id)))
    or (campaign_id is not null and private.is_campaign_owner(campaign_id)));

drop policy "deities_delete" on public.deities;
create policy "deities_delete" on public.deities for delete to public
  using ((((select auth.uid()) = user_id) and private.is_campaign_dm(campaign_id))
    or private.is_campaign_owner(campaign_id));

drop policy "pantheons_delete" on public.pantheons;
create policy "pantheons_delete" on public.pantheons for delete to public
  using ((((select auth.uid()) = user_id) and private.is_campaign_dm(campaign_id))
    or private.is_campaign_owner(campaign_id));

drop policy "campaign_sessions_delete" on public.campaign_sessions;
create policy "campaign_sessions_delete" on public.campaign_sessions for delete to public
  using ((((select auth.uid()) = user_id) and private.is_campaign_dm(campaign_id))
    or private.is_campaign_owner(campaign_id));


-- ── The Vault and the Bestiary list the campaign's rows, whoever wrote them ─
-- Both read `user_id = auth.uid()` only, so a co-DM's catalogue showed none of
-- the owner's campaign rows. Invoker functions: RLS still bounds what returns.
CREATE OR REPLACE FUNCTION public.browse_items(p_slugs text[], p_ruleset text, p_campaign_id uuid, p_search text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_rarity text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_scope text DEFAULT NULL::text, p_limit integer DEFAULT 48, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with
  pat as (select private.contains_pattern(p_search) as p),
  own as (
    select i.id::text as id, i.name, i.item_type, i.rarity, i.subtype, i.tags, i.source, i.source_title,
           i.source_document_key, i.source_record_key, i.image_url, i.image_focal_point,
           i.damage_rolls, i.armor_class, i.charges, i.content is not null as has_content,
           i.campaign_id, false as is_shared, 1 as origin
      from public.items i
     -- The caller's own rows (other campaigns' too, for the 'other_campaign'
     -- scope), plus this campaign's rows whoever wrote them and the owner's
     -- library, which a co-DM reads (#590) and the item view marks read-only.
     where (i.ruleset is null or i.ruleset = p_ruleset)
       and ((i.user_id = auth.uid()
             and (p_scope = 'other_campaign' or i.campaign_id is null or i.campaign_id = p_campaign_id))
            or i.campaign_id = p_campaign_id
            or (i.campaign_id is null
                and i.user_id = (select c.user_id from public.campaigns c where c.id = p_campaign_id)))
  ),
  lib as (
    select l.id, l.name, l.item_type, l.rarity, l.subtype, l.tags, l.source, l.source_title,
           l.source_document_key, l.source_record_key, l.image_url, l.image_focal_point,
           l.damage_rolls, l.armor_class, l.charges, false as has_content,
           null::uuid as campaign_id, true as is_shared, 0 as origin
      from public.library_items l
     where l.source_document_key = any (array['grimoire-bundled'] || p_slugs)
       and (l.ruleset is null or l.ruleset = p_ruleset)
       -- An own row shadows its library twin: by identity when it carries
       -- both keys, else by name when it has a source; homebrew never does.
       and not exists (
         select 1 from own o
          where (o.source_document_key is not null and o.source_record_key is not null
                 and o.source_document_key = l.source_document_key
                 and o.source_record_key = l.source_record_key)
             or (o.source is not null
                 and not (o.source_document_key is not null and o.source_record_key is not null)
                 and lower(o.name) = lower(l.name))
       )
  ),
  merged as (
    select m.*,
           -- Default art by name, only for a row with a source and no image.
           case when m.source is not null and nullif(m.image_url, '') is null then d.image_url else m.image_url end as card_image_url,
           case when m.source is not null and nullif(m.image_url, '') is null and d.image_url is not null
                then d.image_focal_point else m.image_focal_point end as card_focal_point,
           case when m.is_shared then 'library'
                when m.campaign_id is null then 'general'
                when m.campaign_id = p_campaign_id then 'campaign'
                else 'other_campaign' end as scope
      from (select * from lib union all select * from own) m
      left join public.library_art_defaults d on d.content_type = 'item' and d.content_name = lower(m.name)
  ),
  filtered as (
    select f.* from merged f, pat
     where (p_type is null or f.item_type = p_type)
       and (p_rarity is null or f.rarity = p_rarity)
       and (p_source is null or f.source = p_source)
       and (p_scope is null or f.scope = p_scope)
       and (pat.p is null
            or f.name ilike pat.p
            or f.subtype ilike pat.p
            or exists (select 1 from unnest(f.tags) t where t ilike pat.p))
  ),
  page as (
    select * from filtered
     order by lower(name), name, origin, id
     limit greatest(p_limit, 0) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'item_type', item_type, 'rarity', rarity, 'tags', tags,
               'image_url', card_image_url, 'image_focal_point', card_focal_point,
               'damage_rolls', damage_rolls, 'armor_class', armor_class, 'charges', charges,
               'has_content', has_content, 'campaign_id', campaign_id, 'is_shared', is_shared)
             order by lower(name), name, origin, id)
        from page), '[]'::jsonb)
  ) || case when greatest(p_offset, 0) = 0 then jsonb_build_object(
    'total', (select count(*) from filtered),
    'selectable_ids', coalesce((select jsonb_agg(id order by id) from filtered where not is_shared), '[]'::jsonb),
    -- The Source filter's options: the books and sources of what the page can show.
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('slug', source, 'title', title) order by lower(coalesce(title, source)))
        from (select source, max(source_title) as title from merged where source is not null group by source) s
    ), '[]'::jsonb)
  ) else '{}'::jsonb end
$function$;

CREATE OR REPLACE FUNCTION public.browse_monsters(p_slugs text[], p_ruleset text, p_campaign_id uuid, p_search text DEFAULT NULL::text, p_source text DEFAULT 'all'::text, p_type text DEFAULT NULL::text, p_limit integer DEFAULT 48, p_offset integer DEFAULT 0, p_lock_count integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with
  pat as (select private.contains_pattern(p_search) as p),
  lib as (
    select lm.id, lm.name, lm.size, lm.monster_type, lm.habitat, lm.source, lm.source_title,
           true as is_shared, lm.tags,
           coalesce(own.image_url, can.image_url, lm.image_url) as image_url,
           coalesce(own.portrait_focal_point, can.portrait_focal_point, lm.portrait_focal_point) as portrait_focal_point,
           null::timestamptz as created_at,
           0 as origin,
           lm.id as lib_id, null::uuid as own_id
      from public.library_monsters lm
      left join public.library_monster_art_canonical can on can.entry_id = lm.id
      left join public.library_monster_art own on own.entry_id = lm.id and own.user_id = auth.uid()
     where lm.source = any (p_slugs) and lm.ruleset = p_ruleset
  ),
  own as (
    select m.id::text as id, m.name, m.size, m.monster_type, m.habitat, m.source, m.source_title,
           false as is_shared, m.tags, m.image_url, m.portrait_focal_point,
           m.created_at,
           1 as origin,
           null::text as lib_id, m.id as own_id
      from public.monsters m
     -- This campaign's rows whoever wrote them, the caller's library, and the
     -- owner's, which a co-DM reads (#590) and the monster views mark read-only.
     where not m.open5e_import
       and (m.ruleset is null or m.ruleset = p_ruleset)
       and (m.campaign_id = p_campaign_id
            or (m.campaign_id is null
                and (m.user_id = auth.uid()
                     or m.user_id = (select c.user_id from public.campaigns c where c.id = p_campaign_id))))
  ),
  scoped as (select * from lib union all select * from own),
  filtered as (
    select s.* from scoped s, pat
     where (coalesce(p_source, 'all') = 'all'
            or (p_source = 'custom' and not s.is_shared)
            or s.source = p_source)
       and (p_type is null or s.monster_type = p_type)
       and (pat.p is null
            or s.name ilike pat.p
            or s.monster_type ilike pat.p
            or s.habitat ilike pat.p
            or exists (select 1 from unnest(s.tags) t where t ilike pat.p))
  ),
  page as (
    select * from filtered
     order by lower(name), name, origin, id
     limit greatest(p_limit, 0) offset greatest(p_offset, 0)
  ),
  -- The stat summary is read for the page's rows only. `filtered` is used twice
  -- (the page and the totals), so it is materialised, and reading the stat
  -- block there unpacked it for every monster in scope on every page. Each row
  -- carries its key typed for its own table, so the join needs no cast.
  paged as (
    select p.*, coalesce(lm.stat_block, m.stat_block) as sb
      from page p
      left join public.library_monsters lm on lm.id = p.lib_id
      left join public.monsters m on m.id = p.own_id
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'size', size, 'monster_type', monster_type, 'habitat', habitat,
               'source', source, 'source_title', source_title, 'is_shared', is_shared, 'tags', tags,
               'image_url', image_url, 'portrait_focal_point', portrait_focal_point,
               'challenge_rating', sb -> 'challenge_rating', 'armor_class', sb -> 'armor_class',
               'hit_points', sb -> 'hit_points')
             order by lower(name), name, origin, id)
        from paged), '[]'::jsonb)
  ) || case when greatest(p_offset, 0) = 0 then jsonb_build_object(
    'total', (select count(*) from filtered),
    'scope_total', (select count(*) from scoped),
    'selectable_ids', coalesce((select jsonb_agg(id order by id) from filtered where not is_shared), '[]'::jsonb),
    -- The NEWEST own monsters beyond the quota, the ones MonsterList locked.
    'locked_ids', coalesce((
      select jsonb_agg(id) from (
        select id from own order by created_at desc, id limit greatest(p_lock_count, 0)
      ) l), '[]'::jsonb)
  ) else '{}'::jsonb end
$function$;
