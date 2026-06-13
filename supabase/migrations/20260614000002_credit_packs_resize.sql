-- Migration: credit_packs_resize
-- Resize credit packs for the 50-credits-per-image era. The old 15/35/80 sizing
-- dates from when an image cost 2 credits and is now nonsensical (€5 = 15 cr = 0
-- images). New sizing makes per-credit price drop with pack size, nudging buyers
-- toward the €20 tier; packs now serve as permanent overage on top of the PRO
-- monthly bundle.
--
-- Prices themselves live in Stripe (checkout uses stripe_price_id); `eur_display`
-- is only a pre-sync fallback label and is left at its sticker value.

update credit_pack_config set credits = 400  where pack_id = 'starter';   -- €5  → ~8 square / ~5 portrait images
update credit_pack_config set credits = 1000 where pack_id = 'standard';  -- €10 → ~20 / ~13
update credit_pack_config set credits = 2600 where pack_id = 'bulk';      -- €20 → ~52 / ~35  (best value)
