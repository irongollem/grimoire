-- Quest reward items: move from quest_refs (ref_type='item') to a first-class
-- uuid[] array on the quest row, consistent with encounter loot (item_ids[]).
alter table quests
  add column if not exists reward_item_ids uuid[] not null default '{}';
