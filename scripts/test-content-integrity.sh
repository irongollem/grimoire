#!/bin/sh
# Tests supabase/checks/content_integrity.sql — the query that gates every
# production deploy.
#
# That file is code, it is the last thing standing between an id transition and
# a silent "Unknown creature" outage, and until now it had no tests. It has been
# wrong in both directions:
#
#   * FALSE NEGATIVE — it missed nine live referrers (every jsonb one,
#     entity_notes, the granted_spells family). #553 stranded 33 references
#     through that gap and they sat broken in production until #583.
#   * FALSE POSITIVE — resolving any non-uuid entity_notes.entity_id against
#     monsters and spells alone counts a perfectly good note on a shared ITEM
#     (`srd_longsword` is a live library_items id) as dangling. That does not
#     merely misreport: it fails the production deploy, and a failed deploy
#     strands every migration queued behind it.
#
# A guard that cannot fail is worth nothing, so both directions are asserted:
# plant real damage and require it to be caught, plant valid-but-awkward rows
# and require silence.
#
# Runs the REAL check file via \i rather than a copy of its SQL, so the thing
# under test is the thing that ships. Everything happens inside a transaction
# that is always rolled back — the local database is left exactly as found.
#
# EVERY ROW THIS TEST NEEDS, IT CREATES. That is not ceremony, it is the whole
# reason the test works in CI. `supabase/seed.sql` is gitignored, so the CI
# database is migrations-only: no encounters, no library_monsters, no species,
# no auth.users. An earlier version planted damage with
# `update encounters ... where id = (select id from encounters limit 1)`, which
# updates zero rows on an empty database — so it planted nothing, the guard
# correctly reported nothing, and the assertion failed. It passed on a developer
# machine purely because that database is a production restore. Same trap as the
# Supabase env vars in vitest.config.ts: green locally, red on a bare checkout.
#
# So: no `select ... limit 1` against application tables, and no dependence on
# any row this script did not insert.
#
# Usage: sh scripts/test-content-integrity.sh   (or npm run db:check:test)
set -eu

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
CHECK_FILE="supabase/checks/content_integrity.sql"

if ! command -v psql >/dev/null 2>&1; then
  echo "test-content-integrity: psql not found on PATH" >&2
  exit 1
fi
if [ ! -f "$CHECK_FILE" ]; then
  echo "test-content-integrity: run me from the repo root ($CHECK_FILE not found)" >&2
  exit 1
fi

fail() { echo "FAIL: $1" >&2; exit 1; }

# Fixed ids so a failure is greppable. Not gen_random_uuid(): when this test
# fails you want to paste the id from the error straight into a query.
U='e0000000-0000-4000-8000-000000000001'  # auth.users
C='e0000000-0000-4000-8000-000000000002'  # campaigns
E='e0000000-0000-4000-8000-000000000003'  # encounters
S='e0000000-0000-4000-8000-000000000004'  # species

# ---------------------------------------------------------------------------
# Case 1 — real damage must be reported.
#
# Reproduces the #553 shape: references left pointing at shared ids that do not
# resolve, exactly as that migration left them when it re-keyed library_monsters
# and missed a referrer. Each dangling id below is one the guard must catch.
# ---------------------------------------------------------------------------
caught=$(psql "$DB_URL" -tAq -v ON_ERROR_STOP=1 <<SQL
begin;

insert into auth.users (id) values ('$U');
insert into campaigns (id, user_id, name) values ('$C', '$U', 'Guard Test Campaign');

-- A combatant and a mid-fight spawn trigger, both on a monster id that is not
-- in library_monsters. The spawn lives three levels down inside events.
insert into encounters (id, user_id, campaign_id, name, combatants, events)
values ('$E', '$U', '$C', 'Guard Test Encounter',
  jsonb_build_array(jsonb_build_object(
    'id', 'guard-test-combatant', 'name', 'Guard', 'monster_id', 'srd_guard_test_missing')),
  jsonb_build_array(jsonb_build_object(
    'id', 'guard-test', 'name', 'spawn', 'fire_once', true, 'is_player_visible', false,
    'trigger', jsonb_build_object('type', 'round_start', 'round', 2),
    'actions', jsonb_build_array(jsonb_build_object(
      'type', 'spawn_combatants',
      'spawns', jsonb_build_array(jsonb_build_object(
        'count', 1, 'faction_id', 'enemy', 'monster_id', 'srd_guard_test_missing')))))));

-- The live combat snapshot carries its own copy of the roster.
insert into encounter_state (encounter_id, campaign_id, user_id, combatants_live)
values ('$E', '$C', '$U',
  jsonb_build_array(jsonb_build_object(
    'id', 'guard-test-combatant', 'name', 'Guard', 'monster_id', 'srd_guard_test_missing')));

-- granted_spells on a species, pointing at a spell that does not exist.
insert into species (id, user_id, name, granted_spells)
values ('$S', '$U', 'Guard Test Species',
  jsonb_build_array(jsonb_build_object('spell_id', 'srd_guard_test_missing_spell', 'min_level', 1)));

-- A note hanging off a shared monster that is no longer there.
insert into entity_notes (user_id, entity_type, entity_id, is_private, shared_with_dm)
values ('$U', 'monster', 'srd_guard_test_missing', false, false);

\i $CHECK_FILE
rollback;
SQL
)

for expected in \
  'encounters.combatants\[\].monster_id' \
  'encounter_state.combatants_live\[\].monster_id' \
  'encounters.events\[\].actions\[\].spawns\[\].monster_id' \
  'entity_notes.entity_id' \
  'species.granted_spells\[\].spell_id'
do
  echo "$caught" | grep -q "$expected" \
    || fail "guard did not report a planted violation of: $(echo "$expected" | tr -d '\\')"
done

# ---------------------------------------------------------------------------
# Case 2 — valid rows must NOT be reported.
#
# The awkward ones, each of which a naive check gets wrong:
#   * a note on a shared ITEM   — entity_id is a text slug, but in library_items
#   * a note on a shared SPELL  — same, in library_spells
#   * a note on a homebrew uuid — not a shared id at all
# An empty database is trivially silent, so the shared rows these notes point at
# are inserted here too — otherwise this case would pass in CI without ever
# exercising the false-positive path it exists to guard.
# ---------------------------------------------------------------------------
quiet=$(psql "$DB_URL" -tAq -v ON_ERROR_STOP=1 <<SQL
begin;

insert into auth.users (id) values ('$U');

insert into library_items (id, name, source_document_key, source_record_key)
values ('srd_guard_test_longsword', 'Guard Test Longsword', 'srd-2014', 'guard_test_longsword');

insert into library_spells
  (id, name, level, school, casting_time, "range", duration,
   conceptual_key, ruleset, source_document_key, source_record_key)
values ('srd_guard_test_light', 'Guard Test Light', 0, 'evocation', '1 action', 'Touch', '1 hour',
   'guard_test_light', '2014', 'srd-2014', 'guard_test_light');

insert into entity_notes (user_id, entity_type, entity_id, is_private, shared_with_dm)
values ('$U', 'item',    'srd_guard_test_longsword',  false, false),
       ('$U', 'spell',   'srd_guard_test_light',      false, false),
       ('$U', 'monster', gen_random_uuid()::text,     false, false);

\i $CHECK_FILE
rollback;
SQL
)

if [ -n "$(echo "$quiet" | tr -d '[:space:]')" ]; then
  echo "$quiet" >&2
  fail "guard reported a violation for rows that are valid (false positive — this would fail a production deploy)"
fi

echo "content integrity guard: catches planted damage, silent on valid rows"
