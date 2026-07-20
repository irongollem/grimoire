-- Same-named custom classes use their own class definition and never inherit
-- an official 2024 replacement window by name alone.
create or replace function public.open_spell_change_windows(p_party_member_id uuid, p_timing text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_timing not in ('level_up', 'long_rest') then raise exception 'Invalid spell change timing'; end if;
  -- Mirrors take_spellcasting_rest's check, including campaign_members
  -- collaborators, since the rest RPC delegates window opening here.
  if not exists (select 1 from party_members pm where pm.id = p_party_member_id and
    (pm.user_id = auth.uid() or pm.owner_user_id = auth.uid() or private.is_campaign_dm(pm.campaign_id)
      or exists (select 1 from public.campaign_members cm
        where cm.user_id = auth.uid() and cm.party_member_id = pm.id))) then
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
    and coalesce(cc.class_definition_kind, 'system') = 'system'
  on conflict (party_member_id, source_class_id, change_timing) do update set
    remaining_changes = excluded.remaining_changes, opened_at = excluded.opened_at;
end;
$$;

-- Lifecycle: a class's preparation window is opened here (creation, and every
-- level-up for the level_up-timing case), reopened each long rest by
-- take_spellcasting_rest (long_rest-timing case), and closed by
-- cast_character_spell_v4 once a non-cantrip spell is cast from a slot
-- (long_rest-timing case only — the "period" between rests has ended).
create or replace function public.open_level_up_spell_window()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' or new.levels > old.levels)
    and coalesce(new.class_definition_kind, 'system') = 'system' then
    -- A brand-new class row (INSERT) opens whichever window its policy
    -- defines, level_up or long_rest — a long_rest-timing caster (Cleric,
    -- Wizard, ...) must be able to prepare before ever taking a rest.
    -- A level-up (levels increasing on an existing row) only ever refreshes
    -- the level_up-timing window; long_rest windows are rest/cast-owned.
    insert into spell_change_windows(party_member_id, source_class_id, change_timing, remaining_changes, opened_at)
    select new.party_member_id, new.id, policy.change_timing, policy.change_count, now()
    from party_members pm join campaigns c on c.id = pm.campaign_id
    join class_spellcasting_policies policy on policy.ruleset = coalesce(c.ruleset, '2014')
      and policy.class_name = new.class_name
      and (policy.change_timing = 'level_up' or tg_op = 'INSERT')
    where pm.id = new.party_member_id
    on conflict (party_member_id, source_class_id, change_timing) do update set
      remaining_changes = excluded.remaining_changes, opened_at = excluded.opened_at;
  end if;
  return new;
end;
$$;

-- One-time backfill: existing character_classes rows created before this
-- migration only ever got a level_up-timing window (or none at all, for
-- long_rest-timing classes) at creation. Open whichever window each row's
-- policy defines now; never touch a window that already exists (it may
-- already be partially consumed).
insert into public.spell_change_windows(party_member_id, source_class_id, change_timing, remaining_changes, opened_at)
select cc.party_member_id, cc.id, policy.change_timing, policy.change_count, now()
from public.character_classes cc
join public.party_members pm on pm.id = cc.party_member_id
join public.campaigns c on c.id = pm.campaign_id
join public.class_spellcasting_policies policy on policy.ruleset = coalesce(c.ruleset, '2014')
  and policy.class_name = cc.class_name
where coalesce(cc.class_definition_kind, 'system') = 'system'
on conflict (party_member_id, source_class_id, change_timing) do nothing;

create or replace function public.change_prepared_spell(
  p_party_member_id uuid, p_source_class_id uuid, p_new_spell_id text,
  p_old_character_spell_id uuid default null
) returns public.character_spells
language plpgsql security definer set search_path = public as $$
declare
  v_member party_members%rowtype; v_class character_classes%rowtype;
  v_policy class_spellcasting_policies%rowtype; v_window spell_change_windows%rowtype;
  v_old character_spells%rowtype; v_new character_spells%rowtype;
begin
  select * into strict v_member from party_members where id = p_party_member_id for update;
  if not (v_member.user_id = auth.uid() or v_member.owner_user_id = auth.uid()
    or private.is_campaign_dm(v_member.campaign_id)) then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into strict v_class from character_classes
    where id = p_source_class_id and party_member_id = p_party_member_id
      and coalesce(class_definition_kind, 'system') = 'system';
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
    select * into strict v_old from character_spells where id = p_old_character_spell_id
      and party_member_id = p_party_member_id and source_class_id = p_source_class_id
      and source_type = 'class' and not always_prepared for update;
    if public.character_spell_level(v_old.spell_id) = 0 then raise exception 'Cantrips use their class level-up choice'; end if;
    delete from character_spells where id = v_old.id;
  elsif v_policy.change_count is not null then raise exception 'Choose a prepared spell to replace'; end if;
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
exception when no_data_found then raise exception 'No active spell-change window for this class';
end;
$$;

revoke all on function public.open_level_up_spell_window() from public, anon, authenticated;

create or replace function public.set_character_spell_prepared(
  p_character_spell_id uuid,
  p_is_prepared boolean
) returns public.character_spells
language plpgsql security definer set search_path = public as $$
declare
  v_spell public.character_spells%rowtype;
  v_member public.party_members%rowtype;
  v_class public.character_classes%rowtype;
  v_policy public.class_spellcasting_policies%rowtype;
begin
  select * into strict v_spell from public.character_spells where id = p_character_spell_id for update;
  select * into strict v_member from public.party_members where id = v_spell.party_member_id for update;
  if not (v_member.user_id = auth.uid() or v_member.owner_user_id = auth.uid()
    or private.is_campaign_dm(v_member.campaign_id)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_spell.source_type <> 'class' or v_spell.source_class_id is null then
    raise exception 'Only class spells can be prepared';
  end if;
  if v_spell.always_prepared then raise exception 'Always-prepared spells cannot be changed'; end if;
  if public.character_spell_level(v_spell.spell_id) = 0 then raise exception 'Cantrips are always available'; end if;

  select * into strict v_class from public.character_classes
  where id = v_spell.source_class_id and party_member_id = v_member.id;
  if coalesce(v_class.class_definition_kind, 'system') = 'system' then
    select policy.* into v_policy
    from public.class_spellcasting_policies policy
    join public.campaigns campaign on campaign.id = v_member.campaign_id
    where policy.ruleset = coalesce(campaign.ruleset, '2014')
      and policy.class_name = v_class.class_name;
  end if;

  if v_policy.ruleset is not null then
    if v_policy.caster_type <> 'spellbook' then
      raise exception 'This class changes prepared spells by replacement';
    end if;
    if not exists (
      -- "window" is a reserved SQL keyword and cannot be used as an unquoted
      -- alias (causes a syntax error at "where").
      select 1 from public.spell_change_windows scw
      where scw.party_member_id = v_member.id
        and scw.source_class_id = v_spell.source_class_id
        and scw.change_timing = v_policy.change_timing
    ) then
      raise exception 'No active % preparation window for this class', v_policy.change_timing;
    end if;
  end if;

  perform set_config('app.preparation_change_spell_id', v_spell.id::text, true);
  update public.character_spells set is_prepared = p_is_prepared
  where id = v_spell.id returning * into v_spell;
  return v_spell;
end;
$$;

revoke all on function public.set_character_spell_prepared(uuid, boolean) from public, anon;
grant execute on function public.set_character_spell_prepared(uuid, boolean) to authenticated;
