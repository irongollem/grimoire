-- A beat can unlock another quest. Story #836.
--
-- From the maintainer's own campaign, reading a chapter's ending:
--
--   "If you allow Trex to live and come to the village, the ghost that's
--    possessing him will likely move into a human host over time. Figuring that
--    out and perhaps dealing with it is a new quest, but one that only unlocks
--    when certain choices are made."
--
-- A sequel gated on how its predecessor resolved. The model could not express
-- it, and the reason was a single missing verb.
--
-- ── Three of the four pieces already existed ──────────────────────────────
--
-- Measured against production before building anything:
--
--   * `parent_quest_id` is live — 3 of 20 quests have a parent, across 2
--     distinct parents. The relation is used, quietly.
--   * 5 of 20 quests sit `undiscovered`, which is already exactly what "locked"
--     looks like. No new status was needed.
--   * Promotion already happens: arriving at a beat moves a quest `rumor` →
--     `active`, never demotes, never touches `completed`/`failed`.
--
-- What was missing is that **nothing anywhere moved a quest out of
-- `undiscovered`** except a DM editing it by hand. Every consequence action
-- acted on an objective or on the world; none acted on another quest.
--
-- ── "Unlocked by" is NOT "child of" ───────────────────────────────────────
--
-- The obvious shortcut is to make the unlocked quest a child of the one that
-- unlocked it. The maintainer's own example refutes it: completing a witch
-- hunt unlocks the theft of the reward it yielded — a natural child — **and**
-- a second quest he describes as "utterly unrelated". Same trigger, different
-- relationship.
--
-- So they are two relations and are kept apart:
--
--   * `parent_quest_id` — *this quest is part of that arc.* Structural,
--     authored, about belonging.
--   * the unlock — *this quest became available because that happened.*
--     Causal, fired by a rule, and says nothing about belonging.
--
-- This action therefore names a quest and **leaves `parent_quest_id` alone**.
-- Merging them would make every unlocked quest a child of its trigger, which is
-- wrong for exactly the case that prompted the feature — and very hard to undo
-- once data exists.
--
-- ── What the production shape does NOT tell us ────────────────────────────
--
-- That arc's middle node is `undiscovered` with zero objectives while both its
-- children have been played, which reads like a container — a quest pressed
-- into service as a folder. It is not a pattern to support: the maintainer
-- authored it "before we even had the tree structures … don't take it as 'the
-- way we want it'". Designing around it would enshrine a workaround as a
-- requirement. We design for how it should be and migrate old data afterwards.

alter table public.quest_consequences
  add column if not exists target_quest_id uuid references public.quests(id) on delete cascade;

alter table public.quest_consequences
  drop constraint if exists quest_consequences_action_check,
  add constraint quest_consequences_action_check check (
    action in ('raise', 'reveal', 'complete', 'fail',
               'create_calendar_event', 'send_broadcast',
               'shift_npc_relationship', 'unlock_quest')
  );

alter table public.quest_consequences
  drop constraint if exists quest_consequences_quest_pair,
  add constraint quest_consequences_quest_pair check (
    (action = 'unlock_quest') = (target_quest_id is not null)
  );

-- A quest cannot unlock itself. Not a cycle guard in general — A unlocks B
-- unlocks A is still authorable — but that cycle is harmless where this one is
-- not: a rule on a quest the party is already in, promoting that same quest out
-- of `undiscovered`, is nonsense the DM cannot see from the rule editor. The
-- general case is already bounded, because a promotion only ever fires on a
-- quest still sitting at `undiscovered`, so a loop settles after one pass.
alter table public.quest_consequences
  drop constraint if exists quest_consequences_no_self_unlock,
  add constraint quest_consequences_no_self_unlock check (
    target_quest_id is null or target_quest_id <> quest_id
  );

comment on column public.quest_consequences.target_quest_id is
  'The quest an unlock_quest rule promotes (#836). A real FK so deleting a quest '
  'takes the rules pointing at it with it. Deliberately NOT parent_quest_id: '
  '"unlocked by" and "child of" are different relations, and one trigger can '
  'legitimately open both a sequel and something unrelated.';

