-- Migration: marketing_plans_rebuild_webhook
-- Rebuild the static marketing site (which bakes pricing at build time) whenever
-- a plan's pricing-relevant fields change. Fires a Vercel deploy hook via pg_net.
-- The hook URL is NOT stored here (this repo is public) — it lives in Supabase
-- Vault under the name 'marketing_deploy_hook' and is read at trigger time.

-- pg_net: async HTTP from Postgres (installs the `net` schema).
create extension if not exists pg_net;

create or replace function public.notify_marketing_rebuild()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hook_url text;
begin
  select decrypted_secret
    into hook_url
    from vault.decrypted_secrets
   where name = 'marketing_deploy_hook'
   limit 1;

  -- No hook configured (e.g. local/branch DBs) → no-op, never block the write.
  if hook_url is null then
    return new;
  end if;

  perform net.http_post(
    url     := hook_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('trigger', 'plans_change', 'plan_id', new.id)
  );

  return new;
end;
$$;

comment on function public.notify_marketing_rebuild() is
  'AFTER UPDATE trigger on plans: POSTs the Vercel deploy hook (Vault: marketing_deploy_hook) to rebuild the marketing site so its build-time-baked pricing stays current.';

-- Only fire when something the pricing page actually renders has changed —
-- not on every touch (e.g. updated_at bumps), to avoid needless rebuilds.
create trigger plans_marketing_rebuild
  after update on public.plans
  for each row
  when (
    old.stripe_monthly_unit_amount        is distinct from new.stripe_monthly_unit_amount
    or old.stripe_annual_unit_amount      is distinct from new.stripe_annual_unit_amount
    or old.stripe_currency                is distinct from new.stripe_currency
    or old.stripe_monthly_currency_options is distinct from new.stripe_monthly_currency_options
    or old.stripe_annual_currency_options  is distinct from new.stripe_annual_currency_options
    or old.quotas                         is distinct from new.quotas
    or old.monthly_credits                is distinct from new.monthly_credits
  )
  execute procedure public.notify_marketing_rebuild();
