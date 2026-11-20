-- Backstories written together (#1226 story 10, frame 14; approved 20 Nov 2026).
--
-- A character's backstory is a piece of the canon told in passages. Its opening stays where it has always lived, the
-- character's own Backstory field (`party_members.player_description`): a character can exist outside any campaign and
-- carries that text between campaigns and into the Hall of Heroes, while the canon belongs to one campaign. So nothing
-- is copied: the field is the "Before play" passage, and the campaign's backstory entry (`part = 'backstory'`, one per
-- character) holds what grows from there. The player adds their own passages as the campaign goes and edits them; the
-- DM edits every passage and writes their own, untold until the DM tells them, like a lore passage (by hand, at a place,
-- person or beat, or the Narrator at the AI table).
--
-- The one permission this adds: a player may write, edit and remove the passages they wrote, in their own character's
-- backstory, and nothing else of the canon. They read every passage only through get_player_lore_passages, which
-- never shows one they were not told.

-- ── 1. A backstory is a part, one per character ───────────────────────────────
alter table public.canon_entries drop constraint canon_entries_part;
alter table public.canon_entries add constraint canon_entries_part
  check (part in ('premise', 'truth', 'force', 'secret', 'question', 'lore', 'backstory'));

alter table public.canon_entries
  add column party_member_id uuid references public.party_members (id) on delete cascade,
  add constraint canon_entries_backstory_has_a_character check ((part = 'backstory') = (party_member_id is not null));

create unique index canon_entries_one_backstory on public.canon_entries (party_member_id) where part = 'backstory';

create trigger zz_same_campaign_refs
  before insert or update of party_member_id, campaign_id
  on public.canon_entries
  for each row execute procedure private.enforce_same_campaign_refs('party_member_id', 'party_members', 'owned');

-- ── 2. Passages hang off lore or a backstory, and remember who wrote them ─────
-- Definer: a player writing their own backstory's passage cannot read canon_entries (DM-only), and this only asks what
-- part the parent is.
create or replace function private.canon_child_belongs_to()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(tg_argv[0], ',');
  v_parent uuid := (to_jsonb(new) ->> tg_argv[1])::uuid;
begin
  if not exists (select 1 from public.canon_entries e where e.id = v_parent and e.part = any (v_parts)) then
    raise exception using errcode = '23514', message = format('This belongs to a canon entry of the part %s', tg_argv[0]);
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_child_belongs_to() from public, anon, authenticated;

drop trigger canon_lore_passages_belong_to_lore on public.canon_lore_passages;
create trigger canon_lore_passages_belong_to_lore
  before insert or update of entry_id on public.canon_lore_passages
  for each row execute procedure private.canon_child_belongs_to('lore,backstory', 'entry_id');

alter table public.canon_lore_passages
  add column author_id uuid default auth.uid() references auth.users (id) on delete set null;
create index canon_lore_passages_author_idx on public.canon_lore_passages (author_id) where author_id is not null;
update public.canon_lore_passages set author_id = user_id where author_id is null;

-- Is this the player of this backstory's character? Total: false for anything absent.
create function private.writes_own_backstory(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select e.part = 'backstory' and e.party_member_id = private.my_party_member_id(e.campaign_id)
      from public.canon_entries e where e.id = p_entry_id), false)
$$;
revoke execute on function private.writes_own_backstory(uuid) from public, anon;
grant execute on function private.writes_own_backstory(uuid) to authenticated, service_role;

-- The DM, or the player on the passages they wrote in their own character's backstory. One policy per command, the
-- conditions ORed in (CLAUDE.md: one permissive policy per table and command).
alter policy "canon_lore_passages_select" on public.canon_lore_passages
  using (private.is_campaign_dm(campaign_id)
         or (author_id = (select auth.uid()) and private.writes_own_backstory(entry_id)));
alter policy "canon_lore_passages_insert" on public.canon_lore_passages
  with check (user_id = (select auth.uid())
              and (private.is_campaign_dm(campaign_id)
                   or (author_id = (select auth.uid()) and private.writes_own_backstory(entry_id))));
alter policy "canon_lore_passages_update" on public.canon_lore_passages
  using (private.is_campaign_dm(campaign_id)
         or (author_id = (select auth.uid()) and private.writes_own_backstory(entry_id)))
  with check (private.is_campaign_dm(campaign_id)
              or (author_id = (select auth.uid()) and private.writes_own_backstory(entry_id)));
