create function public.create_quest_beat_with_route(
  p_quest_id uuid,
  p_title text,
  p_kind text default 'neutral',
  p_canvas_x double precision default 0,
  p_canvas_y double precision default 0,
  p_source_beat_id uuid default null,
  p_edge_label text default ''
)
returns public.quest_beats
language plpgsql
security invoker
set search_path = public, private
as $$
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
      quest_id, campaign_id, source_beat_id, target_beat_id, label
    ) values (
      p_quest_id, v_campaign_id, p_source_beat_id, v_beat.id, coalesce(btrim(p_edge_label), '')
    );
  end if;

  return v_beat;
end;
$$;

revoke all on function public.create_quest_beat_with_route(uuid, text, text, double precision, double precision, uuid, text) from public;
revoke execute on function public.create_quest_beat_with_route(uuid, text, text, double precision, double precision, uuid, text) from anon;
grant execute on function public.create_quest_beat_with_route(uuid, text, text, double precision, double precision, uuid, text) to authenticated;
