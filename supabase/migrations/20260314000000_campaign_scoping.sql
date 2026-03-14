-- ── Campaign scoping: add campaign_id FK to campaign-scoped tables ────────────
-- notes, calendar_events, party_members, encounters, npcs all get campaign_id.
-- Nullable so existing rows are unaffected; app always filters by non-null id.
-- Monsters, items, spells, scriptorium_documents remain global/per-user assets.

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.party_members
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.npcs
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

-- Indexes for campaign-scoped queries
CREATE INDEX IF NOT EXISTS notes_campaign_idx
  ON public.notes(campaign_id) WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS calendar_events_campaign_idx
  ON public.calendar_events(campaign_id) WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS party_members_campaign_idx
  ON public.party_members(campaign_id) WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS encounters_campaign_idx
  ON public.encounters(campaign_id) WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS npcs_campaign_idx
  ON public.npcs(campaign_id) WHERE campaign_id IS NOT NULL;
