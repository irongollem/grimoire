-- Migration: soundboard_free_tier_quotas
-- Add quota enforcement for sounds, soundboard_pages, and soundboard_playlists; gate uploads/AI generation behind Pro

-- ── 1. Extend check_quota to accept soundboard resource types ──────────────

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
    'sounds', 'soundboard_pages', 'soundboard_playlists'
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

-- ── 2. Enforce quota on insert for soundboard tables ──────────────────────

create or replace trigger "sounds_enforce_quota"
  before insert on "public"."sounds"
  for each row execute function "public"."enforce_quota"();

create or replace trigger "soundboard_pages_enforce_quota"
  before insert on "public"."soundboard_pages"
  for each row execute function "public"."enforce_quota"();

create or replace trigger "soundboard_playlists_enforce_quota"
  before insert on "public"."soundboard_playlists"
  for each row execute function "public"."enforce_quota"();

-- ── 3. Set free plan quotas for soundboard resources ─────────────────────
-- sounds: 20, soundboard_pages: 1, soundboard_playlists: 3
-- Uses jsonb_set chain to merge into existing quotas without overwriting them.

update "public"."plans"
set quotas = quotas
  || jsonb_build_object(
       'sounds',               20,
       'soundboard_pages',      1,
       'soundboard_playlists',  3
     )
where id = 'free';
