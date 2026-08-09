-- Beat loot is orchestration over the existing chat drop and claim system.
-- Prepared items remain Item Vault records; dispatched messages are immutable
-- snapshots claimed through the existing atomic claim RPCs.

create table public.quest_beat_loot (
  id uuid primary key default gen_random_uuid(),
  beat_id uuid not null,
  quest_id uuid not null,
  campaign_id uuid not null,
  kind text not null check (kind in ('item', 'currency', 'loot_chest')),
  -- Deliberately not an FK: a removed Item Vault target must become a visible
  -- prep gap instead of blocking item deletion or erasing placement provenance.
  item_id uuid,
  quantity integer not null default 1 check (quantity > 0),
  label text not null default '',
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  source_type text not null default 'prepared'
    check (source_type in ('prepared', 'quest_reward', 'encounter_loot')),
  source_id uuid,
  sort_order integer not null default 0,
  dispatch_message_id uuid,
  dispatched_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quest_beat_loot_beat_fkey
    foreign key (beat_id, quest_id, campaign_id)
    references public.quest_beats(id, quest_id, campaign_id) on delete cascade,
  constraint quest_beat_loot_item_shape check (
    (kind = 'item' and item_id is not null)
    or (kind <> 'item' and item_id is null)
  ),
  constraint quest_beat_loot_dispatch_complete check (
    (dispatch_message_id is null and dispatched_at is null)
    or (dispatch_message_id is not null and dispatched_at is not null)
  )
);

comment on table public.quest_beat_loot is
  'Prepared loot placements. Delivery is represented by campaign_messages and existing claim RPCs, not duplicated here.';
comment on column public.quest_beat_loot.dispatch_message_id is
  'Intentionally not a foreign key: deleting chat must retain the original message UUID and dispatch provenance.';
comment on column public.quest_beat_loot.payload is
  'Currency coin values or an existing LootChestMetadata-shaped snapshot; item details remain authoritative in items until dispatch.';

create index quest_beat_loot_quest_idx
  on public.quest_beat_loot (quest_id, beat_id, sort_order, created_at);
create unique index quest_beat_loot_dispatch_message_key
  on public.quest_beat_loot (dispatch_message_id)
  where dispatch_message_id is not null;

create trigger set_quest_beat_loot_updated_at
  before update on public.quest_beat_loot
  for each row execute procedure public.update_updated_at();

create or replace function private.validate_quest_beat_loot()
returns trigger
language plpgsql security definer
set search_path = public, private
as $$
declare
  v_coin text;
begin
  if new.kind = 'item' and not exists (
    select 1 from public.items i
    where i.id = new.item_id
      and (i.user_id = auth.uid() or i.campaign_id = new.campaign_id)
  ) then
    raise exception 'Item is not available to this campaign' using errcode = '23514';
  end if;

  if new.kind = 'currency' then
    foreach v_coin in array array['pp', 'gp', 'ep', 'sp', 'cp'] loop
      if new.payload ? v_coin and (
        jsonb_typeof(new.payload->v_coin) <> 'number'
        or (new.payload->>v_coin)::numeric < 0
        or floor((new.payload->>v_coin)::numeric) <> (new.payload->>v_coin)::numeric
      ) then
        raise exception 'Currency % must be a non-negative integer', v_coin using errcode = '23514';
      end if;
    end loop;
    if coalesce((new.payload->>'pp')::integer, 0)
      + coalesce((new.payload->>'gp')::integer, 0)
      + coalesce((new.payload->>'ep')::integer, 0)
      + coalesce((new.payload->>'sp')::integer, 0)
      + coalesce((new.payload->>'cp')::integer, 0) = 0 then
      raise exception 'Currency loot must contain at least one coin' using errcode = '23514';
    end if;
  end if;

  if new.kind = 'loot_chest' and (
    jsonb_typeof(new.payload->'rolled_atoms') is distinct from 'array'
    or jsonb_typeof(new.payload->'claims_total') is distinct from 'number'
    or (new.payload->>'claims_total')::integer < 1
  ) then
    raise exception 'Loot chest requires rolled_atoms and a positive claims_total' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.dispatched_at is not null and (
    new.beat_id is distinct from old.beat_id
    or new.quest_id is distinct from old.quest_id
    or new.campaign_id is distinct from old.campaign_id
    or new.kind is distinct from old.kind
    or new.item_id is distinct from old.item_id
    or new.quantity is distinct from old.quantity
    or new.payload is distinct from old.payload
    or new.source_type is distinct from old.source_type
    or new.source_id is distinct from old.source_id
    or new.dispatch_message_id is distinct from old.dispatch_message_id
    or new.dispatched_at is distinct from old.dispatched_at
  ) then
    raise exception 'Dispatched loot provenance is immutable' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_quest_beat_loot() from public;

