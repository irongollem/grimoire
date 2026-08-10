drop function public.archive_quest_beat(uuid);

create function public.archive_quest_beat(
  p_beat_id uuid,
  p_expected_runtime_version bigint default null,
  p_replacement_beat_id uuid default null,
  p_end_runtime boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_beat public.quest_beats;
  v_replacement public.quest_beats;
  v_state public.quest_runtime_state;
begin
  select * into v_beat
  from public.quest_beats
  where id = p_beat_id;

  if not found then
    raise exception 'Beat not found or not editable' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not coalesce(private.is_campaign_dm(v_beat.campaign_id), false) then
    raise exception 'Beat not found or not editable' using errcode = 'P0002';
  end if;

  select * into v_state
  from public.quest_runtime_state
  where campaign_id = v_beat.campaign_id
  for update;

  if p_expected_runtime_version is not null
     and (not found or v_state.version <> p_expected_runtime_version) then
    raise exception 'Quest runtime changed; reload before removing this beat' using errcode = '40001';
  end if;

  if v_state.current_beat_id = p_beat_id then
    if p_expected_runtime_version is null then
      raise exception 'Current beat removal requires its runtime version' using errcode = '22023';
    end if;
    if p_end_runtime and p_replacement_beat_id is not null then
      raise exception 'Choose either a replacement beat or end the runtime' using errcode = '22023';
    elsif p_end_runtime then
      perform public.transition_quest_runtime(
        p_campaign_id => v_beat.campaign_id,
        p_command => 'end',
        p_expected_version => p_expected_runtime_version
      );
    elsif p_replacement_beat_id is not null then
      select * into v_replacement
      from public.quest_beats
      where id = p_replacement_beat_id
        and campaign_id = v_beat.campaign_id
        and kind <> 'archived';
      if not found or v_replacement.id = p_beat_id then
        raise exception 'Replacement beat not found or not usable' using errcode = '22023';
      end if;
      perform public.transition_quest_runtime(
        p_campaign_id => v_beat.campaign_id,
        p_command => 'jump',
        p_expected_version => p_expected_runtime_version,
        p_target_quest_id => v_replacement.quest_id,
        p_target_beat_id => v_replacement.id,
        p_reason => 'Current beat removed from authored flow'
      );
    else
      raise exception 'Choose a replacement beat or end the runtime' using errcode = '22023';
    end if;
  elsif p_replacement_beat_id is not null or p_end_runtime then
    raise exception 'The beat is no longer current; reload before removing it' using errcode = '40001';
  end if;

  delete from public.quest_beat_attachments where beat_id = p_beat_id;
  delete from public.quest_beat_edges where source_beat_id = p_beat_id or target_beat_id = p_beat_id;
  update public.quest_beats set kind = 'archived', visibility = 'hidden' where id = p_beat_id;
end;
$$;

revoke all on function public.archive_quest_beat(uuid, bigint, uuid, boolean) from public;
revoke execute on function public.archive_quest_beat(uuid, bigint, uuid, boolean) from anon;
grant execute on function public.archive_quest_beat(uuid, bigint, uuid, boolean) to authenticated;
