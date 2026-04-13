-- Migration: backgrounds
-- Playable character backgrounds (Acolyte, Outlander, etc.) with Open5e
-- runtime-sync support matching the pattern used by species / monsters /
-- spells. Compendium lives under the new Character Codex view.

create table backgrounds (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  name                   text not null,
  description            text,                -- Tiptap JSON or plain prose
  skill_proficiencies    text[] not null default '{}',
  tool_proficiencies     text[] not null default '{}',
  languages              text[] not null default '{}',
  equipment              text,                -- Free-text list (Open5e ships this as prose)
  feature_name           text,
  feature_description    text,
  suggested_characteristics text,             -- Personality traits / ideals / bonds / flaws block (Open5e prose)
  tags                   text[] not null default '{}',
  source                 text,                -- Open5e document slug when imported, else free text
  source_title           text,
  source_url             text,
  open5e_import          boolean not null default false,
  image_url              text,
  focal_point            jsonb,               -- { x, y }
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger backgrounds_updated_at
  before update on backgrounds
  for each row execute procedure update_updated_at();

alter table backgrounds enable row level security;

create policy "backgrounds_select" on backgrounds for select using (auth.uid() = user_id);
create policy "backgrounds_insert" on backgrounds for insert with check (auth.uid() = user_id);
create policy "backgrounds_update" on backgrounds for update using (auth.uid() = user_id);
create policy "backgrounds_delete" on backgrounds for delete using (auth.uid() = user_id);

-- Fast lookup for the sync de-dup pass
create index backgrounds_open5e_import_idx on backgrounds (user_id, open5e_import);
