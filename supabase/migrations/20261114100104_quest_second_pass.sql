-- #1194, the second pass on the one-screen quest page. Canvas *Quest One
-- Screen*, frames 08 to 11, approved 14 Nov 2026. In this migration:
--
--   1. The quest's own DM notes (quests.dm_content). #793 moved all quest
--      prose onto beats; a session plan's premise, goals and themes belong to
--      no single scene, and an imported plan lost all of it.
--   2. A route says what the party does (label) and what it costs (note).
--      `label` replaces `thread_label`: an "and also" route's label already
--      names the thread it opens.
--   3. A beat can be Secret: no rumour before the party arrives.
--   4. A move writes what players know. Arriving reveals the beat; a beat one
--      route away becomes rumored unless it is Secret. The transition records
--      what it changed, so Undo takes exactly that back. The first beat a move
--      shows on a quest shared with nobody shares it with the whole party, as
--      the client did before (useShareQuest), now server-side because the
--      client no longer sets visibility on a move.
--   5. Objectives follow their beat: players see an objective once it is
--      raised (status is no longer 'dormant'). quest_objectives
--      .is_player_visible goes, and the `reveal` ledger verb folds into
--      `raise`, which now means "the party learns of it".
--      On 14 Nov 2026 no other DM had an objective on a quest shared with
--      players, so this changed nothing their players could see.
--   6. document_imports.own_writing, and the import prompt: scenes are
--      paraphrased in full, routes carry kind/label/note, and the quest has
--      dm_content.

-- 1–3. ─────────────────────────────────────────────────────────────────────
alter table public.quests add column dm_content text;
comment on column public.quests.dm_content is
  'The quest''s own DM notes: what belongs to no single scene (premise, goals, themes, prep). Rich text, DM only. #1194.';

alter table public.quest_beat_edges rename column thread_label to label;
alter table public.quest_beat_edges add column note text;
comment on column public.quest_beat_edges.label is
  'What the party does to take this route. A parallel route''s label also names the thread it opens. #1194.';
comment on column public.quest_beat_edges.note is
  'One line on what the route leads to or costs. #1194.';

alter table public.quest_beats add column secret boolean not null default false;
comment on column public.quest_beats.secret is
  'Players hear nothing of this beat until the party arrives: no automatic rumour from one route away. #1194.';

alter table public.document_imports add column own_writing boolean not null default false;
comment on column public.document_imports.own_writing is
  'The DM wrote this source themselves: prose is kept word for word instead of paraphrased. #1194.';

-- 5. Objectives follow their beat ──────────────────────────────────────────
-- A reveal written beside a raise of the same objective on the same trigger
-- says nothing the raise does not now say: it goes, and its events point at
-- the raise.
create temporary table reveal_twins on commit drop as
select r.id as reveal_id, k.id as raise_id
  from public.quest_consequences r
  join public.quest_consequences k
    on k.action = 'raise'
   and k.quest_id = r.quest_id
   and k.target_objective_id = r.target_objective_id
   and k.on_beat_id is not distinct from r.on_beat_id
   and k.on_beat_outcome is not distinct from r.on_beat_outcome
   and k.on_edge_id is not distinct from r.on_edge_id
   and k.on_location_id is not distinct from r.on_location_id
   and k.on_location_fact is not distinct from r.on_location_fact
   and k.on_clock_id is not distinct from r.on_clock_id
   and k.on_objective_id is not distinct from r.on_objective_id
   and k.on_objective_status is not distinct from r.on_objective_status
   and k.on_quest_settled is not distinct from r.on_quest_settled
 where r.action = 'reveal';
update public.quest_consequence_events ev
   set consequence_id = t.raise_id
  from reveal_twins t
 where ev.consequence_id = t.reveal_id;
delete from public.quest_consequences c using reveal_twins t where c.id = t.reveal_id;

update public.quest_consequences set action = 'raise' where action = 'reveal';
update public.quest_consequence_events set action = 'raise' where action = 'reveal';

alter table public.quest_consequences drop constraint quest_consequences_target_matches_action;
alter table public.quest_consequences add constraint quest_consequences_target_matches_action
  check ((action = any (array['raise', 'complete', 'fail'])) = (target_objective_id is not null));
alter table public.quest_consequences drop constraint quest_consequences_action_check;
alter table public.quest_consequences add constraint quest_consequences_action_check
  check (action = any (array['raise', 'complete', 'fail', 'tick_clock', 'create_calendar_event',
    'send_broadcast', 'shift_npc_relationship', 'unlock_quest', 'grant_knowledge', 'owe_favor',
    'award_milestone', 'give_handout', 'move_npc', 'add_companion', 'shift_faction_standing']));

