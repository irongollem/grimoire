-- Migration: byok_pro_only_enforcement
-- Enforce "BYOK is PRO-only" server-side.
--
-- Until now the only thing stopping a free user from configuring their own
-- provider API key was the `v-if="!isPro"` gate in AiTab.vue. The key columns on
-- `campaigns` are written by a plain client-side update whose RLS only checks
-- ownership (auth.uid() = user_id), not plan. A free user could set
-- campaigns.openai_api_key directly via devtools / the JS client; the server
-- generators then detect the campaign key, treat the call as BYOK, and skip
-- credit deduction entirely — getting the Pro-only BYOK privilege for free.
--
-- This adds a server-side gate at the write boundary: a non-Pro owner cannot set
-- or change any of the BYOK key columns. Existing keys are untouched (so a
-- downgrade doesn't break other edits) — only newly-set/changed keys are gated.

-- ── 1. Plan helper ───────────────────────────────────────────────────────────
-- True when the user has an active/trialing subscription on a paid plan.
-- 'tester' counts as Pro. App admins are always allowed (handled in the trigger).
create or replace function public.is_user_pro(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_subscriptions s
    where s.user_id = p_user_id
      and s.status in ('active', 'trialing')
      and s.plan_id in ('pro', 'tester')
  );
$$;

revoke execute on function public.is_user_pro(uuid) from anon;
grant execute on function public.is_user_pro(uuid) to authenticated;

-- ── 2. Trigger: block BYOK key writes for non-Pro owners ─────────────────────
create or replace function public.enforce_byok_pro_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_setting_key boolean := false;
begin
  -- Detect whether this write SETS or CHANGES any key column to a non-null value.
  if tg_op = 'INSERT' then
    v_setting_key :=
      NEW.openai_api_key    is not null or
      NEW.anthropic_api_key is not null or
      NEW.gemini_api_key    is not null or
      NEW.falai_api_key     is not null;
  else -- UPDATE
    v_setting_key :=
      (NEW.openai_api_key    is not null and NEW.openai_api_key    is distinct from OLD.openai_api_key)    or
      (NEW.anthropic_api_key is not null and NEW.anthropic_api_key is distinct from OLD.anthropic_api_key) or
      (NEW.gemini_api_key    is not null and NEW.gemini_api_key    is distinct from OLD.gemini_api_key)    or
      (NEW.falai_api_key     is not null and NEW.falai_api_key     is distinct from OLD.falai_api_key);
  end if;

  if v_setting_key and not is_app_admin() and not is_user_pro(NEW.user_id) then
    raise exception 'BYOK API keys are a Pro feature'
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

create trigger campaigns_enforce_byok_pro
  before insert or update on campaigns
  for each row execute procedure enforce_byok_pro_only();
