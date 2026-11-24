-- A fight takes what it spent from a sheet off the sheet as it is now, once per batch (#1264).
--
-- When an ally the server plays casts or uses a class feature, `encounter-command` used to write the character's whole slot list,
-- whole `class_resources` object and innate uses as absolute values, read when the batch began. A slot the player marked on their
-- own sheet between that read and the write was put back. Absolute values were there so a retried write lands once; this keeps
-- that with a ledger instead: `spend_from_sheet` takes the spend (how many slots of which level and pool, uses of which pool, uses
-- of which innate grant), applies it to the row as it stands, and records (campaign, member, batch) so the same spend sent again,
-- by a retry or by settling `encounter_state.owed_writes`, changes nothing.

create table public.fight_sheet_spends (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- No foreign key: a spend outlives nothing it needs, and the row is pruned after `spend_from_sheet`'s retention below. A member
  -- deleted meanwhile leaves a key nobody will ask for again.
  party_member_id uuid not null,
  -- The fight batch's own id (`encounter-command`'s `batchId`, at most 128 characters there).
  batch_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, party_member_id, batch_id)
);

comment on table public.fight_sheet_spends is
  'Which fight batches have already taken their spend from which sheet (#1264), so a retried spend lands once. Deny-all, server only; pruned after 30 days.';

create index fight_sheet_spends_created_at_idx on public.fight_sheet_spends (created_at);

create trigger fight_sheet_spends_updated_at
  before update on public.fight_sheet_spends
  for each row execute procedure update_updated_at();

alter table public.fight_sheet_spends enable row level security;

grant select, insert, update, delete on public.fight_sheet_spends to service_role;

insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('fight_sheet_spends', 1, false, 'a ledger of fight batches already spent from sheets: server bookkeeping, never template content');

-- p_slots:     [{ level, pool (null for a row that names none), count }]
-- p_resources: [{ key, count, fresh (the entry with every use left, for a pool the sheet has never stored) }]
-- p_innate:    [{ spellRowId, count }]
-- Returns false when this batch had already spent from this member's sheet (nothing is done then).
create function public.spend_from_sheet(
  p_campaign_id uuid,
  p_member_id uuid,
  p_batch_id text,
  p_slots jsonb,
  p_resources jsonb,
  p_innate jsonb
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_slots jsonb;
  v_resources jsonb;
  v_slot record;
  v_resource record;
  v_use record;
  v_at int;
  v_entry jsonb;
  v_inserted int;
begin
  if p_batch_id is null or length(p_batch_id) = 0 then
    raise exception 'spend_from_sheet: a batch id is required';
  end if;
  if jsonb_typeof(p_slots) is distinct from 'array' or jsonb_typeof(p_resources) is distinct from 'array' or jsonb_typeof(p_innate) is distinct from 'array' then
    raise exception 'spend_from_sheet: slots, resources and innate must be arrays';
  end if;

  -- The row is locked first, so a player's own write to it waits for this one, or this one for theirs: neither is lost.
  select pm.spell_slots, pm.class_resources into v_slots, v_resources
    from public.party_members pm
   where pm.id = p_member_id and pm.campaign_id = p_campaign_id
     for update;
  if not found then
    raise exception 'spend_from_sheet: no such member in this campaign';
  end if;

  insert into public.fight_sheet_spends (campaign_id, party_member_id, batch_id)
  values (p_campaign_id, p_member_id, p_batch_id)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false;
  end if;

  -- A slot spent at a level is the first unspent slot there in the pool it was cast from, else in any pool (as `allySlotSpend` picks).
  -- A level the sheet no longer has an unspent slot at takes nothing: the player already marked it.
  for v_slot in select * from jsonb_to_recordset(p_slots) as s(level int, pool text, count int) loop
    if v_slot.count is null or v_slot.count < 1 or v_slot.level is null then
      raise exception 'spend_from_sheet: a slot spend needs a level and a positive count';
    end if;
    for i in 1..v_slot.count loop
      select (e.ord - 1)::int into v_at
        from jsonb_array_elements(v_slots) with ordinality as e(slot, ord)
       where (e.slot ->> 'level')::int = v_slot.level
         and coalesce((e.slot ->> 'used')::int, 0) < coalesce((e.slot ->> 'max')::int, 0)
       order by (coalesce(e.slot ->> 'pool', 'spellcasting') = coalesce(v_slot.pool, 'spellcasting')) desc, e.ord
       limit 1;
      exit when v_at is null;
      v_slots := jsonb_set(v_slots, array[v_at::text, 'used'], to_jsonb(coalesce((v_slots -> v_at ->> 'used')::int, 0) + 1));
    end loop;
  end loop;

  -- Uses come off the pool as it stands, never below none; a pool never stored starts full.
  for v_resource in select * from jsonb_to_recordset(p_resources) as r(key text, count int, fresh jsonb) loop
    if v_resource.key is null or v_resource.count is null or v_resource.count < 1 or jsonb_typeof(v_resource.fresh) is distinct from 'object' then
      raise exception 'spend_from_sheet: a resource spend needs a key, a positive count and a fresh entry';
    end if;
    v_entry := coalesce(v_resources -> v_resource.key, v_resource.fresh);
    v_resources := jsonb_set(
      v_resources,
      array[v_resource.key],
      jsonb_set(v_entry, '{current}', to_jsonb(greatest(coalesce((v_entry ->> 'current')::int, 0) - v_resource.count, 0)))
    );
  end loop;

  update public.party_members
     set spell_slots = v_slots, class_resources = v_resources
   where id = p_member_id and campaign_id = p_campaign_id
     and (spell_slots is distinct from v_slots or class_resources is distinct from v_resources);

  -- A daily grant of this member's: its uses as they stand, never below none.
  for v_use in select * from jsonb_to_recordset(p_innate) as u("spellRowId" uuid, count int) loop
    if v_use."spellRowId" is null or v_use.count is null or v_use.count < 1 then
      raise exception 'spend_from_sheet: an innate spend needs a spell row and a positive count';
    end if;
    update public.character_spells
       set uses_remaining = greatest(uses_remaining - v_use.count, 0)
     where id = v_use."spellRowId" and party_member_id = p_member_id and uses_remaining is not null;
  end loop;

  -- A retry comes within seconds, and an owed record is settled by the fight's next batch: a month is far past either.
  delete from public.fight_sheet_spends where created_at < now() - interval '30 days';

  return true;
end;
$$;

comment on function public.spend_from_sheet(uuid, uuid, text, jsonb, jsonb, jsonb) is
  'Takes what a fight batch spent (slots, class resources, innate uses) off a party member''s sheet as it is now, once per batch (#1264). Server only.';

revoke execute on function public.spend_from_sheet(uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.spend_from_sheet(uuid, uuid, text, jsonb, jsonb, jsonb) to service_role;

-- What an answered Reaction still owes is now a list of spends under its batch id. A record of the old shape (whole lists, from the
-- day #1261 shipped) cannot be settled by the new code and would be reported as unreadable on every batch: it is dropped.
update public.encounter_state
   set owed_writes = null
 where owed_writes is not null and not (owed_writes ? 'spends');

comment on column public.encounter_state.owed_writes is
  'Sheet spends the batch that answered the played character''s Reaction still owes (#1021, #1264): { batchId, spends }, applied once '
  'per batch through spend_from_sheet. Saved with the fight, cleared by encounter-command once they landed; null when nothing is owed.';
