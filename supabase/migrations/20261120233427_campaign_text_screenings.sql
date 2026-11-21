-- The campaign's own text is screened before the AI Dungeon Master reads it (#1021 row 18).
--
-- What a turn gives the narrator includes text the campaign supplies: the world and canon, places, people, quests,
-- handouts, memories. A player can write some of it, so it is a way in for content the table refuses. Until now it was
-- screened only when the narrator's words carried it. The turn now screens each campaign-supplied section before the
-- narrator reads it, and keeps the verdict here by the text's hash, so text that has not changed is never screened twice
-- (the moderation call is free, the latency is not). A refused section is withheld from the narrator.
--
-- Deny-all: only the server (service role) reads and writes it. A policy would only widen access to a cache nobody else
-- needs. Not live (no screen reads it) and not copied with the demo (it rebuilds itself on the next turn).

create table public.campaign_text_screenings (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- sha-256 of the exact text screened, hex.
  text_hash text not null,
  flagged boolean not null,
  -- The moderation categories that crossed their threshold, for the DM's view of why; empty when not flagged.
  categories text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, text_hash)
);

comment on table public.campaign_text_screenings is
  'Verdicts of the AI table''s screen on campaign-supplied text, by hash (#1021 row 18). Deny-all, server only.';

create trigger campaign_text_screenings_updated_at
  before update on public.campaign_text_screenings
  for each row execute procedure update_updated_at();

alter table public.campaign_text_screenings enable row level security;

grant select, insert, update, delete on public.campaign_text_screenings to service_role;

insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('campaign_text_screenings', 1, false, 'a verdict cache of the AI table''s screen: rebuilt by the next turn, never template content');
