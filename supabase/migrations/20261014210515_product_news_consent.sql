-- Opt-in to news and updates by email.
--
-- Until now Grimoire sent no news at all: the only non-transactional email was
-- the individual "how did it go?" question (legitimate-interests.md §2), and
-- the privacy policy promises those carry no pitch. Telling people what is new
-- is direct marketing, which for a Dutch sender needs prior consent
-- (Telecommunicatiewet 11.7); the existing-customer exemption is built around a
-- sale and so does not reach free accounts. So news goes only to accounts that
-- opted in, and the opt-in is a box the person ticks: unticked by default,
-- because a pre-ticked box is not consent (CJEU C-673/17, Planet49).
--
-- The choice lives on notification_preferences beside the other email toggles,
-- with one difference that matters: a missing row means OFF for this column,
-- where it means ON for the transactional ones. The column default says so.
--
-- product_news_consented_at is the proof the consent rests on: when it was
-- given. It is stamped by the server, never taken from the client, and cleared
-- when the consent is withdrawn, since nothing relies on it after that.

alter table public.notification_preferences
  add column email_product_news boolean not null default false,
  add column product_news_consented_at timestamptz;

create or replace function private.stamp_product_news_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email_product_news then
    if tg_op = 'INSERT' or not old.email_product_news then
      new.product_news_consented_at := now();
    else
      new.product_news_consented_at := old.product_news_consented_at;
    end if;
  else
    new.product_news_consented_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function private.stamp_product_news_consent() from public, anon, authenticated;

create trigger notification_preferences_stamp_product_news
  before insert or update on public.notification_preferences
  for each row execute procedure private.stamp_product_news_consent();

-- ── At signup ───────────────────────────────────────────────────────────────
-- There is no session at signup (the address is not confirmed yet), so the
-- ticked box rides in the signup metadata like the Terms consent does, and is
-- recorded here. A separate trigger rather than another clause in the
-- subscription trigger, so this does not restate that function's body.
-- Child accounts are made by the child-account function, whose metadata never
-- carries the flag, so a young player can never be opted in.
create or replace function private.record_signup_product_news()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'product_news', '') = 'true' then
    insert into public.notification_preferences (user_id, email_product_news)
    values (new.id, true)
    on conflict (user_id) do update set email_product_news = true;
  end if;
  return new;
end;
$$;

revoke execute on function private.record_signup_product_news() from public, anon, authenticated;

create trigger on_auth_user_created_product_news
  after insert on auth.users
  for each row execute procedure private.record_signup_product_news();

-- ── The admin list learns who opted in ──────────────────────────────────────
-- Body as 20261014194554 plus product_news, so the outreach draft can include
-- what is new only for accounts that asked to hear it.
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
  campaigns_playing         integer,
  is_child                  boolean,
  exempt_reason             text,
  retention_state           text,
  inactivity_notice_sent_at timestamptz,
  product_news              boolean
)
language plpgsql
security definer
set search_path = public
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
    (select count(*)::integer from campaigns c
      where c.user_id = u.id and c.demo_source is null and not coalesce(c.demo_template, false))
                                                  as campaigns_owned,
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
  order by u.created_at desc;
end;
$$;

revoke execute on function public.get_admin_users() from public, anon;
grant execute on function public.get_admin_users() to authenticated, service_role;
