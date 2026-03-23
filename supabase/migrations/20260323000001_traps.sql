create table traps (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users(id) on delete cascade,
  name                text        not null,
  description         jsonb       default null,
  trap_type           text        not null default 'Mechanical',
  cr                  text        default null,
  trigger_type        text        default null,
  detection_dc        integer     default null,
  disarm_dc           integer     default null,
  effect_description  text        default null,
  save_type           text        default null,
  save_dc             integer     default null,
  attack_bonus        integer     default null,
  damage_dice         text        default null,
  damage_type         text        default null,
  reset_type          text        not null default 'None',
  image_url           text        default null,
  image_focal_point   jsonb       default null,
  tags                text[]      not null default '{}',
  notes               jsonb       default null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger traps_updated_at
  before update on traps
  for each row execute procedure update_updated_at();

alter table traps enable row level security;

create policy "traps_select" on traps for select using (auth.uid() = user_id);
create policy "traps_insert" on traps for insert with check (auth.uid() = user_id);
create policy "traps_update" on traps for update using (auth.uid() = user_id);
create policy "traps_delete" on traps for delete using (auth.uid() = user_id);
