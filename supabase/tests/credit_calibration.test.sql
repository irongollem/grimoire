begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

-- What a credit is worth is worked out in one place (#1205): `private.credit_calibration()`. The admin's price
-- calibration and the metering of a conversation both read it. This file holds the figure to a hand calculation,
-- so a change to the formula is a decision and not an accident, and holds the metering's own function to the
-- service role.

-- A known world: one setting row and two packs, whatever the database held before.
delete from public.credit_pack_config;
insert into public.credit_pack_config (pack_id, label, credits, eur_display, sort_order) values
  ('t_small', 'Small', 400, 5.00, 1),
  ('t_bulk', 'Bulk', 2600, 20.00, 2);
insert into public.app_settings (key, value)
values ('credit_calibration', '{"vat_rate": 0.21, "usd_per_eur": 1.08, "target_margin": 2.0, "payment_fee_rate": 0.015, "payment_fee_fixed_eur": 0.25}'::jsonb)
on conflict (key) do update set value = excluded.value;

-- By hand, for the pack where a credit earns least (the bulk one):
--   20.00 / 1.21            = 16.528926 net of VAT
--   20.00 * 0.015 + 0.25    =  0.55     to the payment processor
--   16.528926 - 0.55        = 15.978926 EUR for 2600 credits
--   * 100 / 2600            =  0.614574 EUR cents a credit
-- The small pack earns more per credit ((5/1.21 - 0.325) * 100 / 400 = 0.951808), so the bulk one decides.
select is(
  (select round(cents_per_credit, 6) from private.credit_calibration()),
  0.614574, 'a credit is worth what it earns in the pack where it earns least, net of VAT and the processor''s cut'
);
select is((select target_margin from private.credit_calibration()), 2.0, 'the margin is the admin''s setting');

-- In USD, as the metering reads it: 0.614574 / 100 * 1.08 = 0.00663740.
select is(
  (select round(usd_per_credit, 8) from public.agent_credit_calibration()),
  0.00663740, 'the metering reads the same figure, in dollars'
);
select is((select margin from public.agent_credit_calibration()), 2.0, 'and the same margin');

-- A margin below 1 would sell at a loss; the setting is floored.
update public.app_settings set value = value || '{"target_margin": 0.4}'::jsonb where key = 'credit_calibration';
select is((select margin from public.agent_credit_calibration()), 1.0, 'a margin set below 1 is treated as 1: never below cost');

-- No priced pack: there is no figure, and null says so (the turn function refuses to meter on it).
delete from public.credit_pack_config;
select ok(
  (select usd_per_credit is null from public.agent_credit_calibration()),
  'with no pack priced there is no figure, not zero'
);

-- Nothing a browser does needs it.
set local role authenticated;
select throws_ok(
  $$ select * from public.agent_credit_calibration() $$,
  '42501', null, 'a signed-in client cannot call the metering''s calibration'
);

select * from finish();
rollback;