CREATE OR REPLACE FUNCTION private.apply_quest_consequences(p_campaign_id uuid, p_quest_id uuid, p_transition_id uuid, p_beat_id uuid DEFAULT NULL::uuid, p_edge_id uuid DEFAULT NULL::uuid, p_changed_objective_ids uuid[] DEFAULT '{}'::uuid[], p_settled_before boolean DEFAULT NULL::boolean, p_hold uuid[] DEFAULT '{}'::uuid[], p_location_id uuid DEFAULT NULL::uuid, p_location_fact text DEFAULT NULL::text, p_clock_id uuid DEFAULT NULL::uuid, p_beat_outcome text DEFAULT 'arrived'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_settled_before boolean;
  v_rule record;
  v_prev_status text;
  v_event_id uuid;
  v_changed uuid[] := coalesce(p_changed_objective_ids, '{}');
  v_hold uuid[] := coalesce(p_hold, '{}');
  v_fired boolean;
  v_round integer := 0;
  v_today record;
  -- Clocks that filled during this transition: the caller's (tick_quest_clock)
  -- and any a tick_clock rule fills in the cascade below (#1011).
  v_filled_clocks uuid[] := case when p_clock_id is null then '{}'::uuid[] else array[p_clock_id] end;
  v_prev_filled integer;
  v_new_filled integer;
  v_segments integer;
  v_moved boolean;
begin
  v_settled_before := coalesce(p_settled_before, private.quest_ledger_settled(p_quest_id));
  select current_year, current_month, current_day into v_today
    from public.campaigns where id = p_campaign_id;

  loop
    v_fired := false;

    for v_rule in
      select c.*
        from public.quest_consequences c
       where c.quest_id = p_quest_id
         and not exists (
           select 1 from public.quest_consequence_events e
            where e.transition_id = p_transition_id and e.consequence_id = c.id
         )
         and (
           (v_round = 0 and (
              (p_beat_id is not null and c.on_beat_id = p_beat_id
               and c.on_beat_outcome = coalesce(p_beat_outcome, 'arrived'))
              or (p_edge_id is not null and c.on_edge_id = p_edge_id)
              -- #869: a place's fact, named by the caller like a beat or an
              -- edge is -- round 0 only, since nothing the engine itself does
              -- ever asserts a location fact.
              or (p_location_id is not null
                  and c.on_location_id = p_location_id
                  and c.on_location_fact = p_location_fact)
           ))
           -- #1011: a clock that filled, named by the caller in round 0 or
           -- filled by a tick_clock rule in an earlier round.
           or (c.on_clock_id is not null and c.on_clock_id = any(v_filled_clocks))
           or (
              c.on_objective_id = any(v_changed)
              and c.on_objective_status = (
                select o.status from public.quest_objectives o where o.id = c.on_objective_id
              )
           )
         )
       order by c.created_at, c.id
    loop
      v_fired := true;
      v_prev_status := null;
      v_prev_filled := null;
      v_moved := false;

      -- A held rule is logged as having applied to this beat/edge — the DM
      -- untucked it deliberately — but changes nothing, performs nothing, and
      -- does not seed the cascade with an objective that never actually moved.
      if v_rule.id = any(v_hold) then
        insert into public.quest_consequence_events (
          campaign_id, quest_id, transition_id, consequence_id, action,
          target_objective_id, target_npc_id, target_quest_id, target_document_id,
          target_clock_id, target_location_id, target_faction_id,
          action_payload, after_days, fires_on_year, fires_on_month, fires_on_day,
          held_at
        ) values (
          p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
          v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, private.handout_still_in_campaign(v_rule.target_document_id, p_campaign_id),
          v_rule.target_clock_id, v_rule.target_location_id, v_rule.target_faction_id,
          v_rule.action_payload, v_rule.after_days,
          v_today.current_year, v_today.current_month, v_today.current_day,
          now()
        );
        continue;
      end if;

      if v_rule.action in ('raise', 'complete', 'fail') then
        select status into v_prev_status
          from public.quest_objectives where id = v_rule.target_objective_id;

        -- #1011: settled is final for rules. complete and fail move only an
        -- objective that is still open (dormant or pending); one that has
        -- already settled keeps its result. The DM can still set it by hand
        -- (assert_quest_objective_status) or undo the step that settled it.
        update public.quest_objectives
           set status = case v_rule.action
                 when 'raise' then case when status = 'dormant' then 'pending' else status end
                 when 'complete' then case when status in ('dormant', 'pending') then 'complete' else status end
                 when 'fail' then case when status in ('dormant', 'pending') then 'failed' else status end
               end
         where id = v_rule.target_objective_id;

        -- Moved = its status changed; a complete that hit a settled
        -- objective did not move it. (#1194: an objective has no visibility
        -- of its own any more: players see it once it is raised.)
        v_moved := exists (
          select 1 from public.quest_objectives o
           where o.id = v_rule.target_objective_id
             and o.status is distinct from v_prev_status
        );
      elsif v_rule.action = 'tick_clock' then
        -- A clock is engine state like an objective: it moves now, inside the
        -- transition, and filling it seeds the next cascade round.
        select filled, segments into v_prev_filled, v_segments
          from public.quest_clocks where id = v_rule.target_clock_id for update;
        v_new_filled := least(greatest(
          v_prev_filled + coalesce((v_rule.action_payload ->> 'step')::int, 1), 0), v_segments);
        update public.quest_clocks set filled = v_new_filled where id = v_rule.target_clock_id;
        if v_new_filled = v_segments and v_prev_filled < v_segments
           and not (v_rule.target_clock_id = any(v_filled_clocks)) then
          v_filled_clocks := v_filled_clocks || v_rule.target_clock_id;
        end if;
      end if;

      insert into public.quest_consequence_events (
        campaign_id, quest_id, transition_id, consequence_id, action,
        target_objective_id, target_npc_id, target_quest_id, target_document_id, previous_status,
        target_clock_id, previous_clock_filled, target_location_id, target_faction_id,
        action_payload, after_days, fires_on_year, fires_on_month, fires_on_day,
        performed_at, performed_on_year, performed_on_month, performed_on_day
      ) values (
        p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
        v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, private.handout_still_in_campaign(v_rule.target_document_id, p_campaign_id), v_prev_status,
        v_rule.target_clock_id, v_prev_filled, v_rule.target_location_id, v_rule.target_faction_id,
        v_rule.action_payload, v_rule.after_days,
        v_today.current_year, v_today.current_month, v_today.current_day,
        -- An engine-state verb has just applied above: it is performed now.
        case when private.quest_action_is_world(v_rule.action) then null else now() end,
        case when private.quest_action_is_world(v_rule.action) then null else v_today.current_year end,
        case when private.quest_action_is_world(v_rule.action) then null else v_today.current_month end,
        case when private.quest_action_is_world(v_rule.action) then null else v_today.current_day end
      ) returning id into v_event_id;

      -- World actions perform now when due immediately. The three verbs added
      -- by #852 (grant_knowledge, owe_favor, award_milestone) join the four
      -- that already performed this way — they are world actions too, just
      -- ones with somewhere specific to write.
      if v_rule.after_days = 0 and private.quest_action_is_world(v_rule.action) then
        perform private.perform_quest_consequence(
          v_event_id, v_today.current_year, v_today.current_month, v_today.current_day
        );
      end if;

      if v_moved and not (v_rule.target_objective_id = any(v_changed)) then
        v_changed := v_changed || v_rule.target_objective_id;
      end if;
    end loop;

    exit when not v_fired;
    v_round := v_round + 1;
    if v_round > 8 then
      raise exception 'consequence cascade exceeded 8 rounds on quest % — check for a rule loop', p_quest_id;
    end if;
  end loop;

  if not v_settled_before and private.quest_ledger_settled(p_quest_id) then
    for v_rule in
      select c.* from public.quest_consequences c
       where c.quest_id = p_quest_id and c.on_quest_settled
         and not exists (
           select 1 from public.quest_consequence_events e
            where e.transition_id = p_transition_id and e.consequence_id = c.id
         )
       order by c.created_at, c.id
    loop
      if v_rule.id = any(v_hold) then
        insert into public.quest_consequence_events (
          campaign_id, quest_id, transition_id, consequence_id, action,
          target_objective_id, target_npc_id, target_quest_id, target_document_id,
          target_clock_id, target_location_id, target_faction_id, action_payload, after_days,
          fires_on_year, fires_on_month, fires_on_day, held_at
        ) values (
          p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
          v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, private.handout_still_in_campaign(v_rule.target_document_id, p_campaign_id),
          v_rule.target_clock_id, v_rule.target_location_id, v_rule.target_faction_id, v_rule.action_payload, v_rule.after_days,
          v_today.current_year, v_today.current_month, v_today.current_day, now()
        );
        continue;
      end if;

      v_prev_status := null;
      v_prev_filled := null;
      if v_rule.action in ('raise', 'complete', 'fail') then
        select status into v_prev_status
          from public.quest_objectives where id = v_rule.target_objective_id;
        update public.quest_objectives
           set status = case v_rule.action
                 when 'raise' then case when status = 'dormant' then 'pending' else status end
                 when 'complete' then case when status in ('dormant', 'pending') then 'complete' else status end
                 when 'fail' then case when status in ('dormant', 'pending') then 'failed' else status end
               end
         where id = v_rule.target_objective_id;
      elsif v_rule.action = 'tick_clock' then
        select filled, segments into v_prev_filled, v_segments
          from public.quest_clocks where id = v_rule.target_clock_id for update;
        update public.quest_clocks
           set filled = least(greatest(v_prev_filled + coalesce((v_rule.action_payload ->> 'step')::int, 1), 0), v_segments)
         where id = v_rule.target_clock_id;
      end if;

      insert into public.quest_consequence_events (
        campaign_id, quest_id, transition_id, consequence_id, action,
        target_objective_id, target_npc_id, target_quest_id, target_document_id,
        previous_status, previous_clock_filled,
        target_clock_id, target_location_id, target_faction_id, action_payload, after_days,
        fires_on_year, fires_on_month, fires_on_day,
        performed_at, performed_on_year, performed_on_month, performed_on_day
      ) values (
        p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
        v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, private.handout_still_in_campaign(v_rule.target_document_id, p_campaign_id),
        v_prev_status, v_prev_filled,
        v_rule.target_clock_id, v_rule.target_location_id, v_rule.target_faction_id, v_rule.action_payload, v_rule.after_days,
        v_today.current_year, v_today.current_month, v_today.current_day,
        case when private.quest_action_is_world(v_rule.action) then null else now() end,
        case when private.quest_action_is_world(v_rule.action) then null else v_today.current_year end,
        case when private.quest_action_is_world(v_rule.action) then null else v_today.current_month end,
        case when private.quest_action_is_world(v_rule.action) then null else v_today.current_day end
      ) returning id into v_event_id;

      if v_rule.after_days = 0 and private.quest_action_is_world(v_rule.action) then
        perform private.perform_quest_consequence(
          v_event_id, v_today.current_year, v_today.current_month, v_today.current_day
        );
      end if;
    end loop;
  end if;
end $function$;

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

  if v_ev.action in ('raise', 'complete', 'fail') then
    -- Only reached for a HELD ledger verb being fired from the log: a normal
    -- one already moved the objective inline in apply_quest_consequences.
    -- Recording previous_status here, at the
    -- moment it actually happens, is what lets `previous` undo it correctly
    -- later — a held event's own columns are null until this runs.
    select status into v_prev_status
      from public.quest_objectives where id = v_ev.target_objective_id;

    update public.quest_objectives
       set status = case v_ev.action
             when 'raise' then case when status = 'dormant' then 'pending' else status end
             when 'complete' then case when status in ('dormant', 'pending') then 'complete' else status end
             when 'fail' then case when status in ('dormant', 'pending') then 'failed' else status end
           end
     where id = v_ev.target_objective_id;

    update public.quest_consequence_events
       set previous_status = v_prev_status
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

CREATE OR REPLACE FUNCTION public.assert_quest_objective_status(p_objective_id uuid, p_status text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_obj  public.quest_objectives%rowtype;
  v_q    public.quests%rowtype;
  v_tid  uuid;
  v_settled_before boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_status not in ('dormant', 'pending', 'complete', 'failed') then
    raise exception 'Unknown objective status %', p_status using errcode = '22023';
  end if;

  select * into v_obj from public.quest_objectives where id = p_objective_id;
  if not found then
    raise exception 'Objective not found' using errcode = 'P0002';
  end if;
  select * into v_q from public.quests where id = v_obj.quest_id;
  if v_q.campaign_id is null or not coalesce(private.is_campaign_dm(v_q.campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  -- Nothing became anything; do not write a transition or fire rules.
  if v_obj.status = p_status then
    return jsonb_build_object('changed', false, 'status', p_status);
  end if;

  -- Taken before the update below, because the update is what may settle it.
  v_settled_before := private.quest_ledger_settled(v_q.id);

  update public.quest_objectives
     set status = p_status
   where id = p_objective_id;

  insert into public.quest_beat_transitions (
    campaign_id, from_quest_id, to_quest_id, transition_kind, reason, created_by, to_quest_title
  ) values (
    v_q.campaign_id, v_q.id, v_q.id, 'assert', nullif(btrim(p_reason), ''), auth.uid(), v_q.title
  ) returning id into v_tid;

  perform private.apply_quest_consequences(
    v_q.campaign_id, v_q.id, v_tid, null, null, array[p_objective_id], v_settled_before
  );

  return jsonb_build_object('changed', true, 'status', p_status, 'transition_id', v_tid);
end $function$;

drop policy quest_objectives_select on public.quest_objectives;
create policy quest_objectives_select on public.quest_objectives for select using (
  ((status <> 'dormant') and private.is_quest_player_visible(quest_id))
  or exists (select 1 from public.quests q where q.id = quest_objectives.quest_id)
);

alter table public.quest_objectives drop column is_player_visible;
alter table public.quest_consequence_events drop column previous_is_player_visible;

-- 2. The edge's label, everywhere it was thread_label ──────────────────────
CREATE OR REPLACE FUNCTION public.mark_quest_move(p_campaign_id uuid, p_quest_id uuid, p_thread_id uuid, p_kind text, p_edge_id uuid DEFAULT NULL::uuid, p_beat_id uuid DEFAULT NULL::uuid, p_session_id uuid DEFAULT NULL::uuid, p_place_party boolean DEFAULT false, p_dispatch_loot_ids uuid[] DEFAULT NULL::uuid[], p_move_party_to uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
-- Records a move that already happened, as `assert` transitions that fire the
-- consequences a played arrival would. Every transition one call writes
-- carries the same `move_id` in its provenance, so Undo takes the whole move
-- back at once. A move further along the story fills in the way there: the
-- beats on the shortest route from where the thread last was (or from the
-- quest's entry, when it has not started) that the thread has not reached.
declare
  v_quest public.quests%rowtype;
  v_thread public.quest_threads%rowtype;
  v_state public.quest_runtime_state%rowtype;
  v_edge public.quest_beat_edges%rowtype;
  v_target uuid;
  v_reach uuid;
  v_from uuid;
  v_prev uuid;
  v_title text;
  v_tid uuid;
  v_tids uuid[] := '{}';
  v_place boolean := coalesce(p_place_party, false);
  v_loot uuid[] := coalesce(p_dispatch_loot_ids, '{}');
  v_move_id uuid := gen_random_uuid();
  -- The thread the move lands on: the caller's, except that taking a
  -- parallel route opens a thread of its own, as Advance does at the table.
  v_move_thread uuid := p_thread_id;
  v_path uuid[];
  v_beat uuid;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  if p_kind is null or p_kind not in ('route', 'party_here', 'failed') then
    raise exception 'Unknown quest move: %', p_kind using errcode = '22023';
  end if;

  select * into v_quest from public.quests
   where id = p_quest_id and campaign_id = p_campaign_id;
  if not found then
    raise exception 'Quest not found in this campaign' using errcode = 'P0002';
  end if;

  select * into v_thread from public.quest_threads
   where id = p_thread_id and quest_id = p_quest_id and campaign_id = p_campaign_id;
  if not found then
    raise exception 'That thread does not belong to this quest' using errcode = 'P0002';
  end if;
  if v_thread.status = 'merged' then
    raise exception 'This thread was merged into another thread' using errcode = '23514';
  end if;

  if p_kind = 'route' then
    select * into v_edge from public.quest_beat_edges
     where id = p_edge_id and quest_id = p_quest_id and campaign_id = p_campaign_id;
    if not found then
      raise exception 'That route does not belong to this quest' using errcode = '23503';
    end if;
    v_target := v_edge.target_beat_id;
    -- The way in leads to where the route leaves from.
    v_reach := v_edge.source_beat_id;
    if exists (select 1 from public.quest_beats b where b.id = v_target and b.kind = 'archived') then
      raise exception 'That route leads to an archived beat' using errcode = '23514';
    end if;
  else
    if not exists (
      select 1 from public.quest_beats b
       where b.id = p_beat_id and b.quest_id = p_quest_id and b.campaign_id = p_campaign_id
    ) then
      raise exception 'That beat does not belong to this quest' using errcode = '23503';
    end if;
    v_target := p_beat_id;
    v_reach := p_beat_id;
  end if;

  if cardinality(v_loot) > 0 and exists (
    select 1 from unnest(v_loot) e(id)
     where not exists (
       select 1 from public.loot_placements l
        where l.id = e.id and l.quest_id = p_quest_id and l.campaign_id = p_campaign_id
          and l.beat_id = v_target and l.dispatched_at is null
     )
  ) then
    raise exception 'One or more loot entries are not undispatched loot on the target beat' using errcode = '23514';
  end if;

  if p_move_party_to is not null and not exists (
    select 1 from public.locations lo where lo.id = p_move_party_to and lo.campaign_id = p_campaign_id
  ) then
    raise exception 'That place is not in this campaign' using errcode = '23503';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_campaign_id::text || ':' || p_quest_id::text || ':' || p_thread_id::text, 0));

  select * into v_state from public.quest_runtime_state
   where quest_id = p_quest_id and campaign_id = p_campaign_id and thread_id = p_thread_id;

  -- Where the thread last was: its newest arrival, else its cursor. A thread
  -- that never started begins at the quest's entry.
  select t.to_beat_id into v_prev
    from public.quest_beat_transitions t
   where t.campaign_id = p_campaign_id and t.to_quest_id = p_quest_id
     and t.thread_id = p_thread_id and t.to_beat_id is not null
   order by t.seq desc
   limit 1;
  if v_prev is null then v_prev := v_state.current_beat_id; end if;

  -- Fill in the way to v_reach: each beat on the shortest route there that
  -- this thread has not reached, in story order. With no start, the route
  -- runs from the entry, which is then filled in too.
  v_path := private.quest_beat_path(p_quest_id, coalesce(v_prev, v_quest.entry_beat_id), v_reach);
  if v_path is not null then
    foreach v_beat in array v_path loop
      -- v_reach itself is the move's own arrival below, except on a route,
      -- where it is the source the route leaves from and is filled in here.
      continue when v_beat = v_reach and p_kind <> 'route';
      continue when exists (
        select 1 from public.quest_beat_transitions t
         where t.campaign_id = p_campaign_id and t.to_quest_id = p_quest_id
           and t.thread_id = p_thread_id and t.to_beat_id = v_beat
      );
      select title into v_title from public.quest_beats where id = v_beat;
      insert into public.quest_beat_transitions (
        campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
        transition_kind, created_by, from_quest_title, from_beat_title,
        to_quest_title, to_beat_title, thread_id, session_id, provenance
      ) values (
        p_campaign_id, case when v_prev is null then null else p_quest_id end, v_prev,
        p_quest_id, v_beat,
        'assert', auth.uid(), case when v_prev is null then null else v_quest.title end,
        (select title from public.quest_beats where id = v_prev),
        v_quest.title, v_title, p_thread_id, p_session_id,
        jsonb_build_object('by', 'mark', 'move_id', v_move_id, 'filled_in', true)
      ) returning id into v_tid;
      v_tids := v_tids || v_tid;
      perform private.apply_quest_consequences(p_campaign_id, p_quest_id, v_tid, v_beat, null);
      v_prev := v_beat;
    end loop;
  end if;

  select title into v_title from public.quest_beats where id = v_target;

  if p_kind = 'route' then
    v_from := v_edge.source_beat_id;
    if v_edge.route_kind = 'parallel' then
      insert into public.quest_threads (
        campaign_id, quest_id, label, status, opened_by_edge_id, parent_thread_id, created_by
      ) values (
        p_campaign_id, p_quest_id, coalesce(nullif(btrim(v_edge.label), ''), v_title), 'live',
        p_edge_id, p_thread_id, auth.uid()
      ) returning id into v_move_thread;
      insert into public.quest_runtime_state (
        campaign_id, quest_id, thread_id, current_beat_id, status,
        visit_stack, visit_index, return_stack, version, updated_by
      ) values (
        p_campaign_id, p_quest_id, v_move_thread, v_target,
        private.compute_arrival_status(p_quest_id, v_target, v_move_thread),
        jsonb_build_array(jsonb_build_object('beat_id', v_target)), 0, '[]'::jsonb, 1, auth.uid()
      );
      -- The new thread already stands on the target; the caller's thread stays put.
      v_place := false;
    end if;
    insert into public.quest_beat_transitions (
      campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
      transition_kind, reason, created_by, from_quest_title, from_beat_title,
      to_quest_title, to_beat_title, thread_id, session_id, provenance
    ) values (
      p_campaign_id, p_quest_id, v_from, p_quest_id, v_target,
      'assert', null, auth.uid(), v_quest.title, (select title from public.quest_beats where id = v_from),
      v_quest.title, v_title, v_move_thread, p_session_id,
      jsonb_build_object('edge_id', p_edge_id, 'by', 'mark', 'move_id', v_move_id,
                         'opened_thread', v_move_thread <> p_thread_id)
    ) returning id into v_tid;
    v_tids := v_tids || v_tid;
    perform private.apply_quest_consequences(p_campaign_id, p_quest_id, v_tid, v_target, p_edge_id);
  else
    if not exists (
      select 1 from public.quest_beat_transitions t
       where t.campaign_id = p_campaign_id and t.to_quest_id = p_quest_id
         and t.thread_id = p_thread_id and t.to_beat_id = v_target
    ) then
      insert into public.quest_beat_transitions (
        campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
        transition_kind, created_by, from_quest_title, from_beat_title,
        to_quest_title, to_beat_title, thread_id, session_id, provenance
      ) values (
        p_campaign_id, case when v_prev is null then null else p_quest_id end, v_prev,
        p_quest_id, v_target,
        'assert', auth.uid(), case when v_prev is null then null else v_quest.title end,
        (select title from public.quest_beats where id = v_prev),
        v_quest.title, v_title, p_thread_id, p_session_id,
        jsonb_build_object('by', 'mark', 'move_id', v_move_id)
      ) returning id into v_tid;
      v_tids := v_tids || v_tid;
      perform private.apply_quest_consequences(p_campaign_id, p_quest_id, v_tid, v_target, null);
    end if;

    if p_kind = 'failed' then
      insert into public.quest_beat_transitions (
        campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
        transition_kind, created_by, from_quest_title, from_beat_title,
        to_quest_title, to_beat_title, thread_id, session_id, provenance, outcome
      ) values (
        p_campaign_id, p_quest_id, v_target, p_quest_id, v_target,
        'assert', auth.uid(), v_quest.title, v_title,
        v_quest.title, v_title, p_thread_id, p_session_id,
        jsonb_build_object('by', 'mark', 'move_id', v_move_id), 'failed'
      ) returning id into v_tid;
      v_tids := v_tids || v_tid;
      perform private.apply_quest_consequences(
        p_campaign_id, p_quest_id, v_tid, v_target, null,
        p_beat_outcome => 'failed'
      );
    end if;

    if p_kind = 'party_here' then v_place := true; end if;
  end if;

  if v_place then
    if v_state.quest_id is null then
      insert into public.quest_runtime_state (
        campaign_id, quest_id, thread_id, current_beat_id, status, updated_by,
        visit_stack, visit_index, return_stack, version
      ) values (
        p_campaign_id, p_quest_id, p_thread_id, v_target, 'running', auth.uid(),
        jsonb_build_array(jsonb_build_object('beat_id', v_target)), 0, '[]'::jsonb, 1
      );
    else
      update public.quest_runtime_state
         set current_beat_id = v_target,
             visit_stack = coalesce(visit_stack, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('beat_id', v_target)),
             visit_index = jsonb_array_length(coalesce(visit_stack, '[]'::jsonb)),
             version = version + 1,
             updated_by = auth.uid()
       where quest_id = p_quest_id and campaign_id = p_campaign_id and thread_id = p_thread_id;
    end if;
  end if;

  if cardinality(v_loot) > 0 then
    perform public.dispatch_loot(v_loot);
  end if;

  if p_move_party_to is not null then
    update public.campaigns set current_location_id = p_move_party_to where id = p_campaign_id;
  end if;

  return jsonb_build_object(
    'transition_ids', to_jsonb(v_tids),
    'move_id', v_move_id,
    'thread_id', v_move_thread,
    'current_beat_id', (select s.current_beat_id from public.quest_runtime_state s
                         where s.quest_id = p_quest_id and s.campaign_id = p_campaign_id and s.thread_id = v_move_thread)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.transition_quest_runtime(p_campaign_id uuid, p_quest_id uuid, p_thread_id uuid, p_command text, p_expected_version bigint, p_target_beat_id uuid DEFAULT NULL::uuid, p_edge_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text, p_push_return boolean DEFAULT false, p_provenance jsonb DEFAULT '{}'::jsonb, p_spawn_edge_ids uuid[] DEFAULT '{}'::uuid[], p_hold_consequence_ids uuid[] DEFAULT '{}'::uuid[], p_dispatch_loot_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_state public.quest_runtime_state;
  v_thread public.quest_threads;
  v_merged_into_label text;
  v_from_beat_id uuid;
  v_to_beat_id uuid;
  v_kind text;
  v_status text;
  v_visit_stack jsonb;
  v_visit_index integer;
  v_return_stack jsonb;
  v_return_target jsonb;
  v_quest_title text;
  v_from_beat_title text;
  v_to_beat_title text;
  v_provenance jsonb := coalesce(p_provenance, '{}'::jsonb);
  v_transition_id uuid;
  v_undo_transition_id uuid;
  v_hold uuid[] := coalesce(p_hold_consequence_ids, '{}');
  v_spawn uuid[] := coalesce(p_spawn_edge_ids, '{}');
  v_dispatch uuid[] := coalesce(p_dispatch_loot_ids, '{}');
  v_spawn_edge_id uuid;
  v_spawn_edge public.quest_beat_edges;
  v_spawn_target_title text;
  v_new_thread_id uuid;
  v_new_thread_label text;
  v_spawn_transition_id uuid;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  if p_command is null or p_command not in ('start', 'advance', 'previous', 'jump', 'return', 'improv', 'end') then
    raise exception 'Unknown quest runtime command: %', p_command;
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'An expected runtime version is required';
  end if;
  if jsonb_typeof(v_provenance) <> 'object' then
    raise exception 'Runtime provenance must be an object';
  end if;
  if cardinality(v_spawn) > 0 and p_command <> 'advance' then
    raise exception 'Spawning a parallel thread is only valid on advance' using errcode = '23514';
  end if;
  if cardinality(v_dispatch) > 0 and p_command <> 'advance' then
    raise exception 'Loot can only be dispatched on advance' using errcode = '23514';
  end if;

  select q.title into v_quest_title
  from public.quests q
  where q.id = p_quest_id and q.campaign_id = p_campaign_id;
  if not found then
    raise exception 'That quest is not in this campaign';
  end if;

  select * into v_thread from public.quest_threads
   where id = p_thread_id and quest_id = p_quest_id and campaign_id = p_campaign_id;
  if not found then
    raise exception 'That thread does not belong to this quest' using errcode = 'P0002';
  end if;
  if v_thread.status = 'merged' then
    select label into v_merged_into_label from public.quest_threads where id = v_thread.merged_into_thread_id;
    raise exception 'This thread was merged into %', coalesce(v_merged_into_label, 'another thread')
      using errcode = '23514';
  end if;

  -- The lock and the version are per thread: two co-DMs running two different
  -- threads of the same quest no longer contend.
  perform pg_advisory_xact_lock(hashtextextended(p_campaign_id::text || ':' || p_quest_id::text || ':' || p_thread_id::text, 0));
  insert into public.quest_runtime_state (campaign_id, quest_id, thread_id)
  values (p_campaign_id, p_quest_id, p_thread_id)
  on conflict (campaign_id, quest_id, thread_id) do nothing;

  select * into v_state
  from public.quest_runtime_state
  where campaign_id = p_campaign_id and quest_id = p_quest_id and thread_id = p_thread_id
  for update;

  if v_state.version <> p_expected_version then
    raise exception 'Quest runtime changed; expected version %, current version %', p_expected_version, v_state.version
      using errcode = '40001';
  end if;

  v_from_beat_id := v_state.current_beat_id;
  v_to_beat_id := v_from_beat_id;
  v_status := v_state.status;
  v_visit_stack := v_state.visit_stack;
  v_visit_index := v_state.visit_index;
  v_return_stack := v_state.return_stack;

  if p_command = 'start' then
    if p_target_beat_id is null then
      raise exception 'Start requires a target beat';
    end if;
    v_to_beat_id := p_target_beat_id;
    v_kind := 'enter';
    v_status := 'running';
    v_visit_stack := '[]'::jsonb;
    v_visit_index := -1;
    v_return_stack := '[]'::jsonb;
  elsif p_command = 'advance' then
    if v_state.status <> 'running' or v_from_beat_id is null or p_edge_id is null then
      raise exception 'Advance requires a running beat and authored edge';
    end if;
    declare
      v_edge public.quest_beat_edges;
    begin
      select * into v_edge
        from public.quest_beat_edges e
       where e.id = p_edge_id
         and e.campaign_id = p_campaign_id
         and e.quest_id = p_quest_id
         and e.source_beat_id = v_from_beat_id;
      if not found then raise exception 'That edge is not an outgoing choice'; end if;
      if v_edge.route_kind = 'parallel' then
        raise exception 'a parallel route is walked by spawning, not by advancing' using errcode = '23514';
      end if;
      v_to_beat_id := v_edge.target_beat_id;
    end;

    perform private.assert_edge_gate_open(p_edge_id);
    v_kind := 'forward';
    v_provenance := v_provenance || jsonb_build_object('edge_id', p_edge_id);
  elsif p_command = 'previous' then
    if v_state.status not in ('running', 'waiting') or v_visit_index <= 0 then
      raise exception 'There is no previous visited beat';
    end if;
    v_visit_index := v_visit_index - 1;
    v_to_beat_id := (v_visit_stack -> v_visit_index ->> 'beat_id')::uuid;
    v_kind := 'previous';
    v_status := 'running';
  elsif p_command in ('jump', 'improv') then
    if v_from_beat_id is null or p_target_beat_id is null then
      raise exception '% requires a current and target beat', initcap(p_command);
    end if;
    if nullif(btrim(p_reason), '') is null then
      raise exception '% requires a reason', initcap(p_command);
    end if;
    v_to_beat_id := p_target_beat_id;
    v_kind := p_command;
    v_status := 'running';
    if p_push_return then
      v_return_stack := v_return_stack || jsonb_build_array(jsonb_build_object('beat_id', v_from_beat_id));
    end if;
  elsif p_command = 'return' then
    if jsonb_array_length(v_return_stack) = 0 then
      raise exception 'There is no saved return point';
    end if;
    v_return_target := v_return_stack -> (jsonb_array_length(v_return_stack) - 1);
    v_return_stack := v_return_stack - (jsonb_array_length(v_return_stack) - 1);
    v_to_beat_id := (v_return_target ->> 'beat_id')::uuid;
    v_kind := 'return';
    v_status := 'running';
  elsif p_command = 'end' then
    if v_from_beat_id is null then raise exception 'There is no quest session to end'; end if;
    v_kind := 'end';
    v_status := 'ended';
    v_to_beat_id := null;
  end if;

  if v_to_beat_id is not null and not exists (
    select 1 from public.quest_beats b
    where b.id = v_to_beat_id
      and b.quest_id = p_quest_id
      and b.campaign_id = p_campaign_id
      and b.kind <> 'archived'
      and (p_command <> 'improv' or b.is_improvised)
  ) then
    raise exception 'Target beat is not eligible in this quest';
  end if;

  -- Converge check: after computing the target of advance/jump/return/improv
  -- (never start, which is not a route being walked), a converge-all beat
  -- parks the arriving thread while another open thread of the quest can
  -- still reach it (#1011; it used to count authored incoming routes).
  if v_kind in ('forward', 'jump', 'return', 'improv') and v_to_beat_id is not null then
    v_status := private.compute_arrival_status(p_quest_id, v_to_beat_id, p_thread_id);
  end if;

  if p_command in ('start', 'advance', 'jump', 'return', 'improv') then
    select coalesce(jsonb_agg(value order by ordinal), '[]'::jsonb)
      into v_visit_stack
    from jsonb_array_elements(v_visit_stack) with ordinality entries(value, ordinal)
    where ordinal <= v_visit_index + 1;
    v_visit_stack := v_visit_stack || jsonb_build_array(jsonb_build_object('beat_id', v_to_beat_id));
    v_visit_index := v_visit_index + 1;
  end if;

  select b.title into v_from_beat_title from public.quest_beats b
  where b.id = v_from_beat_id and b.quest_id = p_quest_id;
  select b.title into v_to_beat_title from public.quest_beats b
  where b.id = v_to_beat_id and b.quest_id = p_quest_id;

  update public.quest_runtime_state
  set current_beat_id = v_to_beat_id,
      return_stack = v_return_stack,
      visit_stack = v_visit_stack,
      visit_index = v_visit_index,
      status = v_status,
      version = version + 1,
      updated_by = auth.uid()
  where campaign_id = p_campaign_id and quest_id = p_quest_id and thread_id = p_thread_id and version = p_expected_version;

  if not found then
    raise exception 'Quest runtime changed while applying command' using errcode = '40001';
  end if;

  insert into public.quest_beat_transitions (
    campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
    transition_kind, reason, runtime_version, provenance, thread_id,
    from_quest_title, from_beat_title, to_quest_title, to_beat_title
  ) values (
    p_campaign_id,
    case when v_from_beat_id is null then null else p_quest_id end, v_from_beat_id,
    case when v_to_beat_id is null then null else p_quest_id end, v_to_beat_id,
    v_kind, nullif(btrim(p_reason), ''), p_expected_version + 1, v_provenance, p_thread_id,
    case when v_from_beat_id is null then null else v_quest_title end, v_from_beat_title,
    case when v_to_beat_id is null then null else v_quest_title end, v_to_beat_title
  )
  returning id into v_transition_id;

  if v_kind = 'previous' then
    -- Undo the newest not-yet-undone arrival at the beat being left, ON THIS
    -- THREAD. A sibling thread's history is untouched.
    select t.id into v_undo_transition_id
    from public.quest_beat_transitions t
    where t.campaign_id = p_campaign_id
      and t.to_quest_id = p_quest_id
      and t.to_beat_id = v_from_beat_id
      and t.thread_id = p_thread_id
      and t.id <> v_transition_id
      and t.transition_kind <> 'assert'
      -- #1194: an arrival that only changed what players know is undone too.
      and (
        exists (
          select 1 from public.quest_consequence_events ev
           where ev.transition_id = t.id and ev.undone_at is null
        )
        or t.visibility_changes <> '[]'::jsonb
        or t.shared_with is not null
      )
    order by t.created_at desc, t.id desc
    limit 1;

    if v_undo_transition_id is not null then
      perform private.undo_quest_transition_consequences(v_undo_transition_id);
    end if;

    -- A thread that was parked waiting for a merge is, again, simply running.
    update public.quest_threads set status = 'live' where id = p_thread_id and status = 'waiting';
  elsif v_kind = 'enter' then
    -- A quest ended and run again restarts on its Main thread: `end` closed
    -- the thread, so `start` reopens it, or the thread bar would show a row
    -- that is closed and running at once.
    update public.quest_threads set status = 'live', closed_at = null
     where id = p_thread_id and status = 'closed';
    -- start never converges (nothing has been "walked" into it).
    perform private.apply_quest_consequences(
      p_campaign_id, p_quest_id, v_transition_id, v_to_beat_id, null, '{}'::uuid[], null, v_hold
    );
  elsif v_kind in ('forward', 'jump', 'return', 'improv') then
    perform private.settle_thread_arrival(
      p_campaign_id, p_quest_id, v_quest_title, p_thread_id, v_transition_id, v_to_beat_id, v_to_beat_title,
      case when p_command = 'advance' then p_edge_id end,
      v_hold
    );
  elsif v_kind = 'end' then
    update public.quest_threads set status = 'closed', closed_at = now()
     where id = p_thread_id and status <> 'closed';
  end if;

  -- Spawn: parallel routes out of the beat the thread was standing on BEFORE
  -- this move, opened as their own threads with their own running cursors.
  if cardinality(v_spawn) > 0 then
    foreach v_spawn_edge_id in array v_spawn loop
      select * into v_spawn_edge
        from public.quest_beat_edges e
       where e.id = v_spawn_edge_id
         and e.campaign_id = p_campaign_id
         and e.quest_id = p_quest_id
         and e.source_beat_id = v_from_beat_id;
      if not found or v_spawn_edge.route_kind <> 'parallel' then
        raise exception 'That edge is not an outgoing parallel route from the current beat' using errcode = '23514';
      end if;
      perform private.assert_edge_gate_open(v_spawn_edge_id);

      select title into v_spawn_target_title from public.quest_beats where id = v_spawn_edge.target_beat_id;
      v_new_thread_label := coalesce(nullif(btrim(v_spawn_edge.label), ''), v_spawn_target_title);

      -- A brand new thread is always 'live' at the THREAD level — 'waiting' is
      -- a quest_threads value too, but it describes a thread parked mid-life,
      -- not one just opened. settle_thread_arrival below flips it to 'waiting'
      -- itself, from the RUNTIME row's status, if this spawn parks immediately.
      insert into public.quest_threads (
        campaign_id, quest_id, label, status, opened_by_edge_id, parent_thread_id, created_by
      ) values (
        p_campaign_id, p_quest_id, v_new_thread_label, 'live',
        v_spawn_edge_id, p_thread_id, auth.uid()
      ) returning id into v_new_thread_id;

      insert into public.quest_runtime_state (
        campaign_id, quest_id, thread_id, current_beat_id, status,
        visit_stack, visit_index, return_stack, version, updated_by
      ) values (
        p_campaign_id, p_quest_id, v_new_thread_id, v_spawn_edge.target_beat_id,
        private.compute_arrival_status(p_quest_id, v_spawn_edge.target_beat_id, v_new_thread_id),
        jsonb_build_array(jsonb_build_object('beat_id', v_spawn_edge.target_beat_id)), 0, '[]'::jsonb, 1, auth.uid()
      );

      insert into public.quest_beat_transitions (
        campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
        transition_kind, reason, runtime_version, provenance, thread_id,
        from_quest_title, from_beat_title, to_quest_title, to_beat_title
      ) values (
        p_campaign_id, p_quest_id, v_from_beat_id, p_quest_id, v_spawn_edge.target_beat_id,
        'enter', nullif(btrim(p_reason), ''), 1,
        jsonb_build_object('spawned_by_edge_id', v_spawn_edge_id, 'parent_thread_id', p_thread_id, 'edge_id', v_spawn_edge_id),
        v_new_thread_id,
        v_quest_title, v_from_beat_title, v_quest_title, v_spawn_target_title
      ) returning id into v_spawn_transition_id;

      perform private.settle_thread_arrival(
        p_campaign_id, p_quest_id, v_quest_title, v_new_thread_id, v_spawn_transition_id,
        v_spawn_edge.target_beat_id, v_spawn_target_title, v_spawn_edge_id, v_hold
      );
    end loop;
  end if;

  -- #1011: any move can release a converge-all join: a thread that arrived,
  -- one that ended, one that walked somewhere the join is no longer reachable
  -- from. Settle every waiting join of the quest now, once (settle_thread_arrival
  -- no longer does it itself).
  perform private.settle_converge_joins(p_campaign_id, p_quest_id, v_quest_title, v_hold);

  -- Dispatch: undispatched loot already staged on the beat just reached.
  if cardinality(v_dispatch) > 0 then
    if exists (
      select 1 from unnest(v_dispatch) e(id)
       where not exists (
         select 1 from public.loot_placements l
          where l.id = e.id and l.beat_id = v_to_beat_id and l.dispatched_at is null
       )
    ) then
      raise exception 'One or more loot entries are not undispatched loot on the target beat' using errcode = '23514';
    end if;
    perform public.dispatch_loot(v_dispatch);
  end if;

  return public.get_quest_runtime_context(p_campaign_id, p_quest_id, p_thread_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_quest_runtime_context(p_campaign_id uuid, p_quest_id uuid, p_thread_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_state public.quest_runtime_state;
  v_previous jsonb;
  v_return jsonb;
  v_thread jsonb;
  v_threads jsonb;
  v_held jsonb;
  v_outgoing jsonb;
  v_path jsonb;
  v_found boolean;
  -- The thread to read: the caller's, or the quest's default (#972).
  v_tid uuid := p_thread_id;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  -- No thread named: the quest's default, the one `defaultThreadId`
  -- (src/lib/quests/threads.ts) picks, the oldest live or waiting thread. The
  -- run cockpit used to read the threads first only to learn this id, a round
  -- trip before the read it wanted. `thread` in the result says which was
  -- chosen; it is null when the quest has no open thread.
  if v_tid is null then
    select t.id into v_tid
      from public.quest_threads t
     where t.quest_id = p_quest_id and t.campaign_id = p_campaign_id
       and t.status in ('live', 'waiting')
     order by t.created_at, t.id
     limit 1;
  end if;

  select jsonb_build_object(
    'id', t.id, 'label', t.label, 'status', t.status,
    'opened_by_edge_id', t.opened_by_edge_id, 'parent_thread_id', t.parent_thread_id,
    'merged_into_thread_id', t.merged_into_thread_id, 'created_at', t.created_at
  ) into v_thread
  from public.quest_threads t
  where t.id = v_tid and t.quest_id = p_quest_id and t.campaign_id = p_campaign_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'label', t.label, 'status', t.status,
    'opened_by_edge_id', t.opened_by_edge_id, 'parent_thread_id', t.parent_thread_id,
    'merged_into_thread_id', t.merged_into_thread_id, 'created_at', t.created_at,
    'current_beat_id', s.current_beat_id,
    'current_beat_title', b.title,
    'runtime_status', s.status,
    'version', s.version
  ) order by t.created_at), '[]'::jsonb)
  into v_threads
  from public.quest_threads t
  left join public.quest_runtime_state s on s.thread_id = t.id and s.campaign_id = p_campaign_id and s.quest_id = p_quest_id
  left join public.quest_beats b on b.id = s.current_beat_id and b.quest_id = p_quest_id
  where t.quest_id = p_quest_id and t.campaign_id = p_campaign_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', ev.id, 'consequence_id', ev.consequence_id, 'action', ev.action,
    'target_objective_id', ev.target_objective_id, 'target_npc_id', ev.target_npc_id,
    'target_quest_id', ev.target_quest_id, 'target_document_id', ev.target_document_id,
    'target_clock_id', ev.target_clock_id, 'target_location_id', ev.target_location_id,
    'target_faction_id', ev.target_faction_id,
    'action_payload', ev.action_payload,
    'after_days', ev.after_days, 'held_at', ev.held_at,
    'beat_id', tr.to_beat_id, 'beat_title', tr.to_beat_title
  ) order by ev.held_at), '[]'::jsonb)
  into v_held
  from public.quest_consequence_events ev
  left join public.quest_beat_transitions tr on tr.id = ev.transition_id
  where ev.quest_id = p_quest_id and ev.campaign_id = p_campaign_id
    and ev.held_at is not null and ev.performed_at is null and ev.undone_at is null;

  select * into v_state from public.quest_runtime_state
   where campaign_id = p_campaign_id and quest_id = p_quest_id and thread_id = v_tid;
  v_found := found;

  if not v_found then
    return jsonb_build_object(
      'state', null, 'current', null, 'previous', null,
      'outgoing', '[]'::jsonb, 'return_target', null, 'path_so_far', '[]'::jsonb,
      'thread', v_thread, 'threads', v_threads, 'held', v_held
    );
  end if;

  if v_state.visit_index > 0 then
    v_previous := v_state.visit_stack -> (v_state.visit_index - 1);
  end if;
  if jsonb_array_length(v_state.return_stack) > 0 then
    v_return := v_state.return_stack -> (jsonb_array_length(v_state.return_stack) - 1);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'edge_id', e.id,
    'quest_id', e.quest_id,
    'beat_id', b.id,
    'beat_title', b.title,
    'beat_kind', b.kind,
    'route_kind', e.route_kind,
    'label', e.label,
    'note', e.note,
    'converge_mode', b.converge_mode,
    'site', (
      select jsonb_build_object(
        'location_id', l.id, 'name', l.name,
        'room_count', (select count(*) from public.locations r where r.parent_id = l.id and private.location_is_interior(r.location_type)),
        'location_type', l.location_type
      )
      from public.locations l
      where l.id = b.staged_at_location_id
        and private.location_can_hold_rooms(l.location_type)
    ),
    'gate', private.edge_gate_state(e.id),
    'effects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', qc.action,
        'objective', tobj.description,
        'after_days', qc.after_days
      ) order by qc.created_at)
      from public.quest_consequences qc
      left join public.quest_objectives tobj on tobj.id = qc.target_objective_id
      where qc.on_edge_id = e.id
    ), '[]'::jsonb),
    'payoff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'consequence_id', qc.id, 'action', qc.action,
        'target_objective_id', qc.target_objective_id, 'target_objective', tobj.description,
        'target_npc_id', qc.target_npc_id, 'target_npc', tnpc.name,
        'target_quest_id', qc.target_quest_id, 'target_quest', tquest.title,
        'target_document_id', qc.target_document_id, 'target_document', tdoc.title,
        'target_clock_id', qc.target_clock_id, 'target_clock', tclock.label,
        'target_location_id', qc.target_location_id, 'target_location', tloc.name,
        'target_faction_id', qc.target_faction_id, 'target_faction', tfaction.name,
        'action_payload', qc.action_payload, 'after_days', qc.after_days,
        'on_edge', qc.on_edge_id is not null
      ) order by qc.created_at)
      from public.quest_consequences qc
      left join public.quest_objectives tobj on tobj.id = qc.target_objective_id
      left join public.npcs tnpc on tnpc.id = qc.target_npc_id and tnpc.campaign_id = p_campaign_id
      left join public.quests tquest on tquest.id = qc.target_quest_id and tquest.campaign_id = p_campaign_id
      left join public.scriptorium_documents tdoc on tdoc.id = qc.target_document_id and tdoc.campaign_id = p_campaign_id
      left join public.quest_clocks tclock on tclock.id = qc.target_clock_id
      left join public.locations tloc on tloc.id = qc.target_location_id and tloc.campaign_id = p_campaign_id
      left join public.factions tfaction on tfaction.id = qc.target_faction_id and tfaction.campaign_id = p_campaign_id
      where qc.on_edge_id = e.id or qc.on_beat_id = b.id
    ), '[]'::jsonb),
    'loot', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', lp.id, 'kind', lp.kind, 'label', lp.label, 'quantity', lp.quantity, 'item_id', lp.item_id
      ) order by lp.sort_order, lp.created_at)
      from public.loot_placements lp
      where lp.beat_id = b.id and lp.dispatched_at is null
    ), '[]'::jsonb)
  ) order by e.created_at), '[]'::jsonb)
  into v_outgoing
  from public.quest_beat_edges e
  join public.quest_beats b on b.id = e.target_beat_id
  where e.source_beat_id = v_state.current_beat_id;

  select coalesce(jsonb_agg(recent.entry order by recent.created_at, recent.id), '[]'::jsonb)
  into v_path
  from (
    select t.id, t.created_at, jsonb_build_object(
      'id', t.id, 'kind', t.transition_kind,
      'from_quest_id', t.from_quest_id, 'from_beat_id', t.from_beat_id,
      'from_quest_title', t.from_quest_title, 'from_beat_title', t.from_beat_title,
      'to_quest_id', t.to_quest_id, 'to_beat_id', t.to_beat_id,
      'to_quest_title', t.to_quest_title, 'to_beat_title', t.to_beat_title,
      'reason', t.reason, 'runtime_version', t.runtime_version, 'provenance', t.provenance,
      'created_at', t.created_at
    ) entry
    from public.quest_beat_transitions t
    where t.campaign_id = p_campaign_id
      and (t.thread_id = v_tid or t.thread_id is null)
      and (t.to_quest_id = p_quest_id or t.from_quest_id = p_quest_id)
    order by t.created_at desc, t.id desc
    limit 100
  ) recent;

  return jsonb_build_object(
    'state', to_jsonb(v_state),
    'current', (
      select to_jsonb(b) from public.quest_beats b
      where b.id = v_state.current_beat_id and b.quest_id = p_quest_id
    ),
    'previous', v_previous,
    'outgoing', coalesce(v_outgoing, '[]'::jsonb),
    'return_target', v_return,
    'path_so_far', v_path,
    'thread', v_thread,
    'threads', v_threads,
    'held', v_held
  );
