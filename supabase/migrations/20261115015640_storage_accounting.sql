-- Migration: storage_accounting
-- #1182: record every stored object's size and hold each account to a quiet storage ceiling.
--
-- Free accounts are limited by counting things that hold pictures, not by bytes. Two places escape that:
-- a Scriptorium book can hold any number of pictures, and a painting (#1181) makes one picture larger
-- (layers, saved versions, the user's own brushes). Until now nothing recorded how big an upload was, so
-- no per-account total existed to check against.
--
-- The ceiling is a backstop and is NEVER advertised (maintainer, 12 Nov 2026: "or people will try and
-- fill them"): not on the pricing page, not in a plan comparison, not as a meter. Free 250 MB, Pro 10 GB.
-- Reaching it refuses the next upload with a plain message; nothing is ever deleted by it.
--
-- Why a table of its own, and not a `bytes` column on image_provenance: that registry holds AI images
-- only, one row per image *stem* (the original and its size variants share it), and most uploads (a
-- drawing, a sound, a mini's model file, an imported PDF) never touch it. This table is one row per
-- stored file, whatever it is.
--
-- Who owns a file is its path: every client-writable key starts with the owner's user id
-- (_shared/storage-policy.ts), so the first path segment is the account. Shared prefixes (srd/, library/,
-- bases/) belong to no account and are not recorded.
--
-- A row is written when an upload is SIGNED (r2-sign-upload), not when the bytes land: the size is pinned
-- into the signature, so the PUT can only be exactly that long, and there is no completion call to hang a
-- second write on. An upload that was signed and never sent leaves a row with no file behind it;
-- scripts/storage-usage.ts reconciles the table against an R2 listing and removes such rows.
--
-- Because the row is written at signing and a signed URL works for fifteen minutes, a row may not shrink
-- or vanish while its signature can still be used: otherwise signing a large file, then signing the same
-- key small (or deleting it), then sending the large body to the first URL, would store bytes the total
-- never saw. So within that window a second signature keeps the larger size, and a delete only marks the
-- row released; it stops counting once the window has passed, at the account's next upload.
--
-- Both tables are deny-all: RLS on, no policy, no grant to authenticated. The edge functions write them
-- with the service role, through the three functions below, and no client reads them (there is no meter
-- to show). A policy would only widen access.

-- ── The ceiling, with the other limits ────────────────────────────────────────────────────────────────
-- In megabytes so it fits the int that private.effective_quotas merges with (10 GB in bytes does not),
-- and in plans.quotas so a young player inherits it exactly as every other limit (#928). Pro and tester
-- get a number too: a missing key means unlimited, which is not what a backstop is for. check_quota and
-- check_all_quotas walk their own lists of resources, so this key never reaches the client's quota read.
update public.plans set quotas = quotas || '{"storage_mb": 250}'::jsonb where id = 'free';
update public.plans set quotas = quotas || '{"storage_mb": 10240}'::jsonb where id <> 'free';

-- ── One row per stored file ───────────────────────────────────────────────────────────────────────────
create table public.stored_objects (
  bucket text not null,
  path text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  bytes bigint not null check (bytes > 0),
  -- When an upload of this key was last signed: the start of the window in which that URL still works.
  signed_at timestamptz not null default now(),
  -- Set by a delete that arrived inside that window; the row still counts until the window has passed.
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (bucket, path)
);

create index stored_objects_user_id_idx on public.stored_objects (user_id);

create trigger stored_objects_updated_at
  before update on public.stored_objects
  for each row execute procedure update_updated_at();

alter table public.stored_objects enable row level security;
revoke all on public.stored_objects from anon, authenticated;
grant select, insert, update, delete on public.stored_objects to service_role;

-- ── One total per account ─────────────────────────────────────────────────────────────────────────────
-- Kept by the trigger below, so the check before a signature is one row read, and so that row is
-- something to lock: two uploads signed at once for one account are checked one after the other.
create table public.storage_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bytes bigint not null default 0 check (bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger storage_usage_updated_at
  before update on public.storage_usage
  for each row execute procedure update_updated_at();

alter table public.storage_usage enable row level security;
revoke all on public.storage_usage from anon, authenticated;
grant select, insert, update, delete on public.storage_usage to service_role;

-- A definer so the total is kept whoever changed a row (the service role today), and so it can reach
-- storage_usage without that table granting anything.
create function private.tally_stored_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    -- A plain update on purpose: when the account itself is being deleted its total may already be
    -- gone, and there is then nothing to subtract from. Clamped at zero so a total that has drifted
    -- below a row's size cannot make the delete fail its bytes >= 0 check and strand the row.
    update public.storage_usage set bytes = greatest(bytes - old.bytes, 0) where user_id = old.user_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    insert into public.storage_usage (user_id, bytes)
    values (new.user_id, new.bytes)
    on conflict (user_id) do update set bytes = public.storage_usage.bytes + excluded.bytes;
  end if;
  return null;
end;
$$;

revoke execute on function private.tally_stored_object() from public, anon, authenticated;

create trigger stored_objects_tally
  after insert or update or delete on public.stored_objects
  for each row execute procedure private.tally_stored_object();

-- ── The ceiling an account is held to, in bytes. NULL means none. ─────────────────────────────────────
create function private.storage_limit_bytes(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (private.effective_quotas(p_user_id) ->> 'storage_mb')::bigint * 1024 * 1024;
$$;

revoke execute on function private.storage_limit_bytes(uuid) from public, anon, authenticated;

-- How long a signed upload URL works (UPLOAD_URL_TTL_SECONDS in _shared/r2/api.ts is 900), plus a margin.
create function private.storage_signature_window()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '16 minutes' $$;

revoke execute on function private.storage_signature_window() from public, anon, authenticated;

-- ── Record a set of files, refusing first when they would take the account past its ceiling ───────────
-- p_objects is [{"path": text, "size": bigint}, ...], all in p_bucket, every path under p_user_id's folder.
-- All-or-nothing, like the signature it precedes: either every file is recorded or none is.
--
-- p_enforce is false for writes nothing should refuse: bytes the server made itself (a generated image
-- the user has already paid credits for), an app admin's uploads, and the backfill. Those are counted
-- and never checked. NULL enforces.
--
-- Only growth is refused. Writing over a key with the same or fewer bytes always passes, so an account
-- that is over (a downgrade from Pro, or the backfill finding it there) can still replace and shrink.
--
-- An unknown account answers 'skipped' and records nothing: the backfill meets folders whose account is
-- long gone, and the foreign key would otherwise fail the whole batch.
--
-- Service role only. It takes the account as an argument, which is right for the one caller that has
-- already verified a JWT and wrong for anyone else, so no client role may execute it. It still refuses a
-- path outside that account's folder, so a caller's mistake cannot move a file between accounts.
create function public.reserve_storage(p_user_id uuid, p_bucket text, p_objects jsonb, p_enforce boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used  bigint;
  v_old   bigint;
  v_new   bigint;
  v_limit bigint;
  v_live  timestamptz := now() - private.storage_signature_window();
begin
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return jsonb_build_object('allowed', true, 'skipped', true);
  end if;

  if p_objects is null or jsonb_typeof(p_objects) <> 'array' then
    raise exception 'p_objects must be an array' using errcode = '22023';
  end if;
  if exists (
       select 1 from jsonb_array_elements(p_objects) o
        where jsonb_typeof(o -> 'path') is distinct from 'string'
           or coalesce(o ->> 'size', '') !~ '^[0-9]{1,18}$'
           or (o ->> 'size')::bigint <= 0
           or lower(split_part(o ->> 'path', '/', 1)) <> p_user_id::text
     )
     or (select count(distinct o ->> 'path') <> count(*) from jsonb_array_elements(p_objects) o) then
    raise exception 'each object needs a path under the account''s folder and a positive size, once'
      using errcode = '22023';
  end if;

  -- The account's total is locked first, here and in release_storage, so the two cannot deadlock.
  insert into public.storage_usage (user_id) values (p_user_id) on conflict (user_id) do nothing;
  perform 1 from public.storage_usage u where u.user_id = p_user_id for update;

  -- Files deleted while their signature still worked stop counting now that it no longer does.
  delete from public.stored_objects s
   where s.user_id = p_user_id and s.released_at is not null and s.signed_at <= v_live;

  select u.bytes into v_used from public.storage_usage u where u.user_id = p_user_id;

  -- What these keys count for today, and what they will count for: a key whose earlier signature may
  -- still be used keeps the larger of the two sizes.
  select coalesce(sum(s.bytes), 0),
         coalesce(sum(case when s.signed_at > v_live then greatest(s.bytes, o.size) else o.size end), 0)
    into v_old, v_new
    from (select e ->> 'path' as path, (e ->> 'size')::bigint as size
            from jsonb_array_elements(p_objects) e) o
    left join public.stored_objects s on s.bucket = p_bucket and s.path = o.path;

  if coalesce(p_enforce, true) and v_new > v_old then
    v_limit := private.storage_limit_bytes(p_user_id);
    if v_limit is not null and v_used - v_old + v_new > v_limit then
      return jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit);
    end if;
  end if;

  insert into public.stored_objects (bucket, path, user_id, bytes)
  select p_bucket, e ->> 'path', p_user_id, (e ->> 'size')::bigint
    from jsonb_array_elements(p_objects) e
  on conflict (bucket, path) do update
    set bytes = case when public.stored_objects.signed_at > v_live
                     then greatest(public.stored_objects.bytes, excluded.bytes)
                     else excluded.bytes end,
        signed_at = now(),
        released_at = null;

  return jsonb_build_object('allowed', true);
end;
$$;

revoke execute on function public.reserve_storage(uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.reserve_storage(uuid, text, jsonb, boolean) to service_role;

-- ── Forget files that were deleted ────────────────────────────────────────────────────────────────────
-- A path that was never recorded is not an error: deletes fire optimistically and may run twice.
-- A file whose signature may still be used is only marked (see the header); any other is forgotten now.
create function public.release_storage(p_bucket text, p_paths text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live timestamptz := now() - private.storage_signature_window();
begin
  -- Totals first and in a fixed order, as reserve_storage does.
  perform 1
     from public.storage_usage u
    where u.user_id in (select s.user_id from public.stored_objects s
                         where s.bucket = p_bucket and s.path = any (p_paths))
    order by u.user_id
      for update;

  delete from public.stored_objects s
   where s.bucket = p_bucket and s.path = any (p_paths) and s.signed_at <= v_live;

  update public.stored_objects s
     set released_at = now()
   where s.bucket = p_bucket and s.path = any (p_paths) and s.released_at is null;
end;
$$;

revoke execute on function public.release_storage(text, text[]) from public, anon, authenticated;
grant execute on function public.release_storage(text, text[]) to service_role;
