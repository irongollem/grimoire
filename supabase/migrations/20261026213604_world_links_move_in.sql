-- World Web (#1084): the six old tie tables move into world_links and are dropped. Rule 3 of the epic: the new model
-- was built first (20261026212025, 20261026213103); only now does the old data move in, and in the same release the
-- tables and every reader go (rule 1, no legacy).
--
-- What becomes what:
--   npc_relationships  -> person-to-person links, same type. An old row (A, B, t) described B from A's side ("B is
--                         A's mentor"), so a directed type turns round into the stored direction: (A, B, mentor) is
--                         "B mentor of A", (A, B, apprentice) is "A mentor of B"; superior and subordinate likewise.
--                         DM-only, as they were.
--   npc_pc_notes       -> an NPC-to-PC link, same type; its note was the line that PC's player reads, so it becomes
--                         `told` and the link is revealed to that character, as the note was.
--   faction_relations  -> faction stances, same type and direction, notes kept. DM-only, as they were.
--   faction_locations  -> "operates in", faction_items -> "holds", faction_deities -> "worships": the mildest type,
--                         so nothing claims more than the DM wrote. Locations and items were DM-only; a faction's
--                         deity was readable by anyone who could see the faction or the deity, so it is revealed to
--                         those characters (the player read still asks for both ends).
-- Two old rows can become one link (a symmetric bond written once each way): their notes are kept together.
-- The moved rows do not ring the campaign: they are not news to anyone. A row whose end no longer exists (only a
-- restored local dump can hold one; the foreign keys forbid it) points at nothing and is left behind.

alter table public.world_links disable trigger world_links_signal_insert;

-- ── 1. Bonds between NPCs ─────────────────────────────────────────────────────
insert into public.world_links (user_id, campaign_id, from_kind, from_npc_id, to_kind, to_npc_id, type, note,
                                ai_provenance, created_at)
select r.user_id, r.campaign_id, 'npc',
       case when r.relationship_type in ('mentor', 'superior') then r.related_npc_id else r.npc_id end,
       'npc',
       case when r.relationship_type in ('mentor', 'superior') then r.npc_id else r.related_npc_id end,
       case r.relationship_type
         when 'mentor' then 'mentor_of' when 'apprentice' then 'mentor_of'
         when 'superior' then 'superior_of' when 'subordinate' then 'superior_of'
         else r.relationship_type end,
       coalesce(btrim(r.notes), ''), r.ai_provenance, r.created_at
  from public.npc_relationships r
 where r.campaign_id is not null
   and exists (select 1 from public.npcs x where x.id = r.npc_id)
   and exists (select 1 from public.npcs x where x.id = r.related_npc_id)
 order by r.created_at, r.id
on conflict (from_id, to_id, type) do update
  set note = case
    when excluded.note = '' or position(excluded.note in world_links.note) > 0 then world_links.note
    when world_links.note = '' then excluded.note
    else world_links.note || ' / ' || excluded.note end;

-- ── 2. An NPC's bond with a PC ────────────────────────────────────────────────
-- The old type described the NPC to the PC ("your mentor"), as the player read it.
insert into public.world_links (user_id, campaign_id, from_kind, from_npc_id, from_party_member_id, to_kind,
                                to_npc_id, to_party_member_id, type, told, player_visible_to, created_at)
select n.user_id, n.campaign_id,
       case when n.relationship_type in ('apprentice', 'subordinate') then 'party_member' else 'npc' end,
       case when n.relationship_type in ('apprentice', 'subordinate') then null else n.npc_id end,
       case when n.relationship_type in ('apprentice', 'subordinate') then n.party_member_id end,
       case when n.relationship_type in ('apprentice', 'subordinate') then 'npc' else 'party_member' end,
       case when n.relationship_type in ('apprentice', 'subordinate') then n.npc_id end,
       case when n.relationship_type in ('apprentice', 'subordinate') then null else n.party_member_id end,
       case n.relationship_type
         when 'mentor' then 'mentor_of' when 'apprentice' then 'mentor_of'
         when 'superior' then 'superior_of' when 'subordinate' then 'superior_of'
         else n.relationship_type end,
       btrim(n.notes), array[n.party_member_id], n.created_at
  from public.npc_pc_notes n
 where exists (select 1 from public.npcs x where x.id = n.npc_id)
   and exists (select 1 from public.party_members x where x.id = n.party_member_id)
 order by n.created_at, n.id
on conflict (from_id, to_id, type) do update
  set told = case when world_links.told = '' then excluded.told else world_links.told end,
      player_visible_to = (select array_agg(distinct v) from unnest(world_links.player_visible_to || excluded.player_visible_to) v);

-- ── 3. Faction stances ────────────────────────────────────────────────────────
insert into public.world_links (user_id, campaign_id, from_kind, from_faction_id, to_kind, to_faction_id, type, note,
                                created_at)
select r.user_id, f.campaign_id, 'faction', r.faction_id, 'faction', r.target_faction_id, r.relation_type,
       coalesce(btrim(r.notes), ''), r.created_at
  from public.faction_relations r
  join public.factions f on f.id = r.faction_id
  join public.factions g on g.id = r.target_faction_id
 where f.campaign_id is not null and g.campaign_id is not distinct from f.campaign_id;

-- ── 4. Factions and places, items, deities ────────────────────────────────────
insert into public.world_links (user_id, campaign_id, from_kind, from_faction_id, to_kind, to_location_id, type, note,
                                created_at)
select x.user_id, f.campaign_id, 'faction', x.faction_id, 'location', x.location_id, 'operates_in',
       coalesce(btrim(x.notes), ''), x.created_at
  from public.faction_locations x join public.factions f on f.id = x.faction_id
 where f.campaign_id is not null and exists (select 1 from public.locations y where y.id = x.location_id)
on conflict (from_id, to_id, type) do nothing;

insert into public.world_links (user_id, campaign_id, from_kind, from_faction_id, to_kind, to_item_id, type, note,
                                created_at)
select x.user_id, f.campaign_id, 'faction', x.faction_id, 'item', x.item_id, 'holds',
       coalesce(btrim(x.notes), ''), x.created_at
  from public.faction_items x join public.factions f on f.id = x.faction_id
 where f.campaign_id is not null and exists (select 1 from public.items i where i.id = x.item_id)
on conflict (from_id, to_id, type) do nothing;

insert into public.world_links (user_id, campaign_id, from_kind, from_faction_id, to_kind, to_deity_id, type,
                                player_visible_to, created_at)
select x.user_id, x.campaign_id, 'faction', x.faction_id, 'deity', x.deity_id, 'worships',
       coalesce((select array_agg(distinct v) from unnest(
         f.player_visible_to || d.player_visible_to
         || coalesce((select array_agg(fpm.party_member_id) from public.faction_party_members fpm
                       where fpm.faction_id = f.id), '{}')) v), '{}'),
       x.created_at
  from public.faction_deities x
  join public.factions f on f.id = x.faction_id
  join public.deities d on d.id = x.deity_id
on conflict (from_id, to_id, type) do nothing;

alter table public.world_links enable trigger world_links_signal_insert;

-- ── 5. Nothing was lost ───────────────────────────────────────────────────────
-- Every old row is now a link, or the migration stops here and nothing is dropped.
do $$
declare
  v_missing int;
begin
  select count(*) into v_missing from public.npc_relationships r
   where r.campaign_id is not null
     and exists (select 1 from public.npcs x where x.id = r.npc_id)
     and exists (select 1 from public.npcs x where x.id = r.related_npc_id)
     and not exists (
     select 1 from public.world_links l
      where l.campaign_id = r.campaign_id
        and ((l.from_npc_id = r.npc_id and l.to_npc_id = r.related_npc_id)
          or (l.from_npc_id = r.related_npc_id and l.to_npc_id = r.npc_id))
        and l.type = case r.relationship_type when 'mentor' then 'mentor_of' when 'apprentice' then 'mentor_of'
                          when 'superior' then 'superior_of' when 'subordinate' then 'superior_of'
                          else r.relationship_type end);
  if v_missing > 0 then raise exception 'world_links move-in: % NPC bonds did not arrive', v_missing; end if;

  select count(*) into v_missing from public.npc_pc_notes n
   where exists (select 1 from public.npcs x where x.id = n.npc_id)
     and exists (select 1 from public.party_members x where x.id = n.party_member_id)
     and not exists (
     select 1 from public.world_links l
      where coalesce(l.from_npc_id, l.to_npc_id) = n.npc_id
        and coalesce(l.from_party_member_id, l.to_party_member_id) = n.party_member_id
        and n.party_member_id = any (l.player_visible_to));
  if v_missing > 0 then raise exception 'world_links move-in: % PC connections did not arrive', v_missing; end if;

  select count(*) into v_missing from public.faction_relations r join public.factions f on f.id = r.faction_id
   where f.campaign_id is not null and not exists (
     select 1 from public.world_links l
      where l.from_faction_id = r.faction_id and l.to_faction_id = r.target_faction_id and l.type = r.relation_type);
  if v_missing > 0 then raise exception 'world_links move-in: % faction stances did not arrive', v_missing; end if;

  select count(*) into v_missing from public.faction_locations x join public.factions f on f.id = x.faction_id
   where f.campaign_id is not null and exists (select 1 from public.locations y where y.id = x.location_id)
     and not exists (
     select 1 from public.world_links l where l.from_faction_id = x.faction_id and l.to_location_id = x.location_id);
  if v_missing > 0 then raise exception 'world_links move-in: % faction places did not arrive', v_missing; end if;

  select count(*) into v_missing from public.faction_items x join public.factions f on f.id = x.faction_id
   where f.campaign_id is not null and exists (select 1 from public.items i where i.id = x.item_id) and not exists (
     select 1 from public.world_links l where l.from_faction_id = x.faction_id and l.to_item_id = x.item_id);
  if v_missing > 0 then raise exception 'world_links move-in: % faction items did not arrive', v_missing; end if;

  select count(*) into v_missing from public.faction_deities x
   where not exists (
     select 1 from public.world_links l where l.from_faction_id = x.faction_id and l.to_deity_id = x.deity_id);
  if v_missing > 0 then raise exception 'world_links move-in: % faction deities did not arrive', v_missing; end if;
end;
$$;

-- ── 6. The functions that named the old tables ────────────────────────────────
-- move_campaign_content hands a campaign's authored rows to a new author; transfer_campaign_ownership also points a
-- campaign's ties at the copies it makes of the old owner's general NPCs, places, factions and items. Both are restated
-- whole (their current definitions) with the six tables replaced by world_links. Kin links were never remapped by the
-- transfer, so a kin link to one of the old owner's general NPCs kept pointing at the original; that is fixed here too.
CREATE OR REPLACE FUNCTION private.move_campaign_content(p_campaign_id uuid, p_from uuid, p_to uuid, p_scoped_homebrew boolean, p_player_rows boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  update public.factions              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.items                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.kin_links             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.world_links           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_board_pins     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_boards         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.locations             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.loot_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notes                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_inventory         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
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
  update public.faction_npcs f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_party_members f set user_id = p_to
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

  -- World Web (#1084): a tie's ends follow the copies, either end, and so do kin links.
  update public.world_links set from_npc_id = (v_npcs->>from_npc_id::text)::uuid
   where campaign_id = p_campaign_id and v_npcs ? from_npc_id::text;
  update public.world_links set to_npc_id = (v_npcs->>to_npc_id::text)::uuid
   where campaign_id = p_campaign_id and v_npcs ? to_npc_id::text;
  update public.kin_links set from_npc_id = (v_npcs->>from_npc_id::text)::uuid
   where campaign_id = p_campaign_id and v_npcs ? from_npc_id::text;
  update public.kin_links set to_npc_id = (v_npcs->>to_npc_id::text)::uuid
   where campaign_id = p_campaign_id and v_npcs ? to_npc_id::text;

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

  update public.world_links set from_item_id = (v_items->>from_item_id::text)::uuid
   where campaign_id = p_campaign_id and v_items ? from_item_id::text;
  update public.world_links set to_item_id = (v_items->>to_item_id::text)::uuid
   where campaign_id = p_campaign_id and v_items ? to_item_id::text;

  update public.world_links set from_location_id = (v_locations->>from_location_id::text)::uuid
   where campaign_id = p_campaign_id and v_locations ? from_location_id::text;
  update public.world_links set to_location_id = (v_locations->>to_location_id::text)::uuid
   where campaign_id = p_campaign_id and v_locations ? to_location_id::text;

  update public.faction_npcs fn
     set npc_id = (v_npcs->>fn.npc_id::text)::uuid
    from public.factions f
   where f.id = fn.faction_id
     and f.campaign_id = p_campaign_id
     and v_npcs ? fn.npc_id::text;

  update public.world_links set from_faction_id = (v_factions->>from_faction_id::text)::uuid
   where campaign_id = p_campaign_id and v_factions ? from_faction_id::text;
  update public.world_links set to_faction_id = (v_factions->>to_faction_id::text)::uuid
   where campaign_id = p_campaign_id and v_factions ? to_faction_id::text;

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

-- ── 7. Gone ──────────────────────────────────────────────────────────────────────
delete from private.demo_campaign_tables
 where table_name in ('npc_relationships', 'npc_pc_notes', 'faction_relations', 'faction_locations', 'faction_items',
                      'faction_deities');

drop table public.npc_relationships;
drop table public.npc_pc_notes;
drop table public.faction_relations;
drop table public.faction_locations;
drop table public.faction_items;
drop table public.faction_deities;