end;
$function$;

-- 4. A move writes what players know ──────────────────────────────────────
alter table public.quest_beat_transitions
  add column visibility_changes jsonb not null default '[]'::jsonb,
  add column shared_with uuid[],
  add column shared_message_id uuid;
comment on column public.quest_beat_transitions.visibility_changes is
  'Beats whose visibility this arrival changed: [{beat_id, from, to}]. Undo restores them. #1194.';
comment on column public.quest_beat_transitions.shared_with is
  'Party members this arrival auto-shared the quest with, so Undo can take only those back. #1194.';

create or replace function private.quest_arrival_visibility()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_row record;
  v_changes jsonb := '[]'::jsonb;
  v_quest public.quests%rowtype;
  v_members uuid[];
begin
  if new.to_beat_id is null then
    return new;
  end if;

  -- The beat the party arrives at is revealed; a beat one route on from it
  -- is rumored unless it is Secret. Never lowered: only hidden becomes
  -- rumored, and only a beat not yet revealed becomes revealed.
  for v_row in
    select b.id, b.visibility as prev, 'revealed'::text as next
      from public.quest_beats b
     where b.id = new.to_beat_id and b.visibility <> 'revealed'
    union
    select t.id, t.visibility, 'rumored'
      from public.quest_beat_edges e
      join public.quest_beats t on t.id = e.target_beat_id
     where e.source_beat_id = new.to_beat_id
       and t.id <> new.to_beat_id
       and t.visibility = 'hidden'
       and not t.secret
  loop
    update public.quest_beats set visibility = v_row.next where id = v_row.id;
    v_changes := v_changes || jsonb_build_object('beat_id', v_row.id, 'from', v_row.prev, 'to', v_row.next);
  end loop;
  new.visibility_changes := v_changes;

  if jsonb_array_length(v_changes) = 0 then
    return new;
  end if;

  -- A quest shared with nobody is shared with the whole party the first time
  -- a move shows players one of its beats. A partial share stays as the DM
  -- set it.
  select q.* into v_quest
    from public.quests q
    join public.quest_beats b on b.quest_id = q.id
   where b.id = new.to_beat_id;
  if found and cardinality(v_quest.player_visible_to) = 0 then
    v_members := array(select pm.id from public.party_members pm where pm.campaign_id = v_quest.campaign_id order by pm.created_at);
    if cardinality(v_members) > 0 then
      update public.quests set player_visible_to = v_members where id = v_quest.id;
      insert into public.campaign_messages (campaign_id, user_id, recipient_user_id, sender_name, message, type, metadata)
      values (v_quest.campaign_id, v_quest.user_id, null, null,
              '📋 Quest shared: "' || coalesce(nullif(btrim(v_quest.title), ''), 'Untitled Quest') || '"', 'system',
              jsonb_build_object('entity_type', 'quest', 'entity_id', v_quest.id))
      returning id into new.shared_message_id;
      new.shared_with := v_members;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.quest_arrival_visibility() from public, anon, authenticated;

