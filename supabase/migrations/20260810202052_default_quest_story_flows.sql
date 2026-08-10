-- Story flow is now the primary quest model. The campaign has only a small
-- existing quest set, so migrate it once instead of keeping two creation and
-- navigation experiences indefinitely. Existing quest-level records remain
-- authoritative; only graph projections are added and no route order is
-- inferred.

create function private.backfill_quest_story_flows(p_only_disabled boolean default false)
returns void
language plpgsql
set search_path = public, private
as $$
begin
  insert into public.quest_beats (
    quest_id, campaign_id, title, dm_content, kind, visibility,
    canvas_x, canvas_y, conversion_source_type, conversion_source_id
  )
  select q.id, q.campaign_id, q.title || ' — overview',
    coalesce(nullif(btrim(q.summary), ''), q.description),
    'discovery', 'hidden', 0, 0, 'legacy_overview', q.id::text
  from public.quests q
  where (not p_only_disabled or q.flow_enabled_at is null)
    and q.campaign_id is not null
    and coalesce(nullif(btrim(q.summary), ''), nullif(btrim(q.description), '')) is not null
  on conflict do nothing;

  with staged as (
    select q.id quest_id, q.campaign_id, r.id ref_row_id,
      coalesce(e.name, 'Encounter') title,
      row_number() over (partition by q.id order by r.id) - 1 stage_index
    from public.quests q
    join public.quest_refs r on r.quest_id = q.id and r.ref_type = 'encounter'
    left join public.encounters e
      on e.id::text = r.ref_id and e.campaign_id = q.campaign_id
    where (not p_only_disabled or q.flow_enabled_at is null)
      and q.campaign_id is not null
  )
  insert into public.quest_beats (
    quest_id, campaign_id, title, kind, visibility, canvas_x, canvas_y,
    conversion_source_type, conversion_source_id
  )
  select quest_id, campaign_id, title, 'combat', 'hidden',
    600 + (stage_index % 3) * 300,
    floor(stage_index / 3) * 220,
    'legacy_encounter_ref', ref_row_id::text
  from staged
  on conflict do nothing;

  insert into public.quest_beat_attachments (
    beat_id, quest_id, campaign_id, attachment_type, ref_id, role, sort_order
  )
  select b.id, b.quest_id, b.campaign_id, 'encounter', r.ref_id,
    'Backfilled from the quest encounter list', 0
  from public.quest_beats b
  join public.quest_refs r
    on r.id::text = b.conversion_source_id
    and r.quest_id = b.quest_id
    and r.ref_type = 'encounter'
  where b.conversion_source_type = 'legacy_encounter_ref'
  on conflict do nothing;

  update public.quests
  set flow_enabled_at = coalesce(flow_enabled_at, now())
  where flow_enabled_at is null;
end;
$$;

revoke execute on function private.backfill_quest_story_flows(boolean) from public, anon, authenticated;

-- Production rows exist while migrations run, so only project the quests that
-- had not already opted into flow. The same helper is called after local seed
-- loading to account for Supabase's migrations-before-seed reset order.
select private.backfill_quest_story_flows(true);

alter table public.quests
  alter column flow_enabled_at set default now(),
  alter column flow_enabled_at set not null;

drop function if exists public.preview_quest_flow_conversion(uuid);
drop function if exists public.convert_quest_to_flow(uuid, boolean);
drop function if exists public.rollback_quest_flow_conversion(uuid);
