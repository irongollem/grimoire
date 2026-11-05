-- A campaign's calendar is chosen, not assumed (#934, story 7).
--
-- Until now an empty campaign was a Forgotten Realms campaign: `calendar_id`
-- defaulted to 'faerun', `current_year` to 1495 and `setting` to 'Faerûn', and
-- anything the calendar code did not recognise (an unknown id, 'custom' with no
-- definition) was read as the Harptos calendar, here in `private.calendar_shape`
-- and in the client's `getCalendarAdapter`. A campaign in any other world, or in
-- another game system, was quietly dated in Faerûn.
--
-- Now:
--   * `campaigns.calendar_id` and `campaigns.setting` have no default and may
--     be null: null is "no calendar chosen" / "no world named". The new-campaign
--     form makes the DM pick a calendar (a blank one is on the list), the way it
--     already makes them pick a 5e edition. Every existing campaign keeps the
--     calendar it has.
--   * A campaign with no calendar, an unknown one, or 'custom' with no stored
--     definition is read as the blank calendar (twelve 30-day months, no leap
--     years), on the server below and in the client. Faerûn is only ever the
--     calendar of a campaign that chose it.
--   * `current_year` starts at 1, the blank calendar's first year.
--   * `hall_of_heroes.setting` defaults to 'homebrew', not 'faerun'.
--   * `calendar_events.harptos_year/month/day` are `year/month/day`. They have
--     always held the date in whatever calendar the campaign uses; the Harptos
--     name said otherwise.

-- ── Campaign defaults ───────────────────────────────────────────────────────

alter table public.campaigns
  alter column calendar_id drop default,
  alter column calendar_id drop not null,
  alter column setting drop default,
  alter column setting drop not null,
  alter column current_year set default 1;

alter table public.hall_of_heroes
  alter column setting set default 'homebrew';

-- ── Event dates: year/month/day ─────────────────────────────────────────────

alter table public.calendar_events rename column harptos_year to year;
alter table public.calendar_events rename column harptos_month to month;
alter table public.calendar_events rename column harptos_day to day;
-- The index is named for the year already; only its definition moved.

-- The two functions that name the columns, as they stand, with the new names.

