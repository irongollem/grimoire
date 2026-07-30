-- Migration: backfill_player_notes_into_entity_notes
--
-- Issue #587: companion_player_notes and party_member_player_notes were
-- superseded by the generic entity_notes table, but their rows were never
-- migrated -- they were left in place deliberately in
-- 20260730000005_schema_audit_indexes_rls_replica_identity.sql (#6, "dead
-- surface") pending this backfill. No code references either old table
-- anymore, so their 11 rows (5 companion / 6 party member) are currently
-- invisible in the app.
--
-- entity_type literals: PlayerNotesWidget.vue is mounted with
-- entity-type="companion" (PlayerPartyCompanionLightbox.vue) and
-- entity-type="party_member" (PartyMemberLightbox.vue).
--
-- is_private / shared_with_dm: both old tables were strictly private,
-- single-author notes -- every RLS policy (select/insert/update/delete) was
-- gated on `auth.uid() = user_id` with no sharing mechanism at all (see the
-- original 20260321000023_party_member_player_notes.sql and
-- 20260321000030_companion_player_notes.sql migrations). That maps onto
-- PlayerNotesWidget's "private note" concept (is_private = true), and since
-- the old rows were never exposed to the DM either, shared_with_dm is
-- backfilled as false rather than invented as true.
--
-- Verified via pg_constraint/pg_indexes against production: entity_notes has
-- no unique constraint on (user_id, entity_type, entity_id) -- only
-- entity_notes_pkey on id -- so duplicate protection uses `where not exists
-- (...)` rather than `on conflict`.
--
-- entity_notes has no created_at equivalent in the old schema, so the old
-- updated_at value is reused for created_at too -- it's the best available
-- signal for when the note was actually written.
--
-- campaign_id is derived by joining to companions.campaign_id /
-- party_members.campaign_id. Both columns are nullable, so a left join is
-- used and a missing campaign simply backfills as null (entity_notes.campaign_id
-- is nullable too).

insert into entity_notes (user_id, entity_type, entity_id, content, is_private, shared_with_dm, campaign_id, created_at, updated_at)
select
  cpn.user_id,
  'companion',
  cpn.companion_id::text,
  cpn.notes,
  true,
  false,
  c.campaign_id,
  cpn.updated_at,
  cpn.updated_at
from companion_player_notes cpn
left join companions c on c.id = cpn.companion_id
where btrim(cpn.notes) <> ''
  and not exists (
    select 1 from entity_notes en
    where en.user_id = cpn.user_id
      and en.entity_type = 'companion'
      and en.entity_id = cpn.companion_id::text
      and en.is_private = true
  );

insert into entity_notes (user_id, entity_type, entity_id, content, is_private, shared_with_dm, campaign_id, created_at, updated_at)
select
  pmpn.user_id,
  'party_member',
  pmpn.party_member_id::text,
  pmpn.notes,
  true,
  false,
  pm.campaign_id,
  pmpn.updated_at,
  pmpn.updated_at
from party_member_player_notes pmpn
left join party_members pm on pm.id = pmpn.party_member_id
where btrim(pmpn.notes) <> ''
  and not exists (
    select 1 from entity_notes en
    where en.user_id = pmpn.user_id
      and en.entity_type = 'party_member'
      and en.entity_id = pmpn.party_member_id::text
      and en.is_private = true
  );

-- Row accounting (checked against production before writing this migration):
--   companion_player_notes:      5 rows total, 3 non-blank -> all 3 migrated
--                                 (no pre-existing private entity_notes row
--                                 for those user+companion pairs).
--   party_member_player_notes:   6 rows total, 2 non-blank -> both skipped by
--                                 the not-exists guard: those 2 users had
--                                 already re-created a private entity_notes
--                                 row for the same party member after the old
--                                 table went dark, so inserting would create a
--                                 second private note for the same user+entity.
-- Net: 3 rows moved into entity_notes, 8 skipped (6 blank, 2 already
-- superseded by a newer entity_notes row).

-- The 2 skipped party_member rows are not duplicates: that user had re-typed a
-- note from scratch once the old feature went invisible, so the old and new text
-- differ in substance. Those two were checked with the owner, who confirmed they
-- are leftover test data with no value, so they are intentionally discarded
-- rather than merged into the surviving note. (Worth surfacing because the drop
-- below is the only copy -- had the text mattered, it would have needed merging
-- first, since PlayerNotesWidget renders one private note per entity and a second
-- one would never have surfaced.)
--
-- With that settled, the superseded tables can go. Nothing in src/,
-- supabase/functions/, the MCP server, or any SQL object references either.

drop table companion_player_notes, party_member_player_notes;
