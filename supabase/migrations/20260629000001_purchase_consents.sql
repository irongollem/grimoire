-- Migration: purchase_consents
-- Records the EU immediate-performance / right-of-withdrawal consent the buyer
-- gives at each paid purchase. Stripe's hosted Checkout can't render a second
-- consent checkbox beyond Terms of Service, so the withdrawal waiver is captured
-- as its own timestamped checkbox in the app (pre-checkout) and recorded here
-- (server timestamp = authoritative) for audit / dispute evidence — separate
-- from the Stripe-recorded ToS acceptance.

create table purchase_consents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  purpose           text not null check (purpose in ('subscription', 'credit_pack')),
  consent_version   text not null,
  stripe_session_id text,
  created_at        timestamptz not null default now()
);

create index purchase_consents_user_idx on purchase_consents (user_id, created_at desc);

alter table purchase_consents enable row level security;

-- Append-only audit: rows are written only by the checkout edge functions
-- (service role, bypasses RLS). Readable by the user (their own, for GDPR
-- access) and by admins. No client insert/update/delete — consent can't be forged.
create policy "purchase_consents_select" on purchase_consents
  for select using (auth.uid() = user_id or is_app_admin());