alter policy "canon_lore_passages_delete" on public.canon_lore_passages
  using (private.is_campaign_dm(campaign_id)
         or (author_id = (select auth.uid()) and private.writes_own_backstory(entry_id)));

-- A player's passage is theirs to tell: they may share it with their own character and the party, never place it at
-- the table, tie it to a clue, or re-stamp who wrote it. The DM may do all of that.
create function private.guard_player_passage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A server write (the AI table telling a passage, a demo copy, a content move) has no signed-in user and is not a
  -- player's; the DM may do anything here.
  if (select auth.uid()) is null or private.is_campaign_dm(new.campaign_id) then
    return new;
  end if;
  -- Where a passage comes out is the DM's to set: a player may not place one, nor move a place the DM set, but may
  -- still edit the words of a passage the DM placed.
  if new.author_id is distinct from (select auth.uid())
     or (tg_op = 'INSERT' and (new.location_id is not null or new.npc_id is not null or new.quest_beat_id is not null))
     or (tg_op = 'UPDATE' and (new.location_id is distinct from old.location_id
                               or new.npc_id is distinct from old.npc_id
                               or new.quest_beat_id is distinct from old.quest_beat_id))
     or (tg_op = 'UPDATE' and new.author_id is distinct from old.author_id)
     or exists (select 1 from unnest(new.player_visible_to) m
                 where not exists (select 1 from public.party_members pm
                                    where pm.id = m and pm.campaign_id = new.campaign_id)) then
    raise exception using errcode = '42501', message = 'A player writes only their own passages, told to their party';
  end if;
  -- Told when written: a player's passage is told to whoever it is shared with, at once.
  if new.told_at is null then
    new.told_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_player_passage() from public, anon, authenticated;

create trigger canon_lore_passages_guard_player
  before insert or update on public.canon_lore_passages
  for each row execute procedure private.guard_player_passage();

-- ── 3. Who among the party may read an entry, now with backstories ────────────
create or replace function private.canon_entry_seen(p_entry_id uuid, p_member uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select case e.part
      when 'truth' then
        e.knowledge = 'all'
        or (e.knowledge = 'some' and exists (
              select 1 from public.world_links l
               where l.from_canon_entry_id = e.id and l.type = 'known_to'
                 and (l.to_party_member_id = p_member
                      or exists (select 1 from public.faction_party_members m
                                  where m.faction_id = l.to_faction_id and m.party_member_id = p_member))))
      when 'premise' then e.premise_kind not in ('voice', 'look') and p_member = any (e.player_visible_to)
      when 'lore' then p_member = any (e.player_visible_to)
      when 'secret' then e.revealed_at is not null and p_member = any (e.player_visible_to)
      -- A backstory is its own character's, and whoever else the DM or its player told.
      -- or a member told any of its passages (a player shares their own passages with the party; each passage still
      -- reaches only whom it was told to, get_player_lore_passages).
      when 'backstory' then p_member = e.party_member_id or p_member = any (e.player_visible_to)
        or exists (select 1 from public.canon_lore_passages bp
                    where bp.entry_id = e.id and p_member = any (bp.player_visible_to))
      else false
    end
      from public.canon_entries e
     where e.id = p_entry_id and p_member is not null), false)
$$;

