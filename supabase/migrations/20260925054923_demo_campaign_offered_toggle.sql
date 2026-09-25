-- The demo campaign can be published without being offered (#912).
--
-- Publishing and offering were one step in 20260925002215: the moment an admin
-- published a template, every new DM saw it. That leaves no way to build the
-- template in production, load it, and look at it through a user's eyes while
-- it is still unfinished. So they are two:
--
--   * publish_demo_version()  -- "this campaign is the demo, at this version".
--                                Unchanged, except that moving the template to
--                                another campaign takes the offer down with it.
--   * set_demo_offered(bool)  -- "new users are offered it". Off by default.
--
-- While a template is published but not offered, admins still see and can load
-- it (that is the point: testing the real copy in the real app), and everyone
-- else sees exactly what they saw before anything was published.

alter table public.campaigns
  add column demo_offered boolean not null default false;

comment on column public.campaigns.demo_offered is
  'On the demo template: whether new users are offered it. Off while the template is a work in progress; admins can load it either way. Set only by set_demo_offered().';

-- The guard from 20260925002215, now covering the new flag as well: a client
-- write can no more switch the offer on than it can make its campaign the
-- template.
create or replace function public.guard_campaign_demo_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.demo_source   := null;
      new.demo_template := false;
      new.demo_version  := null;
      new.demo_offered  := false;
    else
      new.demo_source   := old.demo_source;
      new.demo_template := old.demo_template;
      new.demo_version  := old.demo_version;
      new.demo_offered  := old.demo_offered;
    end if;
  end if;
  return new;
end;
$$;

-- Unchanged from 20260925002215 except the offer check. The refusal a
-- non-admin gets for an unoffered demo is word for word the one for no demo at
-- all: an unfinished template is not something to advertise.
create or replace function public.load_demo_campaign(p_replace boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid      uuid := auth.uid();
  v_template uuid;
  v_version  text;
  v_offered  boolean;
  v_existing uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_replace is null then
    raise exception 'p_replace must be true or false';
  end if;

  select id, demo_version, demo_offered into v_template, v_version, v_offered
    from public.campaigns
   where demo_template;
  if v_template is null or v_version is null
     or (not v_offered and not coalesce(private.is_app_admin(), false)) then
    raise exception 'No demo campaign has been published' using errcode = 'P0002';
  end if;

  select id into v_existing
    from public.campaigns
   where user_id = v_uid and demo_source is not null;

  if v_existing is not null then
    if not p_replace then
      raise exception 'You already have the demo campaign' using errcode = '23505';
    end if;
    perform private.purge_demo_campaign(v_existing);
  end if;

  return private.copy_demo_template(v_template, v_uid, v_version);
end;
$$;

-- An admin sees the template whether or not it is offered, plus its name and
-- the flag, which is what the Admin -> Content switch needs. Everyone else sees
-- a published-and-offered demo, or nothing -- never the template's id or name.
create or replace function public.get_demo_status()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid      uuid := auth.uid();
  v_admin    boolean;
  v_version  text;
  v_offered  boolean;
  v_name     text;
  v_visible  boolean;
  v_demo_id  uuid;
  v_loaded   text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_admin := coalesce(private.is_app_admin(), false);

  select demo_version, demo_offered, name into v_version, v_offered, v_name
    from public.campaigns where demo_template;
  v_visible := v_version is not null and (coalesce(v_offered, false) or v_admin);

  select id, demo_source into v_demo_id, v_loaded
    from public.campaigns
   where user_id = v_uid and demo_source is not null;

  return jsonb_build_object(
    'published',        v_visible,
    'version',          case when v_visible then v_version end,
    'offered',          coalesce(v_offered, false) and v_version is not null,
    'template_name',    case when v_admin then v_name end,
    'demo_campaign_id', v_demo_id,
    'loaded_version',   v_loaded
  );
end;
$$;

-- Unchanged from 20260925002215 except that the previous template, when there
-- is one and it is a different campaign, loses its offer along with its flag.
-- The newly published campaign keeps whatever demo_offered it had -- false for
-- a first publish -- so switching which campaign is the demo never puts an
-- unreviewed one in front of users.
create or replace function public.publish_demo_version(p_campaign_id uuid)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid     uuid := auth.uid();
  v_owner   uuid;
  v_source  text;
  v_version text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not coalesce(private.is_app_admin(), false) then
    raise exception 'Not authorized';
  end if;

  select user_id, demo_source into v_owner, v_source
    from public.campaigns where id = p_campaign_id;
  if v_owner is null then
    raise exception 'Campaign not found';
  end if;
  if v_owner <> v_uid then
    raise exception 'Only your own campaign can be published as the demo';
  end if;
  if v_source is not null then
    raise exception 'A copy of the demo cannot itself be published as the demo';
  end if;

  begin
    perform private.copy_demo_template(p_campaign_id, v_uid, null);
    raise exception using errcode = 'DMDRY', message = 'demo dry run complete';
  exception when sqlstate 'DMDRY' then
    null;
  end;

  v_version := to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  update public.campaigns
     set demo_template = false, demo_version = null, demo_offered = false
   where demo_template and id <> p_campaign_id;
  update public.campaigns
     set demo_template = true, demo_version = v_version
   where id = p_campaign_id;

  return v_version;
end;
$$;

-- The switch itself. Admin only, and it acts on the one template rather than
-- a caller-supplied id, so there is nothing to point it at.
create or replace function public.set_demo_offered(p_offered boolean)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_template uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not coalesce(private.is_app_admin(), false) then
    raise exception 'Not authorized';
  end if;
  if p_offered is null then
    raise exception 'p_offered must be true or false';
  end if;

  select id into v_template from public.campaigns where demo_template;
  if v_template is null then
    raise exception 'No demo campaign has been published' using errcode = 'P0002';
  end if;

  update public.campaigns set demo_offered = p_offered where id = v_template;
  return p_offered;
end;
$$;

revoke execute on function public.load_demo_campaign(boolean) from public, anon;
grant  execute on function public.load_demo_campaign(boolean) to authenticated, service_role;
revoke execute on function public.get_demo_status() from public, anon;
grant  execute on function public.get_demo_status() to authenticated, service_role;
revoke execute on function public.publish_demo_version(uuid) from public, anon;
grant  execute on function public.publish_demo_version(uuid) to authenticated, service_role;
revoke execute on function public.set_demo_offered(boolean) from public, anon;
grant  execute on function public.set_demo_offered(boolean) to authenticated, service_role;
