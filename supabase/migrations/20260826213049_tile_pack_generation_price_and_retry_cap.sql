-- Migration: tile_pack_generation_price_and_retry_cap
--
-- The first formal price for #384's generated tile packs, and the attempt cap
-- that makes it hold. `tile_pack_generation` shipped at 1 credit, which was a
-- placeholder rather than a decision, and it was well below cost.
--
-- ── What a tile actually costs ──────────────────────────────────────────────
--
-- Measured 25 Aug 2026 (art-src/cartographer/celestial-observatory/v1/
-- experiments/gpt-image-2-low/README.md), gpt-image-2 at quality=low, 1024x1024:
--
--   image output   196 tok @ $30/1M   $0.0059  (official calculator: $0.006)
--   text input     ~262 tok @ $5/1M   $0.0013
--
-- That measurement was taken WITHOUT reference images, and says so. Production
-- attaches up to three approved proof tiles to every pack-phase call
-- (`styleReferences`), and those are the raw 1024x1024 originals rather than the
-- 128px deliverables — so 17 of 20 slots carry image-input tokens nobody has
-- measured. At a gpt-image-1-class input rate that is about $0.010, putting a
-- pack-phase attempt near $0.017 and four of them at ~EUR 0.064.
--
-- ── Why 12 ──────────────────────────────────────────────────────────────────
--
-- Retries are inside the price, not billed: a user cannot judge a tile until
-- they see it, and metering that judgement makes them keep work they do not
-- want. The ceiling that makes it affordable is four attempts per slot — one
-- plus three retries — enforced in tile-pack-generator.
--
-- The price is then set so that a user who burns EVERY retry on EVERY slot
-- still leaves a little profit, on the thinnest credit we sell. Net per credit
-- after 21% VAT and Stripe (1.5% + EUR 0.25):
--
--   starter   400 / EUR 5    EUR 0.0095   worst case +78%
--   standard 1000 / EUR 10   EUR 0.0079   worst case +47%
--   bulk     2600 / EUR 20   EUR 0.0061   worst case +15%   <- the binding case
--
-- Bulk is what decides it. Ten credits is -4% there and was the first candidate;
-- twelve is +15% at the true worst case and 2-4x on the expected one or two
-- attempts per slot. A 20-slot pack — the schema minimum, which is what
-- `createRun` plans — is 240 credits. For scale, one NPC portrait is 75
-- (`entity_image` at 50 base x 1.5 for its 1024x1536 area), so a whole bespoke
-- tileset costs a little over three portraits. Low quality really is an order of
-- magnitude cheaper per image, and this says so without saying it is free.
--
-- ── What would move this ────────────────────────────────────────────────────
--
-- The image-input figure is the one estimate in the chain, and the price is
-- sensitive to it: at $0.020 per call instead of $0.010, bulk goes negative
-- again. `recordGeneration` already stores `input_image_tokens`, so the first
-- real run settles it — check that before assuming this number is safe.
--
-- There is also a cheap lever if it does turn out to matter: hand
-- `styleReferences` the normalized 128x128 tiles instead of the 1024px raws.
-- Input tokens scale with area, so 1/64 of it, and 128px is the size the whole
-- pipeline is aiming at. Deliberately not done here — it changes generated art,
-- which is a quality decision rather than a billing one.
--
-- Lowering a launch price is easy; raising one is not, which is why this errs
-- high on the one input it cannot yet measure.

alter table public.tile_pack_generation_jobs
  add column generation_attempts integer not null default 0
    check (generation_attempts >= 0);

comment on column public.tile_pack_generation_jobs.generation_attempts is
  'Provider calls charged or covered for this slot. The first is billed at the tile_pack_generation rate; the next three are free retries; tile-pack-generator refuses a fifth. A provider error never reaches the increment, so our own failures do not consume the budget. Distinct from `attempts`, the human-readable jsonb history, which also records normalize and reject actions.';

update public.ai_generation_credit_costs
   set credit_cost = 12,
       label = 'Tile Pack Tile (incl. 3 retries)'
 where generation_type = 'tile_pack_generation';
