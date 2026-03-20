-- ─────────────────────────────────────────────────────────────────────────────
-- Crafting recipes
-- ─────────────────────────────────────────────────────────────────────────────
create table crafting_recipes (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  campaign_id        uuid        not null references campaigns(id) on delete cascade,
  name               text        not null default '',
  description        text        not null default '',
  discipline         text        not null default 'smithing',
  dc                 integer     not null default 10,
  crafting_time_days integer     not null default 1,
  output_item_id     uuid        references items(id) on delete set null,
  output_quantity    integer     not null default 1,
  is_player_visible  boolean     not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger crafting_recipes_updated_at
  before update on crafting_recipes
  for each row execute procedure update_updated_at();

alter table crafting_recipes enable row level security;

-- DM (owner) full CRUD
create policy "crafting_recipes_select" on crafting_recipes
  for select using (auth.uid() = user_id);
create policy "crafting_recipes_insert" on crafting_recipes
  for insert with check (auth.uid() = user_id);
create policy "crafting_recipes_update" on crafting_recipes
  for update using (auth.uid() = user_id);
create policy "crafting_recipes_delete" on crafting_recipes
  for delete using (auth.uid() = user_id);

-- Players can see player-visible recipes OR ones granted to their party member
create policy "crafting_recipes_select_player" on crafting_recipes
  for select using (
    is_campaign_member(campaign_id) AND (
      is_player_visible = true
      OR id IN (
        select recipe_id from crafting_recipe_grants
        where party_member_id in (
          select id from party_members
          where user_id = auth.uid() and campaign_id = crafting_recipes.campaign_id
        )
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Crafting recipe ingredients (actual items from the vault)
-- ─────────────────────────────────────────────────────────────────────────────
create table crafting_recipe_ingredients (
  id         uuid    primary key default gen_random_uuid(),
  recipe_id  uuid    not null references crafting_recipes(id) on delete cascade,
  item_id    uuid    not null references items(id) on delete cascade,
  quantity   integer not null default 1
);

alter table crafting_recipe_ingredients enable row level security;

create policy "crafting_recipe_ingredients_select" on crafting_recipe_ingredients
  for select using (
    recipe_id in (select id from crafting_recipes)
  );
create policy "crafting_recipe_ingredients_insert" on crafting_recipe_ingredients
  for insert with check (
    recipe_id in (select id from crafting_recipes where user_id = auth.uid())
  );
create policy "crafting_recipe_ingredients_delete" on crafting_recipe_ingredients
  for delete using (
    recipe_id in (select id from crafting_recipes where user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Crafting recipe modifiers (conditional bonuses, e.g. "Full forge available +2")
-- ─────────────────────────────────────────────────────────────────────────────
create table crafting_recipe_modifiers (
  id          uuid    primary key default gen_random_uuid(),
  recipe_id   uuid    not null references crafting_recipes(id) on delete cascade,
  description text    not null default '',
  bonus       integer not null default 0
);

alter table crafting_recipe_modifiers enable row level security;

create policy "crafting_recipe_modifiers_select" on crafting_recipe_modifiers
  for select using (
    recipe_id in (select id from crafting_recipes)
  );
create policy "crafting_recipe_modifiers_insert" on crafting_recipe_modifiers
  for insert with check (
    recipe_id in (select id from crafting_recipes where user_id = auth.uid())
  );
create policy "crafting_recipe_modifiers_delete" on crafting_recipe_modifiers
  for delete using (
    recipe_id in (select id from crafting_recipes where user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Recipe grants — DM shares a specific recipe with a specific party member
-- ─────────────────────────────────────────────────────────────────────────────
create table crafting_recipe_grants (
  recipe_id       uuid        not null references crafting_recipes(id) on delete cascade,
  party_member_id uuid        not null references party_members(id) on delete cascade,
  granted_at      timestamptz not null default now(),
  primary key (recipe_id, party_member_id)
);

alter table crafting_recipe_grants enable row level security;

create policy "crafting_recipe_grants_select" on crafting_recipe_grants
  for select using (
    recipe_id in (select id from crafting_recipes)
    or party_member_id in (select id from party_members where user_id = auth.uid())
  );
create policy "crafting_recipe_grants_insert" on crafting_recipe_grants
  for insert with check (
    recipe_id in (select id from crafting_recipes where user_id = auth.uid())
  );
create policy "crafting_recipe_grants_delete" on crafting_recipe_grants
  for delete using (
    recipe_id in (select id from crafting_recipes where user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Ruined item flag on party inventory
-- ─────────────────────────────────────────────────────────────────────────────
alter table party_inventory
  add column if not exists is_ruined boolean not null default false;