CREATE OR REPLACE FUNCTION private.perform_quest_consequence(p_event_id uuid, p_year integer, p_month integer, p_day integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_ev  public.quest_consequence_events%rowtype;
  v_q   public.quests%rowtype;
  v_id  uuid;
  v_prev_rel public.npc_relationship;
  v_ladder text[] := array['hostile', 'unfriendly', 'indifferent', 'friendly', 'helpful'];
  v_idx int;
  v_step int;
  v_to text;
  v_prev_quest_status public.quest_status_enum;
  v_text text;
  v_prev_status text;
  v_prev_visible boolean;
  v_doc record;
  v_added uuid[];
  v_prev_location uuid;
  v_npc public.npcs%rowtype;
  v_prev_standing public.npc_relationship;
  v_clock public.quest_clocks%rowtype;
  v_tid uuid;
begin
  select * into v_ev from public.quest_consequence_events where id = p_event_id;
  if not found or v_ev.performed_at is not null or v_ev.undone_at is not null then
    return;
  end if;
  select * into v_q from public.quests where id = v_ev.quest_id;

  if v_ev.action in ('raise', 'reveal', 'complete', 'fail') then
    -- Only reached for a HELD ledger verb being fired from the log: a normal
    -- one already moved the objective inline in apply_quest_consequences.
    -- Recording previous_status/previous_is_player_visible here, at the
    -- moment it actually happens, is what lets `previous` undo it correctly
    -- later — a held event's own columns are null until this runs.
    select status, is_player_visible into v_prev_status, v_prev_visible
      from public.quest_objectives where id = v_ev.target_objective_id;

    update public.quest_objectives
       set status = case v_ev.action
             when 'raise' then case when status = 'dormant' then 'pending' else status end
             when 'reveal' then case when status = 'dormant' then 'pending' else status end
             when 'complete' then case when status in ('dormant', 'pending') then 'complete' else status end
             when 'fail' then case when status in ('dormant', 'pending') then 'failed' else status end
           end,
           is_player_visible = case when v_ev.action = 'reveal' then true else is_player_visible end
     where id = v_ev.target_objective_id;

    update public.quest_consequence_events
       set previous_status = v_prev_status, previous_is_player_visible = v_prev_visible
     where id = p_event_id;

  elsif v_ev.action = 'create_calendar_event' then
    insert into public.calendar_events (
      user_id, campaign_id, title, description, event_type,
      year, month, day, linked_quest_id, player_visible
    ) values (
      v_q.user_id, v_ev.campaign_id,
      coalesce(nullif(btrim(v_ev.action_payload ->> 'title'), ''), v_q.title),
      v_ev.action_payload ->> 'description',
      -- #1011: event_type is NOT NULL; a rule written without one (an AI
      -- spine, an import) files under quest rather than failing at fire time.
      coalesce(nullif(btrim(v_ev.action_payload ->> 'event_type'), ''), 'quest'),
      p_year, p_month, p_day, v_ev.quest_id,
      false
    ) returning id into v_id;
    update public.quest_consequence_events set calendar_event_id = v_id where id = p_event_id;

  elsif v_ev.action = 'send_broadcast' then
    insert into public.campaign_messages (campaign_id, user_id, sender_name, message, type)
    values (v_ev.campaign_id, v_q.user_id, 'Grimoire',
            coalesce(nullif(btrim(v_ev.action_payload ->> 'message'), ''),
                     'Something has changed in ' || v_q.title || '.'),
            'system')
    returning id into v_id;
    update public.quest_consequence_events set message_id = v_id where id = p_event_id;

  elsif v_ev.action = 'shift_npc_relationship' then
    select n.relationship into v_prev_rel
      from public.npcs n
     where n.id = v_ev.target_npc_id and n.campaign_id = v_ev.campaign_id;

    v_to := v_ev.action_payload ->> 'to';
    if v_to is not null then
      -- The absolute form: "becomes helpful". Unlike a step it applies from
      -- `unknown` too — the DM is stating the stance outright, not moving it
      -- from one they never set — and it records the previous value
      -- (`unknown` included) so `previous` puts it back exactly.
      if v_to <> all (v_ladder) then
        raise exception 'shift_npc_relationship: unknown stance %', v_to using errcode = '22023';
      end if;
      if v_prev_rel is not null and v_prev_rel::text <> v_to then
        update public.npcs
           set relationship = v_to::public.npc_relationship
         where id = v_ev.target_npc_id;
        update public.quest_consequence_events
           set previous_relationship = v_prev_rel
         where id = p_event_id;
      end if;
    else
      v_step := coalesce((v_ev.action_payload ->> 'step')::int, 0);
      if v_prev_rel is not null and v_prev_rel <> 'unknown' and v_step <> 0 then
        v_idx := array_position(v_ladder, v_prev_rel::text);
        v_idx := least(greatest(v_idx + v_step, 1), array_length(v_ladder, 1));
        update public.npcs
           set relationship = v_ladder[v_idx]::public.npc_relationship
         where id = v_ev.target_npc_id;
        update public.quest_consequence_events
           set previous_relationship = v_prev_rel
         where id = p_event_id;
      end if;
    end if;

  elsif v_ev.action = 'unlock_quest' then
    select q.status into v_prev_quest_status
      from public.quests q
     where q.id = v_ev.target_quest_id and q.campaign_id = v_ev.campaign_id;

    if v_prev_quest_status = 'undiscovered' then
      update public.quests set status = 'active' where id = v_ev.target_quest_id;
      -- The bridge's target quest is entered sideways: its own entry beat is
      -- the rumour the party has now caused, so surface it the same way a
      -- quest arrived at by cursor would (see the enum-rebuild comment above).
      update public.quest_beats b
         set visibility = 'rumored'
        from public.quests q
       where q.id = v_ev.target_quest_id and q.entry_beat_id = b.id and b.visibility = 'hidden';
      update public.quest_consequence_events
         set previous_quest_status = v_prev_quest_status
       where id = p_event_id;
    end if;

  elsif v_ev.action = 'grant_knowledge' then
    v_text := v_ev.action_payload ->> 'text';
    if nullif(btrim(v_text), '') is null then
      raise exception 'grant_knowledge requires action_payload.text' using errcode = '22023';
    end if;
    insert into public.player_journal_entries (
      user_id, campaign_id, title, content, category, is_private,
      ref_type, ref_id, ref_label
    ) values (
      v_q.user_id, v_ev.campaign_id, left(btrim(v_text), 120), v_text, 'discovery', false,
      'quest', v_ev.quest_id, v_q.title
    ) returning id into v_id;
    update public.quest_consequence_events set journal_entry_id = v_id where id = p_event_id;

  elsif v_ev.action = 'owe_favor' then
    v_text := v_ev.action_payload ->> 'text';
    if nullif(btrim(v_text), '') is null then
      raise exception 'owe_favor requires action_payload.text' using errcode = '22023';
    end if;
    insert into public.npc_favors (campaign_id, npc_id, quest_id, text, source_event_id, created_by)
    values (v_ev.campaign_id, v_ev.target_npc_id, v_ev.quest_id, v_text, p_event_id, auth.uid())
    returning id into v_id;
    update public.quest_consequence_events set favor_id = v_id where id = p_event_id;

  elsif v_ev.action = 'award_milestone' then
    v_text := v_ev.action_payload ->> 'text';
    if nullif(btrim(v_text), '') is null then
      raise exception 'award_milestone requires action_payload.text' using errcode = '22023';
    end if;
    insert into public.party_milestones (campaign_id, quest_id, text, source_event_id, created_by)
    values (v_ev.campaign_id, v_ev.quest_id, v_text, p_event_id, auth.uid())
    returning id into v_id;
    update public.quest_consequence_events set milestone_id = v_id where id = p_event_id;

    insert into public.campaign_messages (campaign_id, user_id, sender_name, message, type)
    values (v_ev.campaign_id, v_q.user_id, 'Grimoire', '🏅 ' || v_text, 'system')
    returning id into v_id;
    update public.quest_consequence_events set message_id = v_id where id = p_event_id;

  elsif v_ev.action = 'give_handout' then
    -- The handout reaches the whole party, through the same reveal path as a
    -- DM's own share_handout (20261004105821), so a handout a quest gives
    -- reveals exactly what one handed over by hand does. Scoped to the
    -- event's campaign: this runs as definer, and a rule naming another
    -- campaign's document must change nothing. A handout moved out of the
    -- campaign since the rule was written is simply not given.
    select d.id, d.player_visible_to into v_doc
      from public.scriptorium_documents d
     where d.id = v_ev.target_document_id and d.campaign_id = v_ev.campaign_id
       and d.user_id = v_q.user_id;
    if found then
      v_added := array(
        select pm.id from public.party_members pm
         where pm.campaign_id = v_ev.campaign_id
        except
        select x from unnest(v_doc.player_visible_to) x);
      perform private.apply_handout_reveals(
        v_ev.campaign_id, private.book_body(v_doc.id)::text, v_doc.player_visible_to || v_added, false);
      -- Nobody new: no write, or updated_at would relight every holder's dot.
      if cardinality(v_added) > 0 then
        update public.scriptorium_documents
           set player_visible_to = v_doc.player_visible_to || v_added
         where id = v_doc.id;
      end if;
      -- The undo handle: only the recipients this event added, so undoing it
      -- never takes the handout from someone the DM gave it to by hand.
      update public.quest_consequence_events set handout_member_ids = v_added where id = p_event_id;
    end if;

  elsif v_ev.action = 'tick_clock' then
    -- Only reached for a HELD tick fired from the log; an unheld one moved
    -- the clock inline in apply_quest_consequences. Filling it here fires
    -- its rules under an assert transition of their own, as a tick from the
    -- run cockpit does.
    select * into v_clock from public.quest_clocks
     where id = v_ev.target_clock_id and campaign_id = v_ev.campaign_id for update;
    if found then
      update public.quest_consequence_events set previous_clock_filled = v_clock.filled where id = p_event_id;
      perform private.tick_quest_clock_by(v_clock.id, coalesce((v_ev.action_payload ->> 'step')::int, 1), null);
    end if;

  elsif v_ev.action = 'move_npc' then
    -- #1011. Scoped to the event's campaign on both ends: a definer must not
    -- move another campaign's NPC, or into another campaign's place.
    select n.location_id into v_prev_location
      from public.npcs n
     where n.id = v_ev.target_npc_id and n.campaign_id = v_ev.campaign_id;
    if found and exists (
      select 1 from public.locations l
       where l.id = v_ev.target_location_id and l.campaign_id = v_ev.campaign_id
    ) then
      update public.npcs set location_id = v_ev.target_location_id where id = v_ev.target_npc_id;
      update public.quest_consequence_events
         set previous_location_id = v_prev_location, npc_moved = true
       where id = p_event_id;
    end if;

  elsif v_ev.action = 'add_companion' then
    -- #1011. The same row CompanionForm seeds from an NPC: name, portrait,
    -- and the leading numbers of its stat block's HP, AC and speed. It joins
    -- the party unassigned; the DM gives it an owner on the Party page.
    select * into v_npc from public.npcs n
     where n.id = v_ev.target_npc_id and n.campaign_id = v_ev.campaign_id;
    if found then
      insert into public.companions (
        user_id, campaign_id, name, companion_type, source_type, source_npc_id,
        max_hp, current_hp, ac, speed, portrait_url, portrait_focal_point
      ) values (
        v_q.user_id, v_ev.campaign_id, v_npc.name, 'ally', 'npc', v_npc.id,
        coalesce(substring(v_npc.stat_block ->> 'hit_points' from '(\d+)')::int, 1),
        coalesce(substring(v_npc.stat_block ->> 'hit_points' from '(\d+)')::int, 1),
        coalesce(substring(v_npc.stat_block ->> 'armor_class' from '(\d+)')::int, 10),
        coalesce(substring(v_npc.stat_block ->> 'speed' from '(\d+)')::int, 30),
        v_npc.portrait_url, v_npc.portrait_focal_point
      ) returning id into v_id;
      update public.quest_consequence_events set companion_id = v_id where id = p_event_id;
    end if;

  elsif v_ev.action = 'shift_faction_standing' then
    -- #1011: the party's standing with a faction, on the NPC ladder and with
    -- the same two payload forms as shift_npc_relationship.
    select f.party_standing into v_prev_standing
      from public.factions f
     where f.id = v_ev.target_faction_id and f.campaign_id = v_ev.campaign_id;

    v_to := v_ev.action_payload ->> 'to';
    if v_to is not null then
      if v_to <> all (v_ladder) then
        raise exception 'shift_faction_standing: unknown stance %', v_to using errcode = '22023';
      end if;
      if v_prev_standing is not null and v_prev_standing::text <> v_to then
        update public.factions set party_standing = v_to::public.npc_relationship where id = v_ev.target_faction_id;
        update public.quest_consequence_events set previous_standing = v_prev_standing where id = p_event_id;
      end if;
    else
      v_step := coalesce((v_ev.action_payload ->> 'step')::int, 0);
      if v_prev_standing is not null and v_prev_standing <> 'unknown' and v_step <> 0 then
        v_idx := array_position(v_ladder, v_prev_standing::text);
        v_idx := least(greatest(v_idx + v_step, 1), array_length(v_ladder, 1));
        update public.factions set party_standing = v_ladder[v_idx]::public.npc_relationship where id = v_ev.target_faction_id;
        update public.quest_consequence_events set previous_standing = v_prev_standing where id = p_event_id;
      end if;
    end if;
  end if;

  update public.quest_consequence_events
     set performed_at = now(), held_at = null,
         performed_on_year = p_year, performed_on_month = p_month, performed_on_day = p_day
   where id = p_event_id;
