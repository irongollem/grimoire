-- A beat stages at a place. Story #797, epic #780 — the Phase 3 join.
--
-- A beat is an event, and an event happens somewhere. Until now that "somewhere"
-- was a `location_set` attachment: a *list*, carrying an unenforceable
-- `metadata.room_ids` array beside it. Both go here, and the epic's Phase 1
-- warning is why this arrives by deletion rather than by extension — wiring the
-- new site onto `location_set` would have built Phase 1 on the seam it exists to
-- remove.
--
-- ── What production actually holds, because it decided the shape ────────────
--
-- Ten `location_set` rows across six beats. Nine of them were created at the
-- identical microsecond, 0.42s after every beat was created at *its* identical
-- microsecond: `backfill_quest_story_flows` writing the overview beats' location
-- lists. Machine-made, not authored.
--
-- Exactly ONE was written by a person: "Found an Elven Tomb" -> Moon temple, a
-- dungeon, attached 140 seconds after its beat. One beat, one place, and the
-- place is a site. That single authored row is the whole specification.
--
-- The apparent counter-evidence — three beats holding two or three places each —
-- is entirely the synthetic set, and every one of those beats is a former
-- `— overview` beat that #793 converted to an ordinary `neutral` beat. An
-- overview beat represented a whole quest, so of course it accumulated every
-- location the quest touched. Nothing authored is plural.
--
-- Hence a COLUMN, singular, and not a narrower `location_set`.
--
-- ── Why the column is not restricted to sites ───────────────────────────────
--
-- The story is titled "a beat stages at a site", but the ten rows point at
-- dungeons, buildings and a store (sites) *and* at two towns and a lake, which
-- have no rooms and no runnable surface. A site-only constraint would reject
-- places a DM legitimately stages at. So the column takes any location, and
-- being a *site* is what unlocks the run surface — a capability of the place,
-- not a precondition for naming it. `bindableSpaces()` already draws that line.

alter table public.quest_beats
  add column if not exists staged_at_location_id uuid
    references public.locations (id) on delete set null;

comment on column public.quest_beats.staged_at_location_id is
  'Where this beat happens. Singular: a beat is one event in one place; a scene '
  'spanning two places is two beats. Any location qualifies — if it is a site '
  'with a floor plan the run cockpit offers the site runner, but staging at a '
  'town or a lake is equally valid. Replaced the location_set attachment (#797).';

create index if not exists quest_beats_staged_at_location_id_idx
  on public.quest_beats (staged_at_location_id)
  where staged_at_location_id is not null;

-- ── The place must be reachable from the beat's campaign ────────────────────
--
-- A foreign key proves the location exists, not that this campaign may see it.
-- The attachment validator carried that rule; the column needs it too, and a
-- CHECK cannot hold a subquery. Same predicate as every other arm of
-- `private.validate_quest_beat_attachment`: campaign-scoped, or personal content
-- belonging to the writer or to the campaign's owner.
--
-- The owner arm is what lets the backfill below pass: it runs as `postgres`,
-- where `auth.uid()` is NULL.

create or replace function private.guard_beat_staging()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'private'
as $$
begin
  if new.staged_at_location_id is null then
    return new;
  end if;

  if not exists (
    select 1 from public.locations l
     where l.id = new.staged_at_location_id
       and (
         l.campaign_id = new.campaign_id
         or (l.campaign_id is null and (
              l.user_id = auth.uid()
              or l.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id)
            ))
       )
  ) then
    raise exception 'Cannot stage a beat at location % — not reachable from campaign %',
      new.staged_at_location_id, new.campaign_id
      using errcode = '23514';
  end if;

  return new;
end $$;

-- Trigger functions are never called through PostgREST, and the trigger system
-- bypasses the EXECUTE check, so this keeps it off the RPC surface entirely.
revoke execute on function private.guard_beat_staging() from public, anon, authenticated;

drop trigger if exists quest_beats_staging_scope on public.quest_beats;
create trigger quest_beats_staging_scope
  before insert or update of staged_at_location_id on public.quest_beats
  for each row execute procedure private.guard_beat_staging();

