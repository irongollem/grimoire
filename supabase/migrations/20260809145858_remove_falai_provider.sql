-- Migration: remove_falai_provider
-- Drop fal.ai as an image-generation provider, end to end (#641).
--
-- WHY. fal.ai offers no data processing addendum at all -- not "one we haven't
-- signed", none on offer. Art 28(3) GDPR requires a processor contract before a
-- controller may hand over personal data, so without one they cannot lawfully be
-- a sub-processor for us, whatever the model quality. OpenAI and Google already
-- cover every image surface, so there is nothing to replace and no gap to fill.
--
-- Nothing is being preserved here because nothing was ever produced: at the time
-- of writing, zero campaigns select falai, zero hold a falai BYOK key, zero
-- ai_credit_ledger rows name a fal model, and no platform key was ever stored.
-- The only fal rows in the database are the two seeds below (provider_config
-- from 20260507000011, ai_model_pricing from 20260506000001). The historical
-- ledger is untouched regardless -- it has no fal rows to keep.
--
-- One live defect goes with it: provider_config.falai had image_enabled = true
-- while platform_api_keys held no fal key, so "fal.ai -- FLUX" was an offered
-- choice in Campaign Settings -> AI for platform-credit users that could only
-- ever fail at generation time (resolveImageProvider returns null without a key).

-- ── 1. Campaigns pointing at fal fall back to the default provider ───────────
-- Currently zero rows. Kept anyway: this runs against production some time
-- after it was written, and a campaign left on a provider whose column and
-- config rows are about to disappear would generate nothing at all.
update public.campaigns
   set image_provider = 'openai'
 where image_provider = 'falai';

-- ── 2. Recreate the two functions that name the column ───────────────────────
-- plpgsql bodies are not dependency-tracked, so `drop column` below would leave
-- both of these parsing fine and failing at runtime. They must be restated.

-- enforce_byok_pro_only (20260615000002), minus the falai arm.
--
-- NOTE the `private.is_app_admin()` call: 20260629000002 relocated the RLS
-- helpers out of `public`, so this differs from the body as first written in
-- 20260615000002. Restating that older text would silently revert the
-- relocation and hand the advisor back its finding.
create or replace function public.enforce_byok_pro_only()
returns trigger
language plpgsql
security definer
set search_path = public
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

-- Trigger function: never REST-callable (20260629000003). `create or replace`
-- retains the existing ACL, so this is belt-and-braces rather than a fix -- but
-- it keeps the guarantee visible at the point the body changes.
revoke execute on function public.enforce_byok_pro_only() from public, anon, authenticated;

-- transfer_campaign_ownership (20260731000001), minus the falai_api_key = null
-- assignment in step 5. Body is otherwise byte-identical to that migration --
-- see it for the design rationale, which is unchanged and not repeated here.
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
         gemini_api_key    = null
   where id = p_campaign_id;
end;
$$;

revoke execute on function public.transfer_campaign_ownership(uuid, uuid, boolean) from public, anon;
grant execute on function public.transfer_campaign_ownership(uuid, uuid, boolean) to authenticated, service_role;

-- ── 3. Drop the column and the provider's configuration rows ─────────────────
alter table public.campaigns drop column falai_api_key;

delete from public.provider_config   where provider = 'falai';
delete from public.ai_model_pricing  where provider = 'falai';
-- No fal key was ever stored, but an admin could have set one between this
-- being written and applied, and it must not survive the provider's removal.
delete from public.platform_api_keys where provider = 'falai';
