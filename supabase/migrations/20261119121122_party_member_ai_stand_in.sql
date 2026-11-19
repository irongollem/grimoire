-- A character played by the AI while its player is away, at a real table (#1021 row 26).
--
-- The maintainer, 19 Nov 2026: "any real table is billed to the dm ('players always play for free') its also a dm
-- call to have an absent player be represented anyway", and the character "works in normal chat and responds on @
-- and whispers". So two words are needed before a character answers in chat, each from the one whose word it is:
--   `ai_speaks`     the player's, on their own sheet (20261119121121): the AI may speak as my character;
--   `ai_stands_in`  the Dungeon Master's, per character: tonight this absent character is played, on my credits.
-- Neither may be given by the other. `ai_speaks` had no guard: a Dungeon Master could switch on a consent that is
-- the player's to give. This closes that too.

alter table public.party_members
  add column ai_stands_in boolean not null default false;

comment on column public.party_members.ai_stands_in is
  'The Dungeon Master''s word that this character is played by the AI while its player is away, at the DM''s cost (#1021 row 26). Only the campaign''s DM may change it.';

create or replace function private.guard_party_member_ai_play()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_has_player boolean;
  v_is_its_player boolean;
begin
  -- The server and migrations write as they must; this holds the people.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- A new character: nobody starts out played at the Dungeon Master's cost unless the Dungeon Master made it so.
  -- (The player's own word on a character they make themselves is theirs to give from the start.)
  if tg_op = 'INSERT' then
    if new.ai_stands_in
       and not coalesce(new.campaign_id is not null and private.is_campaign_dm(new.campaign_id), false) then
      raise exception 'Only the Dungeon Master decides whether an absent character is played'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.ai_stands_in is distinct from old.ai_stands_in
     and not coalesce(old.campaign_id is not null and private.is_campaign_dm(old.campaign_id), false) then
    raise exception 'Only the Dungeon Master decides whether an absent character is played'
      using errcode = '42501';
  end if;

  if new.ai_speaks is distinct from old.ai_speaks then
    v_has_player := old.owner_user_id is not null
      or exists (select 1 from public.campaign_members cm where cm.party_member_id = old.id);
    v_is_its_player := coalesce(old.owner_user_id = v_uid, false)
      or exists (select 1 from public.campaign_members cm where cm.party_member_id = old.id and cm.user_id = v_uid);
    -- A character with a player: only that player. One nobody has claimed: whoever may edit it (the row policy).
    if v_has_player and not v_is_its_player then
      raise exception 'Only a character''s own player may let the AI speak for it'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_party_member_ai_play() from public, anon, authenticated;

create trigger party_members_guard_ai_play
  before insert or update of ai_speaks, ai_stands_in on public.party_members
  for each row execute procedure private.guard_party_member_ai_play();

-- Each word is given for a situation, and does not outlive it:
--   the Dungeon Master's switch is for THIS campaign, so it is off again when the character moves to another;
--   the consent is its PLAYER's, so whatever was set before a player took the character (a Dungeon Master may say it
--   for a character nobody has claimed) is off again the moment one does. They say it themselves, on their sheet.
-- A plain trigger on the row, whoever makes the change: the definer functions that attach, detach and claim a
-- character run as the owner and would pass the guard above.
create or replace function private.reset_party_member_ai_play()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.campaign_id is distinct from old.campaign_id then
    new.ai_stands_in := false;
  end if;
  if old.owner_user_id is null and new.owner_user_id is not null then
    new.ai_speaks := false;
    new.ai_stands_in := false;
  end if;
  return new;
end;
$$;

revoke execute on function private.reset_party_member_ai_play() from public, anon, authenticated;

create trigger party_members_reset_ai_play
  before update of campaign_id, owner_user_id on public.party_members
  for each row execute procedure private.reset_party_member_ai_play();

-- A character can also get its player by a seat alone (a character the Dungeon Master manages, linked to a member,
-- keeps no owner). The same rule: what was said before that player sat down is not theirs. Definer, because the
-- member taking the seat may not be allowed to write the character's row; it writes two flags of the one character
-- the new link names and nothing else, and no client can call it.
create or replace function private.reset_ai_play_on_seat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.party_members pm
     set ai_speaks = false, ai_stands_in = false
   where pm.id = new.party_member_id
     and pm.campaign_id = new.campaign_id
     and (pm.ai_speaks or pm.ai_stands_in);
  return null;
end;
$$;

revoke execute on function private.reset_ai_play_on_seat() from public, anon, authenticated;

create trigger campaign_members_reset_ai_play
  after insert or update of party_member_id on public.campaign_members
  for each row
  when (new.party_member_id is not null)
  execute procedure private.reset_ai_play_on_seat();
