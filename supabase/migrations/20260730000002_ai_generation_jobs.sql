-- Migration: ai_generation_jobs
--
-- Durable, provider-agnostic work records for AI output that is not itself an
-- entity yet. A worker must persist the result/artifact before it settles the
-- accompanying credit reservation. The browser can then leave, reload, or
-- reconnect and still discover the completed draft by job id.

create table public.ai_generation_jobs (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  campaign_id           uuid not null references public.campaigns(id) on delete cascade,
  generator_type        text not null,
  status                text not null default 'queued'
                        check (status in ('queued', 'running', 'settling', 'ready', 'failed')),
  request_json          jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(request_json) = 'object'),
  result_json           jsonb,
  artifact_url          text,
  artifact_storage_path text,
  artifact_mime_type    text,
  artifact_metadata     jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(artifact_metadata) = 'object'),
  -- Reservation ids and accounting details survive an isolate crash so cleanup
  -- can release the hold. This must never contain provider/API credentials.
  billing_context       jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(billing_context) = 'object'),
  error                 text,
  idempotency_key       text,
  stale_after           timestamptz not null default (now() + interval '30 minutes'),
  started_at            timestamptz,
  completed_at          timestamptz,
  consumed_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- A ready record must contain something the owner can recover. Failed jobs
  -- retain their error instead, and queued/running rows intentionally have
  -- neither until the worker settles them.
  check (
    status <> 'ready'
    or result_json is not null
    or artifact_url is not null
    or artifact_storage_path is not null
  ),
  check (status <> 'failed' or error is not null)
);

create index ai_generation_jobs_owner_created_idx
  on public.ai_generation_jobs (user_id, created_at desc);
create index ai_generation_jobs_campaign_created_idx
  on public.ai_generation_jobs (campaign_id, created_at desc);
create index ai_generation_jobs_active_stale_idx
  on public.ai_generation_jobs (stale_after)
  where status in ('queued', 'running', 'settling');
create unique index ai_generation_jobs_owner_idempotency_idx
  on public.ai_generation_jobs (user_id, generator_type, idempotency_key);

create trigger ai_generation_jobs_updated_at
  before update on public.ai_generation_jobs
  for each row execute procedure public.update_updated_at();

alter table public.ai_generation_jobs enable row level security;

-- Jobs are deliberately server-created and server-settled. The client only
-- reads its own records; acknowledgement is the narrow RPC below so it cannot
-- alter a result, status, ownership, or billing context.
create policy "ai_generation_jobs_select_own" on public.ai_generation_jobs
  for select using (auth.uid() = user_id);

create or replace function public.acknowledge_ai_generation_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_generation_jobs
  set consumed_at = coalesce(consumed_at, now())
  where id = p_job_id
    and user_id = auth.uid()
    and status = 'ready';

  if not found then
    raise exception 'AI generation job not found or is not ready';
  end if;
end;
$$;

revoke all on function public.acknowledge_ai_generation_job(uuid) from public;
grant execute on function public.acknowledge_ai_generation_job(uuid) to authenticated;

