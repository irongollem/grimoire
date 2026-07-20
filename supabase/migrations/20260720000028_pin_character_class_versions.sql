-- Character class rows retain a human-readable name, but also pin the exact
-- system/custom rules record so same-named third-party and edition variants do
-- not silently change beneath an existing character.
alter table public.character_classes
  add column if not exists class_definition_id uuid,
  add column if not exists class_definition_kind text,
  add constraint character_classes_definition_kind_check
    check (class_definition_kind is null or class_definition_kind in ('system', 'custom')),
  add constraint character_classes_definition_pair_check
    check ((class_definition_id is null) = (class_definition_kind is null));

update public.character_classes cc set
  class_definition_id = (
    select sc.id from public.party_members member
    join public.campaigns campaign on campaign.id = member.campaign_id
    join public.system_classes sc on sc.class_name = cc.class_name
      and sc.ruleset = coalesce(campaign.ruleset, '2014')
    where member.id = cc.party_member_id order by sc.created_at limit 1
  ),
  class_definition_kind = 'system'
where cc.class_definition_id is null and exists (
  select 1 from public.party_members member
  join public.campaigns campaign on campaign.id = member.campaign_id
  join public.system_classes sc on sc.class_name = cc.class_name
    and sc.ruleset = coalesce(campaign.ruleset, '2014')
  where member.id = cc.party_member_id
);

create index character_classes_definition_idx
  on public.character_classes(class_definition_kind, class_definition_id);

-- public.validate_character_class_definition and the
-- character_classes_validate_definition trigger that uses it are defined
-- once, authoritatively, in 20260720000036 (it needs the ruleset-review
-- columns added there). This migration only owns the columns/backfill/index
-- above.
