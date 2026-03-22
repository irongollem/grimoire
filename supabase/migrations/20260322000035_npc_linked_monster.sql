alter table npcs add column linked_monster_id uuid null references monsters(id) on delete set null;
