-- Migration: transfer_quest_referenced_entities
-- Follow-up to #630 (20260814003041, transfer_quest_referenced_monsters_and_
-- reassign) and #733. #630 closed the reachability gap for MONSTERS
-- referenced from quests -- via quest_refs (ref_type 'monster') and
-- quest_beat_attachments (attachment_type 'monster') -- by cloning them into
-- the new owner's library and repointing both reference tables at the clones.
-- The same reference shape exists for four more kinds, and none of them
-- travelled: items, npcs, factions and locations, plus scriptorium_documents
-- (handouts) attached directly to a quest beat. After a transfer the new
-- owner's quests/beats pointed at rows RLS hides from them (or, for
-- handouts, always did -- scriptorium_documents is a personal-library table
-- with no campaign_id at all).
--
-- The rule carried over unchanged from #630 and restated in campaign
-- ownership transfer's own design conversation: campaign-SCOPED rows
-- (campaign_id = the transferring campaign) of items/npcs/factions/locations
-- already MOVE with the campaign in step 3 below, ids intact, so quest
-- references to those need nothing. The gap is only the outgoing DM's GLOBAL
-- rows (campaign_id is null, user_id = old owner) that quest content points
-- at, plus quest-beat handouts. Those get CLONED for the recipient and the
-- references REPOINTED; the originals stay with the old owner, untouched,
-- and there is no new user-facing disposition for them (unlike monsters/
-- traps, which get an explicit promote/reassign/delete choice).
--
-- WHAT THIS MIGRATION DOES
--
--   1. public.transfer_campaign_ownership(uuid, uuid, boolean) is re-created,
--      transcribed verbatim from 20260814003041 (the authoritative source of
--      this function's body), with four new clone loops (items, npcs,
--      factions, locations), second-order remaps for links a clone can carry
--      (npc -> monster/doc, location -> location), new FK-column repoints
--      for the campaign's own content, and step 6 extended to repoint
--      quest_refs and quest_beat_attachments for every synced ref kind, not
--      only 'monster'.
--   2. private.campaign_referenced_monster_ids gains one more union: the
--      linked_monster_id of a quest-referenced GLOBAL npc that is about to be
--      cloned, so that npc's monster link resolves for the new owner too.
--   3. private.validate_quest_beat_attachment is patched (patch-by-replace,
--      same do-block pattern as 20260814003041's monster-arm patch) so its
--      item/npc/faction/location_set/handout arms each accept a global clone
--      owned by the campaign's CURRENT owner, not only by auth.uid() -- the
--      same reason the monster arm needed it: step 6 repoints ref_id while
--      auth.uid() is still the OUTGOING owner but the clone belongs to the
--      INCOMING owner.
--
-- Both #630 ordering constraints are load-bearing here too, for every synced
-- type now (encounter, npc, faction, location_set, item, monster): quest_refs
-- must repoint before quest_beat_attachments (the attachment update's AFTER
-- trigger mirrors into quest_refs, and repointing quest_refs first turns that
-- insert into a harmless ON CONFLICT no-op instead of leaving an old+new
-- duplicate pair), and both must run AFTER the campaigns.user_id flip (the
-- patched validator arms check the CURRENT campaign owner, not the caller).


-- ── 1. Extend the monster reachability helper with an npc-linked union ─────
-- Body transcribed verbatim from 20260814003041, plus one new union arm.
-- `language sql stable` functions have no plpgsql variables, so this helper
-- takes only p_campaign_id and cannot see v_owner the way the base transfer
-- function's plpgsql body can -- the owning DM is re-derived with a join to
-- campaigns, same as every other identity check in this codebase.
create or replace function private.campaign_referenced_monster_ids(p_campaign_id uuid)
returns setof uuid
language sql
stable
set search_path to 'public'
as $$
  select n.linked_monster_id from public.npcs n
    where n.campaign_id = p_campaign_id and n.linked_monster_id is not null
  union
  select dm.monster_id from public.discovered_monsters dm
    where dm.campaign_id = p_campaign_id and dm.monster_id is not null
  union
  select pf.monster_id from public.pinned_forms pf
    where pf.campaign_id = p_campaign_id and pf.monster_id is not null
  union
  -- Free-form text field: holds a `monsters.id` for homebrew but a shared SRD
  -- key ("srd_dire_wolf") for SRD stat blocks. Only well-formed uuids are
  -- candidates; casting unfiltered raises `invalid input syntax for type uuid`.
  select c.source_monster_id::uuid from public.companions c
    where c.campaign_id = p_campaign_id
      and c.source_monster_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union
  select (comb->>'monster_id')::uuid
    from public.encounters e,
         lateral jsonb_array_elements(coalesce(e.combatants, '[]'::jsonb)) comb
    where e.campaign_id = p_campaign_id
      and comb->>'monster_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union
  select (spawn->>'monster_id')::uuid
    from public.encounters e,
         lateral jsonb_array_elements(coalesce(e.events, '[]'::jsonb)) ev,
         lateral jsonb_array_elements(coalesce(ev->'actions', '[]'::jsonb)) act,
         lateral jsonb_array_elements(coalesce(act->'spawns', '[]'::jsonb)) spawn
    where e.campaign_id = p_campaign_id
      and spawn->>'monster_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union
  select (pm.wildshape_state->>'monster_id')::uuid
    from public.party_members pm
    where pm.campaign_id = p_campaign_id
      and pm.wildshape_state->>'monster_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union
  select x.mid
    from public.campaigns c,
         lateral unnest(c.excluded_monster_ids) x(mid)
    where c.id = p_campaign_id
  union
  -- (#630) quest_refs: ref_id is text (uuid string for homebrew, srd_* slug
  -- for shared library rows), so the same regex guard applies.
  select qr.ref_id::uuid
    from public.quest_refs qr
    join public.quests q on q.id = qr.quest_id
    where q.campaign_id = p_campaign_id
      and qr.ref_type = 'monster'
      and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union
  -- (#630) quest_beat_attachments: attachment_type 'monster' means ref_id is
  -- a monsters.id uuid string; campaign_id lives directly on the row.
  select qba.ref_id::uuid
    from public.quest_beat_attachments qba
    where qba.campaign_id = p_campaign_id
      and qba.attachment_type = 'monster'
      and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union
  -- (#733) A quest-referenced GLOBAL npc is cloned by the base transfer
  -- function's npc loop below. If that npc carries a linked_monster_id, the
  -- monster must be cloned too so the npc clone's stat-block link resolves
  -- for the new owner -- otherwise the clone points at a monster row RLS
  -- hides from them, exactly the bug this migration exists to close.
  select n.linked_monster_id
    from public.npcs n
    join public.campaigns c on c.id = p_campaign_id
    where n.campaign_id is null
      and n.user_id = c.user_id
      and n.linked_monster_id is not null
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
$$;

comment on function private.campaign_referenced_monster_ids(uuid) is
  'Single reachability definition for monsters a campaign''s content actually points at. Shared by transfer_campaign_ownership (clone set) and its scoped-copy wrapper (exclusion set) so the two cannot drift the way their inline copies already had -- see 20260814003041. #733 added the linked_monster_id of quest-referenced GLOBAL npcs, since those npcs are now cloned too.';

revoke all on function private.campaign_referenced_monster_ids(uuid) from public;
grant execute on function private.campaign_referenced_monster_ids(uuid) to anon, authenticated, service_role;


-- ── 2. Base transfer function: every kind cloned, every ref repointed ──────
-- Transcribed verbatim from 20260814003041 (itself transcribed from
-- 20260731000001 as last restated by 20260809145858), with these additions:
-- four new declare-block maps (v_items, v_npcs, v_factions, v_locations);
-- four new clone loops after the existing four; a second-order remap block
-- for links a fresh clone can itself carry (npc -> monster/doc, location ->
-- location); new FK-column repoints for the campaign's own content that may
-- point at a clone; an npc-substitution pass alongside the existing
-- monster-substitution pass over encounters.combatants; and step 6 extended
-- to repoint quest_refs / quest_beat_attachments for every synced ref kind.
create or replace function public.transfer_campaign_ownership(
  p_campaign_id uuid,
  p_new_owner_id uuid,
  p_leave_campaign boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
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

  -- (#733) locations: referenced by quest_refs ('location') and
  -- quest_beat_attachments ('location_set'), whose ref_id is the set's parent
  -- location and whose metadata->'room_ids' array may list further global
  -- locations (rooms). A cloned location's own parent_id / source_map_id are
  -- handled in the second-order block below.
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
          select 1 from public.quest_beat_attachments qba
          where qba.campaign_id = p_campaign_id
            and qba.attachment_type = 'location_set'
            and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qba.ref_id::uuid = l.id
        )
        or exists (
          select 1
          from public.quest_beat_attachments qba,
               lateral jsonb_array_elements_text(coalesce(qba.metadata->'room_ids', '[]'::jsonb)) room(id)
          where qba.campaign_id = p_campaign_id
            and qba.attachment_type = 'location_set'
            and room.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and room.id::uuid = l.id
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
  update public.quest_trigger_scheduled set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
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

  update public.quest_triggers qt set user_id = p_new_owner_id
   where qt.user_id = v_owner
     and exists (select 1 from public.quests q where q.id = qt.quest_id and q.campaign_id = p_campaign_id);

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

  -- location_set ref_id (the set's parent location).
  update public.quest_beat_attachments
     set ref_id = v_locations->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'location_set'
     and v_locations ? ref_id;

  -- location_set room_ids: rebuilt in place, order preserved, unmapped ids
  -- untouched. Only rows that already HAVE a room_ids array with at least one
  -- mapped id are touched, so jsonb_set's create-missing default can never add
  -- a room_ids key to a row that never had one.
  update public.quest_beat_attachments qba
     set metadata = jsonb_set(
           qba.metadata,
           '{room_ids}',
           (
             select coalesce(jsonb_agg(coalesce(v_locations->>room.id, room.id) order by room.ord), '[]'::jsonb)
             from jsonb_array_elements_text(qba.metadata->'room_ids') with ordinality as room(id, ord)
           )
         )
   where qba.campaign_id = p_campaign_id
     and qba.attachment_type = 'location_set'
     and qba.metadata ? 'room_ids'
     and exists (
       select 1 from jsonb_array_elements_text(qba.metadata->'room_ids') room(id)
       where v_locations ? room.id
     );
end;
$$;

-- CREATE OR REPLACE preserves existing grants, but restate the boundary so it
-- stays visible in this migration too: 20260812000001 revoked this legacy
-- 3-arg overload from every client-facing role -- public, anon, authenticated,
-- AND service_role. It now survives purely as an internal implementation
-- detail the 5-arg wrapper reaches with `perform`; nothing can call it
-- directly (a SECURITY DEFINER caller runs as its owning role, which bypasses
-- the EXECUTE check that blocks every other caller).
revoke execute on function public.transfer_campaign_ownership(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;


-- ── 3. Patch validate_quest_beat_attachment's remaining arms ────────────────
-- Step 6 above repoints quest_beat_attachments.ref_id from the outgoing
-- owner's original row to the incoming owner's clone, for item/npc/faction/
-- location_set/handout, the same way 20260814003041 already does for
-- monster. That UPDATE fires this BEFORE trigger. Each clone is a global row
-- (campaign_id is null) owned by the INCOMING owner, but auth.uid() inside
-- the transfer transaction is still the OUTGOING owner -- so each arm's
-- existing global-row branch, `x.campaign_id is null and x.user_id =
-- auth.uid()`, would reject the repoint. Extend every one of them to also
-- accept the CURRENT owner of the attachment's own campaign, exactly
-- mirroring the shape 20260814003041 already gave the monster arm.
--
-- This is behaviour-preserving for every normal, non-transfer write, for the
-- same reason given there: a campaign's DM is always its owner, so the new
-- clause is a no-op until a transfer is mid-flight and the roles have
-- already flipped.
--
-- Patch-by-replace (same pattern as 20260814003041's monster-arm do-block):
-- pg_get_functiondef, replace, assert the replacement actually changed
-- something, execute -- five times over, chained through one `definition` /
-- `patched` pair so each replace is checked against the state left by the
-- one before it. Every anchor below was confirmed against this local stack's
-- live pg_get_functiondef('private.validate_quest_beat_attachment()') output,
-- which already contains the #630 monster patch (its 'audio_scene' arm and
-- the playlist_type filter on 'playlist' are unrelated later additions and do
-- not interact with any anchor here).
do $recreate$
declare
  definition text;
  patched    text;
begin
  definition := pg_get_functiondef('private.validate_quest_beat_attachment()'::regprocedure);
  patched := definition;

  -- item arm (alias i).
  patched := replace(
    patched,
    '(i.campaign_id = new.campaign_id or (i.campaign_id is null and i.user_id = auth.uid()))',
    '(i.campaign_id = new.campaign_id or (i.campaign_id is null and (i.user_id = auth.uid() or i.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))'
  );
  if patched = definition then
    raise exception 'Could not patch validate_quest_beat_attachment item arm -- anchor text not found';
  end if;
  definition := patched;

  -- npc arm (alias n). The notes arm also uses alias n, but has no user_id
  -- clause at all (notes are campaign-scoped only), so this anchor is unique
  -- to the npc arm.
  patched := replace(
    patched,
    '(n.campaign_id = new.campaign_id or (n.campaign_id is null and n.user_id = auth.uid()))',
    '(n.campaign_id = new.campaign_id or (n.campaign_id is null and (n.user_id = auth.uid() or n.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))'
  );
  if patched = definition then
    raise exception 'Could not patch validate_quest_beat_attachment npc arm -- anchor text not found';
  end if;
  definition := patched;

  -- faction arm (alias f).
  patched := replace(
    patched,
    '(f.campaign_id = new.campaign_id or (f.campaign_id is null and f.user_id = auth.uid()))',
    '(f.campaign_id = new.campaign_id or (f.campaign_id is null and (f.user_id = auth.uid() or f.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))'
  );
  if patched = definition then
    raise exception 'Could not patch validate_quest_beat_attachment faction arm -- anchor text not found';
  end if;
  definition := patched;

  -- location_set arm (alias l). This anchor appears TWICE, byte-identical --
  -- once for the ref_id check, once for the room_ids check. replace()
  -- rewrites every occurrence of the search string, so this single call is
  -- exactly right and patches both in one pass.
  patched := replace(
    patched,
    '(l.campaign_id = new.campaign_id or (l.campaign_id is null and l.user_id = auth.uid()))',
    '(l.campaign_id = new.campaign_id or (l.campaign_id is null and (l.user_id = auth.uid() or l.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))'
  );
  if patched = definition then
    raise exception 'Could not patch validate_quest_beat_attachment location_set arm -- anchor text not found';
  end if;
  definition := patched;

  -- handout arm (alias d). Different shape entirely: scriptorium_documents
  -- has no campaign_id column at all (a personal-library-only table), so
  -- there is no existing campaign-scoped branch to extend -- just the bare
  -- auth.uid() comparison.
  patched := replace(
    patched,
    'd.user_id = auth.uid()',
    '(d.user_id = auth.uid() or d.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))'
  );
  if patched = definition then
    raise exception 'Could not patch validate_quest_beat_attachment handout arm -- anchor text not found';
  end if;

  execute patched;
end
$recreate$;

-- CREATE OR REPLACE preserves grants; restated for visibility, matching every
-- prior migration that has recreated this function.
revoke all on function private.validate_quest_beat_attachment() from public;
