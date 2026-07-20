-- Revised spell-list changes happen only in their class-defined window. The
-- actual replacement is atomic so a failed new spell never deletes the old one.
create table public.spell_change_windows (
  party_member_id uuid not null references public.party_members(id) on delete cascade,
  source_class_id uuid not null references public.character_classes(id) on delete cascade,
  change_timing text not null check (change_timing in ('level_up', 'long_rest')),
  remaining_changes integer check (remaining_changes is null or remaining_changes >= 0),
  opened_at timestamptz not null default now(),
  primary key (party_member_id, source_class_id, change_timing)
);

alter table public.spell_change_windows enable row level security;
create policy "spell_change_windows_read" on public.spell_change_windows for select using (
  exists (select 1 from public.party_members pm where pm.id = party_member_id and
    (pm.user_id = auth.uid() or pm.owner_user_id = auth.uid() or private.is_campaign_dm(pm.campaign_id)))
);

create or replace function public.open_spell_change_windows(p_party_member_id uuid, p_timing text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if p_timing not in ('level_up', 'long_rest') then raise exception 'Invalid spell change timing'; end if;
  if not exists (select 1 from party_members pm where pm.id = p_party_member_id and
    (pm.user_id = auth.uid() or pm.owner_user_id = auth.uid() or private.is_campaign_dm(pm.campaign_id))) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  insert into spell_change_windows(party_member_id, source_class_id, change_timing, remaining_changes, opened_at)
  select p_party_member_id, cc.id, p_timing, policy.change_count, now()
  from character_classes cc
  join party_members pm on pm.id = cc.party_member_id
  join campaigns c on c.id = pm.campaign_id
  join class_spellcasting_policies policy on policy.ruleset = coalesce(c.ruleset, '2014')
    and policy.class_name = cc.class_name and policy.change_timing = p_timing
  where cc.party_member_id = p_party_member_id
  on conflict (party_member_id, source_class_id, change_timing) do update set
    remaining_changes = excluded.remaining_changes, opened_at = excluded.opened_at;
end;
$$;

create or replace function public.open_level_up_spell_window()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.levels > old.levels then
    insert into spell_change_windows(party_member_id, source_class_id, change_timing, remaining_changes, opened_at)
    select new.party_member_id, new.id, 'level_up', policy.change_count, now()
    from party_members pm join campaigns c on c.id = pm.campaign_id
    join class_spellcasting_policies policy on policy.ruleset = coalesce(c.ruleset, '2014')
      and policy.class_name = new.class_name and policy.change_timing = 'level_up'
    where pm.id = new.party_member_id
    on conflict (party_member_id, source_class_id, change_timing) do update set
      remaining_changes = excluded.remaining_changes, opened_at = excluded.opened_at;
  end if;
  return new;
end;
$$;

create trigger character_classes_open_spell_window
after insert or update of levels on public.character_classes
for each row execute function public.open_level_up_spell_window();

create or replace function public.change_prepared_spell(
  p_party_member_id uuid,
  p_source_class_id uuid,
  p_new_spell_id text,
  p_old_character_spell_id uuid default null
) returns public.character_spells
language plpgsql security definer set search_path = public
as $$
declare
  v_member party_members%rowtype;
  v_class character_classes%rowtype;
  v_policy class_spellcasting_policies%rowtype;
  v_window spell_change_windows%rowtype;
  v_old character_spells%rowtype;
  v_new character_spells%rowtype;
begin
  select * into strict v_member from party_members where id = p_party_member_id for update;
  if not (v_member.user_id = auth.uid() or v_member.owner_user_id = auth.uid() or private.is_campaign_dm(v_member.campaign_id)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into strict v_class from character_classes
    where id = p_source_class_id and party_member_id = p_party_member_id;
  select policy.* into strict v_policy from class_spellcasting_policies policy
    join campaigns c on c.id = v_member.campaign_id
    where policy.ruleset = coalesce(c.ruleset, '2014') and policy.class_name = v_class.class_name;
  select * into strict v_window from spell_change_windows
    where party_member_id = p_party_member_id and source_class_id = p_source_class_id
      and change_timing = v_policy.change_timing for update;
  if v_window.remaining_changes is not null and v_window.remaining_changes <= 0 then
    raise exception 'No % spell changes remaining', v_policy.change_timing;
  end if;

  if p_old_character_spell_id is not null then
    select * into strict v_old from character_spells
      where id = p_old_character_spell_id and party_member_id = p_party_member_id
        and source_class_id = p_source_class_id and source_type = 'class'
        and not always_prepared for update;
    if public.character_spell_level(v_old.spell_id) = 0 then raise exception 'Cantrips use their class level-up choice'; end if;
    delete from character_spells where id = v_old.id;
  elsif v_policy.change_count is not null then
    raise exception 'Choose a prepared spell to replace';
  end if;

  insert into character_spells
    (party_member_id, spell_id, is_known, is_prepared, always_prepared, source_type, source_class_id)
  values (p_party_member_id, p_new_spell_id, true, true, false, 'class', p_source_class_id)
  returning * into v_new;

  if v_window.remaining_changes is not null then
    update spell_change_windows set remaining_changes = remaining_changes - 1
    where party_member_id = p_party_member_id and source_class_id = p_source_class_id
      and change_timing = v_policy.change_timing;
  end if;
  return v_new;
exception when no_data_found then
  raise exception 'No active spell-change window for this class';
end;
$$;

revoke all on function public.open_spell_change_windows(uuid, text) from public, anon;
grant execute on function public.open_spell_change_windows(uuid, text) to authenticated;
revoke all on function public.change_prepared_spell(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.change_prepared_spell(uuid, uuid, text, uuid) to authenticated;
