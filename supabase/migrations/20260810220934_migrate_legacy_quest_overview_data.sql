-- Move the remaining useful quest-editor data into the overview beat. The
-- legacy quest columns remain as a compatibility snapshot for player-facing
-- projections, but the DM workspace no longer depends on them.

update public.quest_beats b
set title = q.title || ' — overview',
    dm_content = case
      when nullif(btrim(b.dm_content), '') is null
        or b.dm_content = q.summary
      then coalesce(nullif(btrim(q.description), ''), nullif(btrim(q.summary), ''))
      else b.dm_content
    end,
    how_it_plays = coalesce(nullif(btrim(b.how_it_plays), ''), nullif(btrim(q.notes), '')),
    presentation_hint = coalesce(nullif(btrim(b.presentation_hint), ''), nullif(btrim(q.summary), '')),
    outcomes = coalesce(nullif(btrim(b.outcomes), ''), nullif(btrim(q.rewards), ''))
from public.quests q
where b.quest_id = q.id
  and b.is_overview;

-- Objectives are quest-wide lifecycle records, but placing them on the
-- overview lets the common beat attachment UI expose them in prep and play.
alter table public.quest_beat_attachments disable trigger validate_quest_beat_attachment;

insert into public.quest_beat_attachments (
  beat_id, quest_id, campaign_id, attachment_type, ref_id, role, sort_order,
  created_by
)
select b.id, b.quest_id, b.campaign_id, 'objective', o.id::text,
  'Quest-wide objective', o.sort_order, q.user_id
from public.quest_beats b
join public.quests q on q.id = b.quest_id
join public.quest_objectives o on o.quest_id = b.quest_id
where b.is_overview
on conflict do nothing;

alter table public.quest_beat_attachments enable trigger validate_quest_beat_attachment;

-- Existing quest rewards become prepared overview loot. Validation is
-- intentionally bypassed during this one-time conversion so a deleted legacy
-- item remains visible as a prep gap instead of aborting the migration.
alter table public.quest_beat_loot disable trigger validate_quest_beat_loot;

insert into public.quest_beat_loot (
  beat_id, quest_id, campaign_id, kind, item_id, quantity, label, payload,
  source_type, source_id, sort_order, created_by
)
select b.id, q.id, q.campaign_id, 'item', reward.item_id, 1,
  coalesce(i.name, 'Missing legacy quest reward'), '{}'::jsonb,
  'quest_reward', q.id, reward.ordinality::integer, q.user_id
from public.quests q
join public.quest_beats b on b.quest_id = q.id and b.is_overview
cross join lateral unnest(coalesce(q.reward_item_ids, '{}'::uuid[]))
  with ordinality as reward(item_id, ordinality)
left join public.items i on i.id = reward.item_id
where not exists (
  select 1 from public.quest_beat_loot l
  where l.beat_id = b.id and l.source_type = 'quest_reward'
    and l.kind = 'item' and l.item_id = reward.item_id
);

insert into public.quest_beat_loot (
  beat_id, quest_id, campaign_id, kind, quantity, label, payload,
  source_type, source_id, sort_order, created_by
)
select b.id, q.id, q.campaign_id, 'currency', 1, 'Quest reward',
  jsonb_build_object('pp', q.reward_pp, 'gp', q.reward_gp, 'ep', q.reward_ep, 'sp', q.reward_sp, 'cp', q.reward_cp),
  'quest_reward', q.id, 100, q.user_id
from public.quests q
join public.quest_beats b on b.quest_id = q.id and b.is_overview
where q.reward_pp + q.reward_gp + q.reward_ep + q.reward_sp + q.reward_cp > 0
  and not exists (
    select 1 from public.quest_beat_loot l
    where l.beat_id = b.id and l.source_type = 'quest_reward'
      and l.kind = 'currency' and l.label = 'Quest reward'
  );

insert into public.quest_beat_loot (
  beat_id, quest_id, campaign_id, kind, quantity, label, payload,
  source_type, source_id, sort_order, created_by
)
select b.id, q.id, q.campaign_id, 'currency', 1,
  coalesce(nullif(pool.value->>'label', ''), 'Quest reward'),
  jsonb_build_object(
    'pp', coalesce((pool.value->>'pp')::integer, 0),
    'gp', coalesce((pool.value->>'gp')::integer, 0),
    'ep', coalesce((pool.value->>'ep')::integer, 0),
    'sp', coalesce((pool.value->>'sp')::integer, 0),
    'cp', coalesce((pool.value->>'cp')::integer, 0)
  ),
  'quest_reward', q.id, 110 + pool.ordinality::integer, q.user_id
from public.quests q
join public.quest_beats b on b.quest_id = q.id and b.is_overview
cross join lateral jsonb_array_elements(coalesce(q.reward_currency_pools, '[]'::jsonb))
  with ordinality as pool(value, ordinality)
where coalesce((pool.value->>'pp')::integer, 0)
    + coalesce((pool.value->>'gp')::integer, 0)
    + coalesce((pool.value->>'ep')::integer, 0)
    + coalesce((pool.value->>'sp')::integer, 0)
    + coalesce((pool.value->>'cp')::integer, 0) > 0
  and not exists (
    select 1 from public.quest_beat_loot l
    where l.beat_id = b.id and l.source_type = 'quest_reward'
      and l.kind = 'currency' and l.payload = jsonb_build_object(
        'pp', coalesce((pool.value->>'pp')::integer, 0),
        'gp', coalesce((pool.value->>'gp')::integer, 0),
        'ep', coalesce((pool.value->>'ep')::integer, 0),
        'sp', coalesce((pool.value->>'sp')::integer, 0),
        'cp', coalesce((pool.value->>'cp')::integer, 0)
      )
  );

insert into public.quest_beat_loot (
  beat_id, quest_id, campaign_id, kind, quantity, label, payload,
  source_type, source_id, sort_order, created_by
)
select b.id, q.id, q.campaign_id, 'loot_chest', 1, 'Quest art rewards',
  jsonb_build_object(
    'loot_table_id', null,
    'loot_table_name', q.title,
    'chest_image_url', null,
    'rolled_atoms', (
      select jsonb_agg(jsonb_build_object(
        'atom_id', coalesce(nullif(art->>'id', ''), gen_random_uuid()::text),
        'type', 'item',
        'item_id', null,
        'item_name', coalesce(nullif(art->>'name', ''), 'Art object'),
        'item_image_url', art->'image_url',
        'item_rarity', null,
        'value_gp', coalesce((art->>'value_gp')::numeric, 0),
        'description', art->'description'
      )) from jsonb_array_elements(q.reward_art_objects) art
    ),
    'claims', '[]'::jsonb,
    'claims_total', jsonb_array_length(q.reward_art_objects)
  ),
  'quest_reward', q.id, 200, q.user_id
from public.quests q
join public.quest_beats b on b.quest_id = q.id and b.is_overview
where jsonb_typeof(q.reward_art_objects) = 'array'
  and jsonb_array_length(q.reward_art_objects) > 0
  and not exists (
    select 1 from public.quest_beat_loot l
    where l.beat_id = b.id and l.source_type = 'quest_reward'
      and l.kind = 'loot_chest' and l.label = 'Quest art rewards'
  );

alter table public.quest_beat_loot enable trigger validate_quest_beat_loot;
