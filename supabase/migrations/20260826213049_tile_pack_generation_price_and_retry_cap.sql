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
-- attaches three approved proof tiles to every pack-phase call, and the ledger
-- has real numbers for what that costs: `gpt-image-2` rows measure ~1500
-- image-input tokens per 1024x1024 reference (2988 for two, 4524 for three,
-- 6060 for four) at $8/1M. Three full-resolution references are therefore about
-- $0.030 a call — five times the 196-token output they help produce, and enough
-- to make this price a loss on its own.
--
-- 20260826215832 answers that with resolution rather than count: references are
-- sent at 256x256, 1/16 the area, so ~$0.002. A pack-phase attempt is then
-- ~$0.0093 and four of them ~EUR 0.0344.
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
--   starter   400 / EUR 5    EUR 0.0095   worst case +232%
--   standard 1000 / EUR 10   EUR 0.0079   worst case +174%
--   bulk     2600 / EUR 20   EUR 0.0061   worst case  +99%   <- the binding case
--
-- Bulk is what decides it, and twelve credits clears four full attempts there
-- with room to spare. It was set when a pack-phase attempt was believed to cost
-- $0.017; measurement made that $0.036 — which twelve would NOT have covered —
-- and the 256px reference brought it to $0.0093. The number survived by being
-- corrected underneath rather than by being right. A 20-slot pack — the schema
-- minimum, which is what
-- `createRun` plans — is 240 credits. For scale, one NPC portrait is 75
-- (`entity_image` at 50 base x 1.5 for its 1024x1536 area), so a whole bespoke
-- tileset costs a little over three portraits. Low quality really is an order of
-- magnitude cheaper per image, and this says so without saying it is free.
--
-- ── What would move this ────────────────────────────────────────────────────
--
-- Reference resolution, first and hardest: the numbers above hold only while
-- `styleReferences` sends 256px. Raising it back to the raws multiplies the
-- input cost by 16 and this price stops covering its own retries.
--
-- Otherwise, watch the real thing rather than this comment. Every generation
-- now records model, quality, size and all three token counts
-- (20260826215438), retries included — a free retry writes a delta-0 ledger row
-- rather than nothing — so `ai_generation_costs` prices each attempt and
-- `get_credit_calibration_hints` reads it back once there are 20 samples.
--
-- Lowering a launch price is easy and raising one is not, so this errs high; the
-- expected case of one or two attempts returns considerably more than the +99%
-- above.

alter table public.tile_pack_generation_jobs
  add column generation_attempts integer not null default 0
    check (generation_attempts >= 0);

comment on column public.tile_pack_generation_jobs.generation_attempts is
  'Provider calls charged or covered for this slot. The first is billed at the tile_pack_generation rate; the next three are free retries; tile-pack-generator refuses a fifth. A provider error never reaches the increment, so our own failures do not consume the budget. Distinct from `attempts`, the human-readable jsonb history, which also records normalize and reject actions.';

update public.ai_generation_credit_costs
   set credit_cost = 12,
       label = 'Tile Pack Tile (incl. 3 retries)'
 where generation_type = 'tile_pack_generation';
