-- One consequence mechanism. Story #794, epic #780.
--
-- `quest_triggers` fired FROM an objective; `quest_objective_effects` fired TO
-- one. Two tables, two panels, two ends of a single idea with no shared
-- vocabulary — and they never composed: `20260818212305` claimed "reaching a
-- beat completes an objective, which fires its trigger", but the scheduler was
-- only ever called from three Vue components and `transition_quest_runtime`
-- never read `quest_triggers` at all. An objective completed by a beat fired
-- nothing. One rule engine with one half in plpgsql and the other in a
-- composable.
--
-- A rule is (condition, delay, action). Effects filled
-- {arrive at beat, take edge} × 0 days × {ledger verb}; triggers filled
-- {objective became complete, quest settled} × N days × {calendar, broadcast}.
-- The empty cells of that product are things a DM actually wants and nothing
-- could express: "three days after entering the crypt, 'reach the village
-- before the storm' fails" is a deadline; "when the party takes the high road,
-- put 'the cult notices' on the calendar five days out" is a branch with a
-- consequence. Both existing conditions are edge-triggered on a *becoming* —
-- the cursor becomes B, the edge becomes taken, the objective becomes complete,
-- the ledger becomes settled. Same sentence.
--
-- Renamed rather than extended: production has 0 `quest_objective_effects`
-- rows, and a table called `objective_effects` holding a broadcast is a
-- misnomer the next reader would dutifully "fix".

-- ── 1. Composite key, so a rule cannot cross quests by construction ─────────
--
-- `quest_objective_effects` had two independent FKs and no guarantee that its
-- objective belonged to its quest. The composite FKs below close that.

alter table public.quest_objectives
  add constraint quest_objectives_id_quest_id_key unique (id, quest_id);

-- ── 2. The rule table ───────────────────────────────────────────────────────

