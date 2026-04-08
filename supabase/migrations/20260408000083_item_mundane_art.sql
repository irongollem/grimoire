-- Separate "mundane" artwork shown to players before an item is identified
alter table items
  add column if not exists mundane_image_url text,
  add column if not exists mundane_image_focal_point jsonb;