-- The worker has already made a paid provider call by the time it reaches this
-- function. Locking the job makes the ledger write, reservation release and
-- owner-visible readiness one durable unit. Replays are intentionally harmless.
create or replace function public.settle_ai_generation_job(
  p_job_id uuid,
  p_result_json jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.ai_generation_jobs%rowtype;
  v_reservation_ids uuid[];
  v_billing jsonb;
  v_spend jsonb;
begin
  select * into v_job from public.ai_generation_jobs where id = p_job_id for update;
  if not found then
    raise exception 'AI generation job not found';
  end if;
  if v_job.status = 'ready' then
    return;
  end if;
  if v_job.status <> 'settling' then
    raise exception 'AI generation job is not ready to settle';
  end if;
  if v_job.artifact_url is null and v_job.artifact_storage_path is null then
    raise exception 'AI generation job has no persisted artifact';
  end if;

  v_billing := coalesce(v_job.billing_context, '{}'::jsonb);
  select coalesce(array_agg(value::uuid), '{}'::uuid[])
    into v_reservation_ids
    from jsonb_array_elements_text(coalesce(v_billing->'reservation_ids', '[]'::jsonb));

  if coalesce((v_billing->>'is_byok')::boolean, false) then
    insert into public.ai_credit_ledger (user_id, delta, reason, is_byok, model, provider, image_count)
    values (
      v_job.user_id,
      0,
      coalesce(v_billing->>'generation_type', v_job.generator_type),
      true,
      v_billing->'log'->>'model',
      v_billing->'log'->>'provider',
      coalesce((v_billing->'log'->>'image_count')::int, 1)
    );
  elsif coalesce((v_billing->>'cost')::numeric, 0) > 0 then
    v_spend := public.spend_credits(
      v_job.user_id,
      coalesce(v_billing->>'generation_type', v_job.generator_type),
      (v_billing->>'cost')::numeric,
      coalesce(v_billing->'log', '{}'::jsonb),
      true
    );
    if not coalesce((v_spend->>'ok')::boolean, false) then
      raise exception 'Could not settle AI generation credits';
    end if;
  end if;

  if cardinality(v_reservation_ids) > 0 then
    perform public.release_credits(v_reservation_ids);
  end if;

  update public.ai_generation_jobs
  set status = 'ready',
      result_json = p_result_json,
      error = null,
      completed_at = now(),
      billing_context = v_billing || jsonb_build_object('settlement', 'recorded')
  where id = p_job_id;
end;
$$;

revoke all on function public.settle_ai_generation_job(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.settle_ai_generation_job(uuid, jsonb) to service_role;

-- Music is the first artifact-backed finalizer. Keeping the idempotent sounds
-- upsert in this transaction means a usable row can never survive while the
-- associated job is failed/released as though the generation had not worked.
create or replace function public.finalize_music_generation_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.ai_generation_jobs%rowtype;
  v_request jsonb;
begin
  select * into v_job from public.ai_generation_jobs where id = p_job_id for update;
  if not found then
    raise exception 'AI generation job not found';
  end if;
  if v_job.status = 'ready' then
    return;
  end if;
  if v_job.generator_type <> 'music' or v_job.status <> 'settling' then
    raise exception 'AI generation job is not a settling music job';
  end if;
  if v_job.artifact_storage_path is null then
    raise exception 'Music job has no persisted storage path';
  end if;

  v_request := v_job.request_json;
  insert into public.sounds (
    id, user_id, campaign_id, name, category, source_type, file_url,
    storage_path, page_id, tags, sort_order, attribution, attribution_url,
    artist, thumbnail_url
  ) values (
    v_job.id,
    v_job.user_id,
    v_job.campaign_id,
    v_request->>'name',
    v_request->>'category',
    'upload',
    coalesce(v_job.artifact_url, ''),
    v_job.artifact_storage_path,
    nullif(v_request->>'page_id', '')::uuid,
    '{}'::text[], 0, null, null, 'Grimoire AI', null
  ) on conflict (id) do update set
    file_url = excluded.file_url,
    storage_path = excluded.storage_path,
    updated_at = now();

  perform public.settle_ai_generation_job(
    v_job.id,
    jsonb_build_object(
      'campaign_id', v_job.campaign_id,
      'name', v_request->>'name',
      'category', v_request->>'category',
      'page_id', v_request->'page_id',
      'source_type', 'upload',
      'artist', 'Grimoire AI',
      'sound_id', v_job.id
    )
  );
end;
$$;

revoke all on function public.finalize_music_generation_job(uuid) from public, anon, authenticated;
grant execute on function public.finalize_music_generation_job(uuid) to service_role;

-- Used by explicit worker failures and stale cleanup. Pending holds are removed
-- in the same transaction as the terminal state, so an abandoned job cannot
-- silently reduce a user's balance indefinitely.
create or replace function public.fail_ai_generation_job(p_job_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.ai_generation_jobs%rowtype;
  v_reservation_ids uuid[];
  v_billing jsonb;
begin
  select * into v_job from public.ai_generation_jobs where id = p_job_id for update;
  if not found or v_job.status in ('ready', 'failed') then
    return;
  end if;

  v_billing := coalesce(v_job.billing_context, '{}'::jsonb);
  select coalesce(array_agg(value::uuid), '{}'::uuid[])
    into v_reservation_ids
    from jsonb_array_elements_text(coalesce(v_billing->'reservation_ids', '[]'::jsonb));
  if cardinality(v_reservation_ids) > 0 then
    perform public.release_credits(v_reservation_ids);
  end if;

  update public.ai_generation_jobs
  set status = 'failed',
      error = left(coalesce(p_error, 'Generation failed.'), 1000),
      completed_at = now(),
      billing_context = v_billing || jsonb_build_object('settlement', 'released')
  where id = p_job_id;
end;
$$;

revoke all on function public.fail_ai_generation_job(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_ai_generation_job(uuid, text) to service_role;

-- A job row must be visible to its owner over Postgres Changes so the shared
-- waiter can use Realtime as its fast path and HTTP only for missed events.
do $$
begin
  alter publication supabase_realtime add table public.ai_generation_jobs;
exception when duplicate_object then
  null;
end $$;

-- A killed background isolate must not leave an owner-facing spinner forever.
-- Workers may choose a longer stale_after for legitimate slow providers.
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'fail-stale-ai-generation-jobs') then
    perform cron.unschedule('fail-stale-ai-generation-jobs');
  end if;
end $$;

select cron.schedule(
  'fail-stale-ai-generation-jobs',
  '*/5 * * * *',
  $$
    do $cleanup$
    declare v_job uuid;
    begin
      for v_job in
        select id from public.ai_generation_jobs
        where status in ('queued', 'running') and stale_after <= now()
      loop
        perform public.fail_ai_generation_job(
          v_job,
          'Generation timed out before the worker finished. Please try again.'
        );
      end loop;
      for v_job in
        select id from public.ai_generation_jobs
        where status = 'settling' and generator_type = 'music' and stale_after <= now()
      loop
        begin
          perform public.finalize_music_generation_job(v_job);
        exception when others then
          -- Keep the artifact and reservation intact for the next finalizer
          -- retry; releasing it would make successful provider work free.
          raise warning 'Could not finalize stale music generation %: %', v_job, sqlerrm;
        end;
      end loop;
      for v_job in
        select id from public.ai_generation_jobs
        where status = 'settling' and generator_type <> 'music' and stale_after <= now()
      loop
        perform public.fail_ai_generation_job(
          v_job,
          'Generation timed out before the worker finished. Please try again.'
        );
      end loop;
    end $cleanup$;
  $$
);
