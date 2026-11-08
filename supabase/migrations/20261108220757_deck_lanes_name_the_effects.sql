-- A new Deck page names its four effect lanes for what goes in them.
--
-- The default laid out four lanes all called "Effects", which read as one lane
-- drawn four times and gave no hint that a lane is the DM's to name. Combat,
-- Creatures, Weather and Doors & traps are the effects a table reaches for
-- most, and a DM who sees them named learns at a glance that the names are
-- theirs to change (the maintainer, 8 Nov 2026). Only new pages: a page that
-- exists keeps the names its DM has, whether they changed them or not.
--
-- `defaultLanes()` in src/lib/audio/deck/deckModel.ts is the client's copy of
-- this default; deckModel.test.ts holds the two equal.
alter table public.soundboard_pages
  alter column lanes set default '[
    {"name": "Music",         "rule": "one",      "feed": "music"},
    {"name": "Place",         "rule": "one",      "feed": "place"},
    {"name": "Ambience",      "rule": "together", "feed": "ambience"},
    {"name": "Combat",        "rule": "together"},
    {"name": "Creatures",     "rule": "together"},
    {"name": "Weather",       "rule": "together"},
    {"name": "Doors & traps", "rule": "together"},
    {"name": "Stingers",      "rule": "together"}
  ]'::jsonb;
