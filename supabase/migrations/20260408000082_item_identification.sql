-- Add mundane (pre-identification) description to vault items
alter table items
  add column if not exists mundane_description text;

-- Track per-inventory-item identification status (default true = identified)
-- DM sets this to false for mystery items; players see only mundane_description until identified
alter table party_inventory
  add column if not exists is_identified boolean not null default true;
