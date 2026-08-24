-- Migration: document_import_per_page_cost
-- Prices the document importer (#353) by the page, because that is what it
-- actually costs. The flat 5-credit row seeded in 20260824204224 was wrong in
-- both directions and wrong by roughly two orders of magnitude at the top end.
--
-- ── Why flat pricing could never work here ───────────────────────────────────
--
-- Every other generator in this table charges a flat fee because its input is a
-- sentence the DM typed — the cost of `quest_generation` does not vary. This
-- one's input is an entire document, so its cost scales with page count and the
-- charge has to scale with it. A flat fee overcharges someone importing two
-- photographed statblocks and undercharges someone importing a 50-page chapter,
-- and the second error is the expensive one.
--
-- ── The arithmetic ───────────────────────────────────────────────────────────
--
-- Anthropic's PDF support does not OCR. It rasterises **every page to an image**
-- and extracts the text, and the request pays for both — there is no cheaper
-- text-only path to select. Budget ~1,500–3,000 input tokens per page.
--
-- On claude-opus-5 ($5 / 1M input, $25 / 1M output), and remembering that
-- thinking is on by default and bills as output:
--
--   10 pages ≈  15–30k input  → ~$0.22–0.53 per extraction
--   50 pages ≈ 75–150k input  → ~$0.63–1.38 per extraction
--
-- ── Calibrated against image generation, not text ────────────────────────────
--
-- The right anchor is the image price, not the text price, and for a literal
-- reason: a PDF page *is* an image to the model. Text generation is charged 1
-- credit as a floor — it costs well under a tenth of a cent to serve, so that
-- row carries generous margin and tells you almost nothing about the scale.
-- Image generation is where the scale is actually set: `entity_image` costs
-- roughly $0.04–0.19 to serve and sells for 50–90 credits, which implies
-- ~$0.001–0.002 of real provider spend per credit.
--
-- Applying that rate to the figures above:
--
--   10 pages  ~$0.22–0.53  →  ~145–350 credits
--   50 pages  ~$0.63–1.38  →  ~420–920 credits
--
-- which puts the marginal page at roughly 10–15 credits. Hence 12 below: inside
-- the band, derived from the app's existing scale rather than from list prices
-- in isolation.
--
-- ── The shape, and what is left for a human to decide ────────────────────────
--
-- Total = base + (per_page x page_count). The base covers the fixed overhead of
-- a job (prompt, schema, the fixed part of the response); the per-page term
-- carries the part that actually scales.
--
-- The NUMBER below is derived from published per-token prices and the app's own
-- image-generation scale — it is not measured spend. It is deliberately a config
-- row rather than a constant so it can be corrected from the admin panel without
-- a deploy. The correct workflow is: ship, watch `get_credit_calibration_hints`
-- against real imports, and reprice from what those actually cost. Treat 12/page
-- as a calibrated starting position, not a measured figure.
--
-- Two other levers exist if that lands too high for the product, and both are
-- one-row changes rather than code:
--   * `provider_config.document_model` — claude-sonnet-5 is roughly 40% cheaper
--     than opus-5 per token, claude-haiku-4-5 roughly 5x cheaper.
--   * the page caps in the extractor (10 free / 50 Pro).

insert into ai_generation_credit_costs (generation_type, label, credit_cost, sort_order) values
  ('document_import_page', 'Document Import (per page)', 12, 31)
on conflict (generation_type) do update
  set credit_cost = excluded.credit_cost, label = excluded.label;

-- The existing row is retained as the per-job base and dropped to 1, matching
-- the other text generators: the fixed overhead of one extraction really is
-- about one text call's worth of prompt. Everything above that now rides on the
-- per-page term.
update ai_generation_credit_costs
   set credit_cost = 1,
       label = 'Document Import (base)'
 where generation_type = 'document_import_extraction';

comment on table ai_generation_credit_costs is
  'Per-generation credit prices. Most rows are flat. The document importer is '
  'the exception and uses two rows — document_import_extraction (per-job base) '
  'plus document_import_page (multiplied by page count) — because its input is '
  'a document rather than a prompt, so its cost scales with page count. See '
  'migration 20260824220715.';
