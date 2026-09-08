-- ── A check is a placement ──────────────────────────────────────────────────
--
-- Frames 03 and 04 of the Quest Manager Redesign place "Insight DC 15 ·
-- Contested by Deception" on a beat and give the cockpit a "Roll Insight"
-- button first in its action row. A check is an eleventh attachment type
-- that carries its own data in `metadata` ({skill, dc, contested_by?, note?})
-- rather than pointing at a row; its `ref_id` is the literal 'check'.

alter table public.quest_beat_attachments
  drop constraint quest_beat_attachments_attachment_type_check,
  add constraint quest_beat_attachments_attachment_type_check
    check (attachment_type in (
      'encounter', 'npc', 'faction', 'item', 'monster', 'check',
      'sound', 'audio_scene', 'playlist', 'note', 'handout'
    ));

-- Rebuilt from the live definition (pg_get_functiondef), with one new arm.
CREATE OR REPLACE FUNCTION private.validate_quest_beat_attachment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_valid boolean := false;
begin
  -- An `else` arm on purpose. Without one, an attachment_type the CHECK no
  -- longer admits — an old browser tab posting a type this epic deleted — fails
  -- with CASE_NOT_FOUND (SQLSTATE 20000), which PostgREST has no 4xx mapping
  -- for and returns as a 500. Fail closed either way, but say so in a class the
  -- client can read.
  case new.attachment_type
    when 'encounter' then
      select exists(select 1 from encounters e where e.id = new.ref_id::uuid and e.campaign_id = new.campaign_id) into v_valid;
    when 'npc' then
      select exists(select 1 from npcs n where n.id = new.ref_id::uuid and (n.campaign_id = new.campaign_id or (n.campaign_id is null and (n.user_id = auth.uid() or n.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
    when 'faction' then
      select exists(select 1 from factions f where f.id = new.ref_id::uuid and (f.campaign_id = new.campaign_id or (f.campaign_id is null and (f.user_id = auth.uid() or f.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
    when 'item' then
      select exists(select 1 from items i where i.id = new.ref_id::uuid and (i.campaign_id = new.campaign_id or (i.campaign_id is null and (i.user_id = auth.uid() or i.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
    when 'monster' then
      select exists(select 1 from monsters m where m.id = new.ref_id::uuid and (m.campaign_id = new.campaign_id or (m.campaign_id is null and (m.user_id = auth.uid() or m.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
    when 'check' then
      -- A check carries its own data instead of pointing at a row: ref_id is
      -- the literal 'check', and the metadata must name a skill and a DC.
      -- Validated here rather than by casting, because the cast handler below
      -- says "must be a valid UUID", which would mislead for a DC.
      v_valid := new.ref_id = 'check'
        and coalesce(length(btrim(new.metadata ->> 'skill')), 0) > 0
        and coalesce(new.metadata ->> 'dc', '') ~ '^[0-9]+$';
    when 'sound' then
      select exists(select 1 from sounds s where s.id = new.ref_id::uuid and s.campaign_id = new.campaign_id) into v_valid;
    when 'audio_scene' then
      select exists(select 1 from soundboard_playlists p where p.id = new.ref_id::uuid and p.campaign_id = new.campaign_id and p.playlist_type = 'ambient') into v_valid;
    when 'playlist' then
      select exists(select 1 from soundboard_playlists p where p.id = new.ref_id::uuid and p.campaign_id = new.campaign_id and p.playlist_type = 'music') into v_valid;
    when 'note' then
      select exists(select 1 from notes n where n.id = new.ref_id::uuid and n.campaign_id = new.campaign_id) into v_valid;
    when 'handout' then
      select exists(select 1 from scriptorium_documents d where d.id = new.ref_id::uuid and (d.user_id = auth.uid() or d.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))) into v_valid;
    else
      v_valid := false;
  end case;

  if not v_valid then
    raise exception 'Invalid % attachment % for quest % in campaign %',
      new.attachment_type, new.ref_id, new.quest_id, new.campaign_id
      using errcode = '23514';
  end if;
  return new;
exception when invalid_text_representation then
  raise exception 'Attachment reference must be a valid UUID for type %', new.attachment_type
    using errcode = '23514';
end;
$function$;
