-- Migration: npc_inventory_and_character_classes_unique
-- Codebase-wide duplicate-risk sweep (same class as the store_items bug):
-- both tables relied on client-side state as the only duplicate guard, so a
-- failed read or double-submit silently duplicated rows.
--
-- 1. npc_inventory: merge existing duplicate (npc_id, item_id) stacks into one
--    row (summing quantity), then enforce uniqueness. Partial index — item_id
--    is nullable for free-text entries, which may legitimately repeat.
-- 2. character_classes: a member can never have two rows for the same class.

-- ── 1. npc_inventory ──────────────────────────────────────────────────────────

with dupes as (
  select npc_id, item_id,
         (array_agg(id order by updated_at, id))[1] as keep_id,
         sum(quantity) as total
  from npc_inventory
  where item_id is not null
  group by npc_id, item_id
  having count(*) > 1
)
update npc_inventory ni
set quantity = d.total
from dupes d
where ni.id = d.keep_id;

with dupes as (
  select npc_id, item_id,
         (array_agg(id order by updated_at, id))[1] as keep_id
  from npc_inventory
  where item_id is not null
  group by npc_id, item_id
  having count(*) > 1
)
delete from npc_inventory ni
using dupes d
where ni.npc_id = d.npc_id
  and ni.item_id = d.item_id
  and ni.id <> d.keep_id;

create unique index npc_inventory_npc_item_unique
  on npc_inventory (npc_id, item_id)
  where item_id is not null;

-- ── 2. character_classes ──────────────────────────────────────────────────────

alter table character_classes
  add constraint character_classes_member_class_unique unique (party_member_id, class_name);
