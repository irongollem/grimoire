-- Existing quest_refs have no narrative order. Flow conversion is therefore an
-- explicit DM action: it may create one hidden overview beat and one unconnected
-- staging beat per encounter ref, but it never manufactures edges or rewrites
-- the legacy quest, objectives, triggers, rewards, refs, subquests, or sharing.

alter table public.quests
  add column flow_enabled_at timestamptz;

alter table public.quest_beats
  add column conversion_source_type text,
  add column conversion_source_id text,
  add constraint quest_beats_conversion_source_complete check (
    (conversion_source_type is null and conversion_source_id is null)
    or (conversion_source_type in ('legacy_overview', 'legacy_encounter_ref')
      and conversion_source_id is not null)
  );

create unique index quest_beats_conversion_source_key
  on public.quest_beats (quest_id, conversion_source_type, conversion_source_id)
  where conversion_source_type is not null;

create or replace function public.preview_quest_flow_conversion(p_quest_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, private
as $$
declare
  v_quest public.quests;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select * into v_quest from public.quests where id = p_quest_id;
  if not found then raise exception 'Quest not found'; end if;
  if v_quest.campaign_id is null or not coalesce(private.is_campaign_dm(v_quest.campaign_id), false) then
    raise exception 'Only the campaign DM can convert this quest';
  end if;

  return jsonb_build_object(
    'flow_enabled', v_quest.flow_enabled_at is not null,
    'overview_available', coalesce(nullif(btrim(v_quest.summary), ''), nullif(btrim(v_quest.description), '')) is not null,
    'overview_beats_to_create', case when coalesce(nullif(btrim(v_quest.summary), ''), nullif(btrim(v_quest.description), '')) is not null
      and not exists (select 1 from public.quest_beats b where b.quest_id = p_quest_id and b.conversion_source_type = 'legacy_overview')
      then 1 else 0 end,
    'encounter_refs', (select count(*) from public.quest_refs r where r.quest_id = p_quest_id and r.ref_type = 'encounter'),
    'encounter_beats_to_create', (select count(*) from public.quest_refs r
      where r.quest_id = p_quest_id and r.ref_type = 'encounter'
        and not exists (select 1 from public.quest_beats b
          where b.quest_id = p_quest_id and b.conversion_source_type = 'legacy_encounter_ref' and b.conversion_source_id = r.id::text)),
    'objectives_preserved', (select count(*) from public.quest_objectives o where o.quest_id = p_quest_id),
    'triggers_preserved', (select count(*) from public.quest_triggers t where t.quest_id = p_quest_id),
    'subquests_preserved', (select count(*) from public.quests q where q.parent_quest_id = p_quest_id),
    'shared_characters_preserved', coalesce(cardinality(v_quest.player_visible_to), 0),
    'rewards_preserved', coalesce(v_quest.reward_pp, 0) <> 0 or coalesce(v_quest.reward_gp, 0) <> 0
      or coalesce(v_quest.reward_ep, 0) <> 0 or coalesce(v_quest.reward_sp, 0) <> 0
      or coalesce(v_quest.reward_cp, 0) <> 0 or coalesce(cardinality(v_quest.reward_item_ids), 0) > 0
      or nullif(btrim(v_quest.rewards), '') is not null
  );
end;
$$;

create or replace function public.convert_quest_to_flow(
  p_quest_id uuid,
  p_include_overview boolean default true
)
returns jsonb
language plpgsql security definer
set search_path = public, private
as $$
declare
  v_quest public.quests;
  v_overview_created integer := 0;
  v_encounters_created integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select * into v_quest from public.quests where id = p_quest_id for update;
  if not found then raise exception 'Quest not found'; end if;
  if v_quest.campaign_id is null or not coalesce(private.is_campaign_dm(v_quest.campaign_id), false) then
    raise exception 'Only the campaign DM can convert this quest';
  end if;

  if p_include_overview
     and coalesce(nullif(btrim(v_quest.summary), ''), nullif(btrim(v_quest.description), '')) is not null then
    insert into public.quest_beats (
      quest_id, campaign_id, title, dm_content, kind, visibility,
      canvas_x, canvas_y, conversion_source_type, conversion_source_id
    ) values (
      p_quest_id, v_quest.campaign_id, v_quest.title || ' — overview',
      coalesce(nullif(btrim(v_quest.summary), ''), v_quest.description),
      'discovery', 'hidden', 0, 0, 'legacy_overview', p_quest_id::text
    ) on conflict do nothing;
    get diagnostics v_overview_created = row_count;
  end if;

  with staged as (
    select r.id ref_row_id, r.ref_id, coalesce(e.name, 'Encounter') title,
      row_number() over (order by r.id) - 1 stage_index
    from public.quest_refs r
    left join public.encounters e on e.id::text = r.ref_id and e.campaign_id = v_quest.campaign_id
    where r.quest_id = p_quest_id and r.ref_type = 'encounter'
  ), inserted as (
    insert into public.quest_beats (
      quest_id, campaign_id, title, kind, visibility, canvas_x, canvas_y,
      conversion_source_type, conversion_source_id
    )
    select p_quest_id, v_quest.campaign_id, staged.title, 'combat', 'hidden',
      600 + (staged.stage_index % 3) * 300,
      floor(staged.stage_index / 3) * 220,
      'legacy_encounter_ref', staged.ref_row_id::text
    from staged
    on conflict do nothing
    returning id
  )
  select count(*) into v_encounters_created from inserted;

  insert into public.quest_beat_attachments (
    beat_id, quest_id, campaign_id, attachment_type, ref_id, role, sort_order
  )
  select b.id, p_quest_id, v_quest.campaign_id, 'encounter', r.ref_id,
    'Imported from the legacy quest encounter list', 0
  from public.quest_beats b
  join public.quest_refs r on r.id::text = b.conversion_source_id
  where b.quest_id = p_quest_id
    and b.conversion_source_type = 'legacy_encounter_ref'
    and r.quest_id = p_quest_id and r.ref_type = 'encounter'
  on conflict do nothing;

  update public.quests
  set flow_enabled_at = coalesce(flow_enabled_at, now())
  where id = p_quest_id;

  return jsonb_build_object(
    'overview_beats_created', v_overview_created,
    'encounter_beats_created', v_encounters_created,
    'flow_enabled', true
  );
end;
$$;

create or replace function public.rollback_quest_flow_conversion(p_quest_id uuid)
returns integer
language plpgsql security definer
set search_path = public, private
as $$
declare
  v_campaign_id uuid;
  v_removed integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select campaign_id into v_campaign_id from public.quests where id = p_quest_id for update;
  if not found then raise exception 'Quest not found'; end if;
  if v_campaign_id is null or not coalesce(private.is_campaign_dm(v_campaign_id), false) then
    raise exception 'Only the campaign DM can roll back this conversion';
  end if;
  if exists (
    select 1 from public.quest_beat_transitions t
    join public.quest_beats b on b.id = t.to_beat_id
    where b.quest_id = p_quest_id and b.conversion_source_type is not null
  ) then
    raise exception 'A conversion cannot be rolled back after its generated beats have runtime history';
  end if;

  delete from public.quest_beats
  where quest_id = p_quest_id and conversion_source_type is not null;
  get diagnostics v_removed = row_count;

  update public.quests set flow_enabled_at = null where id = p_quest_id;
  return v_removed;
end;
$$;

revoke all on function public.preview_quest_flow_conversion(uuid) from public, anon;
revoke all on function public.convert_quest_to_flow(uuid, boolean) from public, anon;
revoke all on function public.rollback_quest_flow_conversion(uuid) from public, anon;
grant execute on function public.preview_quest_flow_conversion(uuid) to authenticated;
grant execute on function public.convert_quest_to_flow(uuid, boolean) to authenticated;
grant execute on function public.rollback_quest_flow_conversion(uuid) to authenticated;

-- quests gained a column, so restate the positional player projection now.
create or replace function public.get_player_visible_quests(
  p_campaign_id uuid default null,
  p_quest_id uuid default null,
  p_preview_party_member_id uuid default null
)
returns setof public.quests
language plpgsql stable security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_preview_party_member_id is not null and not exists (
    select 1 from public.party_members pm
    where pm.id = p_preview_party_member_id
      and (p_campaign_id is null or pm.campaign_id = p_campaign_id)
      and coalesce(private.is_campaign_dm(pm.campaign_id), false)
  ) then raise exception 'Preview audience is not available to this DM'; end if;

  return query select
    q.id, q.user_id, q.campaign_id, q.parent_quest_id, q.title, q.summary,
    q.status, q.giver_npc_id, q.location_id, q.rewards, q.tags,
    null::text, q.started_at, q.resolved_at, q.created_at, q.updated_at,
    q.reward_pp, q.reward_gp, q.reward_ep, q.reward_sp, q.reward_cp,
    q.reward_currency_pools, q.description, q.reward_item_ids,
    q.reward_art_objects, q.player_visible_to, q.ai_provenance,
    q.flow_enabled_at
  from public.quests q
  where q.campaign_id is not null
    and (p_campaign_id is null or q.campaign_id = p_campaign_id)
    and (p_quest_id is null or q.id = p_quest_id)
    and case
      when p_preview_party_member_id is null then private.is_quest_player_visible(q.id)
      else p_preview_party_member_id = any(q.player_visible_to)
        and coalesce(private.is_campaign_dm(q.campaign_id), false)
    end;
end;
$$;

revoke all on function public.get_player_visible_quests(uuid, uuid, uuid) from public;
revoke execute on function public.get_player_visible_quests(uuid, uuid, uuid) from anon;
grant execute on function public.get_player_visible_quests(uuid, uuid, uuid) to authenticated, service_role;
