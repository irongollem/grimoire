-- #927 story 5: no whispers between an adult and a young player who isn't theirs.
--
-- A whisper is a campaign_messages row with a recipient_user_id, and the
-- browser inserts it directly. Until now the insert policy checked only that
-- the sender is a member of the campaign, never who the recipient is, so any
-- member could message any user privately (a recipient outside the campaign
-- included). Since #919 a child account can run or join a campaign from an
-- invite link, which made that an adult stranger's private line to a child.
--
-- The rule is enforced here, in the policy, because hiding recipients in the
-- chat's "To:" list is only a convenience: the insert is a PostgREST call
-- anyone can make by hand. It covers every message type, so a whispered roll
-- (dm_roll) is held to it too.
--
-- A whisper is allowed when there is no recipient (a public message), or when
-- the recipient is a member of the same campaign and either
--   * both sides are children, or both are adults, or
--   * one side is the other's parent.
-- The campaign DM can still read every whisper through campaign_messages_select;
-- this rule is about who can open a private line, not about supervision.
--
-- Existing whispers are left as they are: this closes the line, it does not
-- rewrite history.

create or replace function private.may_whisper(p_campaign_id uuid, p_sender uuid, p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Total by construction: every branch is a boolean comparison or an exists(),
  -- so this never answers NULL. The coalesce holds that if a branch changes.
  select coalesce(
    p_recipient is null
    or (
      p_sender is not null
      and exists (
        select 1 from public.campaign_members m
        where m.campaign_id = p_campaign_id and m.user_id = p_recipient
      )
      and (
        private.is_child_account(p_sender) = private.is_child_account(p_recipient)
        or exists (
          select 1 from public.child_accounts c
          where c.adult_on > current_date
            and (
              (c.child_user_id = p_sender and c.parent_user_id = p_recipient)
              or (c.child_user_id = p_recipient and c.parent_user_id = p_sender)
            )
        )
      )
    ),
    false
  );
$$;

-- Called from an RLS policy, so authenticated keeps EXECUTE (see CLAUDE.md:
-- relocation to private, not revocation, is what keeps it off the RPC surface).
revoke execute on function private.may_whisper(uuid, uuid, uuid) from public, anon;
grant execute on function private.may_whisper(uuid, uuid, uuid) to authenticated;

drop policy if exists "campaign_messages_insert" on public.campaign_messages;
create policy "campaign_messages_insert" on public.campaign_messages
  for insert with check (
    (select auth.uid()) = user_id
    and private.is_campaign_member(campaign_id)
    and private.may_whisper(campaign_id, (select auth.uid()), recipient_user_id)
  );

-- The chat's "To:" list. The browser cannot work this out itself: whether
-- another member is a child account is readable only by that child and their
-- parent (child_accounts_select). This returns just the ids the caller may
-- whisper, never the reason. A member can still infer from who is missing that
-- someone at their table is a young player (or an adult, if the caller is one);
-- a refused insert discloses the same one recipient at a time, and only fellow
-- members of the campaign can ask. That is accepted: the table needs to know
-- whom it can whisper.
create or replace function public.get_whisper_recipients(p_campaign_id uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;
  if not coalesce(private.is_campaign_member(p_campaign_id), false) then
    raise exception 'Not a member of this campaign';
  end if;

  return query
    select m.user_id
      from public.campaign_members m
     where m.campaign_id = p_campaign_id
       and m.user_id <> v_caller
       and private.may_whisper(p_campaign_id, v_caller, m.user_id);
end;
$$;

revoke execute on function public.get_whisper_recipients(uuid) from public, anon;
grant execute on function public.get_whisper_recipients(uuid) to authenticated, service_role;
