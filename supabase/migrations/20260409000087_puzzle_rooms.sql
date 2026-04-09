create table puzzle_rooms (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users(id) on delete cascade,
  name                text        not null,
  puzzle_type         text        not null default 'Logic',
  difficulty          text        not null default 'Medium',
  description         text        default null,
  solution            text        default null,
  hints               jsonb       not null default '[]',
  skill_checks        jsonb       not null default '[]',
  success_outcome     text        default null,
  failure_consequence text        default null,
  image_url           text        default null,
  image_focal_point   jsonb       default null,
  tags                text[]      not null default '{}',
  notes               text        default null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger puzzle_rooms_updated_at
  before update on puzzle_rooms
  for each row execute procedure update_updated_at();

alter table puzzle_rooms enable row level security;

create policy "puzzle_rooms_select" on puzzle_rooms for select using (auth.uid() = user_id);
create policy "puzzle_rooms_insert" on puzzle_rooms for insert with check (auth.uid() = user_id);
create policy "puzzle_rooms_update" on puzzle_rooms for update using (auth.uid() = user_id);
create policy "puzzle_rooms_delete" on puzzle_rooms for delete using (auth.uid() = user_id);
