-- Squashed migration: full schema as of 2026-04-26
-- Generated from remote DB dump to capture all schema including direct SQL changes




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."companion_source_type" AS ENUM (
    'monster',
    'npc',
    'custom'
);


ALTER TYPE "public"."companion_source_type" OWNER TO "postgres";


CREATE TYPE "public"."companion_type" AS ENUM (
    'familiar',
    'animal_companion',
    'mount',
    'ally',
    'sidekick'
);


ALTER TYPE "public"."companion_type" OWNER TO "postgres";


CREATE TYPE "public"."inventory_slot" AS ENUM (
    'head',
    'neck',
    'shoulders',
    'body',
    'hands',
    'ring',
    'waist',
    'feet',
    'main_hand',
    'off_hand',
    'other',
    'clothes'
);


ALTER TYPE "public"."inventory_slot" OWNER TO "postgres";


CREATE TYPE "public"."location_type_enum" AS ENUM (
    'continent',
    'region',
    'country',
    'city',
    'town',
    'village',
    'district',
    'building',
    'room',
    'dungeon',
    'wilderness',
    'other',
    'world',
    'plane',
    'store',
    'tavern',
    'inn'
);


ALTER TYPE "public"."location_type_enum" OWNER TO "postgres";


CREATE TYPE "public"."quest_status_enum" AS ENUM (
    'active',
    'on_hold',
    'completed',
    'failed',
    'undiscovered'
);


ALTER TYPE "public"."quest_status_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_quota"("resource_type" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
    'campaigns', 'npcs', 'monsters', 'encounters', 'scriptorium_documents', 'notes'
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


ALTER FUNCTION "public"."check_quota"("resource_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_loot_chest_atom"("p_message_id" "uuid", "p_atom_id" "text", "p_claimer_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_msg          public.campaign_messages;
  v_meta         jsonb;
  v_claims       jsonb;
  v_claims_total int;
begin
  -- Lock row so concurrent claims serialise.
  select * into v_msg
  from public.campaign_messages
  where id = p_message_id and type = 'loot_chest'
  for update;

  if v_msg is null then
    raise exception 'Chest not found';
  end if;

  if not public.is_campaign_member(v_msg.campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  v_meta         := coalesce(v_msg.metadata, '{}'::jsonb);
  v_claims       := coalesce(v_meta->'claims', '[]'::jsonb);
  v_claims_total := coalesce((v_meta->>'claims_total')::int, 0);

  if jsonb_array_length(v_claims) >= v_claims_total then
    raise exception 'Chest is empty';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(coalesce(v_meta->'rolled_atoms', '[]'::jsonb)) atom
    where atom->>'atom_id' = p_atom_id
  ) then
    raise exception 'Item not in chest';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_claims) claim
    where claim->>'atom_id' = p_atom_id
  ) then
    raise exception 'Item already claimed';
  end if;

  v_meta := jsonb_set(
    v_meta,
    '{claims}',
    v_claims || jsonb_build_object(
      'atom_id',             p_atom_id,
      'claimed_by_user_id',  auth.uid()::text,
      'claimed_by_name',     p_claimer_name,
      'claimed_at',          to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  );

  update public.campaign_messages set metadata = v_meta where id = p_message_id;
  return v_meta;
end;
$$;


ALTER FUNCTION "public"."claim_loot_chest_atom"("p_message_id" "uuid", "p_atom_id" "text", "p_claimer_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_shapeshifter_appearance"("member_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  update party_members
  set disguise_species_id = null,
      disguise_race       = null,
      disguise_subrace    = null
  where id = member_id
    and (
      -- DM path: calling user owns this party member row
      user_id = auth.uid()
      or
      -- Player path: calling user is linked to this party member via campaign_members
      exists (
        select 1 from campaign_members cm
        where cm.user_id = auth.uid()
          and cm.party_member_id = member_id
      )
    );
$$;


ALTER FUNCTION "public"."clear_shapeshifter_appearance"("member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_app_invite"("p_token" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_invite public.app_invites;
begin
  select * into v_invite
  from public.app_invites
  where token = p_token
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);

  if not found then
    raise exception 'Invalid or expired invite';
  end if;

  update public.app_invites
  set use_count = use_count + 1
  where id = v_invite.id;

  return true;
end;
$$;


ALTER FUNCTION "public"."consume_app_invite"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_dm_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.campaign_members (campaign_id, user_id, role, display_name)
  values (
    new.id,
    new.user_id,
    'dm',
    coalesce(
      (select username from public.profiles where user_id = new.user_id),
      nullif(trim((select raw_user_meta_data->>'display_name' from auth.users where id = new.user_id)), ''),
      (select email from auth.users where id = new.user_id)
    )
  )
  on conflict (campaign_id, user_id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."create_dm_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_free_subscription"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.user_subscriptions (user_id, plan_id, status)
  values (new.id, 'free', 'active')
  on conflict (user_id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."create_free_subscription"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_user_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_base text;
  v_candidate text;
  v_suffix int := 1;
begin
  v_base := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    split_part(new.email, '@', 1)
  );
  v_candidate := v_base;

  while exists (select 1 from public.profiles where username = v_candidate) loop
    v_suffix := v_suffix + 1;
    v_candidate := v_base || '_' || v_suffix;
  end loop;

  insert into public.profiles (user_id, username)
  values (new.id, v_candidate)
  on conflict (user_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_user_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_quota"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  result jsonb;
begin
  result := check_quota(TG_TABLE_NAME);
  if not (result ->> 'allowed')::boolean then
    raise exception 'quota_exceeded'
      using detail = TG_TABLE_NAME,
            hint   = 'Upgrade to Pro DM to create more ' || TG_TABLE_NAME;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_quota"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grab_item_drop"("p_message_id" "uuid", "p_qty" integer, "p_claimer_user_id" "uuid", "p_claimer_name" "text", "p_party_member_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_meta      jsonb;
  v_qty_orig  int;
  v_qty_rem   int;
  v_to_grab   int;
  v_new_claim jsonb;
  v_new_meta  jsonb;
begin
  -- Lock the row to serialise concurrent grabs
  select metadata into v_meta
  from public.campaign_messages
  where id = p_message_id
  for update;

  if v_meta is null then
    raise exception 'message not found';
  end if;

  -- quantity_remaining falls back to quantity for messages created before this migration
  v_qty_orig := coalesce((v_meta->>'quantity')::int, 1);
  v_qty_rem  := coalesce((v_meta->>'quantity_remaining')::int, v_qty_orig);

  if v_qty_rem <= 0 then
    raise exception 'stack exhausted';
  end if;

  -- -1 (or any value >= remaining) means "grab all"
  if p_qty < 0 or p_qty >= v_qty_rem then
    v_to_grab := v_qty_rem;
  else
    v_to_grab := p_qty;
  end if;

  v_new_claim := jsonb_build_object(
    'user_id',          p_claimer_user_id,
    'name',             p_claimer_name,
    'party_member_id',  p_party_member_id,
    'qty',              v_to_grab,
    'at',               to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  v_new_meta := v_meta
    || jsonb_build_object('quantity_remaining', v_qty_rem - v_to_grab)
    || jsonb_build_object(
         'claims',
         coalesce(v_meta->'claims', '[]'::jsonb) || jsonb_build_array(v_new_claim)
       );

  update public.campaign_messages
  set metadata = v_new_meta
  where id = p_message_id;

  return jsonb_build_object(
    'qty_grabbed',        v_to_grab,
    'quantity_remaining', v_qty_rem - v_to_grab
  );
end;
$$;


ALTER FUNCTION "public"."grab_item_drop"("p_message_id" "uuid", "p_qty" integer, "p_claimer_user_id" "uuid", "p_claimer_name" "text", "p_party_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_app_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
$$;


ALTER FUNCTION "public"."is_app_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_campaign_dm"("cid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = cid and user_id = auth.uid() and role = 'dm'
  );
$$;


ALTER FUNCTION "public"."is_campaign_dm"("cid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_campaign_member"("cid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = cid and user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_campaign_member"("cid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_dm_of_my_campaigns"("owner_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.campaign_members my
    join public.campaign_members dm
      on dm.campaign_id = my.campaign_id
     and dm.role = 'dm'
    where my.user_id = auth.uid()
      and dm.user_id = owner_id
  );
$$;


ALTER FUNCTION "public"."is_dm_of_my_campaigns"("owner_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_faction_pc_member"("p_faction_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from faction_party_members fpm
    join campaign_members cm on cm.party_member_id = fpm.party_member_id
    where fpm.faction_id = p_faction_id
      and cm.user_id = p_user_id
      and cm.role = 'player'
  );
$$;


ALTER FUNCTION "public"."is_faction_pc_member"("p_faction_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_campaign_via_invite"("p_token" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_invite public.campaign_invites%rowtype;
begin
  select * into v_invite
  from public.campaign_invites
  where token = p_token
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);

  if not found then
    raise exception 'Invalid or expired invite token';
  end if;

  if v_invite.role = 'player' and exists (
    select 1 from public.campaigns
    where id = v_invite.campaign_id and user_id = auth.uid()
  ) then
    raise exception 'Campaign owner cannot join as player';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role, display_name)
  values (
    v_invite.campaign_id,
    auth.uid(),
    v_invite.role,
    coalesce(
      (select username from public.profiles where user_id = auth.uid()),
      nullif(trim((select raw_user_meta_data->>'display_name' from auth.users where id = auth.uid())), ''),
      (select email from auth.users where id = auth.uid())
    )
  )
  on conflict (campaign_id, user_id) do nothing;

  update public.campaign_invites
  set use_count = use_count + 1
  where id = v_invite.id;

  return v_invite.campaign_id;
end;
$$;


ALTER FUNCTION "public"."join_campaign_via_invite"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_crafting_recipe"("p_recipe_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select exists (
      select 1 from public.crafting_recipes
      where id = p_recipe_id and user_id = auth.uid()
    )
  $$;


ALTER FUNCTION "public"."owns_crafting_recipe"("p_recipe_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_shapeshifter_appearance"("member_id" "uuid", "target_species" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  update party_members
  set
    disguise_species_id = target_species,
    disguise_race       = (select name from species where id = target_species)
  where id = member_id
    and (
      -- DM path: calling user owns this party member row
      user_id = auth.uid()
      or
      -- Player path: calling user is linked to this party member via campaign_members
      exists (
        select 1 from campaign_members cm
        where cm.user_id = auth.uid()
          and cm.party_member_id = member_id
      )
    );
$$;


ALTER FUNCTION "public"."set_shapeshifter_appearance"("member_id" "uuid", "target_species" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_companion_party_notes"("p_companion_id" "uuid", "p_notes" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id
  from public.companions
  where id = p_companion_id;

  if not found then
    raise exception 'Companion not found';
  end if;

  if not is_campaign_member(v_campaign_id) then
    raise exception 'Access denied';
  end if;

  update public.companions set party_notes = p_notes where id = p_companion_id;
end;
$$;


ALTER FUNCTION "public"."update_companion_party_notes"("p_companion_id" "uuid", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_npc_party_notes"("p_npc_id" "uuid", "p_notes" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id
  from public.npcs
  where id = p_npc_id and shared_with_players = true;

  if not found then
    raise exception 'NPC not found or not shared';
  end if;

  if not is_campaign_member(v_campaign_id) then
    raise exception 'Access denied';
  end if;

  update public.npcs set party_notes = p_notes where id = p_npc_id;
end;
$$;


ALTER FUNCTION "public"."update_npc_party_notes"("p_npc_id" "uuid", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_app_invite"("p_token" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.app_invites
    where token = p_token
      and (expires_at is null or expires_at > now())
      and (max_uses is null or use_count < max_uses)
  );
$$;


ALTER FUNCTION "public"."validate_app_invite"("p_token" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text",
    "expires_at" timestamp with time zone,
    "max_uses" integer,
    "use_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backgrounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "skill_proficiencies" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "tool_proficiencies" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "languages" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "equipment" "text",
    "feature_name" "text",
    "feature_description" "text",
    "suggested_characteristics" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "source" "text",
    "source_title" "text",
    "source_url" "text",
    "open5e_import" boolean DEFAULT false NOT NULL,
    "image_url" "text",
    "focal_point" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."backgrounds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "event_type" "text" DEFAULT 'campaign'::"text" NOT NULL,
    "harptos_year" integer NOT NULL,
    "harptos_month" integer,
    "harptos_day" integer,
    "festival_day" "text",
    "is_multi_day" boolean DEFAULT false NOT NULL,
    "end_year" integer,
    "end_month" integer,
    "end_day" integer,
    "color" "text" DEFAULT '#C9920A'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "campaign_id" "uuid",
    "linked_quest_id" "uuid",
    "linked_encounter_id" "uuid",
    "linked_location_id" "uuid",
    "travel_party_member_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "linked_note_id" "uuid"
);


ALTER TABLE "public"."calendar_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role" "text" DEFAULT 'player'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "label" "text",
    "expires_at" timestamp with time zone,
    "max_uses" integer,
    "use_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_invites_role_check" CHECK (("role" = ANY (ARRAY['dm'::"text", 'player'::"text"])))
);


ALTER TABLE "public"."campaign_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "party_member_id" "uuid",
    "display_name" "text",
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_members_role_check" CHECK (("role" = ANY (ARRAY['dm'::"text", 'player'::"text"])))
);


ALTER TABLE "public"."campaign_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sender_name" "text",
    "message" "text" NOT NULL,
    "type" "text" DEFAULT 'chat'::"text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "recipient_user_id" "uuid",
    CONSTRAINT "campaign_messages_type_check" CHECK (("type" = ANY (ARRAY['chat'::"text", 'roll'::"text", 'system'::"text", 'item_drop'::"text", 'currency_drop'::"text", 'vendor_offer'::"text", 'player_offer'::"text", 'loot_chest'::"text", 'dm_roll'::"text"])))
);

ALTER TABLE ONLY "public"."campaign_messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."campaign_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_rules" (
    "campaign_id" "uuid" NOT NULL,
    "rule_key" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "setting" "text" DEFAULT 'Faerûn'::"text" NOT NULL,
    "current_year" integer DEFAULT 1495 NOT NULL,
    "calendar_id" "text" DEFAULT 'faerun'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "theme" "text" DEFAULT 'grimoire'::"text" NOT NULL,
    "excluded_monster_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "health_visibility" "text" DEFAULT 'strategic'::"text" NOT NULL,
    "immersive_rolls" boolean DEFAULT false NOT NULL,
    "openai_api_key" "text",
    "ai_setting_prompt" "text",
    "ical_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "disabled_class_names" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "spotify_client_id" "text",
    "optional_rules" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "text_provider" "text",
    "image_provider" "text",
    "anthropic_api_key" "text",
    "gemini_api_key" "text",
    "falai_api_key" "text",
    "allow_chronicle_promotion" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."character_classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "party_member_id" "uuid" NOT NULL,
    "class_name" "text" NOT NULL,
    "subclass_name" "text",
    "levels" integer NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "hit_dice_used" integer DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "character_classes_levels_check" CHECK ((("levels" >= 1) AND ("levels" <= 20)))
);


ALTER TABLE "public"."character_classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."character_spells" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "party_member_id" "uuid" NOT NULL,
    "spell_id" "uuid" NOT NULL,
    "is_known" boolean DEFAULT true NOT NULL,
    "is_prepared" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_class_id" "uuid",
    "source_type" "text" DEFAULT 'class'::"text" NOT NULL,
    "uses_per_day" integer,
    "uses_remaining" integer,
    "resets_on" "text",
    "source_label" "text",
    CONSTRAINT "character_spells_resets_on_check" CHECK (("resets_on" = ANY (ARRAY['long_rest'::"text", 'short_rest'::"text"]))),
    CONSTRAINT "character_spells_source_type_check" CHECK (("source_type" = ANY (ARRAY['class'::"text", 'racial'::"text", 'feat'::"text", 'item'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."character_spells" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chronicler_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "prompt" "text" NOT NULL,
    "size" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chronicler_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_features" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "campaign_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "feature_type" "text" DEFAULT 'passive'::"text" NOT NULL,
    "source" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "open5e_import" boolean DEFAULT false NOT NULL,
    "prerequisite" "text"
);


ALTER TABLE "public"."class_features" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companion_player_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "companion_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."companion_player_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "companion_type" "public"."companion_type" DEFAULT 'ally'::"public"."companion_type" NOT NULL,
    "source_type" "public"."companion_source_type" DEFAULT 'custom'::"public"."companion_source_type" NOT NULL,
    "source_monster_id" "text",
    "source_npc_id" "uuid",
    "owner_party_member_id" "uuid",
    "max_hp" integer DEFAULT 1 NOT NULL,
    "current_hp" integer DEFAULT 1 NOT NULL,
    "ac" integer DEFAULT 10 NOT NULL,
    "speed" integer DEFAULT 30 NOT NULL,
    "conditions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "portrait_url" "text",
    "portrait_focal_point" "jsonb",
    "party_notes" "text",
    "stat_block" "jsonb"
);


ALTER TABLE "public"."companions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crafting_recipe_grants" (
    "recipe_id" "uuid" NOT NULL,
    "party_member_id" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."crafting_recipe_grants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crafting_recipe_ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "item_id" "uuid",
    "quantity" integer DEFAULT 1 NOT NULL,
    "tags" "text"[],
    CONSTRAINT "ingredient_item_or_tags" CHECK (((("item_id" IS NOT NULL) AND ("tags" IS NULL)) OR (("item_id" IS NULL) AND ("tags" IS NOT NULL) AND ("cardinality"("tags") > 0))))
);


ALTER TABLE "public"."crafting_recipe_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crafting_recipe_modifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "bonus" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."crafting_recipe_modifiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crafting_recipe_outputs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."crafting_recipe_outputs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crafting_recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "discipline" "text" DEFAULT 'smithing'::"text" NOT NULL,
    "dc" integer DEFAULT 10 NOT NULL,
    "crafting_time" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "requires_proficiency" boolean DEFAULT false NOT NULL,
    "requires_tools" boolean DEFAULT false NOT NULL,
    "player_visible_to" "uuid"[],
    "crafting_time_unit" "text" DEFAULT 'days'::"text" NOT NULL,
    CONSTRAINT "crafting_time_unit_values" CHECK (("crafting_time_unit" = ANY (ARRAY['minutes'::"text", 'hours'::"text", 'days'::"text"])))
);


ALTER TABLE "public"."crafting_recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "class_name" "text" NOT NULL,
    "hit_die" integer DEFAULT 8 NOT NULL,
    "primary_ability" "text",
    "saving_throws" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "armor_proficiencies" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "weapon_proficiencies" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "subclass_level" integer DEFAULT 3 NOT NULL,
    "features" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "asi_levels" integer[] DEFAULT '{4,8,12,16,19}'::integer[] NOT NULL,
    "spell_slots" "jsonb",
    "steps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "resources" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "spells_known" "jsonb",
    "slot_recovery" "text" DEFAULT 'long'::"text" NOT NULL,
    "caster_type" "text" DEFAULT 'none'::"text" NOT NULL,
    "prepared_ability" "text",
    "prepared_divisor" smallint,
    "cantrips_known" integer[],
    "source" "text"
);


ALTER TABLE "public"."custom_classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_subclasses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "class_name" "text" NOT NULL,
    "subclass_name" "text" NOT NULL,
    "features" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "steps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "resources" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "source" "text"
);


ALTER TABLE "public"."custom_subclasses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discovered_monsters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "monster_id" "uuid",
    "srd_slug" "text",
    "visible_to" "uuid"[],
    "discovered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reveal_stats" boolean DEFAULT false NOT NULL,
    CONSTRAINT "dm_has_source" CHECK ((("monster_id" IS NOT NULL) OR ("srd_slug" IS NOT NULL)))
);


ALTER TABLE "public"."discovered_monsters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dungeon_features" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "feature_type" "text" DEFAULT 'Secret Door'::"text" NOT NULL,
    "description" "text",
    "perception_dc" integer,
    "investigation_dc" integer,
    "arcana_dc" integer,
    "trigger_type" "text",
    "trigger_description" "text",
    "contents_description" "text",
    "image_url" "text",
    "image_focal_point" "jsonb",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dungeon_features" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."encounter_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "encounter_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_running" boolean DEFAULT false NOT NULL,
    "current_round" integer DEFAULT 1 NOT NULL,
    "active_combatant_index" integer DEFAULT 0 NOT NULL,
    "combatants_live" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "events_fired" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);

ALTER TABLE ONLY "public"."encounter_state" REPLICA IDENTITY FULL;


ALTER TABLE "public"."encounter_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."encounters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'New Encounter'::"text" NOT NULL,
    "description" "text",
    "party_member_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "combatants" "jsonb" DEFAULT '[]'::"jsonb",
    "factions" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "campaign_id" "uuid",
    "companion_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "is_finished" boolean DEFAULT false NOT NULL,
    "item_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "location_id" "uuid",
    "reward_currency_pools" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "events" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "trap_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "party_member_factions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "art_objects" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "lair_enabled" boolean DEFAULT false NOT NULL,
    "lair_owner_def_id" "text"
);


ALTER TABLE "public"."encounters" OWNER TO "postgres";


COMMENT ON COLUMN "public"."encounters"."lair_owner_def_id" IS 'References encounters.combatants[*].id — which combatant in this encounter owns the lair. Null means the DM has enabled lair actions but not yet picked an owner; the runner hides the lair card until set.';



CREATE TABLE IF NOT EXISTS "public"."entity_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text" NOT NULL,
    "content" "text",
    "is_private" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."entity_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."faction_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "faction_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."faction_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."faction_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "faction_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."faction_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."faction_npcs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "faction_id" "uuid" NOT NULL,
    "npc_id" "uuid" NOT NULL,
    "role" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    CONSTRAINT "faction_npcs_status_check" CHECK (("status" = ANY (ARRAY['Active'::"text", 'Retired'::"text", 'Defected'::"text", 'Expelled'::"text", 'Deceased'::"text"])))
);


ALTER TABLE "public"."faction_npcs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."faction_party_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "faction_id" "uuid" NOT NULL,
    "party_member_id" "uuid" NOT NULL,
    "role" "text",
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."faction_party_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."faction_relations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "faction_id" "uuid" NOT NULL,
    "target_faction_id" "uuid" NOT NULL,
    "relation_type" "text" DEFAULT 'neutral'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "faction_relations_check" CHECK (("faction_id" <> "target_faction_id"))
);


ALTER TABLE "public"."faction_relations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."factions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "faction_type" "text",
    "description" "text",
    "emblem_url" "text",
    "alignment" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "player_visible_to" "uuid"[],
    "campaign_id" "uuid"
);


ALTER TABLE "public"."factions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hall_of_heroes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "setting" "text" DEFAULT 'faerun'::"text" NOT NULL,
    "race" "text",
    "alignment" "text",
    "age" "text",
    "occupation" "text",
    "appearance" "text",
    "personality" "text",
    "backstory" "text",
    "notes" "text",
    "status" "text" DEFAULT 'alive'::"text" NOT NULL,
    "relationship" "text" DEFAULT 'neutral'::"text" NOT NULL,
    "portrait_url" "text",
    "card_art_url" "text",
    "portrait_focal_point" "jsonb",
    "disguise_name" "text",
    "disguise_portrait_url" "text",
    "disguise_portrait_focal_point" "jsonb",
    "is_revealed" boolean DEFAULT false NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "stat_block" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hall_of_heroes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "item_type" "text" DEFAULT 'gear'::"text" NOT NULL,
    "subtype" "text",
    "rarity" "text" DEFAULT 'mundane'::"text" NOT NULL,
    "requires_attunement" boolean DEFAULT false NOT NULL,
    "attunement_requirements" "text",
    "weight" numeric,
    "cost" "text",
    "damage_rolls" "jsonb",
    "armor_class" "text",
    "properties" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "charges" integer,
    "recharge" "text",
    "spell_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "source" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_focal_point" "jsonb",
    "weapon_range" "text",
    "versatile_damage" "text",
    "source_title" "text",
    "source_url" "text",
    "curse_description" "text",
    "is_arcane_focus" boolean DEFAULT false NOT NULL,
    "mundane_description" "text",
    "mundane_image_url" "text",
    "mundane_image_focal_point" "jsonb",
    "bundle_items" "jsonb"
);


ALTER TABLE "public"."items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "parent_id" "uuid",
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "location_type" "public"."location_type_enum" DEFAULT 'other'::"public"."location_type_enum" NOT NULL,
    "description" "text",
    "notes" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "map_url" "text",
    "map_pins" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_map_shared" boolean DEFAULT false NOT NULL,
    "player_summary" "text",
    "is_description_shared" boolean DEFAULT false NOT NULL,
    "is_npcs_shared" boolean DEFAULT false NOT NULL,
    "player_visible_to" "uuid"[],
    "is_inventory_shared" boolean DEFAULT false NOT NULL,
    "npc_owner_id" "uuid"
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loot_tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "cr_tier" "text" DEFAULT 'any'::"text" NOT NULL,
    "entries" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "monster_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    CONSTRAINT "loot_tables_cr_tier_check" CHECK (("cr_tier" = ANY (ARRAY['any'::"text", '0-4'::"text", '5-10'::"text", '11-16'::"text", '17+'::"text"])))
);


ALTER TABLE "public"."loot_tables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monsters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "monster_type" "text" DEFAULT 'humanoid'::"text" NOT NULL,
    "size" "text" DEFAULT 'medium'::"text" NOT NULL,
    "alignment" "text" DEFAULT 'unaligned'::"text" NOT NULL,
    "habitat" "text",
    "source" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "stat_block" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text",
    "description" "text",
    "portrait_focal_point" "jsonb",
    "open5e_import" boolean DEFAULT false NOT NULL,
    "source_title" "text",
    "source_url" "text"
);


ALTER TABLE "public"."monsters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."multiclass_prerequisites" (
    "class_name" "text" NOT NULL,
    "require_kind" "text" DEFAULT 'and'::"text" NOT NULL,
    "str" integer DEFAULT 0 NOT NULL,
    "dex" integer DEFAULT 0 NOT NULL,
    "con" integer DEFAULT 0 NOT NULL,
    "int" integer DEFAULT 0 NOT NULL,
    "wis" integer DEFAULT 0 NOT NULL,
    "cha" integer DEFAULT 0 NOT NULL,
    "gained_proficiencies" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "multiclass_prerequisites_require_kind_check" CHECK (("require_kind" = ANY (ARRAY['and'::"text", 'or'::"text"])))
);


ALTER TABLE "public"."multiclass_prerequisites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'Untitled Note'::"text" NOT NULL,
    "content" "text",
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "session_num" integer,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "campaign_id" "uuid",
    "is_player_visible" boolean DEFAULT false NOT NULL,
    "player_visible_to" "uuid"[],
    "session_start_year" integer,
    "session_start_month" integer,
    "session_start_day" integer,
    "session_end_year" integer,
    "session_end_month" integer,
    "session_end_day" integer,
    "session_real_date" "text",
    "linked_calendar_event_id" "uuid"
);


ALTER TABLE "public"."notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."npc_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "npc_id" "uuid" NOT NULL,
    "item_id" "uuid",
    "name" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."npc_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."npc_pc_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "npc_id" "uuid" NOT NULL,
    "party_member_id" "uuid" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "relationship_type" "text" DEFAULT 'contact'::"text" NOT NULL
);


ALTER TABLE "public"."npc_pc_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."npc_player_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "npc_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."npc_player_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."npc_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "npc_id" "uuid" NOT NULL,
    "related_npc_id" "uuid" NOT NULL,
    "relationship_type" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "npc_relationships_no_self" CHECK (("npc_id" <> "related_npc_id"))
);