-- ── 4. The players' read of passages: lore's first passage is free; a backstory's is not ─────────────────────────
-- A backstory has no free first passage: its opening is the character's own field. Each passage reaches the members it
-- was told to; the player's own passages are told to whom they shared them with (their own character always).
-- `by_dm` says whose words they are, so the journal can mark what the DM told.
drop function public.get_player_lore_passages(uuid, uuid);
create function public.get_player_lore_passages(p_campaign_id uuid, p_preview_member_id uuid default null)
returns table (
  id uuid,
  entry_id uuid,
  sort_order integer,
  title text,
  body text,
  told_at timestamptz,
  by_dm boolean,
  written_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me (member) as (
    select cm.party_member_id from public.campaign_members cm
     where cm.campaign_id = p_campaign_id and cm.user_id = (select auth.uid()) and cm.party_member_id is not null
       and p_preview_member_id is null
    union
    select p_preview_member_id
     where p_preview_member_id is not null and private.is_campaign_dm(p_campaign_id)
       and exists (select 1 from public.party_members pm
                    where pm.id = p_preview_member_id and pm.campaign_id = p_campaign_id)
  ),
  firsts as (
    select distinct on (p.entry_id) p.id from public.canon_lore_passages p
      join public.canon_entries e on e.id = p.entry_id and e.part = 'lore'
     where p.campaign_id = p_campaign_id
     order by p.entry_id, p.sort_order, p.created_at
  )
  select p.id, p.entry_id, p.sort_order, p.title, private.withhold_secret_blocks(p.body), p.told_at,
         coalesce(p.author_id is null
                  or exists (select 1 from public.campaigns c where c.id = p.campaign_id and c.user_id = p.author_id)
                  or exists (select 1 from public.campaign_members cm
                              where cm.campaign_id = p.campaign_id and cm.user_id = p.author_id and cm.role = 'dm'),
                  true),
         p.created_at
    from public.canon_lore_passages p
    join me on true
   where p.campaign_id = p_campaign_id
     and private.canon_entry_seen(p.entry_id, me.member)
     and (p.id in (select f.id from firsts f) or me.member = any (p.player_visible_to))
   order by p.entry_id, p.sort_order, p.created_at
$$;
revoke execute on function public.get_player_lore_passages(uuid, uuid) from public, anon;
grant execute on function public.get_player_lore_passages(uuid, uuid) to authenticated, service_role;

-- ── 5. A player opens their own character's backstory ─────────────────────────
-- The entry is created on first use, by the DM or by the character's player (who may not write canon_entries): one
-- definer, refusing anyone but the campaign's DMs and that character's player.
create function public.open_backstory(p_party_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign uuid;
  v_id uuid;
  v_owner uuid;
begin
  select pm.campaign_id into v_campaign from public.party_members pm where pm.id = p_party_member_id;
  if v_campaign is null
     or not (coalesce(private.is_campaign_dm(v_campaign), false)
             or private.my_party_member_id(v_campaign) is not distinct from p_party_member_id
                and private.my_party_member_id(v_campaign) is not null) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select e.id into v_id from public.canon_entries e where e.part = 'backstory' and e.party_member_id = p_party_member_id;
  if v_id is not null then
    return v_id;
  end if;
  select c.user_id into v_owner from public.campaigns c where c.id = v_campaign;
  insert into public.canon_entries (user_id, campaign_id, part, party_member_id, title)
  values (v_owner, v_campaign, 'backstory', p_party_member_id, '')
  on conflict (party_member_id) where part = 'backstory' do nothing
  returning id into v_id;
  if v_id is null then
    select e.id into v_id from public.canon_entries e where e.part = 'backstory' and e.party_member_id = p_party_member_id;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.open_backstory(uuid) from public, anon;
grant execute on function public.open_backstory(uuid) to authenticated, service_role;

-- ── 6. The players' read of entries says whose backstory an entry is ─────────────
drop function public.get_player_canon(uuid, uuid);
create function public.get_player_canon(p_campaign_id uuid, p_preview_member_id uuid default null)
returns table (
  id uuid,
  part text,
  premise_kind text,
  knowledge text,
  title text,
  body text,
  sort_order integer,
  image_url text,
  ai_provenance jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  lore_kind text,
  world_year integer,
  world_month integer,
  world_day integer,
  party_member_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with me (member) as (
    select cm.party_member_id from public.campaign_members cm
     where cm.campaign_id = p_campaign_id and cm.user_id = (select auth.uid()) and cm.party_member_id is not null
       and p_preview_member_id is null
    union
    select p_preview_member_id
     where p_preview_member_id is not null and private.is_campaign_dm(p_campaign_id)
       and exists (select 1 from public.party_members pm
                    where pm.id = p_preview_member_id and pm.campaign_id = p_campaign_id)
  )
  select e.id, e.part, e.premise_kind, e.knowledge, e.title, private.withhold_secret_blocks(e.body), e.sort_order,
         e.image_url, e.ai_provenance, e.created_at, e.updated_at, e.lore_kind, e.world_year, e.world_month, e.world_day,
         e.party_member_id
    from public.canon_entries e
   where e.campaign_id = p_campaign_id
     and exists (select 1 from me where private.canon_entry_seen(e.id, me.member))
   order by e.part, e.sort_order, e.created_at
$$;
revoke execute on function public.get_player_canon(uuid, uuid) from public, anon;
grant execute on function public.get_player_canon(uuid, uuid) to authenticated, service_role;
