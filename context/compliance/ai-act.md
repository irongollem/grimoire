# AI Act Compliance Register

Legal/compliance register for EPIC #611 (EU AI Act, Art 50). The companion
engineering spec is `context/compliance/provenance-architecture.md` — that
file describes how marking and consent are built; this file records what
Grimoire has decided about its own legal position, and stays current with
what has actually shipped. Living doc: update it whenever a new AI-touching
feature ships (new generator, new modality, new provider) and at minimum
quarterly even if nothing shipped, so guidance drift doesn't go unnoticed.
Positions are dated because they can be revisited; nothing here is assumed
permanent.

## 1. Status & deadlines

Art 50(1), (2) and (5) became applicable **and enforceable on 2 Aug 2026**
(fines up to €15M or 3% of worldwide turnover). The Commission published
guidelines on Art 50 on 20 Jul 2026.

The **AI Omnibus Regulation (EU) 2026/1744**, in force 27 Jul 2026, softened
the transition for systems already on the market before 2 Aug 2026: the
Art 50(2) machine-readable-marking duty gets a grace period until
**2 Dec 2026**, and high-risk obligations (Arts 8–27 — not applicable to
Grimoire regardless, see §2) are delayed to **2 Dec 2027**.

**Decision (Jeffrey, 4 Aug 2026): comply now, not at the grace-period
deadline.** Grimoire is a pre-launch, single-operator product — there is no
install base whose marking would need a phased rollout, and shipping the
real thing now is cheaper than building it twice (once sloppy to hit a
deadline, once properly). The grace period is treated as a legal fact worth
recording, not a target date.

## 2. Role analysis

**Grimoire is a *provider* of generative AI systems** built on general-purpose
AI models (OpenAI, Anthropic, Google, fal.ai, Meshy) and placed on the market
under Grimoire's own name and branding. This holds across all three AI
access tiers — platform-credit, BYOK-cloud, and local-key — because in every
tier the system doing the generating is Grimoire's: our prompts, our UI, our
pipeline. Whose API key pays for the call does not change whose system it is;
a user supplying their own OpenAI key to a Grimoire generator panel is still
using a Grimoire AI system, not operating OpenAI directly.

**Grimoire's users are *deployers*, exempt under Art 2(10)** — their use is
personal, non-professional activity (running a home D&D campaign), which the
Act carves out of the deployer-side Art 50 duties entirely. This is the
epic's (#611) settled position, not re-derived here.

**Grimoire is a *deployer*, not a provider, only when it reuses Chronicler
images promotionally** — gated behind `campaigns.allow_chronicle_promotion`
(boolean, default `false`, present since the initial schema). A campaign
that never opts in never puts Grimoire in this role.

**Not high-risk.** No Annex III category matches anything Grimoire does —
no biometric categorisation, no employment/education/credit scoring, no
law-enforcement or migration use. Arts 8–27 (conformity assessment, FRIA,
EU-database registration, the Art 12 immutable-logging duty) do not apply,
and #609's log hardening is explicitly framed as voluntary evidence hygiene,
not a legal duty, so that machinery is never built as if it were required.

**Art 5 prohibited practices: none apply.** No subliminal manipulation, no
biometric categorisation of protected classes, no social scoring, no
real-time remote biometric identification — nothing in Grimoire's feature
set resembles any of the Art 5 categories.

