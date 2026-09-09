-- A quest rule can watch a place. #869, split out of epic #868 (frame 15 of
-- `atlas/Sites & Cartographer.html`: "A durable Cleared assertion on a room is
-- a world fact with provenance. An objective may watch for it, which is the
-- honest version of 'the DM ticks the box twice'.")
--
-- The one rule engine (#794) fires a rule at most once per TRANSITION:
-- `quest_consequence_events.transition_id` is both the dedupe key and the
-- provenance of a firing. A `location_state_events` row is not a transition,
-- which is why #868 left this line out. The answer is the shape
-- `assert_quest_objective_status` already uses for a ledger write that
-- happens outside any beat: an `assert` transition with a quest and no beat.
-- A place's fact does the same, once per (state event, quest), and the engine
-- gains a fourth round-0 condition beside beat, edge and objective.
--
-- Decisions:
--   * Only a `true` assertion fires. Taking a fact back ("no, not looted
--     after all") never un-completes an objective -- undo on the ledger is the
--     DM's own act, as it is for every other consequence.
--   * Only a location fact fires -- door facts (unlocked, found) are play
--     state of a way out, not of a place.
--   * Rules on the campaign's ACTIVE quests fire. A fact asserted while a
--     quest is undiscovered, a rumour or already over is not retroactive;
--     when the quest later becomes active the rule simply waits for the next
--     assertion, which is what "watch" means.
--   * The trigger is SECURITY DEFINER because it writes a transition and runs
--     the engine on behalf of whoever asserted the fact -- the DM through the
--     Progress controls, `mark_arrival_explored` on a party move, or
--     `dispatch_loot` recording `looted` -- and it authorizes by the row it is
--     handed: the inserting policy already required a DM of that location's
--     campaign, and the quests it reaches are that campaign's own.

-- ── The condition ───────────────────────────────────────────────────────────
alter table public.quest_consequences
  add column on_location_id uuid references public.locations(id) on delete cascade,
  add column on_location_fact text
    constraint quest_consequences_location_fact_check
      check (on_location_fact is null or on_location_fact in ('explored', 'cleared', 'looted')),
  add constraint quest_consequences_location_fact_paired
    check ((on_location_fact is null) = (on_location_id is null));

alter table public.quest_consequences
  drop constraint quest_consequences_one_condition;
alter table public.quest_consequences
  add constraint quest_consequences_one_condition check (
    num_nonnulls(on_beat_id, on_edge_id, on_objective_id, on_location_id) + on_quest_settled::int = 1
  );

comment on column public.quest_consequences.on_location_id is
  'Fires when this place gains on_location_fact (a true assertion in location_state_events). #869.';

create index quest_consequences_location_idx
  on public.quest_consequences (on_location_id) where on_location_id is not null;

create unique index quest_consequences_location_uniq
  on public.quest_consequences (on_location_id, on_location_fact, action, coalesce(target_objective_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where on_location_id is not null;

-- ── The engine, two trailing parameters wider ───────────────────────────────
--
-- Dropped and recreated rather than replaced: a new trailing parameter on a
-- PL/pgSQL function creates a silent second overload instead of replacing the
-- original (20260908210321 learned this). Every existing caller passes eight
-- or fewer arguments and resolves to this one through the defaults.
drop function if exists private.apply_quest_consequences(uuid, uuid, uuid, uuid, uuid, uuid[], boolean, uuid[]);

create function private.apply_quest_consequences(
  p_campaign_id uuid,
  p_quest_id uuid,
  p_transition_id uuid,
  p_beat_id uuid default null,
  p_edge_id uuid default null,
  p_changed_objective_ids uuid[] default '{}',
  p_settled_before boolean default null,
  p_hold uuid[] default '{}',
  p_location_id uuid default null,
  p_location_fact text default null
) returns void
language plpgsql
security definer
set search_path = public, private
as $function$
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
          target_objective_id, target_npc_id, target_quest_id,
          action_payload, after_days, fires_on_year, fires_on_month, fires_on_day,
          held_at
        ) values (
          p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
          v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id,
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
        target_objective_id, target_npc_id, target_quest_id, previous_status, previous_is_player_visible,
        action_payload, after_days, fires_on_year, fires_on_month, fires_on_day
      ) values (
        p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
        v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, v_prev_status, v_prev_visible,
        v_rule.action_payload, v_rule.after_days,
        v_today.current_year, v_today.current_month, v_today.current_day
      ) returning id into v_event_id;

      -- World actions perform now when due immediately. The three verbs added
      -- by #852 (grant_knowledge, owe_favor, award_milestone) join the four
      -- that already performed this way — they are world actions too, just
      -- ones with somewhere specific to write.
      if v_rule.after_days = 0 and v_rule.action in (
        'create_calendar_event', 'send_broadcast', 'shift_npc_relationship', 'unlock_quest',
        'grant_knowledge', 'owe_favor', 'award_milestone'
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
          target_objective_id, target_npc_id, target_quest_id, action_payload, after_days,
          fires_on_year, fires_on_month, fires_on_day, held_at
        ) values (
          p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
          v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, v_rule.action_payload, v_rule.after_days,
          v_today.current_year, v_today.current_month, v_today.current_day, now()
        );
        continue;
      end if;

      insert into public.quest_consequence_events (
        campaign_id, quest_id, transition_id, consequence_id, action,
        target_objective_id, target_npc_id, target_quest_id, action_payload, after_days,
        fires_on_year, fires_on_month, fires_on_day
      ) values (
        p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
        v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, v_rule.action_payload, v_rule.after_days,
        v_today.current_year, v_today.current_month, v_today.current_day
      ) returning id into v_event_id;

      if v_rule.after_days = 0 and v_rule.action in (
        'create_calendar_event', 'send_broadcast', 'shift_npc_relationship', 'unlock_quest',
        'grant_knowledge', 'owe_favor', 'award_milestone'
      ) then
        perform private.perform_quest_consequence(
          v_event_id, v_today.current_year, v_today.current_month, v_today.current_day
        );
      end if;
    end loop;
  end if;
end $function$;

comment on function private.apply_quest_consequences(uuid, uuid, uuid, uuid, uuid, uuid[], boolean, uuid[], uuid, text) is
  'The one rule engine: fires a beat/edge/objective-became/place-fact/ledger-settled rule at most once per transition, unless its id is held (#852), in which case it is logged and does nothing.';

revoke execute on function private.apply_quest_consequences(uuid, uuid, uuid, uuid, uuid, uuid[], boolean, uuid[], uuid, text) from public, anon, authenticated;

-- ── The watcher ─────────────────────────────────────────────────────────────
create or replace function private.fire_location_fact_consequences()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_campaign uuid;
  v_name text;
  v_quest record;
  v_tid uuid;
  v_settled_before boolean;
begin
  -- Location facts only, asserted true. A door fact or a retraction is not a
  -- thing a rule watches (header).
  if new.door_id is not null or not new.value then
    return new;
  end if;

  select l.campaign_id, l.name into v_campaign, v_name
    from public.locations l where l.id = new.location_id;
  if v_campaign is null then
    return new;
  end if;

  for v_quest in
    select distinct q.id, q.title
      from public.quests q
      join public.quest_consequences c on c.quest_id = q.id
     where q.campaign_id = v_campaign
       and q.status = 'active'
       and c.on_location_id = new.location_id
       and c.on_location_fact = new.fact
  loop
    v_settled_before := private.quest_ledger_settled(v_quest.id);

    -- One assert transition per (fact, quest): the engine's dedupe key and
    -- the log's provenance, exactly as assert_quest_objective_status writes.
    insert into public.quest_beat_transitions (
      campaign_id, from_quest_id, to_quest_id, transition_kind, reason, created_by, to_quest_title, provenance
    ) values (
      v_campaign, v_quest.id, v_quest.id, 'assert',
      v_name || ' ' || new.fact,
      new.user_id, v_quest.title,
      jsonb_build_object('location_state_event_id', new.id, 'location_id', new.location_id, 'fact', new.fact)
    ) returning id into v_tid;

    perform private.apply_quest_consequences(
      v_campaign, v_quest.id, v_tid, null, null, '{}', v_settled_before, '{}',
      new.location_id, new.fact
    );
  end loop;

  return new;
end;
$$;

revoke execute on function private.fire_location_fact_consequences() from public, anon, authenticated;

create trigger location_state_events_fire_consequences
  after insert on public.location_state_events
  for each row execute procedure private.fire_location_fact_consequences();
