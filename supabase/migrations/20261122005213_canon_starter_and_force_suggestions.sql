-- Migration: canon_starter_and_force_suggestions
-- Draft the whole campaign starter from the canon, and size force proposals to the active factions rather than three.
do $$
declare
  changed integer;
begin
  update public.ai_system_prompts
     set content = (
       case
         when position('Propose up to three forces' in content) > 0 then
           replace(content, 'Propose up to three forces', 'Propose up to ten forces, including each distinct listed faction with an active agenda')
         else content
       end
     ) || E'\n\n' ||
       'Do not stop at an arbitrary count. Include every distinct listed faction with an active agenda in the canon or DM steer, up to ten forces. Prefer exact listed faction or person names so accepted forces link to their campaign records; use free text only when no listed record fits.'
   where generator_type = 'canon_forces';
  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'The canon_forces system prompt is missing';
  end if;

  update public.ai_system_prompts
     set content = (
       case
         when position('Never propose lines or veils: those are agreed with the players at the table, not suggested.' in content) > 0 then
           replace(
             content,
             'Never propose lines or veils: those are agreed with the players at the table, not suggested.',
             'Line and veil suggestions are private discussion drafts only; the DM must review them with players before accepting, and they are never treated as agreed boundaries.'
           )
         else content
       end
     ) || E'\n\n' ||
       'For the campaign starter, include one pitch, at least one theme, one table note, one voice, one look, and one grounded line and veil draft. Use the supplied pitch or the current pitch as the source. Existing pitch, voice, and look may be proposed as replacements only when meaningfully improved; the DM will see the old and new text and confirm before replacing. Lines and veils are private discussion drafts only; the DM must review them with players before accepting, and they are never treated as agreed boundaries.'
   where generator_type = 'canon_premise';
  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'The canon_premise system prompt is missing';
  end if;
end;
$$;
