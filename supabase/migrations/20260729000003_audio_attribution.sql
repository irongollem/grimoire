-- Migration: audio_attribution
-- Completes the Reliquary Licences tab with the audio catalogue: backfills the
-- missing licence URLs on sound_library and adds the RPC the tab reads.

-- ── 1. Every licence needs a reachable licence ────────────────────────────
--
-- The Wikimedia Commons rows were ingested without a license_url, so 26 sounds
-- named a licence the reader had no way to go and read. The name alone is not
-- the notice CC-BY asks for.

update "public"."sound_library" set "license_url" = 'https://creativecommons.org/publicdomain/zero/1.0/'
  where "license_url" is null and "license" = 'CC0';
update "public"."sound_library" set "license_url" = 'https://creativecommons.org/licenses/by/2.0/'
  where "license_url" is null and "license" = 'CC-BY 2.0';
update "public"."sound_library" set "license_url" = 'https://creativecommons.org/licenses/by/3.0/'
  where "license_url" is null and "license" = 'CC-BY 3.0';
update "public"."sound_library" set "license_url" = 'https://creativecommons.org/licenses/by/4.0/'
  where "license_url" is null and "license" = 'CC-BY 4.0';

-- ── 2. What the Licences tab reads for audio ──────────────────────────────
--
-- The compendium's licences are per-document; audio's are per-sound, with a
-- ready-made credit line already stored on each row. So this returns one group
-- per (licence, source) with its credit lines gathered, rather than anything
-- resembling content_sources — the two bodies of content genuinely have
-- different attribution shapes and forcing them into one table would flatten
-- that.
--
-- `attributions` is null for CC0 groups: those require no credit, and an empty
-- list would read as "credits missing" rather than "none required".
--
-- SECURITY INVOKER, matching get_content_licenses() — sound_library is already
-- readable by every signed-in user, so there is nothing here a caller could not
-- read directly.
create or replace function public.get_audio_licenses()
returns table (
  license         text,
  license_url     text,
  source          text,
  sound_count     bigint,
  author_count    bigint,
  requires_credit boolean,
  attributions    text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    sl.license,
    max(sl.license_url)                                                as license_url,
    sl.source,
    count(*)                                                           as sound_count,
    count(distinct sl.author)                                          as author_count,
    count(*) filter (where sl.attribution is not null) > 0             as requires_credit,
    array_agg(distinct sl.attribution) filter (where sl.attribution is not null) as attributions
  from sound_library sl
  group by sl.license, sl.source
  order by (count(*) filter (where sl.attribution is not null) > 0) desc, sl.license, sl.source;
$$;

comment on function public.get_audio_licenses() is
  'Per-licence audio attribution for the Reliquary Licences tab. attributions is null for CC0 groups (no credit required), never an empty array.';