ALTER TABLE "public"."npc_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."npcs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "race" "text",
    "alignment" "text",
    "age" "text",
    "occupation" "text",
    "appearance" "text",
    "personality" "text",
    "backstory" "text",
    "notes" "text",
    "status" "text" DEFAULT 'alive'::"text" NOT NULL,
    "relationship" "text" DEFAULT 'neutral'::"text" NOT NULL,
    "portrait_url" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "stat_block" "jsonb",
    "scriptorium_doc_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "campaign_id" "uuid",
    "location_id" "uuid",
    "player_visible_fields" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "portrait_focal_point" "jsonb",
    "linked_monster_id" "uuid",
    "relevance" smallint DEFAULT 3 NOT NULL,
    "player_visible_to" "uuid"[],
    "disguise_name" "text",
    "disguise_portrait_url" "text",
    "disguise_portrait_focal_point" "jsonb",
    "is_revealed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "npcs_relevance_check" CHECK ((("relevance" >= 1) AND ("relevance" <= 5)))
);


ALTER TABLE "public"."npcs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."party_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "item_id" "uuid",
    "name" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "carried_by" "uuid",
    "is_attuned" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_equipped" boolean DEFAULT false NOT NULL,
    "location" "text" DEFAULT 'backpack'::"text" NOT NULL,
    "slot" "public"."inventory_slot",
    "is_container" boolean DEFAULT false NOT NULL,
    "container_id" "uuid",
    "is_ruined" boolean DEFAULT false NOT NULL,
    "current_charges" integer,
    "sort_order" integer DEFAULT 1000000000 NOT NULL,
    "is_identified" boolean DEFAULT true NOT NULL,
    "curse_revealed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "party_inventory_location_check" CHECK (("location" = ANY (ARRAY['equipped'::"text", 'belt'::"text", 'backpack'::"text", 'container'::"text", 'stored'::"text"])))
);


ALTER TABLE "public"."party_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."party_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "player_name" "text",
    "class" "text",
    "subclass" "text",
    "level" integer DEFAULT 1 NOT NULL,
    "max_hp" integer DEFAULT 10 NOT NULL,
    "current_hp" integer DEFAULT 10 NOT NULL,
    "temp_hp" integer DEFAULT 0 NOT NULL,
    "ac" integer DEFAULT 10 NOT NULL,
    "speed" integer DEFAULT 30 NOT NULL,
    "initiative_bonus" integer DEFAULT 0 NOT NULL,
    "current_initiative" integer,
    "str" integer DEFAULT 10 NOT NULL,
    "dex" integer DEFAULT 10 NOT NULL,
    "con" integer DEFAULT 10 NOT NULL,
    "int" integer DEFAULT 10 NOT NULL,
    "wis" integer DEFAULT 10 NOT NULL,
    "cha" integer DEFAULT 10 NOT NULL,
    "proficiency_bonus" integer DEFAULT 2 NOT NULL,
    "skill_proficiencies" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "saving_throw_proficiencies" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "conditions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "inspiration" boolean DEFAULT false NOT NULL,
    "death_save_successes" integer DEFAULT 0 NOT NULL,
    "death_save_failures" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "portrait_url" "text",
    "campaign_id" "uuid",
    "curses" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "cp" integer DEFAULT 0 NOT NULL,
    "sp" integer DEFAULT 0 NOT NULL,
    "ep" integer DEFAULT 0 NOT NULL,
    "gp" integer DEFAULT 0 NOT NULL,
    "pp" integer DEFAULT 0 NOT NULL,
    "tool_proficiencies" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "languages" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "portrait_focal_point" "jsonb",
    "spell_slots" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "current_location_id" "uuid",
    "carry_capacity_override" "text",
    "class_resources" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "class_choices" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "hit_dice_remaining" integer,
    "subrace" "text",
    "species_id" "uuid",
    "background_id" "uuid",
    "disguise_species_id" "uuid",
    "disguise_race" "text",
    "disguise_subrace" "text",
    "concentration" "jsonb",
    "alignment" "text",
    "personality_traits" "text",
    "ideals" "text",
    "bonds" "text",
    "flaws" "text",
    "deity" "text",
    "experience_points" integer DEFAULT 0 NOT NULL,
    "age" "text",
    "gender" "text",
    "pronouns" "text",
    "physical_description" "text",
    "level_choices" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "owner_user_id" "uuid",
    "is_dm_managed" boolean DEFAULT false NOT NULL,
    "wildshape_state" "jsonb",
    "wildshapes_used" integer DEFAULT 0 NOT NULL,
    "wildshape_reset" timestamp with time zone,
    "ac_formula" "text",
    CONSTRAINT "party_members_level_check" CHECK ((("level" >= 1) AND ("level" <= 20)))
);

ALTER TABLE ONLY "public"."party_members" REPLICA IDENTITY FULL;


ALTER TABLE "public"."party_members" OWNER TO "postgres";


COMMENT ON COLUMN "public"."party_members"."concentration" IS 'Nullable. Shape: { spellId: string|null, spellName: string, castAtLevel: int, startedRound: int|null, appliedEffectIds: string[] }. Represents the single spell this character is currently concentrating on.';



COMMENT ON COLUMN "public"."party_members"."alignment" IS 'Alignment string (e.g. "Chaotic Good") or free-form. Null for unaligned / not yet chosen.';



COMMENT ON COLUMN "public"."party_members"."experience_points" IS 'Total XP earned. Ignored when the campaign uses milestone levelling. Never decreases.';



COMMENT ON COLUMN "public"."party_members"."age" IS 'Free-form age — could be a number ("47") or descriptive ("ancient", "young adult"). Stored as text so non-numeric ages aren''t lossy.';



CREATE OR REPLACE VIEW "public"."party_member_levels" WITH ("security_invoker"='true') AS
 SELECT "pm"."id" AS "party_member_id",
    COALESCE("sum"("cc"."levels"), ("pm"."level")::bigint) AS "total_level",
    COALESCE("jsonb_agg"("jsonb_build_object"('id', "cc"."id", 'class', "cc"."class_name", 'subclass', "cc"."subclass_name", 'levels', "cc"."levels", 'is_primary', "cc"."is_primary", 'sort_order', "cc"."sort_order") ORDER BY "cc"."sort_order") FILTER (WHERE ("cc"."id" IS NOT NULL)), '[]'::"jsonb") AS "classes"
   FROM ("public"."party_members" "pm"
     LEFT JOIN "public"."character_classes" "cc" ON (("cc"."party_member_id" = "pm"."id")))
  GROUP BY "pm"."id", "pm"."level";


ALTER VIEW "public"."party_member_levels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."party_member_player_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "party_member_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."party_member_player_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."party_member_tracker_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "party_member_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "rule_key" "text",
    "rule_id" "uuid",
    "value" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tracker_state_source_check" CHECK ((("rule_key" IS NOT NULL) <> ("rule_id" IS NOT NULL)))
);


ALTER TABLE "public"."party_member_tracker_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pinned_forms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "party_member_id" "uuid" NOT NULL,
    "monster_id" "uuid",
    "srd_slug" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pinned_forms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "quotas" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "stripe_price_id" "text",
    "prices" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_journal_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "title" "text",
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT 'adventure'::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_private" boolean DEFAULT true NOT NULL,
    "ref_type" "text",
    "ref_id" "uuid",
    "ref_label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."player_journal_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."puzzle_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "puzzle_type" "text" DEFAULT 'Logic'::"text" NOT NULL,
    "difficulty" "text" DEFAULT 'Medium'::"text" NOT NULL,
    "description" "text",
    "solution" "text",
    "hints" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "skill_checks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "success_outcome" "text",
    "failure_consequence" "text",
    "image_url" "text",
    "image_focal_point" "jsonb",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "campaign_id" "uuid",
    "is_shared" boolean DEFAULT false NOT NULL,
    "shared_hints" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "read_aloud" "text"
);


ALTER TABLE "public"."puzzle_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quest_objectives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quest_id" "uuid" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "is_done" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_player_visible" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."quest_objectives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quest_refs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quest_id" "uuid" NOT NULL,
    "ref_type" "text" NOT NULL,
    "ref_id" "uuid" NOT NULL,
    "is_player_visible" boolean DEFAULT true NOT NULL,
    CONSTRAINT "quest_refs_ref_type_check" CHECK (("ref_type" = ANY (ARRAY['npc'::"text", 'location'::"text", 'monster'::"text", 'item'::"text", 'encounter'::"text"])))
);


ALTER TABLE "public"."quest_refs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "parent_quest_id" "uuid",
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "summary" "text",
    "status" "public"."quest_status_enum" DEFAULT 'active'::"public"."quest_status_enum" NOT NULL,
    "giver_npc_id" "uuid",
    "location_id" "uuid",
    "rewards" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "started_at" "text",
    "resolved_at" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reward_pp" integer DEFAULT 0 NOT NULL,
    "reward_gp" integer DEFAULT 0 NOT NULL,
    "reward_ep" integer DEFAULT 0 NOT NULL,
    "reward_sp" integer DEFAULT 0 NOT NULL,
    "reward_cp" integer DEFAULT 0 NOT NULL,
    "reward_currency_pools" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "description" "text",
    "reward_item_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "reward_art_objects" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "player_visible_to" "uuid"[]
);


