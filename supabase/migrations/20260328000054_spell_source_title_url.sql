-- Store the open5e document title and URL alongside the slug.
-- source_title: human-readable name ("Deep Magic 5e", "D&D SRD 5.1")
-- source_url:   product/document page for the clickable link
alter table spells
  add column if not exists source_title text,
  add column if not exists source_url   text;