end $function$;

CREATE OR REPLACE FUNCTION private.open_book_snapshot(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_book public.open_books;
  v_campaign public.campaigns;
  v_party uuid[];
  v_places jsonb := '[]'::jsonb;
  v_folk jsonb := '[]'::jsonb;
  v_factions jsonb := '[]'::jsonb;
  v_pantheons jsonb := '[]'::jsonb;
  v_deities jsonb := '[]'::jsonb;
  v_lore jsonb := '[]'::jsonb;
  v_sessions jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_names jsonb := '{}'::jsonb;
  v_cited uuid[];
  v_entry_ids uuid[];
  v_ties jsonb := '[]'::jsonb;
  v_concealed uuid[];
begin
  select * into v_book from public.open_books where campaign_id = p_campaign_id;
  if not found then
    return null;
  end if;
  select * into v_campaign from public.campaigns where id = p_campaign_id;
  select coalesce(array_agg(pm.id), '{}'::uuid[]) into v_party
    from public.party_members pm where pm.campaign_id = p_campaign_id;

  if 'atlas' = any (v_book.chapters) then
    -- As get_player_visible_locations: description and map only when shared, DM notes and audio never, and
    -- only the pins players may see.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', l.id,
             'parent_id', l.parent_id,
             'name', l.name,
             'location_type', l.location_type,
             'player_summary', l.player_summary,
             'description', case when l.is_description_shared then private.withhold_secret_blocks(l.description) end,
             'image_url', l.image_url,
             'tags', to_jsonb(l.tags),
             'is_level', l.is_level,
             'is_battle_map', l.is_battle_map,
             'npcs_shared', l.is_npcs_shared,
             'map', case when l.is_map_shared then jsonb_build_object(
                      'url', l.map_url,
                      'layer_url', l.map_layer_url,
                      'layer_calibration', l.map_layer_calibration,
                      'plan_size', l.plan_size,
                      'scale', l.map_scale) end,
             'pins', coalesce((
                      select jsonb_agg(pin)
                        from jsonb_array_elements(coalesce(l.map_pins, '[]'::jsonb)) pin
                       where coalesce((pin->>'visible_to_players')::boolean, false)), '[]'::jsonb)
           ) order by l.sort_order nulls last, l.name), '[]'::jsonb)
      into v_places
      from public.locations l
     where l.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'location', l.id,
             private.open_book_whole_party(l.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'folk' = any (v_book.chapters) then
    -- As get_player_visible_npcs: only the fields the DM shares, the cover while a disguise holds, the cover the
    -- party knew once it falls, and no prose (players are never shown an NPC's appearance, personality or
    -- backstory). A person whose name is not shared has no page to be on.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id,
             'name', case when s.concealed and s.disguise_name is not null then s.disguise_name else s.name end,
             'race', case when 'race' = any (s.player_visible_fields) then s.race end,
             'occupation', case when 'occupation' = any (s.player_visible_fields) then s.occupation end,
             'status', s.status,
             'relationship', s.relationship,
             'portrait_url', case
                when not ('portrait' = any (s.player_visible_fields)) then null
                when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_url
                else s.portrait_url end,
             'portrait_focal_point', case
                when not ('portrait' = any (s.player_visible_fields)) then null
                when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_focal_point
                else s.portrait_focal_point end,
             'cutout_url', case when 'portrait' = any (s.player_visible_fields) and not s.concealed then s.cutout_url end,
             'location_id', case when 'location' = any (s.player_visible_fields) then s.location_id end,
             'former_name', case when s.unmasked then s.disguise_name end,
             'former_portrait_url', case when s.unmasked and 'portrait' = any (s.player_visible_fields) then s.disguise_portrait_url end
           ) order by s.name), '[]'::jsonb)
      into v_folk
      from (
        select n.*,
          ((n.disguise_name is not null or n.disguise_portrait_url is not null) and not n.is_revealed) as concealed,
          (n.is_revealed and n.unmasked_at is not null
            and (n.disguise_name is not null or n.disguise_portrait_url is not null)) as unmasked
          from public.npcs n
         where n.campaign_id = p_campaign_id
           and 'name' = any (n.player_visible_fields)
      ) s
     where private.open_book_takes(p_campaign_id, 'npc', s.id,
             private.open_book_whole_party(s.player_visible_to, v_party)
             -- or shared with the party through the place they live, as the projection's arm (b)
             or exists (
               select 1 from public.locations l
                where l.id = s.location_id
                  and l.is_npcs_shared
                  and private.open_book_whole_party(l.player_visible_to, v_party)),
             v_book.include_shared);
  end if;

  if 'factions' = any (v_book.chapters) then
    -- As get_player_visible_factions: descent is the party's to know, the succession custom is not.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', f.id,
             'name', f.name,
             'faction_type', f.faction_type,
             'description', private.withhold_secret_blocks(f.description),
             'emblem_url', f.emblem_url,
             'alignment', f.alignment,
             'tags', to_jsonb(f.tags),
             'party_standing', f.party_standing,
             'descent', f.descent
           ) order by f.name), '[]'::jsonb)
      into v_factions
      from public.factions f
     where f.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'faction', f.id,
             private.open_book_whole_party(f.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'pantheon' = any (v_book.chapters) then
    -- Players read pantheons and deities as raw rows (DM notes on them live in entity_notes, which the book never
    -- reads); the book also strips the secret blocks the raw read would show.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id,
             'name', p.name,
             'description', private.withhold_secret_blocks(p.description),
             'emblem_url', p.emblem_url,
             'tags', to_jsonb(p.tags)
           ) order by p.name), '[]'::jsonb)
      into v_pantheons
      from public.pantheons p
     where p.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'pantheon', p.id,
             private.open_book_whole_party(p.player_visible_to, v_party), v_book.include_shared);

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id,
             'pantheon_id', d.pantheon_id,
             'name', d.name,
             'titles', d.titles,
             'alternate_names', to_jsonb(d.alternate_names),
             'alignment', d.alignment,
             'symbol', d.symbol,
             'symbol_image_url', d.symbol_image_url,
             'portrait_url', d.portrait_url,
             'portrait_focal_point', d.portrait_focal_point,
             'domains', to_jsonb(d.domains),
             'portfolio', d.portfolio,
             'description', private.withhold_secret_blocks(d.description),
             'tags', to_jsonb(d.tags)
           ) order by d.name), '[]'::jsonb)
      into v_deities
      from public.deities d
     where d.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'deity', d.id,
             private.open_book_whole_party(d.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'lore' = any (v_book.chapters) then
    -- As get_player_visible_notes, less the session reports, which are the Chronicle's.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', n.id,
             'title', n.title,
             'category', n.category,
             'content', private.withhold_secret_blocks(n.content),
             'tags', to_jsonb(n.tags),
             'is_pinned', n.is_pinned,
             'created_at', n.created_at,
             'updated_at', n.updated_at
           ) order by n.is_pinned desc, n.sort_order nulls last, n.title), '[]'::jsonb)
      into v_lore
      from public.notes n
     where n.campaign_id = p_campaign_id
       and n.category is distinct from 'session'
       and private.open_book_takes(p_campaign_id, 'note', n.id,
             private.open_book_whole_party(n.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'chronicle' = any (v_book.chapters) then
    -- Session reports, with the session they belong to (get_player_sessions' columns).
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', n.id,
             'title', n.title,
             'content', private.withhold_secret_blocks(n.content),
             'tags', to_jsonb(n.tags),
             'session', case when cs.id is not null then jsonb_build_object(
                          'number', cs.number, 'title', cs.title, 'played_on', cs.played_on) end,
             'date', case when n.session_start_year is not null then jsonb_build_object(
                       'year', n.session_start_year, 'month', n.session_start_month, 'day', n.session_start_day,
                       'end_year', n.session_end_year, 'end_month', n.session_end_month, 'end_day', n.session_end_day) end,
             'real_date', n.session_real_date,
             'created_at', n.created_at
           ) order by cs.number nulls last, n.session_real_date nulls last, n.created_at), '[]'::jsonb)
      into v_sessions
      from public.notes n
      left join public.campaign_sessions cs on cs.id = n.session_id
     where n.campaign_id = p_campaign_id
       and n.category = 'session'
       and private.open_book_takes(p_campaign_id, 'note', n.id,
             private.open_book_whole_party(n.player_visible_to, v_party), v_book.include_shared);

    -- The calendar players already read (calendar_events_select): shown events and every session. Never the
    -- DM's links to quests, encounters or places.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id,
             'title', e.title,
             'description', private.withhold_secret_blocks(e.description),
             'event_type', e.event_type,
             'year', e.year, 'month', e.month, 'day', e.day,
             'festival_day', e.festival_day,
             'is_multi_day', e.is_multi_day,
             'end_year', e.end_year, 'end_month', e.end_month, 'end_day', e.end_day,
             'color', e.color
           ) order by e.year nulls last, e.month nulls last, e.day nulls last), '[]'::jsonb)
      into v_events
      from public.calendar_events e
     where e.campaign_id = p_campaign_id
       and (e.player_visible or e.event_type = 'session');
  end if;

  -- Rich text mentions people and places by id only (entityMention stores no label), so the book carries a
  -- name for every id its own pages cite, when the whole table can already read that name: the party's
  -- characters, people under their cover, places and factions. Only cited ids: an entry the DM took out keeps
  -- its name out of the book unless released text names it. A mention of anything else stays unnamed.
  -- Cited means an entityMention in the released text, nothing else: a place's parent_id, a pin or a file name
  -- also hold ids, and reading those would name a place the DM took out (#1085 audit).
  select coalesce(array_agg(distinct c.id), '{}'::uuid[])
    into v_cited
    from (
      select jsonb_path_query(v_places, '$[*].description') #>> '{}' as doc
      union all select jsonb_path_query(v_factions, '$[*].description') #>> '{}'
      union all select jsonb_path_query(v_pantheons, '$[*].description') #>> '{}'
      union all select jsonb_path_query(v_deities, '$[*].description') #>> '{}'
      union all select jsonb_path_query(v_lore, '$[*].content') #>> '{}'
      union all select jsonb_path_query(v_sessions, '$[*].content') #>> '{}'
      union all select jsonb_path_query(v_events, '$[*].description') #>> '{}'
    ) t
    cross join lateral unnest(private.open_book_mentions(t.doc)) as c(id);

  select coalesce(jsonb_object_agg(x.id::text, x.name), '{}'::jsonb)
    into v_names
    from (
      select pm.id, pm.name from public.party_members pm where pm.campaign_id = p_campaign_id
      union all
      select n.id,
             case when (n.disguise_name is not null or n.disguise_portrait_url is not null) and not n.is_revealed
                       and n.disguise_name is not null
                  then n.disguise_name else n.name end
        from public.npcs n
       where n.campaign_id = p_campaign_id
         and 'name' = any (n.player_visible_fields)
         and (private.open_book_whole_party(n.player_visible_to, v_party)
              or exists (
                select 1 from public.locations l
                 where l.id = n.location_id
                   and l.is_npcs_shared
                   and private.open_book_whole_party(l.player_visible_to, v_party)))
      union all
      select l.id, l.name from public.locations l
       where l.campaign_id = p_campaign_id and private.open_book_whole_party(l.player_visible_to, v_party)
      union all
      select f.id, f.name from public.factions f
       where f.campaign_id = p_campaign_id and private.open_book_whole_party(f.player_visible_to, v_party)
    ) x
   where x.name is not null
     and x.id = any (v_cited);

  -- World Web (#1084): the ties between two entries that are both in the book, as cross-references. The book
  -- never runs ahead of the table: a link only once the whole party knows it, a record by the rule the player
  -- projection already applies (a membership once the whole party knows it, never a disguised NPC's; a home only where
  -- the NPC's location is shared).
  -- A tie to anything not in this release is left out, so a reader can follow every one to its page.
  select coalesce(array_agg(distinct x.id), '{}'::uuid[]) into v_entry_ids
    from (
      select (e->>'id')::uuid as id from jsonb_array_elements(v_places) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_folk) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_factions) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_deities) e
    ) x;

  -- A disguised NPC is in the book under the cover; the true one's allegiances and family stay out until it falls.
  select coalesce(array_agg(n.id), '{}'::uuid[]) into v_concealed
    from public.npcs n
   where n.campaign_id = p_campaign_id and not n.is_revealed
     and (n.disguise_name is not null or n.disguise_portrait_url is not null);

  select coalesce(jsonb_agg(jsonb_build_object(
           'source', t.source, 'type', t.type,
           'from_kind', t.from_kind, 'from_id', t.from_id, 'to_kind', t.to_kind, 'to_id', t.to_id,
           'told', t.told)
           order by t.source, t.type, t.from_id, t.to_id), '[]'::jsonb)
    into v_ties
    from (
      select 'link' as source, l.type, l.from_kind, l.from_id, l.to_kind, l.to_id, nullif(l.told, '') as told
        from public.world_links l
       where l.campaign_id = p_campaign_id and private.open_book_whole_party(l.player_visible_to, v_party)
      union all
      select 'membership', 'member_of', 'npc', m.npc_id, 'faction', m.faction_id, null
        from public.faction_npcs m join public.factions f on f.id = m.faction_id
       where f.campaign_id = p_campaign_id
         and private.open_book_whole_party(m.player_visible_to, v_party)
         and m.npc_id <> all (v_concealed)
      union all
      select 'npc_home', 'lives_in', 'npc', n.id, 'location', n.location_id, null
        from public.npcs n
       where n.campaign_id = p_campaign_id and n.location_id is not null and 'location' = any (n.player_visible_fields)
      union all
      select 'seat', 'seat', 'faction', f.id, 'location', f.seat_location_id, null
        from public.factions f where f.campaign_id = p_campaign_id and f.seat_location_id is not null
      union all
      select 'kin', k.kind || '_of', 'npc', k.from_npc_id, 'npc', k.to_npc_id, null
        from public.kin_links k
       where k.campaign_id = p_campaign_id and k.from_npc_id is not null and k.to_npc_id is not null
         and k.from_npc_id <> all (v_concealed) and k.to_npc_id <> all (v_concealed)
    ) t
   where t.from_id = any (v_entry_ids) and t.to_id = any (v_entry_ids);

  return jsonb_build_object(
    'v', 1,
    'book', jsonb_build_object(
      'title', v_book.title,
      'subtitle', v_book.subtitle,
      'cover_art', v_book.cover_art,
      'cover_image_url', v_book.cover_image_url,
      'leather', v_book.leather,
      'chapters', to_jsonb(v_book.chapters),
      'campaign_name', v_campaign.name),
    'calendar', jsonb_build_object(
      'calendar_id', v_campaign.calendar_id,
      'custom_calendar', v_campaign.custom_calendar,
      'current', jsonb_build_object('year', v_campaign.current_year, 'month', v_campaign.current_month, 'day', v_campaign.current_day)),
    'places', v_places,
    'folk', v_folk,
    'factions', v_factions,
    'pantheons', v_pantheons,
    'deities', v_deities,
    'lore', v_lore,
    'sessions', v_sessions,
    'events', v_events,
    'names', v_names,
    'ties', v_ties,
    'stats', jsonb_build_object(
      'places', jsonb_array_length(v_places),
      'folk', jsonb_array_length(v_folk),
      'factions', jsonb_array_length(v_factions),
      'pantheons', jsonb_array_length(v_pantheons),
      'deities', jsonb_array_length(v_deities),
      'lore', jsonb_array_length(v_lore),
      'sessions', jsonb_array_length(v_sessions),
      'events', jsonb_array_length(v_events))
  );
