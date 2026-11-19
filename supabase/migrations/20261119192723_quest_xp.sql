-- Experience for a quest (#1021 row 27, levels proposal step 2).
--
-- In a campaign that uses the Experience Points rule, a quest can say what it is worth ("1,800 XP"). When it is
-- completed, the party shares that XP equally (rounded down), every character at the table alike (not one on the Hall
-- of the Fallen wall: the dead and the retired earn nothing, and do not thin the others' share), and the table
-- hears it in chat. Given once: a quest reopened and completed again gives nothing the second time. In a campaign
-- that levels by milestone the number is kept but gives nothing; a milestone (`level_milestones`) says when the party
-- levels instead.

alter table public.quests
  add column xp_reward integer check (xp_reward is null or xp_reward between 1 and 10000000),
  add column xp_awarded_at timestamptz;

comment on column public.quests.xp_reward is
  'What completing the quest is worth in XP, shared by the party, in a campaign with the Experience Points rule (#1021 row 27). Null for none.';
comment on column public.quests.xp_awarded_at is
  'When the quest''s XP was given; set once by private.award_quest_xp, so completing it again gives nothing.';

-- Editing what a quest is worth is a real edit, so it moves `updated_at` like the other fields this list names.
drop trigger if exists quests_updated_at on public.quests;
create trigger quests_updated_at
  before update on public.quests
  for each row
  when (old.parent_quest_id is distinct from new.parent_quest_id
       or old.title is distinct from new.title
       or old.summary is distinct from new.summary
       or old.status is distinct from new.status
       or old.giver_npc_id is distinct from new.giver_npc_id
       or old.location_id is distinct from new.location_id
       or old.tags is distinct from new.tags
       or old.started_at is distinct from new.started_at
       or old.resolved_at is distinct from new.resolved_at
       or old.xp_reward is distinct from new.xp_reward)
  execute procedure update_updated_at();

-- Before the update, so the award mark is written with the completion itself and no second update of the row is
-- needed. Definer: whoever completes the quest (the DM's run screen, the AI table's server) gives the party XP and a
-- chat line, which a caller may not write for every character directly. It touches only the quest's own campaign.
create or replace function private.award_quest_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_members integer;
  v_each integer;
begin
  if new.status is distinct from 'completed' or old.status = 'completed'
     or new.xp_reward is null or new.xp_awarded_at is not null or new.campaign_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.campaign_rules r
     where r.campaign_id = new.campaign_id and r.rule_key = 'xp_levelling' and r.enabled
  ) then
    return new;
  end if;

  select count(*) into v_members from public.party_members pm
   where pm.campaign_id = new.campaign_id
     and not exists (select 1 from public.character_memorials cm where cm.party_member_id = pm.id and cm.restored_at is null);
  if v_members = 0 then
    return new;
  end if;
  v_each := new.xp_reward / v_members;
  -- Worth less than one point each gives nothing, and is not used up: raise the worth and the quest still pays.
  if v_each <= 0 then
    return new;
  end if;

  update public.party_members pm
     set experience_points = pm.experience_points + v_each
   where pm.campaign_id = new.campaign_id
     and not exists (select 1 from public.character_memorials cm where cm.party_member_id = pm.id and cm.restored_at is null);
  new.xp_awarded_at := now();

  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, type)
  select new.campaign_id, c.user_id, 'Grimoire',
         '⭐ ' || new.title || ' is worth ' || new.xp_reward || ' XP: ' || v_each || ' each.', 'system'
    from public.campaigns c where c.id = new.campaign_id;
  return new;
end;
$$;

revoke execute on function private.award_quest_xp() from public, anon, authenticated;

create trigger quests_award_xp
  before update of status on public.quests
  for each row execute procedure private.award_quest_xp();
