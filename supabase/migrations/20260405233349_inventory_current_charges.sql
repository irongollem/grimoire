-- Track current (remaining) charges for magic items in player inventory
alter table party_inventory add column current_charges int null;