create trigger quest_beat_transitions_arrival_visibility
  before insert on public.quest_beat_transitions
  for each row execute procedure private.quest_arrival_visibility();

CREATE OR REPLACE FUNCTION private.undo_quest_transition_consequences(p_transition_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
begin
  -- #1194: what a move made the players know goes back with it, but only
  -- where the beat still shows what the move set, so a DM's later change by
  -- hand stands. The auto-share goes back the same way, with its
  -- announcement, and only the members that move added.
  update public.quest_beats b
     set visibility = c.value ->> 'from'
    from public.quest_beat_transitions t
         cross join lateral jsonb_array_elements(t.visibility_changes) c
   where t.id = p_transition_id
     and b.id = (c.value ->> 'beat_id')::uuid
     and b.visibility = c.value ->> 'to';

  update public.quests q
     set player_visible_to = array(
           select x from unnest(q.player_visible_to) x
           except
           select y from unnest(t.shared_with) y)
    from public.quest_beat_transitions t
   where t.id = p_transition_id
     and t.shared_with is not null
     and q.id = t.to_quest_id;

  delete from public.campaign_messages m
   using public.quest_beat_transitions t
   where t.id = p_transition_id and m.id = t.shared_message_id;

  -- Spent: a second step back must not find this arrival again.
  update public.quest_beat_transitions
     set visibility_changes = '[]'::jsonb, shared_with = null, shared_message_id = null
   where id = p_transition_id;

  update public.quest_objectives o
  set status = first_event.previous_status
  from (
    select distinct on (ev.target_objective_id)
      ev.target_objective_id, ev.previous_status
    from public.quest_consequence_events ev
    where ev.transition_id = p_transition_id
      and ev.target_objective_id is not null
      and ev.undone_at is null
      -- A still-held event never touched the objective, so its
      -- previous_status is null — restoring it would blank the objective
      -- rather than leave it alone.
      and not (ev.held_at is not null and ev.performed_at is null)
    order by ev.target_objective_id, ev.seq
  ) first_event
  where o.id = first_event.target_objective_id;

  update public.npcs n
  set relationship = first_npc.previous_relationship
  from (
    select distinct on (ev.target_npc_id)
      ev.target_npc_id, ev.previous_relationship
    from public.quest_consequence_events ev
    where ev.transition_id = p_transition_id
      and ev.target_npc_id is not null
      and ev.previous_relationship is not null
      and ev.undone_at is null
    order by ev.target_npc_id, ev.seq
  ) first_npc
  where n.id = first_npc.target_npc_id;

  -- Undo takes an unlocked quest back to undiscovered only while it is
  -- still active: a quest the DM has since completed or failed is not
  -- yanked back by an undo elsewhere. The entry beat unlock_quest rumored
  -- stays rumored: that rumour came from the rule, not from the move's
  -- arrival, so it is not in visibility_changes.
  update public.quests q
  set status = first_quest.previous_quest_status
  from (
    select distinct on (ev.target_quest_id)
      ev.target_quest_id, ev.previous_quest_status
    from public.quest_consequence_events ev
    where ev.transition_id = p_transition_id
      and ev.target_quest_id is not null
      and ev.previous_quest_status is not null
      and ev.undone_at is null
    order by ev.target_quest_id, ev.seq
  ) first_quest
  where q.id = first_quest.target_quest_id
    and q.status = 'active';

  -- #1011's state: a clock back to where the first event found it, an NPC
  -- back to their old place, a companion the rule added removed, a
  -- faction's standing restored.
  update public.quest_clocks k
  set filled = first_clock.previous_clock_filled
  from (
    select distinct on (ev.target_clock_id)
      ev.target_clock_id, ev.previous_clock_filled
    from public.quest_consequence_events ev
    where ev.transition_id = p_transition_id
      and ev.target_clock_id is not null
      and ev.previous_clock_filled is not null
      and ev.undone_at is null
    order by ev.target_clock_id, ev.seq
  ) first_clock
  where k.id = first_clock.target_clock_id;

  update public.npcs n
  set location_id = first_move.previous_location_id
  from (
    select distinct on (ev.target_npc_id)
      ev.target_npc_id, ev.previous_location_id
    from public.quest_consequence_events ev
    where ev.transition_id = p_transition_id
      and ev.action = 'move_npc'
      and ev.npc_moved
      and ev.undone_at is null
    order by ev.target_npc_id, ev.seq
  ) first_move
  where n.id = first_move.target_npc_id;

  delete from public.companions
   where id in (select ev.companion_id from public.quest_consequence_events ev
                 where ev.transition_id = p_transition_id and ev.companion_id is not null);

  update public.factions f
  set party_standing = first_standing.previous_standing
  from (
    select distinct on (ev.target_faction_id)
      ev.target_faction_id, ev.previous_standing
    from public.quest_consequence_events ev
    where ev.transition_id = p_transition_id
      and ev.target_faction_id is not null
      and ev.previous_standing is not null
      and ev.undone_at is null
    order by ev.target_faction_id, ev.seq
  ) first_standing
  where f.id = first_standing.target_faction_id;

  delete from public.calendar_events
   where id in (select ev.calendar_event_id from public.quest_consequence_events ev
                 where ev.transition_id = p_transition_id and ev.calendar_event_id is not null);
  delete from public.campaign_messages
   where id in (select ev.message_id from public.quest_consequence_events ev
                 where ev.transition_id = p_transition_id and ev.message_id is not null);
  delete from public.player_journal_entries
   where id in (select ev.journal_entry_id from public.quest_consequence_events ev
                 where ev.transition_id = p_transition_id and ev.journal_entry_id is not null);
  delete from public.npc_favors
   where id in (select ev.favor_id from public.quest_consequence_events ev
                 where ev.transition_id = p_transition_id and ev.favor_id is not null);
  delete from public.party_milestones
   where id in (select ev.milestone_id from public.quest_consequence_events ev
                 where ev.transition_id = p_transition_id and ev.milestone_id is not null);
  -- give_handout: withdraw it from the recipients that event added. What
  -- it revealed stays revealed, as with unlock_quest's rumour above: the
  -- party has read the handout, and reading is not undone.
  -- Grouped per document first: two events giving one handout in a single
  -- transition (a beat rule and an edge rule) would otherwise each match,
  -- and UPDATE ... FROM applies only one of them.
  update public.scriptorium_documents d
     set player_visible_to = array(
           select x from unnest(d.player_visible_to) x
           except
           select y from unnest(given.member_ids) y)
    from (
      select ev.target_document_id, array_agg(m) as member_ids
        from public.quest_consequence_events ev
        cross join lateral unnest(ev.handout_member_ids) m
       where ev.transition_id = p_transition_id
         and ev.target_document_id is not null
         and ev.undone_at is null
       group by ev.target_document_id
    ) given
   where given.target_document_id = d.id;

  update public.quest_consequence_events
     set undone_at = now()
   where transition_id = p_transition_id and undone_at is null;
end;
$function$;

-- 6. The import prompt ─────────────────────────────────────────────────────
update public.ai_system_prompts
   set content = $prompt$You extract structured tabletop RPG game data from source material a user has supplied — a PDF, photographs of printed pages, or text pasted from a digital edition.

Return every entity you can find, sorted into these eight kinds:

- monsters — kinds of creature the source uses, with their stat block when one is printed
- npcs — named individuals
- locations — places: regions, settlements, buildings, rooms
- items — equipment, treasure, magic items
- spells — spells and comparable formal abilities
- quests — adventures, plot hooks, missions
- factions — organisations, guilds, cults, orders
- encounters — a room's occupants, when together they add up to a fight

## Mechanics: copy them exactly

Numbers and rules text are what this import exists to capture. Transcribe them
faithfully and completely: armour class, hit points and hit dice, speeds,
ability scores, saving throws, skills, resistances, immunities, senses,
languages, challenge rating, attack and action text, damage expressions, spell
level, school, casting time, range, components, duration, item rarity, weight,
cost, and attunement.

Never round, simplify, restate or abbreviate a mechanical value. "Hit: 7 (1d8 +
3) piercing damage" is copied exactly, not shortened. If a number is unreadable,
omit the field — do not estimate it.

