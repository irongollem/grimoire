-- A route is chosen by the ledger, not described in free text. Story #795.
--
-- `quest_beat_edges.label` was DM-only free text, and part of the route's
-- unique key. #795's line says it "becomes which objectives this route resolved
-- and how" — but #794 already built that half (`quest_consequences.on_edge_id`),
-- and the labels in production are not outcomes at all. All five of them:
--
--   1-5 on a d6 · 6 on a d6 · Agree
--   Encounter Sephek on the road · Threaten or otherwise fight the whole group
--
-- Those say how the fork gets *decided at the table* — a die, a choice, an
-- event. So the ticket named one fact and the column held another.
--
-- ── The 39 empty labels are the stronger evidence ───────────────────────────
--
-- Of 44 edges only 5 carry a label, across 13 real forks. Look at what the
-- unlabelled forks do instead: "Encounter Ravishin" branches to *Killed
-- Ravishin* and *Came to terms with Ravishin*; "Zhentarim thieves" to *Allow
-- the theft* and *Prevent theft*. The DM put the branch's identity in the
-- TARGET BEAT'S TITLE — which is the model's own sentence. A beat is what
-- happened, and a fork is the set of beats that could follow. The edge needed
-- no text because the beat is the outcome.
--
-- The label was only ever reached for when the fork turns on something the
-- graph cannot see, and even then it is one instruction split across two edges:
-- "1-5 on a d6" and "6 on a d6" are the sentence "roll a d6". That sentence
-- belongs to the beat the DM is standing on, and `quest_beats.outcomes` already
-- exists for it, is already rendered directly above the branch cards
-- (`QuestRunBeatCard.vue`), and is already edited in one place.
--
-- So the column goes entirely rather than surviving beside the gate below. Its
-- own input placeholder reads "DM-only route condition…", which is an
-- invitation to keep writing conditions no machine can read — leaving the box
-- there guarantees the gate stays empty and the graph never shows which way the
-- story can go, which is precisely what this story exists to prevent.
--
-- ── What replaces it ────────────────────────────────────────────────────────
--
-- One optional gate per edge: this route is open while an objective stands in a
-- given status. Not a rules engine — a nullable predicate, read-time, no state,
-- no cascade. Said plainly: ZERO of the 13 production forks would use it today;
-- every one is decided at the table. It is the model's deliverable ("the ledger
-- decides") and #797's stated dependency, not something the data asked for.
--
-- What the route *does* is already `quest_consequences.on_edge_id` from #794.
-- Storing an outcome on the edge as well would be two homes for one fact.

-- ── 1. Preconditions ────────────────────────────────────────────────────────

do $$
declare v_parallel integer; v_busy integer;
begin
  select count(*) into v_parallel from (
    select quest_id, source_beat_id, target_beat_id
      from public.quest_beat_edges group by 1, 2, 3 having count(*) > 1
  ) p;
  if v_parallel > 0 then
    raise exception '% parallel route(s) share a (quest, source, target); the new key cannot be added', v_parallel;
  end if;

  -- The carry below writes `outcomes`; refuse to overwrite prose already there.
  select count(*) into v_busy
    from public.quest_beat_edges e
    join public.quest_beats b on b.id = e.source_beat_id
   where coalesce(btrim(e.label), '') <> '' and coalesce(btrim(b.outcomes), '') <> '';
  if v_busy > 0 then
    raise exception '% labelled route(s) have a source beat whose outcomes are already written; resolve by hand', v_busy;
  end if;
end $$;

-- ── 2. Carry the labels to the beat that owns the decision ──────────────────
--
-- One paragraph per labelled route, on the source beat, as the Tiptap document
-- shape `QuestBeatFields` writes. Three beats, five lines.

update public.quest_beats b
   set outcomes = (
     select jsonb_build_object(
       'type', 'doc',
       'content', jsonb_agg(
         jsonb_build_object(
           'type', 'paragraph',
           'content', jsonb_build_array(jsonb_build_object(
             'type', 'text',
             'text', '→ ' || t.title || ': ' || btrim(e.label)
           ))
         ) order by e.created_at
       )
     )::text
     from public.quest_beat_edges e
     join public.quest_beats t on t.id = e.target_beat_id
    where e.source_beat_id = b.id and coalesce(btrim(e.label), '') <> ''
   )
 where exists (
   select 1 from public.quest_beat_edges e
    where e.source_beat_id = b.id and coalesce(btrim(e.label), '') <> ''
 );

