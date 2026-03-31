-- AI assistant settings per campaign (DM-only, protected by existing RLS)
alter table campaigns
  add column openai_api_key   text,
  add column ai_setting_prompt text;