**Decision (Jeffrey, 4 Aug 2026, evening): no external legal review.** The
role analysis above is a self-assessment and stays one — proportionate for a
solo-operator product of this size, and the owner accepts that risk
knowingly. This supersedes the earlier same-day "deferred, not dropped"
position. Revisit only if circumstances materially change: a B2B/organisation
customer requests a DPA (#477 territory), a competent authority makes
contact, or Grimoire's scale or feature set shifts the risk calculus.

## 3. AI-system inventory

Verified against `supabase/functions/` and `src/ai/` on 4 Aug 2026.

### Server-side edge functions (platform-credit and BYOK-cloud paths)

| Function | Modality | Providers (shared module) | Notes |
|---|---|---|---|
| `generate-npc` | text | OpenAI / Anthropic / Gemini (`_shared/textGen.ts`) | |
| `generate-location` | text | same | |
| `generate-trap` | text | same | |
| `generate-quest` | text | same | |
| `generate-encounter` | text | same | |
| `generate-downtime` | text | same | downtime-outcome vignette/title text |
| `generate-roll-table` | text | same | |
| `generate-chronicle-text` | text | same | session recap text |
| `generate-npc-voice` | text | same | "NPC Voice Coach" — generates speakable-as-is lines only; ephemeral, nothing persisted |
| `generate-chronicle-image` | image | OpenAI (gpt-image-2 / gpt-image-1.5 / gpt-image-1-mini), Gemini (gemini-3.1-flash-image, "Nano Banana"), fal.ai (flux-2/flex) via `_shared/imageGen.ts` | also the promotional-reuse surface (§2) |
| `generate-entity-image` | image | same | |
| `style-map` | image | same | |
| `forge-mini` (stylize leg) | image | same | Simulacrum: portrait → stylized source image |
| `forge-mini` (sculpt/resculpt leg) | 3D | Meshy image-to-3D | paid task *creation* only |
| `poll-meshy-jobs` | 3D | Meshy | cron-driven job poller; finishes the Meshy task and downloads assets before Meshy's ~3-day auto-delete |
| `generate-music` | audio | Google Lyria (`lyria-3-clip-preview` / `lyria-3-pro-preview`) | |
| `embed-content` | embedding | OpenAI text-embedding-3-small / Google gemini-embedding-001 (`_shared/embeddings.ts`) | notes/generic retrieval corpora (#600) |
| `embed-monsters` | embedding | same | monster retrieval corpus |
| `api-key-vault` | infra | n/a | stores/decrypts BYOK keys; not itself a generator, but part of every BYOK pipeline |
| `list-provider-models` | infra | queries provider APIs for model lists | not generation |

### Client-direct generators (`src/ai/`, browser-side, BYOK-cloud or local-key only)

`useMonsterGeneration.ts`, `useItemGeneration.ts`, `useFactionGeneration.ts`,
`usePuzzleGeneration.ts`, `useSpellGeneration.ts` (via `spellAiAdapter.ts`),
and `useTextEnhancement.ts` all call `getTextProvider()` from
`src/ai/providers/` (`openai.ts`, `anthropic.ts`, `gemini.ts`, `falai.ts`)
directly from the browser, using the campaign's configured key (BYOK-cloud)
or a locally-vaulted key (local-key tier) — never touching an edge function.
As §2 states, this is still a Grimoire AI system: the prompts, panel UI, and
pipeline are all Grimoire's, so the provider role does not shift to the user
just because the key does.

### MCP server

`supabase/functions/mcp` — a read-only OAuth 2.1 resource server ("traverse
your campaign from your own AI"). It serves campaign data to external MCP
clients; it does not itself generate content, so it sits outside Art 50's
scope. Listed here for completeness of the AI surface.

### Not AI

**Illuminate** (`src/lib/illuminate/`, the Illuminator publishing tool) is
pure client-side canvas image processing — colour grading, vignette, texture
overlay, depth of field, torn/faded edges. No model call, no AI Act
relevance. Recorded here once so it stops getting swept into AI audits on
name association alone.

## 4. Consent gateway decision (4 Aug 2026)

Compliance couples to the campaign's existing `ai_enabled` toggle
(`campaigns.ai_enabled`, added in migration `20260507000010`) rather than a
new, separate consent flag. Full design in provenance-architecture.md §3;
this entry records the decision and its current build status.

- Enabling AI on a campaign (`AiTab.vue`) is the opt-in moment: it shows the
  AI notice (interacting with AI; outputs may be inaccurate or resemble
  third-party works; where data goes) and records a versioned `ai_use` row
  in `ai_acknowledgements`. Existing AI-on campaigns get the same dialog once,
  on next generator use. A version bump re-prompts everyone.
- Portrait flows (Simulacrum stylize/sculpt, chronicle reference images,
  group portrait, NPC disguise) additionally require a `likeness`
  acknowledgement, enforced **server-side** in `forge-mini` and
  `generate-chronicle-image` — not only in the UI, because the UI gate is
  trivially bypassable and the server call is the actual point where data
  leaves Grimoire.
- `ai_enabled === false` guarantee: AI UI hidden, every generator 403s. This
  is a one-way trust boundary — disclosure is provenance-driven, not
  toggle-driven, so content generated while AI was on stays badged even if
  the campaign later switches AI off. "No AI" means no *new* AI and no AI
  features; it never means silently un-labelling history.

**Implementation status, 4 Aug 2026 (end of day) — built.** The
`ai_acknowledgements` table (migration `20260804000003`), the `ai_use` dialog
(`AiNoticeDialog.vue`, gated at the `AiTab.vue` toggle and once-per-session in
both DM and player layouts via `AiUseNoticeGate`), and the `likeness` gate are
all implemented. Likeness is enforced server-side (`forge-mini` stylize/sculpt;
`generate-chronicle-image` whenever the request carries portrait references —
request-shape, not purpose, so scenes/group portraits/disguise/trap-with-party
references are all covered; it fails closed on DB errors) with client
pre-flights (`useLikenessGate.ensureLikenessAck()`) in the Simulacrum wizard,
chronicler scene dialog, group portrait, NPC alter-ego and trap generation.
Version constants are canonical in `_shared/provenance/consent.ts`, re-exported
to the client via `src/lib/legal.ts`. The acknowledgement flows go live when
the migrations are pushed (auto-apply on push-to-main).

**Explicit choice replaces default-on (Jeffrey, 4 Aug 2026).** `ai_enabled`
was `boolean not null default true` since migration `20260507000010` — AI was
on for every campaign unless the owner found the toggle and turned it off,
and free users never even saw that toggle (`AiTab.vue` was Pro-gated whole).
That is opt-out, not the opt-in Art 50 consent gateway this section already
claimed to be. Fixed in migration `20260804000007`: `ai_enabled` is now
tri-state (`boolean | null`, no default) — `true` = owner opted in, `false` =
owner explicitly declined, `null` = never chosen. New campaigns start `null`.
Existing rows keep whatever `true`/`false` they already had; no data was
touched, only the constraint. Every consumer of the column reads it the same
way now: `=== true` means on, anything else (`false` *or* `null`) means off —
`useCampaignStore().isAiEnabled`, all 14 generator edge functions
(`campaign.ai_enabled !== true`, tightened from `!== false` so an unchosen
campaign 403s exactly like a declined one — this also caught `forge-mini`,
which had no `ai_enabled` check at all on either its stylize or sculpt/resculpt
leg and is now the 14th gated function), and `AiTab.vue`'s form default.

The `null` state is surfaced to the campaign **owner** (`campaigns.user_id`,
not just any DM — co-DMs and players get nothing) via `AiUseNoticeGate.vue`:
on first load of a never-chosen campaign it offers `AiNoticeDialog` in a new
`mode="choose"`, an inviting-but-honest chooser instead of the plain
pre-toggle notice. Copy: title "Bring AI to this campaign?"; lead pitches what
AI can do (NPCs, monsters, encounters, quests, traps, recaps, art,
soundscapes, grounded in the campaign's own content); an honest block states
drafts can be wrong or resemble existing work, prompts/context go to the
campaign's configured third-party provider, output carries an invisible AI
marker, and the choice can change anytime in settings; primary button "Enable
AI assistance", quiet secondary "Not now" — no pre-ticked state, no guilt
copy on decline. Confirm records the `ai_use` acknowledgement (same as the
plain notice) **and** sets `ai_enabled = true`; "Not now" sets `ai_enabled =
false` directly with no acknowledgement and no re-prompt — one dialog, one
decision, settings is the only way back in either way. Upgrade/downgrade
paths were audited (`rg -n "ai_enabled" src/ supabase/functions/`, plus the
Stripe webhook/checkout/portal functions specifically) and none of them write
`ai_enabled` — a plan change never flips this choice.

Free-tier accessibility: the master AI on/off toggle in `AiTab.vue` moved
outside `ProFeatureGate` (it previously gated the entire tab, so free owners
could not even see the switch to decline or accept). BYOK key storage,
provider pickers and the campaign setting-prompt textarea remain Pro-gated;
only the toggle and its existing consent-dialog flow are free.

**Free->Pro one-time re-offer (Jeffrey, 4 Aug 2026).** When a campaign owner
upgrades to Pro, campaigns they previously and explicitly declined AI on
(`ai_enabled === false`, not `null` — that's the chooser's case above) get
ONE re-ask: people pay for Pro expecting AI and may have forgotten an old
"Not now". `AiUseNoticeGate.vue` gained a third branch — `ai_enabled ===
false` AND current user is the campaign owner AND the account is Pro AND the
`ai_pro_reoffer` kind hasn't been recorded yet — that reuses the existing
chooser (`mode="choose"`) with Pro-aware lead copy
(`AiNoticeDialog.vue`'s `proReoffer` prop swaps only the title/intro; bullets
and both buttons are identical to the standard chooser, no guilt phrasing on
decline). This never auto-flips `ai_enabled` — confirm records `ai_use` (if
not already recorded) and `ai_pro_reoffer`, then sets `ai_enabled = true`;
"Not now" records only `ai_pro_reoffer` and leaves `ai_enabled` false. The
`ai_pro_reoffer` kind was added to `ai_acknowledgements.kind`'s check
constraint (migration `20260804000008`).

**Once-only semantics, and why it's user-level not campaign-level.** A single
`ai_pro_reoffer` row means the re-ask was answered, whichever way — there is
no version-bump-forever nuance here the way `ai_use`/`likeness` intentionally
have; the decision (yes or no) is meant to be final. Recording is per-user
(matching every other kind in this table), so the re-ask fires for whichever
owned AI-off campaign the account opens first after upgrading, and answering
it there silences it for every other AI-off campaign that account owns too —
this is a "have you reconsidered" moment for the person, not a per-campaign
setting, and re-declining on one campaign is read as a decision about AI in
general, not about that campaign specifically.

## 5. Exemptions relied on

**Obvious-from-context — Art 50(1).** The duty to inform a natural person
they're interacting with an AI system is discharged by interface context
rather than a separate runtime disclosure: every generator panel
(`MonsterGenerateDialog.vue`, `NpcGenerateDialog.vue`,
`SpellGenerateDialog.vue`, and the rest reachable through the shared
`aiGeneratorRegistry`) is opened by clicking a button labelled to generate
with AI, inside a panel titled as a generator. NPC Voice Coach and the
inline AI-enhance button are the same shape. Nobody reaches any of these
without already having asked an AI system to do something — no extra banner
is layered on top of an already-obvious interaction.

**Assistive / standard-editing — Art 50(2).** `useTextEnhancement.ts`
rewrites text the user already wrote (grammar, tone, tightening) rather than
generating new content from a prompt. This is the standard-editing carve-out
for systems that assist human-authored input rather than substantially
replace it, so its output is not marked as AI-generated.

**Personal-use carve-out — Art 2(10).** Grimoire's hobbyist users are
deployers exempt from Art 50's deployer-side duties because running a home
campaign is personal, non-professional use. Settled at the epic level
(#611), restated here rather than re-argued. Revisit if Grimoire ever ships
a paid/professional-GM tier where a user could be deploying AI in a
professional capacity.

**No provenance backfill for pre-existing content.** Content generated
before the `ai_provenance` column existed on a given table has no
recoverable provenance — there is no reliable signal that distinguishes
AI-authored rows from hand-authored ones in the existing data. Rather than
guess, those rows stay unmarked (`ai_provenance = null` reads as "no known
AI involvement," never as "confirmed human-authored"). The transparency duty
is read as attaching at generation time going forward, not retroactively to
content the system had no technical means to mark when it was created.

## 6. Marking techniques

Status is per-modality below; this table tracks reality, it does not
pre-declare work done.

**Images — shipped 4 Aug 2026 (#605).** `supabase/functions/_shared/provenance/`
embeds an XMP packet — IPTC `DigitalSourceType = trainedAlgorithmicMedia`,
`xmp:CreatorTool`, a custom `grimoire:` namespace for
provider/model/generatedAt — into WebP/PNG/JPEG bytes (idempotent re-marking,
pass-through on unknown formats, colocated tests). Server side: every
generated image is marked before upload or inside the returned `image_b64`,
using the provider's true output format (OpenAI webp, Gemini png, fal.ai
jpeg). Client side: local-key-mode output is marked before upload, and the
canvas resize pipeline (`toWebP`, `resizeToWebP` variants, `backfillVariants`)
re-embeds the original's XMP after every re-encode — canvas strips metadata,
so re-embedding is what makes the mark survive. A C2PA spike (#605) remains
pending and undecided — XMP is the shipped approach, and the permanent one
unless C2PA adoption changes that calculus (§9). **Production finding
(4 Aug 2026):** the first post-deploy spot-check (job `9a468d81`, gpt-image-2
webp) showed OpenAI now embeds its own C2PA manifest (`c2pa.created`,
`digitalSourceType = trainedAlgorithmicMedia`) in gpt-image-2 output, and
Grimoire's pipeline preserves it — those images carry the provider's C2PA
*plus* our XMP. That weakens the case for building our own C2PA signing:
provider-side C2PA is inherited where it exists, and our XMP covers every
provider uniformly.

**Audio — verified 4 Aug 2026 (#605).** Google's own Gemini API docs state
plainly: "All generated audio includes a SynthID audio watermark for
identification. This watermark is imperceptible to the human ear and does
not affect the listening experience" — and this is described as applying to
API output generally, not only the Gemini-app UI surface
([Generate music with Lyria 3](https://ai.google.dev/gemini-api/docs/music-generation),
Google AI for Developers). Grimoire calls the same `generateContent` endpoint
these docs describe (`generate-music/index.ts`), so every track this app
produces is SynthID-watermarked by Google before Grimoire ever sees the
bytes. Grimoire has not built (and does not need to build) its own
extraction/verification tooling — the machine-readable mark is the upstream
GPAI provider's, inherited by the system that calls it, the same relationship
Grimoire has to any other sub-processor's output.

**Container-level marking: assessed, not added.** The same Google docs state
the Lyria 3 models return `audio/mp3` by default, and that WAV is only
returned when the caller explicitly sets `generationConfig.responseFormat`
to request it. `generate-music/index.ts` never sets `responseFormat` — its
request body is `{ contents, generationConfig: { responseModalities:
["AUDIO", "TEXT"] } }` only — so both `lyria-3-clip-preview` and
`lyria-3-pro-preview` come back as compressed MP3 in this app today (matching
the function's own `audioExtension()` fallback, which defaults to `"mp3"`).
The RIFF-chunk provenance embedder precedent in
`_shared/provenance/embed.ts` embeds XMP into WebP/PNG/JPEG containers;
MP3 has no equivalent lightweight "extra chunk" convention in this codebase
(ID3v2 tag writing is a different, non-trivial format and would be new scope,
not a small addition), so no container-level Grimoire mark was added. If
`generate-music` is ever changed to request WAV output, this is worth
revisiting — RIFF marking would become a small, safe addition at that point,
per the same reasoning already applied to generated images.

`sounds.artist = 'Grimoire AI'` is set on every generated track
(`finalize_music_generation_job`, migration
`20260730000002_ai_generation_jobs.sql`) — confirmed still true; the prior
"`generate-music` does not currently populate it" note in this register was
stale and is corrected here. Audio verification closed; the #605 pieces
that remain open (C2PA feasibility spike) are image-side, not audio.

**Text — shipped 4 Aug 2026 (#606).** All 8 server text generators return an
`ai_provenance` block built from the actually-resolved provider/model, and
every client accept-save persists it into the `ai_provenance jsonb` column
(migration `20260804000002`) across all 13 content tables — including
detail-page regenerate flows and the `resolve_downtime_draw` RPC path
(migration `20260804000004`). Client-direct BYOK/local generators construct
the same block via `src/ai/provenance.ts`. Chronicle-inserted rich text is
additionally wrapped in a `data-ai-generated` / `data-ai-model` container — a
dedicated TipTap node so the marker survives editor round-trips, and
`sanitizeHtml` (DOMPurify `ALLOW_DATA_ATTR` default) preserves it through
sanitization; both proven by colocated tests. Human edits flip
`ai_provenance.edited` to `true` via `markEdited()` wired into all 12 entity
editors with real content-diff dirty checks (`downtime_outcomes` is
insert-only; nothing to wire). No backfill for pre-existing rows (§5).

**3D — out of Art 50(2)'s literal scope (position, 4 Aug 2026).** Art 50(2)
names image, audio, video and text as the marked media types. A Meshy
GLB/STL mesh is arguably none of those in the literal sense — it's geometry,
not one of the enumerated modalities. Grimoire's position is that the
in-scope artifact in the Simulacrum pipeline is the *stylized source image*
Meshy sculpts from, which is already covered by the image-marking plan
above; the mesh inherits disclosure by association with its marked source,
and the user already understands the mesh is AI-made because "AI mini" is
the entire pitch of the feature. Revisit if future guidance explicitly
extends Art 50(2) to 3D assets.

## 6a. Usage logging (#609, 4 Aug 2026)

Voluntary hardening, not a legal duty (Art 50's marking/disclosure obligations
above are separate from this) — #609 closes a gap and adds tamper-evidence in
the AI usage record (`ai_credit_ledger`, `ai_generation_jobs`,
`image_generation_jobs`), which is the evidence base for billing disputes and
abuse investigation, and doubles as Art 50 supporting evidence if ever asked.
See provenance-architecture.md §8 for the engineering summary.

**Logging-gap decision.** `useAiCredits.ts` `logUsage()` previously skipped
the `deduct-ai-credit` call entirely when the provider reported no token
counts — silently dropping fal.ai image generations and any other
token-less BYOK/local-key call from the record. Fixed: every client-direct
(BYOK or local-key-vault) generation now logs a row unconditionally — delta 0,
`is_byok: true`, token columns NULL when the provider didn't report them,
`model`/`provider`/`reason` always present.

**Local-key mode's privacy promise, explicitly checked.** Local-key mode's
guarantee is that plaintext prompts and provider keys never reach Grimoire's
server — not that the server hears nothing at all. `logUsage()` sends only
`reason` (generator type), `provider`, `model`, `is_byok`, token counts and
image count — never prompt/response content, never the key. That payload was
already metadata-only before #609; the fix only removed the early-return that
was dropping rows, it didn't add a new field. Decision: this metadata beacon
does not contradict the local-mode promise, so it ships without a separate
opt-out.

**Tamper-evidence.** Migration `20260804000005_ai_log_tamper_evidence.sql`:
`ai_credit_ledger` is now a trigger-enforced append-only table (an audit of
every ledger-writing code path found no legitimate UPDATE transition at all —
reservation settlement is insert-new-row + delete-the-pending-hold, never an
in-place update — so the guard trigger blocks ALL updates, not a
special-cased subset). `image_generation_jobs`'s unused owner-UPDATE RLS
policy is dropped (no application code ever called it; it was a live
tamper vector via a forged REST PATCH). Owner-DELETE stays on
`image_generation_jobs` on purpose — deleting your own Gallery image is a
real, shipped feature (`useDeleteGalleryImage`), not log falsification; see
the migration header for the full boundary reasoning.

**Retention.** `image_generation_jobs.prompt` and `ai_generation_jobs.request_json`
are scrubbed (cleared, not row-deleted) 90 days after creation via a pg_cron
job in the same migration, following the existing `fail-stale-*`/
`release-stale-credit-holds` scheduling pattern. Billing/telemetry columns
(delta, model, provider, tokens, status, timestamps) are kept indefinitely —
they carry no prompt content and are the actual evidence base; only the
free-text prompt/request fields carry the GDPR liability of indefinite
retention, so only those are time-boxed.

## 7. Provider register

This table is the AI-specific subset of Grimoire's processor list. It
overlaps the broader sub-processor list scoped (and deferred until the
first B2B/DPA request) in #477 — cite that issue for the full processor
list (Supabase, Stripe, Freesound, etc.) rather than duplicating it here.

**Verification note.** Endpoints and models are read directly off the code
(`_shared/textGen.ts`, `_shared/imageGen.ts`, `_shared/embeddings.ts`,
`generate-music/index.ts`, `_shared/mesh3d.ts`) and are exact. The DPA,
transfer, retention and GPAI cells below were verified against live vendor and
Commission documents on **4 Aug 2026** (the grimoire-marketing#22 research
sweep; the public privacy policy's transfer table was written from the same
pass, so the two documents share a source of truth). DPF non-participation was
checked against the official participant database (active and inactive lists,
with positive control queries) for OpenAI, fal.ai and Meshy; Anthropic's
absence is corroborated by its own legal pages omitting the DPF (the registry
UI is not machine-readable); Google's certification is per Google's own
frameworks page, and the registry record
(dataprivacyframework.gov/participant/5780) was read manually by the owner on
4 Aug 2026: Active for the EU-U.S. DPF, UK Extension and Swiss-U.S. DPF,
certified since 22 Sep 2016, next recertification due 13 Sep 2026.
Re-verify on material provider changes or at the quarterly review.

| Provider | Role | Endpoints / models used | DPA / terms | EU transfer mechanism | Retention behavior | GPAI Code of Practice |
|---|---|---|---|---|---|---|
| OpenAI | Sub-processor — GPAI text, image, embedding models | Chat Completions (`gpt-4o-mini` default), Images generations/edits (`gpt-image-2`, `gpt-image-1.5`, `gpt-image-1-mini`), Embeddings (`text-embedding-3-small`) | DPA at openai.com/policies/data-processing-addendum, effective 1 Jan 2026; EEA customers contract with OpenAI Ireland Ltd | SCCs (2021/914) or EU adequacy per DPA §4.1; **not** DPF-certified (official DB, active + inactive, 4 Aug 2026). EU data residency exists (`eu.api.openai.com`, approval-gated, requires a Modified Retention amendment, 10% uplift on eligible models) — not currently used by Grimoire | API inputs/outputs not used for training by default (since 1 Mar 2023); abuse-monitoring logs up to 30 days; ZDR / Modified Abuse Monitoring are approval-gated | Signatory, no reservations (EC signatory list, 4 Aug 2026) |
| Anthropic | Sub-processor — GPAI text model | Messages API (`claude-haiku-3-20240307` default) | DPA at anthropic.com/legal/data-processing-addendum, effective 24 Feb 2025 | SCCs Modules 2 and 3 (+ UK IDTA, Swiss addendum); not listed as DPF-certified — Anthropic's own legal pages omit the DPF entirely | Not used for training by default; API inputs/outputs auto-deleted within 30 days (newest "Covered Models" require the 30-day window; ZDR by arrangement). First-party API has no EU residency (us/global only) | Full signatory, no reservations (EC signatory list, 4 Aug 2026) |
| Google | Sub-processor — GPAI text, image, embedding, and Lyria music models | Gemini API `generateContent` (`gemini-2.5-flash` text, `gemini-3.1-flash-image` image, `gemini-embedding-001` embeddings); Lyria (`lyria-3-clip-preview` / `lyria-3-pro-preview`) | Gemini API Additional ToS (effective 23 Mar 2026); paid tier runs under the "Google Data Processing Addendum for Products Where Google is a Data Processor" (v10, 7 May 2026, business.safety.google/processorterms — NOT the Cloud DPA; covered service entry "Gemini API Paid Services"); EEA contracting entity Google Ireland Ltd | Google LLC is **DPF-certified** (policies.google.com/privacy/frameworks; registry record verified Active 4 Aug 2026, next recertification due 13 Sep 2026) | Paid tier: prompts/outputs not used to improve products; abuse-monitoring logs kept 55 days; EEA/CH/UK users get paid-tier data terms on all tiers. SynthID confirmed in current docs for Lyria audio AND Gemini-generated images | Signatory (EC list, 4 Aug 2026); public concerns voiced at signing, no formal reservation recorded |
| fal.ai | Sub-processor — hosts a third-party model, is not its developer | `fal-ai/flux-2/flex` image generation endpoint (model page URL flattens to `flux-2-flex`) | Public DPA at fal.ai/legal/data-processing-addendum (last updated 31 Jul 2026), auto-incorporated into the online terms — applies to API customers without signature. Entity: fal – Features & Labels, Inc., San Francisco | SCCs Module 2, "incorporated and deemed executed by this reference" (DPA §5); **not** DPF-certified (official DB, 4 Aug 2026) | Request payloads stored 30 days by default (suppressible per-request via `X-Fal-Store-IO: 0`; media retention configurable via object-lifecycle header). API terms bar training on Client Content except models marked "Pending Enterprise Ready" — `flux-2-flex` is not so marked, so the no-training commitment and DPA apply; deidentified/usage-data carve-outs exist | Not applicable to fal (hosting layer). Black Forest Labs (FLUX developer) is a signatory, no reservations (EC list, 4 Aug 2026) |
| Meshy | Sub-processor — image-to-3D generation | Image-to-3D task API (`_shared/mesh3d.ts`) | **No public DPA** — the terms reference a DPA only as an Order attachment (Enterprise channel); nothing to execute on the API tier. Entity: Meshy LLC, Sunnyvale CA; EU Art 27 rep: Instant EU GDPR Representative Ltd, Dublin | **Not** DPF-certified (official participant XLSX, zero rows, 4 Aug 2026); privacy policy commits generically to SCCs/BCRs — no executed instrument visible for API customers | Generated models auto-delete ~3 days after generation on non-Enterprise tiers (docs + ToS §2.5; `poll-meshy-jobs` re-hosts before the window closes; input-image retention unstated). **ToS §2.9: non-Enterprise Customer Inputs and Outputs may be used for training by default** — see the §9 watch item | No AI Act/GPAI claims anywhere on its site (ISO 27001 + SOC 2 only). Whether its narrow image-to-3D models meet the Art 3(63) GPAI threshold remains unresolved |

## 8. AI literacy (Art 4)

Art 4 requires providers and deployers to ensure staff and other persons
dealing with AI systems on their behalf have sufficient AI literacy. For a
solo operator with no staff, the proportionate response is a written note of
who operates the systems and where their operating knowledge lives — not a
training programme.

**Operator:** Jeffrey Ernst, sole developer and operator of every AI system
listed in §3. Knowledge of how each system works, what data it sends where,
and what its failure modes look like lives in three places: this document
(compliance and legal facts), `context/features/` (per-feature behavioural
detail — which generator does what, DM vs player visibility), and
`context/compliance/provenance-architecture.md` (the engineering mechanics
of marking and consent). No other person configures, deploys, or maintains
an AI system on Grimoire's behalf. If that changes — a contractor, a
co-founder — this section needs an update recording their onboarding to the
same three documents.

## 9. Watch section

- **High-risk obligations, delayed to 2 Dec 2027.** Irrelevant today (§2: no
  Annex III match) — re-check only if a future feature edges into an
  Annex III area (biometric categorisation, employment/education/credit
  scoring, law-enforcement or migration use — none currently on the
  roadmap). A tripwire, not a standing action item.
- **Meshy trains on API-tier data by default (found 4 Aug 2026).** ToS §2.9
  grants Meshy training use of non-Enterprise Customer Inputs and Outputs, and
  the API tier has no executed DPA or SCC instrument — the SCC language in its
  privacy policy is aspirational. The stylized portraits Simulacrum sends are
  derived from real people's likenesses, which makes this the register's
  weakest link. Current handling is disclosure: the public privacy policy
  states the training use plainly, notes the 3-day model auto-delete, and says
  the mini step is skippable.
  **Decision (Jeffrey, 4 Aug 2026): stay on the API tier and warn at the point
  of creation.** Grimoire is currently too small to negotiate an Order or
  Enterprise terms; instead the sculpt step (`MiniSculptStep.vue`) carries an
  always-visible inline notice naming Meshy, the stylized-image-only boundary,
  and the training-use terms, linking to the privacy policy. Revisit if
  Grimoire's scale changes or Meshy's API-tier terms improve.
- **Google DPF recertification due 13 Sep 2026.** Recheck the registry record
  (dataprivacyframework.gov/participant/5780) after that date; if the
  certification lapses, the Google transfer basis in the privacy policy's
  Chapter V table has to move to another safeguard.
- **Omnibus follow-on guidance.** Both the Commission's Art 50 guidelines
  (20 Jul 2026) and the Omnibus Regulation (27 Jul 2026) are recent; further
  Commission/AI Office guidance on marking standards and on how the
  Dec 2026/Dec 2027 grace periods are meant to be used is expected.
  Re-read this register against new guidance as it lands.
- **Marking-standards evolution (C2PA).** #605's C2PA spike is pending. If
  C2PA adoption becomes the de facto expectation — as it is trending toward
  elsewhere — XMP-only marking (§6) may need to be treated as an interim
  measure rather than the final answer. Revisit alongside #605.
- **External legal review: decided against (4 Aug 2026).** The §2 role
  analysis remains a self-assessment by owner decision — see §2 for the
  rationale and the three revisit triggers (B2B/DPA request, authority
  contact, material change in scale or features).
