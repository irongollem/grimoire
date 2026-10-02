-- The import review marked every NPC and every location on a page as new,
-- including two towns and three people the campaign already had.
--
-- Found on a real chapter (2 Oct 2026), and each miss had a different cause:
--
--   page says            the DM's row         why the name tier missed it
--   ───────────────────  ───────────────────  ─────────────────────────────────
--   Dougan’s Hole        Dougan's Hole        typeset apostrophe vs a typed one
--   Ten-Towns            Ten Towns            hyphen vs a space
--   Finn Dejarr          Finn                 "contains" only looked at the END
--   Silja Dejarr         Silja                of a name, and a given name comes
--   Hilda                Hilda Snowmantle     first
--   Edgra Durmoot        Edgra Durnoot        one letter, typed by hand
--
-- The embedding tier ran and added nothing: it compares whole descriptions, and
-- a row holding "Finn · Human · Child" is nowhere near a page's paragraph about
-- the same boy. So `20260918141022`'s note that "the embedding tier covers the
-- rest" does not hold for names, and the name tier has to carry them itself.
--
-- Three changes, each the narrowest one that closes its row of the table.

-- ── 1. Punctuation is not part of a name's key ──────────────────────────────
--
-- A printed book sets ’ where a keyboard types ', and hyphenates what a DM
-- writes as two words. Apostrophes are dropped outright ("dougans hole" either
-- way, and also for a DM who never typed one); every other mark becomes a
-- space, so "Ten-Towns", "L5. Icy Tomb" and "Potion of Healing (Greater)" key
-- on their words alone.
--
-- An explicit list rather than "anything that is not a letter": the TypeScript
-- port (`entityName.ts`) must give the same key, and what counts as a letter is
-- a locale question the two runtimes answer differently. `+` is deliberately
-- absent, since "+1 Longsword" is a different item from "Longsword".
--
-- Shared by `resolve_monster_references` and `resolve_item_references`, which
-- gain the same tolerance.

create or replace function private.normalize_entity_name(p_name text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            btrim(
              regexp_replace(
                translate(lower(coalesce(p_name, '')), '''’‘ʼ`´', ''),
              '[][().,:;!?"“”/‐‑‒–—-]', ' ', 'g')),
          '^(a|an|the)\s+', ''),
        '\s+', ' ', 'g'),
      -- "potions of healing" → "potion of healing". English pluralises the head
      -- noun of an "X of Y" name, so the trailing-s rule below never sees it —
      -- and "X of Y" is how most magic items are named.
      '^([a-z]{3,})s( of )', '\1\2'),
    '([a-z]{3,})s$', '\1'),
  '');
$function$;

comment on function private.normalize_entity_name(text) is
  'Lowercases, drops apostrophes, turns other punctuation into spaces, drops a '
  'leading article and de-pluralises the last word, so "The Giant Rats" meets '
  '"giant rat" and a typeset "Dougan’s Hole" meets a typed "Dougan''s Hole". '
  'Deliberately naive: a lookup key for entity names, not an English stemmer. '
  'Ported term for term in src/lib/documentImport/entityName.ts.';

-- ── 2. One keystroke apart ──────────────────────────────────────────────────
--
-- True when two keys differ by a single insertion, deletion, substitution or
-- swap of neighbouring letters. Strip what the two share at the front, then
-- what the remainders share at the back; a single edit leaves at most one
-- character on each side, and a swap leaves two that mirror each other.
--
-- Written out rather than taken from `fuzzystrmatch` or `pg_trgm`: one edit is
-- all a typo or an OCR slip needs, and it is not worth an extension.

create or replace function private.names_one_edit_apart(a text, b text)
returns boolean
language sql
immutable
strict
set search_path to ''
as $function$
  select a <> b and (
    (length(m.ra) <= 1 and length(m.rb) <= 1)
    or (length(m.ra) = 2 and length(m.rb) = 2 and m.ra = reverse(m.rb))
  )
  from (
    select left(r.ra, length(r.ra) - s.n) as ra, left(r.rb, length(r.rb) - s.n) as rb
    from (
      select substr(a, p.n + 1) as ra, substr(b, p.n + 1) as rb
      from (
        select coalesce(min(i) - 1, least(length(a), length(b))) as n
        from generate_series(1, least(length(a), length(b))) as i
        where substr(a, i, 1) <> substr(b, i, 1)
      ) p
    ) r,
    lateral (
      select coalesce(min(i) - 1, least(length(r.ra), length(r.rb))) as n
      from generate_series(1, least(length(r.ra), length(r.rb))) as i
      where substr(reverse(r.ra), i, 1) <> substr(reverse(r.rb), i, 1)
    ) s
  ) m;
$function$;

comment on function private.names_one_edit_apart(text, text) is
  'True when two normalized names differ by exactly one insertion, deletion, '
  'substitution or adjacent swap. The typo tier of match_import_entity_names.';

revoke execute on function private.names_one_edit_apart(text, text) from public, anon, authenticated;

-- ── 3. The name tier itself ─────────────────────────────────────────────────
--
-- Two additions to the join; the pool, the scope and the caps are unchanged.
--
-- PEOPLE, PLACES AND GROUPS MATCH ON ANY WHOLE-WORD RUN. A creature or an item
-- is named head-noun-last ("Icewind kobold" is a kobold), which is why the
-- suffix rule was right for them and stays the only partial rule they get: the
-- library is large, and "Potion of Healing" offering every greater and superior
-- variant beside its own exact match would turn a settled row into a question.
-- A proper name has no head noun. The page prints "Finn Dejarr" where the DM
-- wrote "Finn", or "Imdra" where the DM wrote "Captain Imdra Arlaggath", so for
-- npcs, factions and locations either name may sit anywhere inside the other,
-- still on word boundaries: "rat" does not find "Pirate".
--
-- A NEAR MATCH IS ONE EDIT AWAY, AND ONLY EVER THE DM'S OWN ROW. The library is
-- spelled the way the books spell it, and distinct canonical names sit one
-- letter apart ("Ghast" and "Ghost", "Giant Rat" and "Giant Bat"), so a near
-- tier over it would mostly offer the wrong creature. A row the DM typed is
-- where a slip actually lives. Two further guards: both keys are at least five
-- characters, because short names collide by chance, and a name that has an
-- exact match gets no near ones, because then it was not misspelled.
--
-- Rank: exact, then near, then contains; own before library within each. A
-- whole name one letter off is a stronger claim than a shared word.

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
      select case
        when e.norm = a.norm then 'exact'
        -- Whole-word suffix, either direction: every kind.
        when right(' ' || a.norm, length(e.norm) + 1) = ' ' || e.norm
          or right(' ' || e.norm, length(a.norm) + 1) = ' ' || a.norm then 'contains'
        -- Whole-word run anywhere, either direction: proper names only.
        when p_kind in ('npcs', 'factions', 'locations')
         and (position(' ' || e.norm || ' ' in ' ' || a.norm || ' ') > 0
           or position(' ' || a.norm || ' ' in ' ' || e.norm || ' ') > 0) then 'contains'
        when e.source = 'campaign'
         and length(a.norm) >= 5 and length(e.norm) >= 5
         and abs(length(a.norm) - length(e.norm)) <= 1
         and private.names_one_edit_apart(a.norm, e.norm) then 'near'
      end as match_kind
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
  'and up to five library rows per extracted name. Exact, then near (an own row one '
  'edit away, when nothing is exact), then whole-word contains: a suffix for every '
  'kind, anywhere in the name for npcs, factions and locations. Service-role only; '
  'the import-match edge function authorizes the caller as a campaign DM first.';
