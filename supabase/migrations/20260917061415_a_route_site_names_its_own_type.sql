-- Migration: a_route_site_names_its_own_type
-- `get_quest_runtime_context`'s route site gains `location_type`.
--
-- WHY: #887, the tail of #886. A route card in the Advance dialog reads
-- "site · 3 rooms" for a wood, because `QuestRouteSite` carries
-- `location_id`, `name` and `room_count` and nothing else — so the client has
-- the right *count* (this function was rewritten by `20260916001210` to count
-- `private.location_is_interior`, which includes `grounds`) and no way to know
-- the right *word* for it.
--
-- Every other surface that names a site's parts can ask the location row it
-- already holds. This one cannot: the Advance dialog never loads locations,
-- it renders what the runtime RPC hands it. Widening the payload is the only
-- honest fix — the alternative is the dialog fetching a location to choose a
-- noun, which is a query for a word.
--
-- Additive and nothing else. One key on a jsonb object the function already
-- builds, reproduced verbatim from its live definition with no other change:
-- an existing client ignoring the key behaves exactly as before, and
-- `QuestRouteSite.location_type` is optional on the TS side for the same
-- reason. No signature change, no new function, no grant change.
--
-- Advisor: unmoved at 107. `create or replace` over an existing SECURITY
-- DEFINER function preserves its grants and properties; verified after
-- applying that it is still definer, still `search_path = public, private`,
-- and still not executable by `anon`.

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
    'target_quest_id', ev.target_quest_id, 'action_payload', ev.action_payload,
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
        'action_payload', qc.action_payload, 'after_days', qc.after_days,
        'on_edge', qc.on_edge_id is not null
      ) order by qc.created_at)
      from public.quest_consequences qc
      left join public.quest_objectives tobj on tobj.id = qc.target_objective_id
      left join public.npcs tnpc on tnpc.id = qc.target_npc_id
      left join public.quests tquest on tquest.id = qc.target_quest_id
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
$function$

;