create table public.quest_consequences (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,

  -- Condition: exactly one family, enforced below.
  on_beat_id uuid references public.quest_beats(id) on delete cascade,
  on_edge_id uuid references public.quest_beat_edges(id) on delete cascade,
  on_objective_id uuid,
  on_objective_status text check (on_objective_status in ('pending', 'complete', 'failed')),
  on_quest_settled boolean not null default false,

  -- Delay, in in-world days.
  after_days integer not null default 0 check (after_days >= 0),

  -- Action.
  action text not null check (action in (
    'raise', 'reveal', 'complete', 'fail',          -- ledger verbs
    'create_calendar_event', 'send_broadcast'        -- world actions
  )),
  target_objective_id uuid,
  action_payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Exactly one condition family.
  constraint quest_consequences_one_condition check (
    num_nonnulls(on_beat_id, on_edge_id, on_objective_id) + on_quest_settled::int = 1
  ),
  -- A status is meaningless without the objective it describes, and vice versa.
  constraint quest_consequences_objective_status_paired check (
    (on_objective_status is null) = (on_objective_id is null)
  ),
  -- A ledger verb needs a target; a world action must not have one.
  constraint quest_consequences_target_matches_action check (
    (action in ('raise', 'reveal', 'complete', 'fail')) = (target_objective_id is not null)
  ),
  -- A rule that fires itself is a loop with one link. Written as "not (both set
  -- and equal)" rather than `is distinct from`, because `null is distinct from
  -- null` is FALSE — which would reject every world action, where both columns
  -- are null by definition.
  constraint quest_consequences_no_self_reference check (
    not (on_objective_id is not null and on_objective_id = target_objective_id)
  ),

  foreign key (on_objective_id, quest_id)
    references public.quest_objectives(id, quest_id) on delete cascade,
  foreign key (target_objective_id, quest_id)
    references public.quest_objectives(id, quest_id) on delete cascade
);

comment on table public.quest_consequences is
  'One rule: when this becomes that, do this. Replaces quest_objective_effects '
  '(event to state) and quest_triggers (state to world action), which were two '
  'ends of the same sentence and never composed (#794).';

comment on column public.quest_consequences.after_days is
  'In-world days between the condition firing and the action being performed. '
  'Zero performs inside the transition. The database cannot compute the due '
  'date itself — per-calendar leap and intercalary rules live only in '
  'src/lib/dayMath.ts, and a plpgsql port would be a fifth copy — so a delayed '
  'row is logged and the client places it. See private.perform_quest_consequence.';

create index quest_consequences_quest_idx on public.quest_consequences (quest_id);
create index quest_consequences_beat_idx on public.quest_consequences (on_beat_id) where on_beat_id is not null;
create index quest_consequences_edge_idx on public.quest_consequences (on_edge_id) where on_edge_id is not null;
create index quest_consequences_objective_idx on public.quest_consequences (on_objective_id) where on_objective_id is not null;
create index quest_consequences_settled_idx on public.quest_consequences (quest_id) where on_quest_settled;

-- Mirrors the partial uniques `quest_objective_effects` carried: the same rule
-- authored twice on the same condition is a duplicate, not two rules.
create unique index quest_consequences_beat_uniq
  on public.quest_consequences (on_beat_id, action, coalesce(target_objective_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where on_beat_id is not null;
create unique index quest_consequences_edge_uniq
  on public.quest_consequences (on_edge_id, action, coalesce(target_objective_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where on_edge_id is not null;

create trigger quest_consequences_updated_at
  before update on public.quest_consequences
  for each row execute procedure update_updated_at();

alter table public.quest_consequences enable row level security;

create policy "quest_consequences_select" on public.quest_consequences for select
  using (exists (select 1 from public.quests q where q.id = quest_id and q.user_id = auth.uid()));
create policy "quest_consequences_insert" on public.quest_consequences for insert
  with check (exists (select 1 from public.quests q where q.id = quest_id and q.user_id = auth.uid()));
create policy "quest_consequences_update" on public.quest_consequences for update
  using (exists (select 1 from public.quests q where q.id = quest_id and q.user_id = auth.uid()))
  with check (exists (select 1 from public.quests q where q.id = quest_id and q.user_id = auth.uid()));
create policy "quest_consequences_delete" on public.quest_consequences for delete
  using (exists (select 1 from public.quests q where q.id = quest_id and q.user_id = auth.uid()));

-- ── 3. Carry both mechanisms across ─────────────────────────────────────────

insert into public.quest_consequences (quest_id, on_beat_id, on_edge_id, action, target_objective_id)
select e.quest_id, e.trigger_beat_id, e.trigger_edge_id,
       case e.effect when 'complete' then 'complete' when 'fail' then 'fail' else e.effect end,
       e.objective_id
from public.quest_objective_effects e;

-- `objective_done` becomes "this objective became complete"; `quest_complete`
-- becomes the settled condition, which is the same sentence the ledger already
-- says. `offset_days` becomes `after_days` unchanged.
insert into public.quest_consequences (quest_id, on_objective_id, on_objective_status, on_quest_settled, after_days, action, action_payload)
select t.quest_id,
       case when t.trigger_type = 'objective_done' then t.objective_id end,
       case when t.trigger_type = 'objective_done' then 'complete' end,
       t.trigger_type = 'quest_complete',
       t.offset_days,
       t.action_type,
       t.action_payload
from public.quest_triggers t
-- An `objective_done` trigger with no objective has no condition at all; it
-- could never have fired. Production has none.
where t.trigger_type = 'quest_complete' or t.objective_id is not null;

do $$
declare v_new integer; v_old integer; v_orphan integer;
begin
  select count(*) into v_new from public.quest_consequences;
  select (select count(*) from public.quest_objective_effects)
       + (select count(*) from public.quest_triggers where trigger_type = 'quest_complete' or objective_id is not null)
    into v_old;
  select count(*) into v_orphan from public.quest_triggers
   where trigger_type = 'objective_done' and objective_id is null;
  if v_new <> v_old then
    raise exception 'consequence backfill lost rows: % new vs % old', v_new, v_old;
  end if;
  if v_orphan > 0 then
    raise notice 'dropped % objective_done trigger(s) with no objective — they had no condition and could never fire', v_orphan;
  end if;
  raise notice 'carried % consequence rows across', v_new;
end $$;

-- ── 4. One log, for rules and for the actions they perform ──────────────────
--
-- Replaces `quest_objective_effect_events` and `quest_trigger_scheduled` both:
-- "waiting for the event" and "waiting for the date" are one table, which
-- `questTriggers.ts`'s own header already argued.
--
-- Append-only. Undo sets `undone_at` rather than deleting, per #787 — undo is
-- appending the opposite, not erasing the record.

create table public.quest_consequence_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  transition_id uuid not null references public.quest_beat_transitions(id) on delete cascade,
  consequence_id uuid references public.quest_consequences(id) on delete set null,

  action text not null,
  target_objective_id uuid references public.quest_objectives(id) on delete set null,
  previous_status text,
  previous_is_player_visible boolean,

  -- Copied from the rule at fire time, not read back through
  -- `consequence_id`. Editing a rule must not rewrite a consequence already
  -- announced, and deleting one must not blank the record of what it did.
  action_payload jsonb not null default '{}'::jsonb,

  after_days integer not null default 0,
  fires_on_year integer,
  fires_on_month integer,
  fires_on_day integer,

  performed_at timestamptz,
  performed_on_year integer,
  performed_on_month integer,
  performed_on_day integer,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  message_id uuid references public.campaign_messages(id) on delete set null,

  undone_at timestamptz,

  -- Ordering has to be a sequence, not a timestamp: `created_at` defaults to
  -- transaction time, so two events in one transition tie and the tiebreak
  -- falls to a random uuid. That is the #787 bug, and the undo below depends on
  -- picking the *first* event per objective.
  seq bigint generated always as identity,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.quest_consequence_events is
  'Append-only record of every consequence that fired: what it was, what the '
  'objective looked like before, and the handle of anything it created in the '
  'world. Undo sets undone_at and reverses by handle (#794).';

create index quest_consequence_events_campaign_idx on public.quest_consequence_events (campaign_id, created_at desc);
create index quest_consequence_events_transition_idx on public.quest_consequence_events (transition_id);
create index quest_consequence_events_pending_idx on public.quest_consequence_events (campaign_id)
  where performed_at is null and undone_at is null;

create trigger quest_consequence_events_updated_at
  before update on public.quest_consequence_events
  for each row execute procedure update_updated_at();

alter table public.quest_consequence_events enable row level security;

-- DM-only, deliberately narrower than the table this replaces.
-- `quest_objective_effect_events` was readable by any campaign member, which
-- handed players objective ids, verbs, and previous visibility for objectives
-- they were never allowed to see. The player journal (#798) gets its own
-- projection rather than this table.
create policy "quest_consequence_events_select" on public.quest_consequence_events for select
  using (coalesce(private.is_campaign_dm(campaign_id), false));

-- Written only by the SECURITY DEFINER functions below.
revoke insert, update, delete on public.quest_consequence_events from authenticated;

do $$
declare v_unfired integer;
begin
  select count(*) into v_unfired from public.quest_trigger_scheduled where fired_at is null;
  if v_unfired > 0 then
    raise exception 'quest_trigger_scheduled holds % unfired row(s); they have no transition to hang on and cannot be carried', v_unfired;
  end if;
end $$;

-- ── 5. Asserting a status is a transition kind ──────────────────────────────

alter table public.quest_beat_transitions
  drop constraint if exists quest_beat_transitions_transition_kind_check;

alter table public.quest_beat_transitions
  add constraint quest_beat_transitions_transition_kind_check
  check (transition_kind in (
    'enter', 'forward', 'previous', 'jump', 'return', 'improv',
    'pause', 'resume', 'end',
    -- #794: the DM saying "this happened" without playing through it. Moves no
    -- cursor and bumps no version, but it changes the ledger, so it needs a
    -- transition to hang its consequence events on — and `previous` must skip
    -- these when unwinding, or stepping back undoes the assertion instead of
    -- the arrival.
    'assert'
  ));

-- Those two constraints read "a movement has a complete endpoint": a quest and
-- a beat, or neither. An assertion is not a movement — it names the quest whose
-- ledger changed and no beat at all, and the quest may legitimately have no
-- beats yet. So the pair rule keeps applying to every kind that moves a cursor,
-- and `assert` is admitted with a quest and a null beat.

alter table public.quest_beat_transitions
  drop constraint if exists quest_beat_transitions_from_complete;
alter table public.quest_beat_transitions
  add constraint quest_beat_transitions_from_complete check (
    (from_quest_id is null and from_beat_id is null)
    or (from_quest_id is not null and from_beat_id is not null)
    or (transition_kind = 'assert' and from_quest_id is not null and from_beat_id is null)
  );

alter table public.quest_beat_transitions
  drop constraint if exists quest_beat_transitions_to_complete;
alter table public.quest_beat_transitions
  add constraint quest_beat_transitions_to_complete check (
    (to_quest_id is null and to_beat_id is null)
    or (to_quest_id is not null and to_beat_id is not null)
    or (transition_kind = 'assert' and to_quest_id is not null and to_beat_id is null)
  );

-- ── 6. The engine ───────────────────────────────────────────────────────────

-- "Settled" is a level: nothing pending, and something non-dormant to have
-- settled. A quest with no objectives has no ledger, so it never settles — the
-- panel says so rather than the mechanism pretending otherwise. Dormant
-- objectives are ignored, which is exactly what makes a branching quest
-- completable (#792).
create or replace function private.quest_ledger_settled(p_quest_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
           select 1 from public.quest_objectives o
            where o.quest_id = p_quest_id and o.status <> 'dormant'
         )
     and not exists (
           select 1 from public.quest_objectives o
            where o.quest_id = p_quest_id and o.status = 'pending'
         );
$$;

-- Performs one already-logged consequence and stamps the event. Split from the
-- engine so the immediate path and the delayed path have one implementation
-- rather than two that drift.
create or replace function private.perform_quest_consequence(
  p_event_id uuid, p_year integer, p_month integer, p_day integer
) returns void
language plpgsql
security definer
set search_path = 'public', 'private'
as $$
declare
  v_ev  public.quest_consequence_events%rowtype;
  v_q   public.quests%rowtype;
  v_id  uuid;
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
  end if;

  update public.quest_consequence_events
     set performed_at = now(),
         performed_on_year = p_year, performed_on_month = p_month, performed_on_day = p_day
   where id = p_event_id;
end $$;

-- The engine. Called by the two functions that write the ledger — and there are
-- exactly two after this migration, which is what makes "settled" detectable at
-- all. A row trigger on `quest_objectives` was the alternative and is worse: it
-- fires on backup restores and on any migration touching `status`, has no
-- transition to hang undo on, and would perform world actions as an invisible
-- side effect.
create or replace function private.apply_quest_consequences(
  p_campaign_id uuid,
  p_quest_id uuid,
  p_transition_id uuid,
  p_beat_id uuid default null,
  p_edge_id uuid default null,
  p_changed_objective_ids uuid[] default '{}',
  p_settled_before boolean default null
) returns void
language plpgsql
security definer
set search_path = 'public', 'private'
as $$
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
        target_objective_id, previous_status, previous_is_player_visible,
        action_payload, after_days, fires_on_year, fires_on_month, fires_on_day
      ) values (
        p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
        v_rule.target_objective_id, v_prev_status, v_prev_visible,
        v_rule.action_payload, v_rule.after_days,
        v_today.current_year, v_today.current_month, v_today.current_day
      ) returning id into v_event_id;

      -- Immediate world actions perform now. Delayed ones wait for the client,
      -- which owns the calendar arithmetic — see the column comment.
      if v_rule.after_days = 0 and v_rule.action in ('create_calendar_event', 'send_broadcast') then
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
        target_objective_id, action_payload, after_days,
        fires_on_year, fires_on_month, fires_on_day
      ) values (
        p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
        v_rule.target_objective_id, v_rule.action_payload, v_rule.after_days,
        v_today.current_year, v_today.current_month, v_today.current_day
      ) returning id into v_event_id;

      if v_rule.after_days = 0 and v_rule.action in ('create_calendar_event', 'send_broadcast') then
        perform private.perform_quest_consequence(
          v_event_id, v_today.current_year, v_today.current_month, v_today.current_day
        );
      end if;
    end loop;
  end if;
end $$;

-- ── 7. The second writer, closed ────────────────────────────────────────────
--
-- `quest_objectives.status` had two writers: the runtime RPC, and a raw client
-- UPDATE through PostgREST (`useUpdateObjective`, the checklist click). While
-- the client can set a status directly, an `on_objective_status` condition can
-- never fire — the change happens where nothing is watching. One fact, one
-- writer, so the column-level grant takes `status` away from the client and the
-- RPC below becomes the only way to assert one.
--
-- Column-level grants are checked alongside RLS, so PostgREST returns 42501 on
-- an update naming `status` and the other columns keep working.

revoke update on public.quest_objectives from authenticated;
grant update (description, sort_order, is_player_visible)
  on public.quest_objectives to authenticated;

-- The DM saying "this already happened" without playing through it. Prep-time
-- ticking has to work with no cursor and no session, so this deliberately does
-- not require a runtime state or move one. #796 extends this same RPC rather
-- than building a second write path.
create or replace function public.assert_quest_objective_status(
  p_objective_id uuid,
  p_status text,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = 'public', 'private'
as $$
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
     set status = p_status,
         -- A dormant objective may not be player-visible (#792). Asserting
         -- dormant retracts it rather than raising a constraint at the DM.
         is_player_visible = case when p_status = 'dormant' then false else is_player_visible end
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
end $$;

revoke execute on function public.assert_quest_objective_status(uuid, text, text) from public, anon;
grant execute on function public.assert_quest_objective_status(uuid, text, text) to authenticated, service_role;

-- The client is the calendar oracle: per-calendar leap and intercalary rules
-- live only in `src/lib/dayMath.ts`, and a plpgsql port would be a fifth copy
-- of maths #766 collapsed from four. So the client decides a delayed
-- consequence is due and names the in-world date; the database performs it.
create or replace function public.perform_quest_consequence(
  p_event_id uuid, p_year integer, p_month integer, p_day integer
) returns void
language plpgsql
security definer
set search_path = 'public', 'private'
as $$
declare v_campaign uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select campaign_id into v_campaign from public.quest_consequence_events where id = p_event_id;
  if v_campaign is null or not coalesce(private.is_campaign_dm(v_campaign), false) then
    raise exception 'Not authorized';
  end if;
  perform private.perform_quest_consequence(p_event_id, p_year, p_month, p_day);
end $$;

revoke execute on function public.perform_quest_consequence(uuid, integer, integer, integer) from public, anon;
grant execute on function public.perform_quest_consequence(uuid, integer, integer, integer) to authenticated, service_role;

-- ── 8. The runtime runs the engine ──────────────────────────────────────────
--
-- Rebuilt from the LIVE definition (`pg_get_functiondef`) — #792's body, with
-- the `raise` arm — not from any migration that wrote it. Two changes: the
-- inline effect loop becomes one call to the engine, and undo reverses by
-- handle and marks `undone_at` instead of deleting its own audit trail.

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
  v_edge_label text;
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
    select e.target_beat_id, e.label
      into v_to_beat_id, v_edge_label
    from public.quest_beat_edges e
    where e.id = p_edge_id
      and e.campaign_id = p_campaign_id
      and e.quest_id = p_quest_id
      and e.source_beat_id = v_from_beat_id;
    if not found then raise exception 'That edge is not an outgoing choice'; end if;
    v_kind := 'forward';
    v_provenance := v_provenance || jsonb_build_object('edge_id', p_edge_id, 'edge_label', v_edge_label);
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
$function$;

-- ── 9. Ownership transfer forgets the dead tables ───────────────────────────
--
-- Rebuilt from the live body of the **three-argument** overload, minus the two
-- trigger-table re-stamps. There are two overloads of this function, and
-- `pg_get_functiondef` on the *name* returns both concatenated with no
-- separator — unrunnable SQL that fails with "syntax error at or near CREATE".
-- Address it by oid or signature. The five-argument overload never touched
-- these tables and is left alone.
--
-- Nothing replaces the removed lines: neither `quest_consequences` nor
-- `quest_consequence_events` carries a `user_id`, so there is nothing to re-own.

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
$function$;

-- ── 10. The old mechanisms ──────────────────────────────────────────────────
--
-- Dropped in dependency order. `quest_objective_effect_events` first: it
-- references effects, and nothing references it now that the runtime is
-- rebuilt. Fired `quest_trigger_scheduled` rows are dropped as history of a
-- dead mechanism — the calendar events they produced keep their
-- `linked_quest_id` and survive on their own.

drop table if exists public.quest_objective_effect_events;
drop table if exists public.quest_objective_effects;
drop table if exists public.quest_trigger_scheduled;
drop table if exists public.quest_triggers;

-- ── 11. The dashboard widget's id moved with it ─────────────────────────────
--
-- One production layout names the widget `quest-triggers`. The catalogue entry
-- becomes `quest-consequences`, so rewrite the stored layout rather than
-- relying on the reader to drop an id it no longer knows — a silently
-- disappearing widget reads as data loss to whoever arranged that dashboard.

update public.dashboard_layouts
   set layout = replace(layout::text, '"quest-triggers"', '"quest-consequences"')::jsonb
 where layout::text like '%"quest-triggers"%';
