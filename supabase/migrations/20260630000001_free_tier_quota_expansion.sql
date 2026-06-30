-- Migration: free_tier_quota_expansion
-- Version-control the full free-plan quota set (previously only the soundboard
-- keys were seeded in a migration; the rest lived only in live DB state) and
-- extend quota enforcement to six narrative entities so free-tier limits apply
-- uniformly across the app AND the read/write MCP server.

-- ── 1. Extend check_quota's resource_type allowlist ───────────────────────────
-- check_quota counts `select count(*) from <resource_type> where user_id = ...`
-- via dynamic SQL, so the allowlist is the guard against arbitrary table scans.
-- The keys are table names; add the six new narrative tables.

create or replace function "public"."check_quota"("resource_type" "text") returns "jsonb"
    language "plpgsql" security definer
    set "search_path" to 'public'
    as $_$
declare
  v_quotas  jsonb;
  v_limit   int;
  v_current int;
begin
  -- App admins are always unlimited — short-circuit before any DB work
  if (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' then
    return jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true);
  end if;

  -- Validate resource_type to prevent arbitrary table scanning via dynamic SQL
  if resource_type not in (
    'campaigns', 'npcs', 'monsters', 'encounters', 'scriptorium_documents', 'notes',
    'sounds', 'soundboard_pages', 'soundboard_playlists',
    'quests', 'factions', 'locations', 'deities', 'pantheons', 'puzzle_rooms'
  ) then
    raise exception 'invalid resource_type: %', resource_type;
  end if;

  -- Look up the user's plan quotas; default to free if no subscription row exists
  select p.quotas
    into v_quotas
    from user_subscriptions s
    join plans p on p.id = s.plan_id
   where s.user_id = auth.uid()
     and s.status in ('active', 'trialing');

  if not found then
    select quotas into v_quotas from plans where id = 'free';
  end if;

  -- Missing key in quotas JSONB = unlimited (pro plan has empty {})
  if not (v_quotas ? resource_type) then
    return jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true);
  end if;

  v_limit := (v_quotas ->> resource_type)::int;

  -- Count the user's current rows in the relevant table
  execute format('select count(*) from %I where user_id = $1', resource_type)
    into v_current using auth.uid();

  return jsonb_build_object(
    'allowed',   v_current < v_limit,
    'current',   v_current,
    'limit',     v_limit,
    'unlimited', false
  );
end;
$_$;

-- ── 2. Enforce quota on insert for the six narrative tables ───────────────────
-- enforce_quota() (defined in the initial schema) calls check_quota(TG_TABLE_NAME)
-- and raises 'quota_exceeded' when over limit. Trigger functions need no grants.

create or replace trigger "quests_enforce_quota"
  before insert on "public"."quests"
  for each row execute function "public"."enforce_quota"();

create or replace trigger "factions_enforce_quota"
  before insert on "public"."factions"
  for each row execute function "public"."enforce_quota"();

create or replace trigger "locations_enforce_quota"
  before insert on "public"."locations"
  for each row execute function "public"."enforce_quota"();

create or replace trigger "deities_enforce_quota"
  before insert on "public"."deities"
  for each row execute function "public"."enforce_quota"();

create or replace trigger "pantheons_enforce_quota"
  before insert on "public"."pantheons"
  for each row execute function "public"."enforce_quota"();

create or replace trigger "puzzle_rooms_enforce_quota"
  before insert on "public"."puzzle_rooms"
  for each row execute function "public"."enforce_quota"();

-- ── 3. Seed the canonical free-plan quotas ────────────────────────────────────
-- Single source of truth in version control, so a db-reset / fresh branch / new
-- environment reproduces the limits instead of silently treating every resource
-- as unlimited. Existing values win (admin overrides preserved); only missing
-- keys are filled. The right operand of `||` wins, so put live quotas on the right.

update "public"."plans"
set quotas = jsonb_build_object(
      'campaigns',             1,
      'npcs',                  10,
      'notes',                 10,
      'monsters',              3,
      'encounters',            5,
      'scriptorium_documents', 3,
      'sounds',                20,
      'soundboard_pages',      1,
      'soundboard_playlists',  3,
      'quests',                10,
      'locations',             10,
      'factions',              5,
      'deities',               5,
      'pantheons',             3,
      'puzzle_rooms',          5
    ) || coalesce(quotas, '{}'::jsonb)
where id = 'free';

-- Pro & tester stay unlimited (empty quotas = every key missing = unlimited).
-- Defensive: ensure they exist with empty quotas rather than NULL.
update "public"."plans" set quotas = '{}'::jsonb where id in ('pro', 'tester') and quotas is null;