create trigger validate_quest_beat_loot
  before insert or update on public.quest_beat_loot
  for each row execute function private.validate_quest_beat_loot();

alter table public.quest_beat_loot enable row level security;
create policy quest_beat_loot_dm_select on public.quest_beat_loot
  for select using (private.is_campaign_dm(campaign_id));
create policy quest_beat_loot_dm_insert on public.quest_beat_loot
  for insert with check (private.is_campaign_dm(campaign_id));
create policy quest_beat_loot_dm_update on public.quest_beat_loot
  for update using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));
create policy quest_beat_loot_dm_delete_held on public.quest_beat_loot
  for delete using (private.is_campaign_dm(campaign_id) and dispatched_at is null);
grant select, insert, update, delete on public.quest_beat_loot to authenticated;

create or replace function public.dispatch_quest_beat_loot(
  p_beat_id uuid,
  p_entry_id uuid default null
)
returns table (loot_entry_id uuid, message_id uuid, delivery_state text)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_entry public.quest_beat_loot;
  v_item public.items;
  v_message_id uuid;
  v_metadata jsonb;
  v_sender_name text;
  v_message text;
  v_parts text[];
begin
  if not exists (
    select 1 from public.quest_beats b
    where b.id = p_beat_id and private.is_campaign_dm(b.campaign_id)
  ) then
    raise exception 'Beat not found or caller is not a campaign DM';
  end if;

  if p_entry_id is not null and not exists (
    select 1 from public.quest_beat_loot l where l.id = p_entry_id and l.beat_id = p_beat_id
  ) then
    raise exception 'Loot entry not found on this beat';
  end if;

  select cm.display_name into v_sender_name
  from public.quest_beats b
  left join public.campaign_members cm
    on cm.campaign_id = b.campaign_id and cm.user_id = auth.uid()
  where b.id = p_beat_id;
  v_sender_name := coalesce(nullif(btrim(v_sender_name), ''), 'Dungeon Master');

  for v_entry in
    select l.* from public.quest_beat_loot l
    where l.beat_id = p_beat_id and (p_entry_id is null or l.id = p_entry_id)
    order by l.sort_order, l.created_at, l.id
    for update
  loop
    if v_entry.dispatched_at is not null then
      loot_entry_id := v_entry.id;
      message_id := v_entry.dispatch_message_id;
      delivery_state := case when exists (
        select 1 from public.campaign_messages cm where cm.id = v_entry.dispatch_message_id
      ) then 'chat' else 'message_removed' end;
      return next;
      continue;
    end if;

    v_metadata := jsonb_build_object(
      'quest_id', v_entry.quest_id,
      'beat_id', v_entry.beat_id,
      'quest_loot_entry_id', v_entry.id,
      'source_type', v_entry.source_type,
      'source_id', v_entry.source_id
    );

    if v_entry.kind = 'item' then
      select * into v_item from public.items i where i.id = v_entry.item_id;
      if v_item is null then
        raise exception 'Prepared item % no longer exists', v_entry.item_id;
      end if;
      v_metadata := v_metadata || jsonb_build_object(
        'item_id', v_item.id,
        'item_name', v_item.name,
        'item_rarity', v_item.rarity,
        'quantity', v_entry.quantity,
        'quantity_remaining', v_entry.quantity,
        'claims', '[]'::jsonb,
        'image_url', case when v_item.rarity = 'mundane' then v_item.image_url else v_item.mundane_image_url end,
        'description', null,
        'is_container', 'container' = any(v_item.tags),
        'claimed_by_user_id', null,
        'claimed_by_name', null,
        'claimed_party_member_id', null
      );
      v_message := 'dropped ' || case when v_entry.quantity > 1 then v_entry.quantity || 'x ' else '' end || v_item.name;
    elsif v_entry.kind = 'currency' then
      v_parts := array_remove(array[
        case when coalesce((v_entry.payload->>'pp')::integer, 0) > 0 then (v_entry.payload->>'pp') || ' pp' end,
        case when coalesce((v_entry.payload->>'gp')::integer, 0) > 0 then (v_entry.payload->>'gp') || ' gp' end,
        case when coalesce((v_entry.payload->>'ep')::integer, 0) > 0 then (v_entry.payload->>'ep') || ' ep' end,
        case when coalesce((v_entry.payload->>'sp')::integer, 0) > 0 then (v_entry.payload->>'sp') || ' sp' end,
        case when coalesce((v_entry.payload->>'cp')::integer, 0) > 0 then (v_entry.payload->>'cp') || ' cp' end
      ], null);
      v_metadata := v_metadata || jsonb_build_object(
        'label', nullif(v_entry.label, ''),
        'pp', coalesce((v_entry.payload->>'pp')::integer, 0),
        'gp', coalesce((v_entry.payload->>'gp')::integer, 0),
        'ep', coalesce((v_entry.payload->>'ep')::integer, 0),
        'sp', coalesce((v_entry.payload->>'sp')::integer, 0),
        'cp', coalesce((v_entry.payload->>'cp')::integer, 0),
        'claimed_by_user_id', null,
        'claimed_by_name', null,
        'claimed_party_member_id', null
      );
      v_message := 'dropped ' || case when v_entry.label <> '' then v_entry.label || ': ' else 'currency: ' end || array_to_string(v_parts, ', ');
    else
      v_metadata := v_entry.payload || v_metadata || jsonb_build_object('claims', '[]'::jsonb);
      v_message := 'dropped a chest from ' || coalesce(nullif(v_entry.payload->>'loot_table_name', ''), nullif(v_entry.label, ''), 'prepared loot');
    end if;

    insert into public.campaign_messages (
      campaign_id, user_id, recipient_user_id, sender_name, message, type, metadata
    ) values (
      v_entry.campaign_id, auth.uid(), null, v_sender_name, v_message,
      case v_entry.kind when 'item' then 'item_drop' when 'currency' then 'currency_drop' else 'loot_chest' end,
      v_metadata
    ) returning id into v_message_id;

    update public.quest_beat_loot
    set dispatch_message_id = v_message_id, dispatched_at = now()
    where id = v_entry.id;

    loot_entry_id := v_entry.id;
    message_id := v_message_id;
    delivery_state := 'chat';
    return next;
  end loop;
end;
$$;

revoke all on function public.dispatch_quest_beat_loot(uuid, uuid) from public;
revoke execute on function public.dispatch_quest_beat_loot(uuid, uuid) from anon;
grant execute on function public.dispatch_quest_beat_loot(uuid, uuid) to authenticated;

create or replace function public.get_quest_beat_loot(
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
  delivery_state text
)
language sql
stable
security definer
set search_path = public, private
as $$
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
    end
  from public.quest_beat_loot l
  left join public.items i on i.id = l.item_id
  left join public.campaign_messages m on m.id = l.dispatch_message_id
  where l.campaign_id = p_campaign_id
    and (p_quest_id is null or l.quest_id = p_quest_id)
    and private.is_campaign_dm(p_campaign_id)
  order by l.beat_id, l.sort_order, l.created_at, l.id;
$$;

revoke all on function public.get_quest_beat_loot(uuid, uuid) from public;
revoke execute on function public.get_quest_beat_loot(uuid, uuid) from anon;
grant execute on function public.get_quest_beat_loot(uuid, uuid) to authenticated;
