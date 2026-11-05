-- Awareness rolls: the optional rule `awareness_rolls` (src/rules/optionalRules.ts).
--
-- With the rule on, every character still playing gets a secret Perception roll when the
-- session starts. The DM keeps it until a Perception check is needed, uses it instead of
-- asking the player to roll (asking is what gives the trap away), and the next one is
-- rolled at once. The DM reads it beside passive Perception on the dashboard and the
-- Party page.
--
--   awareness_rolls: one row per character, the dice waiting to be used, and the ones used
--     last (so the DM can still read them after the toast has gone). Two d20s, because
--     whether the check has disadvantage (Poisoned, Frightened, 2014 Exhaustion) is known
--     only when it is made, hours after the roll: the client reads the first die, or the
--     lower of the two under disadvantage. Dice only: the client adds the Perception
--     bonus and any 2024 Exhaustion penalty as they stand at that moment, so a level-up
--     or a new condition mid-session still gives the right total.
--
-- Why these choices:
-- * DM only, all four commands. A player who could read their next roll would know how
--   their next check goes, and the whole point is that it is not announced. The ring
--   tells players only that the table changed, like every DM-only table; they read nothing.
-- * The session start rolls, inside start_campaign_session, rather than a trigger on
--   campaign_sessions: a session the DM logs afterwards is an insert too, and must not
--   reroll anything. Continuing a session (resume_campaign_session) keeps the numbers.
-- * Rolls are random() on the server, by the same function for the start and for every
--   use, so there is one d20 and no client-sent number.

