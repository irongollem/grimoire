-- Migration: character_classes_backfill
-- Copies the existing single-class state from party_members into the new
-- character_classes join table. Every existing character with a non-null class
-- gets one primary row; characters with no class stay unbacked (UI will keep
-- treating them as classless until the DM picks one).

insert into character_classes (
  party_member_id, class_name, subclass_name, levels, is_primary, hit_dice_used, sort_order
)
select
  pm.id,
  pm.class,
  pm.subclass,
  greatest(1, least(20, pm.level)),
  true,
  0,
  0
from party_members pm
where pm.class is not null
  and pm.class <> ''
  and not exists (
    select 1 from character_classes cc
    where cc.party_member_id = pm.id
  );
