-- Migration: platform_api_keys
-- Global platform-level encrypted API keys, used as fallback when campaigns have no BYOK key

create table platform_api_keys (
  provider     text primary key,  -- 'openai' | 'anthropic' | 'gemini' | 'falai'
  encrypted_key text not null,
  updated_at   timestamptz not null default now()
);

create trigger platform_api_keys_updated_at
  before update on platform_api_keys
  for each row execute procedure update_updated_at();

alter table platform_api_keys enable row level security;

-- Only admins can read or modify platform keys
create policy "platform_api_keys_select" on platform_api_keys
  for select using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "platform_api_keys_insert" on platform_api_keys
  for insert with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "platform_api_keys_update" on platform_api_keys
  for update using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "platform_api_keys_delete" on platform_api_keys
  for delete using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
