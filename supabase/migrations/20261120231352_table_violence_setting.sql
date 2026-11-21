-- How hard the AI table tells violence and horror (#1021 row 18).
--
-- The maintainer's decision (21 Nov 2026): a DM may turn violence and horror up or down for their table; the rules on
-- sexual content stay fixed for everyone and can never be loosened. This is that one dial, a campaign setting like
-- `map_memory` and `player_sight`. It changes only the narrator's line about violence and horror
-- (`_shared/agent/conduct.ts`); the content screen has no violence gate to move, and its sexual-content thresholds can only
-- be tightened (`tighter`), so nothing here reaches them.
--   gentle    danger and defeat without lingering on wounds or cruelty: a table for younger or gentler players
--   standard  as a D&D table tells it: plainly, without relish and without gore for its own sake (the default)
--   grim      grim and unflinching, wounds and horror told with weight, still never gore for its own sake

alter table public.campaigns
  add column table_violence text not null default 'standard'
    constraint campaigns_table_violence_check check (table_violence in ('gentle', 'standard', 'grim'));

comment on column public.campaigns.table_violence is
  'How hard the AI table tells violence and horror: gentle, standard (default) or grim (#1021 row 18). Never touches the '
  'sexual-content rules, which are fixed.';
