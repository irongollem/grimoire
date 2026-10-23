-- Open Book (#1085): a DM releases a frozen copy of what their table has found, and anyone can read it at
-- /w/<slug>. The decisions are in the epic body; the ones that shape this file:
--
--   * A release is a snapshot, built here in SQL and stored as jsonb. Visitors read it through the `open-book`
--     Edge Function with the service role, so `anon` gains no table, no policy and no RPC.
--   * The book never runs ahead of the table: an entry can be in it only when the whole party can read it
--     (`player_visible_to` holds every party member of the campaign, and there is at least one).
--   * The world reads exactly what the table reads. The snapshot restates the player projections' redaction
--     (get_player_visible_npcs / _locations / _factions / _notes, newest in 20261021164506 and 20261022113302)
--     with that whole-party predicate, because those projections are keyed on auth.uid() and cannot be called
--     "as the party". Every rich-text field goes through private.withhold_secret_blocks.
--   * Owner-only: a release is the owner's, and needs Pro. A co-DM edits the campaign but does not publish it.

-- ── 1. Tables ───────────────────────────────────────────────────────────────────

-- One row per release. `snapshot` is the whole book as visitors see it; `stats` its counts, for the Settings tab.
create table public.open_book_releases (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  number integer not null check (number > 0),
  note text check (char_length(note) <= 280),
  snapshot jsonb not null,
  stats jsonb not null default '{}'::jsonb,
  pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, number),
  -- The target of open_books' composite key, which keeps a book's live release inside its own campaign.
  unique (campaign_id, id)
);

create index open_book_releases_created_by_idx on public.open_book_releases (created_by) where created_by is not null;

create trigger open_book_releases_updated_at
  before update on public.open_book_releases
  for each row execute procedure update_updated_at();

-- One book per campaign. The cover and the address are settings; what goes in is the snapshot's business.
create table public.open_books (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  subtitle text check (char_length(subtitle) <= 240),
  cover_art text not null default 'tooled' check (cover_art in ('tooled', 'plate', 'full')),
  cover_image_url text,
  leather text not null default 'oxblood' check (leather in ('oxblood', 'sea', 'night', 'walnut', 'ash')),
  chapters text[] not null default array['atlas', 'folk', 'factions', 'pantheon', 'lore', 'chronicle']
    check (chapters <@ array['atlas', 'folk', 'factions', 'pantheon', 'lore', 'chronicle']),
  -- Everything the whole party can see goes in unless open_book_entries takes it out; off, only what it puts in.
  include_shared boolean not null default true,
  allow_pdf boolean not null default true,
  indexable boolean not null default false,
  is_open boolean not null default false,
  live_release_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- `on delete set null (live_release_id)`: deleting a release clears the pointer, never the campaign_id half.
  foreign key (campaign_id, live_release_id)
    references public.open_book_releases (campaign_id, id) on delete set null (live_release_id),
  -- An open book always has something to show.
  constraint open_books_open_has_release check (not is_open or live_release_id is not null)
);

create index open_books_live_release_idx on public.open_books (campaign_id, live_release_id) where live_release_id is not null;

create trigger open_books_updated_at
  before update on public.open_books
  for each row execute procedure update_updated_at();

-- The exceptions to include_shared, per entry. A row is only ever written for an entry the DM chose by hand
-- (or in bulk); everything else follows the book's default. There is no foreign key because the entry can be
-- one of six tables; the delete triggers in section 4 keep it from outliving its entry.
create table public.open_book_entries (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  entity_type text not null check (entity_type in ('location', 'npc', 'faction', 'pantheon', 'deity', 'note')),
  entity_id uuid not null,
  included boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, entity_type, entity_id)
);

create trigger open_book_entries_updated_at
  before update on public.open_book_entries
  for each row execute procedure update_updated_at();

-- ── 2. Access ───────────────────────────────────────────────────────────────────
-- By campaign ownership, never by a user_id column: an ownership transfer hands the book over with the campaign.
-- private.is_campaign_owner is total (false for a stranger or a missing campaign).

alter table public.open_books enable row level security;
create policy "open_books_select" on public.open_books for select using (private.is_campaign_owner(campaign_id));
create policy "open_books_insert" on public.open_books for insert with check (private.is_campaign_owner(campaign_id));
create policy "open_books_update" on public.open_books for update
  using (private.is_campaign_owner(campaign_id)) with check (private.is_campaign_owner(campaign_id));