ALTER TABLE "public"."quests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roll_tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "dice" "text" NOT NULL,
    "entries" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "roll_tables_dice_check" CHECK (("dice" = ANY (ARRAY['1d4'::"text", '1d6'::"text", '1d8'::"text", '1d10'::"text", '1d12'::"text", '1d20'::"text", '1d100'::"text"])))
);


ALTER TABLE "public"."roll_tables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "jsonb",
    "category" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_player_visible" boolean DEFAULT false NOT NULL,
    "tracker" "jsonb"
);


ALTER TABLE "public"."rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scriptorium_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'Untitled Document'::"text" NOT NULL,
    "content" "text",
    "doc_type" "text" DEFAULT 'custom'::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_published" boolean DEFAULT false NOT NULL,
    "word_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_two_column" boolean DEFAULT false NOT NULL,
    "theme" "text" DEFAULT 'onednd2024'::"text" NOT NULL,
    "page_size" "text" DEFAULT 'A4'::"text" NOT NULL,
    "ink_friendly" boolean DEFAULT false NOT NULL,
    "show_page_numbers" boolean DEFAULT false NOT NULL,
    "footer_text" "text" DEFAULT ''::"text" NOT NULL,
    "page_number_start" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "scriptorium_documents_theme_check" CHECK (("theme" = ANY (ARRAY['onednd2024'::"text", 'phb2014'::"text"])))
);


ALTER TABLE "public"."scriptorium_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_proposal_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "available" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."session_availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "proposed_date" "date" NOT NULL,
    "proposed_time" time without time zone,
    "title" "text" DEFAULT 'Session'::"text" NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'proposed'::"text" NOT NULL,
    "min_attendance" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "duration_minutes" integer DEFAULT 240 NOT NULL,
    CONSTRAINT "session_proposals_status_check" CHECK (("status" = ANY (ARRAY['proposed'::"text", 'confirmed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."session_proposals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'misc'::"text" NOT NULL,
    "source_type" "text" DEFAULT 'upload'::"text" NOT NULL,
    "file_url" "text" NOT NULL,
    "storage_path" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."sounds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."species" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "notes" "text",
    "size" "text",
    "speed" "jsonb",
    "ability_score_increases" "jsonb",
    "traits" "jsonb",
    "languages" "text"[],
    "tags" "text"[],
    "source" "text",
    "subraces" "jsonb",
    "image_url" "text",
    "focal_point" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_shapeshifter" boolean DEFAULT false NOT NULL,
    "granted_spells" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "natural_armor_ac" integer
);


ALTER TABLE "public"."species" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spells" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "level" smallint DEFAULT 1 NOT NULL,
    "school" "text" DEFAULT 'evocation'::"text" NOT NULL,
    "casting_time" "text" DEFAULT 'Action'::"text" NOT NULL,
    "casting_time_custom" "text",
    "range" "text" DEFAULT '60 ft.'::"text" NOT NULL,
    "range_custom" "text",
    "duration" "text" DEFAULT 'Instantaneous'::"text" NOT NULL,
    "duration_custom" "text",
    "components" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "material" "text",
    "concentration" boolean DEFAULT false NOT NULL,
    "ritual" boolean DEFAULT false NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "higher_levels" "text",
    "classes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "source" "text",
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attack_type" "text",
    "save_attribute" "text",
    "save_effect" "text",
    "healing_dice" "text",
    "aoe_shape" "text",
    "aoe_size" "text",
    "condition_inflicted" "text",
    "damage_rolls" "jsonb",
    "target_description" "text",
    "image_focal_point" "jsonb",
    "open5e_import" boolean DEFAULT false NOT NULL,
    "source_title" "text",
    "source_url" "text",
    "higher_level_damage" "jsonb",
    "higher_level_healing" "text",
    CONSTRAINT "spells_level_check" CHECK ((("level" >= 0) AND ("level" <= 9)))
);


ALTER TABLE "public"."spells" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."srd_art_defaults" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contributed_by" "uuid" NOT NULL,
    "content_type" "text" NOT NULL,
    "srd_slug" "text" NOT NULL,
    "image_url" "text",
    "image_focal_point" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "srd_art_defaults_content_type_check" CHECK (("content_type" = ANY (ARRAY['spell'::"text", 'item'::"text"])))
);


ALTER TABLE "public"."srd_art_defaults" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."srd_monster_art" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "srd_id" "text" NOT NULL,
    "image_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "portrait_focal_point" "jsonb",
    "is_canonical" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."srd_monster_art" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."srd_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "parent_slug" "text",
    "doc_slug" "text" DEFAULT 'wotc-srd'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."srd_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."store_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "price_override" "text",
    "visible" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."store_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_name" "text" NOT NULL,
    "hit_die" smallint NOT NULL,
    "primary_ability" "text",
    "saving_throws" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "armor_proficiencies" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "weapon_proficiencies" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "subclass_level" smallint DEFAULT 3 NOT NULL,
    "features" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "asi_levels" smallint[] DEFAULT '{4,8,12,16,19}'::smallint[] NOT NULL,
    "spell_slots" "jsonb",
    "spells_known" "jsonb",
    "slot_recovery" "text" DEFAULT 'long'::"text" NOT NULL,
    "steps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "resources" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "caster_type" "text" DEFAULT 'none'::"text" NOT NULL,
    "prepared_ability" "text",
    "prepared_divisor" smallint,
    "cantrips_known" integer[]
);