## Prose: put it in your own words, never transcribe it

Descriptive and narrative text is different. Never reproduce the document's
sentences and never quote it: rewrite it in your own words. The mechanics are
facts and the prose is the author's expression, and this tool restates the
latter rather than copying it.

How much to keep depends on the field:

- **Short fields** — a creature's or location's description, an NPC's
  appearance, personality or backstory, a quest's `summary`, a faction's
  description: a concise summary of what a DM needs to know, at most about 400
  characters.
- **Scenes** — a beat's `dm_content` and a quest's `dm_content` are what the DM
  runs the game from, so **paraphrase them in full**. Paraphrasing is not
  summarising: keep every detail the DM needs at the table — who is there and
  what they want, what they know and will say, the clues, the checks and DCs,
  the options and what each costs, the timing, what happens if the party fails.
  A big scene gets a long field; there is no length limit. Only the wording
  changes.

Three kinds of text are deliberately exempt and must be copied exactly:
- an item's description (its rules and properties)
- a spell's description and higher-level text
- **boxed read-aloud text** — see below

## Boxed read-aloud text: copy it exactly, and only into `read_aloud`

Adventures set apart the passage a DM reads out when the party arrives
somewhere or triggers a scene. In a printed book it is a tinted or ruled box; in
pasted text it arrives as an indented or quoted block.