create policy "open_books_delete" on public.open_books for delete using (private.is_campaign_owner(campaign_id));
grant select, insert, update, delete on public.open_books to authenticated, service_role;

-- Releases are written only by release_open_book, so there is no insert policy and no insert grant. The owner
-- may annotate one (note, pdf_url), and delete any but the live one.
alter table public.open_book_releases enable row level security;
create policy "open_book_releases_select" on public.open_book_releases for select
  using (private.is_campaign_owner(campaign_id));
create policy "open_book_releases_update" on public.open_book_releases for update
  using (private.is_campaign_owner(campaign_id)) with check (private.is_campaign_owner(campaign_id));
create policy "open_book_releases_delete" on public.open_book_releases for delete
  using (
    private.is_campaign_owner(campaign_id)
    and not exists (select 1 from public.open_books b where b.live_release_id = open_book_releases.id)
  );
grant select, delete on public.open_book_releases to authenticated;
grant update (note, pdf_url) on public.open_book_releases to authenticated;
grant select, insert, update, delete on public.open_book_releases to service_role;

alter table public.open_book_entries enable row level security;
create policy "open_book_entries_select" on public.open_book_entries for select using (private.is_campaign_owner(campaign_id));
create policy "open_book_entries_insert" on public.open_book_entries for insert with check (private.is_campaign_owner(campaign_id));
create policy "open_book_entries_update" on public.open_book_entries for update
  using (private.is_campaign_owner(campaign_id)) with check (private.is_campaign_owner(campaign_id));
create policy "open_book_entries_delete" on public.open_book_entries for delete using (private.is_campaign_owner(campaign_id));
grant select, insert, update, delete on public.open_book_entries to authenticated, service_role;

-- ── 3. Live sync and the demo copy ──────────────────────────────────────────────

create trigger open_books_signal_insert after insert on public.open_books
  referencing new table as changed for each statement execute procedure public.signal_campaign_change();
create trigger open_books_signal_update after update on public.open_books
  referencing old table as left_rows new table as changed for each statement execute procedure public.signal_campaign_change();
create trigger open_books_signal_delete after delete on public.open_books
  referencing old table as changed for each statement execute procedure public.signal_campaign_change();

create trigger open_book_releases_signal_insert after insert on public.open_book_releases
  referencing new table as changed for each statement execute procedure public.signal_campaign_change();
create trigger open_book_releases_signal_update after update on public.open_book_releases
  referencing old table as left_rows new table as changed for each statement execute procedure public.signal_campaign_change();
create trigger open_book_releases_signal_delete after delete on public.open_book_releases
  referencing old table as changed for each statement execute procedure public.signal_campaign_change();

create trigger open_book_entries_signal_insert after insert on public.open_book_entries
  referencing new table as changed for each statement execute procedure public.signal_campaign_change();
create trigger open_book_entries_signal_update after update on public.open_book_entries
  referencing old table as left_rows new table as changed for each statement execute procedure public.signal_campaign_change();
create trigger open_book_entries_signal_delete after delete on public.open_book_entries
  referencing old table as changed for each statement execute procedure public.signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values
  ('open_books', 1, false, 'the template author''s public book; a demo copy publishes nothing'),
  ('open_book_releases', 1, false, 'the template author''s released snapshots; a demo copy publishes nothing'),
  ('open_book_entries', 1, false, 'choices about the template author''s public book; a demo copy publishes nothing');

-- ── 4. Entries do not outlive what they point at ────────────────────────────────

create function private.forget_open_book_entries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.open_book_entries e
   using gone g
   where e.entity_type = tg_argv[0]
     and e.entity_id = g.id;
  return null;
end;
$$;

revoke execute on function private.forget_open_book_entries() from public, anon, authenticated;

create trigger locations_forget_open_book after delete on public.locations
  referencing old table as gone for each statement execute procedure private.forget_open_book_entries('location');
create trigger npcs_forget_open_book after delete on public.npcs
  referencing old table as gone for each statement execute procedure private.forget_open_book_entries('npc');
create trigger factions_forget_open_book after delete on public.factions
  referencing old table as gone for each statement execute procedure private.forget_open_book_entries('faction');
