-- Revised learned/prepared spells can only be exchanged through the atomic
-- replacement RPC. Removing a row and inserting another may not bypass its
-- level-up/Long-Rest window.
create or replace function public.delete_character_spells(
  p_party_member_id uuid,
  p_character_spell_id uuid default null,
  p_spell_id text default null,
  p_source_class_id uuid default null,
  p_source_type text default null
) returns integer language plpgsql security definer set search_path = public as $$
declare v_member public.party_members%rowtype; v_deleted integer;
begin
  select * into strict v_member from public.party_members where id = p_party_member_id for update;
  if not (v_member.user_id = auth.uid() or v_member.owner_user_id = auth.uid()
    or private.is_campaign_dm(v_member.campaign_id)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_character_spell_id is null and p_spell_id is null and p_source_type is null then
    raise exception 'An exact spell or grant source is required';
  end if;
  -- Cantrips are always available (change_prepared_spell rejects them, so a
  -- window would make them permanently unremovable) and Wizard-style
  -- spellbook classes learn/forget spells outside the window mechanism
  -- (only *preparing* a known spell is windowed, via set_character_spell_prepared).
  -- Only leveled known/prepared class spells need window protection here.
  if exists (
    select 1 from public.character_spells spell
    join public.character_classes cc on cc.id = spell.source_class_id
    join public.campaigns campaign on campaign.id = v_member.campaign_id
    join public.class_spellcasting_policies policy
      on policy.ruleset = coalesce(campaign.ruleset, '2014') and policy.class_name = cc.class_name
    where spell.party_member_id = p_party_member_id and spell.source_type = 'class'
      and coalesce(cc.class_definition_kind, 'system') = 'system'
      and policy.caster_type <> 'spellbook'
      and public.character_spell_level(spell.spell_id) > 0
      and (p_character_spell_id is null or spell.id = p_character_spell_id)
      and (p_spell_id is null or spell.spell_id = p_spell_id)
      and (p_source_class_id is null or spell.source_class_id = p_source_class_id)
      and (p_source_type is null or spell.source_type = p_source_type)
  ) then
    raise exception 'Revised class spells must be changed through their active replacement window';
  end if;
  -- An exact row id is already unambiguous; only when identification falls
  -- back to spell_id/source_type does a null p_source_class_id need to match
  -- solely ungrouped grants (source_class_id IS NULL) per the old client
  -- contract, rather than wildcard-matching the spell across every class a
  -- multiclass character has it granted through.
  delete from public.character_spells spell
  where spell.party_member_id = p_party_member_id
    and (p_character_spell_id is null or spell.id = p_character_spell_id)
    and (p_spell_id is null or spell.spell_id = p_spell_id)
    and (p_character_spell_id is not null
      or spell.source_class_id is not distinct from p_source_class_id)
    and (p_source_type is null or spell.source_type = p_source_type);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke delete on public.character_spells from authenticated;
revoke all on function public.delete_character_spells(uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.delete_character_spells(uuid, uuid, text, uuid, text) to authenticated;

-- De-level is an authorized atomic reversal and therefore retains internal
-- delete access after direct table DELETE is removed from authenticated users.
alter function public.apply_de_level(uuid, jsonb, jsonb, text[]) security definer;
alter function public.apply_de_level(uuid, jsonb, jsonb, text[]) set search_path = public;
