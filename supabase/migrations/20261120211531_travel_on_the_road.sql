-- Travel, the rest of the road (#1222, stories 5, 12, 13 and the players' roads).
--
-- 1. Terrain and ways of travelling (decision 9, stories 12 and 13). How fast a party goes is one formula: miles an
--    hour = speed in feet / 10 x pace x terrain, over 8 hours a day (24 for a ship that sails through the night),
--    with the books as presets (`src/rules/travelSpeed.ts`): road and open country x1, difficult x1/2 (PHB), snow
--    x1/3 with sinking x1/4 on foot and x1/2 on snowshoes (Rime of the Frostmaiden's Overland Travel table), the
--    PHB ships and the 2024 airship by the hour. A road has a terrain, which is its own and not read from its kind
--    (a river may run fast or slow, a track may be good or bad). The presets live in code; a campaign keeps only
--    what it changes or adds: `travel_terrains` and `travel_ways`, each a preset's key when it overrides that
--    preset, or a key of its own. A way may be carried or pulled by a companion, whose walking speed is its
--    speed (the maintainer's axe beak pulling a sled), and may be at home on terrains, which then slow it not at
--    all. `campaigns.open_land_terrain` is what lies between places with no road: a journey across a map goes over
--    it (difficult going, as Off the Road always counted it; snow for Icewind Dale).
--
-- 2. Hunger (story 5). With the optional rule `rations` on, a character who sets out without food counts the days
--    in a row they have gone without, because that run, not the day's meal, is what costs them Exhaustion by the
--    book (2014 PHB "Food and Water", 2024 PHB "Malnutrition"). A day of eating sets it back to 0. It lives on the
--    character, beside the conditions it turns into; with the rule off nothing writes it. No hunger meter and no new
--    condition: the count only explains the next level of Exhaustion.
--
-- 3. What a player reads of a road (story 1's last part). A road is the DM's (`location_roads` RLS is DM-only), but
--    a player who knows both towns knows the road between them: the projection returns a road only when both its
--    places are shown to that player (`locations.player_visible_to`), and never the road's encounter table or who
--    drew it. It is the same reader the World Web uses (`private.world_ties_reader`): a stranger is refused, a DM
--    may preview one of the campaign's own characters and sees what that character would.

-- ── 1. Terrain and ways of travelling ──────────────────────────────────────────
alter table public.location_roads
  add column terrain text not null default 'road' check (terrain ~ '^[a-z0-9_]{1,40}$');

comment on column public.location_roads.terrain is
  'The going underfoot: a preset terrain key (road, open, difficult, sand, snow) or one of the campaign''s own (travel_terrains).';

alter table public.campaigns
  add column open_land_terrain text not null default 'difficult' check (open_land_terrain ~ '^[a-z0-9_]{1,40}$');

comment on column public.campaigns.open_land_terrain is
  'The terrain between places with no road, which a journey measured across a map goes over (#1222).';

create table public.travel_terrains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- A preset's key (overriding it) or one of the campaign's own.
  key text not null check (key ~ '^[a-z0-9_]{1,40}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- What it does to everyone's speed, and on top to those who walk or ride on it.
  factor numeric(6, 4) not null check (factor > 0 and factor <= 4),
  sink numeric(6, 4) not null default 1 check (sink > 0 and sink <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint travel_terrains_one_per_key unique (campaign_id, key)
);

comment on table public.travel_terrains is
  'A campaign''s own terrains for travel, and its overrides of the preset ones by key (#1222 decision 9).';

create table public.travel_ways (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{1,40}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('foot', 'ride', 'vehicle', 'water', 'air')),
  -- Its speed: in feet, in miles an hour, or its companion's walking speed. A way with none cannot be travelled.
  speed_feet integer check (speed_feet is null or speed_feet between 1 and 1000),
  mph numeric(7, 2) check (mph is null or (mph > 0 and mph <= 10000)),
  companion_id uuid references public.companions (id) on delete set null,
  at_home text[] not null default '{}',
  -- Sinking it suffers instead of a terrain's own, by terrain key ({"snow": 0.5} for snowshoes).
  sink jsonb not null default '{}'::jsonb check (jsonb_typeof(sink) = 'object'),
  through_the_night boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint travel_ways_one_per_key unique (campaign_id, key)
);

comment on table public.travel_ways is
  'A campaign''s own ways of travelling (mounts, sleds, ships, flyers), and its overrides of the preset ones by key (#1222 decision 9).';

create index travel_terrains_user_id_idx on public.travel_terrains (user_id);
create index travel_ways_user_id_idx on public.travel_ways (user_id);
create index travel_ways_companion_id_idx on public.travel_ways (companion_id);

create trigger travel_terrains_updated_at
  before update on public.travel_terrains
  for each row execute procedure update_updated_at();
create trigger travel_ways_updated_at
  before update on public.travel_ways
  for each row execute procedure update_updated_at();

create trigger travel_terrains_guard_content_author
  before update on public.travel_terrains
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger travel_ways_guard_content_author
  before update on public.travel_ways
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

-- The companion that pulls or carries a way is one of the campaign's own.
create trigger zz_same_campaign_refs
  before insert or update of companion_id, campaign_id
  on public.travel_ways
  for each row execute procedure private.enforce_same_campaign_refs('companion_id', 'companions', 'owned');

-- The campaign's DMs, like its roads.
alter table public.travel_terrains enable row level security;
create policy "travel_terrains_select" on public.travel_terrains for select using (private.is_campaign_dm(campaign_id));
create policy "travel_terrains_insert" on public.travel_terrains for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "travel_terrains_update" on public.travel_terrains for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "travel_terrains_delete" on public.travel_terrains for delete using (private.is_campaign_dm(campaign_id));

alter table public.travel_ways enable row level security;
create policy "travel_ways_select" on public.travel_ways for select using (private.is_campaign_dm(campaign_id));
create policy "travel_ways_insert" on public.travel_ways for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "travel_ways_update" on public.travel_ways for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "travel_ways_delete" on public.travel_ways for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.travel_terrains to authenticated, service_role;
grant select, insert, update, delete on public.travel_ways to authenticated, service_role;

create trigger travel_terrains_signal_insert after insert on public.travel_terrains
  referencing new table as changed for each statement execute procedure public.signal_campaign_change();
create trigger travel_terrains_signal_update after update on public.travel_terrains
  referencing old table as left_rows new table as changed for each statement execute procedure public.signal_campaign_change();
create trigger travel_terrains_signal_delete after delete on public.travel_terrains
  referencing old table as changed for each statement execute procedure public.signal_campaign_change();
create trigger travel_ways_signal_insert after insert on public.travel_ways
  referencing new table as changed for each statement execute procedure public.signal_campaign_change();
create trigger travel_ways_signal_update after update on public.travel_ways
  referencing old table as left_rows new table as changed for each statement execute procedure public.signal_campaign_change();
create trigger travel_ways_signal_delete after delete on public.travel_ways
  referencing old table as changed for each statement execute procedure public.signal_campaign_change();

-- The demo campaign's travel is copied with it; a way's companion is remapped with the companions.
insert into private.demo_campaign_tables (table_name, tier, copy, reason) values
  ('travel_terrains', 1, true, null),
  ('travel_ways', 1, true, null);

-- ── 2. Days without food ───────────────────────────────────────────────────────
alter table public.party_members
  add column days_without_food smallint not null default 0 check (days_without_food between 0 and 365);

comment on column public.party_members.days_without_food is
  'Days in a row this character has gone without food on the road (optional rule rations); 0 once they eat.';

-- ── 3. The roads a player knows ────────────────────────────────────────────────
create function private.player_roads(p_campaign_id uuid, p_member uuid)
returns table (
  id uuid,
  from_location_id uuid,
  to_location_id uuid,
  distance numeric,
  unit text,
  name text,
  going text,
  terrain text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.from_location_id, r.to_location_id, r.distance, r.unit, r.name, r.going, r.terrain
  from public.location_roads r
  join public.locations a on a.id = r.from_location_id
  join public.locations b on b.id = r.to_location_id
  where r.campaign_id = p_campaign_id
    and p_member is not null
    and p_member = any(a.player_visible_to)
    and p_member = any(b.player_visible_to);
$$;
revoke execute on function private.player_roads(uuid, uuid) from public, anon, authenticated;

create function public.get_player_roads(p_campaign_id uuid, p_preview_member_id uuid default null)
returns table (
  id uuid,
  from_location_id uuid,
  to_location_id uuid,
  distance numeric,
  unit text,
  name text,
  going text,
  terrain text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Refuses a stranger (42501) and a preview of another campaign's character (22023) before anything is read.
  v_member uuid := private.world_ties_reader(p_campaign_id, p_preview_member_id);
begin
  return query select * from private.player_roads(p_campaign_id, v_member);
end;
$$;
revoke execute on function public.get_player_roads(uuid, uuid) from public, anon;
grant execute on function public.get_player_roads(uuid, uuid) to authenticated, service_role;

comment on function public.get_player_roads(uuid, uuid) is
  'The roads a player knows: those whose two places are both shown to them. No encounter table, no author.';