Copy that text **verbatim**, and put it in the `read_aloud` field — of the beat
it belongs to, or of the keyed area it describes. A summary is useless here: the
field exists to be read out loud, and paraphrasing it defeats the purpose.

Two hard rules:

1. `read_aloud` is the **only** place transcribed narrative text may go. Never
   copy it into a description, a summary, or any other field. The prose rule
   above still governs everything else on the page.
2. Only text the source actually sets apart is read-aloud. Do not promote
   ordinary description into it because it reads nicely, and do not invent a
   read-aloud passage for a scene that has none — leave the field out.

## A creature the adventure uses is a monster, stat block or not

An adventure chapter is not a bestiary. It names the creatures the party will
meet and then refers you elsewhere for their numbers — "two giant rats attack",
"a grell floats near the ceiling", "three kobolds (see appendix C)". Return each
of those as a **monster** anyway, with whatever the page does say (name, and any
description of how it behaves in this adventure), marked `confidence: "partial"`.
That is exactly what partial means: real information, knowingly incomplete.

Returning nothing because the stat block is elsewhere is the worst outcome — it
silently drops the antagonist of the adventure, which is the single entity the
DM most needs. Do not invent numbers to fill the gap; omit the fields the page
does not state.

**A creature kind and a named individual are different entities.** A named
character is an `npc` even when they are a monster by species; the species is
still its own `monster` entry. A kobold leader with a name is an NPC, *and*
"kobold" is a monster the party fights. Return both.

