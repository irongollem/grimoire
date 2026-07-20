#!/usr/bin/env bash
set -euo pipefail

spell_test_db="${SPELL_TEST_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
spell_test_tmp="$(mktemp -d)"
spell_test_user="00000000-0000-4000-8000-000000000649"
spell_test_campaign="00000000-0000-4000-8000-000000000643"
spell_test_member="00000000-0000-4000-8000-000000000644"
spell_test_class="00000000-0000-4000-8000-000000000646"
spell_test_spell="00000000-0000-4000-8000-000000000647"
spell_test_grant="00000000-0000-4000-8000-000000000651"
spell_test_innate_spell="00000000-0000-4000-8000-000000000650"
spell_test_innate_grant="00000000-0000-4000-8000-000000000652"

cleanup() {
  psql "$spell_test_db" -v ON_ERROR_STOP=1 -q <<SQL || true
delete from public.character_spells where party_member_id = '$spell_test_member';
delete from public.character_classes where party_member_id = '$spell_test_member';
delete from public.party_members where id = '$spell_test_member';
delete from public.spells where id::text in ('$spell_test_spell', '$spell_test_innate_spell');
delete from public.campaigns where id = '$spell_test_campaign';
delete from auth.users where id = '$spell_test_user';
SQL
  find "$spell_test_tmp" -type f -delete
  rmdir "$spell_test_tmp"
}
trap cleanup EXIT

psql "$spell_test_db" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('$spell_test_user', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'spell-concurrency@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name, ruleset)
values ('$spell_test_campaign', '$spell_test_user', 'Spell concurrency', '2024');
insert into public.party_members (id, user_id, campaign_id, name, class, level, cha, proficiency_bonus, spell_slots, class_resources, class_choices)
values ('$spell_test_member', '$spell_test_user', '$spell_test_campaign', 'Concurrent Sorcerer', 'Sorcerer', 7, 18, 3,
  '[{"level":1,"max":1,"used":0,"pool":"spellcasting","recovery":"long"}]'::jsonb,
  '{"sorcery_points":{"current":1,"max":7,"rest":"long"},"innate_sorcery":{"current":2,"max":2,"rest":"long"}}'::jsonb,
  '{"metamagic_options":["Empowered Spell"],"sorcerous_restoration_available":true}'::jsonb);
insert into public.character_classes (id, party_member_id, class_name, levels, is_primary)
values ('$spell_test_class', '$spell_test_member', 'Sorcerer', 7, true);
insert into public.spells (id, user_id, campaign_id, name, level, casting_time, range, duration, description, classes, attack_type, damage_rolls, target_description)
values
  ('$spell_test_spell', '$spell_test_user', '$spell_test_campaign', 'Concurrent Flame', 1, 'Action', '60 ft.', 'Instantaneous', 'Damage.', array['Sorcerer'], 'automatic', '[{"dice":"1d6","type":"fire"}]'::jsonb, '1 creature'),
  ('$spell_test_innate_spell', '$spell_test_user', '$spell_test_campaign', 'Concurrent Spark', 1, 'Action', '60 ft.', 'Instantaneous', 'Damage.', array[]::text[], 'automatic', '[{"dice":"1d6","type":"force"}]'::jsonb, '1 creature');
insert into public.character_spells (id, party_member_id, spell_id, source_type, source_class_id, is_prepared)
values ('$spell_test_grant', '$spell_test_member', '$spell_test_spell', 'class', '$spell_test_class', true);
insert into public.character_spells (id, party_member_id, spell_id, source_type, uses_per_day, uses_remaining, resets_on)
values ('$spell_test_innate_grant', '$spell_test_member', '$spell_test_innate_spell', 'feat', 1, 1, 'long_rest');
SQL

race() {
  local race_name="$1"
  local race_sql="$2"
  local first_status second_status successes
  set +e
  psql "$spell_test_db" -v ON_ERROR_STOP=1 -q -c "select set_config('request.jwt.claim.sub','$spell_test_user',false); $race_sql" >"$spell_test_tmp/$race_name-1.log" 2>&1 &
  local first_pid=$!
  psql "$spell_test_db" -v ON_ERROR_STOP=1 -q -c "select set_config('request.jwt.claim.sub','$spell_test_user',false); $race_sql" >"$spell_test_tmp/$race_name-2.log" 2>&1 &
  local second_pid=$!
  wait "$first_pid"; first_status=$?
  wait "$second_pid"; second_status=$?
  set -e
  successes=0
  if [[ "$first_status" -eq 0 ]]; then successes=$((successes + 1)); fi
  if [[ "$second_status" -eq 0 ]]; then successes=$((successes + 1)); fi
  if [[ "$successes" -ne 1 ]]; then
    echo "$race_name: expected exactly one successful transaction, got $successes" >&2
    sed -n '1,120p' "$spell_test_tmp/$race_name-1.log" >&2
    sed -n '1,120p' "$spell_test_tmp/$race_name-2.log" >&2
    exit 1
  fi
}

race slot "select public.cast_character_spell_v3('$spell_test_member',1,'spellcasting','[{\"level\":1,\"max\":1,\"used\":0,\"pool\":\"spellcasting\",\"recovery\":\"long\"}]'::jsonb,null,'{}'::text[],'$spell_test_grant','{}'::jsonb);"
slot_used="$(psql "$spell_test_db" -Atq -c "select spell_slots #>> '{0,used}' from public.party_members where id='$spell_test_member'")"
[[ "$slot_used" == "1" ]] || { echo "slot race spent $slot_used slots" >&2; exit 1; }

race innate "select public.cast_character_spell_v3('$spell_test_member',0,'feature','[]'::jsonb,null,'{}'::text[],'$spell_test_innate_grant','{}'::jsonb);"
uses_left="$(psql "$spell_test_db" -Atq -c "select uses_remaining from public.character_spells where id='$spell_test_innate_grant'")"
[[ "$uses_left" == "0" ]] || { echo "innate race left $uses_left uses" >&2; exit 1; }

race sorcery_points "select public.cast_character_spell_v3('$spell_test_member',0,'spellcasting','[]'::jsonb,null,array['Empowered Spell'],'$spell_test_grant','{}'::jsonb);"
points_left="$(psql "$spell_test_db" -Atq -c "select class_resources #>> '{sorcery_points,current}' from public.party_members where id='$spell_test_member'")"
[[ "$points_left" == "0" ]] || { echo "SP race left $points_left points" >&2; exit 1; }

psql "$spell_test_db" -q -c "update public.party_members set class_resources=jsonb_set(class_resources,'{sorcery_points,current}','0'::jsonb,false), class_choices=jsonb_set(class_choices,'{sorcerous_restoration_available}','true'::jsonb,true) where id='$spell_test_member';"
race restoration "select public.restore_sorcery_points('$spell_test_member');"
restored_points="$(psql "$spell_test_db" -Atq -c "select class_resources #>> '{sorcery_points,current}' from public.party_members where id='$spell_test_member'")"
[[ "$restored_points" == "3" ]] || { echo "Restoration race produced $restored_points points" >&2; exit 1; }

echo "Spell transaction concurrency checks passed (slots, uses, Sorcery Points, Restoration)."
