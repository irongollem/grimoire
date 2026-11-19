-- #1228: a campaign's BYOK keys move off the campaign row into an owner-only table.
--
-- `campaigns_select` admits every member of a campaign, players included, and
-- the row was read whole (`select *`), so anyone at the table could read the
-- owner's encrypted OpenAI, Anthropic and Gemini keys. The write side was
-- guarded (private.guard_campaign_owner_columns); the read side was not.
--
-- A column revoke would have broken every `select *` on campaigns, so the keys
-- get a table of their own instead: one row per campaign, readable and writable
-- by the campaign's owner alone, and read by the generators with the service
-- role (supabase/functions/_shared/campaignKeys.ts). A co-DM never sees them;
-- a generation a co-DM starts still runs on them, server-side, as before.
--
-- The keys are the owner's own credentials, so an owner change empties the row
-- (whichever path changes `campaigns.user_id`), and the generators pin their
-- read to the current owner as well.

-- ── 1. The table ────────────────────────────────────────────────────────────

create table public.campaign_api_keys (
  campaign_id       uuid primary key references public.campaigns (id) on delete cascade,
  -- The campaign's owner, whose credentials these are. Kept on the row so the
  -- policies are the plain own-row form and the data export and erasure find
  -- it through the foreign key like any other row the account owns.
  user_id           uuid not null references auth.users (id) on delete cascade,
  openai_api_key    text,
  anthropic_api_key text,
  gemini_api_key    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index campaign_api_keys_user_id_idx on public.campaign_api_keys (user_id);

create trigger campaign_api_keys_updated_at
  before update on public.campaign_api_keys
  for each row execute procedure update_updated_at();

alter table public.campaign_api_keys enable row level security;

-- Own rows only, and a row may only be written for a campaign the writer owns:
-- `user_id` alone would let anyone file keys against someone else's campaign
-- (which a Pro generator would then refuse to use, but the row should never
-- exist). private.is_campaign_owner is total (`exists`), never NULL.
create policy "campaign_api_keys_select" on public.campaign_api_keys
  for select using ((select auth.uid()) = user_id);
create policy "campaign_api_keys_insert" on public.campaign_api_keys
  for insert with check ((select auth.uid()) = user_id and private.is_campaign_owner(campaign_id));
create policy "campaign_api_keys_update" on public.campaign_api_keys
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and private.is_campaign_owner(campaign_id));
create policy "campaign_api_keys_delete" on public.campaign_api_keys
  for delete using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.campaign_api_keys to authenticated, service_role;

-- ── 2. Existing keys move across ───────────────────────────────────────────
-- Before the Pro trigger exists: a key saved while its owner was Pro is kept
-- (the generators ignore it while the owner is not), exactly as the column
-- kept it.

insert into public.campaign_api_keys (campaign_id, user_id, openai_api_key, anthropic_api_key, gemini_api_key)
select id, user_id, openai_api_key, anthropic_api_key, gemini_api_key
  from public.campaigns
 where openai_api_key is not null
    or anthropic_api_key is not null
    or gemini_api_key is not null;

-- ── 3. BYOK stays Pro-only, now on the keys table ──────────────────────────

drop trigger campaigns_enforce_byok_pro on public.campaigns;

create or replace function public.enforce_byok_pro_only()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_setting_key boolean := false;
begin
  -- Detect whether this write SETS or CHANGES any key column to a non-null value.
  if tg_op = 'INSERT' then
    v_setting_key :=
      NEW.openai_api_key    is not null or
      NEW.anthropic_api_key is not null or
      NEW.gemini_api_key    is not null;
  else -- UPDATE
    v_setting_key :=
      (NEW.openai_api_key    is not null and NEW.openai_api_key    is distinct from OLD.openai_api_key)    or
      (NEW.anthropic_api_key is not null and NEW.anthropic_api_key is distinct from OLD.anthropic_api_key) or
      (NEW.gemini_api_key    is not null and NEW.gemini_api_key    is distinct from OLD.gemini_api_key);
  end if;

  if v_setting_key and not private.is_app_admin() and not is_user_pro(NEW.user_id) then
    raise exception 'BYOK API keys are a Pro feature'
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