alter table public.quest_consequence_events
  add column if not exists target_quest_id uuid,
  add column if not exists previous_quest_status public.quest_status_enum;

comment on column public.quest_consequence_events.previous_quest_status is
  'The status this event promoted the target quest out of (#836) — what undo '
  'restores. Null means the unlock was a no-op: the quest was gone, in another '
  'campaign, or already past `undiscovered`. Undo skips those.';

-- Not an FK, for the same reason `target_npc_id` on this table is not: the
-- event log is append-only, and a cascade would erase the record that an unlock
-- happened once the quest is deleted. The rule cascades; the history does not.
CREATE OR REPLACE FUNCTION private.apply_quest_consequences(p_campaign_id uuid, p_quest_id uuid, p_transition_id uuid, p_beat_id uuid DEFAULT NULL::uuid, p_edge_id uuid DEFAULT NULL::uuid, p_changed_objective_ids uuid[] DEFAULT '{}'::uuid[], p_settled_before boolean DEFAULT NULL::boolean)
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
  v_fired boolean;
  v_round integer := 0;
  v_today record;
begin
  -- The caller may already have moved the ledger before asking what follows —
  -- `assert_quest_objective_status` sets a status and then calls in, so by the
  -- time we get here the quest may ALREADY be settled and the edge we are
  -- watching for has passed. A caller that changed something first must tell us
  -- what the level was beforehand; the runtime, which changes objectives only
  -- through this function, can let us take the snapshot ourselves.
  v_settled_before := coalesce(p_settled_before, private.quest_ledger_settled(p_quest_id));
  select current_year, current_month, current_day into v_today
    from public.campaigns where id = p_campaign_id;

  -- `p_changed_objective_ids` seeds the cascade with what the CALLER changed
  -- before getting here — `assert_quest_objective_status` sets a status and
  -- then asks what follows from it. Without the seed an assertion fires
  -- nothing, because the engine would only ever see objectives it had moved
  -- itself.
  loop
    v_fired := false;

    for v_rule in
      select c.*
        from public.quest_consequences c
       where c.quest_id = p_quest_id
         -- Once per transition. An `on_objective_status` condition stays true
         -- after it fires, so without this a single rule re-fires every round
         -- until the loop bound trips — a rule is a thing that happened, not a
         -- state that keeps happening.
         and not exists (
           select 1 from public.quest_consequence_events e
            where e.transition_id = p_transition_id and e.consequence_id = c.id
         )
         and (
           (v_round = 0 and (
              (p_beat_id is not null and c.on_beat_id = p_beat_id)
              or (p_edge_id is not null and c.on_edge_id = p_edge_id)
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

      if v_rule.action in ('raise', 'reveal', 'complete', 'fail') then
        select status, is_player_visible into v_prev_status, v_prev_visible
          from public.quest_objectives where id = v_rule.target_objective_id;

        update public.quest_objectives
           set status = case v_rule.action
                 -- `raise` wakes a dormant objective and never un-settles one
                 -- already resolved.
                 when 'raise' then case when status = 'dormant' then 'pending' else status end
                 -- `reveal` implies raise: you cannot tell the party about an
                 -- objective that has not been raised, and the constraint
                 -- forbids the pair outright (#792).
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

      -- Immediate world actions perform now. Delayed ones wait for the client,
      -- which owns the calendar arithmetic — see the column comment.
      if v_rule.after_days = 0 and v_rule.action in ('create_calendar_event', 'send_broadcast', 'shift_npc_relationship', 'unlock_quest') then
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
      -- A DM has authored a loop. Fail the advance loudly rather than apply
      -- half of it and leave the ledger in a state nobody wrote.
      raise exception 'consequence cascade exceeded 8 rounds on quest % — check for a rule loop', p_quest_id;
    end if;
  end loop;

  -- Did the ledger just settle? A level before and a level after; the rules
  -- fire on the edge between them, so a quest that was already settled fires
  -- nothing, and one with no objectives never settles at all.
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
      insert into public.quest_consequence_events (
        campaign_id, quest_id, transition_id, consequence_id, action,
        target_objective_id, target_npc_id, target_quest_id, action_payload, after_days,
        fires_on_year, fires_on_month, fires_on_day
      ) values (
        p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
        v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, v_rule.action_payload, v_rule.after_days,
        v_today.current_year, v_today.current_month, v_today.current_day
      ) returning id into v_event_id;

      if v_rule.after_days = 0 and v_rule.action in ('create_calendar_event', 'send_broadcast', 'shift_npc_relationship', 'unlock_quest') then
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
  v_prev_quest_status public.quest_status_enum;
begin
  select * into v_ev from public.quest_consequence_events where id = p_event_id;
  if not found or v_ev.performed_at is not null or v_ev.undone_at is not null then
    return;
  end if;
  select * into v_q from public.quests where id = v_ev.quest_id;

  if v_ev.action = 'create_calendar_event' then
    insert into public.calendar_events (
      user_id, campaign_id, title, description, event_type,
      harptos_year, harptos_month, harptos_day, linked_quest_id, player_visible
    ) values (
      v_q.user_id, v_ev.campaign_id,
      coalesce(nullif(btrim(v_ev.action_payload ->> 'title'), ''), v_q.title),
      v_ev.action_payload ->> 'description',
      v_ev.action_payload ->> 'event_type',
      p_year, p_month, p_day, v_ev.quest_id,
      -- DM-only by construction: a consequence the party has not been told
      -- about must not appear on their calendar the moment it is earned.
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
    -- Read the disposition at *perform* time, not when the rule fired. A
    -- delayed shift ("word reaches the guild in three days") must move the NPC
    -- from wherever they stand when it lands, and the value captured here is
    -- what undo restores.
    select n.relationship into v_prev_rel
      from public.npcs n
     where n.id = v_ev.target_npc_id and n.campaign_id = v_ev.campaign_id;

    -- Three ways this is a no-op, and all three are deliberate rather than
    -- error cases — a rule engine must never leave a caller wondering whether
    -- a NULL meant "failed" or "nothing to do":
    --
    --   * the NPC is gone, or belongs to another campaign;
    --   * they sit at `unknown`, which is NOT a rung on the ladder. Shifting
    --     from "we have not established this" is meaningless, and treating it
    --     as `indifferent` would invent a stance the DM never set;
    --   * the step is zero or absent.
    --
    -- In each case `previous_relationship` stays null, which is exactly what
    -- makes undo a no-op too.
    v_step := coalesce((v_ev.action_payload ->> 'step')::int, 0);
    if v_prev_rel is not null and v_prev_rel <> 'unknown' and v_step <> 0 then
      v_idx := array_position(v_ladder, v_prev_rel::text);
      -- Clamps at both ends rather than wrapping or raising. A beat that fires
      -- on an already-helpful NPC should do nothing, not roll round to hostile.
      v_idx := least(greatest(v_idx + v_step, 1), array_length(v_ladder, 1));
      update public.npcs
         set relationship = v_ladder[v_idx]::public.npc_relationship
       where id = v_ev.target_npc_id;
      update public.quest_consequence_events
         set previous_relationship = v_prev_rel
       where id = p_event_id;
    end if;

  elsif v_ev.action = 'unlock_quest' then
    -- Promote the sequel out of hiding. `undiscovered` is already what a
    -- not-yet-met quest looks like, and arriving at a beat already promotes
    -- `rumor` → `active`, so this is the one rung that had no trigger: nothing
    -- anywhere moved a quest OUT of `undiscovered` except a DM editing it.
    --
    -- To `rumor`, not `active`: the party has caused this quest, not met it.
    -- Reaching it is still their move, and the existing promotion handles that.
    select q.status into v_prev_quest_status
      from public.quests q
     where q.id = v_ev.target_quest_id and q.campaign_id = v_ev.campaign_id;

    -- Only ever promotes out of `undiscovered`. A quest the party has already
    -- found, finished or failed is not re-hidden or re-announced by a rule
    -- firing late, and a target that is gone or in another campaign is a
    -- no-op with a null `previous_quest_status` — which is what makes undo a
    -- no-op too. Every path either promotes and records, or does neither.
    if v_prev_quest_status = 'undiscovered' then
      update public.quests set status = 'rumor' where id = v_ev.target_quest_id;
      update public.quest_consequence_events
         set previous_quest_status = v_prev_quest_status
       where id = p_event_id;
    end if;
  end if;

  update public.quest_consequence_events
     set performed_at = now(),
         performed_on_year = p_year, performed_on_month = p_month, performed_on_day = p_day
   where id = p_event_id;
end $function$;

CREATE OR REPLACE FUNCTION public.transition_quest_runtime(p_campaign_id uuid, p_quest_id uuid, p_command text, p_expected_version bigint, p_target_beat_id uuid DEFAULT NULL::uuid, p_edge_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text, p_push_return boolean DEFAULT false, p_provenance jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_state public.quest_runtime_state;
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

  select q.title into v_quest_title
  from public.quests q
  where q.id = p_quest_id and q.campaign_id = p_campaign_id;
  if not found then
    raise exception 'That quest is not in this campaign';
  end if;

  -- Two co-DMs running two different chains no longer contend: the lock and the
  -- version are both per quest.
  perform pg_advisory_xact_lock(hashtextextended(p_campaign_id::text || ':' || p_quest_id::text, 0));
  insert into public.quest_runtime_state (campaign_id, quest_id)
  values (p_campaign_id, p_quest_id)
  on conflict (campaign_id, quest_id) do nothing;

  select * into v_state
  from public.quest_runtime_state
  where campaign_id = p_campaign_id and quest_id = p_quest_id
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
    select e.target_beat_id
      into v_to_beat_id
    from public.quest_beat_edges e
    where e.id = p_edge_id
      and e.campaign_id = p_campaign_id
      and e.quest_id = p_quest_id
      and e.source_beat_id = v_from_beat_id;
    if not found then raise exception 'That edge is not an outgoing choice'; end if;

    -- The gate is enforced here, not only drawn in the cockpit. A route the
    -- ledger says is shut must actually be shut, or it is decoration; the
    -- override that already exists and already demands a reason is Jump (#795).
    declare
      v_gate record;
    begin
      select g.status as required, o.status as current, o.description as objective
        into v_gate
        from public.quest_beat_edge_gates g
        join public.quest_objectives o on o.id = g.objective_id
       where g.edge_id = p_edge_id;
      if found and v_gate.current is distinct from v_gate.required then
        raise exception 'That route needs "%" to be %, and it is %',
          v_gate.objective, v_gate.required, v_gate.current
          using errcode = '23514';
      end if;
    end;
    v_kind := 'forward';
    v_provenance := v_provenance || jsonb_build_object('edge_id', p_edge_id);
  elsif p_command = 'previous' then
    -- Undo, not replay. The stack holds only this quest's beats now, so Back can
    -- no longer walk out of the chain the DM is running.
    if v_state.status not in ('running', 'paused') or v_visit_index <= 0 then
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
    -- Ending one chain leaves every other chain exactly where it stands. The
    -- campaign-wide equivalent is end_campaign_quest_session below, which
    -- pauses rather than clears so nothing is discarded.
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
  where campaign_id = p_campaign_id and quest_id = p_quest_id and version = p_expected_version;

  if not found then
    raise exception 'Quest runtime changed while applying command' using errcode = '40001';
  end if;

  insert into public.quest_beat_transitions (
    campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
    transition_kind, reason, runtime_version, provenance,
    from_quest_title, from_beat_title, to_quest_title, to_beat_title
  ) values (
    p_campaign_id,
    case when v_from_beat_id is null then null else p_quest_id end, v_from_beat_id,
    case when v_to_beat_id is null then null else p_quest_id end, v_to_beat_id,
    v_kind, nullif(btrim(p_reason), ''), p_expected_version + 1, v_provenance,
    case when v_from_beat_id is null then null else v_quest_title end, v_from_beat_title,
    case when v_to_beat_id is null then null else v_quest_title end, v_to_beat_title
  )
  returning id into v_transition_id;

  if v_kind = 'previous' then
    -- Undo the newest not-yet-undone arrival at the beat being left. Stepping
    -- back twice therefore unwinds two arrivals, in order.
    select t.id into v_undo_transition_id
    from public.quest_beat_transitions t
    where t.campaign_id = p_campaign_id
      and t.to_quest_id = p_quest_id
      and t.to_beat_id = v_from_beat_id
      and t.id <> v_transition_id
      -- `assert` transitions are skipped: stepping back unwinds the arrival the
      -- party actually made, not a status the DM asserted in prep. Undoing an
      -- assertion is its own affordance (#796).
      and t.transition_kind <> 'assert'
      and exists (
        select 1 from public.quest_consequence_events ev
         where ev.transition_id = t.id and ev.undone_at is null
      )
    order by t.created_at desc, t.id desc
    limit 1;

    if v_undo_transition_id is not null then
      -- `distinct on` takes the *first* event per objective: when one arrival
      -- fired two effects at the same objective, the state to restore is what
      -- stood before either of them, not what stood between them.
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
        -- Ordered by `seq`, not `created_at`: every event in a transition
        -- shares the transaction timestamp, so ordering by time ties and the
        -- tiebreak falls to a random uuid (#787). `distinct on` then takes the
        -- FIRST event per objective — what stood before the arrival, not what
        -- stood between two of its consequences.
        order by ev.target_objective_id, ev.seq
      ) first_event
      where o.id = first_event.target_objective_id;

      -- #831: same shape as the objective restore above, and for the same
      -- reason — `distinct on` ordered by `seq` takes what stood before the
      -- arrival, not what stood between two of its consequences. Rows with a
      -- null `previous_relationship` are the no-ops described in
      -- `perform_quest_consequence` and are skipped rather than restoring null
      -- over a live disposition.
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

      -- #836: restore only if the quest is still sitting where this event put
      -- it. A party that has since picked the sequel up has moved it to
      -- `active`, and stepping back an earlier arrival must not yank a live
      -- quest back into hiding — the undo stack reverses what it did, not what
      -- the party did afterwards.
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
        and q.status = 'rumor';

      -- Reverse what reached the world, by handle. A calendar event is a
      -- DM-only artefact; a system broadcast is deleted so it vanishes from the
      -- players' chat, and the handle plus `undone_at` remain as the record
      -- that it was said and retracted.
      delete from public.calendar_events
       where id in (select ev.calendar_event_id from public.quest_consequence_events ev
                     where ev.transition_id = v_undo_transition_id and ev.calendar_event_id is not null);
      delete from public.campaign_messages
       where id in (select ev.message_id from public.quest_consequence_events ev
                     where ev.transition_id = v_undo_transition_id and ev.message_id is not null);

      -- Append the opposite rather than erasing the record (#787). An
      -- un-performed delayed consequence is cancelled by this alone.
      update public.quest_consequence_events
         set undone_at = now()
       where transition_id = v_undo_transition_id and undone_at is null;
    end if;
  elsif p_command in ('start', 'advance', 'jump', 'return', 'improv') then
    -- One engine, one call. What was an inline loop over
    -- `quest_objective_effects` now runs through
    -- `private.apply_quest_consequences`, which also sees objective-became
    -- rules and the ledger settling — conditions that loop could not express,
    -- and which `quest_triggers` could not reach from here at all (#794).
    perform private.apply_quest_consequences(
      p_campaign_id, p_quest_id, v_transition_id, v_to_beat_id,
      case when p_command = 'advance' then p_edge_id end
    );
  end if;

  return public.get_quest_runtime_context(p_campaign_id, p_quest_id);
end;
$function$
