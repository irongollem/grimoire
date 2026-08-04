-- Migration: ai_acknowledgements
-- Consent gateway (#607/#608): versioned per-user AI-use and likeness acknowledgements
--
-- Backs the consent gateway coupled to the campaigns.ai_enabled toggle: enabling AI
-- on a campaign is the opt-in moment that records an 'ai_use' acknowledgement, and
-- portrait flows (Simulacrum stylize/sculpt, chronicle reference images, group
-- portrait, NPC disguise) additionally require a 'likeness' acknowledgement,
-- enforced server-side (see context/compliance/provenance-architecture.md §3).
-- Rows are append-only in practice: a version bump records a NEW row rather than
-- rewriting the old one, so the acknowledgement history for a given version never
-- changes retroactively.

create table ai_acknowledgements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('ai_use', 'likeness')),
  version    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, version)
);

alter table ai_acknowledgements enable row level security;

create policy "ai_acknowledgements_select" on ai_acknowledgements for select using (auth.uid() = user_id);
create policy "ai_acknowledgements_insert" on ai_acknowledgements for insert with check (auth.uid() = user_id);
create policy "ai_acknowledgements_update" on ai_acknowledgements for update using (auth.uid() = user_id);
create policy "ai_acknowledgements_delete" on ai_acknowledgements for delete using (auth.uid() = user_id);

create trigger ai_acknowledgements_updated_at
  before update on ai_acknowledgements
  for each row execute procedure update_updated_at();
