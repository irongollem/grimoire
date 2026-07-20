-- Preserve the chosen spell concept when a campaign changes edition, while
-- never silently treating an incompatible or missing counterpart as the new
-- rules text.
alter table public.character_spells
  add column if not exists ruleset_review_required boolean not null default false;

create or replace function public.remap_character_spells_for_campaign_ruleset()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ruleset is not distinct from old.ruleset then return new; end if;

  update public.character_spells grant_row set
    spell_id = target.id,
    ruleset_review_required = false
  from public.party_members member
  join public.srd_spells current_spell on true
  join public.srd_spells target
    on target.conceptual_key = current_spell.conceptual_key
    and target.ruleset = new.ruleset
    and target.level = current_spell.level
  where member.id = grant_row.party_member_id
    and member.campaign_id = new.id
    and current_spell.id = grant_row.spell_id
    and current_spell.ruleset is distinct from new.ruleset
    and 1 = (
      select count(*) from public.srd_spells candidate
      where candidate.conceptual_key = current_spell.conceptual_key
        and candidate.ruleset = new.ruleset
        and candidate.level = current_spell.level
    )
    and (
      grant_row.source_type <> 'class'
      or grant_row.always_prepared
      or exists (
        select 1 from public.character_classes source_class
        where source_class.id = grant_row.source_class_id
          and source_class.class_name = any(coalesce(target.classes, '{}'::text[]))
      )
    )
    and not exists (
      select 1 from public.character_spells duplicate
      where duplicate.party_member_id = grant_row.party_member_id
        and duplicate.spell_id = target.id
        and duplicate.source_type = grant_row.source_type
        and coalesce(duplicate.source_class_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(grant_row.source_class_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and duplicate.id <> grant_row.id
    );

  update public.character_spells grant_row set ruleset_review_required = case
    when exists (
      select 1 from public.srd_spells spell
      where spell.id = grant_row.spell_id and spell.ruleset = new.ruleset
    ) then false
    when exists (
      select 1 from public.spells spell
      where spell.id::text = grant_row.spell_id
        and (spell.ruleset is null or spell.ruleset = new.ruleset)
    ) then false
    else true
  end
  from public.party_members member
  where member.id = grant_row.party_member_id and member.campaign_id = new.id;

  return new;
end;
$$;

create trigger campaigns_remap_character_spells_ruleset
after update of ruleset on public.campaigns
for each row execute function public.remap_character_spells_for_campaign_ruleset();

revoke all on function public.remap_character_spells_for_campaign_ruleset()
  from public, anon, authenticated;

create or replace function public.acknowledge_character_spell_ruleset_review(
  p_character_spell_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.character_spells spell set ruleset_review_required = false
  from public.party_members member
  where spell.id = p_character_spell_id and member.id = spell.party_member_id
    and (member.user_id = auth.uid() or member.owner_user_id = auth.uid()
      or private.is_campaign_dm(member.campaign_id));
  if not found then
    raise exception 'Character spell not found or not authorized' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.acknowledge_character_spell_ruleset_review(uuid)
  from public, anon;
grant execute on function public.acknowledge_character_spell_ruleset_review(uuid)
  to authenticated;
