-- Migrate npcs.party_notes into the generic entity_notes table,
-- then drop the column. Migrated notes are non-private (they were always
-- intended as party-visible) and authored by the NPC's owner (the DM).
insert into entity_notes (user_id, entity_type, entity_id, content, is_private)
select
  user_id,
  'npc',
  id,
  party_notes,
  false
from npcs
where party_notes is not null
  and party_notes <> ''
  and party_notes <> '{"type":"doc","content":[]}';

alter table npcs drop column if exists party_notes;
