-- Migration: fix_party_member_levels_view_security
-- Recreate view with security_invoker so RLS on party_members/character_classes is respected

create or replace view party_member_levels
  with (security_invoker = true)
as
select
  pm.id as party_member_id,
  coalesce(sum(cc.levels), pm.level) as total_level,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',         cc.id,
        'class',      cc.class_name,
        'subclass',   cc.subclass_name,
        'levels',     cc.levels,
        'is_primary', cc.is_primary,
        'sort_order', cc.sort_order
      ) order by cc.sort_order
    ) filter (where cc.id is not null),
    '[]'::jsonb
  ) as classes
from party_members pm
left join character_classes cc on cc.party_member_id = pm.id
group by pm.id, pm.level;