-- ── Carry the authored staging across ───────────────────────────────────────
--
-- Only where a beat has exactly one place. A beat holding several is ambiguous
-- by construction and every such beat is a former overview beat whose list the
-- backfill wrote, so "exactly one" loses nothing a person chose. Stated as a
-- rule rather than as a hardcoded timestamp, so it stays correct for any other
-- account's data.

do $$
declare
  v_moved   integer;
  v_dropped integer;
begin
  with singular as (
    -- array_agg rather than min(): Postgres has no min(uuid) aggregate before 18,
    -- and the HAVING below guarantees the group holds exactly one row anyway, so
    -- "the first element" is "the only element".
    select a.beat_id, (array_agg(a.ref_id))[1]::uuid as location_id
      from public.quest_beat_attachments a
     where a.attachment_type = 'location_set'
     group by a.beat_id
    having count(*) = 1
  )
  update public.quest_beats b
     set staged_at_location_id = s.location_id
    from singular s
   where b.id = s.beat_id
     and b.staged_at_location_id is null;
  get diagnostics v_moved = row_count;

  select count(*) into v_dropped
    from public.quest_beat_attachments
   where attachment_type = 'location_set';

  raise notice 'staging backfill: % beat(s) staged, % location_set row(s) removed', v_moved, v_dropped - v_moved;
end $$;

delete from public.quest_beat_attachments where attachment_type = 'location_set';

-- ── One writer per fact: the old home stops accepting writes ────────────────

alter table public.quest_beat_attachments
  drop constraint if exists quest_beat_attachments_attachment_type_check;

alter table public.quest_beat_attachments
  add constraint quest_beat_attachments_attachment_type_check
  check (attachment_type in (
    'encounter', 'quest_ref', 'npc', 'faction', 'item',
    'monster', 'sound', 'audio_scene', 'playlist', 'note', 'handout'
  ));

-- The validator knew the type too, and #792 already taught us that removing a
-- type from the client and the CHECK while leaving the branch in the function
-- is a half-deletion. Rebuilt from the body #793 left, with the `location_set`
-- arm — and the `metadata.room_ids` validation that only ever existed to serve
-- it — gone. `room_ids` had zero rows in production across every attachment
-- type: an unenforceable id list nobody ever filled in.