ALTER TABLE "public"."system_classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."traps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "jsonb",
    "trap_type" "text" DEFAULT 'Mechanical'::"text" NOT NULL,
    "cr" "text",
    "trigger_type" "text",
    "detection_dc" integer,
    "disarm_dc" integer,
    "effect_description" "text",
    "save_type" "text",
    "save_dc" integer,
    "attack_bonus" integer,
    "reset_type" "text" DEFAULT 'None'::"text" NOT NULL,
    "image_url" "text",
    "image_focal_point" "jsonb",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trap_hp" integer,
    "trap_ac" integer,
    "damage_immunities" "text"[] DEFAULT '{poison,psychic}'::"text"[] NOT NULL,
    "damage_entries" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."traps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_subscriptions" (
    "user_id" "uuid" NOT NULL,
    "plan_id" "text" DEFAULT 'free'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_subscriptions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_invites"
    ADD CONSTRAINT "app_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_invites"
    ADD CONSTRAINT "app_invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."backgrounds"
    ADD CONSTRAINT "backgrounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_invites"
    ADD CONSTRAINT "campaign_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_invites"
    ADD CONSTRAINT "campaign_invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."campaign_members"
    ADD CONSTRAINT "campaign_members_campaign_id_user_id_key" UNIQUE ("campaign_id", "user_id");



ALTER TABLE ONLY "public"."campaign_members"
    ADD CONSTRAINT "campaign_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_messages"
    ADD CONSTRAINT "campaign_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_rules"
    ADD CONSTRAINT "campaign_rules_pkey" PRIMARY KEY ("campaign_id", "rule_key");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."character_classes"
    ADD CONSTRAINT "character_classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."character_spells"
    ADD CONSTRAINT "character_spells_party_member_spell_source_key" UNIQUE ("party_member_id", "spell_id", "source_type");



ALTER TABLE ONLY "public"."character_spells"
    ADD CONSTRAINT "character_spells_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chronicler_images"
    ADD CONSTRAINT "chronicler_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_features"
    ADD CONSTRAINT "class_features_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companion_player_notes"
    ADD CONSTRAINT "companion_player_notes_companion_id_user_id_key" UNIQUE ("companion_id", "user_id");



ALTER TABLE ONLY "public"."companion_player_notes"
    ADD CONSTRAINT "companion_player_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companions"
    ADD CONSTRAINT "companions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crafting_recipe_grants"
    ADD CONSTRAINT "crafting_recipe_grants_pkey" PRIMARY KEY ("recipe_id", "party_member_id");



ALTER TABLE ONLY "public"."crafting_recipe_ingredients"
    ADD CONSTRAINT "crafting_recipe_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crafting_recipe_modifiers"
    ADD CONSTRAINT "crafting_recipe_modifiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crafting_recipe_outputs"
    ADD CONSTRAINT "crafting_recipe_outputs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crafting_recipes"
    ADD CONSTRAINT "crafting_recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_classes"
    ADD CONSTRAINT "custom_classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_subclasses"
    ADD CONSTRAINT "custom_subclasses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discovered_monsters"
    ADD CONSTRAINT "discovered_monsters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dungeon_features"
    ADD CONSTRAINT "dungeon_features_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."encounter_state"
    ADD CONSTRAINT "encounter_state_encounter_id_key" UNIQUE ("encounter_id");



ALTER TABLE ONLY "public"."encounter_state"
    ADD CONSTRAINT "encounter_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."encounters"
    ADD CONSTRAINT "encounters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entity_notes"
    ADD CONSTRAINT "entity_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faction_items"
    ADD CONSTRAINT "faction_items_faction_id_item_id_key" UNIQUE ("faction_id", "item_id");



ALTER TABLE ONLY "public"."faction_items"
    ADD CONSTRAINT "faction_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faction_locations"
    ADD CONSTRAINT "faction_locations_faction_id_location_id_key" UNIQUE ("faction_id", "location_id");



ALTER TABLE ONLY "public"."faction_locations"
    ADD CONSTRAINT "faction_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faction_npcs"
    ADD CONSTRAINT "faction_npcs_faction_id_npc_id_key" UNIQUE ("faction_id", "npc_id");



ALTER TABLE ONLY "public"."faction_npcs"
    ADD CONSTRAINT "faction_npcs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faction_party_members"
    ADD CONSTRAINT "faction_party_members_faction_id_party_member_id_key" UNIQUE ("faction_id", "party_member_id");



ALTER TABLE ONLY "public"."faction_party_members"
    ADD CONSTRAINT "faction_party_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faction_relations"
    ADD CONSTRAINT "faction_relations_faction_id_target_faction_id_key" UNIQUE ("faction_id", "target_faction_id");



ALTER TABLE ONLY "public"."faction_relations"
    ADD CONSTRAINT "faction_relations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."factions"
    ADD CONSTRAINT "factions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hall_of_heroes"
    ADD CONSTRAINT "hall_of_heroes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loot_tables"
    ADD CONSTRAINT "loot_tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monsters"
    ADD CONSTRAINT "monsters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."multiclass_prerequisites"
    ADD CONSTRAINT "multiclass_prerequisites_pkey" PRIMARY KEY ("class_name");



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."npc_inventory"
    ADD CONSTRAINT "npc_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."npc_pc_notes"
    ADD CONSTRAINT "npc_pc_notes_npc_id_party_member_id_key" UNIQUE ("npc_id", "party_member_id");



ALTER TABLE ONLY "public"."npc_pc_notes"
    ADD CONSTRAINT "npc_pc_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."npc_player_notes"
    ADD CONSTRAINT "npc_player_notes_npc_id_user_id_key" UNIQUE ("npc_id", "user_id");



ALTER TABLE ONLY "public"."npc_player_notes"
    ADD CONSTRAINT "npc_player_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."npc_relationships"
    ADD CONSTRAINT "npc_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."npcs"
    ADD CONSTRAINT "npcs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."party_inventory"
    ADD CONSTRAINT "party_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."party_member_player_notes"
    ADD CONSTRAINT "party_member_player_notes_party_member_id_user_id_key" UNIQUE ("party_member_id", "user_id");



ALTER TABLE ONLY "public"."party_member_player_notes"
    ADD CONSTRAINT "party_member_player_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."party_member_tracker_state"
    ADD CONSTRAINT "party_member_tracker_state_party_member_id_rule_id_key" UNIQUE ("party_member_id", "rule_id");



ALTER TABLE ONLY "public"."party_member_tracker_state"
    ADD CONSTRAINT "party_member_tracker_state_party_member_id_rule_key_key" UNIQUE ("party_member_id", "rule_key");



ALTER TABLE ONLY "public"."party_member_tracker_state"
    ADD CONSTRAINT "party_member_tracker_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."party_members"
    ADD CONSTRAINT "party_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pinned_forms"
    ADD CONSTRAINT "pinned_forms_custom_unique" UNIQUE ("campaign_id", "party_member_id", "monster_id");



ALTER TABLE ONLY "public"."pinned_forms"
    ADD CONSTRAINT "pinned_forms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pinned_forms"
    ADD CONSTRAINT "pinned_forms_srd_unique" UNIQUE ("campaign_id", "party_member_id", "srd_slug");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_journal_entries"
    ADD CONSTRAINT "player_journal_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."puzzle_rooms"
    ADD CONSTRAINT "puzzle_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quest_objectives"
    ADD CONSTRAINT "quest_objectives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quest_refs"
    ADD CONSTRAINT "quest_refs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quest_refs"
    ADD CONSTRAINT "quest_refs_quest_id_ref_type_ref_id_key" UNIQUE ("quest_id", "ref_type", "ref_id");



ALTER TABLE ONLY "public"."quests"
    ADD CONSTRAINT "quests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roll_tables"
    ADD CONSTRAINT "roll_tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rules"
    ADD CONSTRAINT "rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scriptorium_documents"
    ADD CONSTRAINT "scriptorium_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_availability"
    ADD CONSTRAINT "session_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_availability"
    ADD CONSTRAINT "session_availability_session_proposal_id_user_id_key" UNIQUE ("session_proposal_id", "user_id");



ALTER TABLE ONLY "public"."session_proposals"
    ADD CONSTRAINT "session_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sounds"
    ADD CONSTRAINT "sounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."species"
    ADD CONSTRAINT "species_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spells"
    ADD CONSTRAINT "spells_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."srd_art_defaults"
    ADD CONSTRAINT "srd_art_defaults_content_type_srd_slug_key" UNIQUE ("content_type", "srd_slug");



ALTER TABLE ONLY "public"."srd_art_defaults"
    ADD CONSTRAINT "srd_art_defaults_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."srd_monster_art"
    ADD CONSTRAINT "srd_monster_art_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."srd_monster_art"
    ADD CONSTRAINT "srd_monster_art_user_id_srd_id_key" UNIQUE ("user_id", "srd_id");



ALTER TABLE ONLY "public"."srd_rules"
    ADD CONSTRAINT "srd_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."srd_rules"
    ADD CONSTRAINT "srd_rules_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."store_items"
    ADD CONSTRAINT "store_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_classes"
    ADD CONSTRAINT "system_classes_class_name_key" UNIQUE ("class_name");



ALTER TABLE ONLY "public"."system_classes"
    ADD CONSTRAINT "system_classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."traps"
    ADD CONSTRAINT "traps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "app_invites_token_idx" ON "public"."app_invites" USING "btree" ("token");



CREATE INDEX "backgrounds_open5e_import_idx" ON "public"."backgrounds" USING "btree" ("user_id", "open5e_import");



CREATE INDEX "calendar_events_campaign_idx" ON "public"."calendar_events" USING "btree" ("campaign_id") WHERE ("campaign_id" IS NOT NULL);



CREATE INDEX "calendar_events_linked_encounter_idx" ON "public"."calendar_events" USING "btree" ("linked_encounter_id") WHERE ("linked_encounter_id" IS NOT NULL);



CREATE INDEX "calendar_events_linked_location_idx" ON "public"."calendar_events" USING "btree" ("linked_location_id") WHERE ("linked_location_id" IS NOT NULL);



CREATE INDEX "calendar_events_linked_note_idx" ON "public"."calendar_events" USING "btree" ("linked_note_id") WHERE ("linked_note_id" IS NOT NULL);



CREATE INDEX "calendar_events_linked_quest_idx" ON "public"."calendar_events" USING "btree" ("linked_quest_id") WHERE ("linked_quest_id" IS NOT NULL);



CREATE INDEX "calendar_events_user_idx" ON "public"."calendar_events" USING "btree" ("user_id");



CREATE INDEX "calendar_events_year_idx" ON "public"."calendar_events" USING "btree" ("user_id", "harptos_year");



CREATE INDEX "campaign_invites_campaign_idx" ON "public"."campaign_invites" USING "btree" ("campaign_id");



CREATE INDEX "campaign_invites_token_idx" ON "public"."campaign_invites" USING "btree" ("token");



CREATE INDEX "campaign_members_campaign_idx" ON "public"."campaign_members" USING "btree" ("campaign_id");



CREATE INDEX "campaign_members_user_idx" ON "public"."campaign_members" USING "btree" ("user_id");



CREATE INDEX "campaign_messages_campaign_id_created_at" ON "public"."campaign_messages" USING "btree" ("campaign_id", "created_at" DESC);



CREATE UNIQUE INDEX "campaigns_ical_token_idx" ON "public"."campaigns" USING "btree" ("ical_token");



CREATE INDEX "character_classes_member_idx" ON "public"."character_classes" USING "btree" ("party_member_id");



CREATE UNIQUE INDEX "character_classes_one_primary_per_member" ON "public"."character_classes" USING "btree" ("party_member_id") WHERE "is_primary";



CREATE INDEX "character_spells_source_class_idx" ON "public"."character_spells" USING "btree" ("source_class_id");



CREATE UNIQUE INDEX "class_features_system_name_unique" ON "public"."class_features" USING "btree" ("name") WHERE ("user_id" IS NULL);



CREATE UNIQUE INDEX "dm_custom_uniq" ON "public"."discovered_monsters" USING "btree" ("campaign_id", "monster_id") WHERE ("monster_id" IS NOT NULL);



CREATE UNIQUE INDEX "dm_srd_uniq" ON "public"."discovered_monsters" USING "btree" ("campaign_id", "srd_slug") WHERE ("srd_slug" IS NOT NULL);



CREATE INDEX "encounters_campaign_idx" ON "public"."encounters" USING "btree" ("campaign_id") WHERE ("campaign_id" IS NOT NULL);



CREATE INDEX "hall_of_heroes_name_idx" ON "public"."hall_of_heroes" USING "btree" ("name");



CREATE INDEX "hall_of_heroes_setting_idx" ON "public"."hall_of_heroes" USING "btree" ("setting");



CREATE UNIQUE INDEX "hall_of_heroes_setting_name_key" ON "public"."hall_of_heroes" USING "btree" ("setting", "lower"("name"));



CREATE INDEX "loot_tables_campaign_idx" ON "public"."loot_tables" USING "btree" ("campaign_id");



CREATE INDEX "loot_tables_user_idx" ON "public"."loot_tables" USING "btree" ("user_id");



CREATE INDEX "monsters_open5e_import_idx" ON "public"."monsters" USING "btree" ("user_id", "open5e_import");



CREATE INDEX "notes_campaign_idx" ON "public"."notes" USING "btree" ("campaign_id") WHERE ("campaign_id" IS NOT NULL);



CREATE INDEX "notes_category_idx" ON "public"."notes" USING "btree" ("user_id", "category");



CREATE INDEX "notes_linked_calendar_event_idx" ON "public"."notes" USING "btree" ("linked_calendar_event_id") WHERE ("linked_calendar_event_id" IS NOT NULL);



CREATE INDEX "notes_tags_idx" ON "public"."notes" USING "gin" ("tags");



CREATE INDEX "notes_user_id_idx" ON "public"."notes" USING "btree" ("user_id");



CREATE INDEX "npc_pc_notes_npc_idx" ON "public"."npc_pc_notes" USING "btree" ("npc_id");



CREATE INDEX "npc_pc_notes_party_member_idx" ON "public"."npc_pc_notes" USING "btree" ("party_member_id");



CREATE INDEX "npcs_campaign_idx" ON "public"."npcs" USING "btree" ("campaign_id") WHERE ("campaign_id" IS NOT NULL);



CREATE INDEX "npcs_relationship_idx" ON "public"."npcs" USING "btree" ("user_id", "relationship");



CREATE INDEX "npcs_status_idx" ON "public"."npcs" USING "btree" ("user_id", "status");



CREATE INDEX "npcs_tags_idx" ON "public"."npcs" USING "gin" ("tags");



CREATE INDEX "npcs_user_idx" ON "public"."npcs" USING "btree" ("user_id");



CREATE INDEX "party_inventory_campaign_idx" ON "public"."party_inventory" USING "btree" ("campaign_id");



CREATE INDEX "party_members_campaign_idx" ON "public"."party_members" USING "btree" ("campaign_id") WHERE ("campaign_id" IS NOT NULL);



CREATE INDEX "roll_tables_campaign_idx" ON "public"."roll_tables" USING "btree" ("campaign_id");



CREATE INDEX "roll_tables_user_idx" ON "public"."roll_tables" USING "btree" ("user_id");



CREATE INDEX "scriptorium_docs_type_idx" ON "public"."scriptorium_documents" USING "btree" ("user_id", "doc_type");



CREATE INDEX "scriptorium_docs_user_idx" ON "public"."scriptorium_documents" USING "btree" ("user_id");



CREATE INDEX "session_availability_campaign_idx" ON "public"."session_availability" USING "btree" ("campaign_id");



CREATE INDEX "session_availability_proposal_idx" ON "public"."session_availability" USING "btree" ("session_proposal_id");



CREATE INDEX "session_proposals_campaign_idx" ON "public"."session_proposals" USING "btree" ("campaign_id");



CREATE INDEX "session_proposals_date_idx" ON "public"."session_proposals" USING "btree" ("proposed_date");



CREATE INDEX "srd_rules_parent_slug_idx" ON "public"."srd_rules" USING "btree" ("parent_slug");



CREATE OR REPLACE TRIGGER "backgrounds_updated_at" BEFORE UPDATE ON "public"."backgrounds" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "calendar_events_updated_at" BEFORE UPDATE ON "public"."calendar_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "campaign_members_updated_at" BEFORE UPDATE ON "public"."campaign_members" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "campaign_rules_updated_at" BEFORE UPDATE ON "public"."campaign_rules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "campaigns_create_dm_membership" AFTER INSERT ON "public"."campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."create_dm_membership"();



CREATE OR REPLACE TRIGGER "campaigns_enforce_quota" BEFORE INSERT ON "public"."campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_quota"();



CREATE OR REPLACE TRIGGER "campaigns_updated_at" BEFORE UPDATE ON "public"."campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "character_classes_updated_at" BEFORE UPDATE ON "public"."character_classes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "character_spells_updated_at" BEFORE UPDATE ON "public"."character_spells" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "chronicler_images_updated_at" BEFORE UPDATE ON "public"."chronicler_images" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "class_features_updated_at" BEFORE UPDATE ON "public"."class_features" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "companion_player_notes_updated_at" BEFORE UPDATE ON "public"."companion_player_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "companions_updated_at" BEFORE UPDATE ON "public"."companions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "crafting_recipes_updated_at" BEFORE UPDATE ON "public"."crafting_recipes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "custom_classes_updated_at" BEFORE UPDATE ON "public"."custom_classes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "custom_subclasses_updated_at" BEFORE UPDATE ON "public"."custom_subclasses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "dungeon_features_updated_at" BEFORE UPDATE ON "public"."dungeon_features" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "encounter_state_updated_at" BEFORE UPDATE ON "public"."encounter_state" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "encounters_enforce_quota" BEFORE INSERT ON "public"."encounters" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_quota"();



CREATE OR REPLACE TRIGGER "entity_notes_updated_at" BEFORE UPDATE ON "public"."entity_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "faction_party_members_updated_at" BEFORE UPDATE ON "public"."faction_party_members" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "faction_relations_updated_at" BEFORE UPDATE ON "public"."faction_relations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "factions_updated_at" BEFORE UPDATE ON "public"."factions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "hall_of_heroes_updated_at" BEFORE UPDATE ON "public"."hall_of_heroes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "items_updated_at" BEFORE UPDATE ON "public"."items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "loot_tables_updated_at" BEFORE UPDATE ON "public"."loot_tables" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "monsters_enforce_quota" BEFORE INSERT ON "public"."monsters" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_quota"();



CREATE OR REPLACE TRIGGER "monsters_updated_at" BEFORE UPDATE ON "public"."monsters" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "notes_enforce_quota" BEFORE INSERT ON "public"."notes" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_quota"();



CREATE OR REPLACE TRIGGER "notes_updated_at" BEFORE UPDATE ON "public"."notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "npc_inventory_updated_at" BEFORE UPDATE ON "public"."npc_inventory" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "npc_pc_notes_updated_at" BEFORE UPDATE ON "public"."npc_pc_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "npc_player_notes_updated_at" BEFORE UPDATE ON "public"."npc_player_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "npc_relationships_updated_at" BEFORE UPDATE ON "public"."npc_relationships" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "npcs_enforce_quota" BEFORE INSERT ON "public"."npcs" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_quota"();



CREATE OR REPLACE TRIGGER "npcs_updated_at" BEFORE UPDATE ON "public"."npcs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "party_inventory_updated_at" BEFORE UPDATE ON "public"."party_inventory" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "party_member_player_notes_updated_at" BEFORE UPDATE ON "public"."party_member_player_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "party_member_tracker_state_updated_at" BEFORE UPDATE ON "public"."party_member_tracker_state" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "party_members_updated_at" BEFORE UPDATE ON "public"."party_members" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "pinned_forms_updated_at" BEFORE UPDATE ON "public"."pinned_forms" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "player_journal_entries_updated_at" BEFORE UPDATE ON "public"."player_journal_entries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "puzzle_rooms_updated_at" BEFORE UPDATE ON "public"."puzzle_rooms" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "roll_tables_updated_at" BEFORE UPDATE ON "public"."roll_tables" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "rules_updated_at" BEFORE UPDATE ON "public"."rules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "scriptorium_documents_enforce_quota" BEFORE INSERT ON "public"."scriptorium_documents" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_quota"();



CREATE OR REPLACE TRIGGER "scriptorium_updated_at" BEFORE UPDATE ON "public"."scriptorium_documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "session_availability_updated_at" BEFORE UPDATE ON "public"."session_availability" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "session_proposals_updated_at" BEFORE UPDATE ON "public"."session_proposals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_encounters_updated_at" BEFORE UPDATE ON "public"."encounters" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_locations_updated_at" BEFORE UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_quests_updated_at" BEFORE UPDATE ON "public"."quests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "sounds_updated_at" BEFORE UPDATE ON "public"."sounds" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "species_updated_at" BEFORE UPDATE ON "public"."species" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "srd_art_defaults_updated_at" BEFORE UPDATE ON "public"."srd_art_defaults" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "srd_monster_art_updated_at" BEFORE UPDATE ON "public"."srd_monster_art" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "srd_rules_updated_at" BEFORE UPDATE ON "public"."srd_rules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "store_items_updated_at" BEFORE UPDATE ON "public"."store_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "system_classes_updated_at" BEFORE UPDATE ON "public"."system_classes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "traps_updated_at" BEFORE UPDATE ON "public"."traps" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_spells_updated_at" BEFORE UPDATE ON "public"."spells" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "user_subscriptions_updated_at" BEFORE UPDATE ON "public"."user_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."backgrounds"
    ADD CONSTRAINT "backgrounds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_linked_encounter_id_fkey" FOREIGN KEY ("linked_encounter_id") REFERENCES "public"."encounters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_linked_location_id_fkey" FOREIGN KEY ("linked_location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_linked_note_id_fkey" FOREIGN KEY ("linked_note_id") REFERENCES "public"."notes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_linked_quest_id_fkey" FOREIGN KEY ("linked_quest_id") REFERENCES "public"."quests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_invites"
    ADD CONSTRAINT "campaign_invites_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_invites"
    ADD CONSTRAINT "campaign_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."campaign_members"
    ADD CONSTRAINT "campaign_members_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_members"
    ADD CONSTRAINT "campaign_members_party_member_id_fkey" FOREIGN KEY ("party_member_id") REFERENCES "public"."party_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_members"
    ADD CONSTRAINT "campaign_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_messages"
    ADD CONSTRAINT "campaign_messages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_messages"
    ADD CONSTRAINT "campaign_messages_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."campaign_messages"
    ADD CONSTRAINT "campaign_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."campaign_rules"
    ADD CONSTRAINT "campaign_rules_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."character_classes"
    ADD CONSTRAINT "character_classes_party_member_id_fkey" FOREIGN KEY ("party_member_id") REFERENCES "public"."party_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."character_spells"
    ADD CONSTRAINT "character_spells_party_member_id_fkey" FOREIGN KEY ("party_member_id") REFERENCES "public"."party_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."character_spells"
    ADD CONSTRAINT "character_spells_source_class_id_fkey" FOREIGN KEY ("source_class_id") REFERENCES "public"."character_classes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."character_spells"
    ADD CONSTRAINT "character_spells_spell_id_fkey" FOREIGN KEY ("spell_id") REFERENCES "public"."spells"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chronicler_images"
    ADD CONSTRAINT "chronicler_images_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chronicler_images"
    ADD CONSTRAINT "chronicler_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_features"
    ADD CONSTRAINT "class_features_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."class_features"
    ADD CONSTRAINT "class_features_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."companion_player_notes"
    ADD CONSTRAINT "companion_player_notes_companion_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."companion_player_notes"
    ADD CONSTRAINT "companion_player_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."companions"
    ADD CONSTRAINT "companions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."companions"
    ADD CONSTRAINT "companions_owner_party_member_id_fkey" FOREIGN KEY ("owner_party_member_id") REFERENCES "public"."party_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."companions"
    ADD CONSTRAINT "companions_source_npc_id_fkey" FOREIGN KEY ("source_npc_id") REFERENCES "public"."npcs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."companions"
    ADD CONSTRAINT "companions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crafting_recipe_grants"
    ADD CONSTRAINT "crafting_recipe_grants_party_member_id_fkey" FOREIGN KEY ("party_member_id") REFERENCES "public"."party_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crafting_recipe_grants"
    ADD CONSTRAINT "crafting_recipe_grants_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."crafting_recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crafting_recipe_ingredients"
    ADD CONSTRAINT "crafting_recipe_ingredients_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crafting_recipe_ingredients"
    ADD CONSTRAINT "crafting_recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."crafting_recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crafting_recipe_modifiers"
    ADD CONSTRAINT "crafting_recipe_modifiers_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."crafting_recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crafting_recipe_outputs"
    ADD CONSTRAINT "crafting_recipe_outputs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crafting_recipe_outputs"
    ADD CONSTRAINT "crafting_recipe_outputs_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."crafting_recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crafting_recipes"
    ADD CONSTRAINT "crafting_recipes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crafting_recipes"
    ADD CONSTRAINT "crafting_recipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_classes"
    ADD CONSTRAINT "custom_classes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."custom_classes"
    ADD CONSTRAINT "custom_classes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."custom_subclasses"
    ADD CONSTRAINT "custom_subclasses_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."custom_subclasses"
    ADD CONSTRAINT "custom_subclasses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."discovered_monsters"
    ADD CONSTRAINT "discovered_monsters_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."discovered_monsters"
    ADD CONSTRAINT "discovered_monsters_monster_id_fkey" FOREIGN KEY ("monster_id") REFERENCES "public"."monsters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dungeon_features"
    ADD CONSTRAINT "dungeon_features_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."encounter_state"
    ADD CONSTRAINT "encounter_state_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."encounter_state"
    ADD CONSTRAINT "encounter_state_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."encounter_state"
    ADD CONSTRAINT "encounter_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."encounters"
    ADD CONSTRAINT "encounters_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."encounters"
    ADD CONSTRAINT "encounters_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."encounters"
    ADD CONSTRAINT "encounters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entity_notes"
    ADD CONSTRAINT "entity_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faction_items"
    ADD CONSTRAINT "faction_items_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faction_items"
    ADD CONSTRAINT "faction_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faction_items"
    ADD CONSTRAINT "faction_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faction_locations"
    ADD CONSTRAINT "faction_locations_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faction_locations"
    ADD CONSTRAINT "faction_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faction_locations"
    ADD CONSTRAINT "faction_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faction_npcs"
    ADD CONSTRAINT "faction_npcs_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faction_npcs"
    ADD CONSTRAINT "faction_npcs_npc_id_fkey" FOREIGN KEY ("npc_id") REFERENCES "public"."npcs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faction_npcs"
    ADD CONSTRAINT "faction_npcs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faction_party_members"
    ADD CONSTRAINT "faction_party_members_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faction_party_members"
    ADD CONSTRAINT "faction_party_members_party_member_id_fkey" FOREIGN KEY ("party_member_id") REFERENCES "public"."party_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faction_party_members"
    ADD CONSTRAINT "faction_party_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."faction_relations"
    ADD CONSTRAINT "faction_relations_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faction_relations"
    ADD CONSTRAINT "faction_relations_target_faction_id_fkey" FOREIGN KEY ("target_faction_id") REFERENCES "public"."factions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faction_relations"
    ADD CONSTRAINT "faction_relations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."factions"
    ADD CONSTRAINT "factions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."factions"
    ADD CONSTRAINT "factions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hall_of_heroes"
    ADD CONSTRAINT "hall_of_heroes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_npc_owner_id_fkey" FOREIGN KEY ("npc_owner_id") REFERENCES "public"."npcs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loot_tables"
    ADD CONSTRAINT "loot_tables_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loot_tables"
    ADD CONSTRAINT "loot_tables_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monsters"
    ADD CONSTRAINT "monsters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_linked_calendar_event_fk" FOREIGN KEY ("linked_calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."npc_inventory"
    ADD CONSTRAINT "npc_inventory_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."npc_inventory"
    ADD CONSTRAINT "npc_inventory_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."npc_inventory"
    ADD CONSTRAINT "npc_inventory_npc_id_fkey" FOREIGN KEY ("npc_id") REFERENCES "public"."npcs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."npc_inventory"
    ADD CONSTRAINT "npc_inventory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."npc_pc_notes"
    ADD CONSTRAINT "npc_pc_notes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."npc_pc_notes"
    ADD CONSTRAINT "npc_pc_notes_npc_id_fkey" FOREIGN KEY ("npc_id") REFERENCES "public"."npcs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."npc_pc_notes"
    ADD CONSTRAINT "npc_pc_notes_party_member_id_fkey" FOREIGN KEY ("party_member_id") REFERENCES "public"."party_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."npc_pc_notes"
    ADD CONSTRAINT "npc_pc_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."npc_player_notes"
    ADD CONSTRAINT "npc_player_notes_npc_id_fkey" FOREIGN KEY ("npc_id") REFERENCES "public"."npcs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."npc_player_notes"
    ADD CONSTRAINT "npc_player_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."npc_relationships"
    ADD CONSTRAINT "npc_relationships_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."npc_relationships"
    ADD CONSTRAINT "npc_relationships_npc_id_fkey" FOREIGN KEY ("npc_id") REFERENCES "public"."npcs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."npc_relationships"
    ADD CONSTRAINT "npc_relationships_related_npc_id_fkey" FOREIGN KEY ("related_npc_id") REFERENCES "public"."npcs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."npc_relationships"
    ADD CONSTRAINT "npc_relationships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."npcs"
    ADD CONSTRAINT "npcs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."npcs"
    ADD CONSTRAINT "npcs_linked_monster_id_fkey" FOREIGN KEY ("linked_monster_id") REFERENCES "public"."monsters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."npcs"
    ADD CONSTRAINT "npcs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."npcs"
    ADD CONSTRAINT "npcs_scriptorium_doc_id_fkey" FOREIGN KEY ("scriptorium_doc_id") REFERENCES "public"."scriptorium_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."npcs"
    ADD CONSTRAINT "npcs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."party_inventory"
    ADD CONSTRAINT "party_inventory_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."party_inventory"
    ADD CONSTRAINT "party_inventory_carried_by_fkey" FOREIGN KEY ("carried_by") REFERENCES "public"."party_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."party_inventory"
    ADD CONSTRAINT "party_inventory_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "public"."party_inventory"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."party_inventory"
    ADD CONSTRAINT "party_inventory_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."party_inventory"
    ADD CONSTRAINT "party_inventory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."party_member_player_notes"
    ADD CONSTRAINT "party_member_player_notes_party_member_id_fkey" FOREIGN KEY ("party_member_id") REFERENCES "public"."party_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."party_member_player_notes"
    ADD CONSTRAINT "party_member_player_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."party_member_tracker_state"
    ADD CONSTRAINT "party_member_tracker_state_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."party_member_tracker_state"
    ADD CONSTRAINT "party_member_tracker_state_party_member_id_fkey" FOREIGN KEY ("party_member_id") REFERENCES "public"."party_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."party_member_tracker_state"
    ADD CONSTRAINT "party_member_tracker_state_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."party_members"
    ADD CONSTRAINT "party_members_background_id_fkey" FOREIGN KEY ("background_id") REFERENCES "public"."backgrounds"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."party_members"
    ADD CONSTRAINT "party_members_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."party_members"
    ADD CONSTRAINT "party_members_current_location_id_fkey" FOREIGN KEY ("current_location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."party_members"
    ADD CONSTRAINT "party_members_disguise_species_id_fkey" FOREIGN KEY ("disguise_species_id") REFERENCES "public"."species"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."party_members"
    ADD CONSTRAINT "party_members_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."party_members"
    ADD CONSTRAINT "party_members_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."party_members"
    ADD CONSTRAINT "party_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pinned_forms"
    ADD CONSTRAINT "pinned_forms_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pinned_forms"
    ADD CONSTRAINT "pinned_forms_monster_id_fkey" FOREIGN KEY ("monster_id") REFERENCES "public"."monsters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pinned_forms"
    ADD CONSTRAINT "pinned_forms_party_member_id_fkey" FOREIGN KEY ("party_member_id") REFERENCES "public"."party_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_journal_entries"
    ADD CONSTRAINT "player_journal_entries_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_journal_entries"
    ADD CONSTRAINT "player_journal_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."puzzle_rooms"
    ADD CONSTRAINT "puzzle_rooms_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."puzzle_rooms"
    ADD CONSTRAINT "puzzle_rooms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quest_objectives"
    ADD CONSTRAINT "quest_objectives_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quest_refs"
    ADD CONSTRAINT "quest_refs_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quests"
    ADD CONSTRAINT "quests_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quests"
    ADD CONSTRAINT "quests_giver_npc_id_fkey" FOREIGN KEY ("giver_npc_id") REFERENCES "public"."npcs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quests"
    ADD CONSTRAINT "quests_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quests"
    ADD CONSTRAINT "quests_parent_quest_id_fkey" FOREIGN KEY ("parent_quest_id") REFERENCES "public"."quests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quests"
    ADD CONSTRAINT "quests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roll_tables"
    ADD CONSTRAINT "roll_tables_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."roll_tables"
    ADD CONSTRAINT "roll_tables_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rules"
    ADD CONSTRAINT "rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scriptorium_documents"
    ADD CONSTRAINT "scriptorium_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_availability"
    ADD CONSTRAINT "session_availability_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_availability"
    ADD CONSTRAINT "session_availability_session_proposal_id_fkey" FOREIGN KEY ("session_proposal_id") REFERENCES "public"."session_proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_availability"
    ADD CONSTRAINT "session_availability_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_proposals"
    ADD CONSTRAINT "session_proposals_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_proposals"
    ADD CONSTRAINT "session_proposals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sounds"
    ADD CONSTRAINT "sounds_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sounds"
    ADD CONSTRAINT "sounds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."species"
    ADD CONSTRAINT "species_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spells"
    ADD CONSTRAINT "spells_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."srd_art_defaults"
    ADD CONSTRAINT "srd_art_defaults_contributed_by_fkey" FOREIGN KEY ("contributed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."srd_monster_art"
    ADD CONSTRAINT "srd_monster_art_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."store_items"
    ADD CONSTRAINT "store_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."store_items"
    ADD CONSTRAINT "store_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."store_items"
    ADD CONSTRAINT "store_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."traps"
    ADD CONSTRAINT "traps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Campaign members can read campaign locations" ON "public"."locations" FOR SELECT USING ("public"."is_campaign_member"("campaign_id"));



CREATE POLICY "Campaign members see companions" ON "public"."companions" FOR SELECT USING ("public"."is_campaign_member"("campaign_id"));



CREATE POLICY "Users can delete objectives of own quests" ON "public"."quest_objectives" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."quests"
  WHERE (("quests"."id" = "quest_objectives"."quest_id") AND ("auth"."uid"() = "quests"."user_id")))));



CREATE POLICY "Users can delete own locations" ON "public"."locations" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own quests" ON "public"."quests" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete refs of own quests" ON "public"."quest_refs" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."quests"
  WHERE (("quests"."id" = "quest_refs"."quest_id") AND ("auth"."uid"() = "quests"."user_id")))));



