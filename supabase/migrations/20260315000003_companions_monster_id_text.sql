-- SRD monsters use slug IDs (e.g. "srd_adult_gold_dragon"), not UUIDs.
-- Drop the FK and widen source_monster_id to text so both SRD slugs
-- and custom-monster UUIDs can be stored.

alter table companions
  drop constraint companions_source_monster_id_fkey;

alter table companions
  alter column source_monster_id type text;
