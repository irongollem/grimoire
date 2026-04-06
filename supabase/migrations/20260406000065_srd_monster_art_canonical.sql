alter table srd_monster_art add column is_canonical boolean not null default false;

-- Allow all authenticated users to read canonical rows (previously restricted to own rows + campaign members)
create policy "srd_monster_art_canonical_select" on srd_monster_art
  for select using (is_canonical = true and auth.uid() is not null);
