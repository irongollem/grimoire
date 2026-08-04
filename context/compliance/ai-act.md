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

**⚠ Watch item — external legal review of this role analysis is deferred,
not dropped.** Parked on 4 Aug 2026 by explicit decision (see
provenance-architecture.md, "Deferred, not dropped") because it sits outside
this ticket's blast radius, but it is in scope for pre-public-launch work.
It must not quietly fall off the list because nothing in the code forces it
back on.

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

**Implementation status, 4 Aug 2026:** `campaigns.ai_enabled` and the UI/server
gates it already drives are live today. The `ai_acknowledgements` table
(migration `20260804000003_ai_acknowledgements.sql`) exists as a written,
not-yet-applied migration; the consent-dialog UI and the server-side
`likeness` gate are wave-3 work (#607/#608) and are not built yet. Until that
wave ships, `ai_enabled` gates access to AI features but no acknowledgement
is actually recorded on enabling it — that gap is real, open, and tracked on
#607/#608, not closed by this register existing.

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

Status is per-modality below. Several rows are pending because wave 2 of the
provenance build (server/client marking, text threading — see
provenance-architecture.md §§4–6) has not landed; this table tracks reality,
it does not pre-declare work done.

**Images — designed, not yet built.** `_shared/provenance/` is specified
(provenance-architecture.md §1) to embed an XMP packet — IPTC
`DigitalSourceType = trainedAlgorithmicMedia`, `xmp:CreatorTool`, a custom
`grimoire:` namespace for provider/model/generatedAt — into WebP/PNG/JPEG
bytes immediately before upload. As of 4 Aug 2026 that module does not exist
yet (`supabase/functions/_shared/provenance/` is empty); this is upcoming
wave-1/2 work. A C2PA spike (#605) is pending and undecided — XMP is the
interim approach, and the permanent one unless C2PA adoption changes that
calculus (§9).

**Audio — TBD, nothing wired yet.** Google Lyria output carries SynthID
watermarking on Google's side; Grimoire has not implemented or verified
extraction/checking of that watermark. `sounds.artist` (a column added for
Media Session/CarPlay display, not AI-specific) is the intended carrier for
a `'Grimoire AI'` attribution on generated tracks, but `generate-music` does
not currently populate it. Both open, tracked on #605/#609.

**Text — data-model substrate written, not threaded.** The same
`ai_provenance jsonb` column described under Images (migration
`20260804000002_ai_provenance_columns.sql`, uncommitted as of this writing)
is what generators write text-draft provenance into; a `data-ai-generated`
HTML marker on chronicle-recap root elements (`sanitizeHtml` preserves it
through sanitization) is the visible-marking half. Both are #606 scope; no
generator threads a provenance block through yet.

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

## 7. Provider register

This table is the AI-specific subset of Grimoire's processor list. It
overlaps the broader sub-processor list scoped (and deferred until the
first B2B/DPA request) in #477 — cite that issue for the full processor
list (Supabase, Stripe, Freesound, etc.) rather than duplicating it here.

**Confidence note.** Endpoints and models are read directly off the code
(`_shared/textGen.ts`, `_shared/imageGen.ts`, `_shared/embeddings.ts`,
`generate-music/index.ts`, `_shared/mesh3d.ts`) and are exact. DPA links,
transfer mechanisms, retention terms, and GPAI Code of Practice status are
drawn from each vendor's publicly stated policy as understood at time of
writing and have **not** been independently re-verified against the live
document for this register. Cells marked TBD are genuinely unconfirmed —
verify all of them before the external legal review (§2, §9).

| Provider | Role | Endpoints / models used | DPA / terms | EU transfer mechanism | Retention behavior | GPAI Code of Practice |
|---|---|---|---|---|---|---|
| OpenAI | Sub-processor — GPAI text, image, embedding models | Chat Completions (`gpt-4o-mini` default), Images generations/edits (`gpt-image-2`, `gpt-image-1.5`, `gpt-image-1-mini`), Embeddings (`text-embedding-3-small`) | Standard API DPA published by OpenAI | SCCs per OpenAI's standard DPA (believed current, not re-checked today) | API inputs/outputs excluded from model training by default; short abuse-monitoring retention window. Exact current wording: **TBD** | Signed, per the EU AI Office's Jul 2025 signatory announcement — not re-confirmed for this register |
| Anthropic | Sub-processor — GPAI text model | Messages API (`claude-haiku-3-20240307` default) | Standard DPA published by Anthropic | SCCs per Anthropic's standard DPA (believed current, not re-checked today) | API inputs/outputs not used to train models by default. Exact retention window: **TBD** | Signed, per the EU AI Office's Jul 2025 signatory announcement — not re-confirmed |
| Google | Sub-processor — GPAI text, image, embedding, and Lyria music models | Gemini API `generateContent` (`gemini-2.5-flash` text, `gemini-3.1-flash-image` image, `gemini-embedding-001` embeddings); Lyria (`lyria-3-clip-preview` / `lyria-3-pro-preview`) | **TBD** — which terms apply (Gemini API/AI Studio consumer terms vs. Google Cloud/Vertex enterprise terms) depends on the API surface Grimoire authenticates against; not confirmed | **TBD** | **TBD** — retention is API-tier-dependent; confirm which tier Grimoire's key is provisioned on | Signed, with reported reservations on parts of the code's content — not re-confirmed |
| fal.ai | Sub-processor — hosts a third-party model, is not its developer | `fal-ai/flux-2/flex` image generation endpoint | **TBD** | **TBD** | **TBD** | Not directly applicable — fal.ai hosts FLUX (developed by Black Forest Labs); GPAI Code of Practice signatory status, if any, would attach to Black Forest Labs, not the hosting layer. Black Forest Labs' status: **TBD** |
| Meshy | Sub-processor — image-to-3D generation | Image-to-3D task API (`_shared/mesh3d.ts`) | **TBD** | **TBD** | Confirmed from Grimoire's own integration: Meshy auto-deletes task assets ~3 days after completion on the non-Enterprise tier; `poll-meshy-jobs` downloads and re-hosts assets before that window closes | **TBD** — Meshy's models are narrow/specialized (image-to-3D only); whether they meet the Art 3(63) "significant generality" threshold for GPAI status at all is itself unresolved, separate from the signatory question |

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
- **Omnibus follow-on guidance.** Both the Commission's Art 50 guidelines
  (20 Jul 2026) and the Omnibus Regulation (27 Jul 2026) are recent; further
  Commission/AI Office guidance on marking standards and on how the
  Dec 2026/Dec 2027 grace periods are meant to be used is expected.
  Re-read this register against new guidance as it lands.
- **Marking-standards evolution (C2PA).** #605's C2PA spike is pending. If
  C2PA adoption becomes the de facto expectation — as it is trending toward
  elsewhere — XMP-only marking (§6) may need to be treated as an interim
  measure rather than the final answer. Revisit alongside #605.
- **Deferred external legal review.** The role analysis in §2 (provider vs.
  deployer split across all three key tiers) has not had external legal
  sign-off. Parked deliberately on 4 Aug 2026; must happen before public
  launch, and must not silently fall out of scope because nothing in the
  code forces it back onto a list.
