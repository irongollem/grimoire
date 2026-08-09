-- Beats place existing campaign material in the story flow. They never own or
-- clone encounters, NPCs, locations, objectives, audio, notes, or handouts.

alter table public.quest_refs drop constraint quest_refs_ref_type_check;
alter table public.quest_refs add constraint quest_refs_ref_type_check
  check (ref_type in ('npc', 'location', 'monster', 'item', 'encounter', 'faction'));

create table public.quest_beat_attachments (
  id uuid primary key default gen_random_uuid(),
  beat_id uuid not null,
  quest_id uuid not null,
  campaign_id uuid not null,
  attachment_type text not null check (attachment_type in (
    'encounter', 'objective', 'quest_ref', 'location_set', 'npc', 'faction',
    'sound', 'playlist', 'note', 'handout'
  )),
  ref_id text not null check (length(btrim(ref_id)) > 0),
  role text not null default '',
  is_required boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint quest_beat_attachments_beat_fkey
    foreign key (beat_id, quest_id, campaign_id)
    references public.quest_beats(id, quest_id, campaign_id) on delete cascade,
  constraint quest_beat_attachments_unique_role
    unique (beat_id, attachment_type, ref_id, role),
  constraint quest_beat_attachments_location_rooms_array check (
    not (metadata ? 'room_ids') or jsonb_typeof(metadata->'room_ids') = 'array'
  )
);

create index quest_beat_attachments_beat_idx
  on public.quest_beat_attachments (beat_id, sort_order, created_at);
create index quest_beat_attachments_quest_idx
  on public.quest_beat_attachments (quest_id);
create index quest_beat_attachments_ref_idx
  on public.quest_beat_attachments (attachment_type, ref_id);

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
    when 'sound' then
      select exists(select 1 from sounds s where s.id = new.ref_id::uuid and s.campaign_id = new.campaign_id) into v_valid;
    when 'playlist' then
      select exists(select 1 from soundboard_playlists p where p.id = new.ref_id::uuid and p.campaign_id = new.campaign_id) into v_valid;
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

create trigger validate_quest_beat_attachment
  before insert or update of beat_id, quest_id, campaign_id, attachment_type, ref_id, metadata
  on public.quest_beat_attachments
  for each row execute function private.validate_quest_beat_attachment();

-- Keep the existing quest-level relationship authoritative for filters and
-- reverse lookups. Removing a beat placement does not remove that broader link.
create or replace function private.sync_quest_ref_from_beat_attachment()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ref_type text;
begin
  v_ref_type := case new.attachment_type
    when 'encounter' then 'encounter'
    when 'npc' then 'npc'
    when 'faction' then 'faction'
    when 'location_set' then 'location'
    else null
  end;
  if v_ref_type is not null then
    insert into quest_refs (quest_id, ref_type, ref_id, is_player_visible)
    values (new.quest_id, v_ref_type, new.ref_id, false)
    on conflict (quest_id, ref_type, ref_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_quest_ref_from_beat_attachment() from public;

create trigger sync_quest_ref_from_beat_attachment
  after insert or update of quest_id, attachment_type, ref_id
  on public.quest_beat_attachments
  for each row execute function private.sync_quest_ref_from_beat_attachment();

alter table public.quest_beat_attachments enable row level security;
create policy quest_beat_attachments_dm_all on public.quest_beat_attachments
  for all using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.quest_beat_attachments to authenticated;
