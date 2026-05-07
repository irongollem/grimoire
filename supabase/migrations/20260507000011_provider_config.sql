-- Migration: provider_config
-- Per-provider AI model config: model name, text/image multipliers, enabled flag

create table provider_config (
  provider          text primary key,  -- 'openai' | 'anthropic' | 'gemini' | 'falai'
  text_model        text,              -- e.g. 'gpt-4o-mini', 'claude-haiku-3-20240307'
  image_model       text,              -- e.g. 'gpt-image-1.5', 'fal-ai/flux/dev'
  text_multiplier   numeric(4,2),      -- cost multiplier vs baseline (null = not offered)
  image_multiplier  numeric(4,2),
  text_enabled      boolean not null default false,
  image_enabled     boolean not null default false,
  updated_at        timestamptz not null default now()
);

create trigger provider_config_updated_at
  before update on provider_config
  for each row execute procedure update_updated_at();

alter table provider_config enable row level security;

-- All authenticated users can read (needed for cost display in generator panels)
create policy "provider_config_select" on provider_config
  for select using (auth.uid() is not null);

create policy "provider_config_insert" on provider_config
  for insert with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "provider_config_update" on provider_config
  for update using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "provider_config_delete" on provider_config
  for delete using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

insert into provider_config (provider, text_model, image_model, text_multiplier, image_multiplier, text_enabled, image_enabled) values
  ('openai',    'gpt-4o-mini',             'gpt-image-1.5',  1.0,  1.0,  true,  true),
  ('anthropic', 'claude-haiku-3-20240307', null,             2.0,  null, false, false),
  ('gemini',    'gemini-2.5-flash',        null,             3.8,  null, false, false),
  ('falai',     null,                      'fal-ai/flux/dev', null, 1.0,  false, true);
