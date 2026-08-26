begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

-- Cover for #773 (20260826224028). The hint divides a measured provider cost by
-- what a credit earns, and every one of the four errors it had pointed the same
-- way — suggest a price BELOW cost. A number that reads authoritative and is 3x
-- out is worse than no number, so the arithmetic is pinned end to end.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('93000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'calib@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

-- Fixed economics, so the assertions below do not move with a config edit.
insert into public.app_settings (key, value)
values ('credit_calibration', jsonb_build_object(
  'usd_per_eur', 1.08, 'vat_rate', 0.21, 'payment_fee_rate', 0.015, 'payment_fee_fixed_eur', 0.25))
on conflict (key) do update set value = excluded.value;

-- 25 identical portraits at 1024x1536: 0.353c text + 2.390c image-in + 21.072c
-- image-out = 23.8154c each. Twenty is the minimum sample for a suggestion.
insert into public.ai_credit_ledger
  (user_id, delta, reason, model, provider, quality, size,
   input_tokens, input_image_tokens, output_tokens, image_count)
select '93000000-0000-4000-8000-000000000001', -75, 'entity_image', 'gpt-image-2', 'openai',
       'high', '1024x1536', 706, 2988, 7024, 1
from generate_series(1, 25);

select set_config('request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}', true);
set local role authenticated;

select is(
  (select round(avg_actual_usd_cents, 4) from public.get_credit_calibration_hints() where generation_type = 'entity_image'),
  23.8154::numeric,
  'the measured average is what a render of this type actually cost');

-- 1024x1536 is 1.5x a square, and `credit_cost` is the square baseline that gets
-- multiplied at charge time. Comparing the un-normalised figure against it was
-- the largest of the four errors.
select is(
  (select round(avg_baseline_usd_cents, 4) from public.get_credit_calibration_hints() where generation_type = 'entity_image'),
  15.8769::numeric,
  'and is normalised to a 1024-square render before anything is compared to credit_cost');

-- 15.8769 US cents / 1.08 = 14.70 EUR cents; a credit nets 0.61457 EUR cents in
-- the bulk pack (EUR 20 / 2600, less 21% VAT and 1.5% + EUR 0.25). 14.70/0.61457 = 24.
select is(
  (select suggested_cost from public.get_credit_calibration_hints() where generation_type = 'entity_image'),
  24,
  'the suggestion is a base cost in credits, converted to EUR and valued at what a credit nets');

-- The pack a price has to clear is the one where a credit earns LEAST. Choosing
-- the richest pack — as "conservative for the buyer" — understated it by ~1.6x.
select ok(
  (select suggested_cost from public.get_credit_calibration_hints() where generation_type = 'entity_image')
    > round((15.8769 / 1.08) / (((5/1.21) - (5*0.015 + 0.25)) * 100.0 / 400)),
  'valuing a credit at the cheapest pack rather than the dearest, so the price clears every pack');

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
