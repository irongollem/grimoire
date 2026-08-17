#!/bin/bash
# PostToolUse hook — catches the CLAUDE.md conventions that a machine can check
# without judgement, at the moment the offending line is written.
#
# ---------------------------------------------------------------------------
# What is deliberately NOT here, and why
# ---------------------------------------------------------------------------
# Every rule below was measured against the tree before it was included. The
# ones that did not survive that measurement were moved to the
# `conventions-reviewer` subagent instead of being weakened into a warning:
#
#   px in CSS          835 hits, and the overwhelming majority are legitimate —
#                      prose in comments ("a row of unreadable 8px metadata"),
#                      `useMediaQuery("(max-width: 767px)")`, canvas and token
#                      output dimensions, SVG font sizes. No line-level pattern
#                      separates those from a real violation.
#   ?? "" / ?? [] etc  1,870 hits. `for (const row of data ?? [])` on a Supabase
#                      response is the correct idiom, not the banned coercion.
#                      The rule is about a lying type, which is a property of
#                      the type, not of the line.
#   <textarea>, <img>  Both have standing sanctioned exceptions (AI-prompt
#   <select>           fields; small fixed option sets) that can only be judged
#                      from what the control is for.
#   file length,       Structural, not textual.
#   duplicated markup
#
# This split is the whole design. CLAUDE.md's own cautionary tale is #723,
# which listed StoreInventory as a Filter State violation on the strength of a
# variable name and was wrong. A guard that cries wolf gets switched off, and
# then it guards nothing — so a rule earns its place here only by being
# unambiguous in the text itself.
#
# ---------------------------------------------------------------------------
# Only newly-written text is inspected, never the whole file
# ---------------------------------------------------------------------------
# The payload's new_string/content is what this session just wrote. Scanning
# the file instead would re-report the tree's existing drift (39 raw buttons,
# 42 raw inputs, 12 withDefaults) on every unrelated edit to those files, which
# is the fastest way to make a hook worthless.
#
# Exit 2 feeds stderr back to Claude. The write has already happened; this is a
# correction prompt, not a veto.

set -uo pipefail

payload=$(cat)

file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -n "$file" ] || exit 0

# Edit → new_string, Write → content, MultiEdit → every edits[].new_string.
added=$(printf '%s' "$payload" | jq -r '
  [ .tool_input.new_string?, .tool_input.content?, (.tool_input.edits[]?.new_string) ]
  | map(select(. != null and . != ""))
  | join("\n")
' 2>/dev/null)

findings=()
note() { findings+=("  • $1"); }

case "$file" in
  */supabase/migrations/*.sql)
    # CLAUDE.md names these three explicitly as the wrong function. The correct
    # one is update_updated_at(), defined in the initial schema migration.
    if printf '%s' "$added" | grep -qiE 'update_updated_at_column|set_updated_at\(|moddatetime'; then
      note "Wrong updated_at trigger function. Use \`execute procedure update_updated_at()\` — update_updated_at_column(), set_updated_at() and moddatetime() do not exist in this schema."
    fi

    # `execute function` parses, but the repo standardised on `execute
    # procedure` so the trigger bodies stay greppable as one shape.
    if printf '%s' "$added" | grep -qiE 'execute[[:space:]]+function[[:space:]]+update_updated_at'; then
      note "Use \`execute procedure update_updated_at()\`, not \`execute function\` — see the Supabase Migration Rules in CLAUDE.md."
    fi

    # Item 4 of the SECURITY DEFINER rules: private.is_app_admin() is the only
    # thing allowed to read this claim. An inline copy is how get_admin_users
    # kept the NULL bypass through the migration that supposedly fixed it, and
    # leaked every account's email, plan and credit balance.
    if printf '%s' "$added" | grep -qE "app_metadata'?[[:space:]]*->>[[:space:]]*'role'"; then
      note "Inline \`app_metadata ->> 'role'\` comparison. Call private.is_app_admin() instead — it is the single permitted reader of that claim, and an inline copy does not inherit its coalesce(). This is the #640 bug. (The three legitimate readers — is_user_pro, prepare_user_erasure, consume_app_invite — already exist; you are almost certainly not adding a fourth.)"
    fi

    # The shared-content naming rule: library_*, never srd_*.
    if printf '%s' "$added" | grep -qiE 'create[[:space:]]+table[^;]*\bsrd_'; then
      note "New table named \`srd_*\`. Shared content is \`library_*\` — only ~660 of 3,541 library_monsters rows are actually WotC SRD, and labelling another publisher's book 'SRD' misdescribes its licence (#567/#583)."
    fi
    ;;
esac

case "$file" in
  *.vue | *.ts)
    # Vue 3.5 destructuring props. Unambiguous in the text, and the repo has
    # exactly 12 stragglers — all genuine.
    if printf '%s' "$added" | grep -q 'withDefaults('; then
      note "\`withDefaults\` is banned. Vue 3.5 destructuring props instead: \`const { editable = true } = defineProps<{ editable?: boolean }>()\`."
    fi
    ;;
esac

case "$file" in
  *.vue)
    # Vue splits attributes across lines, so a line-oriented grep sees `<button`
    # and its `class` as unrelated lines and matches almost nothing: the
    # single-line form of this check found 39 of the ~1506 styled buttons #648
    # counted — it missed 97% of them. Flatten newlines to spaces first.
    #
    # `[^>]*` is what keeps the flattening honest: it cannot cross a `>`, so the
    # match is still bounded to one opening tag and cannot pair a `<button` here
    # with a `class` fifty lines below.
    flat=$(printf '%s' "$added" | tr '\n' ' ')

    # A raw <button> carrying the padding/border/radius/hover recipe is a fresh
    # copy of what AppButton owns. #561 existed because 410 sites each made this
    # call independently and every one of them looked harmless alone.
    if printf '%s' "$flat" | grep -qE '<button[^>]*class="[^"]*(px-[0-9]|py-[0-9]|p-[0-9]|rounded|border|hover:|focus:)'; then
      note "Raw <button> with chrome classes. Use AppButton (variant + size, never classes) — open /dev/components to pick the variant. A bare word of clickable text with no chrome is the only exception. See #648."
    fi

    if printf '%s' "$flat" | grep -qE '<input[^>]*class="[^"]*(px-[0-9]|py-[0-9]|p-[0-9]|rounded|border|bg-muted|hover:|focus:)' &&
      ! printf '%s' "$flat" | grep -qE '<input[^>]*type="(checkbox|radio|file)"'; then
      note "Raw <input> with the field recipe. Use AppInput (tone + size) — see fieldVariants.ts and /dev/components. See #648."
    fi
    ;;
esac

# Tests are colocated next to the module they cover, never in a __tests__ dir.
case "$file" in
  */__tests__/*)
    note "Tests are colocated next to the module they cover — never a __tests__/ directory. (src/__tests__/crossArtifactInvariants.test.ts is the one deliberate exception: it belongs to no single module.)"
    ;;
esac

[ ${#findings[@]} -eq 0 ] && exit 0

{
  echo "Convention check failed on $(basename "$file"):"
  echo
  printf '%s\n' "${findings[@]}"
  echo
  echo "Fix these now rather than noting them — see CLAUDE.md 'Leave the Plate Clean'."
  echo "If one is genuinely a sanctioned exception, say which and why, then continue."
} >&2

exit 2
