alter table items
  add column if not exists source_title text,
  add column if not exists source_url text;
