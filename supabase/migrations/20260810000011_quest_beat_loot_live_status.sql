-- Run mode derives delivery detail from authoritative chat metadata. No claim
-- or inventory state is duplicated onto quest_beat_loot.

alter table public.quest_beat_loot replica identity full;
alter table public.campaign_messages replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.quest_beat_loot;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.campaign_messages;
  exception when duplicate_object then null;
  end;
end $$;

drop function public.get_quest_beat_loot(uuid, uuid);

create function public.get_quest_beat_loot(
  p_campaign_id uuid,
  p_quest_id uuid default null
)
returns table (
  id uuid,
  beat_id uuid,
  quest_id uuid,
  campaign_id uuid,
  kind text,
  item_id uuid,
  quantity integer,
  label text,
  payload jsonb,
  source_type text,
  source_id uuid,
  sort_order integer,
  dispatch_message_id uuid,
  dispatched_at timestamptz,
  delivery_state text,
  quantity_remaining integer,
  claimed_by_names text[],
  handed_out_this_session boolean
)
language sql
stable
security definer
set search_path = public, private
as $$
  with current_session as (
    select max(t.created_at) as started_at
    from public.quest_beat_transitions t
    where t.campaign_id = p_campaign_id and t.transition_kind = 'enter'
  )
  select
    l.id, l.beat_id, l.quest_id, l.campaign_id, l.kind, l.item_id,
    l.quantity, coalesce(nullif(l.label, ''), i.name, l.payload->>'loot_table_name', 'Loot'),
    l.payload, l.source_type, l.source_id, l.sort_order,
    l.dispatch_message_id, l.dispatched_at,
    case
      when l.dispatched_at is null then 'held'
      when m.id is null then 'message_removed'
      when l.kind = 'item' and coalesce((m.metadata->>'quantity_remaining')::integer, l.quantity) <= 0 then 'claimed'
      when l.kind = 'item' and jsonb_array_length(coalesce(m.metadata->'claims', '[]'::jsonb)) > 0 then 'partially_claimed'
      when l.kind = 'currency' and m.metadata->>'claimed_by_user_id' is not null then 'claimed'
      when l.kind = 'loot_chest' and jsonb_array_length(coalesce(m.metadata->'claims', '[]'::jsonb)) >= coalesce((m.metadata->>'claims_total')::integer, 0) then 'claimed'
      when l.kind = 'loot_chest' and jsonb_array_length(coalesce(m.metadata->'claims', '[]'::jsonb)) > 0 then 'partially_claimed'
      else 'chat'
    end,
    case
      when m.id is null then l.quantity
      when l.kind = 'item' then greatest(coalesce((m.metadata->>'quantity_remaining')::integer, l.quantity), 0)
      when l.kind = 'currency' then case when m.metadata->>'claimed_by_user_id' is null then 1 else 0 end
      else greatest(coalesce((m.metadata->>'claims_total')::integer, 0) - jsonb_array_length(coalesce(m.metadata->'claims', '[]'::jsonb)), 0)
    end,
    case
      when m.id is null then '{}'::text[]
      when l.kind = 'currency' then array_remove(array[m.metadata->>'claimed_by_name'], null)
      else coalesce((
        select array_agg(distinct coalesce(claim->>'name', claim->>'claimed_by_name') order by coalesce(claim->>'name', claim->>'claimed_by_name'))
        from jsonb_array_elements(coalesce(m.metadata->'claims', '[]'::jsonb)) claim
        where coalesce(claim->>'name', claim->>'claimed_by_name') is not null
      ), '{}'::text[])
    end,
    coalesce(m.created_at >= current_session.started_at, false)
  from public.quest_beat_loot l
  left join public.items i on i.id = l.item_id
  left join public.campaign_messages m on m.id = l.dispatch_message_id
  cross join current_session
  where l.campaign_id = p_campaign_id
    and (p_quest_id is null or l.quest_id = p_quest_id)
    and private.is_campaign_dm(p_campaign_id)
  order by l.beat_id, l.sort_order, l.created_at, l.id;
$$;

revoke all on function public.get_quest_beat_loot(uuid, uuid) from public;
revoke execute on function public.get_quest_beat_loot(uuid, uuid) from anon;
grant execute on function public.get_quest_beat_loot(uuid, uuid) to authenticated;
