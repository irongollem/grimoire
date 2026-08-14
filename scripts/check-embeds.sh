#!/bin/sh
# Every PostgREST embed the app ships, asked of a real PostgREST (#728).
#
# ## The failure this exists to catch
#
# `.select("*, party_members!inner(campaign_id)")` looks correct, typechecks,
# passes lint, and passes every unit test — because none of those talk to
# PostgREST. In production it answered `300 PGRST201` on every call for as long
# as it existed. Three tables hold foreign keys to *both* `character_classes`
# and `party_members` (`character_spells`, `ruleset_reviews`,
# `spell_change_windows`), so PostgREST infers a many-to-many path through each,
# finds four candidates alongside the direct foreign key, and refuses to choose.
#
# Nothing surfaced, because the consumers all degrade quietly: the query throws,
# the data is undefined, and `memberLevelDisplay` falls back to
# `party_members.level` — the wrong number for a multiclassed character. It took
# a trawl through production edge logs to find, which is not a repeatable way to
# discover a broken query.
#
# The ambiguity is a property of the *schema*, not of the query, so a perfectly
# good embed becomes a 300 the day someone adds an unrelated table with foreign
# keys to both ends. That is what makes this a standing check rather than a
# one-time fix: the code that breaks is code nobody touched.
#
# ## Why the live API rather than a SQL rule
#
# Counting foreign keys in `pg_constraint` over-reports badly — PostgREST only
# infers a many-to-many through a genuine join table, and reimplementing that
# rule here would mean maintaining a second, worse copy of PostgREST's
# resolution logic. Asking PostgREST is the only oracle that cannot drift from
# it.
#
# Runs against the local stack, so it needs `supabase start` first. A 300 fails
# the build; anything else (including the 200-with-empty-array that anon gets
# from an RLS-protected table) passes, because this checks resolvability, not
# authorization.
set -eu

BASE="${SUPABASE_LOCAL_URL:-http://127.0.0.1:54321}"

# The local stack's anon key is fixed and public — it is the demo key every
# `supabase start` prints, not a secret. A 300 is raised while parsing the
# select, before RLS is consulted, so an unprivileged key is enough.
KEY="${SUPABASE_LOCAL_ANON_KEY:-$(supabase status -o json 2>/dev/null | sed -n 's/.*"ANON_KEY": *"\([^"]*\)".*/\1/p')}"
if [ -z "$KEY" ]; then
  echo "check-embeds: could not read the local anon key — is 'supabase start' running?" >&2
  exit 1
fi

EMBEDS=$(mktemp)
trap 'rm -f "$EMBEDS"' EXIT

# Pull every `.from("table").select("…")` whose select contains an embed. Kept
# in python because the two calls are frequently several lines apart.
python3 - > "$EMBEDS" <<'PY'
import re, pathlib
pattern = re.compile(
    r'\.from\(\s*["\']([a-z_]+)["\']\s*\)\s*\.select\(\s*(["\'`])(.*?)\2', re.S
)
seen = set()
for path in sorted(pathlib.Path("src").rglob("*.ts")):
    if ".test." in path.name:
        continue
    for table, _, select in pattern.findall(path.read_text()):
        collapsed = " ".join(select.split())
        # An embed is a parenthesised sub-select. `count(...)` is an aggregate.
        if "(" not in collapsed or collapsed.startswith("count"):
            continue
        if (table, collapsed) in seen:
            continue
        seen.add((table, collapsed))
        print(f"{table}\t{collapsed}")
PY

total=0
failed=0
while IFS="$(printf '\t')" read -r table select; do
  [ -n "$table" ] || continue
  total=$((total + 1))
  body=$(mktemp)
  code=$(curl -sS -o "$body" -w "%{http_code}" -G "$BASE/rest/v1/$table" \
    --data-urlencode "select=$select" \
    --data-urlencode "limit=0" \
    -H "apikey: $KEY")
  if [ "$code" = "300" ]; then
    failed=$((failed + 1))
    echo "AMBIGUOUS  $table"
    echo "  select=$select"
    echo "  $(head -c 400 "$body")"
    echo "  Fix: name the foreign key — table!constraint_name!inner(…). See useCharacterClasses.ts."
    echo
  fi
  rm -f "$body"
done < "$EMBEDS"

if [ "$failed" -gt 0 ]; then
  echo "check-embeds: $failed of $total embeds are ambiguous (HTTP 300)." >&2
  exit 1
fi

echo "check-embeds: $total embeds resolve unambiguously."
