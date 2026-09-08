-- Where the party is. Story #786, epic #780.
--
-- Three notions of position existed and were never reconciled:
--
--   campaigns.current_location_id      the party, campaign-wide
--   party_members.current_location_id  one member
--   quest_runtime_state.current_beat_id  narrative position, and its own
--                                        migration says outright it is NOT
--                                        where the party is standing
--
-- The third was never a competitor, only mislabelled. The first two are both
-- wanted: a party is in one place, but a scout goes ahead and someone stays
-- behind, and campaign-wide cannot express that.
--
-- So they stop competing by one deferring to the other.
--
--   party_members.current_location_id IS NULL  -> with the party
--   party_members.current_location_id SET      -> explicitly somewhere else
--
-- A member's *effective* position becomes derived, not stored: their override
-- if they have one, otherwise the campaign's. Moving the party is then a single
-- write to `campaigns.current_location_id` and everyone who is not explicitly
-- elsewhere comes along — no propagation, nothing to remember, and no second
-- copy that can drift.
--
-- This is what retires `syncLocationToParty()` on the dashboard. That button
-- exists only because nothing propagated; having to remember to press it is
-- precisely the click-around problem this epic is about, and a DM who forgets
-- leaves every member pinned to wherever they were last session.

comment on column public.party_members.current_location_id is
  'NULL = with the party (effective position is campaigns.current_location_id). '
  'Set = this member is explicitly somewhere else, and stays there when the '
  'party moves. Derived, never propagated -- see 20260904133304.';

comment on column public.campaigns.current_location_id is
  'Where the party is. Authoritative for every member without an explicit '
  'override in party_members.current_location_id.';

-- ── Backfill, and why this one is safe ─────────────────────────────────────
--
-- Elsewhere in this epic the rule is "no backfill", because null was already
-- meaningful and inventing a value invents an intent. Here the reverse is true:
-- null is *acquiring* meaning, and a member sitting with the party currently
-- has that location written into their row. Left alone, every such member would
-- read as explicitly-elsewhere the moment this ships — pinned in place, and the
-- party would appear to move without them.
--
-- Nulling only the members whose stored location already equals their
-- campaign's loses no information: they derive to exactly the same place. A
-- member anywhere else keeps their row, because that is a real override.
update public.party_members pm
   set current_location_id = null
  from public.campaigns c
 where pm.campaign_id = c.id
   and pm.current_location_id is not null
   and pm.current_location_id = c.current_location_id;

-- ── A note for whoever verifies this locally ───────────────────────────────
-- `supabase db reset` applies migrations and THEN loads seed.sql, so this
-- statement runs against an empty database and the seed re-inserts
-- pre-migration values on top of it. Locally, every seeded member will look
-- explicitly-elsewhere; that is seed ordering, not a broken backfill. In
-- production the migration meets live data and does the right thing.
--
-- The behaviour that actually needs pinning is the *derivation* — override if
-- present, else the campaign's — and that is covered in
-- supabase/tests/party_position.test.sql, which builds its own fixtures rather
-- than relying on either the seed or the one-time statement above.
