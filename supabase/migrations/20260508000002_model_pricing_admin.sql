-- Migration: model_pricing_admin
-- Admin write RLS on ai_model_pricing + model_type discriminator + last_verified_at

-- 1. Normalise provider names: 'google' → 'gemini' to match provider_config
update ai_model_pricing set provider = 'gemini' where provider = 'google';

-- 2. Add model_type discriminator so the admin UI knows which cost fields to show
alter table ai_model_pricing
  add column model_type text not null default 'text'
    check (model_type in ('text', 'image', 'audio'));

update ai_model_pricing
  set model_type = 'image'
  where cost_per_image_usd is not null and model not like 'lyria%';

-- Lyria uses cost_per_image_usd as a flat per-generation rate, not per-image
update ai_model_pricing
  set model_type = 'audio'
  where model like 'lyria%';

-- 3. Staleness tracking — lets the admin see when a price was last cross-checked
alter table ai_model_pricing
  add column last_verified_at timestamptz;

-- 4. Admin write policies
create policy "ai_model_pricing_admin_insert"
  on ai_model_pricing for insert
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "ai_model_pricing_admin_update"
  on ai_model_pricing for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "ai_model_pricing_admin_delete"
  on ai_model_pricing for delete
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