CREATE POLICY "Users can insert objectives to own quests" ON "public"."quest_objectives" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."quests"
  WHERE (("quests"."id" = "quest_objectives"."quest_id") AND ("auth"."uid"() = "quests"."user_id")))));



CREATE POLICY "Users can insert own locations" ON "public"."locations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own quests" ON "public"."quests" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert refs to own quests" ON "public"."quest_refs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."quests"
  WHERE (("quests"."id" = "quest_refs"."quest_id") AND ("auth"."uid"() = "quests"."user_id")))));



CREATE POLICY "Users can read objectives of own quests" ON "public"."quest_objectives" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."quests"
  WHERE (("quests"."id" = "quest_objectives"."quest_id") AND ("auth"."uid"() = "quests"."user_id")))));



CREATE POLICY "Users can read own locations" ON "public"."locations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own quests" ON "public"."quests" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read refs of own quests" ON "public"."quest_refs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."quests"
  WHERE (("quests"."id" = "quest_refs"."quest_id") AND ("auth"."uid"() = "quests"."user_id")))));



CREATE POLICY "Users can update objectives of own quests" ON "public"."quest_objectives" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."quests"
  WHERE (("quests"."id" = "quest_objectives"."quest_id") AND ("auth"."uid"() = "quests"."user_id")))));



CREATE POLICY "Users can update own locations" ON "public"."locations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own quests" ON "public"."quests" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update refs of own quests" ON "public"."quest_refs" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."quests"
  WHERE (("quests"."id" = "quest_refs"."quest_id") AND ("auth"."uid"() = "quests"."user_id")))));



CREATE POLICY "Users delete own docs" ON "public"."scriptorium_documents" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users delete own events" ON "public"."calendar_events" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users delete own notes" ON "public"."notes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users delete own npcs" ON "public"."npcs" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users insert own docs" ON "public"."scriptorium_documents" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users insert own events" ON "public"."calendar_events" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users insert own notes" ON "public"."notes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users insert own npcs" ON "public"."npcs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own campaigns" ON "public"."campaigns" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users see own docs" ON "public"."scriptorium_documents" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users see own events" ON "public"."calendar_events" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users see own npcs" ON "public"."npcs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own docs" ON "public"."scriptorium_documents" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own events" ON "public"."calendar_events" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own notes" ON "public"."notes" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own npcs" ON "public"."npcs" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."app_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_invites_admin_read" ON "public"."app_invites" FOR SELECT USING ("public"."is_app_admin"());



CREATE POLICY "app_invites_admin_write" ON "public"."app_invites" USING ("public"."is_app_admin"()) WITH CHECK ("public"."is_app_admin"());



ALTER TABLE "public"."backgrounds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "backgrounds_delete" ON "public"."backgrounds" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "backgrounds_insert" ON "public"."backgrounds" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "backgrounds_select" ON "public"."backgrounds" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."is_dm_of_my_campaigns"("user_id")));



CREATE POLICY "backgrounds_update" ON "public"."backgrounds" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."calendar_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_invites_dm_all" ON "public"."campaign_invites" USING ("public"."is_campaign_dm"("campaign_id")) WITH CHECK ("public"."is_campaign_dm"("campaign_id"));



ALTER TABLE "public"."campaign_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_members_dm_all" ON "public"."campaign_members" USING ("public"."is_campaign_dm"("campaign_id")) WITH CHECK ("public"."is_campaign_dm"("campaign_id"));



CREATE POLICY "campaign_members_select" ON "public"."campaign_members" FOR SELECT USING ("public"."is_campaign_member"("campaign_id"));



CREATE POLICY "campaign_members_update_own" ON "public"."campaign_members" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."campaign_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_messages_claim" ON "public"."campaign_messages" FOR UPDATE USING ((("type" = ANY (ARRAY['item_drop'::"text", 'currency_drop'::"text", 'vendor_offer'::"text", 'player_offer'::"text", 'loot_chest'::"text"])) AND "public"."is_campaign_member"("campaign_id")));



CREATE POLICY "campaign_messages_delete" ON "public"."campaign_messages" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "campaign_messages_delete_dm" ON "public"."campaign_messages" FOR DELETE USING ("public"."is_campaign_dm"("campaign_id"));



CREATE POLICY "campaign_messages_insert" ON "public"."campaign_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_campaign_member"("campaign_id")));



CREATE POLICY "campaign_messages_select" ON "public"."campaign_messages" FOR SELECT USING (("public"."is_campaign_member"("campaign_id") AND (("recipient_user_id" IS NULL) OR ("auth"."uid"() = "user_id") OR ("auth"."uid"() = "recipient_user_id") OR "public"."is_campaign_dm"("campaign_id"))));



ALTER TABLE "public"."campaign_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_rules_delete" ON "public"."campaign_rules" FOR DELETE USING ("public"."is_campaign_dm"("campaign_id"));



CREATE POLICY "campaign_rules_insert" ON "public"."campaign_rules" FOR INSERT WITH CHECK ("public"."is_campaign_dm"("campaign_id"));



CREATE POLICY "campaign_rules_select" ON "public"."campaign_rules" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."campaign_members"
  WHERE (("campaign_members"."campaign_id" = "campaign_rules"."campaign_id") AND ("campaign_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "campaign_rules"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"()))))));



CREATE POLICY "campaign_rules_update" ON "public"."campaign_rules" FOR UPDATE USING ("public"."is_campaign_dm"("campaign_id"));



ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaigns_member_select" ON "public"."campaigns" FOR SELECT USING ("public"."is_campaign_member"("id"));



ALTER TABLE "public"."character_classes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "character_classes_delete" ON "public"."character_classes" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."party_members" "pm"
  WHERE (("pm"."id" = "character_classes"."party_member_id") AND ("pm"."user_id" = "auth"."uid"())))));



CREATE POLICY "character_classes_insert" ON "public"."character_classes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."party_members" "pm"
  WHERE (("pm"."id" = "character_classes"."party_member_id") AND ("pm"."user_id" = "auth"."uid"())))));



CREATE POLICY "character_classes_select" ON "public"."character_classes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."party_members" "pm"
  WHERE (("pm"."id" = "character_classes"."party_member_id") AND ("pm"."user_id" = "auth"."uid"())))));



CREATE POLICY "character_classes_update" ON "public"."character_classes" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."party_members" "pm"
  WHERE (("pm"."id" = "character_classes"."party_member_id") AND ("pm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."character_spells" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "character_spells_delete" ON "public"."character_spells" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."campaign_members"
  WHERE (("campaign_members"."party_member_id" = "character_spells"."party_member_id") AND ("campaign_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."campaign_members" "cm_player"
     JOIN "public"."campaign_members" "cm_dm" ON ((("cm_dm"."campaign_id" = "cm_player"."campaign_id") AND ("cm_dm"."role" = 'dm'::"text") AND ("cm_dm"."user_id" = "auth"."uid"()))))
  WHERE ("cm_player"."party_member_id" = "character_spells"."party_member_id")))));



CREATE POLICY "character_spells_insert" ON "public"."character_spells" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."campaign_members"
  WHERE (("campaign_members"."party_member_id" = "character_spells"."party_member_id") AND ("campaign_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."campaign_members" "cm_player"
     JOIN "public"."campaign_members" "cm_dm" ON ((("cm_dm"."campaign_id" = "cm_player"."campaign_id") AND ("cm_dm"."role" = 'dm'::"text") AND ("cm_dm"."user_id" = "auth"."uid"()))))
  WHERE ("cm_player"."party_member_id" = "character_spells"."party_member_id")))));



CREATE POLICY "character_spells_select" ON "public"."character_spells" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."campaign_members"
  WHERE (("campaign_members"."party_member_id" = "character_spells"."party_member_id") AND ("campaign_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."campaign_members" "cm_player"
     JOIN "public"."campaign_members" "cm_dm" ON ((("cm_dm"."campaign_id" = "cm_player"."campaign_id") AND ("cm_dm"."role" = 'dm'::"text") AND ("cm_dm"."user_id" = "auth"."uid"()))))
  WHERE ("cm_player"."party_member_id" = "character_spells"."party_member_id")))));



CREATE POLICY "character_spells_update" ON "public"."character_spells" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."campaign_members"
  WHERE (("campaign_members"."party_member_id" = "character_spells"."party_member_id") AND ("campaign_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."campaign_members" "cm_player"
     JOIN "public"."campaign_members" "cm_dm" ON ((("cm_dm"."campaign_id" = "cm_player"."campaign_id") AND ("cm_dm"."role" = 'dm'::"text") AND ("cm_dm"."user_id" = "auth"."uid"()))))
  WHERE ("cm_player"."party_member_id" = "character_spells"."party_member_id")))));



ALTER TABLE "public"."chronicler_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chronicler_images_delete" ON "public"."chronicler_images" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "chronicler_images_insert" ON "public"."chronicler_images" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "chronicler_images_select" ON "public"."chronicler_images" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."class_features" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "class_features_delete" ON "public"."class_features" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "class_features_insert" ON "public"."class_features" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "class_features_select" ON "public"."class_features" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("user_id" IS NULL) OR "public"."is_dm_of_my_campaigns"("user_id")));



CREATE POLICY "class_features_update" ON "public"."class_features" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (("user_id" IS NULL) AND ("auth"."uid"() IS NOT NULL)))) WITH CHECK ((("auth"."uid"() = "user_id") OR (("user_id" IS NULL) AND ("auth"."uid"() IS NOT NULL))));



ALTER TABLE "public"."companion_player_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "companion_player_notes_delete" ON "public"."companion_player_notes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "companion_player_notes_insert" ON "public"."companion_player_notes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "companion_player_notes_select" ON "public"."companion_player_notes" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "companion_player_notes_update" ON "public"."companion_player_notes" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."companions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "companions_delete" ON "public"."companions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "companions_insert" ON "public"."companions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "companions_select" ON "public"."companions" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (("campaign_id" IS NOT NULL) AND "public"."is_campaign_member"("campaign_id"))));



CREATE POLICY "companions_update" ON "public"."companions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."crafting_recipe_grants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crafting_recipe_grants_delete" ON "public"."crafting_recipe_grants" FOR DELETE USING (("recipe_id" IN ( SELECT "crafting_recipes"."id"
   FROM "public"."crafting_recipes"
  WHERE ("crafting_recipes"."user_id" = "auth"."uid"()))));



CREATE POLICY "crafting_recipe_grants_insert" ON "public"."crafting_recipe_grants" FOR INSERT WITH CHECK (("recipe_id" IN ( SELECT "crafting_recipes"."id"
   FROM "public"."crafting_recipes"
  WHERE ("crafting_recipes"."user_id" = "auth"."uid"()))));