create table public.awareness_rolls (
  id uuid primary key default gen_random_uuid(),
  party_member_id uuid not null unique references public.party_members (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  d20 smallint not null constraint awareness_rolls_d20_check check (d20 between 1 and 20),
  -- The second die, read only under disadvantage.
  d20_second smallint not null constraint awareness_rolls_d20_second_check check (d20_second between 1 and 20),
  last_used_d20 smallint constraint awareness_rolls_last_used_check check (last_used_d20 between 1 and 20),
  last_used_d20_second smallint constraint awareness_rolls_last_used_second_check check (last_used_d20_second between 1 and 20),
  -- Both used dice or neither.
  constraint awareness_rolls_last_used_pair check ((last_used_d20 is null) = (last_used_d20_second is null)),
  last_used_at timestamptz,
  rolled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.awareness_rolls is
  'The DM''s secret Perception d20 per character, rolled at session start and replaced each time it is used (optional rule awareness_rolls). DM only.';

create index awareness_rolls_campaign_idx on public.awareness_rolls (campaign_id);

create trigger awareness_rolls_updated_at
  before update on public.awareness_rolls
  for each row execute procedure update_updated_at();

create trigger zz_same_campaign_refs
  before insert or update of party_member_id, campaign_id
  on public.awareness_rolls
  for each row execute procedure private.enforce_same_campaign_refs('party_member_id', 'party_members', 'owned');

alter table public.awareness_rolls enable row level security;

create policy "awareness_rolls_select" on public.awareness_rolls for select
  using (private.is_campaign_dm(campaign_id));
create policy "awareness_rolls_insert" on public.awareness_rolls for insert
  with check (private.is_campaign_dm(campaign_id));
create policy "awareness_rolls_update" on public.awareness_rolls for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "awareness_rolls_delete" on public.awareness_rolls for delete
  using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.awareness_rolls to authenticated, service_role;

-- A second DM window shows the new number the moment one is used.
create trigger awareness_rolls_signal_insert after insert on public.awareness_rolls referencing new table as changed
  for each statement execute function public.signal_campaign_change();
create trigger awareness_rolls_signal_update after update on public.awareness_rolls referencing old table as left_rows new table as changed
  for each statement execute function public.signal_campaign_change();
create trigger awareness_rolls_signal_delete after delete on public.awareness_rolls referencing old table as changed
  for each statement execute function public.signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('awareness_rolls', 1, false, 'play state: rolled when a session starts');

-- ── Rolling ─────────────────────────────────────────────────────────────────
-- A fresh pair of d20s for each named character of the campaign; the pair it replaces
-- becomes `last_used_*` when `p_used`, and is forgotten otherwise (a new session). Invoker:
-- the policies above decide who may, so a caller who is not the DM writes nothing.
-- Ids from another campaign are skipped, never written.
create function private.roll_awareness(p_campaign_id uuid, p_party_member_ids uuid[], p_used boolean)
returns table (member_id uuid, used_d20 smallint, used_d20_second smallint, new_d20 smallint, new_d20_second smallint)
language sql
security invoker
set search_path to ''
as $$
  insert into public.awareness_rolls as r (campaign_id, party_member_id, d20, d20_second)
  select p_campaign_id, m.id, (1 + floor(random() * 20))::smallint, (1 + floor(random() * 20))::smallint
    from public.party_members m
   where m.campaign_id = p_campaign_id
     and m.id = any (p_party_member_ids)
  on conflict (party_member_id) do update
     set d20 = excluded.d20,
         d20_second = excluded.d20_second,
         campaign_id = excluded.campaign_id,
         rolled_at = now(),
         last_used_d20 = case when p_used then r.d20 end,
         last_used_d20_second = case when p_used then r.d20_second end,
         last_used_at = case when p_used then now() end
  returning r.party_member_id, r.last_used_d20, r.last_used_d20_second, r.d20, r.d20_second;
$$;

revoke execute on function private.roll_awareness(uuid, uuid[], boolean) from public, anon;
grant execute on function private.roll_awareness(uuid, uuid[], boolean) to authenticated, service_role;

-- Use the waiting rolls of these characters: returns each pair used (null for a character
-- who had none yet, which this rolls for the first time) and the pair now waiting.
create function public.use_awareness_rolls(p_campaign_id uuid, p_party_member_ids uuid[])
returns table (member_id uuid, used_d20 smallint, used_d20_second smallint, new_d20 smallint, new_d20_second smallint)
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query select * from private.roll_awareness(p_campaign_id, p_party_member_ids, true);
end;
$$;

revoke execute on function public.use_awareness_rolls(uuid, uuid[]) from public, anon;
grant execute on function public.use_awareness_rolls(uuid, uuid[]) to authenticated, service_role;

-- ── The session start rolls for everyone still playing ─────────────────────
-- As 20261014064329, plus the awareness roll. A fallen or retired character (a memorial
-- on the wall) is not at the table and gets none. With the rule off nothing is rolled.
create or replace function public.start_campaign_session(
  p_campaign_id uuid,
  p_number integer default null,
  p_title text default null,
  p_proposal_id uuid default null
)
returns public.campaign_sessions
language plpgsql
set search_path to 'public', 'private'
as $$
declare
  v_row   public.campaign_sessions;
  v_since timestamptz;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  select * into v_row from public.campaign_sessions
   where campaign_id = p_campaign_id and started_at is not null and ended_at is null;
  if found then
    return v_row;
  end if;

  insert into public.campaign_sessions (campaign_id, user_id, number, title, started_at)
  values (p_campaign_id, auth.uid(), p_number, nullif(btrim(p_title), ''), now())
  returning * into v_row;

  if p_proposal_id is not null then
    update public.session_proposals
       set session_id = v_row.id
     where id = p_proposal_id and campaign_id = p_campaign_id;
  end if;

  -- What the DM shared since the last session ended (prep) was learned for
  -- this one. Never before the log began, never a reconstructed moment.
  select greatest(coalesce(max(ended_at), '-infinity'::timestamptz), private.session_log_began())
    into v_since
    from public.campaign_sessions
   where campaign_id = p_campaign_id and ended_at is not null;

  perform private.file_unsessioned_moments(p_campaign_id, v_row.id, v_since);

  if exists (
    select 1 from public.campaign_rules cr
     where cr.campaign_id = p_campaign_id and cr.rule_key = 'awareness_rolls' and cr.enabled
  ) then
    perform private.roll_awareness(
      p_campaign_id,
      array(
        select m.id from public.party_members m
         where m.campaign_id = p_campaign_id
           and not exists (
             select 1 from public.character_memorials cm
              where cm.party_member_id = m.id and cm.restored_at is null)),
      false);
  end if;

  return v_row;
end;
$$;
