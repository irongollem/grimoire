-- A title in front AND a slip inside: "Speaker Edgra Durmoot" on the page,
-- "Edgra Durnoot" in the vault.
--
-- `20261002131333` taught the name tier two things separately. A proper name
-- matches on a whole-word run inside a longer one ("Finn Dejarr" finds "Finn"),
-- and one of the DM's own rows matches when it is one edit away ("Edgra
-- Durmoot" finds "Edgra Durnoot"). The same chapter, extracted a second time,
-- printed the speaker with her title and showed that the two do not compose:
-- the run rule wants the words identical, and the one-edit rule compares the
-- whole of both names, which are eight characters apart.
--
-- So for proper names the one-edit rule now also slides along the longer name:
-- some run of as many words as the shorter name has is one edit from it.
--
-- And the bar for ANY near match rises from five characters to eight. Five was
-- a guess; the campaign that found all this holds Holga and Holgi, Korax,
-- Korux and Koran, Scorp and Snorp, every one a different person. Invented
-- names are short and dense, so one edit in five letters is no evidence at
-- all, and since the review defaults a candidate to Link, a wrong one costs a
-- real row. One edit in eight or more is a slip.

-- ── A run of the longer name, one edit from the shorter ─────────────────────
--
-- Compared word-run against whole name, never word against word: "Edgra
-- Durnoot" has to find "edgra durmoot" as a pair. Matching single words would
-- let any shared first name one letter off pull in a stranger.
--
-- False when the two have the same number of words (that is the whole-name
-- comparison, `names_one_edit_apart`), and when the shorter name is under
-- eight characters, the same bar the whole-name rule has: a short row like
-- "Marta" would otherwise be offered for every "Marty Brightwood" a book
-- prints.

create or replace function private.name_run_one_edit_apart(a text, b text)
returns boolean
language sql
immutable
strict
set search_path to ''
as $function$
  select coalesce(
    bool_or(private.names_one_edit_apart(array_to_string(t.long[i : i + t.k - 1], ' '), t.short)),
    false)
  from (
    select case when c.wa > c.wb then string_to_array(a, ' ') else string_to_array(b, ' ') end as long,
           case when c.wa > c.wb then b else a end as short,
           least(c.wa, c.wb) as k,
           greatest(c.wa, c.wb) as n
    from (
      select array_length(string_to_array(a, ' '), 1) as wa,
             array_length(string_to_array(b, ' '), 1) as wb
    ) c
    where c.wa <> c.wb
  ) t,
  generate_series(1, t.n - t.k + 1) as i
  where length(t.short) >= 8;
$function$;

comment on function private.name_run_one_edit_apart(text, text) is
  'True when some contiguous run of words in the longer normalized name is one '
  'edit from the whole of the shorter one ("speaker edgra durmoot" and "edgra '
  'durnoot"). Always false, never null, for two names of equal word count.';

revoke execute on function private.name_run_one_edit_apart(text, text) from public, anon, authenticated;

-- ── The verdict, in one place ───────────────────────────────────────────────
--
-- How two normalized names relate: 'exact', 'contains', 'near', or null for
-- not at all. Lifted out of `match_import_entity_names`, whose 150-line body
-- had to be restated in full to change four lines of this, twice in one day.
-- The rules and the reasons for each limit are in `20261002131333`; what
-- differs here is the last branch, which is new, and the length a near match
-- needs, eight where that migration said five.

create or replace function private.import_name_verdict(
  p_kind   text,
  p_asked  text,
  p_exists text,
  p_source text
)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case
    when p_exists = p_asked then 'exact'
    -- Whole-word suffix, either direction: every kind.
    when right(' ' || p_asked, length(p_exists) + 1) = ' ' || p_exists
      or right(' ' || p_exists, length(p_asked) + 1) = ' ' || p_asked then 'contains'
    -- Whole-word run anywhere, either direction: proper names only.
    when p_kind in ('npcs', 'factions', 'locations')
     and (position(' ' || p_exists || ' ' in ' ' || p_asked || ' ') > 0
       or position(' ' || p_asked || ' ' in ' ' || p_exists || ' ') > 0) then 'contains'
    -- One edit from the whole name: the DM's own rows, every kind.
    when p_source = 'campaign'
     and length(p_asked) >= 8 and length(p_exists) >= 8
     and abs(length(p_asked) - length(p_exists)) <= 1
     and private.names_one_edit_apart(p_asked, p_exists) then 'near'
    -- One edit from a run inside the longer name: the DM's own proper names.
    when p_source = 'campaign'
     and p_kind in ('npcs', 'factions', 'locations')
     and private.name_run_one_edit_apart(p_asked, p_exists) then 'near'
  end;
$function$;

comment on function private.import_name_verdict(text, text, text, text) is
  'How an extracted name relates to an existing row''s, both already normalized: '
  'exact, contains, near, or null. The matching rules of match_import_entity_names.';

revoke execute on function private.import_name_verdict(text, text, text, text) from public, anon, authenticated;

-- ── The name tier, now asking the verdict ───────────────────────────────────
--
-- Unchanged apart from the lateral below: the pool, the scope, the ranking,
-- the caps and the rule that an exactly matched name gets no near ones.

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

comment on function public.match_import_entity_names(uuid, uuid, text, text[]) is
  'Name tier of the document-import dedupe: every own campaign/global row (max 25) '
  'and up to five library rows per extracted name, ranked exact, near, contains, own '
  'before library. The rules themselves are private.import_name_verdict. Service-role '
  'only; the import-match edge function authorizes the caller as a campaign DM first.';
