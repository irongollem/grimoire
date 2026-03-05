-- ═══════════════════════════════════════════════════════════════════════════════
-- Grimoire — Supabase Database Migrations
-- Run these in order in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 001: Extensions & shared trigger ────────────────────────────────────────

-- Auto-update updated_at on any table
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ── 002: Campaigns ───────────────────────────────────────────────────────────

create table public.campaigns (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  name         text not null,
  description  text,
  setting      text not null default 'Faerûn',
  current_year integer not null default 1495,
  calendar_id  text not null default 'faerun',  -- references CalendarAdapter.id
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.campaigns enable row level security;

create policy "Users manage own campaigns" on public.campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger campaigns_updated_at
  before update on public.campaigns
  for each row execute procedure update_updated_at();


-- ── 003: Notes ───────────────────────────────────────────────────────────────

create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  title       text not null default 'Untitled Note',
  content     text,              -- Tiptap editor JSON string
  category    text not null default 'general',
                                 -- general | session | lore | location | quest | faction
  tags        text[] not null default '{}',
  session_num integer,
  is_pinned   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index notes_user_id_idx  on public.notes(user_id);
create index notes_category_idx on public.notes(user_id, category);
create index notes_tags_idx     on public.notes using gin(tags);

alter table public.notes enable row level security;

create policy "Users see own notes"    on public.notes for select using (auth.uid() = user_id);
create policy "Users insert own notes" on public.notes for insert with check (auth.uid() = user_id);
create policy "Users update own notes" on public.notes for update using (auth.uid() = user_id);
create policy "Users delete own notes" on public.notes for delete using (auth.uid() = user_id);

create trigger notes_updated_at
  before update on public.notes
  for each row execute procedure update_updated_at();


-- ── 004: Calendar Events ─────────────────────────────────────────────────────

create table public.calendar_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  title        text not null,
  description  text,
  event_type   text not null default 'campaign',
                               -- campaign | world | session | festival | deadline
  -- Harptos date fields (month/day null when festival_day is set)
  harptos_year  integer not null,
  harptos_month integer,
  harptos_day   integer,
  festival_day  text,           -- Midwinter | Greengrass | Midsummer | Highharvestide | Feast of the Moon | Shieldmeet
  is_multi_day  boolean not null default false,
  end_year      integer,
  end_month     integer,
  end_day       integer,
  color         text not null default '#C9920A',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index calendar_events_user_idx on public.calendar_events(user_id);
create index calendar_events_year_idx on public.calendar_events(user_id, harptos_year);

alter table public.calendar_events enable row level security;

create policy "Users see own events"    on public.calendar_events for select using (auth.uid() = user_id);
create policy "Users insert own events" on public.calendar_events for insert with check (auth.uid() = user_id);
create policy "Users update own events" on public.calendar_events for update using (auth.uid() = user_id);
create policy "Users delete own events" on public.calendar_events for delete using (auth.uid() = user_id);

create trigger calendar_events_updated_at
  before update on public.calendar_events
  for each row execute procedure update_updated_at();


-- ── 005: Scriptorium Documents ───────────────────────────────────────────────

create table public.scriptorium_documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  title        text not null default 'Untitled Document',
  content      text,            -- Tiptap editor JSON string
  doc_type     text not null default 'custom',
                                -- custom | spell | monster | item | class | subclass | race | background | adventure | npc-sheet
  tags         text[] not null default '{}',
  is_published boolean not null default false,
  word_count   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index scriptorium_docs_user_idx on public.scriptorium_documents(user_id);
create index scriptorium_docs_type_idx on public.scriptorium_documents(user_id, doc_type);

alter table public.scriptorium_documents enable row level security;

create policy "Users see own docs"    on public.scriptorium_documents for select using (auth.uid() = user_id);
create policy "Users insert own docs" on public.scriptorium_documents for insert with check (auth.uid() = user_id);
create policy "Users update own docs" on public.scriptorium_documents for update using (auth.uid() = user_id);
create policy "Users delete own docs" on public.scriptorium_documents for delete using (auth.uid() = user_id);

create trigger scriptorium_updated_at
  before update on public.scriptorium_documents
  for each row execute procedure update_updated_at();


-- ── 006: NPCs ────────────────────────────────────────────────────────────────

create table public.npcs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade not null,
  name                text not null,
  race                text,
  class               text,
  alignment           text,
  age                 text,
  occupation          text,
  location            text,
  affiliation         text,
  appearance          text,
  personality         text,
  backstory           text,
  secret              text,     -- DM-only
  notes               text,
  status              text not null default 'alive',
                                -- alive | dead | missing | unknown
  relationship        text not null default 'neutral',
                                -- ally | neutral | enemy | unknown
  portrait_url        text,
  tags                text[] not null default '{}',
  stat_block          jsonb,    -- full D&D 5e/2024 stat block
  scriptorium_doc_id  uuid references public.scriptorium_documents(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index npcs_user_idx         on public.npcs(user_id);
create index npcs_status_idx       on public.npcs(user_id, status);
create index npcs_relationship_idx on public.npcs(user_id, relationship);
create index npcs_tags_idx         on public.npcs using gin(tags);

alter table public.npcs enable row level security;

create policy "Users see own npcs"    on public.npcs for select using (auth.uid() = user_id);
create policy "Users insert own npcs" on public.npcs for insert with check (auth.uid() = user_id);
create policy "Users update own npcs" on public.npcs for update using (auth.uid() = user_id);
create policy "Users delete own npcs" on public.npcs for delete using (auth.uid() = user_id);

create trigger npcs_updated_at
  before update on public.npcs
  for each row execute procedure update_updated_at();


-- ── Storage bucket (run this separately or via the Supabase dashboard) ───────
-- Dashboard → Storage → New bucket → name: "npc-portraits", public: true
-- Then add a policy: authenticated users can insert into their own folder
