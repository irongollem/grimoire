-- Migration: waitlist_disposable_domains
-- Silently drop pro_waitlist signups from disposable/trashmail providers.
-- A BEFORE INSERT trigger returns null for blocked domains, so PostgREST still
-- reports success (201) — the sender learns nothing, no row is stored. Catches
-- direct API posts too, which the marketing form's client checks never could.

create table disposable_email_domains (
  domain text primary key check (domain = lower(domain))
);

-- Well-known disposable providers. Extend from the SQL editor as new ones
-- show up in the wild (subdomains are matched automatically).
insert into disposable_email_domains (domain) values
  ('mailinator.com'),
  ('guerrillamail.com'),
  ('guerrillamail.net'),
  ('guerrillamail.org'),
  ('guerrillamail.biz'),
  ('guerrillamailblock.com'),
  ('sharklasers.com'),
  ('grr.la'),
  ('pokemail.net'),
  ('spam4.me'),
  ('10minutemail.com'),
  ('10minutemail.net'),
  ('temp-mail.org'),
  ('temp-mail.io'),
  ('tempmail.com'),
  ('tempmailo.com'),
  ('tempr.email'),
  ('tmpmail.org'),
  ('tmpmail.net'),
  ('mytemp.email'),
  ('yopmail.com'),
  ('yopmail.fr'),
  ('yopmail.net'),
  ('trashmail.com'),
  ('trashmail.de'),
  ('trashmail.me'),
  ('getnada.com'),
  ('maildrop.cc'),
  ('dispostable.com'),
  ('mintemail.com'),
  ('mohmal.com'),
  ('throwawaymail.com'),
  ('fakeinbox.com'),
  ('mailnesia.com'),
  ('mailcatch.com'),
  ('tempinbox.com'),
  ('discard.email'),
  ('emailondeck.com'),
  ('mail-temp.com'),
  ('moakt.com'),
  ('mailsac.com'),
  ('inboxkitten.com'),
  ('1secmail.com'),
  ('1secmail.org'),
  ('1secmail.net'),
  ('dropmail.me'),
  ('emltmp.com'),
  ('mail.tm'),
  ('mail.gw'),
  ('mailexpire.com');

-- RLS on, no policies: invisible to anon/authenticated. The trigger reads it
-- as security definer; admins manage it via the dashboard (service role).
alter table disposable_email_domains enable row level security;

create or replace function public.reject_disposable_waitlist_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_domain text := split_part(lower(new.email), '@', 2);
begin
  if exists (
    select 1
      from public.disposable_email_domains d
     where email_domain = d.domain
        or email_domain like '%.' || d.domain
  ) then
    return null; -- silently drop: PostgREST still answers 201, nothing stored
  end if;
  return new;
end;
$$;

comment on function public.reject_disposable_waitlist_email() is
  'BEFORE INSERT on pro_waitlist: drops rows from disposable_email_domains providers without erroring, so senders cannot probe the blocklist.';

create trigger pro_waitlist_disposable_guard
  before insert on pro_waitlist
  for each row execute procedure public.reject_disposable_waitlist_email();
