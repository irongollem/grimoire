-- Migrate existing quest_refs (ref_type = 'item') into the new reward_item_ids column.
-- Rows are preserved in quest_refs but will no longer be shown in the UI.
update quests q
set reward_item_ids = (
  select array_agg(qr.ref_id order by qr.id)
  from quest_refs qr
  where qr.quest_id = q.id
    and qr.ref_type = 'item'
)
where exists (
  select 1
  from quest_refs qr
  where qr.quest_id = q.id
    and qr.ref_type = 'item'
);
