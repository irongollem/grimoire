-- quest_player_notes is superseded by the generic entity_notes table.
-- All data has been migrated; drop the legacy table.

drop table if exists quest_player_notes;
