-- Revised Sorcerer features belong to the exact official class definition,
-- not to unrelated homebrew that happens to reuse the class name.
create or replace function public.sorcerer_level(p_member public.party_members)
returns integer language sql stable set search_path = public as $$
  select coalesce(
    (select cc.levels from public.character_classes cc
      where cc.party_member_id = p_member.id
        and cc.class_name = 'Sorcerer'
        and coalesce(cc.class_definition_kind, 'system') = 'system'
      limit 1),
    case
      when p_member.class = 'Sorcerer'
        and not exists (select 1 from public.character_classes cc where cc.party_member_id = p_member.id)
      then p_member.level else 0
    end,
    0
  );
$$;

revoke all on function public.sorcerer_level(public.party_members) from public, anon, authenticated;
