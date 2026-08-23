-- Migration: dashboard_layouts
-- Durable home for a DM's rearranged dashboard, per user, campaign and surface
-- (#762, part of the customizable-dashboard mechanism, epic #760).
--
-- Why a table instead of localStorage: `campaign_session_state` (#758) exists
-- because `sessionRunning` used to live in `useLocalStorage` and a DM who preps
-- on a desktop and runs the table on a laptop never saw the same state twice.
-- A rearranged dashboard is the same promise — it has to follow the account
-- across browsers, not the browser profile.
--
-- Why there is no campaign-membership gate on read, only `auth.uid() =
-- user_id`: a saved layout is a private preference *about* a campaign, not
-- campaign data that other members might need to see. A stale row for a
-- campaign the user has since left just renders nothing (the client falls
-- back to defaults) and disappears on its own once the campaign is deleted,
-- via the cascade below.
--
-- Lazy-created, no backfill: a missing row means "use the client's
-- DEFAULT_LAYOUTS[surface]". `layout` is deliberately left as opaque jsonb
-- rather than shaped with a check constraint — the widget registry that
-- defines what a valid entry looks like lives in TypeScript
-- (`{ widgets: [{ key, id, width, settings? }], known?: string[] }`), and a
-- SQL copy of that shape would drift from it the first time a widget was
-- added. The client parses defensively instead, and a malformed row behaves
-- as if it were absent. `known` records which widget ids the registry
-- offered at save time, so the client can tell a widget that shipped after
-- the save (append it, mark it new) apart from one the DM deliberately
-- removed (leave it out).
--
-- No SECURITY DEFINER function and no RPC: this is plain own-row data, and
-- PostgREST upsert under RLS already covers every access pattern the client
-- needs, so adding a definer function here would only grow the
-- security-advisor baseline for no reason.
--
-- The FK to auth.users is `on delete cascade`, which is what puts this table
-- into the GDPR paths without any wiring: `export_user_data` walks the
-- auth.users FK graph at runtime rather than reading a manifest, precisely so
-- a table added by a later migration inherits Art. 15 export and Art. 17
-- erasure for free (see context/compliance/data-subject-rights.md §4). Do not
-- add a hand-written entry for it anywhere — the graph is the definition.
--
-- No index on campaign_id: every read the client makes is keyed on the full
-- (user_id, campaign_id, surface), which the primary key already covers, and
-- this table holds at most a handful of rows per user. An index would only
-- serve the ON DELETE CASCADE from campaigns, and at this row count a
-- sequential scan is cheaper than an index the Supabase advisor would flag as
-- unused the moment it shipped (see the "Supabase unused index" note in
-- CLAUDE.md) — so it is left out on purpose, not missing by oversight.
create table dashboard_layouts (
  user_id uuid not null references auth.users (id) on delete cascade,
  campaign_id uuid not null references campaigns (id) on delete cascade,
  surface text not null check (surface in ('prep', 'session')),
  layout jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, campaign_id, surface)
);

create trigger dashboard_layouts_updated_at
  before update on dashboard_layouts
  for each row execute procedure update_updated_at();

alter table dashboard_layouts enable row level security;

create policy "dashboard_layouts_select" on dashboard_layouts for select using (auth.uid() = user_id);
create policy "dashboard_layouts_insert" on dashboard_layouts for insert with check (auth.uid() = user_id);
create policy "dashboard_layouts_update" on dashboard_layouts for update using (auth.uid() = user_id);
create policy "dashboard_layouts_delete" on dashboard_layouts for delete using (auth.uid() = user_id);
