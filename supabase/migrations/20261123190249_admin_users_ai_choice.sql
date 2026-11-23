-- The admin list learns which campaigns have AI on.
--
-- The AI switch is per campaign (campaigns.ai_enabled, the tri-state consent
-- of 20260804000007), so an account has no single answer; the list counts how
-- many of the campaigns it owns are switched on. Same campaigns as
-- campaigns_owned (the demo copy and template excluded), so "on" and
-- "owned" share a denominator. Only `= true` counts: an unchosen (null)
-- campaign behaves as AI off everywhere, and it is counted as off here too.
--
-- Body as 20261014210515 plus campaigns_ai_on. A new output column changes
-- the return type, hence drop and create rather than create or replace.
drop function public.get_admin_users();

create function public.get_admin_users()
returns table (
  user_id                   uuid,
  email                     text,
  display_name              text,
  created_at                timestamptz,
  plan_id                   text,
  status                    text,
  ai_credits                bigint,
  suspended_at              timestamptz,
  banned                    boolean,
  last_active_at            timestamptz,
  campaigns_owned           integer,
  campaigns_ai_on           integer,
  campaigns_playing         integer,
  is_child                  boolean,
  exempt_reason             text,
  retention_state           text,
  inactivity_notice_sent_at timestamptz,
  product_news              boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not private.is_app_admin() then
    raise exception 'Access denied';
  end if;

  return query
  select
    u.id                                          as user_id,
    u.email::text                                 as email,
    (u.raw_user_meta_data ->> 'display_name')     as display_name,
    u.created_at                                  as created_at,
    coalesce(s.plan_id, 'free')                   as plan_id,
    coalesce(s.status,  'active')                 as status,
    coalesce(b.balance, 0)::bigint                as ai_credits,
    s.suspended_at                                as suspended_at,
    (u.banned_until is not null and u.banned_until > now()) as banned,
    r.last_active_at                              as last_active_at,
    own.owned                                     as campaigns_owned,
    own.ai_on                                     as campaigns_ai_on,
    (select count(*)::integer from campaign_members m join campaigns c on c.id = m.campaign_id
      where m.user_id = u.id and c.user_id <> u.id)
                                                  as campaigns_playing,
    private.is_child_account(u.id)                as is_child,
    r.exempt_reason                               as exempt_reason,
    r.retention_state                             as retention_state,
    r.inactivity_notice_sent_at                   as inactivity_notice_sent_at,
    -- No row means no consent: unlike the transactional toggles, OFF by default.
    coalesce(np.email_product_news, false)        as product_news
  from auth.users u
  left join user_subscriptions s on s.user_id = u.id
  left join ai_credit_balance   b on b.user_id = u.id
  left join notification_preferences np on np.user_id = u.id
  join private.account_retention() r on r.user_id = u.id
  cross join lateral (
    select count(*)::integer                                    as owned,
           (count(*) filter (where c.ai_enabled is true))::integer as ai_on
      from campaigns c
     where c.user_id = u.id and c.demo_source is null and not coalesce(c.demo_template, false)
  ) own
  order by u.created_at desc;
end;
$$;

revoke execute on function public.get_admin_users() from public, anon;
grant execute on function public.get_admin_users() to authenticated, service_role;