create trigger pantheons_forget_open_book after delete on public.pantheons
  referencing old table as gone for each statement execute procedure private.forget_open_book_entries('pantheon');
create trigger deities_forget_open_book after delete on public.deities
  referencing old table as gone for each statement execute procedure private.forget_open_book_entries('deity');
create trigger notes_forget_open_book after delete on public.notes
  referencing old table as gone for each statement execute procedure private.forget_open_book_entries('note');

-- ── 5. The snapshot ─────────────────────────────────────────────────────────────

-- Whether the whole party can read something. Total: false, never NULL, and false for a campaign with no party,
-- so an empty array never reads as "everyone".
create function private.open_book_whole_party(p_visible_to uuid[], p_party uuid[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_party) > 0 and coalesce(p_visible_to, '{}'::uuid[]) @> p_party, false);
$$;

-- Whether an entry the whole party may read is in the book: the DM's choice for that entry, else the default.
create function private.open_book_takes(p_campaign_id uuid, p_type text, p_id uuid, p_eligible boolean, p_default boolean)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(p_eligible, false) and coalesce((
    select e.included from public.open_book_entries e
     where e.campaign_id = p_campaign_id and e.entity_type = p_type and e.entity_id = p_id
  ), p_default, false);
$$;

revoke execute on function private.open_book_whole_party(uuid[], uuid[]) from public, anon, authenticated;
revoke execute on function private.open_book_takes(uuid, text, uuid, boolean, boolean) from public, anon, authenticated;