create trigger campaign_api_keys_enforce_byok_pro
  before insert or update on public.campaign_api_keys
  for each row execute procedure public.enforce_byok_pro_only();

-- ── 4. An owner change empties the keys ─────────────────────────────────────
-- Definer: the change may be made by a function acting for the new owner, who
-- cannot see the outgoing owner's row through RLS.

create or replace function private.clear_campaign_api_keys_on_owner_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  delete from public.campaign_api_keys where campaign_id = new.id;
  return null;
end;
$$;

revoke execute on function private.clear_campaign_api_keys_on_owner_change() from public, anon, authenticated;

create trigger campaigns_clear_api_keys_on_owner_change
  after update of user_id on public.campaigns
  for each row
  when (new.user_id is distinct from old.user_id)
  execute procedure private.clear_campaign_api_keys_on_owner_change();

-- ── 5. Nothing reads the columns any more ──────────────────────────────────

create or replace function private.guard_campaign_owner_columns()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if (select auth.uid()) is null or old.user_id = (select auth.uid()) then
    return new;
  end if;
  -- spotify_client_id is not here: it is a public OAuth client id and travels
  -- with the campaign (#180). The AI keys are not on this row at all: they are
  -- in campaign_api_keys, whose policies admit the owner alone (#1228).
  if new.user_id           is distinct from old.user_id
     or new.text_provider     is distinct from old.text_provider
     or new.image_provider    is distinct from old.image_provider
     or new.ai_enabled        is distinct from old.ai_enabled
     or new.ical_token        is distinct from old.ical_token
     or new.is_archived       is distinct from old.is_archived
     or new.opening_quest_id  is distinct from old.opening_quest_id then
    raise exception 'Only the campaign''s owner can change that'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Ownership transfer: the keys are emptied by the trigger above, so the
-- campaign row update no longer names them. Otherwise as 20261029222021.

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

  -- scriptorium_documents: NPC handouts / stat-block sheets. A plain copy of the
  -- row plus its chapters (#1115) is a complete copy.
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
    -- (#1115) A document's text is its chapters: the copy takes them along.
    insert into public.scriptorium_chapters (document_id, position, title, content, word_count)
    select v_new, c.position, c.title, c.content, c.word_count
      from public.scriptorium_chapters c
     where c.document_id = r.id;
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

  -- World Web (#1084): a tie's ends follow the copies, either end, and so do kin links. Both ends move in one
  -- statement: world_links_normalize may reorder a symmetric link's ends, so a second statement could miss the other.
  update public.world_links
     set from_npc_id = coalesce((v_npcs->>from_npc_id::text)::uuid, from_npc_id),
         to_npc_id = coalesce((v_npcs->>to_npc_id::text)::uuid, to_npc_id)
   where campaign_id = p_campaign_id and (v_npcs ? from_npc_id::text or v_npcs ? to_npc_id::text);
  update public.kin_links
     set from_npc_id = coalesce((v_npcs->>from_npc_id::text)::uuid, from_npc_id),
         to_npc_id = coalesce((v_npcs->>to_npc_id::text)::uuid, to_npc_id)
   where campaign_id = p_campaign_id and (v_npcs ? from_npc_id::text or v_npcs ? to_npc_id::text);

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

  update public.world_links
     set from_item_id = coalesce((v_items->>from_item_id::text)::uuid, from_item_id),
         to_item_id = coalesce((v_items->>to_item_id::text)::uuid, to_item_id)
   where campaign_id = p_campaign_id and (v_items ? from_item_id::text or v_items ? to_item_id::text);

  update public.world_links
     set from_location_id = coalesce((v_locations->>from_location_id::text)::uuid, from_location_id),
         to_location_id = coalesce((v_locations->>to_location_id::text)::uuid, to_location_id)
   where campaign_id = p_campaign_id and (v_locations ? from_location_id::text or v_locations ? to_location_id::text);

  update public.faction_npcs fn
     set npc_id = (v_npcs->>fn.npc_id::text)::uuid
    from public.factions f
   where f.id = fn.faction_id
     and f.campaign_id = p_campaign_id
     and v_npcs ? fn.npc_id::text;

  update public.world_links
     set from_faction_id = coalesce((v_factions->>from_faction_id::text)::uuid, from_faction_id),
         to_faction_id = coalesce((v_factions->>to_faction_id::text)::uuid, to_faction_id)
   where campaign_id = p_campaign_id and (v_factions ? from_faction_id::text or v_factions ? to_faction_id::text);

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
  -- BYOK credentials belong to the outgoing DM and are never handed over: they
  -- live in campaign_api_keys (#1228), which the owner change below empties
  -- (private.clear_campaign_api_keys_on_owner_change). spotify_client_id stays:
  -- it is a public OAuth client id and #180 wants the campaign's Spotify setup
  -- to travel with it.
  update public.campaigns
     set user_id = p_new_owner_id
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

-- The demo copy: the template's campaign row no longer carries the author's
-- keys, so the copy no longer blanks them. Otherwise as 20261026232619.

CREATE OR REPLACE FUNCTION private.copy_demo_template(p_template uuid, p_owner uuid, p_version text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  c_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_template_owner uuid;
  v_new_campaign   uuid := gen_random_uuid();
  v_campaign       jsonb;
  v_location       jsonb;
  v_bad            text;
  v_count          bigint;
  v_cols           text;
  v_ins            text;
  v_sel            text;
  v_progress       boolean;
  r                record;
  m                record;
begin
  select user_id into v_template_owner from public.campaigns where id = p_template;
  if v_template_owner is null then
    raise exception 'The demo template does not exist';
  end if;

  perform set_config('grimoire.bypass_quota', 'on', true);
  perform set_config('grimoire.copying_campaign', 'on', true);

  drop table if exists pg_temp.demo_rows;
  drop table if exists pg_temp.demo_map;
  create temp table demo_rows (
    seq      bigserial primary key,
    tbl      text not null,
    old_id   uuid,
    new_id   uuid,
    data     jsonb not null,
    deferred jsonb not null default '{}',
    done     boolean not null default false,
    err      text
  ) on commit drop;
  create temp table demo_map (old_id uuid primary key, new_id uuid not null) on commit drop;

  -- 1. Collect. Tier 1 by campaign, then tier 2 through its parent.
  for r in
    select d.table_name,
           exists (select 1 from pg_attribute a
                    where a.attrelid = format('public.%I', d.table_name)::regclass
                      and a.attname = 'id' and a.atttypid = 'uuid'::regtype
                      and not a.attisdropped) as has_id
      from private.demo_campaign_tables d
     where d.tier = 1 and d.copy
     order by d.table_name
  loop
    execute format(
      'insert into pg_temp.demo_rows (tbl, old_id, data) select %L, %s, to_jsonb(x) from public.%I x where x.campaign_id = $1',
      r.table_name, case when r.has_id then 'x.id' else 'null::uuid' end, r.table_name
    ) using p_template;
  end loop;

  insert into pg_temp.demo_map (old_id, new_id)
  select old_id, gen_random_uuid() from pg_temp.demo_rows where old_id is not null;

  for r in
    select d.table_name, d.parent_column,
           exists (select 1 from pg_attribute a
                    where a.attrelid = format('public.%I', d.table_name)::regclass
                      and a.attname = 'id' and a.atttypid = 'uuid'::regtype
                      and not a.attisdropped) as has_id
      from private.demo_campaign_tables d
     where d.tier = 2 and d.copy and not private.is_demo_embedding_table(d.table_name)
     order by d.table_name
  loop
    execute format(
      'insert into pg_temp.demo_rows (tbl, old_id, data) select %L, %s, to_jsonb(x) from public.%I x where x.%I in (select old_id from pg_temp.demo_map)',
      r.table_name, case when r.has_id then 'x.id' else 'null::uuid' end, r.table_name, r.parent_column
    );
  end loop;

  insert into pg_temp.demo_map (old_id, new_id)
  select old_id, gen_random_uuid() from pg_temp.demo_rows where old_id is not null
  on conflict (old_id) do nothing;

  insert into pg_temp.demo_map (old_id, new_id) values (p_template, v_new_campaign), (v_template_owner, p_owner)
  on conflict (old_id) do nothing;

  select to_jsonb(c) into v_campaign from public.campaigns c where c.id = p_template;

  -- 2. Validate. The template becomes readable by every user who loads it, so
  --    it must not carry anyone else's identity or point into the author's
  --    other content. Both checks fail loudly, and publish_demo_version() runs
  --    this copy as a dry run, so a bad template is refused at publish time
  --    rather than discovered by the next new user.
  select count(*) into v_count
    from (select data from pg_temp.demo_rows union all select v_campaign) d
   cross join lateral regexp_matches(d.data::text, c_uuid, 'g') x
    join auth.users u on u.id = x[1]::uuid
   where not exists (select 1 from pg_temp.demo_map mm where mm.old_id = u.id);
  if v_count > 0 then
    raise exception 'The demo template references another account; remove its players and invites first';
  end if;

  -- A reference into a table the demo copies must be to a row the demo copies.
  select string_agg(distinct d.tbl || '.' || a.attname, ', ') into v_bad
    from pg_temp.demo_rows d
    join pg_class cl on cl.relname = d.tbl and cl.relnamespace = 'public'::regnamespace
    join pg_constraint con on con.conrelid = cl.oid and con.contype = 'f'
    join pg_class ref on ref.oid = con.confrelid and ref.relnamespace = 'public'::regnamespace
    join pg_attribute a on a.attrelid = cl.oid and a.attnum = any (con.conkey) and a.atttypid = 'uuid'::regtype
   where (ref.relname = 'campaigns'
          or ref.relname in (select table_name from private.demo_campaign_tables where copy))
     and d.data ->> a.attname is not null
     and not exists (select 1 from pg_temp.demo_map mm where mm.old_id = (d.data ->> a.attname)::uuid);
  if v_bad is not null then
    raise exception 'The demo template points at rows outside itself (%)', v_bad;
  end if;

  -- And a reference to a user-owned table the demo does not copy (a Scriptorium
  -- document, a tile pack) would hand the loader an id they cannot read.
  for r in
    select distinct cl.relname as tbl, a.attname as col, ref.relname as ref_tbl
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid and cl.relnamespace = 'public'::regnamespace
      join pg_class ref on ref.oid = con.confrelid and ref.relnamespace = 'public'::regnamespace
      join pg_attribute a on a.attrelid = cl.oid and a.attnum = any (con.conkey) and a.atttypid = 'uuid'::regtype
     where con.contype = 'f'
       and cl.relname in (select table_name from private.demo_campaign_tables where copy)
       and ref.relname <> 'campaigns'
       and ref.relname not in (select table_name from private.demo_campaign_tables where copy)
       and exists (select 1 from pg_attribute ua
                    where ua.attrelid = ref.oid and ua.attname = 'user_id' and not ua.attisdropped)
  loop
    execute format(
      'select count(*) from pg_temp.demo_rows d join public.%I t on t.id = (d.data ->> %L)::uuid where d.tbl = %L and t.user_id is not null',
      r.ref_tbl, r.col, r.tbl
    ) into v_count;
    if v_count > 0 then
      raise exception 'The demo template points at its author''s own content outside the campaign (%.%)', r.tbl, r.col;
    end if;
  end loop;

  -- 3. Remap every copied row, and the campaign row, through the id map.
  update pg_temp.demo_rows d set new_id = mm.new_id
    from pg_temp.demo_map mm where mm.old_id = d.old_id;

  for r in select seq, data from pg_temp.demo_rows loop
    update pg_temp.demo_rows
       set data = private.remap_demo_ids(r.data::text, v_template_owner)::jsonb
     where seq = r.seq;
  end loop;

  v_campaign := private.remap_demo_ids(v_campaign::text, v_template_owner)::jsonb;
  v_location := v_campaign -> 'current_location_id';

  -- Stamp provenance, restart the clocks, and set the cycle-breaking columns
  -- aside to restore once every row exists.
  update pg_temp.demo_rows d
     set data = d.data
                || case when d.data ? 'demo_source' then jsonb_build_object('demo_source', p_version) else '{}'::jsonb end
                || case when d.data ? 'created_at' then jsonb_build_object('created_at', now()) else '{}'::jsonb end
                || case when d.data ? 'updated_at' then jsonb_build_object('updated_at', now()) else '{}'::jsonb end
   -- Every row, but a WHERE is still required: PostgREST sessions load
   -- pg_safeupdate, which rejects an UPDATE without one -- even on a temp table.
   where d.seq is not null;

  update pg_temp.demo_rows d
     set deferred = (select coalesce(jsonb_object_agg(col, d.data -> col), '{}'::jsonb)
                       from unnest(t.defer_columns) col
                      where d.data ->> col is not null),
         data = d.data || (select coalesce(jsonb_object_agg(col, null), '{}'::jsonb)
                             from unnest(t.defer_columns) col
                            where d.data ->> col is not null)
    from private.demo_campaign_tables t
   where t.table_name = d.tbl and cardinality(t.defer_columns) > 0;

  -- 4. The campaign row. Built from the template, minus everything that is the
  --    author's rather than the campaign's: the Spotify client, the
  --    iCal feed token (a capability URL), the template flags, and the AI
  --    choice (the author's BYOK keys are in campaign_api_keys, which is never
  --    copied). `ai_enabled` is the owner's consent under the AI Act (see
  --    context/compliance/ai-act.md §4) -- only the owner may give it, so the
  --    copy starts unchosen and asks its new owner, whatever the author picked.
  --    The provider selection goes with it. AI provenance on the content itself
  --    is copied verbatim: that marks what the content is, not who consented.
  v_campaign := v_campaign || jsonb_build_object(
    'id', v_new_campaign,
    'user_id', p_owner,
    'demo_template', false,
    'demo_version', null,
    'demo_source', p_version,
    'is_archived', false,
    'ical_token', gen_random_uuid(),
    'spotify_client_id', null,
    'ai_enabled', null,
    'text_provider', null,
    'image_provider', null,
    'current_location_id', null,
    'created_at', now(),
    'updated_at', now()
  );
  insert into public.campaigns
  select * from jsonb_populate_record(null::public.campaigns, v_campaign);

  -- The campaigns insert trigger enables the default sources; the template's
  -- own set is copied below instead.
  delete from public.campaign_enabled_sources where campaign_id = v_new_campaign;

  -- 5. Insert in passes until every row lands.
  loop
    v_progress := false;
    for r in
      select d.tbl,
             exists (select 1 from pg_constraint con
                      where con.contype = 'f'
                        and con.conrelid = format('public.%I', d.tbl)::regclass
                        and con.confrelid = con.conrelid) as self_ref
        from pg_temp.demo_rows d
       where not d.done
       group by d.tbl
       order by d.tbl
    loop
      -- The columns a row may be written with: never a generated column (world_links' from_id/to_id) or an identity
      -- column the table generates itself. `select x.*` wrote them too, and Postgres refuses that.
      select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
             string_agg('x.' || quote_ident(a.attname), ', ' order by a.attnum)
        into v_ins, v_sel
        from pg_attribute a
       where a.attrelid = format('public.%I', r.tbl)::regclass and a.attnum > 0 and not a.attisdropped
         and a.attgenerated = '' and a.attidentity <> 'a';
      begin
        execute format(
          'insert into public.%I (%s) select %s from pg_temp.demo_rows d cross join lateral jsonb_populate_record(null::public.%I, d.data) x where d.tbl = %L and not d.done',
          r.tbl, v_ins, v_sel, r.tbl, r.tbl
        );
        update pg_temp.demo_rows set done = true, err = null where tbl = r.tbl and not done;
        v_progress := true;
      exception when others then
        update pg_temp.demo_rows set err = sqlerrm where tbl = r.tbl and not done;
        -- A table that references itself cannot go in one statement when a
        -- child precedes its parent; take it a row at a time.
        if r.self_ref then
          for m in select seq, data from pg_temp.demo_rows where tbl = r.tbl and not done order by seq loop
            begin
              execute format(
                'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) x',
                r.tbl, v_ins, v_sel, r.tbl
              ) using m.data;
              update pg_temp.demo_rows set done = true, err = null where seq = m.seq;
              v_progress := true;
            exception when others then
              update pg_temp.demo_rows set err = sqlerrm where seq = m.seq;
            end;
          end loop;
        end if;
      end;
    end loop;

    exit when not exists (select 1 from pg_temp.demo_rows where not done);

    if not v_progress then
      raise exception 'The demo template could not be copied: %',
        (select string_agg(distinct tbl || ': ' || err, '; ') from pg_temp.demo_rows where not done);
    end if;
  end loop;

  -- 6. Restore the deferred references.
  for r in select tbl, new_id, deferred from pg_temp.demo_rows where deferred <> '{}'::jsonb loop
    select string_agg(format('%I = src.%I', k, k), ', ') into v_cols
      from jsonb_object_keys(r.deferred) k;
    execute format(
      'update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) src where t.id = $2',
      r.tbl, v_cols, r.tbl
    ) using r.deferred, r.new_id;
  end loop;

  -- 7. The embeddings, table to table. They hold nothing to remap but their
  --    parent's id, and routing 1,536-float vectors through jsonb and the text
  --    remap above was most of the copy's time: 7 to 14 seconds against the
  --    8-second statement timeout every logged-in request runs under (#917).
  for r in
    select d.table_name, d.parent_column
      from private.demo_campaign_tables d
     where d.tier = 2 and d.copy and private.is_demo_embedding_table(d.table_name)
     order by d.table_name
  loop
    execute format(
      'insert into public.%1$I (%2$I, embedding, embedding_model, source_hash) '
      'select mm.new_id, e.embedding, e.embedding_model, e.source_hash '
      'from public.%1$I e join pg_temp.demo_map mm on mm.old_id = e.%2$I',
      r.table_name, r.parent_column
    );
  end loop;

  -- 8. The Open Book (#1085), when the template has one: its settings and the author's per-entry choices, so a
  --    new user can open a book that is already laid out. Never its releases, and never public: the copy starts
  --    closed, with no release, unindexed, under an address of its own (the template's is unique and is the
  --    author's). Releasing it is the new owner's act. An entry choice about a row the copy left out is dropped.
  insert into public.open_books (campaign_id, slug, title, subtitle, cover_art, cover_image_url, leather, chapters,
                                 include_shared, allow_pdf, indexable, is_open, live_release_id)
  select v_new_campaign,
         'demo-' || left(replace(v_new_campaign::text, '-', ''), 12),
         b.title, b.subtitle, b.cover_art, b.cover_image_url, b.leather, b.chapters,
         b.include_shared, b.allow_pdf, false, false, null
    from public.open_books b
   where b.campaign_id = p_template;

  insert into public.open_book_entries (campaign_id, entity_type, entity_id, included)
  select v_new_campaign, e.entity_type, mm.new_id, e.included
    from public.open_book_entries e
    join pg_temp.demo_map mm on mm.old_id = e.entity_id
   where e.campaign_id = p_template
     and exists (select 1 from public.open_books b where b.campaign_id = v_new_campaign);

  if v_location is not null and v_location <> 'null'::jsonb then
    update public.campaigns set current_location_id = (v_location #>> '{}')::uuid where id = v_new_campaign;
  end if;

  perform set_config('grimoire.copying_campaign', 'off', true);
  perform set_config('grimoire.bypass_quota', 'off', true);

  return v_new_campaign;
end;
$function$;

-- The demo copy starts with no keys: they are the template author's own.
insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('campaign_api_keys', 1, false, 'the template author''s own BYOK credentials');

-- ── 6. The columns go ───────────────────────────────────────────────────────

alter table public.campaigns
  drop column openai_api_key,
  drop column anthropic_api_key,
  drop column gemini_api_key;