do $$
declare v_carried integer; v_labels integer;
begin
  select count(*) into v_labels from public.quest_beat_edges where coalesce(btrim(label), '') <> '';
  select count(*) into v_carried from public.quest_beats b
   where b.outcomes like '%→%'
     and exists (select 1 from public.quest_beat_edges e
                  where e.source_beat_id = b.id and coalesce(btrim(e.label), '') <> '');
  raise notice 'carried % route condition(s) onto % source beat(s)', v_labels, v_carried;
end $$;

-- ── 3. The key, and the column ──────────────────────────────────────────────
--
-- Parallel routes are not legitimate under the model: "A → B, killed him" and
-- "A → B, spared him" are two different things that happened — two beats that
-- converge afterwards, which is what the data already does. One route per pair.

alter table public.quest_beat_edges drop constraint if exists quest_beat_edges_route_key;
alter table public.quest_beat_edges
  add constraint quest_beat_edges_route_key unique (quest_id, source_beat_id, target_beat_id);

-- Mirrors `quest_beats`' composite key so the gate's FK pins the same quest and
-- campaign by construction, as #794's consequences do.
alter table public.quest_beat_edges
  add constraint quest_beat_edges_id_quest_campaign_key unique (id, quest_id, campaign_id);

alter table public.quest_beat_edges drop column label;

-- ── 4. The gate ─────────────────────────────────────────────────────────────
--
-- A child table rather than two columns on the edge, and the reason is deletion:
-- removing an objective must drop the gate and KEEP the route. `on delete set
-- null` can only null the FK column, leaving `status` dangling against a
-- both-or-neither check — so columns would need a trigger to do what a child
-- row's cascade does for free.