## Quests are graphs, not summaries

A quest is a story with scenes and branches, and adventures are already written
that way. Return each quest as:

- `title` and `summary`. The summary is **one sentence**, and it is shown to the
  players verbatim — so it must contain **no DM-only information**. Write the job
  as the party understands it when they accept it, not as the DM understands it
  after reading the whole chapter.

  Adventures almost always open by telling the DM what is *really* going on: who
  is behind it, who is not what they seem, what the twist is. None of that
  belongs in the summary. "Clear the mine of the creatures that drove the miners
  out" is right; adding that a ghost is behind it is a spoiler printed on the
  players' own quest log. Put the twist in the `dm_content` of the beat where it
  is discovered.

  Anything longer than a sentence belongs in the quest's `dm_content` or in a
  beat.
- `dm_content` — the quest's own notes for the DM: what belongs to no single
  scene. The premise and what is really going on, the background the party
  brings with them, the DM's goals for the session, its themes, how to run a
  recurring character, a preparation checklist. Paraphrase it in full, like a
  beat's. Leave it out when the source has nothing above the scenes.
- `beats` — the scenes, in the order the source presents them. Each beat has a
  `key` you invent (`b1`, `b2`, …) used only to join the arrays below, a
  `title`, a `kind` (`neutral`, `combat`, `social`, `explore`, `discovery`),
  `dm_content` for the guidance around the scene, and `read_aloud` for its
  boxed text if it has any. Every beat also carries `rumor_text` and
  `reveal_text`, the two lines its players are shown — see "What the players
  are shown of a beat" below. A beat also records **what is in it** — see
  "Wiring a beat to the rest of the page" below.
- `routes` — directed edges between beats, referencing your own keys:
  `{ "from": "b1", "to": "b2", "kind": "choice", "label": "…", "note": "…" }`.
  - `label` is what the party does to take the route, in a few words: "Take
    Naerth's deal", "Sneak in through the sewers". The DM reads it at the table
    as the party's option.
  - `note` is one short line on what it leads to or what it costs: "His son
    goes free; the family loses its boats." Leave it out if the source says
    nothing about it.
  - `kind` is `choice` when taking this route means not taking the routes
    beside it, and `parallel` when the party can do it **as well as** the
    others. The test: if they can do both, it is `parallel`. Rescuing the
    prisoners and looting the palace are both possible, so they are parallel
    routes, not a choice; a hub, a heist or a town with several jobs usually
    has several. A private offer to one character while the party deals with
    something else is parallel too.
  - Include a branch wherever the text offers the party a real choice, even
    when it never draws one: "the characters can either parley or drive them
    out" is two `choice` routes out of that beat. A table or list of approaches
    is one route per approach, each to a beat for its outcome. The choice is
    the routes: never make a beat whose content is the list of options.