CREATE POLICY "crafting_recipe_grants_select" ON "public"."crafting_recipe_grants" FOR SELECT USING (("public"."owns_crafting_recipe"("recipe_id") OR ("party_member_id" IN ( SELECT "party_members"."id"
   FROM "public"."party_members"
  WHERE ("party_members"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."crafting_recipe_ingredients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crafting_recipe_ingredients_delete" ON "public"."crafting_recipe_ingredients" FOR DELETE USING (("recipe_id" IN ( SELECT "crafting_recipes"."id"
   FROM "public"."crafting_recipes"
  WHERE ("crafting_recipes"."user_id" = "auth"."uid"()))));



CREATE POLICY "crafting_recipe_ingredients_insert" ON "public"."crafting_recipe_ingredients" FOR INSERT WITH CHECK (("recipe_id" IN ( SELECT "crafting_recipes"."id"
   FROM "public"."crafting_recipes"
  WHERE ("crafting_recipes"."user_id" = "auth"."uid"()))));



CREATE POLICY "crafting_recipe_ingredients_select" ON "public"."crafting_recipe_ingredients" FOR SELECT USING (("recipe_id" IN ( SELECT "crafting_recipes"."id"
   FROM "public"."crafting_recipes")));



ALTER TABLE "public"."crafting_recipe_modifiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crafting_recipe_modifiers_delete" ON "public"."crafting_recipe_modifiers" FOR DELETE USING (("recipe_id" IN ( SELECT "crafting_recipes"."id"
   FROM "public"."crafting_recipes"
  WHERE ("crafting_recipes"."user_id" = "auth"."uid"()))));



CREATE POLICY "crafting_recipe_modifiers_insert" ON "public"."crafting_recipe_modifiers" FOR INSERT WITH CHECK (("recipe_id" IN ( SELECT "crafting_recipes"."id"
   FROM "public"."crafting_recipes"
  WHERE ("crafting_recipes"."user_id" = "auth"."uid"()))));



CREATE POLICY "crafting_recipe_modifiers_select" ON "public"."crafting_recipe_modifiers" FOR SELECT USING (("recipe_id" IN ( SELECT "crafting_recipes"."id"
   FROM "public"."crafting_recipes")));



ALTER TABLE "public"."crafting_recipe_outputs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crafting_recipe_outputs_delete" ON "public"."crafting_recipe_outputs" FOR DELETE USING (("recipe_id" IN ( SELECT "crafting_recipes"."id"
   FROM "public"."crafting_recipes"
  WHERE ("crafting_recipes"."user_id" = "auth"."uid"()))));



CREATE POLICY "crafting_recipe_outputs_insert" ON "public"."crafting_recipe_outputs" FOR INSERT WITH CHECK (("recipe_id" IN ( SELECT "crafting_recipes"."id"
   FROM "public"."crafting_recipes"
  WHERE ("crafting_recipes"."user_id" = "auth"."uid"()))));



CREATE POLICY "crafting_recipe_outputs_select" ON "public"."crafting_recipe_outputs" FOR SELECT USING (("recipe_id" IN ( SELECT "crafting_recipes"."id"
   FROM "public"."crafting_recipes")));



ALTER TABLE "public"."crafting_recipes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crafting_recipes_delete" ON "public"."crafting_recipes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "crafting_recipes_insert" ON "public"."crafting_recipes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "crafting_recipes_select" ON "public"."crafting_recipes" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "crafting_recipes_select_player" ON "public"."crafting_recipes" FOR SELECT USING ((("campaign_id" IS NOT NULL) AND "public"."is_campaign_member"("campaign_id") AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "cm"
  WHERE (("cm"."user_id" = "auth"."uid"()) AND ("cm"."campaign_id" = "crafting_recipes"."campaign_id") AND ("cm"."party_member_id" = ANY ("crafting_recipes"."player_visible_to")))))));



CREATE POLICY "crafting_recipes_update" ON "public"."crafting_recipes" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."custom_classes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "custom_classes_delete" ON "public"."custom_classes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "custom_classes_insert" ON "public"."custom_classes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "custom_classes_select" ON "public"."custom_classes" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."is_dm_of_my_campaigns"("user_id")));



CREATE POLICY "custom_classes_update" ON "public"."custom_classes" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."custom_subclasses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "custom_subclasses_delete" ON "public"."custom_subclasses" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "custom_subclasses_insert" ON "public"."custom_subclasses" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "custom_subclasses_select" ON "public"."custom_subclasses" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."is_dm_of_my_campaigns"("user_id")));



CREATE POLICY "custom_subclasses_update" ON "public"."custom_subclasses" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."discovered_monsters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dm_full" ON "public"."discovered_monsters" USING ("public"."is_campaign_dm"("campaign_id")) WITH CHECK ("public"."is_campaign_dm"("campaign_id"));



ALTER TABLE "public"."dungeon_features" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dungeon_features_delete" ON "public"."dungeon_features" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "dungeon_features_insert" ON "public"."dungeon_features" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "dungeon_features_select" ON "public"."dungeon_features" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "dungeon_features_update" ON "public"."dungeon_features" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."encounter_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "encounter_state_dm_all" ON "public"."encounter_state" USING ("public"."is_campaign_dm"("campaign_id")) WITH CHECK ("public"."is_campaign_dm"("campaign_id"));



CREATE POLICY "encounter_state_member_select" ON "public"."encounter_state" FOR SELECT USING ("public"."is_campaign_member"("campaign_id"));



CREATE POLICY "encounter_state_member_update" ON "public"."encounter_state" FOR UPDATE USING ("public"."is_campaign_member"("campaign_id")) WITH CHECK ("public"."is_campaign_member"("campaign_id"));



ALTER TABLE "public"."encounters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."entity_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "entity_notes_campaign_shared" ON "public"."entity_notes" FOR SELECT USING ((("is_private" = false) AND (EXISTS ( SELECT 1
   FROM ("public"."campaign_members" "cm_author"
     JOIN "public"."campaign_members" "cm_viewer" ON (("cm_author"."campaign_id" = "cm_viewer"."campaign_id")))
  WHERE (("cm_author"."user_id" = "entity_notes"."user_id") AND ("cm_viewer"."user_id" = "auth"."uid"()))))));



CREATE POLICY "entity_notes_delete" ON "public"."entity_notes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "entity_notes_insert" ON "public"."entity_notes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "entity_notes_own" ON "public"."entity_notes" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "entity_notes_update" ON "public"."entity_notes" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."faction_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "faction_items_delete" ON "public"."faction_items" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "faction_items_insert" ON "public"."faction_items" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "faction_items_select" ON "public"."faction_items" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "faction_items_update" ON "public"."faction_items" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."faction_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "faction_locations_delete" ON "public"."faction_locations" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "faction_locations_insert" ON "public"."faction_locations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "faction_locations_select" ON "public"."faction_locations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "faction_locations_update" ON "public"."faction_locations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."faction_npcs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "faction_npcs_delete" ON "public"."faction_npcs" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "faction_npcs_insert" ON "public"."faction_npcs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "faction_npcs_select" ON "public"."faction_npcs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "faction_npcs_shared_faction_member_select" ON "public"."faction_npcs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."faction_party_members" "fpm"
     JOIN "public"."campaign_members" "cm" ON (("cm"."party_member_id" = "fpm"."party_member_id")))
  WHERE (("fpm"."faction_id" = "faction_npcs"."faction_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = 'player'::"text")))));



CREATE POLICY "faction_npcs_update" ON "public"."faction_npcs" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."faction_party_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "faction_party_members_delete" ON "public"."faction_party_members" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "faction_party_members_fellow_member_select" ON "public"."faction_party_members" FOR SELECT USING ("public"."is_faction_pc_member"("faction_id", "auth"."uid"()));



CREATE POLICY "faction_party_members_insert" ON "public"."faction_party_members" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "faction_party_members_player_select" ON "public"."faction_party_members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campaign_members" "cm"
  WHERE (("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = 'player'::"text") AND ("cm"."party_member_id" = "faction_party_members"."party_member_id")))));



CREATE POLICY "faction_party_members_select" ON "public"."faction_party_members" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "faction_party_members_update" ON "public"."faction_party_members" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."faction_relations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "faction_relations_delete" ON "public"."faction_relations" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "faction_relations_insert" ON "public"."faction_relations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "faction_relations_select" ON "public"."faction_relations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "faction_relations_update" ON "public"."faction_relations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."factions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "factions_delete" ON "public"."factions" FOR DELETE USING (("public"."is_campaign_dm"("campaign_id") OR (("campaign_id" IS NULL) AND ("auth"."uid"() = "user_id"))));



CREATE POLICY "factions_insert" ON "public"."factions" FOR INSERT WITH CHECK ("public"."is_campaign_dm"("campaign_id"));



CREATE POLICY "factions_member_select" ON "public"."factions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."faction_party_members" "fpm"
     JOIN "public"."campaign_members" "cm" ON (("cm"."party_member_id" = "fpm"."party_member_id")))
  WHERE (("fpm"."faction_id" = "factions"."id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = 'player'::"text")))));



CREATE POLICY "factions_player_select" ON "public"."factions" FOR SELECT USING (("public"."is_campaign_member"("campaign_id") AND ("player_visible_to" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "cm"
  WHERE (("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = 'player'::"text") AND ("cm"."party_member_id" = ANY ("factions"."player_visible_to")))))));



CREATE POLICY "factions_select" ON "public"."factions" FOR SELECT USING ("public"."is_campaign_dm"("campaign_id"));



CREATE POLICY "factions_update" ON "public"."factions" FOR UPDATE USING (("public"."is_campaign_dm"("campaign_id") OR (("campaign_id" IS NULL) AND ("auth"."uid"() = "user_id")))) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."hall_of_heroes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hall_of_heroes_delete" ON "public"."hall_of_heroes" FOR DELETE USING ("public"."is_app_admin"());



CREATE POLICY "hall_of_heroes_insert" ON "public"."hall_of_heroes" FOR INSERT WITH CHECK ("public"."is_app_admin"());



CREATE POLICY "hall_of_heroes_select" ON "public"."hall_of_heroes" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "hall_of_heroes_update" ON "public"."hall_of_heroes" FOR UPDATE USING ("public"."is_app_admin"());



ALTER TABLE "public"."items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "items_campaign_member_select" ON "public"."items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."store_items" "si"
     JOIN "public"."locations" "l" ON (("l"."id" = "si"."location_id")))
     JOIN "public"."campaign_members" "cm" ON (("cm"."campaign_id" = "l"."campaign_id")))
  WHERE (("si"."item_id" = "items"."id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."party_member_id" = ANY ("l"."player_visible_to")) AND ("l"."is_inventory_shared" = true) AND ("si"."visible" = true)))));



CREATE POLICY "items_delete" ON "public"."items" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "items_insert" ON "public"."items" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "items_party_inventory_member_select" ON "public"."items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."party_inventory" "pi"
     JOIN "public"."campaign_members" "cm" ON (("cm"."campaign_id" = "pi"."campaign_id")))
  WHERE (("pi"."item_id" = "items"."id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "items_select" ON "public"."items" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "items_update" ON "public"."items" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations_shared_map_campaign_member_select" ON "public"."locations" FOR SELECT USING ((("is_map_shared" = true) AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "cm"
  WHERE (("cm"."campaign_id" = "locations"."campaign_id") AND ("cm"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."loot_tables" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loot_tables_delete" ON "public"."loot_tables" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "loot_tables_insert" ON "public"."loot_tables" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "loot_tables_select" ON "public"."loot_tables" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "loot_tables_update" ON "public"."loot_tables" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."monsters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "monsters: owner full access" ON "public"."monsters" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "monsters_player_select" ON "public"."monsters" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM ("public"."discovered_monsters" "dm"
     JOIN "public"."campaign_members" "cm" ON ((("cm"."campaign_id" = "dm"."campaign_id") AND ("cm"."user_id" = "auth"."uid"()))))
  WHERE ("dm"."monster_id" = "monsters"."id")))));



ALTER TABLE "public"."multiclass_prerequisites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "multiclass_prerequisites_select" ON "public"."multiclass_prerequisites" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notes_select" ON "public"."notes" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (("campaign_id" IS NOT NULL) AND ("campaign_id" IN ( SELECT "campaign_members"."campaign_id"
   FROM "public"."campaign_members"
  WHERE ("campaign_members"."user_id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "cm"
  WHERE (("cm"."user_id" = "auth"."uid"()) AND ("cm"."campaign_id" = "notes"."campaign_id") AND ("cm"."party_member_id" = ANY ("notes"."player_visible_to"))))))));



ALTER TABLE "public"."npc_inventory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "npc_inventory_delete" ON "public"."npc_inventory" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "npc_inventory_insert" ON "public"."npc_inventory" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "npc_inventory_select" ON "public"."npc_inventory" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "npc_inventory_update" ON "public"."npc_inventory" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."npc_pc_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "npc_pc_notes_dm_all" ON "public"."npc_pc_notes" USING ("public"."is_campaign_dm"("campaign_id")) WITH CHECK ("public"."is_campaign_dm"("campaign_id"));



CREATE POLICY "npc_pc_notes_player_select" ON "public"."npc_pc_notes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campaign_members" "cm"
  WHERE (("cm"."user_id" = "auth"."uid"()) AND ("cm"."party_member_id" = "npc_pc_notes"."party_member_id") AND ("cm"."role" = 'player'::"text")))));



ALTER TABLE "public"."npc_player_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "npc_player_notes_delete" ON "public"."npc_player_notes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "npc_player_notes_insert" ON "public"."npc_player_notes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "npc_player_notes_select" ON "public"."npc_player_notes" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "npc_player_notes_update" ON "public"."npc_player_notes" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."npc_relationships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "npc_relationships_delete" ON "public"."npc_relationships" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "npc_relationships_insert" ON "public"."npc_relationships" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "npc_relationships_select" ON "public"."npc_relationships" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "npc_relationships_update" ON "public"."npc_relationships" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."npcs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "npcs_player_select" ON "public"."npcs" FOR SELECT USING ((("campaign_id" IN ( SELECT "campaign_members"."campaign_id"
   FROM "public"."campaign_members"
  WHERE ("campaign_members"."user_id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "cm"
  WHERE (("cm"."user_id" = "auth"."uid"()) AND ("cm"."campaign_id" = "npcs"."campaign_id") AND ("cm"."party_member_id" = ANY ("npcs"."player_visible_to")))))));



CREATE POLICY "owner delete" ON "public"."encounters" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "owner insert" ON "public"."encounters" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "owner select" ON "public"."encounters" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "owner update" ON "public"."encounters" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."party_inventory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "party_inventory_dm_all" ON "public"."party_inventory" USING ("public"."is_campaign_dm"("campaign_id")) WITH CHECK ("public"."is_campaign_dm"("campaign_id"));



CREATE POLICY "party_inventory_member_delete" ON "public"."party_inventory" FOR DELETE USING ("public"."is_campaign_member"("campaign_id"));



CREATE POLICY "party_inventory_member_insert" ON "public"."party_inventory" FOR INSERT WITH CHECK ("public"."is_campaign_member"("campaign_id"));



CREATE POLICY "party_inventory_member_select" ON "public"."party_inventory" FOR SELECT USING ("public"."is_campaign_member"("campaign_id"));



CREATE POLICY "party_inventory_member_update" ON "public"."party_inventory" FOR UPDATE USING ("public"."is_campaign_member"("campaign_id"));



ALTER TABLE "public"."party_member_player_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "party_member_player_notes_delete" ON "public"."party_member_player_notes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "party_member_player_notes_insert" ON "public"."party_member_player_notes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "party_member_player_notes_select" ON "public"."party_member_player_notes" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "party_member_player_notes_update" ON "public"."party_member_player_notes" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."party_member_tracker_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "party_member_tracker_state_delete" ON "public"."party_member_tracker_state" FOR DELETE USING ("public"."is_campaign_dm"("campaign_id"));



CREATE POLICY "party_member_tracker_state_insert" ON "public"."party_member_tracker_state" FOR INSERT WITH CHECK (("public"."is_campaign_dm"("campaign_id") OR (EXISTS ( SELECT 1
   FROM "public"."campaign_members"
  WHERE (("campaign_members"."campaign_id" = "party_member_tracker_state"."campaign_id") AND ("campaign_members"."user_id" = "auth"."uid"()) AND ("campaign_members"."party_member_id" = "party_member_tracker_state"."party_member_id"))))));



CREATE POLICY "party_member_tracker_state_select" ON "public"."party_member_tracker_state" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."campaign_members"
  WHERE (("campaign_members"."campaign_id" = "party_member_tracker_state"."campaign_id") AND ("campaign_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "party_member_tracker_state"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"()))))));



CREATE POLICY "party_member_tracker_state_update" ON "public"."party_member_tracker_state" FOR UPDATE USING (("public"."is_campaign_dm"("campaign_id") OR (EXISTS ( SELECT 1
   FROM "public"."campaign_members"
  WHERE (("campaign_members"."campaign_id" = "party_member_tracker_state"."campaign_id") AND ("campaign_members"."user_id" = "auth"."uid"()) AND ("campaign_members"."party_member_id" = "party_member_tracker_state"."party_member_id"))))));



ALTER TABLE "public"."party_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "party_members: owner full access" ON "public"."party_members" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "party_members_player_delete" ON "public"."party_members" FOR DELETE USING ((("auth"."uid"() = "owner_user_id") OR (("campaign_id" IS NOT NULL) AND "public"."is_campaign_dm"("campaign_id"))));



CREATE POLICY "party_members_player_insert" ON "public"."party_members" FOR INSERT WITH CHECK ((("auth"."uid"() = "owner_user_id") OR (("campaign_id" IS NOT NULL) AND "public"."is_campaign_dm"("campaign_id"))));



CREATE POLICY "party_members_player_update" ON "public"."party_members" FOR UPDATE USING ((("auth"."uid"() = "owner_user_id") OR (("campaign_id" IS NOT NULL) AND "public"."is_campaign_dm"("campaign_id"))));



CREATE POLICY "party_members_select" ON "public"."party_members" FOR SELECT USING (((("campaign_id" IS NOT NULL) AND "public"."is_campaign_dm"("campaign_id")) OR ("auth"."uid"() = "owner_user_id") OR (("campaign_id" IS NOT NULL) AND "public"."is_campaign_member"("campaign_id") AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "cm"
  WHERE ("cm"."party_member_id" = "party_members"."id"))))));



ALTER TABLE "public"."pinned_forms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pinned_forms_dm" ON "public"."pinned_forms" USING ("public"."is_campaign_dm"("campaign_id"));



CREATE POLICY "pinned_forms_player_select" ON "public"."pinned_forms" FOR SELECT USING (("public"."is_campaign_member"("campaign_id") AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "cm"
  WHERE (("cm"."campaign_id" = "pinned_forms"."campaign_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."party_member_id" = "pinned_forms"."party_member_id"))))));



ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plans_public_read" ON "public"."plans" FOR SELECT USING (true);



ALTER TABLE "public"."player_journal_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "player_journal_entries_delete" ON "public"."player_journal_entries" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "player_journal_entries_insert" ON "public"."player_journal_entries" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_campaign_member"("campaign_id")));



CREATE POLICY "player_journal_entries_select_own" ON "public"."player_journal_entries" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "player_journal_entries_select_shared" ON "public"."player_journal_entries" FOR SELECT USING (((NOT "is_private") AND "public"."is_campaign_member"("campaign_id")));



CREATE POLICY "player_journal_entries_update" ON "public"."player_journal_entries" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "player_select" ON "public"."discovered_monsters" FOR SELECT USING (("public"."is_campaign_member"("campaign_id") AND (("visible_to" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "cm"
  WHERE (("cm"."campaign_id" = "discovered_monsters"."campaign_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."party_member_id" = ANY ("discovered_monsters"."visible_to"))))))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete" ON "public"."profiles" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."puzzle_rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "puzzle_rooms_delete" ON "public"."puzzle_rooms" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "puzzle_rooms_insert" ON "public"."puzzle_rooms" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "puzzle_rooms_select" ON "public"."puzzle_rooms" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (("is_shared" = true) AND ("campaign_id" IS NOT NULL) AND "public"."is_campaign_member"("campaign_id"))));



CREATE POLICY "puzzle_rooms_update" ON "public"."puzzle_rooms" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."quest_objectives" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quest_objectives_player_select" ON "public"."quest_objectives" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."quests" "q"
     JOIN "public"."campaign_members" "cm" ON (("cm"."campaign_id" = "q"."campaign_id")))
  WHERE (("q"."id" = "quest_objectives"."quest_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."party_member_id" = ANY ("q"."player_visible_to"))))));



ALTER TABLE "public"."quest_refs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quest_refs_player_select" ON "public"."quest_refs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."quests" "q"
     JOIN "public"."campaign_members" "cm" ON (("cm"."campaign_id" = "q"."campaign_id")))
  WHERE (("q"."id" = "quest_refs"."quest_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."party_member_id" = ANY ("q"."player_visible_to"))))));



CREATE POLICY "quest_refs_update" ON "public"."quest_refs" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."quests"
  WHERE (("quests"."id" = "quest_refs"."quest_id") AND ("auth"."uid"() = "quests"."user_id")))));



ALTER TABLE "public"."quests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quests_select" ON "public"."quests" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (("campaign_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "cm"
  WHERE (("cm"."user_id" = "auth"."uid"()) AND ("cm"."campaign_id" = "quests"."campaign_id") AND ("cm"."party_member_id" = ANY ("quests"."player_visible_to"))))))));



ALTER TABLE "public"."roll_tables" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roll_tables_delete" ON "public"."roll_tables" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "roll_tables_insert" ON "public"."roll_tables" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "roll_tables_select" ON "public"."roll_tables" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "roll_tables_update" ON "public"."roll_tables" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rules_delete" ON "public"."rules" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rules_insert" ON "public"."rules" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rules_player_select" ON "public"."rules" FOR SELECT USING ((("is_player_visible" = true) AND ("user_id" IN ( SELECT "cm_dm"."user_id"
   FROM ("public"."campaign_members" "cm_player"
     JOIN "public"."campaign_members" "cm_dm" ON ((("cm_player"."campaign_id" = "cm_dm"."campaign_id") AND ("cm_dm"."role" = 'dm'::"text"))))
  WHERE (("cm_player"."user_id" = "auth"."uid"()) AND ("cm_player"."role" = 'player'::"text"))))));



CREATE POLICY "rules_select" ON "public"."rules" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rules_update" ON "public"."rules" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."scriptorium_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_availability" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_availability_delete" ON "public"."session_availability" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "session_availability_insert" ON "public"."session_availability" FOR INSERT WITH CHECK (("public"."is_campaign_member"("campaign_id") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "session_availability_select" ON "public"."session_availability" FOR SELECT USING ("public"."is_campaign_member"("campaign_id"));



CREATE POLICY "session_availability_update" ON "public"."session_availability" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."session_proposals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_proposals_delete" ON "public"."session_proposals" FOR DELETE USING ("public"."is_campaign_dm"("campaign_id"));



CREATE POLICY "session_proposals_insert" ON "public"."session_proposals" FOR INSERT WITH CHECK ("public"."is_campaign_dm"("campaign_id"));



CREATE POLICY "session_proposals_select" ON "public"."session_proposals" FOR SELECT USING ("public"."is_campaign_member"("campaign_id"));



CREATE POLICY "session_proposals_update" ON "public"."session_proposals" FOR UPDATE USING ("public"."is_campaign_dm"("campaign_id"));



ALTER TABLE "public"."sounds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sounds_delete" ON "public"."sounds" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "sounds_insert" ON "public"."sounds" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "sounds_select" ON "public"."sounds" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "sounds_update" ON "public"."sounds" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."species" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "species_delete" ON "public"."species" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "species_insert" ON "public"."species" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "species_select" ON "public"."species" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."is_dm_of_my_campaigns"("user_id")));



CREATE POLICY "species_update" ON "public"."species" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."spells" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "spells_delete" ON "public"."spells" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "spells_insert" ON "public"."spells" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "spells_select" ON "public"."spells" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM ("public"."campaign_members" "cm_me"
     JOIN "public"."campaign_members" "cm_owner" ON ((("cm_owner"."campaign_id" = "cm_me"."campaign_id") AND ("cm_owner"."user_id" = "spells"."user_id"))))
  WHERE ("cm_me"."user_id" = "auth"."uid"())))));



