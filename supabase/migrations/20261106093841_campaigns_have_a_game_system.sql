-- A campaign plays a game system, and every system is its own (#934, stories 1-2).
--
-- `campaigns.ruleset` ('2014' / '2024') said which edition of D&D 5e a campaign
-- played, which left no way to say "not 5e". It goes. `campaigns.game_system`
-- names the system, always explicitly: 'dnd5e-2014', 'dnd5e-2024' or 'generic'
-- (no rules system: the neutral tools only). The two 5e editions are separate
-- systems, exactly as a later Pathfinder or Level Up A5E would be.
--
-- Systems declare what they are compatible with instead of being special-cased
-- (the maintainer's direction, 6 Nov 2026: "they bank on that being true"). Here
-- that is the 5e family: 5e 2014 and 5e 2024 are mutually compatible, Generic is
-- compatible with nothing. Compatibility decides two things in the database:
--   * a campaign may switch only to a compatible system (2014 <-> 2024 keeps the
--     existing per-character conversion in the Rules tab; to or from Generic is
--     refused);
--   * `allows_mixed_rulesets` seats characters of a compatible system only.
-- The client registry (src/systems/registry.ts) holds the same table; the
-- pgTAP test holds the two equal.
--
-- An edition ('2014' / '2024') is a property of a 5e system, not of a campaign:
-- library rows and characters still carry one. `private.game_system_edition`
-- raises for a system that has none, so 5e code reached from a Generic campaign
-- fails loudly instead of quietly playing 2014.

-- ── The registry ────────────────────────────────────────────────────────────

create function private.game_system_is_5e(p_system text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_system in ('dnd5e-2014', 'dnd5e-2024'), false);
$$;

create function private.game_system_edition(p_system text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  case p_system
    when 'dnd5e-2014' then return '2014';
    when 'dnd5e-2024' then return '2024';
    else raise exception 'Game system % has no D&D 5e edition', coalesce(p_system, '(none)')
      using errcode = '22023';
  end case;
end;
$$;

-- The system a 5e character's edition belongs to.
create function private.edition_game_system(p_ruleset text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  case p_ruleset
    when '2014' then return 'dnd5e-2014';
    when '2024' then return 'dnd5e-2024';
    else raise exception 'Edition % belongs to no game system', coalesce(p_ruleset, '(none)')
      using errcode = '22023';
  end case;
end;
$$;

-- Total: true or false, never null. A system is compatible with itself.
create function private.game_systems_compatible(p_a text, p_b text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_a = p_b
    or (private.game_system_is_5e(p_a) and private.game_system_is_5e(p_b)),
    false);
$$;

-- Whether a campaign of this system seats a character of this edition.
create function private.campaign_seats_edition(p_system text, p_allows_mixed boolean, p_ruleset text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_ruleset is null or not private.game_system_is_5e(p_system) then false
    when private.edition_game_system(p_ruleset) = p_system then true
    else coalesce(p_allows_mixed, false)
         and private.game_systems_compatible(p_system, private.edition_game_system(p_ruleset))
  end;
$$;

revoke execute on function private.game_system_edition(text), private.edition_game_system(text),
  private.game_systems_compatible(text, text), private.campaign_seats_edition(text, boolean, text),
  private.game_system_is_5e(text) from public, anon;
grant execute on function private.game_system_edition(text), private.edition_game_system(text),
  private.game_systems_compatible(text, text), private.campaign_seats_edition(text, boolean, text),
  private.game_system_is_5e(text) to authenticated, service_role;

-- ── The column ──────────────────────────────────────────────────────────────

alter table public.campaigns add column game_system text;
update public.campaigns set game_system = private.edition_game_system(ruleset);
-- The default is what every campaign played before this change, as
-- `ruleset`'s '2014' default was. The new-campaign form always sends the
-- system the DM picked, so the default never chooses for one; it keeps the
-- scripts and fixtures that create a plain 5e campaign working.
alter table public.campaigns
  alter column game_system set default 'dnd5e-2014',
  alter column game_system set not null,
  add constraint campaigns_game_system_known
    check (game_system in ('dnd5e-2014', 'dnd5e-2024', 'generic'));

-- Mixed seating means "characters of a compatible system"; Generic has none.
alter table public.campaigns
  add constraint campaigns_mixed_needs_compatible_system
    check (not allows_mixed_rulesets or private.game_system_is_5e(game_system));

-- A campaign switches only to a compatible system.
create function private.guard_campaign_game_system()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.game_systems_compatible(old.game_system, new.game_system) then
    raise exception 'A campaign playing % cannot switch to %', old.game_system, new.game_system
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_campaign_game_system() from public, anon, authenticated;
create trigger campaigns_guard_game_system
  before update of game_system on public.campaigns
  for each row when (old.game_system is distinct from new.game_system)
  execute procedure private.guard_campaign_game_system();

-- ── The three readers of the old column, now reading the system ─────────────

CREATE OR REPLACE FUNCTION private.admit_campaign_member(p_campaign_id uuid, p_user_id uuid, p_role text, p_display_name text, p_party_member_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inserted integer;
  v_prev text := current_setting('grimoire.pm_campaign_transition', true);
begin
  insert into public.campaign_members (campaign_id, user_id, role, display_name)
  values (p_campaign_id, p_user_id, p_role, p_display_name)
  on conflict (campaign_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;

  if p_party_member_id is not null then
    perform set_config('grimoire.pm_campaign_transition', 'on', true);
    update public.party_members pm
       set campaign_id = p_campaign_id
     where pm.id = p_party_member_id
       and pm.owner_user_id = p_user_id
       and pm.campaign_id is null
       and exists (
         select 1 from public.campaigns c
          where c.id = p_campaign_id
            and private.campaign_seats_edition(c.game_system, c.allows_mixed_rulesets, pm.ruleset)
       );
    -- The seat is filled only when nothing is waiting on the DM; otherwise the
    -- character has come to the table benched (#943 wave 4).
    update public.campaign_members m
       set party_member_id = p_party_member_id
     where m.campaign_id = p_campaign_id
       and m.user_id = p_user_id
       and m.party_member_id is null
       and exists (
         select 1 from public.party_members pm
          where pm.id = p_party_member_id
            and pm.campaign_id = p_campaign_id
            and pm.owner_user_id = p_user_id
       )
       and not exists (
         select 1 from public.character_content_reviews r
          where r.party_member_id = p_party_member_id and r.status = 'pending'
       );
    perform set_config('grimoire.pm_campaign_transition', coalesce(v_prev, ''), true);
  end if;

  -- Whatever route admitted them, nothing is pending for them here any more
  -- (a request left from before a child came of age, say).
  delete from public.campaign_join_requests
   where campaign_id = p_campaign_id and user_id = p_user_id;

  return v_inserted > 0;
end;
$function$;

CREATE OR REPLACE FUNCTION private.assert_ruleset_admissible(p_ruleset text, p_campaign_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_system text;
  v_mixed boolean;
begin
  select c.game_system, c.allows_mixed_rulesets into v_system, v_mixed
    from public.campaigns c where c.id = p_campaign_id;
  if not found then
    raise exception 'Campaign not found';
  end if;
  if private.campaign_seats_edition(v_system, v_mixed, p_ruleset) then
    return;
  end if;
  -- A Generic table plays no rules system, so it seats no 5e character at all.
  if not private.game_system_is_5e(v_system) then
    raise exception 'This table plays no rules system and does not take % characters', p_ruleset
      using errcode = 'RS001',
            detail = jsonb_build_object('character_ruleset', p_ruleset, 'campaign_game_system', v_system)::text;
  end if;
  -- The wording and detail keys the client's bounce handling reads
  -- (useCharacterRuleset.ts), plus the system the table plays.
  raise exception 'This table plays the % rules and does not take % characters',
    private.game_system_edition(v_system), p_ruleset
    using errcode = 'RS001',
          detail = jsonb_build_object(
            'character_ruleset', p_ruleset,
            'campaign_ruleset', private.game_system_edition(v_system),
            'campaign_game_system', v_system)::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.match_import_entity_names(p_user_id uuid, p_campaign_id uuid, p_kind text, p_names text[])
 RETURNS TABLE(query_name text, target_id text, source text, matched_name text, match_kind text, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  with asked as (
    select distinct n as query_name, private.normalize_entity_name(n) as norm
    from unnest(coalesce(p_names, array[]::text[])) as n
    where private.normalize_entity_name(n) is not null
  ),
  -- `detail` is what tells five goblins apart in the review — CR and type,
  -- occupation, rarity, where an encounter happens — plus "all campaigns" for
  -- a DM's global row and the publisher for a library row, since the library
  -- holds the same creature from several books.
  -- The library side obeys the same gate every other library read does: only
  -- books this campaign has enabled, only its edition. Offering a disabled
  -- source's creature as "already yours" is the licensing mistake #567/#583
  -- fixed, and linking to it would put that content into the campaign. Items
  -- key on `source_document_key` with the always-visible bundled gear and an
  -- edition-neutral null ruleset, exactly as `match_library_items` and
  -- `fetchLibraryItems()` do; monsters and spells key on `source`.
  camp as (
    -- A system with no 5e edition (Generic) has no library to match against.
    select private.game_system_is_5e(c.game_system) as has_library,
           case when private.game_system_is_5e(c.game_system) then private.game_system_edition(c.game_system) end as ruleset,
           coalesce(array_agg(s.source_slug) filter (where s.source_slug is not null), array[]::text[]) as slugs
    from public.campaigns c
    left join public.campaign_enabled_sources s on s.campaign_id = c.id
    where c.id = p_campaign_id
    group by c.game_system
  ),
  pool as (
    select 'npcs'::text as kind, x.id::text as id, x.name, 'campaign'::text as source,
           nullif(concat_ws(' · ', x.race, x.occupation, case when x.campaign_id is null then 'all campaigns' end), '') as detail
      from public.npcs x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'factions', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', x.faction_type, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.factions x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'locations', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', x.location_type::text, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.locations x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'encounters', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', 'at ' || l.name, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.encounters x
      -- Scoped like every other row here: nothing in the schema stops an
      -- encounter's location_id pointing at another account's location, and
      -- this function bypasses RLS, so an unscoped join would hand that
      -- location's name back as `detail`. A mismatched id just drops the "at".
      left join public.locations l
        on l.id = x.location_id
       and (l.campaign_id = p_campaign_id or (l.campaign_id is null and l.user_id = p_user_id))
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'quests', x.id::text, x.title, 'campaign', null
      from public.quests x
      where x.campaign_id = p_campaign_id
    union all
    select 'monsters', x.id::text, x.name, 'campaign',
           nullif(concat_ws(' · ', 'CR ' || (x.stat_block ->> 'challenge_rating'), x.monster_type, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.monsters x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'monsters', x.id, x.name, 'library',
           nullif(concat_ws(' · ', 'CR ' || (x.stat_block ->> 'challenge_rating'), x.monster_type, coalesce(x.source_title, x.ruleset)), '')
      from public.library_monsters x, camp
      where camp.has_library and x.source = any(camp.slugs) and x.ruleset = camp.ruleset
    union all
    select 'items', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', x.rarity, x.item_type, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.items x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'items', x.id, x.name, 'library', nullif(concat_ws(' · ', x.rarity, x.item_type, coalesce(x.source_title, x.ruleset)), '')
      from public.library_items x, camp
      where x.source_document_key = any(array['grimoire-bundled'] || camp.slugs)
        and camp.has_library and (x.ruleset is null or x.ruleset = camp.ruleset)
    union all
    select 'spells', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', 'level ' || x.level, x.school, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.spells x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'spells', x.id, x.name, 'library', nullif(concat_ws(' · ', 'level ' || x.level, x.school, coalesce(x.source_title, x.ruleset)), '')
      from public.library_spells x, camp
      where camp.has_library and x.source = any(camp.slugs) and x.ruleset = camp.ruleset
  ),
  existing as (
    select p.id, p.name, p.source, p.detail, private.normalize_entity_name(p.name) as norm
    from pool p
    where p.kind = p_kind
  ),
  matched as (
    select a.query_name, e.id, e.source, e.name, e.detail, m.match_kind
    from asked a
    join existing e on e.norm is not null
    cross join lateral (
      select private.import_name_verdict(p_kind, a.norm, e.norm, e.source) as match_kind
    ) m
    where m.match_kind is not null
  ),
  candidates as (
    select k.query_name, k.id, k.source, k.name, k.detail, k.match_kind,
           -- Exact, near, contains; own rows before the library within each.
           case k.match_kind when 'exact' then 0 when 'near' then 2 else 4 end
             + case when k.source = 'campaign' then 0 else 1 end as rank
    from (
      select m.*, bool_or(m.match_kind = 'exact') over (partition by m.query_name) as has_exact
      from matched m
    ) k
    where k.match_kind <> 'near' or not k.has_exact
  ),
  -- The DM's own rows are never cut: five goblins of their own must all be on
  -- the list, or the one they meant can be the one hidden. 25 is only a guard
  -- against a pathological vault. The library, which can hold the same name
  -- from many books, is capped at five.
  ranked as (
    select c.*, row_number() over (partition by c.query_name, c.source order by c.rank, c.name, c.id) as n
    from candidates c
  )
  select r.query_name, r.id, r.source, r.name, r.match_kind, r.detail
  from ranked r
  where (r.source = 'campaign' and r.n <= 25) or (r.source = 'library' and r.n <= 5)
  order by r.query_name, r.rank, r.name, r.id;
$function$;

alter table public.campaigns drop column ruleset;

-- Nothing still reads the dropped column. `assess_content` is left out by name:
-- its `c` is a custom class row, whose edition is the content's own. `camp` is
-- not matched: in match_import_entity_names it is the CTE that derives the
-- edition from the system above.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname in ('public', 'private')
                and p.proname <> 'assess_content'
                and p.prosrc ~* '\m(c|v_campaign|campaign|campaigns)\.ruleset\M') then
    raise exception 'a function still reads campaigns.ruleset';
  end if;
end;
$$;
