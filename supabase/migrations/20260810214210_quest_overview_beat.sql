-- The quest overview is a first-class beat-plus: it shares the beat fields,
-- prepared-material adapters, and loot workflow, while the quest row continues
-- to own lifecycle metadata such as status, hierarchy, and consequences.

alter table public.quest_beats
  add column is_overview boolean not null default false;

create unique index quest_beats_one_overview_per_quest
  on public.quest_beats (quest_id)
  where is_overview;

update public.quest_beats
set is_overview = true,
    kind = 'overview'
where conversion_source_type = 'legacy_overview';

insert into public.quest_beats (
  quest_id, campaign_id, title, dm_content, kind, visibility,
  canvas_x, canvas_y, is_overview
)
select q.id, q.campaign_id, q.title || ' — overview',
  coalesce(nullif(btrim(q.summary), ''), q.description),
  'overview', 'hidden', 0, 0, true
from public.quests q
where q.campaign_id is not null
  and not exists (
    select 1 from public.quest_beats b
    where b.quest_id = q.id and b.is_overview
  );

-- Existing quest-wide relationships become overview placements. The insert is
-- additive: their authoritative quest_refs remain intact for filters and
-- reverse lookups, and existing beat placements are not moved.
-- Dangling legacy refs deliberately become visible prep gaps, so the migration
-- bypasses only the new-placement validator while projecting existing rows.
alter table public.quest_beat_attachments disable trigger validate_quest_beat_attachment;

insert into public.quest_beat_attachments (
  beat_id, quest_id, campaign_id, attachment_type, ref_id, role, sort_order
)
select b.id, b.quest_id, b.campaign_id,
  case r.ref_type
    when 'location' then 'location_set'
    else r.ref_type
  end,
  r.ref_id, 'Quest-wide material', 0
from public.quest_beats b
join public.quest_refs r on r.quest_id = b.quest_id
where b.is_overview
on conflict do nothing;

alter table public.quest_beat_attachments enable trigger validate_quest_beat_attachment;

create or replace function private.create_quest_overview_beat()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.campaign_id is not null then
    insert into public.quest_beats (
      quest_id, campaign_id, title, dm_content, kind, visibility,
      canvas_x, canvas_y, is_overview
    ) values (
      new.id, new.campaign_id, new.title || ' — overview',
      nullif(btrim(new.summary), ''), 'overview', 'hidden', 0, 0, true
    );
  end if;
  return new;
end;
$$;

revoke all on function private.create_quest_overview_beat() from public, anon, authenticated;

create trigger create_quest_overview_beat
  after insert on public.quests
  for each row execute function private.create_quest_overview_beat();

comment on column public.quest_beats.is_overview is
  'Marks the single quest-level beat-plus that shares beat preparation primitives while carrying whole-story context.';

-- Seed loading runs after migrations and still calls this helper to stage
-- encounter refs. Keep that behavior, but let the insert trigger own overview
-- creation so seed resets cannot manufacture a second pseudo-overview.
create or replace function private.backfill_quest_story_flows(p_only_disabled boolean default false)
returns void
language plpgsql
set search_path = public, private
as $$
begin
  insert into public.quest_beats (
    quest_id, campaign_id, title, dm_content, kind, visibility,
    canvas_x, canvas_y, conversion_source_type, conversion_source_id, is_overview
  )
  select q.id, q.campaign_id, q.title || ' — overview',
    coalesce(nullif(btrim(q.summary), ''), q.description),
    'overview', 'hidden', 0, 0, 'legacy_overview', q.id::text, true
  from public.quests q
  where (not p_only_disabled or q.flow_enabled_at is null)
    and q.campaign_id is not null
    and coalesce(nullif(btrim(q.summary), ''), nullif(btrim(q.description), '')) is not null
    and not exists (
      select 1 from public.quest_beats b
      where b.quest_id = q.id and b.is_overview
    )
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
