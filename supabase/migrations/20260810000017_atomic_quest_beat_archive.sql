-- Beat removal is one transaction. The former client sequence could commit
-- attachment deletion before an edge/archive failure, silently losing prep.
create function public.archive_quest_beat(p_beat_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  perform 1
  from public.quest_beats
  where id = p_beat_id
  for update;

  if not found then
    raise exception 'Beat not found or not editable'
      using errcode = 'P0002';
  end if;

  delete from public.quest_beat_attachments
  where beat_id = p_beat_id;

  delete from public.quest_beat_edges
  where source_beat_id = p_beat_id or target_beat_id = p_beat_id;

  update public.quest_beats
  set kind = 'archived', visibility = 'hidden'
  where id = p_beat_id;

  if not found then
    raise exception 'Beat could not be archived'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.archive_quest_beat(uuid) from public;
revoke execute on function public.archive_quest_beat(uuid) from anon;
grant execute on function public.archive_quest_beat(uuid) to authenticated;