create table public.quest_beat_edge_gates (
  edge_id uuid primary key,
  quest_id uuid not null,
  campaign_id uuid not null,
  objective_id uuid not null,
  -- The same set `quest_consequences.on_objective_status` uses. `dormant` is
  -- excluded for the same reason: a route gated on an objective the party has
  -- never been given is a route that silently never opens.
  status text not null check (status in ('pending', 'complete', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (edge_id, quest_id, campaign_id)
    references public.quest_beat_edges(id, quest_id, campaign_id) on delete cascade,
  foreign key (objective_id, quest_id)
    references public.quest_objectives(id, quest_id) on delete cascade
);

comment on table public.quest_beat_edge_gates is
  'This route is open while its objective stands in the given status. One '
  'optional gate per route; absent means always open. Replaces the free-text '
  'route label, which described how a fork was decided at the table rather '
  'than anything the ledger could check (#795).';

create index quest_beat_edge_gates_objective_idx on public.quest_beat_edge_gates (objective_id);

create trigger quest_beat_edge_gates_updated_at
  before update on public.quest_beat_edge_gates
  for each row execute procedure update_updated_at();

alter table public.quest_beat_edge_gates enable row level security;

create policy "quest_beat_edge_gates_all" on public.quest_beat_edge_gates for all
  using (coalesce(private.is_campaign_dm(campaign_id), false))
  with check (coalesce(private.is_campaign_dm(campaign_id), false));

-- ── 5. The functions that spoke label ────────────────────────────────────────
--
-- The two whose SIGNATURE changes are dropped first. `create or replace` with
-- a different argument list creates an OVERLOAD and leaves the old one
-- callable — the trap that produced unrunnable SQL earlier in this epic.

drop function if exists public.create_quest_beat_with_route(uuid, text, text, double precision, double precision, uuid, text);
CREATE OR REPLACE FUNCTION public.create_quest_beat_with_route(p_quest_id uuid, p_title text, p_kind text DEFAULT 'neutral'::text, p_canvas_x double precision DEFAULT 0, p_canvas_y double precision DEFAULT 0, p_source_beat_id uuid DEFAULT NULL::uuid)
 RETURNS quest_beats
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_campaign_id uuid;
  v_beat public.quest_beats;
begin
  select campaign_id into v_campaign_id
  from public.quests
  where id = p_quest_id;

  if v_campaign_id is null then
    raise exception 'Quest not found or not editable' using errcode = 'P0002';
  end if;

  insert into public.quest_beats (
    quest_id, campaign_id, title, kind, visibility, canvas_x, canvas_y
  ) values (
    p_quest_id, v_campaign_id, btrim(p_title), coalesce(nullif(btrim(p_kind), ''), 'neutral'),
    'hidden', p_canvas_x, p_canvas_y
  ) returning * into v_beat;

  if p_source_beat_id is not null then
    insert into public.quest_beat_edges (
      quest_id, campaign_id, source_beat_id, target_beat_id
    ) values (
      p_quest_id, v_campaign_id, p_source_beat_id, v_beat.id
    );
  end if;

  return v_beat;
end;
$function$;
revoke execute on function public.create_quest_beat_with_route(uuid, text, text, double precision, double precision, uuid) from public, anon;
grant execute on function public.create_quest_beat_with_route(uuid, text, text, double precision, double precision, uuid) to authenticated, service_role;

drop function if exists public.improvise_quest_runtime(uuid, uuid, bigint, text, text, text, text, text, boolean, boolean, text);
CREATE OR REPLACE FUNCTION public.improvise_quest_runtime(p_campaign_id uuid, p_quest_id uuid, p_expected_version bigint, p_title text, p_kind text DEFAULT 'neutral'::text, p_dm_lead text DEFAULT NULL::text, p_reveal_text text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_push_return boolean DEFAULT true, p_keep_edge boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_state public.quest_runtime_state;
  v_source public.quest_beats;
  v_created public.quest_beats;
  v_context jsonb;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;
  if nullif(btrim(p_title), '') is null then raise exception 'An improv title is required'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'An improv reason is required'; end if;

  select * into v_state
  from public.quest_runtime_state
  where campaign_id = p_campaign_id and quest_id = p_quest_id;
  if not found or v_state.current_beat_id is null or v_state.status <> 'running' then
    raise exception 'A running beat is required to improvise';
  end if;
  if v_state.version <> p_expected_version then
    raise exception 'Quest runtime changed; expected version %, current version %', p_expected_version, v_state.version
      using errcode = '40001';
  end if;
  select * into strict v_source from public.quest_beats where id = v_state.current_beat_id;

  insert into public.quest_beats (
    quest_id, campaign_id, title, kind, visibility, dm_content, reveal_text,
    presentation_hint, canvas_x, canvas_y, is_improvised
  ) values (
    v_source.quest_id, p_campaign_id, btrim(p_title), coalesce(nullif(btrim(p_kind), ''), 'neutral'),
    'hidden', nullif(p_dm_lead, ''), nullif(p_reveal_text, ''), 'Improvised at the table',
    v_source.canvas_x + 320, v_source.canvas_y + 160, true
  ) returning * into v_created;

  if p_keep_edge then
    insert into public.quest_beat_edges (
      quest_id, campaign_id, source_beat_id, target_beat_id
    ) values (
      v_source.quest_id, p_campaign_id, v_source.id, v_created.id
    );
  end if;

  v_context := public.transition_quest_runtime(
    p_campaign_id => p_campaign_id,
    p_quest_id => p_quest_id,
    p_command => 'improv',
    p_expected_version => p_expected_version,
    p_target_beat_id => v_created.id,
    p_reason => p_reason,
    p_push_return => p_push_return,
    p_provenance => jsonb_build_object('surface', 'quest-run-improv', 'kept_edge', p_keep_edge)
  );

  return jsonb_build_object('context', v_context, 'beat', to_jsonb(v_created));
end;
$function$;
-- `DROP FUNCTION` discards the comment along with the ACL. The grants are
-- re-issued above; this is the other thing the drop took.
comment on function public.improvise_quest_runtime(uuid, uuid, bigint, text, text, text, text, text, boolean, boolean) is
  'Atomically creates a hidden improvised beat in one quest, optionally keeps an authored edge, and enters it in runtime history.';

revoke execute on function public.improvise_quest_runtime(uuid, uuid, bigint, text, text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.improvise_quest_runtime(uuid, uuid, bigint, text, text, text, text, text, boolean, boolean) to authenticated, service_role;

-- Signatures unchanged, so these replace in place.

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

CREATE OR REPLACE FUNCTION public.get_quest_runtime_context(p_campaign_id uuid, p_quest_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_state public.quest_runtime_state;
  v_previous jsonb;
  v_return jsonb;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  select * into v_state
  from public.quest_runtime_state
  where campaign_id = p_campaign_id and quest_id = p_quest_id;

  if not found then
    return jsonb_build_object(
      'state', null,
      'current', null,
      'previous', null,
      'outgoing', '[]'::jsonb,
      'return_target', null,
      'path_so_far', '[]'::jsonb
    );
  end if;

  if v_state.visit_index > 0 then
    v_previous := v_state.visit_stack -> (v_state.visit_index - 1);
  end if;
  if jsonb_array_length(v_state.return_stack) > 0 then
    v_return := v_state.return_stack -> (jsonb_array_length(v_state.return_stack) - 1);
  end if;

  return jsonb_build_object(
    'state', to_jsonb(v_state),
    'current', (
      select to_jsonb(b) from public.quest_beats b
      where b.id = v_state.current_beat_id and b.quest_id = p_quest_id
    ),
    'previous', v_previous,
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'edge_id', e.id,
        'quest_id', e.quest_id,
        'beat_id', b.id,
        'beat_title', b.title,
        'beat_kind', b.kind,
        -- The route's condition, so the cockpit can grey a closed branch and
        -- say why rather than leaving the DM to remember (#795).
        'gate', (
          select jsonb_build_object(
            'objective_id', g.objective_id,
            'objective', o.description,
            'required_status', g.status,
            'current_status', o.status,
            'is_open', o.status = g.status
          )
          from public.quest_beat_edge_gates g
          join public.quest_objectives o on o.id = g.objective_id
          where g.edge_id = e.id
        ),
        -- What taking it does, read from the table that owns that fact rather
        -- than stored a second time on the edge (#794).
        'effects', coalesce((
          select jsonb_agg(jsonb_build_object(
            'action', qc.action,
            'objective', tobj.description,
            'after_days', qc.after_days
          ) order by qc.created_at)
          from public.quest_consequences qc
          left join public.quest_objectives tobj on tobj.id = qc.target_objective_id
          where qc.on_edge_id = e.id
        ), '[]'::jsonb)
      ) order by e.created_at)
      from public.quest_beat_edges e
      join public.quest_beats b on b.id = e.target_beat_id
      where e.source_beat_id = v_state.current_beat_id
    ), '[]'::jsonb),
    'return_target', v_return,
    -- The cockpit polls every five seconds. Keep the recent path bounded while
    -- the full audit remains in quest_beat_transitions. Historical rows can be
    -- cross-quest jumps, so match either end rather than only the destination.
    'path_so_far', coalesce((
      select jsonb_agg(recent.entry order by recent.created_at, recent.id)
      from (
        select t.id, t.created_at, jsonb_build_object(
          'id', t.id,
          'kind', t.transition_kind,
          'from_quest_id', t.from_quest_id,
          'from_beat_id', t.from_beat_id,
          'from_quest_title', t.from_quest_title,
          'from_beat_title', t.from_beat_title,
          'to_quest_id', t.to_quest_id,
          'to_beat_id', t.to_beat_id,
          'to_quest_title', t.to_quest_title,
          'to_beat_title', t.to_beat_title,
          'reason', t.reason,
          'runtime_version', t.runtime_version,
          'provenance', t.provenance,
          'created_at', t.created_at
        ) entry
        from public.quest_beat_transitions t
        where t.campaign_id = p_campaign_id
          and (t.to_quest_id = p_quest_id or t.from_quest_id = p_quest_id)
        order by t.created_at desc, t.id desc
        limit 100
      ) recent
    ), '[]'::jsonb)
  );
end;
$function$;