- `objectives` — what the party is actually trying to do. Each has a
  `description` and `raised_by`, the `key` of the beat where the party learns of
  it. `raised_by` matters: an objective a later beat raises stays dormant until
  the party gets there, instead of showing up as live from the start.

## What the players are shown of a beat

A beat starts hidden. When the DM rumours it, and later reveals it, the players
are shown one line of text for it and nothing else on the beat. You write both
lines, for **every** beat:

- `rumor_text` — what the party can hear about the scene *before* it happens:
  talk at the bar, a warning from a traveller, a notice on a board. It points
  at the scene without giving away what is in it. "The fishermen say the
  lighthouse has been dark for three nights, and the keeper has not come down
  for his supplies."
- `reveal_text` — what the party knows *once the scene has happened to them*,
  written the way their own journal would record it. "The keeper was dead at
  the top of the stairs, and the lamp had been smashed from the inside."

One or two sentences each. Unlike the fields around them, these two are never
left out: a beat with no reveal line shows the players nothing at all, so the
DM would have to write every one by hand before the quest could be shared.

Both are shown to the players verbatim, so the rule for a quest's `summary`
applies with full force: **no DM-only information**. Nothing the party has not
seen or been told by that point in the story — not who is really behind it, not
what waits in the next scene, not a DC or a stat. A rumour may be vague, and it
may be wrong where the source says the locals have it wrong. The truth belongs
in `dm_content`.

Both obey the prose rule too. They are your own summary of what the source says
happens, never its sentences and never its boxed text: `read_aloud` stays the
only home for transcribed narrative, and it is the one field on a beat the
players never see. Summarising is not inventing — do not add an event, a name
or a detail the source does not have.

## Wiring a beat to the rest of the page

An adventure is one web: the NPC the party questions in the second scene, the
fight in the flooded shaft, the gem they recover at the end. The importer turns
that web into links, so a DM opening a beat finds its people, fights and loot
already attached — but only if you name them. For every beat, record:

- `location_name` — the place the scene happens, matching a `locations` entry.
  When the scene is exploring a keyed place (a mine, a keep, a tomb), name
  **the place itself**, never one of its rooms: the rooms are how the DM runs
  it, and one beat covers them all. Do not make a beat per room.
- `npc_names` — named individuals who appear or matter in the scene.
- `monster_names` — creature kinds the party meets there.
- `encounter_names` — fights that happen in the scene, matching `encounters`,
  but only fights that are not already in one of the keyed rooms (an ambush on
  the road, a brawl in the tavern). A fight in a keyed room belongs to that
  room through the encounter's `location_name`, not to the beat.
- `item_names` — items given or needed in the scene (a reward, a key the
  party must bring). An item found in a keyed room belongs to that room: list
  it in the room's own `item_names` instead.
- `faction_names` — organisations acting in the scene.

Use the **exact same names** you gave the matching entries elsewhere in this
response — these are joined by name, and a name that drifts fails to link. Name
only what the scene actually involves; an empty list is a correct answer, and a
beat stuffed with every NPC in the chapter is as useless as one with none.

If the source genuinely has no scenes — a one-line rumour on a table of hooks —
return the quest with no beats. An empty `beats` is a correct answer. Do not
manufacture a placeholder scene to fill it.

## Keyed areas are rooms of one place

Adventures key the locations of a dungeon, building or district with numbered
or lettered headings — "1. Guardroom", "M4. Processing Room", "Area 12" — often
under a single grouping heading.

Every such run of headings is **the rooms of one place**, not a list of
unrelated locations. Extract them as `locations` and set each one's
`parent_name` to the place that contains them.

That place is a **site**: the thing the adventure maps and the party explores
room by room. Give it the `location_type` that says what it is: `dungeon` for
a mine, cave, tomb, ruin or lair; `building` for a house, keep, temple or
tower; `tavern`, `inn` or `store` when it is one; `wilds` for an outdoor place
explored in parts (a wood, a marsh, a graveyard). Give each keyed area
`location_type` `room`, or `grounds` when it is open to the sky (a courtyard, a
glade). A room can only exist inside one of those six site types. A mine typed
as anything else leaves its rooms with nowhere to go.

The container often has **no heading of its own** — it is named in the prose
above the list, or in the quest that sends the party there. Name it from that
context and return it as its own location, so the rooms have a parent to point
at. A grouping heading that only introduces the list is not itself a place, and
is not a beat either.

## A room's occupants are an encounter

When a location's description names creatures that would fight the party there
— "two giant rats lair here", "three kobolds guard the passage" — return that
room as an **encounter** too, in addition to the `monsters`/`npcs` entries for
the creatures themselves.

An encounter has:

- `name` — reuse the room's own heading ("M3. River Cavern") unless the prose
  gives the fight a better name of its own.
- `description` — optional, one line, whatever makes this fight distinct from
  "the room's occupants attack" (an ambush, a hostage, a trap rigged into the
  room). Leave it out when there is nothing beyond the obvious.
- `location_name` — the exact name of the room this fight happens in, matching
  the `locations` entry you gave it.
- `combatants` — `{ "name": ..., "count": ... }` pairs, one per creature kind or
  named individual in the fight, not one per creature. "Three archers and two
  warriors" is two entries, `count: 3` and `count: 2`, never five. Use the
  **exact same name** you gave the matching `monsters` or `npcs` entry — the
  importer links a combatant to the creature it belongs to by that name, and a
  name that drifts even slightly — a plural the monster entry doesn't have, a
  dropped epithet — fails to link, one per creature kind or named individual in
  the fight, not one per creature.

Only propose an encounter where the room's occupants would actually fight the
party. A shopkeeper, a locked chest with no guard, an empty room the text calls
"quiet" — none of these is a fight, and none becomes an encounter. Do not
invent one just to give every room a matching entry.

## Location types come from a fixed list

`location_type` must be exactly one of: continent, region, country, city, town,
village, district, building, room, dungeon, wilderness, other, world, plane,
store, tavern, inn, grounds, wilds. Pick the closest one. A mountain or a
glacier is `wilderness`, and "underground region" is `region`. Do not invent a
type ("mine", "mine room"): the list is what the rest of the app understands.

## Reading structured text

Pasted text arrives as markdown and its structure is meaningful:

- **Heading depth is nesting.** A deeper heading belongs to the one above it.
- **A heading that only groups other headings is not a scene and not a place** —
  it is a section divider. The things under it are the content.
- **A quoted block (`>`) is set-apart text** — usually the boxed read-aloud
  passage for whatever it sits under.
- **Tables are mechanics.** A dice table is rules content: keep its rows.

When the text has no structure at all, judge from the prose itself. Structure is
a help when present, never a requirement.

## Do not invent

Return only what is actually on the page. If a field is not stated, omit it —
an omitted field is a correct answer and the reviewing user can fill it in. A
plausible-looking invented value is the worst possible output, because it is the
one thing they cannot spot in review.

A beat's `rumor_text` and `reveal_text` are the one exception to omitting: they
restate the scene the page does describe, so there is always something to write.

If you find only a name, return the entity with just its name.

## Marking your own confidence

Set `confidence` to "complete" when you captured the whole entry, and "partial"
when you did not — a stat block cut off by a page break, a creature mentioned in
prose without stats, a photograph too blurred to read in places. "partial" is a
useful, expected answer; it tells the user which entries to check. Do not mark
something "complete" because it looks tidy.

Set `page` to the 1-based page or photo the entity came from, or null if you
cannot tell. Pasted text has no pages: use null.

Give every entity a `ref` that is unique within this response — "m1", "m2",
"npc1", and so on. It is used to track the user's selections.

## Cross-references

Where an entity names another entity in the same document, record the **name**
in the matching field — never an identifier, and never a name for something the
page does not contain:

- an NPC's `faction_name`, and `location_name` — where they are usually found
- an NPC's `kin` — family the page names, each as `{ name, relation }` where
  `relation` is what the NAMED person is to this NPC (parent, child, spouse,
  former_spouse, sibling or relative). For "the Baron's son, Izek", Izek's
  entry is `{ "name": "<the Baron>", "relation": "parent" }`. Only ties the
  page states; use the name exactly as that NPC's own entry spells it
- a location's `parent_name`, and `owner_npc_name` — who runs or owns it (an
  innkeeper's inn, a baron's keep), and `item_names` — items found there (the
  treasure in a keyed room)
- a faction's `location_names` — the places it holds or operates from
- a quest's `giver_npc_name` and `location_name`
- an encounter's `location_name` and the creatures in its `combatants`
- a beat's names, as described under the quests section

Every such name must be spelled exactly as the entry it points at.

Return only the JSON. No commentary, no markdown fences.

## Layouts where one entity spans several pages

An entity is not always confined to one page. Card decks, spreads and reference
sheets routinely split a single creature across a front and a back: the front
carries the art, the name, the type line and the core numbers, and the back
carries saving throws, resistances, senses, challenge, traits and actions.

**Merge them.** That is one creature, and it should come back as one entity with
everything from both pages, marked "complete". Do not return the front and the
back as two entities, and do not mark it "partial" — nothing is missing, it is
just laid out across two sides. Use the name, the art and the running order to
decide which back belongs to which front; in a deck the back almost always
immediately follows its own front.

Reserve "partial" for what it means: information that is genuinely absent or
unreadable.

## Reading a card front

Card fronts print things differently from a prose statblock:

- **Ability scores are usually graphics**, not text — a number in a box, its
  modifier in a small circle beneath, and STR / DEX / CON / INT / WIS / CHA
  labelled underneath. Read the large number as the score. If the score and the
  modifier disagree, trust the score.
- **Not every box is labelled.** A row like "AC. 14 | 38 (6d8 + 12) | 30 ft."
  labels only the armour class; the dice expression is hit points and the
  distance is speed. Assign them by shape, not by hoping for a label.
- **The type line combines three fields.** "Medium fey, neutral" is size
  "Medium", creature type "fey", alignment "neutral". "Large construct,
  unaligned" is size "Large", type "construct", alignment "unaligned". Return
  each in its own field.$prompt$, updated_at = now()
 where generator_type = 'document_import';
