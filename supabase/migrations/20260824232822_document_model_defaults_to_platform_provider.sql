-- Migration: document_model_defaults_to_platform_provider
--
-- Points document extraction (#353) at the provider this platform actually runs
-- on, and fills the column in for the other two so the importer is not
-- vendor-specific.
--
-- ── What 20260824212352 got wrong ────────────────────────────────────────────
--
-- It set `document_model` for **anthropic only** and left openai and gemini
-- NULL, on the reasoning that Anthropic's PDF support was the cleanest. That
-- reasoning was about the capability in isolation and never checked what this
-- codebase runs: text and images both go through OpenAI, and `provider_config`
-- says so — openai is the only row with both a `text_model` and an
-- `image_model`. So the importer would have been the one feature dragging in a
-- whole extra vendor: another account, another bill, another key to rotate, for
-- a single tab in campaign settings.
--
-- It also left the connector one-legged. `_shared/textGen.ts` implements all
-- three providers behind `callText`; `documentGen.ts` implemented one and threw
-- for the rest. This migration is the config half of fixing that — the code half
-- adds the OpenAI and Gemini implementations.
--
-- ── Model choice ─────────────────────────────────────────────────────────────
--
-- openai → `gpt-4o-mini`. The same model this platform already runs for text,
-- and that is the point: every credit price in `ai_generation_credit_costs` was
-- calibrated against its rate, so putting the importer on anything else silently
-- invalidates the scale the rest of the table sits on.
--
-- Per 1M input + 1M output:
--
--   gpt-4o-mini      $0.15 in / $0.60 out   =  $0.75
--   gpt-5.6-luna     $0.20    / $1.20       =  $1.40
--   gpt-4o           $2.50    / $10.00      =  $12.50
--   gpt-5.6-terra    $2.00    / $12.00      =  $14.00
--   claude-opus-5    $5.00    / $25.00      =  $30.00
--
-- An earlier revision of this migration defaulted to `gpt-5.6-terra`, which is
-- ~19x mini on that measure and 40x on input alone. That choice is what produced
-- the "a fifty-page import costs hundreds of credits" conclusion in
-- 20260824220715 — a property of the model picked, not of the feature. On
-- gpt-4o-mini the same import is a few cents of provider spend and lands where
-- an ordinary feature should.
--
-- Terra's cheap cached input ($0.20/M) does not rescue it here: the extractor
-- makes a single pass over the document and produces all seven entity kinds from
-- it, so there is no repeated prefix to cache. A per-kind pass would have
-- benefited; it was not built that way, deliberately, because the document
-- dominates input cost and re-sending it seven times is the expensive shape.
--
-- ── The upgrade ladder is currently theoretical — verified 24 Aug 2026 ───────
--
-- `GET /v1/models` against this platform's own OpenAI key returns seven models:
--
--   gpt-4o-mini, o4-mini,
--   gpt-image-2, gpt-image-1.5, gpt-image-1-mini,
--   text-embedding-3-large, text-embedding-3-small
--
-- No 5.6 line. No `gpt-4o` either. A request naming `gpt-5.6-luna` comes back
-- `Project ... does not have access to model` — so luna and terra are not
-- choices we can make today, they are an access request to OpenAI. Recorded
-- here because the arithmetic below reads like a menu, and it is not one yet.
--
-- Of what *is* reachable, `gpt-4o-mini` is the only one proven on this workload:
-- a real four-page card deck extracted correctly on 24 Aug 2026 — all twelve
-- ability scores read off box-and-circle graphics, AC/HP/speed out of unlabelled
-- boxes, and both card fronts merged with their backs into single creatures.
-- `o4-mini` is unproven here and is the thing to try if mini's context window
-- becomes the binding constraint (see below).
--
-- **The context window is the live problem, not the price.** That same run cost
-- 59,436 input tokens for four pages — about 14,900 per page, because
-- `detail: "high"` rasterises each page. gpt-4o-mini's 128k window therefore
-- holds roughly eight pages, and both page caps in
-- `src/lib/documentImport/limits.ts` (10 free, 50 Pro) are above it. Those caps
-- were sized for cost and for the sui generis database right, never against a
-- context window, and they need revisiting against measurement rather than
-- against the estimate that produced them.
--
-- **`document_model` is deliberately still its own column even though it now
-- holds the same value as `text_model` for this provider.** The column is not
-- there to force a different model; it is there so a different one is
-- *expressible*. On anthropic the two genuinely diverge — `text_model` is
-- `claude-haiku-3-20240307`, which cannot read a PDF at all — and this is the
-- same separation `image_model` already has.
--
-- gemini → `gemini-2.5-flash`, which accepts inline PDF and image data. Filled
-- in so a campaign configured for Gemini is not silently refused, but it is the
-- least exercised of the three; treat a Gemini import as unproven until one has
-- actually run.
--
-- anthropic → left as `claude-opus-5`. Nothing on this platform selects it
-- today, but a campaign whose DM sets `text_provider = 'anthropic'` gets a
-- working path rather than a dead end, which is the point of the connector.

update provider_config set document_model = 'gpt-4o-mini'     where provider = 'openai';
update provider_config set document_model = 'gemini-2.5-flash' where provider = 'gemini';

-- Every provider the connector dispatches on now has a document model, so a NULL
-- here means "an admin cleared it", not "we never got round to this one".
comment on column provider_config.document_model is
  'Model used for document/image extraction (the importer, #353). Separate from '
  'text_model because reading a document is a distinct capability — the OpenAI '
  'text model is a small one and the Anthropic text model cannot read PDFs at '
  'all — exactly as image_model is separate. NULL means an admin has disabled '
  'document extraction for this provider; the extractor then refuses rather '
  'than falling back to text_model.';
