-- Species (playable races) table
create table species (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,          -- Tiptap JSON
  notes       text,          -- Tiptap JSON (DM-only)
  size        text,          -- 'tiny' | 'small' | 'medium' | 'large'
  speed       jsonb,         -- { walk, fly, swim, climb, burrow } all in ft
  ability_score_increases jsonb, -- flexible, e.g. { "str": 2, "choice": 1 } or desc string
  traits      jsonb,         -- Array<{ name, description }>
  languages   text[],
  tags        text[],
  source      text,
  subraces    jsonb,         -- Array<{ name, description, traits: Array<{name,description}> }>
  image_url   text,
  focal_point jsonb,         -- { x, y }
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger species_updated_at
  before update on species
  for each row execute procedure update_updated_at();

alter table species enable row level security;

create policy "species_select" on species for select using (auth.uid() = user_id);
create policy "species_insert" on species for insert with check (auth.uid() = user_id);
create policy "species_update" on species for update using (auth.uid() = user_id);
create policy "species_delete" on species for delete using (auth.uid() = user_id);
