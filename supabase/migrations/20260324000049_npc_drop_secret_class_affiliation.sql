-- Merge DM secret into notes (preserve secret content where notes is empty),
-- then drop the secret, class, and affiliation columns.
-- class: replaced by occupation (story role) — class was redundant and spoiled D&D mechanics to players
-- affiliation: replaced by the factions system (npc_faction_memberships table)
-- secret: merged into notes (single DM notes field is sufficient)

-- Preserve existing secret content where notes is currently empty
update npcs
  set notes = secret
  where secret is not null and (notes is null or notes = '');

alter table npcs drop column if exists secret;
alter table npcs drop column if exists class;
alter table npcs drop column if exists affiliation;
