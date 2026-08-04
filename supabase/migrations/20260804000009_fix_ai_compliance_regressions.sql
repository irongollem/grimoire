-- Migration: fix_ai_compliance_regressions
-- Follow-up hardening for the AI provenance/grounding rollout:
--   1. preserve account deletion while keeping settled ledger rows immutable;
--   2. prevent non-DMs from injecting notes into a campaign retrieval corpus;
--   3. exclude any legacy unauthorized note rows from Chronicle retrieval.

-- Account deletion reaches this table through the auth.users FK's ON DELETE
-- CASCADE. At that point the parent auth row is already absent, so allow that
-- narrow case while continuing to reject every direct deletion of a settled
-- ledger row. Pending reservation releases remain allowed as before.
create or replace function public.ai_credit_ledger_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.pending
     or not exists (select 1 from auth.users where id = old.user_id) then
    return old;
  end if;

  raise exception 'ai_credit_ledger is append-only — settled row % cannot be deleted', old.id;
end;
$$;

revoke execute on function public.ai_credit_ledger_guard_delete() from public, anon, authenticated;

-- A campaign-scoped note can participate in DM-facing semantic retrieval.
-- Ownership of the note row is therefore not enough: the author must also be
-- a DM of that campaign. Apply the same condition to UPDATE so a user cannot
-- create a permitted global note and subsequently move it into a campaign.
drop policy if exists "Users insert own notes" on public.notes;
create policy "Users insert own notes" on public.notes
  for insert
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy if exists "Users update own notes" on public.notes;
create policy "Users update own notes" on public.notes
  for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- Replace the matcher so historical rows created under the old policy cannot
-- be retrieved. Campaign notes must belong to the owner or a current DM
-- member; owner-global notes retain their existing behavior.
create or replace function public.match_campaign_notes(
  query_embedding   vector(1536),
  p_campaign_id     uuid,
  p_owner_id        uuid,
  p_embedding_model text,
  p_exclude_id      uuid,
  p_categories      text[],
  match_count       int
) returns table (
  id          uuid,
  title       text,
  category    text,
  session_num int,
  distance    float
)
language sql stable
set search_path = public
as $$
  select
    n.id,
    n.title,
    n.category,
    n.session_num,
    e.embedding <=> query_embedding as distance
  from public.note_embeddings e
  join public.notes n on n.id = e.note_id
  where (
      (
        n.campaign_id = p_campaign_id
        and (
          n.user_id = p_owner_id
          or exists (
            select 1
            from public.campaign_members cm
            where cm.campaign_id = p_campaign_id
              and cm.user_id = n.user_id
              and cm.role = 'dm'
          )
        )
      )
      or (n.campaign_id is null and n.user_id = p_owner_id)
    )
    and e.embedding_model = p_embedding_model
    and (p_exclude_id is null or n.id <> p_exclude_id)
    and n.category = any(p_categories)
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_campaign_notes(vector, uuid, uuid, text, uuid, text[], int)
  from public, anon, authenticated;
grant execute on function public.match_campaign_notes(vector, uuid, uuid, text, uuid, text[], int)
  to service_role;