-- The whole book as one value. Not callable by any client role: preview_open_book and release_open_book reach it
-- after checking the caller owns the campaign. Returns NULL for a campaign with no book.
create function private.open_book_snapshot(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_book public.open_books;
  v_campaign public.campaigns;
  v_party uuid[];
  v_places jsonb := '[]'::jsonb;
  v_folk jsonb := '[]'::jsonb;
  v_factions jsonb := '[]'::jsonb;
  v_pantheons jsonb := '[]'::jsonb;
  v_deities jsonb := '[]'::jsonb;
  v_lore jsonb := '[]'::jsonb;
  v_sessions jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_names jsonb := '{}'::jsonb;
  v_cited uuid[];
begin
  select * into v_book from public.open_books where campaign_id = p_campaign_id;
  if not found then
    return null;
  end if;
  select * into v_campaign from public.campaigns where id = p_campaign_id;
  select coalesce(array_agg(pm.id), '{}'::uuid[]) into v_party
    from public.party_members pm where pm.campaign_id = p_campaign_id;

  if 'atlas' = any (v_book.chapters) then
    -- As get_player_visible_locations: description and map only when shared, DM notes and audio never, and
    -- only the pins players may see.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', l.id,
             'parent_id', l.parent_id,
             'name', l.name,
             'location_type', l.location_type,
             'player_summary', l.player_summary,
             'description', case when l.is_description_shared then private.withhold_secret_blocks(l.description) end,
             'image_url', l.image_url,
             'tags', to_jsonb(l.tags),
             'is_level', l.is_level,
             'is_battle_map', l.is_battle_map,
             'npcs_shared', l.is_npcs_shared,
             'map', case when l.is_map_shared then jsonb_build_object(
                      'url', l.map_url,
                      'layer_url', l.map_layer_url,
                      'layer_calibration', l.map_layer_calibration,
                      'plan_size', l.plan_size,
                      'scale', l.map_scale) end,
             'pins', coalesce((
                      select jsonb_agg(pin)
                        from jsonb_array_elements(coalesce(l.map_pins, '[]'::jsonb)) pin
                       where coalesce((pin->>'visible_to_players')::boolean, false)), '[]'::jsonb)
           ) order by l.sort_order nulls last, l.name), '[]'::jsonb)
      into v_places
      from public.locations l
     where l.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'location', l.id,
             private.open_book_whole_party(l.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'folk' = any (v_book.chapters) then
    -- As get_player_visible_npcs: only the fields the DM shares, the cover while a disguise holds, the cover the
    -- party knew once it falls, and no prose (players are never shown an NPC's appearance, personality or
    -- backstory). A person whose name is not shared has no page to be on.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id,
             'name', case when s.concealed and s.disguise_name is not null then s.disguise_name else s.name end,
             'race', case when 'race' = any (s.player_visible_fields) then s.race end,
             'occupation', case when 'occupation' = any (s.player_visible_fields) then s.occupation end,
             'status', s.status,
             'relationship', s.relationship,
             'portrait_url', case
                when not ('portrait' = any (s.player_visible_fields)) then null
                when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_url
                else s.portrait_url end,
             'portrait_focal_point', case
                when not ('portrait' = any (s.player_visible_fields)) then null
                when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_focal_point
                else s.portrait_focal_point end,
             'cutout_url', case when 'portrait' = any (s.player_visible_fields) and not s.concealed then s.cutout_url end,
             'location_id', case when 'location' = any (s.player_visible_fields) then s.location_id end,
             'former_name', case when s.unmasked then s.disguise_name end,
             'former_portrait_url', case when s.unmasked and 'portrait' = any (s.player_visible_fields) then s.disguise_portrait_url end
           ) order by s.name), '[]'::jsonb)
      into v_folk
      from (
        select n.*,
          ((n.disguise_name is not null or n.disguise_portrait_url is not null) and not n.is_revealed) as concealed,
          (n.is_revealed and n.unmasked_at is not null
            and (n.disguise_name is not null or n.disguise_portrait_url is not null)) as unmasked
          from public.npcs n
         where n.campaign_id = p_campaign_id
           and 'name' = any (n.player_visible_fields)
      ) s
     where private.open_book_takes(p_campaign_id, 'npc', s.id,
             private.open_book_whole_party(s.player_visible_to, v_party)
             -- or shared with the party through the place they live, as the projection's arm (b)
             or exists (
               select 1 from public.locations l
                where l.id = s.location_id
                  and l.is_npcs_shared
                  and private.open_book_whole_party(l.player_visible_to, v_party)),
             v_book.include_shared);
  end if;

  if 'factions' = any (v_book.chapters) then
    -- As get_player_visible_factions: descent is the party's to know, the succession custom is not.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', f.id,
             'name', f.name,
             'faction_type', f.faction_type,
             'description', private.withhold_secret_blocks(f.description),
             'emblem_url', f.emblem_url,
             'alignment', f.alignment,
             'tags', to_jsonb(f.tags),
             'party_standing', f.party_standing,
             'descent', f.descent
           ) order by f.name), '[]'::jsonb)
      into v_factions
      from public.factions f
     where f.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'faction', f.id,
             private.open_book_whole_party(f.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'pantheon' = any (v_book.chapters) then
    -- Players read pantheons and deities as raw rows (DM notes on them live in entity_notes, which the book never
    -- reads); the book also strips the secret blocks the raw read would show.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id,
             'name', p.name,
             'description', private.withhold_secret_blocks(p.description),
             'emblem_url', p.emblem_url,
             'tags', to_jsonb(p.tags)
           ) order by p.name), '[]'::jsonb)
      into v_pantheons
      from public.pantheons p
     where p.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'pantheon', p.id,
             private.open_book_whole_party(p.player_visible_to, v_party), v_book.include_shared);

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id,
             'pantheon_id', d.pantheon_id,
             'name', d.name,
             'titles', d.titles,
             'alternate_names', to_jsonb(d.alternate_names),
             'alignment', d.alignment,
             'symbol', d.symbol,
             'symbol_image_url', d.symbol_image_url,
             'portrait_url', d.portrait_url,
             'portrait_focal_point', d.portrait_focal_point,
             'domains', to_jsonb(d.domains),
             'portfolio', d.portfolio,
             'description', private.withhold_secret_blocks(d.description),
             'tags', to_jsonb(d.tags)
           ) order by d.name), '[]'::jsonb)
      into v_deities
      from public.deities d
     where d.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'deity', d.id,
             private.open_book_whole_party(d.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'lore' = any (v_book.chapters) then
    -- As get_player_visible_notes, less the session reports, which are the Chronicle's.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', n.id,
             'title', n.title,
             'category', n.category,
             'content', private.withhold_secret_blocks(n.content),
             'tags', to_jsonb(n.tags),
             'is_pinned', n.is_pinned,
             'created_at', n.created_at,
             'updated_at', n.updated_at
           ) order by n.is_pinned desc, n.sort_order nulls last, n.title), '[]'::jsonb)
      into v_lore
      from public.notes n
     where n.campaign_id = p_campaign_id
       and n.category is distinct from 'session'
       and private.open_book_takes(p_campaign_id, 'note', n.id,
             private.open_book_whole_party(n.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'chronicle' = any (v_book.chapters) then
    -- Session reports, with the session they belong to (get_player_sessions' columns).
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', n.id,
             'title', n.title,
             'content', private.withhold_secret_blocks(n.content),
             'tags', to_jsonb(n.tags),
             'session', case when cs.id is not null then jsonb_build_object(
                          'number', cs.number, 'title', cs.title, 'played_on', cs.played_on) end,
             'date', case when n.session_start_year is not null then jsonb_build_object(
                       'year', n.session_start_year, 'month', n.session_start_month, 'day', n.session_start_day,
                       'end_year', n.session_end_year, 'end_month', n.session_end_month, 'end_day', n.session_end_day) end,
             'real_date', n.session_real_date,
             'created_at', n.created_at
           ) order by cs.number nulls last, n.session_real_date nulls last, n.created_at), '[]'::jsonb)
      into v_sessions
      from public.notes n
      left join public.campaign_sessions cs on cs.id = n.session_id
     where n.campaign_id = p_campaign_id
       and n.category = 'session'
       and private.open_book_takes(p_campaign_id, 'note', n.id,
             private.open_book_whole_party(n.player_visible_to, v_party), v_book.include_shared);

    -- The calendar players already read (calendar_events_select): shown events and every session. Never the
    -- DM's links to quests, encounters or places.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id,
             'title', e.title,
             'description', private.withhold_secret_blocks(e.description),
             'event_type', e.event_type,
             'year', e.harptos_year, 'month', e.harptos_month, 'day', e.harptos_day,
             'festival_day', e.festival_day,
             'is_multi_day', e.is_multi_day,
             'end_year', e.end_year, 'end_month', e.end_month, 'end_day', e.end_day,
             'color', e.color
           ) order by e.harptos_year nulls last, e.harptos_month nulls last, e.harptos_day nulls last), '[]'::jsonb)
      into v_events
      from public.calendar_events e
     where e.campaign_id = p_campaign_id
       and (e.player_visible or e.event_type = 'session');
  end if;

  -- Rich text mentions people and places by id only (entityMention stores no label), so the book carries a
  -- name for every id its own pages cite, when the whole table can already read that name: the party's
  -- characters, people under their cover, places and factions. Only cited ids: an entry the DM took out keeps
  -- its name out of the book unless released text names it. A mention of anything else stays unnamed.
  select coalesce(array_agg(distinct m[1]::uuid), '{}'::uuid[])
    into v_cited
    from regexp_matches(
           concat_ws(' ', v_places::text, v_factions::text, v_pantheons::text, v_deities::text,
                     v_lore::text, v_sessions::text, v_events::text),
           '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g') m;

  select coalesce(jsonb_object_agg(x.id::text, x.name), '{}'::jsonb)
    into v_names
    from (
      select pm.id, pm.name from public.party_members pm where pm.campaign_id = p_campaign_id
      union all
      select n.id,
             case when (n.disguise_name is not null or n.disguise_portrait_url is not null) and not n.is_revealed
                       and n.disguise_name is not null
                  then n.disguise_name else n.name end
        from public.npcs n
       where n.campaign_id = p_campaign_id
         and 'name' = any (n.player_visible_fields)
         and (private.open_book_whole_party(n.player_visible_to, v_party)
              or exists (
                select 1 from public.locations l
                 where l.id = n.location_id
                   and l.is_npcs_shared
                   and private.open_book_whole_party(l.player_visible_to, v_party)))
      union all
      select l.id, l.name from public.locations l
       where l.campaign_id = p_campaign_id and private.open_book_whole_party(l.player_visible_to, v_party)
      union all
      select f.id, f.name from public.factions f
       where f.campaign_id = p_campaign_id and private.open_book_whole_party(f.player_visible_to, v_party)
    ) x
   where x.name is not null
     and x.id = any (v_cited);

  return jsonb_build_object(
    'v', 1,
    'book', jsonb_build_object(
      'title', v_book.title,
      'subtitle', v_book.subtitle,
      'cover_art', v_book.cover_art,
      'cover_image_url', v_book.cover_image_url,
      'leather', v_book.leather,
      'chapters', to_jsonb(v_book.chapters),
      'campaign_name', v_campaign.name),
    'calendar', jsonb_build_object(
      'calendar_id', v_campaign.calendar_id,
      'custom_calendar', v_campaign.custom_calendar,
      'current', jsonb_build_object('year', v_campaign.current_year, 'month', v_campaign.current_month, 'day', v_campaign.current_day)),
    'places', v_places,
    'folk', v_folk,
    'factions', v_factions,
    'pantheons', v_pantheons,
    'deities', v_deities,
    'lore', v_lore,
    'sessions', v_sessions,
    'events', v_events,
    'names', v_names,
    'stats', jsonb_build_object(
      'places', jsonb_array_length(v_places),
      'folk', jsonb_array_length(v_folk),
      'factions', jsonb_array_length(v_factions),
      'pantheons', jsonb_array_length(v_pantheons),
      'deities', jsonb_array_length(v_deities),
      'lore', jsonb_array_length(v_lore),
      'sessions', jsonb_array_length(v_sessions),
      'events', jsonb_array_length(v_events))
  );
