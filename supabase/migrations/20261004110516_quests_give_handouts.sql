-- Migration: quests_give_handouts (#970)
--
-- A quest can give the party a handout: `give_handout`, a twelfth consequence
-- verb on the one consequence mechanism (20260905215424). Same table, same
-- delay, same hold, same event log, same undo as every other verb.
--
-- Target: `target_document_id`, an FK like `target_npc_id`/`target_quest_id`,
-- so deleting the document deletes the rule instead of leaving it naming
-- nothing. It is excluded from nothing in the dedupe key: a beat may give two
-- different handouts, but not the same one twice.
--
-- Perform: the whole party receives it, through private.apply_handout_reveals,
-- the same function the DM's share_handout calls (20261004105821).
--
-- Undo: the event records which recipients it added (`handout_member_ids`) and
-- undo withdraws exactly those. Reveals stay, the precedent unlock_quest's
-- undo set by leaving its rumoured beat.
--
-- The three engine functions are restated from their live bodies with only
-- the give_handout additions: apply_quest_consequences carries the new target
-- on its four event inserts and performs the verb immediately when due;
-- perform_quest_consequence gains the arm; transition_quest_runtime's
-- `previous` gains the withdrawal. get_quest_runtime_context carries the
-- handout on each route payoff (id and title, so the Advance dialog can say
-- "The party receives <title>") and on each held payoff.

alter table public.quest_consequences
  add column target_document_id uuid references public.scriptorium_documents(id) on delete cascade;

alter table public.quest_consequence_events
  add column target_document_id uuid references public.scriptorium_documents(id) on delete set null,
  add column handout_member_ids uuid[];

-- Every FK between campaign-scoped tables goes through zz_same_campaign_refs
-- (same_campaign_refs.test.sql holds it). Restated with the new column.
drop trigger zz_same_campaign_refs on public.quest_consequence_events;
create trigger zz_same_campaign_refs
  before insert or update of calendar_event_id, favor_id, journal_entry_id, message_id, milestone_id,
                             quest_id, transition_id, target_document_id, campaign_id
  on public.quest_consequence_events
  for each row execute procedure private.enforce_same_campaign_refs(
    'calendar_event_id', 'calendar_events', 'owned',
    'favor_id', 'npc_favors', 'unowned',
    'journal_entry_id', 'player_journal_entries', 'owned',
    'message_id', 'campaign_messages', 'owned',
    'milestone_id', 'party_milestones', 'unowned',
    'quest_id', 'quests', 'owned',
    'transition_id', 'quest_beat_transitions', 'unowned',
    'target_document_id', 'scriptorium_documents', 'owned');

alter table public.quest_consequences drop constraint quest_consequences_action_check;
alter table public.quest_consequences add constraint quest_consequences_action_check
  check (action = any (array[
    'raise', 'reveal', 'complete', 'fail',
    'create_calendar_event', 'send_broadcast', 'shift_npc_relationship', 'unlock_quest',
    'grant_knowledge', 'owe_favor', 'award_milestone', 'give_handout'
  ]));

alter table public.quest_consequences add constraint quest_consequences_document_pair
  check ((action = 'give_handout') = (target_document_id is not null));

-- A rule may only give a handout that belongs to the quest's own campaign AND
-- to the quest's owner. The FK proves the document exists, not whose it is,
-- and a co-DM's private draft in the same campaign is not this quest's to give
-- (documents are owner-only; this trigger runs as definer and can see them).
-- The perform arm checks both again at fire time.
create or replace function private.quest_consequence_document_in_campaign()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.target_document_id is not null and not exists (
    select 1
      from public.scriptorium_documents d
      join public.quests q on q.id = new.quest_id
     where d.id = new.target_document_id
       and d.campaign_id = q.campaign_id
       and d.user_id = q.user_id
  ) then
    raise exception 'A quest can only give a handout from its own campaign' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.quest_consequence_document_in_campaign() from public, anon, authenticated;

create trigger quest_consequences_document_in_campaign
  before insert or update of target_document_id, quest_id on public.quest_consequences
  for each row execute procedure private.quest_consequence_document_in_campaign();

drop index public.quest_consequences_beat_rule_uniq;
drop index public.quest_consequences_edge_rule_uniq;
drop index public.quest_consequences_location_rule_uniq;

create unique index quest_consequences_beat_rule_uniq on public.quest_consequences (
  on_beat_id, action,
  coalesce(target_objective_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_quest_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_npc_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_document_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where on_beat_id is not null
    and action <> all (array['create_calendar_event', 'send_broadcast', 'grant_knowledge', 'award_milestone']);

create unique index quest_consequences_edge_rule_uniq on public.quest_consequences (
  on_edge_id, action,
  coalesce(target_objective_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_quest_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_npc_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_document_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where on_edge_id is not null
    and action <> all (array['create_calendar_event', 'send_broadcast', 'grant_knowledge', 'award_milestone']);

create unique index quest_consequences_location_rule_uniq on public.quest_consequences (
  on_location_id, on_location_fact, action,
  coalesce(target_objective_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_quest_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_npc_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_document_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where on_location_id is not null
    and action <> all (array['create_calendar_event', 'send_broadcast', 'grant_knowledge', 'award_milestone']);

create index quest_consequences_document_idx on public.quest_consequences (target_document_id)
  where target_document_id is not null;

-- The document a fired `give_handout` event names: the rule's, or null when it
-- has left the quest's campaign since the rule was written (the rule's trigger
-- above checks only when the rule is written). The event row goes through
-- zz_same_campaign_refs, which refuses a document of another campaign, so
-- carrying the stale id would abort the whole Advance instead of the perform
-- arm's "a handout moved out of the campaign is simply not given".
create or replace function private.handout_still_in_campaign(p_document_id uuid, p_campaign_id uuid)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select d.id from public.scriptorium_documents d
   where d.id = p_document_id and d.campaign_id = p_campaign_id
$$;

revoke execute on function private.handout_still_in_campaign(uuid, uuid) from public, anon, authenticated;

-- ── The engine, restated ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.apply_quest_consequences(p_campaign_id uuid, p_quest_id uuid, p_transition_id uuid, p_beat_id uuid DEFAULT NULL::uuid, p_edge_id uuid DEFAULT NULL::uuid, p_changed_objective_ids uuid[] DEFAULT '{}'::uuid[], p_settled_before boolean DEFAULT NULL::boolean, p_hold uuid[] DEFAULT '{}'::uuid[], p_location_id uuid DEFAULT NULL::uuid, p_location_fact text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_settled_before boolean;
  v_rule record;
  v_prev_status text;
  v_prev_visible boolean;
  v_event_id uuid;
  v_changed uuid[] := coalesce(p_changed_objective_ids, '{}');
  v_hold uuid[] := coalesce(p_hold, '{}');
  v_fired boolean;
  v_round integer := 0;
  v_today record;
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
              (p_beat_id is not null and c.on_beat_id = p_beat_id)
              or (p_edge_id is not null and c.on_edge_id = p_edge_id)
              -- #869: a place's fact, named by the caller like a beat or an
              -- edge is -- round 0 only, since nothing the engine itself does
              -- ever asserts a location fact.
              or (p_location_id is not null
                  and c.on_location_id = p_location_id
                  and c.on_location_fact = p_location_fact)
           ))
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
      v_prev_visible := null;

      -- A held rule is logged as having applied to this beat/edge — the DM
      -- untucked it deliberately — but changes nothing, performs nothing, and
      -- does not seed the cascade with an objective that never actually moved.
      if v_rule.id = any(v_hold) then
        insert into public.quest_consequence_events (
          campaign_id, quest_id, transition_id, consequence_id, action,
          target_objective_id, target_npc_id, target_quest_id, target_document_id,
          action_payload, after_days, fires_on_year, fires_on_month, fires_on_day,
          held_at
        ) values (
          p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
          v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, private.handout_still_in_campaign(v_rule.target_document_id, p_campaign_id),
          v_rule.action_payload, v_rule.after_days,
          v_today.current_year, v_today.current_month, v_today.current_day,
          now()
        );
        continue;
      end if;

      if v_rule.action in ('raise', 'reveal', 'complete', 'fail') then
        select status, is_player_visible into v_prev_status, v_prev_visible
          from public.quest_objectives where id = v_rule.target_objective_id;

        update public.quest_objectives
           set status = case v_rule.action
                 when 'raise' then case when status = 'dormant' then 'pending' else status end
                 when 'reveal' then case when status = 'dormant' then 'pending' else status end
                 when 'complete' then 'complete'
                 when 'fail' then 'failed'
               end,
               is_player_visible = case when v_rule.action = 'reveal' then true else is_player_visible end
         where id = v_rule.target_objective_id;
      end if;

      insert into public.quest_consequence_events (
        campaign_id, quest_id, transition_id, consequence_id, action,
        target_objective_id, target_npc_id, target_quest_id, target_document_id, previous_status, previous_is_player_visible,
        action_payload, after_days, fires_on_year, fires_on_month, fires_on_day
      ) values (
        p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
        v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, private.handout_still_in_campaign(v_rule.target_document_id, p_campaign_id), v_prev_status, v_prev_visible,
        v_rule.action_payload, v_rule.after_days,
        v_today.current_year, v_today.current_month, v_today.current_day
      ) returning id into v_event_id;

      -- World actions perform now when due immediately. The three verbs added
      -- by #852 (grant_knowledge, owe_favor, award_milestone) join the four
      -- that already performed this way — they are world actions too, just
      -- ones with somewhere specific to write.
      if v_rule.after_days = 0 and v_rule.action in (
        'create_calendar_event', 'send_broadcast', 'shift_npc_relationship', 'unlock_quest',
        'grant_knowledge', 'owe_favor', 'award_milestone', 'give_handout'
      ) then
        perform private.perform_quest_consequence(
          v_event_id, v_today.current_year, v_today.current_month, v_today.current_day
        );
      end if;

      if v_rule.target_objective_id is not null
         and not (v_rule.target_objective_id = any(v_changed)) then
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
          target_objective_id, target_npc_id, target_quest_id, target_document_id, action_payload, after_days,
          fires_on_year, fires_on_month, fires_on_day, held_at
        ) values (
          p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
          v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, private.handout_still_in_campaign(v_rule.target_document_id, p_campaign_id), v_rule.action_payload, v_rule.after_days,
          v_today.current_year, v_today.current_month, v_today.current_day, now()
        );
        continue;
      end if;

      insert into public.quest_consequence_events (
        campaign_id, quest_id, transition_id, consequence_id, action,
        target_objective_id, target_npc_id, target_quest_id, target_document_id, action_payload, after_days,
        fires_on_year, fires_on_month, fires_on_day
      ) values (
        p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
        v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, private.handout_still_in_campaign(v_rule.target_document_id, p_campaign_id), v_rule.action_payload, v_rule.after_days,
        v_today.current_year, v_today.current_month, v_today.current_day
      ) returning id into v_event_id;

      if v_rule.after_days = 0 and v_rule.action in (
        'create_calendar_event', 'send_broadcast', 'shift_npc_relationship', 'unlock_quest',
        'grant_knowledge', 'owe_favor', 'award_milestone', 'give_handout'
      ) then
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
  v_prev_visible boolean;
  v_doc record;
  v_added uuid[];
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
             when 'complete' then 'complete'
             when 'fail' then 'failed'
           end,
           is_player_visible = case when v_ev.action = 'reveal' then true else is_player_visible end
     where id = v_ev.target_objective_id;

    update public.quest_consequence_events
       set previous_status = v_prev_status, previous_is_player_visible = v_prev_visible
     where id = p_event_id;

  elsif v_ev.action = 'create_calendar_event' then
    insert into public.calendar_events (
      user_id, campaign_id, title, description, event_type,
      harptos_year, harptos_month, harptos_day, linked_quest_id, player_visible
    ) values (
      v_q.user_id, v_ev.campaign_id,
      coalesce(nullif(btrim(v_ev.action_payload ->> 'title'), ''), v_q.title),
      v_ev.action_payload ->> 'description',
      v_ev.action_payload ->> 'event_type',
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
    select d.id, d.content, d.player_visible_to into v_doc
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
        v_ev.campaign_id, v_doc.content, v_doc.player_visible_to || v_added, false);
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
  end if;

  update public.quest_consequence_events
     set performed_at = now(), held_at = null,
         performed_on_year = p_year, performed_on_month = p_month, performed_on_day = p_day
   where id = p_event_id;
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

  if p_command is null or p_command not in ('start', 'advance', 'previous', 'jump', 'return', 'improv', 'pause', 'resume', 'end') then
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
    if v_state.status not in ('running', 'paused', 'waiting') or v_visit_index <= 0 then
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
  elsif p_command = 'pause' then
    if v_state.status <> 'running' or v_from_beat_id is null then
      raise exception 'Only a running quest session can be paused';
    end if;
    v_kind := 'pause';
    v_status := 'paused';
  elsif p_command = 'resume' then
    if v_state.status <> 'paused' or v_from_beat_id is null then
      raise exception 'Only a paused quest session can be resumed';
    end if;
    v_kind := 'resume';
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
  -- with more than one authored incoming route parks the arriving thread
  -- instead of running it straight through.
  if v_kind in ('forward', 'jump', 'return', 'improv') and v_to_beat_id is not null then
    v_status := private.compute_arrival_status(p_quest_id, v_to_beat_id);
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
      and exists (
        select 1 from public.quest_consequence_events ev
         where ev.transition_id = t.id and ev.undone_at is null
      )
    order by t.created_at desc, t.id desc
    limit 1;

    if v_undo_transition_id is not null then
      update public.quest_objectives o
      set status = first_event.previous_status,
          is_player_visible = first_event.previous_is_player_visible
      from (
        select distinct on (ev.target_objective_id)
          ev.target_objective_id, ev.previous_status, ev.previous_is_player_visible
        from public.quest_consequence_events ev
        where ev.transition_id = v_undo_transition_id
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
        where ev.transition_id = v_undo_transition_id
          and ev.target_npc_id is not null
          and ev.previous_relationship is not null
          and ev.undone_at is null
        order by ev.target_npc_id, ev.seq
      ) first_npc
      where n.id = first_npc.target_npc_id;

      -- Undo takes an unlocked quest back to undiscovered only while it is
      -- still active: a quest the DM has since completed or failed is not
      -- yanked back by an undo elsewhere. Visibility is deliberately NOT
      -- reverted — a rumour heard is not unheard; the DM can hide the beat
      -- again by hand if that is truly what they want.
      update public.quests q
      set status = first_quest.previous_quest_status
      from (
        select distinct on (ev.target_quest_id)
          ev.target_quest_id, ev.previous_quest_status
        from public.quest_consequence_events ev
        where ev.transition_id = v_undo_transition_id
          and ev.target_quest_id is not null
          and ev.previous_quest_status is not null
          and ev.undone_at is null
        order by ev.target_quest_id, ev.seq
      ) first_quest
      where q.id = first_quest.target_quest_id
        and q.status = 'active';

      delete from public.calendar_events
       where id in (select ev.calendar_event_id from public.quest_consequence_events ev
                     where ev.transition_id = v_undo_transition_id and ev.calendar_event_id is not null);
      delete from public.campaign_messages
       where id in (select ev.message_id from public.quest_consequence_events ev
                     where ev.transition_id = v_undo_transition_id and ev.message_id is not null);
      delete from public.player_journal_entries
       where id in (select ev.journal_entry_id from public.quest_consequence_events ev
                     where ev.transition_id = v_undo_transition_id and ev.journal_entry_id is not null);
      delete from public.npc_favors
       where id in (select ev.favor_id from public.quest_consequence_events ev
                     where ev.transition_id = v_undo_transition_id and ev.favor_id is not null);
      delete from public.party_milestones
       where id in (select ev.milestone_id from public.quest_consequence_events ev
                     where ev.transition_id = v_undo_transition_id and ev.milestone_id is not null);
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
           where ev.transition_id = v_undo_transition_id
             and ev.target_document_id is not null
             and ev.undone_at is null
           group by ev.target_document_id
        ) given
       where given.target_document_id = d.id;

      update public.quest_consequence_events
         set undone_at = now()
       where transition_id = v_undo_transition_id and undone_at is null;
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
      v_new_thread_label := coalesce(nullif(btrim(v_spawn_edge.thread_label), ''), v_spawn_target_title);

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
        private.compute_arrival_status(p_quest_id, v_spawn_edge.target_beat_id),
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
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'id', t.id, 'label', t.label, 'status', t.status,
    'opened_by_edge_id', t.opened_by_edge_id, 'parent_thread_id', t.parent_thread_id,
    'merged_into_thread_id', t.merged_into_thread_id, 'created_at', t.created_at
  ) into v_thread
  from public.quest_threads t
  where t.id = p_thread_id and t.quest_id = p_quest_id and t.campaign_id = p_campaign_id;

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
   where campaign_id = p_campaign_id and quest_id = p_quest_id and thread_id = p_thread_id;
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
    'thread_label', e.thread_label,
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
    'gate', (
      select jsonb_build_object(
        'objective_id', g.objective_id, 'objective', o.description,
        'required_status', g.status, 'current_status', o.status,
        'is_open', o.status = g.status
      )
      from public.quest_beat_edge_gates g
      join public.quest_objectives o on o.id = g.objective_id
      where g.edge_id = e.id
    ),
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
        'action_payload', qc.action_payload, 'after_days', qc.after_days,
        'on_edge', qc.on_edge_id is not null
      ) order by qc.created_at)
      from public.quest_consequences qc
      left join public.quest_objectives tobj on tobj.id = qc.target_objective_id
      left join public.npcs tnpc on tnpc.id = qc.target_npc_id
      left join public.quests tquest on tquest.id = qc.target_quest_id
      left join public.scriptorium_documents tdoc on tdoc.id = qc.target_document_id
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
      and (t.thread_id = p_thread_id or t.thread_id is null)
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

-- private.perform_quest_consequence has carried PUBLIC execute since it was
-- created, safe only because PostgREST does not expose `private`. This change
-- widens what it does (it now writes document shares), so close it: both of
-- its callers, public.perform_quest_consequence and
-- private.apply_quest_consequences, are SECURITY DEFINER and need no grant.
revoke execute on function private.perform_quest_consequence(uuid, integer, integer, integer) from public, anon, authenticated;
