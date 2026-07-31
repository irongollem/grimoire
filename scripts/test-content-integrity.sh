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

# ---------------------------------------------------------------------------
# Case 1 — real damage must be reported.
#
# Reproduces the #553 shape: re-key a handful of library_monsters rows the way
# that migration did, leaving every referrer pointing at the id it used to have.
# ---------------------------------------------------------------------------
caught=$(psql "$DB_URL" -tAq -v ON_ERROR_STOP=1 <<SQL
begin;

update library_monsters lm set id = 'srd_srd_' || substr(lm.id, 5)
where lm.id like 'srd\_%'
  and lm.id not like 'srd\_srd\_%'
  and not exists (select 1 from library_monsters x where x.id = 'srd_srd_' || substr(lm.id, 5));

-- A spawn_combatants round trigger, three levels down in encounters.events.
update encounters set events = jsonb_build_array(jsonb_build_object(
  'id', 'guard-test', 'name', 'spawn', 'fire_once', true, 'is_player_visible', false,
  'trigger', jsonb_build_object('type', 'round_start', 'round', 2),
  'actions', jsonb_build_array(jsonb_build_object(
    'type', 'spawn_combatants',
    'spawns', jsonb_build_array(jsonb_build_object(
      'count', 1, 'faction_id', 'enemy', 'monster_id', 'srd_guard_test_missing'))))))
where id = (select id from encounters limit 1);

-- granted_spells on a species, pointing at a spell that does not exist.
update species set granted_spells = jsonb_build_array(
  jsonb_build_object('spell_id', 'srd_guard_test_missing_spell', 'min_level', 1))
where id = (select id from species limit 1);

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
#   * a combatant on a homebrew monster uuid
# The baseline is already clean (npm run db:check), so anything reported here is
# caused by these rows.
# ---------------------------------------------------------------------------
quiet=$(psql "$DB_URL" -tAq -v ON_ERROR_STOP=1 <<'SQL'
begin;

insert into library_items (id, name, source_document_key, source_record_key)
values ('srd_guard_test_longsword', 'Guard Test Longsword', 'srd-2014', 'guard_test_longsword');

insert into entity_notes (user_id, entity_type, entity_id, is_private, shared_with_dm)
select u.id, t.entity_type, t.entity_id, false, false
from (select id from auth.users limit 1) u,
     (values ('item',    'srd_guard_test_longsword'),
             ('spell',   (select id from library_spells limit 1)),
             ('monster', gen_random_uuid()::text)) as t(entity_type, entity_id);

\i supabase/checks/content_integrity.sql
rollback;
SQL
)

if [ -n "$(echo "$quiet" | tr -d '[:space:]')" ]; then
  echo "$quiet" >&2
  fail "guard reported a violation for rows that are valid (false positive — this would fail a production deploy)"
fi

echo "content integrity guard: catches planted damage, silent on valid rows"
