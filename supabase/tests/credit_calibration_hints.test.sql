begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

-- Cover for #773 (20260826224028). The panel's job is to warn in BOTH
-- directions — too cheap and too dear — so pricing stays fun and fair. That only
-- works if the reference point is the fair price rather than cost, and if the
-- unit is what we charge for rather than what we call.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('93000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'calib@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

-- Fixed economics so the assertions do not move with a config edit.
insert into public.app_settings (key, value)
values ('credit_calibration', jsonb_build_object(
  'usd_per_eur', 1.08, 'vat_rate', 0.21, 'payment_fee_rate', 0.015,
  'payment_fee_fixed_eur', 0.25, 'target_margin', 2.0))
on conflict (key) do update set value = excluded.value;

-- 25 portraits at 1024x1536: 0.353c text + 2.390c image-in + 21.072c out
-- = 23.8154c each. One render, one charge.
insert into public.ai_credit_ledger
  (user_id, delta, reason, model, provider, quality, size,
   input_tokens, input_image_tokens, output_tokens, image_count)
select '93000000-0000-4000-8000-000000000001', -75, 'entity_image', 'gpt-image-2', 'openai',
       'high', '1024x1536', 706, 2988, 7024, 1
from generate_series(1, 25);

-- 25 tile slots, each charged once and generated four times: one delta -12 row
-- plus three delta-0 rows of real spend, exactly as recordFreeGeneration writes
-- them. 0.919c per render at 1024x1024.
insert into public.ai_credit_ledger
  (user_id, delta, reason, model, provider, quality, size,
   input_tokens, input_image_tokens, output_tokens, image_count)
select '93000000-0000-4000-8000-000000000001',
       case when attempt = 1 then -12 else 0 end,
       'tile_pack_generation', 'gpt-image-2', 'openai', 'low', '1024x1024', 262, 250, 196, 1
from generate_series(1, 25) slot, generate_series(1, 4) attempt;

-- A BYOK render: the user paid that provider bill, so it is neither our cost nor
-- our revenue and must not move either figure.
insert into public.ai_credit_ledger
  (user_id, delta, reason, model, provider, quality, size, is_byok,
   input_tokens, input_image_tokens, output_tokens, image_count)
values ('93000000-0000-4000-8000-000000000001', 0, 'entity_image', 'gpt-image-2', 'openai',
        'high', '1024x1536', true, 706, 2988, 7024, 1);

select set_config('request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}', true);
set local role authenticated;

-- ── entity_image: one call per charge, so per-charge equals the per-render
-- average once normalised out of its 1.5x area.
select is(
  (select sample_size from public.get_credit_calibration_hints() where generation_type = 'entity_image'),
  25::bigint,
  'BYOK is excluded from the charge count — the user paid that provider bill');

select is(
  (select round(cost_per_charge_usd_cents, 4) from public.get_credit_calibration_hints() where generation_type = 'entity_image'),
  15.8769::numeric,
  'cost per charge is normalised to a 1024-square render, comparable to credit_cost');

select is(
  (select breakeven_cost from public.get_credit_calibration_hints() where generation_type = 'entity_image'),
  24,
  'break-even is the floor: 15.8769c / 1.08 EUR, at 0.61457c net per credit');

select is(
  (select suggested_cost from public.get_credit_calibration_hints() where generation_type = 'entity_image'),
  48,
  'and the suggestion is that floor at the 2x target margin, not the floor itself');

-- ── tile packs: one charge buys four calls. Averaging rows would divide our
-- spend by four and call 12 credits a 4x overcharge worth cutting to 3.
select is(
  (select sample_size from public.get_credit_calibration_hints() where generation_type = 'tile_pack_generation'),
  25::bigint,
  'free retries are spend, not sales — 100 rows, 25 charges');

select is(
  (select round(cost_per_charge_usd_cents, 4) from public.get_credit_calibration_hints() where generation_type = 'tile_pack_generation'),
  3.6760::numeric,
  'a slot costs all four of its attempts, because that is what one payment buys');

select is(
  (select suggested_cost from public.get_credit_calibration_hints() where generation_type = 'tile_pack_generation'),
  11,
  'so the hand-set price of 12 is confirmed fair, rather than flagged as a 4x overcharge');

reset role;
select set_config('request.jwt.claims', '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  'select * from public.get_credit_calibration_hints()',
  'Admin only',
  'an ordinary user cannot read platform cost data');

reset role;
select * from finish();
rollback;