CREATE POLICY "spells_update" ON "public"."spells" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."srd_art_defaults" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "srd_art_defaults_delete" ON "public"."srd_art_defaults" FOR DELETE USING (("auth"."uid"() = "contributed_by"));



CREATE POLICY "srd_art_defaults_insert" ON "public"."srd_art_defaults" FOR INSERT WITH CHECK (("auth"."uid"() = "contributed_by"));



CREATE POLICY "srd_art_defaults_select" ON "public"."srd_art_defaults" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "srd_art_defaults_update" ON "public"."srd_art_defaults" FOR UPDATE USING (("auth"."uid"() = "contributed_by"));



ALTER TABLE "public"."srd_monster_art" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "srd_monster_art_campaign_member_select" ON "public"."srd_monster_art" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM ("public"."campaign_members" "cm_player"
     JOIN "public"."campaign_members" "cm_owner" ON ((("cm_owner"."campaign_id" = "cm_player"."campaign_id") AND ("cm_owner"."user_id" = "srd_monster_art"."user_id"))))
  WHERE ("cm_player"."user_id" = "auth"."uid"())))));



CREATE POLICY "srd_monster_art_canonical_select" ON "public"."srd_monster_art" FOR SELECT USING ((("is_canonical" = true) AND ("auth"."uid"() IS NOT NULL)));



