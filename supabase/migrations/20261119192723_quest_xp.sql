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
  v_ids uuid[];
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

  -- Who is paid, read once: the share is divided by these and only these are paid, so a character added meanwhile
  -- cannot be paid out of a share worked out without them.
  select array_agg(pm.id) into v_ids from public.party_members pm
   where pm.campaign_id = new.campaign_id
     and not exists (select 1 from public.character_memorials cm where cm.party_member_id = pm.id and cm.restored_at is null);
  v_members := coalesce(cardinality(v_ids), 0);
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
   where pm.id = any (v_ids);
  new.xp_awarded_at := now();

  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, type)
  select new.campaign_id, c.user_id, 'Grimoire',
         '⭐ ' || new.title || ' is worth ' || new.xp_reward || ' XP: ' || v_each || ' each.', 'system'
    from public.campaigns c where c.id = new.campaign_id;
  return new;
end;
$$;

revoke execute on function private.award_quest_xp() from public, anon, authenticated;

-- Named to run after every other BEFORE trigger on quests (they fire in name order), so the guard below sees only
-- what the writer sent, and this is the one thing that ever sets the mark.
create trigger quests_zz_award_xp
  before update of status on public.quests
  for each row execute procedure private.award_quest_xp();

-- The mark is the database's alone. A writer who could clear it would be paid again by reopening the quest; one who
-- could set it would cancel the first award. An inserted quest starts unpaid, whatever it was copied from (a demo
-- copy, a copy to another campaign): it pays when it is completed there.
create or replace function private.guard_quest_xp_awarded()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.xp_awarded_at := null;
  elsif new.xp_awarded_at is distinct from old.xp_awarded_at then
    raise exception 'When a quest''s XP was given is set by the database only' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_quest_xp_awarded() from public, anon, authenticated;

create trigger quests_guard_xp_awarded
  before insert or update on public.quests
  for each row execute procedure private.guard_quest_xp_awarded();
