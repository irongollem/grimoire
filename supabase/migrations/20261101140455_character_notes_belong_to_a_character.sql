-- A player's "Character" journal notes belong to the character they were
-- written for, so a new character does not inherit the notes of one who died:
-- the live journal hides notes of a fallen character, and the Hall of the
-- Fallen shows them with that character instead (maintainer, 1 Nov 2026).
--
-- party_member_id is set only on category = 'character'. The trigger stamps it
-- with the author's active character (campaign_members.party_member_id) when
-- the client sends none, clears it when a note leaves the category, and refuses
-- a character the author does not play, so the rule lives in one place.

alter table public.player_journal_entries
  add column party_member_id uuid references public.party_members(id) on delete set null;

create index player_journal_entries_party_member_id_idx
  on public.player_journal_entries (party_member_id);

-- Existing notes: the author's character in that campaign that existed when the
-- note was written (latest created before it), else their active character.
update public.player_journal_entries e
   set party_member_id = coalesce(
     (select pm.id from public.party_members pm
       where pm.campaign_id = e.campaign_id
         and pm.owner_user_id = e.user_id
         and pm.created_at <= e.created_at
       order by pm.created_at desc
       limit 1),
     (select cm.party_member_id from public.campaign_members cm
       where cm.campaign_id = e.campaign_id and cm.user_id = e.user_id))
 where e.category = 'character';

create or replace function private.stamp_journal_character()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category is distinct from 'character' then
    new.party_member_id := null;
    return new;
  end if;

  if new.party_member_id is null then
    select cm.party_member_id into new.party_member_id
      from public.campaign_members cm
     where cm.campaign_id = new.campaign_id and cm.user_id = new.user_id;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.party_member_id is not distinct from old.party_member_id then
    return new;
  end if;

  if not exists (
    select 1 from public.party_members pm
     where pm.id = new.party_member_id
       and pm.campaign_id = new.campaign_id
       and (pm.owner_user_id = new.user_id
            or exists (select 1 from public.campaign_members cm
                        where cm.campaign_id = new.campaign_id
                          and cm.user_id = new.user_id
                          and cm.party_member_id = pm.id))
  ) then
    raise exception 'A character note can only belong to one of your own characters in this campaign'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.stamp_journal_character() from public, anon, authenticated;

create trigger player_journal_entries_stamp_character
  before insert or update of category, party_member_id on public.player_journal_entries
  for each row execute procedure private.stamp_journal_character();

-- #892's rule for every campaign-to-campaign link. It sorts after the stamp
-- above, so it checks the character the stamp chose too.
create trigger zz_same_campaign_refs
  before insert or update of party_member_id, campaign_id on public.player_journal_entries
  for each row execute procedure private.enforce_same_campaign_refs('party_member_id', 'party_members', 'owned');
