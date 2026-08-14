-- Migration: transfer_quest_referenced_monsters_and_reassign
-- Follow-up to #630 (20260812000001, transfer_campaign_scoped_monsters_traps).
-- Two gaps remained in campaign-ownership transfer:
--
--   1. Monsters referenced from quests -- via quest_refs (ref_type 'monster')
--      and quest_beat_attachments (attachment_type 'monster') -- were neither
--      in the clone-reachability union nor repointed after cloning. After a
--      transfer the new owner's quests pointed at monster rows they could not
--      read, or that got deleted outright under the 'delete' disposition.
--   2. The outgoing owner had only two dispositions for their scoped-but-
--      unreferenced originals: 'promote' (go global) or 'delete'. There was
--      no way to move them to another campaign the same person still owns.
--
-- WHAT THIS MIGRATION DOES
--
--   1. Two new `private` helpers -- campaign_referenced_monster_ids /
--      campaign_referenced_trap_ids -- hold the ONE reachability definition
--      that both the base transfer function (clone set) and the scoped-copy
--      wrapper (exclusion set) call. Previously each had its own inline copy
--      of this union, and the two had already drifted (different UUID
--      regexes). The monster helper adds the two quest sources.
--   2. public.transfer_campaign_ownership(uuid, uuid, boolean) is re-created,
--      transcribed verbatim from 20260731000001, with its two inline unions
--      replaced by calls to the new helpers, and a new step 6 that repoints
--      quest_refs and quest_beat_attachments at the cloned monsters.
--   3. private.validate_quest_beat_attachment() is patched (patch-by-replace,
--      following 20260809000003's pattern) so its 'monster' arm accepts a
--      global clone owned by the campaign's owner, not only by auth.uid().
--      Needed because step 6 above repoints quest_beat_attachments.ref_id
--      while auth.uid() is still the OUTGOING owner but the clone belongs to
--      the INCOMING owner -- see the comment on the do-block below.
--   4. The 4-arg wrapper (20260812000001) is dropped and replaced by a 5-arg
--      one adding p_reassign_campaign_id and the 'reassign' disposition, and
--      its own two inline exclusion unions are replaced by calls to the same
--      two helpers.
--
-- Both ordering constraints from the design discussion are load-bearing and
-- are repeated as comments at the point they matter in the base function:
-- quest_refs must repoint before quest_beat_attachments (the attachment
-- update's AFTER trigger mirrors into quest_refs, and repointing quest_refs
-- first turns that insert into a harmless ON CONFLICT no-op instead of
-- leaving an old+new duplicate pair), and both must run AFTER the
-- campaigns.user_id flip (the patched validator's global-clone arm checks the
-- CURRENT campaign owner, not the caller).


-- ── 1. Single-source-of-truth monster/trap reachability helpers ────────────
-- `language sql stable` functions have no declare block, so the version-
-- agnostic UUID regex below is repeated in each arm that needs it rather than
-- held in one local constant. That is the only duplication left: the
-- reachability UNION itself now exists in exactly one place, called by both
-- the base transfer function (as the clone set) and the scoped-copy wrapper
-- (as the exclusion set), so the two can never independently drift again the
-- way they already had (the base function's regex was version-agnostic;
-- the wrapper's was v4-only).
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
$$;

comment on function private.campaign_referenced_monster_ids(uuid) is
  'Single reachability definition for monsters a campaign''s content actually points at. Shared by transfer_campaign_ownership (clone set) and its scoped-copy wrapper (exclusion set) so the two cannot drift the way their inline copies already had -- see 20260814003041.';

revoke all on function private.campaign_referenced_monster_ids(uuid) from public;
grant execute on function private.campaign_referenced_monster_ids(uuid) to anon, authenticated, service_role;


create or replace function private.campaign_referenced_trap_ids(p_campaign_id uuid)
returns setof uuid
language sql
stable
set search_path to 'public'
as $$
  select x.tid
    from public.encounters e, lateral unnest(e.trap_ids) x(tid)
    where e.campaign_id = p_campaign_id
$$;

comment on function private.campaign_referenced_trap_ids(uuid) is
  'Single reachability definition for traps a campaign''s content actually points at (encounters.trap_ids, no FK). Shared by transfer_campaign_ownership (clone set) and its scoped-copy wrapper (exclusion set) -- see 20260814003041.';

revoke all on function private.campaign_referenced_trap_ids(uuid) from public;
grant execute on function private.campaign_referenced_trap_ids(uuid) to anon, authenticated, service_role;


-- ── 2. Base transfer function: reachability delegated, quest refs repointed ─
-- Transcribed verbatim from 20260731000001 AS LAST RESTATED BY 20260809145858
-- (which dropped campaigns.falai_api_key and, in the same migration,
-- re-created this function without the `falai_api_key = null` assignment in
-- step 5 -- transcribing the original 20260731000001 text verbatim would
-- reference a column that no longer exists and fail at CREATE-time). Beyond
-- that one line, this transcription differs from both prior versions only in:
-- the two inline reachability unions now call the helpers above (monster/trap
-- clone loops), and a new step 6 repoints quest_refs / quest_beat_attachments
-- at the clones. UUID_RE is dropped from the declare block -- it was only
-- ever referenced inside the monster-loop union now replaced by the helper.
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
  for r in
    select d.*
    from public.scriptorium_documents d
    where d.user_id = v_owner
      and d.id in (
        select n.scriptorium_doc_id from public.npcs n
          where n.campaign_id = p_campaign_id and n.scriptorium_doc_id is not null
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
  -- Runs AFTER the campaign row flip: validate_quest_beat_attachment accepts a
  -- global clone through its campaign-owner arm only once campaigns.user_id is
  -- the recipient. quest_refs goes FIRST: repointing an attachment fires
  -- sync_quest_ref_from_beat_attachment, whose mirror insert must land as an
  -- ON CONFLICT no-op against the already-repointed row instead of leaving an
  -- old+new duplicate pair behind.
  update public.quest_refs qr
     set ref_id = v_monsters->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'monster'
     and v_monsters ? qr.ref_id;

  update public.quest_beat_attachments
     set ref_id = v_monsters->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'monster'
     and v_monsters ? ref_id;
end;
$$;

-- CREATE OR REPLACE preserves existing grants, but restate the boundary so it
-- stays visible in this migration too: 20260812000001 revoked this legacy
-- 3-arg overload from every client-facing role -- public, anon, authenticated,
-- AND service_role. It now survives purely as an internal implementation
-- detail the 5-arg wrapper below reaches with `perform`; nothing can call it
-- directly (a SECURITY DEFINER caller runs as its owning role, which bypasses
-- the EXECUTE check that blocks every other caller).
revoke execute on function public.transfer_campaign_ownership(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;


-- ── 3. Patch validate_quest_beat_attachment's 'monster' arm ─────────────────
-- Step 6 above repoints quest_beat_attachments.ref_id from the outgoing
-- owner's original monster to the incoming owner's clone. That UPDATE fires
-- this BEFORE trigger. The clone is a global row (campaign_id is null) owned
-- by the INCOMING owner, but auth.uid() inside the transfer transaction is
-- still the OUTGOING owner -- so the existing global-row arm,
-- `m.campaign_id is null and m.user_id = auth.uid()`, would reject the
-- repoint. Extend it to also accept the CURRENT owner of the attachment's own
-- campaign.
--
-- This is behaviour-preserving for every normal, non-transfer write: RLS on
-- quest_beat_attachments is `private.is_campaign_dm(campaign_id)`, and a
-- campaign's DM is always its owner (campaigns.user_id and the
-- campaign_members 'dm' row are kept in lockstep by this very function's step
-- 4 and by campaign creation), so for a normal write
-- `auth.uid() = (select c.user_id from campaigns c where c.id = new.campaign_id)`
-- already held trivially. The new clause only starts doing independent work
-- inside a transfer, once step 5 has flipped campaigns.user_id to the
-- recipient but auth.uid() is still the caller who kicked off the transfer.
--
-- Patch-by-replace (pattern: 20260809000003's get_player_visible_monsters
-- do-block): pg_get_functiondef, replace, assert the replacement actually
-- changed something, execute. The anchor was confirmed against the local
-- stack's current pg_get_functiondef output before writing this migration.
do $recreate$
declare
  definition text;
  patched    text;
begin
  definition := pg_get_functiondef('private.validate_quest_beat_attachment()'::regprocedure);
  patched := replace(
    definition,
    '(m.campaign_id is null and m.user_id = auth.uid())',
    '(m.campaign_id is null and (m.user_id = auth.uid() or m.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id)))'
  );
  if patched = definition then
    raise exception 'Could not patch validate_quest_beat_attachment monster arm -- anchor text not found';
  end if;
  execute patched;
end
$recreate$;

-- CREATE OR REPLACE preserves grants; restated for visibility, matching every
-- prior migration that has recreated this function.
revoke all on function private.validate_quest_beat_attachment() from public;


-- ── 4. Replace the 4-arg scoped-copy wrapper with a 5-arg one ───────────────
-- Adds the 'reassign' disposition: instead of promoting scoped-but-
-- unreferenced originals to global or deleting them, the outgoing owner can
-- move them onto another campaign they still own. p_reassign_campaign_id is
-- required only for that disposition and defaults to null, so every existing
-- 4-positional-arg caller (including PostgREST clients using named args that
-- omit it) keeps working unchanged.
--
-- The old 4-arg overload must be dropped, not left alongside: with a 5th
-- parameter carrying a default, a 4-arg call would otherwise match both
-- overloads and Postgres would reject it as ambiguous.
drop function public.transfer_campaign_ownership(uuid, uuid, boolean, text);

create or replace function public.transfer_campaign_ownership(
  p_campaign_id uuid,
  p_new_owner_id uuid,
  p_leave_campaign boolean,
  p_scoped_copy_disposition text,
  p_reassign_campaign_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  r       record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_scoped_copy_disposition not in ('promote', 'reassign', 'delete') then
    raise exception 'Invalid scoped-copy disposition: %, expected ''promote'', ''reassign'' or ''delete''',
      p_scoped_copy_disposition;
  end if;

  select user_id into v_owner
  from public.campaigns
  where id = p_campaign_id;

  if v_owner is null then
    raise exception 'Campaign not found';
  end if;

  if v_owner <> v_uid then
    raise exception 'Only the campaign owner can transfer it';
  end if;

  -- Reassign needs a target campaign the caller still owns, and that target
  -- cannot be the very campaign being handed over. Every other disposition
  -- must NOT carry a reassign target -- a caller passing one alongside
  -- 'promote'/'delete' almost certainly meant something the RPC silently
  -- ignoring it would hide, so it is rejected instead.
  if p_scoped_copy_disposition = 'reassign' then
    if p_reassign_campaign_id is null then
      raise exception 'Reassigning scoped homebrew requires a target campaign';
    end if;
    if p_reassign_campaign_id = p_campaign_id then
      raise exception 'Cannot reassign scoped homebrew to the campaign being transferred';
    end if;
    if not exists (
      select 1 from public.campaigns c
      where c.id = p_reassign_campaign_id and c.user_id = v_uid
    ) then
      raise exception 'Reassign target must be a campaign you own';
    end if;
  elsif p_reassign_campaign_id is not null then
    raise exception 'A reassign target is only valid with the ''reassign'' disposition';
  end if;

  -- These inserts are part of a transfer, not user-created quota consumption.
  -- The delegated function sets the same transaction-local flag, but these
  -- copies happen first.
  perform set_config('grimoire.bypass_quota', 'on', true);

  -- The established function clones the reachable set (private.
  -- campaign_referenced_monster_ids / _trap_ids, #630). Copy only scoped rows
  -- OUTSIDE that set here, avoiding duplicate clones while ensuring newly
  -- authored, not-yet-used campaign creatures travel with the campaign.
  --
  -- NOT EXISTS rather than NOT IN against the helper's result set: the
  -- reachable-ids union includes an unnest() of campaigns.excluded_monster_ids
  -- with no NOT NULL guarantee on its elements, and `x NOT IN (subquery)`
  -- silently matches nothing at all if that subquery ever produces one null
  -- row. NOT EXISTS has no such trap.
  for r in
    select m.*
    from public.monsters m
    where m.user_id = v_owner
      and m.campaign_id = p_campaign_id
      and not exists (
        select 1 from private.campaign_referenced_monster_ids(p_campaign_id) rid
        where rid = m.id
      )
  loop
    insert into public.monsters
    select (jsonb_populate_record(
      null::public.monsters,
      to_jsonb(r) || jsonb_build_object(
        'id', gen_random_uuid(),
        'user_id', p_new_owner_id
      )
    )).*;
  end loop;

  for r in
    select t.*
    from public.traps t
    where t.user_id = v_owner
      and t.campaign_id = p_campaign_id
      and not exists (
        select 1 from private.campaign_referenced_trap_ids(p_campaign_id) rid
        where rid = t.id
      )
  loop
    insert into public.traps
    select (jsonb_populate_record(
      null::public.traps,
      to_jsonb(r) || jsonb_build_object(
        'id', gen_random_uuid(),
        'user_id', p_new_owner_id
      )
    )).*;
  end loop;

  -- Performs authorization of the recipient, clones reachable library rows
  -- (now including quest-referenced monsters, #630), repoints every
  -- reference, moves campaign-owned content and swaps roles.
  perform public.transfer_campaign_ownership(
    p_campaign_id,
    p_new_owner_id,
    p_leave_campaign
  );

  -- References from the transferred campaign now target the recipient's
  -- clones. Only the old owner's originals are resolved here; the fresh copies
  -- stay scoped to the transferred campaign.
  if p_scoped_copy_disposition = 'promote' then
    update public.monsters
       set campaign_id = null
     where user_id = v_owner and campaign_id = p_campaign_id;
    update public.traps
       set campaign_id = null
     where user_id = v_owner and campaign_id = p_campaign_id;
  elsif p_scoped_copy_disposition = 'reassign' then
    update public.monsters
       set campaign_id = p_reassign_campaign_id
     where user_id = v_owner and campaign_id = p_campaign_id;
    update public.traps
       set campaign_id = p_reassign_campaign_id
     where user_id = v_owner and campaign_id = p_campaign_id;
  else
    delete from public.monsters
     where user_id = v_owner and campaign_id = p_campaign_id;
    delete from public.traps
     where user_id = v_owner and campaign_id = p_campaign_id;
  end if;
end;
$$;

revoke execute on function public.transfer_campaign_ownership(uuid, uuid, boolean, text, uuid)
  from public, anon;
grant execute on function public.transfer_campaign_ownership(uuid, uuid, boolean, text, uuid)
  to authenticated, service_role;

comment on function public.transfer_campaign_ownership(uuid, uuid, boolean, text, uuid) is
  'Hands a campaign to another member; clones and repoints referenced personal-library monsters/traps (including quest_refs and quest_beat_attachments, #630); and explicitly promotes, reassigns to another campaign the outgoing owner still owns, or deletes their scoped-but-unreferenced originals. p_reassign_campaign_id is required only for the ''reassign'' disposition and defaults to null, so 4-arg / named-argument PostgREST callers that omit it are unaffected.';
