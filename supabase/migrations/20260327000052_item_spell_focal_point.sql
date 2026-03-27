alter table items  add column if not exists image_focal_point jsonb default null;
alter table spells add column if not exists image_focal_point jsonb default null;
