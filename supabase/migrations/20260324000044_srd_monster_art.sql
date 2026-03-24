create table srd_monster_art (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id),
  srd_id       text not null,
  image_url    text,
  card_art_url text,
  updated_at   timestamptz not null default now(),
  unique (user_id, srd_id)
);

create trigger srd_monster_art_updated_at
  before update on srd_monster_art
  for each row execute procedure update_updated_at();

alter table srd_monster_art enable row level security;

create policy "srd_monster_art_select" on srd_monster_art for select using (auth.uid() = user_id);
create policy "srd_monster_art_insert" on srd_monster_art for insert with check (auth.uid() = user_id);
create policy "srd_monster_art_update" on srd_monster_art for update using (auth.uid() = user_id);
create policy "srd_monster_art_delete" on srd_monster_art for delete using (auth.uid() = user_id);