CREATE OR REPLACE FUNCTION private.validate_quest_beat_attachment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_valid boolean := false;
begin
  -- An `else` arm on purpose. Without one, an attachment_type the CHECK no
  -- longer admits — an old browser tab posting a type this epic deleted — fails
  -- with CASE_NOT_FOUND (SQLSTATE 20000), which PostgREST has no 4xx mapping
  -- for and returns as a 500. Fail closed either way, but say so in a class the
  -- client can read.
  case new.attachment_type
    when 'encounter' then
      select exists(select 1 from encounters e where e.id = new.ref_id::uuid and e.campaign_id = new.campaign_id) into v_valid;
    when 'quest_ref' then
      select exists(select 1 from quest_refs r where r.id = new.ref_id::uuid and r.quest_id = new.quest_id) into v_valid;
    when 'npc' then
      select exists(select 1 from npcs n where n.id = new.ref_id::uuid and (n.campaign_id = new.campaign_id or (n.campaign_id is null and (n.user_id = auth.uid() or n.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
    when 'faction' then
      select exists(select 1 from factions f where f.id = new.ref_id::uuid and (f.campaign_id = new.campaign_id or (f.campaign_id is null and (f.user_id = auth.uid() or f.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
    when 'item' then
      select exists(select 1 from items i where i.id = new.ref_id::uuid and (i.campaign_id = new.campaign_id or (i.campaign_id is null and (i.user_id = auth.uid() or i.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
    when 'monster' then
      select exists(select 1 from monsters m where m.id = new.ref_id::uuid and (m.campaign_id = new.campaign_id or (m.campaign_id is null and (m.user_id = auth.uid() or m.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
    when 'sound' then
      select exists(select 1 from sounds s where s.id = new.ref_id::uuid and s.campaign_id = new.campaign_id) into v_valid;
    when 'audio_scene' then
      select exists(select 1 from soundboard_playlists p where p.id = new.ref_id::uuid and p.campaign_id = new.campaign_id and p.playlist_type = 'ambient') into v_valid;
    when 'playlist' then
      select exists(select 1 from soundboard_playlists p where p.id = new.ref_id::uuid and p.campaign_id = new.campaign_id and p.playlist_type = 'music') into v_valid;
    when 'note' then
      select exists(select 1 from notes n where n.id = new.ref_id::uuid and n.campaign_id = new.campaign_id) into v_valid;
    when 'handout' then
      select exists(select 1 from scriptorium_documents d where d.id = new.ref_id::uuid and (d.user_id = auth.uid() or d.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))) into v_valid;
    else
      v_valid := false;
  end case;

  if not v_valid then
    raise exception 'Invalid % attachment % for quest % in campaign %',
      new.attachment_type, new.ref_id, new.quest_id, new.campaign_id
      using errcode = '23514';
  end if;
  return new;
exception when invalid_text_representation then
  raise exception 'Attachment reference must be a valid UUID for type %', new.attachment_type
    using errcode = '23514';
end;
$function$;


-- The format CHECK that guarded the room id array outlives the array itself.
-- Nothing writes `metadata->'room_ids'` any more, so this constrains a key that
-- can no longer exist: dead weight that reads like a live rule to the next
-- person who greps for it. It widens nothing either way, which is exactly why
-- it would have survived indefinitely.

alter table public.quest_beat_attachments
  drop constraint if exists quest_beat_attachments_location_rooms_array;

-- ── Campaign transfer has to follow the place too ───────────────────────────
--
-- `transfer_campaign_ownership` clones the outgoing DM's global locations for
-- the new owner and repoints everything that referenced them. Two of its arms
-- chased the old attachment and its room id array; with staging on a column
-- those collapse into one predicate and one uuid swap. Left unpatched, a
-- transferred beat would keep pointing at the previous owner's location — a
-- cross-account reference, and precisely the residue this epic exists to stop
-- shipping.
--
-- Rebuilt from the live body rather than from the migration that created it,
-- and addressed by signature: the bare name has two overloads, and
-- pg_get_functiondef on a name concatenates them into something unparseable.

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

  -- backgrounds: character sheets resolve their origin features through this FK.
  for r in
    select b.*
    from public.backgrounds b
    where b.user_id = v_owner
      and b.id in (
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
     set background_id = (v_bgs->>background_id::text)::uuid
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
  update public.calendar_events         set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.class_feature_options   set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.class_features          set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.class_option_texts      set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.companions              set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.crafting_recipes        set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.custom_classes          set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.custom_subclasses       set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.deities                 set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.encounter_state         set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.encounters              set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.faction_deities         set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.factions                set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.items                   set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.locations               set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.loot_tables             set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.notes                   set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.npc_inventory           set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.npc_pc_notes            set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.npc_relationships       set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.npc_sets                set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.npcs                    set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.pantheons               set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.party_inventory         set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.party_members           set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.puzzle_rooms            set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.quests                  set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.roll_tables             set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.rules                   set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.session_proposals       set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.soundboard_broadcast    set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.soundboard_pages        set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.soundboard_playlists    set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.sounds                  set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.species                 set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.spells                  set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;

  -- FK children that carry a user_id but no campaign_id -- reachable only through
  -- a campaign parent, so they are scoped by that parent's campaign_id.
  update public.faction_items f set user_id = p_new_owner_id
   where f.user_id = v_owner
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);

  update public.faction_locations f set user_id = p_new_owner_id
   where f.user_id = v_owner
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);

  update public.faction_npcs f set user_id = p_new_owner_id
   where f.user_id = v_owner
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);

  update public.faction_party_members f set user_id = p_new_owner_id
   where f.user_id = v_owner
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);

  update public.faction_relations f set user_id = p_new_owner_id
   where f.user_id = v_owner
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);

  update public.store_items si set user_id = p_new_owner_id
   where si.user_id = v_owner
     and exists (select 1 from public.locations l where l.id = si.location_id and l.campaign_id = p_campaign_id);

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
$function$
