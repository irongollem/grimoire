-- Migration: enforce_quota_triggers
-- BEFORE INSERT triggers as hard DB-level backstop for all 6 quota-gated tables.
-- The UI checks quota via useQuota; these triggers catch any bypass attempt.

create or replace function public.enforce_quota()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  result jsonb;
begin
  result := check_quota(TG_TABLE_NAME);
  if not (result ->> 'allowed')::boolean then
    raise exception 'quota_exceeded'
      using detail = TG_TABLE_NAME,
            hint   = 'Upgrade to Pro DM to create more ' || TG_TABLE_NAME;
  end if;
  return new;
end;
$$;

create trigger campaigns_enforce_quota
  before insert on public.campaigns
  for each row execute procedure enforce_quota();

create trigger npcs_enforce_quota
  before insert on public.npcs
  for each row execute procedure enforce_quota();

create trigger monsters_enforce_quota
  before insert on public.monsters
  for each row execute procedure enforce_quota();

create trigger encounters_enforce_quota
  before insert on public.encounters
  for each row execute procedure enforce_quota();

create trigger scriptorium_documents_enforce_quota
  before insert on public.scriptorium_documents
  for each row execute procedure enforce_quota();

create trigger notes_enforce_quota
  before insert on public.notes
  for each row execute procedure enforce_quota();
