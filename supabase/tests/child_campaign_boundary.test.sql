-- #827: a place may not sit inside a place from another campaign — and the
-- global boundary stays legal, because production depends on it.

begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('82700000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue827-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

-- One DM, two campaigns. That is the whole precondition — no attacker needed.
insert into public.campaigns (id, user_id, name) values
  ('82700000-0000-4000-8000-000000000010', '82700000-0000-4000-8000-000000000001', 'Table A'),
  ('82700000-0000-4000-8000-000000000011', '82700000-0000-4000-8000-000000000001', 'Table B');

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('82700000-0000-4000-8000-000000000020', '82700000-0000-4000-8000-000000000001', '82700000-0000-4000-8000-000000000010', 'Bandit Camp',  'dungeon'),
  ('82700000-0000-4000-8000-000000000021', '82700000-0000-4000-8000-000000000001', '82700000-0000-4000-8000-000000000011', 'Sunken Crypt', 'dungeon'),
  ('82700000-0000-4000-8000-000000000022', '82700000-0000-4000-8000-000000000001', null,                                   'Personal Manor', 'building');

insert into public.locations (id, user_id, campaign_id, name, location_type, parent_id)
values ('82700000-0000-4000-8000-000000000030', '82700000-0000-4000-8000-000000000001', '82700000-0000-4000-8000-000000000011', 'Phylactery chamber', 'room', '82700000-0000-4000-8000-000000000021');

-- ── The case that leaked ────────────────────────────────────────────────────

select throws_ok($$
  update public.locations set parent_id = '82700000-0000-4000-8000-000000000020'
   where id = '82700000-0000-4000-8000-000000000030'
$$, '23514', null,
  'a room cannot be reparented into a site belonging to another campaign');

select throws_ok($$
  insert into public.locations (user_id, campaign_id, name, location_type, parent_id)
  values ('82700000-0000-4000-8000-000000000001', '82700000-0000-4000-8000-000000000011', 'Smuggled room', 'room', '82700000-0000-4000-8000-000000000020')
$$, '23514', null,
  'nor created there in the first place');

-- ── The two shapes production actually holds, which must stay legal ─────────
--
-- 8 rows are campaign-parent/global-child and 2 are global-parent/campaign-child:
-- a DM reusing personal content inside a campaign, and the reverse. A plain
-- equality rule would strand all ten — and because the trigger fires on
-- UPDATE OF, they would have become uneditable rather than merely flagged.

select lives_ok($$
  insert into public.locations (user_id, campaign_id, name, location_type, parent_id)
  values ('82700000-0000-4000-8000-000000000001', null, 'Reused cellar', 'room', '82700000-0000-4000-8000-000000000020')
$$, 'a global room may sit inside a campaign site — personal content, reused');

select lives_ok($$
  insert into public.locations (user_id, campaign_id, name, location_type, parent_id)
  values ('82700000-0000-4000-8000-000000000001', '82700000-0000-4000-8000-000000000010', 'Guest room', 'room', '82700000-0000-4000-8000-000000000022')
$$, 'and a campaign room may sit inside a global site — the same trade, reversed');

select lives_ok($$
  insert into public.locations (user_id, campaign_id, name, location_type, parent_id)
  values ('82700000-0000-4000-8000-000000000001', '82700000-0000-4000-8000-000000000010', 'Ordinary room', 'room', '82700000-0000-4000-8000-000000000020')
$$, 'and the ordinary same-campaign case is untouched');

-- ── The region guard says the same thing on its own table ──────────────────

select throws_ok($$
  insert into public.location_map_regions (user_id, site_location_id, space_location_id, cells, label, sort_order)
  values ('82700000-0000-4000-8000-000000000001', '82700000-0000-4000-8000-000000000020', '82700000-0000-4000-8000-000000000030', '["1,1"]'::jsonb, 'Stolen', 1)
$$, '23514', null,
  'a map region cannot bind a space from another campaign');

select * from finish();
rollback;