end;
$function$;

-- ── The server reads no calendar as the blank one ───────────────────────────

CREATE OR REPLACE FUNCTION private.calendar_shape(p_calendar_id text, p_custom jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  if p_calendar_id = 'custom' and p_custom is not null then
    -- Sequential checks: an OR is not guaranteed to short-circuit, and
    -- jsonb_array_elements raises on anything but an array.
    if jsonb_typeof(p_custom -> 'months') is distinct from 'array'
       or jsonb_array_length(p_custom -> 'months') = 0 then
      return null;
    end if;
    if exists (select 1 from jsonb_array_elements(p_custom -> 'months') m
                where jsonb_typeof(m -> 'days') is distinct from 'number') then
      return null;
    end if;
    -- Every one a number now, so the range can be read; a value past an
    -- integer would make the cast below raise, and the campaign trigger that
    -- calls this would then refuse every write to the calendar, the fix too.
    if exists (select 1 from jsonb_array_elements(p_custom -> 'months') m
                where (m ->> 'days')::numeric not between 0 and 2147483647) then
      return null;
    end if;
    if p_custom ? 'intercalaryDays' then
      if jsonb_typeof(p_custom -> 'intercalaryDays') is distinct from 'array' then
        return null;
      end if;
      if exists (select 1 from jsonb_array_elements(p_custom -> 'intercalaryDays') d
                  where jsonb_typeof(d -> 'afterMonth') is distinct from 'number') then
        return null;
      end if;
      if exists (select 1 from jsonb_array_elements(p_custom -> 'intercalaryDays') d
                  where (d ->> 'afterMonth')::numeric not between -2147483648 and 2147483647) then
        return null;
      end if;
    end if;

    return jsonb_build_object(
      'months', (select jsonb_agg((m -> 'days')::integer order by i)
                   from jsonb_array_elements(p_custom -> 'months') with ordinality t(m, i)),
      'intercalary', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'after', (d -> 'afterMonth')::integer,
                 'leap_only', coalesce(d -> 'isLeapOnly' = 'true'::jsonb, false)) order by i)
          from jsonb_array_elements(coalesce(p_custom -> 'intercalaryDays', '[]'::jsonb)) with ordinality t(d, i)
      ), '[]'::jsonb),
      -- calendarDefToAdapter: anything but every4 or gregorian never leaps.
      'leap_rule', case when p_custom ->> 'leapYearRule' in ('every4', 'gregorian')
                        then p_custom ->> 'leapYearRule' else 'none' end,
      'leap_month', null
    );
  end if;

  return case p_calendar_id
    when 'eberron' then '{"months": [28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], "intercalary": [], "leap_rule": "none", "leap_month": null}'
    when 'greyhawk' then '{"months": [28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], "intercalary": [{"after": 12, "leap_only": false}, {"after": 3, "leap_only": false}, {"after": 6, "leap_only": false}, {"after": 9, "leap_only": false}], "leap_rule": "none", "leap_month": null}'
    when 'dragonlance' then '{"months": [28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], "intercalary": [], "leap_rule": "none", "leap_month": null}'
    when 'ravenloft' then '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [{"after": 6, "leap_only": false}, {"after": 12, "leap_only": false}], "leap_rule": "none", "leap_month": null}'
    when 'planescape' then '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [{"after": 3, "leap_only": false}, {"after": 6, "leap_only": false}, {"after": 9, "leap_only": false}, {"after": 12, "leap_only": false}], "leap_rule": "none", "leap_month": null}'
    when 'spelljammer' then '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [{"after": 3, "leap_only": false}, {"after": 6, "leap_only": false}, {"after": 9, "leap_only": false}], "leap_rule": "none", "leap_month": null}'
    when 'darksun' then '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [{"after": 4, "leap_only": false}, {"after": 8, "leap_only": false}, {"after": 11, "leap_only": false}], "leap_rule": "none", "leap_month": null}'
    when 'mystara' then '{"months": [28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], "intercalary": [{"after": 2, "leap_only": false}, {"after": 6, "leap_only": false}, {"after": 9, "leap_only": false}, {"after": 12, "leap_only": false}], "leap_rule": "none", "leap_month": null}'
    when 'gregorian' then '{"months": [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], "intercalary": [], "leap_rule": "gregorian", "leap_month": 2}'
    when 'faerun' then '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [{"after": 1, "leap_only": false}, {"after": 4, "leap_only": false}, {"after": 7, "leap_only": false}, {"after": 7, "leap_only": true}, {"after": 9, "leap_only": false}, {"after": 11, "leap_only": false}], "leap_rule": "every4", "leap_month": null}'
    -- No calendar chosen (null), an id this build does not know, or 'custom'
    -- with no stored definition: the blank calendar, createDefaultCustomCalendarDef
    -- (src/settings/types.ts). Never a setting nobody picked.
    else '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [], "leap_rule": "none", "leap_month": null}'
  end::jsonb;
end
$function$;

-- Nothing still names the old columns.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname in ('public', 'private') and p.prosrc ilike '%harptos_%') then
    raise exception 'a function still names a harptos_* column';
  end if;
end;
$$;
