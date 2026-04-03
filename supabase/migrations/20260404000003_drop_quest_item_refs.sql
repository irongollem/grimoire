-- Remove item-type rows from quest_refs now that they live in reward_item_ids.
delete from quest_refs where ref_type = 'item';