CREATE POLICY "srd_monster_art_delete" ON "public"."srd_monster_art" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "srd_monster_art_insert" ON "public"."srd_monster_art" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "srd_monster_art_select" ON "public"."srd_monster_art" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "srd_monster_art_update" ON "public"."srd_monster_art" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."srd_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "srd_rules_select" ON "public"."srd_rules" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."store_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "store_items_campaign_member_select" ON "public"."store_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."locations" "l"
     JOIN "public"."campaign_members" "cm" ON (("cm"."campaign_id" = "l"."campaign_id")))
  WHERE (("l"."id" = "store_items"."location_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."party_member_id" = ANY ("l"."player_visible_to")) AND ("l"."is_inventory_shared" = true) AND ("store_items"."visible" = true)))));



CREATE POLICY "store_items_delete" ON "public"."store_items" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "store_items_insert" ON "public"."store_items" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "store_items_select" ON "public"."store_items" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "store_items_update" ON "public"."store_items" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."system_classes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_classes_select" ON "public"."system_classes" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."traps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "traps_delete" ON "public"."traps" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "traps_insert" ON "public"."traps" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "traps_select" ON "public"."traps" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "traps_update" ON "public"."traps" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_subscriptions_select" ON "public"."user_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."check_quota"("resource_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_quota"("resource_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_quota"("resource_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_loot_chest_atom"("p_message_id" "uuid", "p_atom_id" "text", "p_claimer_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_loot_chest_atom"("p_message_id" "uuid", "p_atom_id" "text", "p_claimer_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_loot_chest_atom"("p_message_id" "uuid", "p_atom_id" "text", "p_claimer_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_shapeshifter_appearance"("member_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."clear_shapeshifter_appearance"("member_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_shapeshifter_appearance"("member_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."consume_app_invite"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."consume_app_invite"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_app_invite"("p_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_dm_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_dm_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_dm_membership"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_free_subscription"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_free_subscription"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_free_subscription"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_user_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_user_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_quota"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_quota"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_quota"() TO "service_role";



GRANT ALL ON FUNCTION "public"."grab_item_drop"("p_message_id" "uuid", "p_qty" integer, "p_claimer_user_id" "uuid", "p_claimer_name" "text", "p_party_member_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."grab_item_drop"("p_message_id" "uuid", "p_qty" integer, "p_claimer_user_id" "uuid", "p_claimer_name" "text", "p_party_member_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."grab_item_drop"("p_message_id" "uuid", "p_qty" integer, "p_claimer_user_id" "uuid", "p_claimer_name" "text", "p_party_member_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_app_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_campaign_dm"("cid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_campaign_dm"("cid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_campaign_dm"("cid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_campaign_member"("cid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_campaign_member"("cid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_campaign_member"("cid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_dm_of_my_campaigns"("owner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_dm_of_my_campaigns"("owner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_dm_of_my_campaigns"("owner_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_faction_pc_member"("p_faction_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_faction_pc_member"("p_faction_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_faction_pc_member"("p_faction_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."join_campaign_via_invite"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."join_campaign_via_invite"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_campaign_via_invite"("p_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."owns_crafting_recipe"("p_recipe_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."owns_crafting_recipe"("p_recipe_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owns_crafting_recipe"("p_recipe_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_shapeshifter_appearance"("member_id" "uuid", "target_species" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_shapeshifter_appearance"("member_id" "uuid", "target_species" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_shapeshifter_appearance"("member_id" "uuid", "target_species" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_companion_party_notes"("p_companion_id" "uuid", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_companion_party_notes"("p_companion_id" "uuid", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_companion_party_notes"("p_companion_id" "uuid", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_npc_party_notes"("p_npc_id" "uuid", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_npc_party_notes"("p_npc_id" "uuid", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_npc_party_notes"("p_npc_id" "uuid", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_app_invite"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_app_invite"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_app_invite"("p_token" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."app_invites" TO "anon";
GRANT ALL ON TABLE "public"."app_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."app_invites" TO "service_role";



GRANT ALL ON TABLE "public"."backgrounds" TO "anon";
GRANT ALL ON TABLE "public"."backgrounds" TO "authenticated";
GRANT ALL ON TABLE "public"."backgrounds" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_events" TO "anon";
GRANT ALL ON TABLE "public"."calendar_events" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_events" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_invites" TO "anon";
GRANT ALL ON TABLE "public"."campaign_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_invites" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_members" TO "anon";
GRANT ALL ON TABLE "public"."campaign_members" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_members" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_messages" TO "anon";
GRANT ALL ON TABLE "public"."campaign_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_messages" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_rules" TO "anon";
GRANT ALL ON TABLE "public"."campaign_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_rules" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."character_classes" TO "anon";
GRANT ALL ON TABLE "public"."character_classes" TO "authenticated";
GRANT ALL ON TABLE "public"."character_classes" TO "service_role";



GRANT ALL ON TABLE "public"."character_spells" TO "anon";
GRANT ALL ON TABLE "public"."character_spells" TO "authenticated";
GRANT ALL ON TABLE "public"."character_spells" TO "service_role";



GRANT ALL ON TABLE "public"."chronicler_images" TO "anon";
GRANT ALL ON TABLE "public"."chronicler_images" TO "authenticated";
GRANT ALL ON TABLE "public"."chronicler_images" TO "service_role";



GRANT ALL ON TABLE "public"."class_features" TO "anon";
GRANT ALL ON TABLE "public"."class_features" TO "authenticated";
GRANT ALL ON TABLE "public"."class_features" TO "service_role";



GRANT ALL ON TABLE "public"."companion_player_notes" TO "anon";
GRANT ALL ON TABLE "public"."companion_player_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."companion_player_notes" TO "service_role";



GRANT ALL ON TABLE "public"."companions" TO "anon";
GRANT ALL ON TABLE "public"."companions" TO "authenticated";
GRANT ALL ON TABLE "public"."companions" TO "service_role";



GRANT ALL ON TABLE "public"."crafting_recipe_grants" TO "anon";
GRANT ALL ON TABLE "public"."crafting_recipe_grants" TO "authenticated";
GRANT ALL ON TABLE "public"."crafting_recipe_grants" TO "service_role";



GRANT ALL ON TABLE "public"."crafting_recipe_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."crafting_recipe_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."crafting_recipe_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."crafting_recipe_modifiers" TO "anon";
GRANT ALL ON TABLE "public"."crafting_recipe_modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."crafting_recipe_modifiers" TO "service_role";



GRANT ALL ON TABLE "public"."crafting_recipe_outputs" TO "anon";
GRANT ALL ON TABLE "public"."crafting_recipe_outputs" TO "authenticated";
GRANT ALL ON TABLE "public"."crafting_recipe_outputs" TO "service_role";



GRANT ALL ON TABLE "public"."crafting_recipes" TO "anon";
GRANT ALL ON TABLE "public"."crafting_recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."crafting_recipes" TO "service_role";



GRANT ALL ON TABLE "public"."custom_classes" TO "anon";
GRANT ALL ON TABLE "public"."custom_classes" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_classes" TO "service_role";



GRANT ALL ON TABLE "public"."custom_subclasses" TO "anon";
GRANT ALL ON TABLE "public"."custom_subclasses" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_subclasses" TO "service_role";



GRANT ALL ON TABLE "public"."discovered_monsters" TO "anon";
GRANT ALL ON TABLE "public"."discovered_monsters" TO "authenticated";
GRANT ALL ON TABLE "public"."discovered_monsters" TO "service_role";



GRANT ALL ON TABLE "public"."dungeon_features" TO "anon";
GRANT ALL ON TABLE "public"."dungeon_features" TO "authenticated";
GRANT ALL ON TABLE "public"."dungeon_features" TO "service_role";



GRANT ALL ON TABLE "public"."encounter_state" TO "anon";
GRANT ALL ON TABLE "public"."encounter_state" TO "authenticated";
GRANT ALL ON TABLE "public"."encounter_state" TO "service_role";



GRANT ALL ON TABLE "public"."encounters" TO "anon";
GRANT ALL ON TABLE "public"."encounters" TO "authenticated";
GRANT ALL ON TABLE "public"."encounters" TO "service_role";



GRANT ALL ON TABLE "public"."entity_notes" TO "anon";
GRANT ALL ON TABLE "public"."entity_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_notes" TO "service_role";



GRANT ALL ON TABLE "public"."faction_items" TO "anon";
GRANT ALL ON TABLE "public"."faction_items" TO "authenticated";
GRANT ALL ON TABLE "public"."faction_items" TO "service_role";



GRANT ALL ON TABLE "public"."faction_locations" TO "anon";
GRANT ALL ON TABLE "public"."faction_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."faction_locations" TO "service_role";



GRANT ALL ON TABLE "public"."faction_npcs" TO "anon";
GRANT ALL ON TABLE "public"."faction_npcs" TO "authenticated";
GRANT ALL ON TABLE "public"."faction_npcs" TO "service_role";



GRANT ALL ON TABLE "public"."faction_party_members" TO "anon";
GRANT ALL ON TABLE "public"."faction_party_members" TO "authenticated";
GRANT ALL ON TABLE "public"."faction_party_members" TO "service_role";



GRANT ALL ON TABLE "public"."faction_relations" TO "anon";
GRANT ALL ON TABLE "public"."faction_relations" TO "authenticated";
GRANT ALL ON TABLE "public"."faction_relations" TO "service_role";



GRANT ALL ON TABLE "public"."factions" TO "anon";
GRANT ALL ON TABLE "public"."factions" TO "authenticated";
GRANT ALL ON TABLE "public"."factions" TO "service_role";



GRANT ALL ON TABLE "public"."hall_of_heroes" TO "anon";
GRANT ALL ON TABLE "public"."hall_of_heroes" TO "authenticated";
GRANT ALL ON TABLE "public"."hall_of_heroes" TO "service_role";



GRANT ALL ON TABLE "public"."items" TO "anon";
GRANT ALL ON TABLE "public"."items" TO "authenticated";
GRANT ALL ON TABLE "public"."items" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."loot_tables" TO "anon";
GRANT ALL ON TABLE "public"."loot_tables" TO "authenticated";
GRANT ALL ON TABLE "public"."loot_tables" TO "service_role";



GRANT ALL ON TABLE "public"."monsters" TO "anon";
GRANT ALL ON TABLE "public"."monsters" TO "authenticated";
GRANT ALL ON TABLE "public"."monsters" TO "service_role";



GRANT ALL ON TABLE "public"."multiclass_prerequisites" TO "anon";
GRANT ALL ON TABLE "public"."multiclass_prerequisites" TO "authenticated";
GRANT ALL ON TABLE "public"."multiclass_prerequisites" TO "service_role";



GRANT ALL ON TABLE "public"."notes" TO "anon";
GRANT ALL ON TABLE "public"."notes" TO "authenticated";
GRANT ALL ON TABLE "public"."notes" TO "service_role";



GRANT ALL ON TABLE "public"."npc_inventory" TO "anon";
GRANT ALL ON TABLE "public"."npc_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."npc_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."npc_pc_notes" TO "anon";
GRANT ALL ON TABLE "public"."npc_pc_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."npc_pc_notes" TO "service_role";



GRANT ALL ON TABLE "public"."npc_player_notes" TO "anon";
GRANT ALL ON TABLE "public"."npc_player_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."npc_player_notes" TO "service_role";



GRANT ALL ON TABLE "public"."npc_relationships" TO "anon";
GRANT ALL ON TABLE "public"."npc_relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."npc_relationships" TO "service_role";



GRANT ALL ON TABLE "public"."npcs" TO "anon";
GRANT ALL ON TABLE "public"."npcs" TO "authenticated";
GRANT ALL ON TABLE "public"."npcs" TO "service_role";



GRANT ALL ON TABLE "public"."party_inventory" TO "anon";
GRANT ALL ON TABLE "public"."party_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."party_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."party_members" TO "anon";
GRANT ALL ON TABLE "public"."party_members" TO "authenticated";
GRANT ALL ON TABLE "public"."party_members" TO "service_role";



GRANT ALL ON TABLE "public"."party_member_levels" TO "anon";
GRANT ALL ON TABLE "public"."party_member_levels" TO "authenticated";
GRANT ALL ON TABLE "public"."party_member_levels" TO "service_role";



GRANT ALL ON TABLE "public"."party_member_player_notes" TO "anon";
GRANT ALL ON TABLE "public"."party_member_player_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."party_member_player_notes" TO "service_role";



GRANT ALL ON TABLE "public"."party_member_tracker_state" TO "anon";
GRANT ALL ON TABLE "public"."party_member_tracker_state" TO "authenticated";
GRANT ALL ON TABLE "public"."party_member_tracker_state" TO "service_role";



GRANT ALL ON TABLE "public"."pinned_forms" TO "anon";
GRANT ALL ON TABLE "public"."pinned_forms" TO "authenticated";
GRANT ALL ON TABLE "public"."pinned_forms" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."player_journal_entries" TO "anon";
GRANT ALL ON TABLE "public"."player_journal_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."player_journal_entries" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."puzzle_rooms" TO "anon";
GRANT ALL ON TABLE "public"."puzzle_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."puzzle_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."quest_objectives" TO "anon";
GRANT ALL ON TABLE "public"."quest_objectives" TO "authenticated";
GRANT ALL ON TABLE "public"."quest_objectives" TO "service_role";



GRANT ALL ON TABLE "public"."quest_refs" TO "anon";
GRANT ALL ON TABLE "public"."quest_refs" TO "authenticated";
GRANT ALL ON TABLE "public"."quest_refs" TO "service_role";



GRANT ALL ON TABLE "public"."quests" TO "anon";
GRANT ALL ON TABLE "public"."quests" TO "authenticated";
GRANT ALL ON TABLE "public"."quests" TO "service_role";



GRANT ALL ON TABLE "public"."roll_tables" TO "anon";
GRANT ALL ON TABLE "public"."roll_tables" TO "authenticated";
GRANT ALL ON TABLE "public"."roll_tables" TO "service_role";



GRANT ALL ON TABLE "public"."rules" TO "anon";
GRANT ALL ON TABLE "public"."rules" TO "authenticated";
GRANT ALL ON TABLE "public"."rules" TO "service_role";



GRANT ALL ON TABLE "public"."scriptorium_documents" TO "anon";
GRANT ALL ON TABLE "public"."scriptorium_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."scriptorium_documents" TO "service_role";



GRANT ALL ON TABLE "public"."session_availability" TO "anon";
GRANT ALL ON TABLE "public"."session_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."session_availability" TO "service_role";



GRANT ALL ON TABLE "public"."session_proposals" TO "anon";
GRANT ALL ON TABLE "public"."session_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."session_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."sounds" TO "anon";
GRANT ALL ON TABLE "public"."sounds" TO "authenticated";
GRANT ALL ON TABLE "public"."sounds" TO "service_role";



GRANT ALL ON TABLE "public"."species" TO "anon";
GRANT ALL ON TABLE "public"."species" TO "authenticated";
GRANT ALL ON TABLE "public"."species" TO "service_role";



GRANT ALL ON TABLE "public"."spells" TO "anon";
GRANT ALL ON TABLE "public"."spells" TO "authenticated";
GRANT ALL ON TABLE "public"."spells" TO "service_role";



GRANT ALL ON TABLE "public"."srd_art_defaults" TO "anon";
GRANT ALL ON TABLE "public"."srd_art_defaults" TO "authenticated";
GRANT ALL ON TABLE "public"."srd_art_defaults" TO "service_role";



GRANT ALL ON TABLE "public"."srd_monster_art" TO "anon";
GRANT ALL ON TABLE "public"."srd_monster_art" TO "authenticated";
GRANT ALL ON TABLE "public"."srd_monster_art" TO "service_role";



GRANT ALL ON TABLE "public"."srd_rules" TO "anon";
GRANT ALL ON TABLE "public"."srd_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."srd_rules" TO "service_role";



GRANT ALL ON TABLE "public"."store_items" TO "anon";
GRANT ALL ON TABLE "public"."store_items" TO "authenticated";
GRANT ALL ON TABLE "public"."store_items" TO "service_role";



GRANT ALL ON TABLE "public"."system_classes" TO "anon";
GRANT ALL ON TABLE "public"."system_classes" TO "authenticated";
GRANT ALL ON TABLE "public"."system_classes" TO "service_role";



GRANT ALL ON TABLE "public"."traps" TO "anon";
GRANT ALL ON TABLE "public"."traps" TO "authenticated";
GRANT ALL ON TABLE "public"."traps" TO "service_role";



GRANT ALL ON TABLE "public"."user_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








-- Storage schema



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "storage";


ALTER SCHEMA "storage" OWNER TO "supabase_admin";


CREATE TYPE "storage"."buckettype" AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


ALTER TYPE "storage"."buckettype" OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."allow_any_operation"("expected_operations" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$$;


ALTER FUNCTION "storage"."allow_any_operation"("expected_operations" "text"[]) OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."allow_only_operation"("expected_operation" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
$$;


ALTER FUNCTION "storage"."allow_only_operation"("expected_operation" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."can_insert_object"("bucketid" "text", "name" "text", "owner" "uuid", "metadata" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


ALTER FUNCTION "storage"."can_insert_object"("bucketid" "text", "name" "text", "owner" "uuid", "metadata" "jsonb") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."enforce_bucket_name_length"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


ALTER FUNCTION "storage"."enforce_bucket_name_length"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."extension"("name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
_parts text[];
_filename text;
BEGIN
	select string_to_array(name, '/') into _parts;
	select _parts[array_length(_parts,1)] into _filename;
	-- @todo return the last part instead of 2
	return reverse(split_part(reverse(_filename), '.', 1));
END
$$;


ALTER FUNCTION "storage"."extension"("name" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."filename"("name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


ALTER FUNCTION "storage"."filename"("name" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."foldername"("name" "text") RETURNS "text"[]
    LANGUAGE "plpgsql"
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[1:array_length(_parts,1)-1];
END
$$;


ALTER FUNCTION "storage"."foldername"("name" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."get_common_prefix"("p_key" "text", "p_prefix" "text", "p_delimiter" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$$;


ALTER FUNCTION "storage"."get_common_prefix"("p_key" "text", "p_prefix" "text", "p_delimiter" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."get_size_by_bucket"() RETURNS TABLE("size" bigint, "bucket_id" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::int) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


ALTER FUNCTION "storage"."get_size_by_bucket"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."list_multipart_uploads_with_delimiter"("bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer DEFAULT 100, "next_key_token" "text" DEFAULT ''::"text", "next_upload_token" "text" DEFAULT ''::"text") RETURNS TABLE("key" "text", "id" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


ALTER FUNCTION "storage"."list_multipart_uploads_with_delimiter"("bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer, "next_key_token" "text", "next_upload_token" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."list_objects_with_delimiter"("_bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer DEFAULT 100, "start_after" "text" DEFAULT ''::"text", "next_token" "text" DEFAULT ''::"text", "sort_order" "text" DEFAULT 'asc'::"text") RETURNS TABLE("name" "text", "id" "uuid", "metadata" "jsonb", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


ALTER FUNCTION "storage"."list_objects_with_delimiter"("_bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer, "start_after" "text", "next_token" "text", "sort_order" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."operation"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


ALTER FUNCTION "storage"."operation"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."protect_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION "storage"."protect_delete"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."search"("prefix" "text", "bucketname" "text", "limits" integer DEFAULT 100, "levels" integer DEFAULT 1, "offsets" integer DEFAULT 0, "search" "text" DEFAULT ''::"text", "sortcolumn" "text" DEFAULT 'name'::"text", "sortorder" "text" DEFAULT 'asc'::"text") RETURNS TABLE("name" "text", "id" "uuid", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone, "metadata" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach (unchanged)
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT path_tokens[$1] AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $2 || '%%'
                  AND bucket_id = $3
                  AND array_length(objects.path_tokens, 1) <> $1
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT path_tokens[$1] AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $2 || '%%'
               AND bucket_id = $3
               AND array_length(objects.path_tokens, 1) = $1
             ORDER BY %I %s)
            LIMIT $4 OFFSET $5
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter), v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


ALTER FUNCTION "storage"."search"("prefix" "text", "bucketname" "text", "limits" integer, "levels" integer, "offsets" integer, "search" "text", "sortcolumn" "text", "sortorder" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."search_by_timestamp"("p_prefix" "text", "p_bucket_id" "text", "p_limit" integer, "p_level" integer, "p_start_after" "text", "p_sort_order" "text", "p_sort_column" "text", "p_sort_column_after" "text") RETURNS TABLE("key" "text", "name" "text", "id" "uuid", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone, "metadata" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$_$;


ALTER FUNCTION "storage"."search_by_timestamp"("p_prefix" "text", "p_bucket_id" "text", "p_limit" integer, "p_level" integer, "p_start_after" "text", "p_sort_order" "text", "p_sort_column" "text", "p_sort_column_after" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."search_v2"("prefix" "text", "bucket_name" "text", "limits" integer DEFAULT 100, "levels" integer DEFAULT 1, "start_after" "text" DEFAULT ''::"text", "sort_order" "text" DEFAULT 'asc'::"text", "sort_column" "text" DEFAULT 'name'::"text", "sort_column_after" "text" DEFAULT ''::"text") RETURNS TABLE("key" "text", "name" "text", "id" "uuid", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone, "metadata" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$$;


ALTER FUNCTION "storage"."search_v2"("prefix" "text", "bucket_name" "text", "limits" integer, "levels" integer, "start_after" "text", "sort_order" "text", "sort_column" "text", "sort_column_after" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


ALTER FUNCTION "storage"."update_updated_at_column"() OWNER TO "supabase_storage_admin";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "storage"."buckets" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "owner" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "public" boolean DEFAULT false,
    "avif_autodetection" boolean DEFAULT false,
    "file_size_limit" bigint,
    "allowed_mime_types" "text"[],
    "owner_id" "text",
    "type" "storage"."buckettype" DEFAULT 'STANDARD'::"storage"."buckettype" NOT NULL
);


ALTER TABLE "storage"."buckets" OWNER TO "supabase_storage_admin";


COMMENT ON COLUMN "storage"."buckets"."owner" IS 'Field is deprecated, use owner_id instead';



CREATE TABLE IF NOT EXISTS "storage"."buckets_analytics" (
    "name" "text" NOT NULL,
    "type" "storage"."buckettype" DEFAULT 'ANALYTICS'::"storage"."buckettype" NOT NULL,
    "format" "text" DEFAULT 'ICEBERG'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "storage"."buckets_analytics" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."buckets_vectors" (
    "id" "text" NOT NULL,
    "type" "storage"."buckettype" DEFAULT 'VECTOR'::"storage"."buckettype" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "storage"."buckets_vectors" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."migrations" (
    "id" integer NOT NULL,
    "name" character varying(100) NOT NULL,
    "hash" character varying(40) NOT NULL,
    "executed_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "storage"."migrations" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."objects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bucket_id" "text",
    "name" "text",
    "owner" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_accessed_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb",
    "path_tokens" "text"[] GENERATED ALWAYS AS ("string_to_array"("name", '/'::"text")) STORED,
    "version" "text",
    "owner_id" "text",
    "user_metadata" "jsonb"
);


ALTER TABLE "storage"."objects" OWNER TO "supabase_storage_admin";


COMMENT ON COLUMN "storage"."objects"."owner" IS 'Field is deprecated, use owner_id instead';



CREATE TABLE IF NOT EXISTS "storage"."s3_multipart_uploads" (
    "id" "text" NOT NULL,
    "in_progress_size" bigint DEFAULT 0 NOT NULL,
    "upload_signature" "text" NOT NULL,
    "bucket_id" "text" NOT NULL,
    "key" "text" NOT NULL COLLATE "pg_catalog"."C",
    "version" "text" NOT NULL,
    "owner_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_metadata" "jsonb",
    "metadata" "jsonb"
);


ALTER TABLE "storage"."s3_multipart_uploads" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."s3_multipart_uploads_parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "upload_id" "text" NOT NULL,
    "size" bigint DEFAULT 0 NOT NULL,
    "part_number" integer NOT NULL,
    "bucket_id" "text" NOT NULL,
    "key" "text" NOT NULL COLLATE "pg_catalog"."C",
    "etag" "text" NOT NULL,
    "owner_id" "text",
    "version" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "storage"."s3_multipart_uploads_parts" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."vector_indexes" (
    "id" "text" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL COLLATE "pg_catalog"."C",
    "bucket_id" "text" NOT NULL,
    "data_type" "text" NOT NULL,
    "dimension" integer NOT NULL,
    "distance_metric" "text" NOT NULL,
    "metadata_configuration" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "storage"."vector_indexes" OWNER TO "supabase_storage_admin";


ALTER TABLE ONLY "storage"."buckets_analytics"
    ADD CONSTRAINT "buckets_analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."buckets"
    ADD CONSTRAINT "buckets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."buckets_vectors"
    ADD CONSTRAINT "buckets_vectors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."migrations"
    ADD CONSTRAINT "migrations_name_key" UNIQUE ("name");



ALTER TABLE ONLY "storage"."migrations"
    ADD CONSTRAINT "migrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."objects"
    ADD CONSTRAINT "objects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads_parts"
    ADD CONSTRAINT "s3_multipart_uploads_parts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads"
    ADD CONSTRAINT "s3_multipart_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."vector_indexes"
    ADD CONSTRAINT "vector_indexes_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "bname" ON "storage"."buckets" USING "btree" ("name");



CREATE UNIQUE INDEX "bucketid_objname" ON "storage"."objects" USING "btree" ("bucket_id", "name");



CREATE UNIQUE INDEX "buckets_analytics_unique_name_idx" ON "storage"."buckets_analytics" USING "btree" ("name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_multipart_uploads_list" ON "storage"."s3_multipart_uploads" USING "btree" ("bucket_id", "key", "created_at");



CREATE INDEX "idx_objects_bucket_id_name" ON "storage"."objects" USING "btree" ("bucket_id", "name" COLLATE "C");



CREATE INDEX "idx_objects_bucket_id_name_lower" ON "storage"."objects" USING "btree" ("bucket_id", "lower"("name") COLLATE "C");



CREATE INDEX "name_prefix_search" ON "storage"."objects" USING "btree" ("name" "text_pattern_ops");



CREATE UNIQUE INDEX "vector_indexes_name_bucket_id_idx" ON "storage"."vector_indexes" USING "btree" ("name", "bucket_id");



CREATE OR REPLACE TRIGGER "enforce_bucket_name_length_trigger" BEFORE INSERT OR UPDATE OF "name" ON "storage"."buckets" FOR EACH ROW EXECUTE FUNCTION "storage"."enforce_bucket_name_length"();



CREATE OR REPLACE TRIGGER "protect_buckets_delete" BEFORE DELETE ON "storage"."buckets" FOR EACH STATEMENT EXECUTE FUNCTION "storage"."protect_delete"();



CREATE OR REPLACE TRIGGER "protect_objects_delete" BEFORE DELETE ON "storage"."objects" FOR EACH STATEMENT EXECUTE FUNCTION "storage"."protect_delete"();



CREATE OR REPLACE TRIGGER "update_objects_updated_at" BEFORE UPDATE ON "storage"."objects" FOR EACH ROW EXECUTE FUNCTION "storage"."update_updated_at_column"();



ALTER TABLE ONLY "storage"."objects"
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads"
    ADD CONSTRAINT "s3_multipart_uploads_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads_parts"
    ADD CONSTRAINT "s3_multipart_uploads_parts_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads_parts"
    ADD CONSTRAINT "s3_multipart_uploads_parts_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "storage"."s3_multipart_uploads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "storage"."vector_indexes"
    ADD CONSTRAINT "vector_indexes_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets_vectors"("id");



CREATE POLICY "Authenticated users can upload asset images" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'asset-images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "Authenticated users can upload location images" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'location-images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "Authenticated users can upload spell images" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'spell-images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "Authenticated users can upload trap images" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'trap-images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "Users can delete own NPC portraits" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'npc-portraits'::"text") AND (("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1])));



CREATE POLICY "Users can delete their own asset images" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'asset-images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "Users can delete their own location images" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'location-images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "Users can delete their own spell images" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'spell-images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "Users can delete their own trap images" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'trap-images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "Users can update own NPC portraits" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'npc-portraits'::"text") AND (("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1])));



CREATE POLICY "Users can upload own NPC portraits" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'npc-portraits'::"text") AND (("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1])));



ALTER TABLE "storage"."buckets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."buckets_analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."buckets_vectors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chronicle_delete" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'chronicle'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "chronicle_insert" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'chronicle'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "chronicle_select" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'chronicle'::"text"));



CREATE POLICY "dungeon_feature_images_delete" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'dungeon-feature-images'::"text") AND ("auth"."uid"() = "owner")));



CREATE POLICY "dungeon_feature_images_insert" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'dungeon-feature-images'::"text") AND ("auth"."uid"() = "owner")));



CREATE POLICY "dungeon_feature_images_update" ON "storage"."objects" FOR UPDATE USING ((("bucket_id" = 'dungeon-feature-images'::"text") AND ("auth"."uid"() = "owner")));



CREATE POLICY "item_images_delete" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'item-images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "item_images_insert" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'item-images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "item_images_update" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'item-images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



ALTER TABLE "storage"."migrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "monster_images_delete" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'monster-images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "monster_images_insert" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'monster-images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "monster_images_update" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'monster-images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



ALTER TABLE "storage"."objects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."s3_multipart_uploads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."s3_multipart_uploads_parts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sounds_storage_delete" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'sounds'::"text") AND (("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1])));



CREATE POLICY "sounds_storage_insert" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'sounds'::"text") AND (("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1])));



ALTER TABLE "storage"."vector_indexes" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "storage" TO "postgres" WITH GRANT OPTION;
GRANT USAGE ON SCHEMA "storage" TO "anon";
GRANT USAGE ON SCHEMA "storage" TO "authenticated";
GRANT USAGE ON SCHEMA "storage" TO "service_role";
GRANT ALL ON SCHEMA "storage" TO "supabase_storage_admin" WITH GRANT OPTION;
GRANT ALL ON SCHEMA "storage" TO "dashboard_user";



REVOKE ALL ON TABLE "storage"."buckets" FROM "supabase_storage_admin";
GRANT ALL ON TABLE "storage"."buckets" TO "supabase_storage_admin" WITH GRANT OPTION;
GRANT ALL ON TABLE "storage"."buckets" TO "service_role";
GRANT ALL ON TABLE "storage"."buckets" TO "authenticated";
GRANT ALL ON TABLE "storage"."buckets" TO "anon";
GRANT ALL ON TABLE "storage"."buckets" TO "postgres" WITH GRANT OPTION;



GRANT ALL ON TABLE "storage"."buckets_analytics" TO "service_role";
GRANT ALL ON TABLE "storage"."buckets_analytics" TO "authenticated";
GRANT ALL ON TABLE "storage"."buckets_analytics" TO "anon";



GRANT SELECT ON TABLE "storage"."buckets_vectors" TO "service_role";
GRANT SELECT ON TABLE "storage"."buckets_vectors" TO "authenticated";
GRANT SELECT ON TABLE "storage"."buckets_vectors" TO "anon";



REVOKE ALL ON TABLE "storage"."objects" FROM "supabase_storage_admin";
GRANT ALL ON TABLE "storage"."objects" TO "supabase_storage_admin" WITH GRANT OPTION;
GRANT ALL ON TABLE "storage"."objects" TO "service_role";
GRANT ALL ON TABLE "storage"."objects" TO "authenticated";
GRANT ALL ON TABLE "storage"."objects" TO "anon";
GRANT ALL ON TABLE "storage"."objects" TO "postgres" WITH GRANT OPTION;



GRANT ALL ON TABLE "storage"."s3_multipart_uploads" TO "service_role";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads" TO "authenticated";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads" TO "anon";



GRANT ALL ON TABLE "storage"."s3_multipart_uploads_parts" TO "service_role";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads_parts" TO "authenticated";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads_parts" TO "anon";



GRANT SELECT ON TABLE "storage"."vector_indexes" TO "service_role";
GRANT SELECT ON TABLE "storage"."vector_indexes" TO "authenticated";
GRANT SELECT ON TABLE "storage"."vector_indexes" TO "anon";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "service_role";




