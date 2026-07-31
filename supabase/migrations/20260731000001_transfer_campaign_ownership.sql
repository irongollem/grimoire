-- Migration: transfer_campaign_ownership
-- Hand a campaign over to another member: swap campaigns.user_id, move every
-- campaign-scoped row the outgoing DM owns, clone the personal-library rows the
-- campaign hydrates from, and flip the two campaign_members roles -- atomically.
--
-- WHY A FUNCTION AND NOT AN UPDATE (#180)
--
-- `campaigns.user_id` is only half of what "owns a campaign" means here. Roughly
-- forty campaign-scoped tables gate their RLS on `auth.uid() = user_id` rather
-- than on `private.is_campaign_dm(campaign_id)` -- notes, npcs, quests, locations,
-- items, encounters, sounds, homebrew, and so on. Flipping `campaigns.user_id`
-- alone would hand over an empty shell: the new DM would be `is_campaign_dm()`
-- for the campaign but unable to read a single note in it, while the old DM would
-- keep full read/write on all of it. So a transfer must re-stamp `user_id` on the
-- campaign's content too, and that only makes sense as one transaction.
--
-- WHAT MOVES
--
--   * campaigns.user_id, and the DM/player rows in campaign_members
--   * every table with `campaign_id = <campaign> and user_id = <outgoing DM>`,
--     minus the exclusions below. The `user_id = <outgoing DM>` half of that
--     predicate is load-bearing: it leaves players' own rows (characters they
--     created, companions they own, proposals they made) exactly where they are.
--   * the FK children that carry a `user_id` but no `campaign_id` and are only
--     reachable through a campaign parent: faction_*, quest_triggers, store_items.
--
-- Child tables without a `user_id` (quest_objectives, character_classes,
-- crafting_recipe_*, soundboard_playlist_tracks, ...) derive their RLS from the
-- parent's `user_id`, so moving the parent moves them; they need no update here.
--
-- WHAT DOES NOT MOVE, DELIBERATELY
--
--   * ai_generation_jobs / image_generation_jobs -- credit-spend records. They
--     belong to whoever paid, not to whoever owns the campaign now.
--   * campaign_messages -- chat authorship. Rewriting who said what is a lie.
--   * entity_notes -- personal annotations, incl. `is_private` ones. Handing the
--     outgoing DM's private notes to the new one is a privacy breach, not a
--     feature.
--   * minis -- Simulacrum models the outgoing DM bought with their own credits.
--   * player_favourites / player_journal_entries / player_npc_ratings /
--     player_read_items / session_availability -- per-user personal state.
--   * the four `*_api_key` columns on campaigns are CLEARED rather than moved:
--     they are the outgoing DM's BYOK credentials. `spotify_client_id` does move
--     (it is a public OAuth client id, and #180 explicitly wants it to travel).
--
-- PERSONAL LIBRARY: CLONE OR UNLINK
--
-- monsters / traps / backgrounds / scriptorium_documents have no `campaign_id` --
-- they are cross-campaign personal libraries. But campaign content hydrates from
-- them at run time: the encounter runner resolves `combatants[].monster_id`
-- against `monsters`, character sheets resolve `background_id`, and so on. Moving
-- the campaign without them hands over encounters that cannot run. They are
-- CLONED (copied under a fresh id into the new owner's library, then every
-- reference in the campaign is repointed) rather than moved, because the outgoing
-- DM's *other* campaigns may use the very same rows.
--
-- `locations.source_map_id` and `puzzle_rooms.dungeon_feature_id` are NULLED
-- instead. Those are editor deep-links into Cartographer, whose maps and features
-- are a multi-row workspace graph of their own -- cloning that graph is a
-- different feature, and leaving a link the new owner cannot open is worse than
-- leaving no link.
--
-- Everything is one SECURITY DEFINER transaction: a half-applied transfer (owner
-- swapped, content not) would lock both DMs out of the same campaign at once.


-- ── Quota bypass hook ────────────────────────────────────────────────────────
-- `monsters` and `scriptorium_documents` carry BEFORE INSERT quota triggers, and
-- check_quota() counts `where user_id = auth.uid()` -- the CALLER's rows. Inside
-- transfer_campaign_ownership the caller is the outgoing DM, who by definition
-- already owns every monster being cloned, so an outgoing DM sitting at their
-- free-plan cap could not hand their campaign over at all. Quotas gate creation;
-- a transfer creates nothing new, it moves what already exists. The transfer
-- function sets a transaction-local flag (is_local = true, so it cannot leak past
-- the statement that set it) and enforce_quota honours it.
--
-- Not reachable from a client: PostgREST only exposes functions in `public`, and
-- set_config lives in pg_catalog, so no caller can raise this flag themselves.
create or replace function public.enforce_quota()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  result jsonb;
begin
  if current_setting('grimoire.bypass_quota', true) = 'on' then
    return new;
  end if;

  result := check_quota(TG_TABLE_NAME);
  if not (result ->> 'allowed')::boolean then
    raise exception 'quota_exceeded'
      using detail = TG_TABLE_NAME,
            hint   = 'Upgrade to Pro DM to create more ' || TG_TABLE_NAME;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_quota() from public, anon, authenticated;


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
  -- Monster references live in free-form text/jsonb fields shared with SRD keys;
  -- see the union below.
  UUID_RE     constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
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
  -- companions, live wildshape state, and the campaign's monster exclusions.
  for r in
    select m.*
    from public.monsters m
    where m.user_id = v_owner
      and m.id in (
        select n.linked_monster_id from public.npcs n
          where n.campaign_id = p_campaign_id and n.linked_monster_id is not null
        union
        select dm.monster_id from public.discovered_monsters dm
          where dm.campaign_id = p_campaign_id and dm.monster_id is not null
        union
        select pf.monster_id from public.pinned_forms pf
          where pf.campaign_id = p_campaign_id and pf.monster_id is not null
        union
        -- Every monster reference below is a free-form text field that holds a
        -- `monsters.id` for homebrew but a shared SRD key ("srd_dire_wolf") for
        -- SRD stat blocks, which live in a shared table and are the same rows for
        -- everyone. Only well-formed uuids are candidates for cloning; casting
        -- unfiltered raises `invalid input syntax for type uuid`.
        select c.source_monster_id::uuid from public.companions c
          where c.campaign_id = p_campaign_id
            and c.source_monster_id ~* UUID_RE
        union
        select (comb->>'monster_id')::uuid
          from public.encounters e,
               lateral jsonb_array_elements(coalesce(e.combatants, '[]'::jsonb)) comb
          where e.campaign_id = p_campaign_id and comb->>'monster_id' ~* UUID_RE
        union
        select (spawn->>'monster_id')::uuid
          from public.encounters e,
               lateral jsonb_array_elements(coalesce(e.events, '[]'::jsonb)) ev,
               lateral jsonb_array_elements(coalesce(ev->'actions', '[]'::jsonb)) act,
               lateral jsonb_array_elements(coalesce(act->'spawns', '[]'::jsonb)) spawn
          where e.campaign_id = p_campaign_id and spawn->>'monster_id' ~* UUID_RE
        union
        select (pm.wildshape_state->>'monster_id')::uuid
          from public.party_members pm
          where pm.campaign_id = p_campaign_id
            and pm.wildshape_state->>'monster_id' ~* UUID_RE
        union
        select x.mid
          from public.campaigns c,
               lateral unnest(c.excluded_monster_ids) x(mid)
          where c.id = p_campaign_id
      )
  loop
    v_new := gen_random_uuid();
    insert into public.monsters
    select (jsonb_populate_record(
              null::public.monsters,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_monsters := v_monsters || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- traps: referenced by encounters.trap_ids (uuid[], no FK).
  for r in
    select t.*
    from public.traps t
    where t.user_id = v_owner
      and t.id in (
        select x.tid
        from public.encounters e, lateral unnest(e.trap_ids) x(tid)
        where e.campaign_id = p_campaign_id
      )
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
  -- the campaign's Spotify setup to travel with it.
  update public.campaigns
     set user_id           = p_new_owner_id,
         openai_api_key    = null,
         anthropic_api_key = null,
         gemini_api_key    = null,
         falai_api_key     = null
   where id = p_campaign_id;
end;
$$;

revoke execute on function public.transfer_campaign_ownership(uuid, uuid, boolean) from public, anon;
grant execute on function public.transfer_campaign_ownership(uuid, uuid, boolean) to authenticated, service_role;
