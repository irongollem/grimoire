-- Credit gifts, two corrections to 20261125233731.
--
-- 1. An index its foreign key can use. The gift table had only a partial index on
--    user_id (where seen_at is null), which an account's erasure cascade cannot
--    use; foreign_key_indexes.test.sql refused the release. A full index serves
--    the cascade and the unseen count below alike.
--
-- 2. No request of its own at boot. The gift dialog read credit_gifts on every
--    load of every account, one more API request on each boot journey, for
--    something most accounts never receive. The count of unseen gifts now comes
--    with the subscription row every boot already reads, as a PostgREST computed
--    field (select "*, unseen_credit_gifts"), and the gifts themselves are read
--    only when that count is above zero.

drop index public.credit_gifts_unseen_idx;
create index credit_gifts_user_id_idx on public.credit_gifts (user_id);

-- Invoker, so credit_gifts' own RLS decides what is counted: a caller who hands
-- it another account's row counts none of that account's gifts.
create function public.unseen_credit_gifts(s public.user_subscriptions)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
    from public.credit_gifts g
   where g.user_id = s.user_id
     and g.seen_at is null;
$$;
revoke execute on function public.unseen_credit_gifts(public.user_subscriptions) from public, anon;
grant execute on function public.unseen_credit_gifts(public.user_subscriptions) to authenticated, service_role;
