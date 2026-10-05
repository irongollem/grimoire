-- Beats moved on the story-flow canvas are saved in one statement (#972,
-- story 13).
--
-- The designer saved a drag with one PATCH per beat, each followed by four
-- cache invalidations, so dragging a selection of N beats cost N requests and
-- 4N refetch triggers. PostgREST cannot express "update these rows to these
-- values": a bulk upsert plans an INSERT first and fails on the NOT NULL
-- columns a position does not carry. Hence a function.
--
-- SECURITY INVOKER: `quest_beats_dm_all` already decides who may move a beat.
-- The explicit DM check turns a non-DM's call into a refusal instead of a
-- silent "0 rows", which the client would read as saved. Rows are matched on
-- the quest as well as the id, so a position list cannot reach another quest.
-- `updated_at` is still bumped by its trigger (as each PATCH did), and the
-- statement-level doorbell now rings once per save instead of once per beat.

create function public.set_quest_beat_positions(p_quest_id uuid, p_positions jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_campaign uuid;
  v_moved integer;
begin
  select q.campaign_id into v_campaign from public.quests q where q.id = p_quest_id;
  if auth.uid() is null or v_campaign is null or not coalesce(private.is_campaign_dm(v_campaign), false) then
    raise exception 'Not authorized';
  end if;

  update public.quest_beats b
     set canvas_x = v.x, canvas_y = v.y
    from jsonb_to_recordset(p_positions) as v(id uuid, x double precision, y double precision)
   where b.id = v.id and b.quest_id = p_quest_id;
  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;

revoke execute on function public.set_quest_beat_positions(uuid, jsonb) from public, anon;
grant execute on function public.set_quest_beat_positions(uuid, jsonb) to authenticated, service_role;
