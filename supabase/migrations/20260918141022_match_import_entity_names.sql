-- Name tier of the import dedupe: "does something on this page already exist?"
--
-- The document importer created every entity it extracted as a new row, so a
-- page naming four NPCs the DM already had produced four duplicates. Monsters
-- and items had resolvers (#837/#838); npcs, factions, locations, encounters,
-- spells and quests had nothing at all, and the importer's own name lookup read
-- `campaign_id = X` only, so it could not even see the DM's global (null-
-- campaign) rows.
--
-- One function for every kind, returning EVERY plausible existing row per name
-- rather than the single best one the older resolvers return: the review shows
-- the DM each candidate (A, B, C…, create new, ignore) and lets them pick, so
-- ranking decides the default, not the outcome.
--
-- Called only by the `import-match` edge function (service role), which
-- authorizes the caller as a DM of the campaign first and adds the embedding
-- tier on top. Not client-callable, so it adds nothing to the advisor's
-- definer-function count — the same shape as the session_proposal_invites RPCs.
--
-- Scope, per kind: every row in this campaign (a co-DM's NPC is still this
-- campaign's NPC), plus the CALLER's own global rows (campaign_id is null),
-- which is exactly what the DM's list views show. Library rows only for the
-- kinds that have a library.
--
-- "contains" is a whole-word suffix match in EITHER direction — "Icewind
-- kobold" finds "Kobold", and "Dresk" finds "Foreman Dresk" — done with string
-- functions rather than the older resolvers' `'(^| )' || norm || '$'` regex, so
-- a name containing a regex metacharacter ("Tomb of (Horrors)") cannot break or
-- widen the match.

create or replace function public.match_import_entity_names(
  p_user_id     uuid,
  p_campaign_id uuid,
  p_kind        text,
  p_names       text[]
)
returns table (
  query_name   text,
  target_id    text,
  source       text,
  matched_name text,
  match_kind   text,
  detail       text
)
language sql
stable
security definer
set search_path to 'public', 'private'
as $function$
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
    select case when c.ruleset = '2024' then '2024' else '2014' end as ruleset,
           coalesce(array_agg(s.source_slug) filter (where s.source_slug is not null), array[]::text[]) as slugs
    from public.campaigns c
    left join public.campaign_enabled_sources s on s.campaign_id = c.id
    where c.id = p_campaign_id
    group by c.ruleset
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
      where x.source = any(camp.slugs) and x.ruleset = camp.ruleset
    union all
    select 'items', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', x.rarity, x.item_type, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.items x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'items', x.id, x.name, 'library', nullif(concat_ws(' · ', x.rarity, x.item_type, coalesce(x.source_title, x.ruleset)), '')
      from public.library_items x, camp
      where x.source_document_key = any(array['grimoire-bundled'] || camp.slugs)
        and (x.ruleset is null or x.ruleset = camp.ruleset)
    union all
    select 'spells', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', 'level ' || x.level, x.school, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.spells x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'spells', x.id, x.name, 'library', nullif(concat_ws(' · ', 'level ' || x.level, x.school, coalesce(x.source_title, x.ruleset)), '')
      from public.library_spells x, camp
      where x.source = any(camp.slugs) and x.ruleset = camp.ruleset
  ),
  existing as (
    select p.id, p.name, p.source, p.detail, private.normalize_entity_name(p.name) as norm
    from pool p
    where p.kind = p_kind
  ),
  candidates as (
    select a.query_name, e.id, e.source, e.name, e.detail,
           case when e.norm = a.norm then 'exact' else 'contains' end as match_kind,
           -- Own rows before the library, exact before contains.
           case when e.norm = a.norm then 0 else 2 end + case when e.source = 'campaign' then 0 else 1 end as rank
    from asked a
    join existing e
      on e.norm is not null
     and (
          e.norm = a.norm
       or right(' ' || a.norm, length(e.norm) + 1) = ' ' || e.norm
       or right(' ' || e.norm, length(a.norm) + 1) = ' ' || a.norm
     )
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

comment on function public.match_import_entity_names(uuid, uuid, text, text[]) is
  'Name tier of the document-import dedupe: every own campaign/global row (max 25) '
  'and up to five library rows per extracted name, own before library, exact before '
  'whole-word-suffix matches. Service-role only; the import-match edge function '
  'authorizes the caller as a campaign DM before calling it.';

revoke execute on function public.match_import_entity_names(uuid, uuid, text, text[]) from public, anon, authenticated;
grant  execute on function public.match_import_entity_names(uuid, uuid, text, text[]) to service_role;
