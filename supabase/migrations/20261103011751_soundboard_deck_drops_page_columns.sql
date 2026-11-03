-- The deck (#1136) replaced the board's page membership and drag order: a
-- sound or playlist is on a page because a pad (soundboard_pads, laid out from
-- these columns by 20261103001544) puts it there, and the pad's lane and row
-- are its order. These columns had no reader left, so they go rather than
-- linger as a second, silently drifting answer to "what is on this page".
--
-- sounds.page_id and soundboard_playlists.page_id carried the shared
-- same-campaign trigger for that one reference; with the column gone the
-- trigger has nothing to check. reorder_sounds wrote sounds.sort_order and
-- nothing else.

drop trigger if exists zz_same_campaign_refs on public.sounds;
drop trigger if exists zz_same_campaign_refs on public.soundboard_playlists;

drop function if exists public.reorder_sounds(uuid[], integer[]);

alter table public.sounds drop column page_id, drop column sort_order;
alter table public.soundboard_playlists drop column page_id;

-- finalize_music_generation_job wrote both dropped columns and echoed page_id
-- back to the client. Restated whole (its definition from 20260730000002)
-- without them; a generated song now lands in the library, and the DM puts it
-- on the deck. A job queued before #1136 shipped may still carry page_id
-- (ignored now) or the retired `misc` category, which the sounds CHECK would
-- refuse, so an unknown category settles as effects rather than failing a
-- song the DM already paid for.
create or replace function public.finalize_music_generation_job(p_job_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_job public.ai_generation_jobs%rowtype;
  v_request jsonb;
  v_category text;
begin
  select * into v_job from public.ai_generation_jobs where id = p_job_id for update;
  if not found then
    raise exception 'AI generation job not found';
  end if;
  if v_job.status = 'ready' then
    return;
  end if;
  if v_job.generator_type <> 'music' or v_job.status <> 'settling' then
    raise exception 'AI generation job is not a settling music job';
  end if;
  if v_job.artifact_storage_path is null then
    raise exception 'Music job has no persisted storage path';
  end if;

  v_request := v_job.request_json;
  v_category := case
    when v_request->>'category' in ('music', 'ambient', 'effects') then v_request->>'category'
    else 'effects'
  end;
  insert into public.sounds (
    id, user_id, campaign_id, name, category, source_type, file_url,
    storage_path, tags, attribution, attribution_url,
    artist, thumbnail_url
  ) values (
    v_job.id,
    v_job.user_id,
    v_job.campaign_id,
    v_request->>'name',
    v_category,
    'upload',
    coalesce(v_job.artifact_url, ''),
    v_job.artifact_storage_path,
    '{}'::text[], null, null, 'Grimoire AI', null
  ) on conflict (id) do update set
    file_url = excluded.file_url,
    storage_path = excluded.storage_path,
    updated_at = now();

  perform public.settle_ai_generation_job(
    v_job.id,
    jsonb_build_object(
      'campaign_id', v_job.campaign_id,
      'name', v_request->>'name',
      'category', v_category,
      'source_type', 'upload',
      'artist', 'Grimoire AI',
      'sound_id', v_job.id
    )
  );
end;
$function$;

revoke all on function public.finalize_music_generation_job(uuid) from public, anon, authenticated;
grant execute on function public.finalize_music_generation_job(uuid) to service_role;