end;
$$;

revoke execute on function private.open_book_snapshot(uuid) from public, anon, authenticated;

-- ── 6. What the owner calls ─────────────────────────────────────────────────────

-- The book as the next release would print it, for the release review and the preview. Owner only.
create function public.preview_open_book(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not coalesce(private.is_campaign_owner(p_campaign_id), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return private.open_book_snapshot(p_campaign_id);
end;
$$;

revoke execute on function public.preview_open_book(uuid) from public, anon;
grant execute on function public.preview_open_book(uuid) to authenticated, service_role;

-- Prints the next release and makes it the one visitors read, opening the book. Owner only, Pro only, and never
-- for a child account (whose world is not for publishing, however the campaign came to be theirs).
create function public.release_open_book(p_campaign_id uuid, p_note text default null)
returns public.open_book_releases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_snapshot jsonb;
  v_release public.open_book_releases;
begin
  if v_uid is null or not coalesce(private.is_campaign_owner(p_campaign_id), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if coalesce(private.is_child_account(v_uid), true) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not coalesce(public.is_user_pro(v_uid), false) then
    raise exception 'open_book_requires_pro' using errcode = 'P0001',
      hint = 'Releasing an Open Book is part of Pro.';
  end if;

  -- Lock the book so two releases at once cannot take the same number.
  perform 1 from public.open_books where campaign_id = p_campaign_id for update;
  if not found then
    raise exception 'open_book_not_set_up' using errcode = 'P0002';
  end if;

  v_snapshot := private.open_book_snapshot(p_campaign_id);

  insert into public.open_book_releases (campaign_id, created_by, number, note, snapshot, stats)
  values (
    p_campaign_id,
    v_uid,
    coalesce((select max(r.number) from public.open_book_releases r where r.campaign_id = p_campaign_id), 0) + 1,
    nullif(btrim(p_note), ''),
    v_snapshot - 'stats',
    coalesce(v_snapshot->'stats', '{}'::jsonb)
  )
  returning * into v_release;

  update public.open_books
     set live_release_id = v_release.id, is_open = true
   where campaign_id = p_campaign_id;

  return v_release;
end;
$$;

revoke execute on function public.release_open_book(uuid, text) from public, anon;
grant execute on function public.release_open_book(uuid, text) to authenticated, service_role;

-- ── 7. A release keeps its pictures ─────────────────────────────────────────────
-- A release is frozen, so the files it shows must outlive the rows that first held them. deleteUnreferenced
-- (src/lib/storage/deleteUnreferenced.ts, #917) asks this before removing a file. It must see releases a co-DM
-- cannot read, so it is a definer, scoped to the campaigns the caller runs; it answers yes or no about one URL.
create function public.open_book_image_in_use(p_url text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select auth.uid()) is not null
    and nullif(btrim(p_url), '') is not null
    and (
      exists (
        select 1 from public.open_book_releases r
         where private.is_campaign_dm(r.campaign_id)
           and position(p_url in r.snapshot::text) > 0)
      or exists (
        select 1 from public.open_books b
         where private.is_campaign_dm(b.campaign_id)
           and b.cover_image_url = p_url)
    ),
    false);
$$;

revoke execute on function public.open_book_image_in_use(text) from public, anon;
grant execute on function public.open_book_image_in_use(text) to authenticated, service_role;
