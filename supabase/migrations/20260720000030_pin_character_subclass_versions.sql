alter table public.character_classes add column if not exists subclass_definition_id uuid;

update public.character_classes cc set subclass_definition_id = (
  select definition.id from public.custom_subclasses definition
  join public.party_members member on member.id = cc.party_member_id
  join public.campaigns campaign on campaign.id = member.campaign_id
  where definition.class_name = cc.class_name and definition.subclass_name = cc.subclass_name
    and (definition.ruleset is null or definition.ruleset = coalesce(campaign.ruleset, '2014'))
    and (definition.campaign_id = member.campaign_id
      or (definition.campaign_id is null and definition.user_id in (member.user_id, member.owner_user_id)))
  order by (definition.source_document_key is null) desc, definition.created_at limit 1
) where cc.subclass_name is not null and cc.subclass_definition_id is null;

create index character_classes_subclass_definition_idx
  on public.character_classes(subclass_definition_id);

-- public.validate_character_subclass_definition and the
-- character_classes_validate_subclass_definition trigger that uses it are
-- defined once, authoritatively, in 20260720000036 (it needs the
-- ruleset-review columns added there). This migration only owns the
-- column/backfill/index above.
