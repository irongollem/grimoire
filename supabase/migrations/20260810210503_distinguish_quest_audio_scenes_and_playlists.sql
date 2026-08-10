-- Soundboard stores ambient scenes and music playlists in the same table, but
-- they are different preparation choices at the table. Preserve that semantic
-- distinction on beat attachments while continuing to reuse Soundboard records.

alter table public.quest_beat_attachments
  drop constraint quest_beat_attachments_attachment_type_check;

update public.quest_beat_attachments a
set attachment_type = 'audio_scene'
from public.soundboard_playlists p
where a.attachment_type = 'playlist'
  and p.id::text = a.ref_id
  and p.campaign_id = a.campaign_id
  and p.playlist_type = 'ambient';

alter table public.quest_beat_attachments
  add constraint quest_beat_attachments_attachment_type_check
  check (attachment_type in (
    'encounter', 'objective', 'quest_ref', 'location_set', 'npc', 'faction',
    'item', 'monster', 'sound', 'audio_scene', 'playlist', 'note', 'handout'
  ));

create or replace function private.validate_quest_beat_attachment()
returns trigger
language plpgsql security definer
set search_path = public, private
as $$
declare
  v_valid boolean := false;
begin
  case new.attachment_type
    when 'encounter' then
      select exists(select 1 from encounters e where e.id = new.ref_id::uuid and e.campaign_id = new.campaign_id) into v_valid;
    when 'objective' then
      select exists(select 1 from quest_objectives o where o.id = new.ref_id::uuid and o.quest_id = new.quest_id) into v_valid;
    when 'quest_ref' then
      select exists(select 1 from quest_refs r where r.id = new.ref_id::uuid and r.quest_id = new.quest_id) into v_valid;
    when 'location_set' then
      select exists(
        select 1 from locations l
        where l.id = new.ref_id::uuid
          and (l.campaign_id = new.campaign_id or (l.campaign_id is null and l.user_id = auth.uid()))
      ) and not exists (
        select 1
        from jsonb_array_elements_text(coalesce(new.metadata->'room_ids', '[]'::jsonb)) room(id)
        where not exists (
          select 1 from locations l
          where l.id = room.id::uuid
            and (l.campaign_id = new.campaign_id or (l.campaign_id is null and l.user_id = auth.uid()))
        )
      ) into v_valid;
    when 'npc' then
      select exists(select 1 from npcs n where n.id = new.ref_id::uuid and (n.campaign_id = new.campaign_id or (n.campaign_id is null and n.user_id = auth.uid()))) into v_valid;
    when 'faction' then
      select exists(select 1 from factions f where f.id = new.ref_id::uuid and (f.campaign_id = new.campaign_id or (f.campaign_id is null and f.user_id = auth.uid()))) into v_valid;
    when 'item' then
      select exists(select 1 from items i where i.id = new.ref_id::uuid and (i.campaign_id = new.campaign_id or (i.campaign_id is null and i.user_id = auth.uid()))) into v_valid;
    when 'monster' then
      select exists(select 1 from monsters m where m.id = new.ref_id::uuid and (m.campaign_id = new.campaign_id or (m.campaign_id is null and m.user_id = auth.uid()))) into v_valid;
    when 'sound' then
      select exists(select 1 from sounds s where s.id = new.ref_id::uuid and s.campaign_id = new.campaign_id) into v_valid;
    when 'audio_scene' then
      select exists(select 1 from soundboard_playlists p where p.id = new.ref_id::uuid and p.campaign_id = new.campaign_id and p.playlist_type = 'ambient') into v_valid;
    when 'playlist' then
      select exists(select 1 from soundboard_playlists p where p.id = new.ref_id::uuid and p.campaign_id = new.campaign_id and p.playlist_type = 'music') into v_valid;
    when 'note' then
      select exists(select 1 from notes n where n.id = new.ref_id::uuid and n.campaign_id = new.campaign_id) into v_valid;
    when 'handout' then
      select exists(select 1 from scriptorium_documents d where d.id = new.ref_id::uuid and d.user_id = auth.uid()) into v_valid;
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
$$;

revoke all on function private.validate_quest_beat_attachment() from public;
