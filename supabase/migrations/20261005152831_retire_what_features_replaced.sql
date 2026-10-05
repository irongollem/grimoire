-- What features replaced, goes (#976, the epic's cleanup).
--
-- Each of these was a second home for something a feature now says itself
-- (src/rules/features/mechanics.types.ts). The earlier migrations of this epic
-- moved their content; the client stopped reading them in the same branch.
-- Keeping them would leave two places to define Rage's uses, and the next
-- writer would pick the wrong one.
--
--   class_features.feature_type        -> mechanics.activation   (20261005133607)
--   *.resources on class definitions   -> a feature's mechanics.uses       (20261005142531)
--   *.steps on class definitions       -> a feature's mechanics.choices    (20261005142531)
--   *.asi_levels                       -> the Ability Score Improvement feature at those levels
--   party_members.rage_active          -> class_choices.rage_active, ended by every rest (20261005142531)
--   class_feature_options              -> a feature that `replaces` another (20261005144119)
--
-- The three generator prompts asked the model for `feature_type`; they now ask
-- for `activation` (and, for one ability, its `mechanics`), which is what the
-- client reads. A prompt the admin has rewritten is left as it is: the
-- replacements only touch text that is still the seed's.

-- ─── Generator prompts ───────────────────────────────────────────────────────

update public.ai_system_prompts
   set content = replace(replace(replace(replace(content,
     '"feature_type": "passive"',
     '"activation": null'),
     'Each feature has level (1 to 20), name, feature_type and description. feature_type is exactly one of "passive", "active", "reaction", "bonus_action", "legendary".',
     'Each feature has level (1 to 20), name, activation and description. activation is null for a passive feature, otherwise exactly one of "action", "bonus_action", "reaction", "special", as the published feature is used.'),
     'Each feature has level, name, feature_type and description. feature_type is exactly one of "passive", "active", "reaction", "bonus_action", "legendary".',
     'Each feature has level, name, activation and description. activation is null for a passive feature, otherwise exactly one of "action", "bonus_action", "reaction", "special", as the published feature is used.'),
     'feature_type', 'activation')
 where generator_type in ('custom_class', 'custom_subclass');

update public.ai_system_prompts
   set content = replace(replace(replace(content,
     '"feature_type": "passive",',
     '"activation": null,
  "mechanics": {},'),
     '- feature_type is exactly one of "passive", "active", "reaction", "bonus_action", "legendary". Use "bonus_action" or "reaction" only when the ability is used that way. "legendary" is rare and belongs only to creature-like abilities.',
     '- activation is null for a passive ability, otherwise exactly one of "action", "bonus_action", "reaction", "special". Use "bonus_action" or "reaction" only when the ability is used that way, and "special" for one used outside the usual action economy (like Action Surge).
- mechanics is {} unless the ability has limited uses. Then it is {"uses": {"key": "lowercase_snake_case", "label": "Name of the uses", "amount": {"kind": "fixed", "value": 2}, "recharge": "short" or "long", "pool": false}}. amount may instead be {"kind": "proficiency"} (uses equal to the proficiency bonus) or {"kind": "ability_mod", "ability": "str", "dex", "con", "int", "wis" or "cha", "min": 1}. pool is true only when the ability spends points in chosen amounts (like Lay on Hands).'),
     'a required feature type', 'a required activation')
 where generator_type = 'class_feature';

-- ─── Columns ─────────────────────────────────────────────────────────────────

alter table public.class_features drop column feature_type;

alter table public.system_classes drop column resources, drop column steps, drop column asi_levels;
alter table public.custom_classes drop column resources, drop column steps, drop column asi_levels;
alter table public.custom_subclasses drop column resources, drop column steps;

alter table public.party_members drop column rage_active;

-- A toggle (`<key>_active`) ends on every rest by the rest function's own
-- rule, so Innate Sorcery's row here says nothing that rule does not.
delete from public.class_choice_rest_resets where choice_key = 'innate_sorcery_active';

-- ─── class_feature_options ───────────────────────────────────────────────────

-- The ownership transfer moved this table's rows with the campaign. Its worker
-- is a 37 KB function; rather than restate it, the one statement naming the
-- table is taken out of the live definition, and the migration stops if the
-- name is still there afterwards.
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.transfer_campaign_ownership(uuid, uuid, boolean)'::regprocedure);
  v_def := regexp_replace(v_def, '\n[ \t]*update public\.class_feature_options[^;]*;', '', 'g');
  if v_def ~ 'class_feature_options' then
    raise exception 'transfer_campaign_ownership still names class_feature_options';
  end if;
  execute v_def;
end $$;

-- The demo copy reads its table list from this registry; a dropped table left
-- in it fails every demo publish and every new user's demo load.
delete from private.demo_campaign_tables where table_name = 'class_feature_options';

drop table public.class_feature_options;

-- ─── The approval review follows feats to where they now live ────────────────

-- A feat id lives in three places since #976: the running list
-- (`class_choices.feats`, which every other place's id is also in), the origin
-- feat (`class_choices.origin_feat_id`), and the record of the level that took
-- it (`level_choices[n].record`). The review's repoint and remove used to edit
-- the list and the old `asi.feat_id`, which no level has any more; left so, a
-- removed feat would come back with the next de-level of its level.

-- An array of ids with `p_old` replaced by `p_new`, or dropped when `p_new` is null.
create function private.text_array_mapped(p_array jsonb, p_old text, p_new text)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select coalesce(jsonb_agg(case when x.v = p_old then to_jsonb(p_new) else to_jsonb(x.v) end order by x.ord)
                    filter (where not (x.v = p_old and p_new is null)), '[]'::jsonb)
    from jsonb_array_elements_text(
      case when jsonb_typeof(p_array) = 'array' then p_array else '[]'::jsonb end) with ordinality as x(v, ord);
$$;

-- Every level's record with a feat id repointed (or removed when `p_new` is null).
create function private.level_choices_feat_mapped(p_level_choices jsonb, p_old text, p_new text)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select case when jsonb_typeof(p_level_choices) <> 'object' then p_level_choices else coalesce((
    select jsonb_object_agg(l.lvl,
      case when jsonb_typeof(l.entry -> 'record') = 'object' then
        jsonb_set(
          jsonb_set(l.entry, '{record,feats}', private.text_array_mapped(l.entry -> 'record' -> 'feats', p_old, p_new)),
          '{record,choices}', coalesce((
            select jsonb_object_agg(c.key,
                     case when jsonb_typeof(c.value) = 'object'
                          then jsonb_set(c.value, '{added}', private.text_array_mapped(c.value -> 'added', p_old, p_new))
                          else c.value end)
              from jsonb_each(case when jsonb_typeof(l.entry -> 'record' -> 'choices') = 'object'
                                   then l.entry -> 'record' -> 'choices' else '{}'::jsonb end) as c), '{}'::jsonb))
      else l.entry end)
      from jsonb_each(p_level_choices) as l(lvl, entry)), '{}'::jsonb) end;
$$;

-- The class choices with a feat id repointed (or removed): the list and the origin feat.
create function private.class_choices_feat_mapped(p_class_choices jsonb, p_old text, p_new text)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select case
    when jsonb_typeof(p_class_choices) <> 'object' then p_class_choices
    else (
      case when p_class_choices ->> 'origin_feat_id' = p_old
           then case when p_new is null
                     then p_class_choices - 'origin_feat_id' - 'origin_feat_variant'
                     else jsonb_set(p_class_choices, '{origin_feat_id}', to_jsonb(p_new)) end
           else p_class_choices end
    ) || case when jsonb_typeof(p_class_choices -> 'feats') = 'array'
              then jsonb_build_object('feats', private.text_array_mapped(p_class_choices -> 'feats', p_old, p_new))
              else '{}'::jsonb end
  end;
$$;

revoke execute on function private.text_array_mapped(jsonb, text, text) from public, anon, authenticated;
revoke execute on function private.level_choices_feat_mapped(jsonb, text, text) from public, anon, authenticated;
revoke execute on function private.class_choices_feat_mapped(jsonb, text, text) from public, anon, authenticated;

-- What a character points at: `asi.feat_id` is gone from every level, and each
-- feat a level took is also in `class_choices.feats`, so the list is the one source.
create or replace function private.party_member_content_refs(p_party_member_id uuid)
 returns table(kind text, ref text)
 language sql
 stable
 set search_path to ''
as $function$
  select 'species', pm.species_id
    from public.party_members pm
   where pm.id = p_party_member_id and pm.species_id is not null
  union
  select 'background', pm.background_id::text
    from public.party_members pm
   where pm.id = p_party_member_id and pm.background_id is not null
  union
  select 'class',
         case when cc.class_definition_kind = 'system'
              then 'system:' || cc.class_name
              else cc.class_definition_id::text end
    from public.character_classes cc
   where cc.party_member_id = p_party_member_id
  union
  select 'subclass', cc.subclass_definition_id::text
    from public.character_classes cc
   where cc.party_member_id = p_party_member_id and cc.subclass_definition_id is not null
  union
  select 'spell', cs.spell_id
    from public.character_spells cs
   where cs.party_member_id = p_party_member_id
  union
  -- Every feat the character holds is in this list: level-up, creation and the
  -- origin feat all append to it (#976).
  select 'feat', feat.id
    from public.party_members pm,
         jsonb_array_elements_text(
           case when jsonb_typeof(pm.class_choices -> 'feats') = 'array'
                then pm.class_choices -> 'feats' else '[]'::jsonb end) as feat(id)
   -- A JSON null in the list is not a choice. Left in, it came out as a NULL
   -- ref, which made every comparison in the review's final delete NULL and so
   -- kept approvals for choices the character no longer had.
   where pm.id = p_party_member_id and feat.id is not null;
$function$;

-- The two writers: rewritten from their live definitions, only the feat
-- branch's two assignments replaced, the rest left exactly as production has it.
do $$
declare
  v_def text;
  v_before text;
begin
  v_def := pg_get_functiondef('private.repoint_party_member_content(uuid, text, text, text)'::regprocedure);
  v_before := v_def;
  v_def := regexp_replace(v_def,
    'class_choices = case\s+when jsonb_typeof\(pm\.class_choices -> ''feats''\) = ''array'' then.*?else pm\.level_choices end',
    'class_choices = private.class_choices_feat_mapped(pm.class_choices, p_old, p_new),
        level_choices = private.level_choices_feat_mapped(pm.level_choices, p_old, p_new)', 's');
  if v_def = v_before or v_def ~ '''asi''' then
    raise exception 'repoint_party_member_content: the feat branch was not where this migration expected it';
  end if;
  execute v_def;

  v_def := pg_get_functiondef('public.remove_missing_character_content(uuid)'::regprocedure);
  v_before := v_def;
  v_def := regexp_replace(v_def,
    'class_choices = case\s+when jsonb_typeof\(pm\.class_choices -> ''feats''\) = ''array'' then.*?else pm\.level_choices end',
    'class_choices = private.class_choices_feat_mapped(pm.class_choices, v_review.ref, null),
        level_choices = private.level_choices_feat_mapped(pm.level_choices, v_review.ref, null)', 's');
  if v_def = v_before or v_def ~ '''asi''' then
    raise exception 'remove_missing_character_content: the feat branch was not where this migration expected it';
  end if;
  execute v_def;

  -- Converting a character to 2014 flags its background when a 2024 background
  -- benefit is left to settle; the origin feat is that benefit, under the key it
  -- now has (nothing ever wrote `background_feat_id`).
  v_def := pg_get_functiondef('private.convert_party_member_ruleset(uuid, text)'::regprocedure);
  v_before := v_def;
  v_def := replace(v_def, 'pm.class_choices ? ''background_feat_id''', 'pm.class_choices ? ''origin_feat_id''');
  if v_def = v_before or v_def ~ 'background_feat_id' then
    raise exception 'convert_party_member_ruleset: background_feat_id was not where this migration expected it';
  end if;
  execute v_def;
end $$;
