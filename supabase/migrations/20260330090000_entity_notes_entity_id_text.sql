-- entity_id was uuid, which blocks SRD monster slugs (e.g. 'srd_goat').
-- Widen to text so any string identifier works.
alter table entity_notes
  alter column entity_id type text using entity_id::text;
