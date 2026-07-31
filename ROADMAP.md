# Grimoire — Feature Roadmap

> **This file is now mostly a pointer.** The shipped-feature history — everything that
> used to live under _Core Features (Complete)_, _Planned (Backlog)_, _Ideas_, and
> _High Priority_ — is a curated **log**, split by subsystem under
> [`docs/log/features/`](docs/log/features/) (index: [`docs/log/index.md`](docs/log/index.md)).
> Open/planned work lives in GitHub issues on `irongollem/grimoire`, **not here**.
>
> **When you ship a feature:** append a `- [x]` entry to the top of the matching
> [`docs/log/features/<subsystem>.md`](docs/log/features/) file, then close the GitHub issue.
>
> The **AI Features** and **Monetization** sections below are kept in full because they're
> living reference / strategy — not a completed-work log.

## Feature log by subsystem · 556 shipped

| Subsystem                                              | Shipped |     | Subsystem                                               | Shipped |
| ------------------------------------------------------ | ------: | --- | ------------------------------------------------------- | ------: |
| [Campaign](docs/log/features/campaign.md)              |      26 |     | [Party & Characters](docs/log/features/party.md)        |      56 |
| [Collaboration](docs/log/features/collaboration.md)    |       8 |     | [Atlas & Locations](docs/log/features/atlas.md)         |      17 |
| [Player Portal](docs/log/features/players.md)          |      46 |     | [Cartographer & VTT](docs/log/features/cartographer.md) |      31 |
| [Rules Reliquary](docs/log/features/rules.md)          |      20 |     | [Chat & Dice](docs/log/features/chat.md)                |       8 |
| [Content & Import](docs/log/features/content.md)       |       9 |     | [Images & Art](docs/log/features/images.md)             |      16 |
| [Monsters & Bestiary](docs/log/features/monsters.md)   |       9 |     | [Publishing & Export](docs/log/features/publishing.md)  |      52 |
| [NPCs & Companions](docs/log/features/npcs.md)         |      19 |     | [UI & Layout](docs/log/features/ui.md)                  |      20 |
| [Items & Workshop](docs/log/features/items.md)         |      45 |     | [AI Generation](docs/log/features/ai.md)                |      24 |
| [Spells](docs/log/features/spells.md)                  |      34 |     | [Billing](docs/log/features/billing.md)                 |      33 |
| [Factions](docs/log/features/factions.md)              |      10 |     | [Infrastructure](docs/log/features/infra.md)            |      13 |
| [Encounters & Combat](docs/log/features/encounters.md) |      29 |     | [Soundboard](docs/log/features/soundboard.md)           |      23 |
| [Quests](docs/log/features/quests.md)                  |       7 |     | [Miscellaneous](docs/log/features/misc.md)              |       1 |

## Latest features

- Campaign ownership transfer (#180) — a DM can hand a campaign to any member; the RPC re-stamps `user_id` acros… — [Collaboration](docs/log/features/collaboration.md)
- The board answers live use: designer round 2 plus a session's worth of field reports (#572, red… — [Soundboard](docs/log/features/soundboard.md)
- Perform and Arrange: the card becomes a fire target, and Spotify stops pretending to be one (#5… — [Soundboard](docs/log/features/soundboard.md)
- Scenes become their own category, and the prep controls say what they actually do (#572, redesi… — [Soundboard](docs/log/features/soundboard.md)
- "Why is this playing?" is answerable, and the mixer stops being a junk drawer (#572, redesign f… — [Soundboard](docs/log/features/soundboard.md)
- A curated sound library ships with the app, and it is free on every tier (#572 phase 3) — 800+ … — [Soundboard](docs/log/features/soundboard.md)
- Shared playback: the DM can stream the music slot to remote players (#572 phase 6) — the market… — [Soundboard](docs/log/features/soundboard.md)
- Ambient scenes stack instead of replacing each other (#572, phase 2 leftover) — `activeAmbientP… — [Soundboard](docs/log/features/soundboard.md)
- Encounters and locations drive the audio, bound by theme label (#572 phase 5) — encounter runne… — [Soundboard](docs/log/features/soundboard.md)
- Fire-by-search palette and a real hotkey registry (#572 phase 4) — buttons you can hit without … — [Soundboard](docs/log/features/soundboard.md)

---

## AI Features

BYOK (Bring Your Own Key) — DM enters their OpenAI key in Campaign Settings → AI Assistant tab. Calls are made browser-side directly to OpenAI using the DM's key. No quota enforcement or Edge Functions needed at this stage.

**Infrastructure shipped:**

- `src/ai/` module: `types.ts`, `prompts.ts`, `useNpcGeneration.ts`, `NpcGenerateDialog.vue`
- `openai_api_key` + `ai_setting_prompt` columns on `campaigns` (migration `20260330100000`)
- Campaign Settings → "AI Assistant" tab in the Edit Campaign modal (`CampaignSwitcher.vue`): key input + campaign setting prompt textarea
- "Generate" button appears on the NPC form when an API key is configured
- Note: `CampaignSettingsView.vue` is dead code (never registered in the router) — all campaign config lives in the modal

**Security & Storage:**

- [x] **API key encryption** — AES-256-GCM via Supabase Edge Function (`api-key-vault`); keys stored as `enc:v1:<iv>:<ciphertext>` in DB; encryption secret held in Supabase env (not in code/DB); `decryptApiKey()` transparently handles legacy plaintext; backward compatible (irongollem/grimoire#51)
- [x] **Local-only storage option** — checkbox in AI tab; when enabled, key stored only in `localStorage`, DB set to `null`, warning shown that key is device-specific; when disabled, key encrypted to DB, localStorage cleared
- [x] **BYOK-local secure vault (encrypted at rest, never sent to us)** — local mode previously stored the provider key as plaintext in `localStorage` (and a decryption bug meant any legacy `enc:v1:` blob was sent raw in the `Authorization` header, breaking client-side generation entirely). Replaced with `src/lib/localKeyVault.ts`: a non-extractable AES-GCM `CryptoKey` held in IndexedDB (browser lets JS use it but `exportKey()` throws, so the raw key can never be dumped from storage), keys stored as `lck:v1:<iv>:<ct>`. All client-side AI happens in the browser; the key never reaches our servers — we only log token usage via `logUsage` (`amount:0, is_byok:true`) for cost-model analytics. `loadProviderKeys` (`campaign.ts`) decrypts into the in-memory store ref and auto-migrates legacy plaintext / `enc:v1:` local values into the vault on first load. Honest threat model documented in the module: protects at-rest/exfiltration/post-logout reads, not active XSS (CSP is the control there); not synced across devices by design. Vitest round-trip + tamper tests (`localKeyVault.test.ts`, fake-indexeddb). (`src/lib/localKeyVault.ts`, `src/stores/campaign.ts`, `src/components/campaign/AiTab.vue`)
- [x] **Clear / remove a BYOK key** — the AI tab key inputs could only _replace_ a key (blank = keep), with no way to delete one and fall back to platform credits. Added a per-provider **Clear** affordance (with **Undo**) that stages removal; a cleared provider immediately drops out of the active-provider pickers (reverting to "use our AI · platform credits") and is deleted from both `localStorage` and the DB on save. (`src/components/campaign/AiTab.vue`)
- [x] **Storage bucket MIME + size limits** — `npc-portraits` and `asset-images` buckets restricted to image MIME types (jpeg/png/webp/gif/avif/svg) with a 3 MB cap; `sounds` bucket restricted to audio MIME types with a 20 MB cap; enforced at the Supabase storage layer (API-level, not just client-side); `SoundForm.vue` file input also restricted to explicit audio MIME types (no `.mp4` in picker) with a matching 20 MB client-side guard
- [x] **Centralised storage handler + webp-only image buckets** — every bucket interaction routes through a typed `BUCKETS` registry + `uploadToBucket()` / `removeByPublicUrl()` helpers in `src/lib/storage.ts`. Single source of truth for bucket id, max size, MIME allowlist, and public flag — mirrors the SQL migration server-side config so client-side validation fails fast with a useful error instead of a generic storage 400. All four image buckets (`npc-portraits`, `asset-images`, `spell-images`, `puzzle-images`) tightened to `image/webp` only since every upload path already converts to WebP via `toWebP()` or `b64ToBlob` — closes the loophole where API clients could push raw jpegs / pngs / svgs by skipping the converter. `puzzle-images` got a proper migration too (was created out-of-band and only existed in code). Migrated NPC / Monster / Item / Puzzle / Spell generators + `useImageUpload` + `RichTextEditor` + `FactionDetailView` (which previously uploaded raw `File` without WebP conversion).
- [x] **Edge-function hygiene batch** ([#495](https://github.com/irongollem/grimoire/issues/495)) — brought six authenticated generator endpoints in line with the project's stated CORS policy: `generate-npc`, `generate-location`, `generate-entity-image`, `generate-chronicle-text`, `generate-music`, and `style-map` now use the origin-allowlist helper in `_shared/cors.ts` (`corsHeaders(req)`) instead of a hardcoded `Access-Control-Allow-Origin: *`, matching the sibling functions (`generate-trap`, `freesound-search`). Stopped reflecting raw upstream provider error text to clients on the 5xx path in `generate-npc`, `generate-location`, `generate-music`, and `freesound-search` — the detail is now `console.error`'d server-side and a generic message is returned (no more leaking provider/model internals or a 500-char upstream body slice). Added the missing trigger-fn EXECUTE revoke for `notify_marketing_rebuild()` (migration `20260710000003`), matching the sibling trigger-grant hygiene in `20260629000003` and clearing advisor lint 0028/0029. Deferred (issue #495 items 2 & 3, kept open): the BYOK suspension/velocity freeze gate and centralising the `campaign.ai_enabled` check across all generators — both need shared-helper refactors that reach beyond this batch's touched files and risk regressions in the credit-reservation flow.

### Text generation — OpenAI (gpt-4o-mini for structured output)

- [x] **NPC generation** — concept prompt → full NPC (name, race, alignment, age, occupation, appearance, personality, backstory, DM notes, status, relationship, tags) + portrait image prompt. Populates the NPC editor form. Personality uses D&D 5e sections (Personality Traits / Ideal / Bond / Flaw) as Tiptap h3 headings.
- [x] **Monster generation** — concept prompt → full stat block (name, type, size, alignment, habitat, tags, description, DM notes, and complete MonsterStatBlock: AC, HP, speed, ability scores, saving throws, skills, immunities/resistances, senses, languages, special abilities, actions, bonus actions, reactions, legendary). Optional CR/type/size constraints lock specific values while AI fills the rest. Populates the Bestiary editor form.
- [x] **Spell generation** — concept prompt → custom spell with name, level, school, casting time, range, components/material, duration, concentration/ritual flags, attack/save mechanics, damage rolls, healing dice, AoE shape/size, condition inflicted, full description + at-higher-levels, classes, tags, and optional spell-effect art. Optional level/school constraints lock those values. Populates the Spellbook editor form via shared `spellAiAdapter` (with enum guarding + Special-fallback for off-list casting times / durations / ranges). Generator surfaced as a "Generate" button + slide-in panel on `/spells`, plus an inline dialog on the spell editor. (issue #44)
- [x] **Structured campaign context in AI prompts** — extracted the per-call `${SYSTEM}\n\nCampaign setting context provided by the DM:\n${settingPrompt}` concatenation into a shared `buildCampaignContext({ setting, tone, threads })` helper in `src/ai/prompts.ts`. Each section becomes a `## Heading` block (mirroring the NPC personality format), empty fields are dropped so token cost scales with what's actually filled, and the helper is the single hook every generator (NPC, Monster, Item, Puzzle, Spell, future Quest Hooks) calls when assembling the system prompt. Sets up the foundation for tone + active-threads to land alongside quest-hook generation.
- [x] **Markdown paste support in RichTextEditor** — pasting text containing markdown block syntax (`## headings`, `- bullets`, `1. ordered lists`, `> blockquotes`, `**bold**`, `*italic*`) is auto-converted to Tiptap nodes. Plain text paste is unaffected.
- [x] **Roll Table generation** — concept prompt + die (d6/d8/d10/d12/d20) → complete Dungeon Craft roll table (name, CR-tier tags, description, gap-free entries covering 1–N) with tonal variety (combat / environmental / social / weird). Grounded in the campaign setting via `buildCampaignContext`. Text-only generator (`useRollTableGeneration.ts`) registered with the AI badge; surfaced as a "Generate" button + slide-in preview panel on the Dungeon Craft → Roll Tables tab. Validates ranges before create (regenerate on invalid output); encounter linking is wired manually after creation. (issue #334)

### Image generation — OpenAI gpt-image-1.5

- [x] **NPC portrait generation** — auto-generated as part of NPC generation; uploaded to `npc-portraits` Supabase Storage bucket.
- [x] **AI provider abstraction** — extracted all hardcoded OpenAI fetch calls into `TextProvider`/`ImageProvider` interfaces with `getTextProvider()`/`getImageProvider()` factories in `src/ai/providers/`. Generators read API key and campaign setting from stores internally; zero params needed at call sites. `b64ToBlob` shared utility in `src/ai/utils.ts`. NPC generation gains alter ego toggle (disguise name + inpainted portrait), image-skip toggle, and always-present `disguise_name`/`disguise_image_prompt` schema fields (null when not requested).
- [x] **Selectable image model + Google "Nano Banana 2"** (`gemini-3.1-flash-image`) — campaigns pick their image provider in Settings → AI and it now applies to **every** generator (previously only NPC honored `image_provider`; chronicle/entity/location/trap/map hardcoded OpenAI). New `supabase/functions/_shared/imageGen.ts` exposes one `generateImage()` across openai / openai-mini / falai / gemini (gemini + openai compose reference images via edits; fal.ai is generate-only) plus `resolveImageProvider()` owning key fallback, model selection (incl. the OpenAI client sub-model override) and the credit multiplier; all 6 image edge functions refactored onto it. Client BYOK path gains `createGeminiImageProvider` (generateContent: `responseModalities` + `imageConfig`, reference images as `inline_data`). Migration `20260609000004` enables gemini image in `provider_config` (multiplier 1.0) + an `ai_model_pricing` row ($0.50/M in, $60/M image-out, ~$0.067/1K image). The picker shows per-provider speed (gpt-image 1–3 min vs Gemini ~8–15 s) and ≈ credits/image.
- [x] **Admin-controlled image quality/resolution per provider** — previously Gemini was hardcoded to `imageSize: "1K"` (its lowest tier) and OpenAI sent no `quality` (defaulted to `auto`), so the platform's image fidelity couldn't be tuned for pricing. New `image_quality` column on `provider_config` (migration `20260613000005`) surfaces a per-provider quality lever in the admin Providers → Image card: OpenAI `low/medium/high/auto` (sent as `quality`), Gemini `1K/2K/4K` (sent as `imageConfig.imageSize`). Vocabulary + validation live in `_shared/imageGen.ts` (`OPENAI_QUALITIES` / `GEMINI_IMAGE_SIZES`); threaded through `resolveImageProvider().imageQuality` → `generateImage({ quality })` across all 6 server image functions. Seeded comparable defaults (`openai='high'`, `gemini='2K'`). Note: higher quality raises **real** token-based cost (`ai_generation_costs` view) but not the flat credits charged — bump `image_multiplier` to protect margin. Server path only; BYOK local mode keeps provider defaults.
- [x] **Gemini scene/character style booster** — at 2K, Gemini-flash still rendered flat vs OpenAI: it follows the shared `image_base` prompt literally (which asks for "muted, restrained, avoid cinematic"), while gpt-image's baked-in painterly bias overrides it. Resolution can't fix a lighting/shading-model gap. Added `GEMINI_STYLE_BOOSTER` in `_shared/imageGen.ts` — a dramatic-lighting/depth/chiaroscuro suffix appended to the prompt **only** when provider is Gemini and `boostStyle: true` is passed. Wired `boostStyle: true` into the illustrative calls (entity, npc true+disguise portraits, trap, location image, chronicle scene); deliberately **off** for maps (style-map, location map) since dramatic lighting ruins top-down cartography. OpenAI output unchanged. Gemini "pro" image tier was considered but rejected — 2× cost with no clear quality gain over flash for this style.

**Cost estimates (approximate):**

| Feature                 | Model                    | Est. cost/call |
| ----------------------- | ------------------------ | -------------- |
| Monster/NPC generation  | claude-haiku-4-5         | ~$0.003        |
| Description enhancement | claude-haiku-4-5         | ~$0.001        |
| Portrait generation     | FLUX Schnell (Replicate) | ~$0.003        |
| Token art               | FLUX Schnell             | ~$0.003        |
| Scene art               | FLUX Dev                 | ~$0.025        |

**Free tier quota:** 10 AI calls/month. **Pro quota:** 200 calls/month included; additional packs purchasable.

---

## Monetization

Grimoire is currently a free, open-source DM toolkit. As the feature set matures (especially AI and collaboration), a sustainable monetization model is needed.

### Recommended Model: Open-Core Freemium

Keep the core DM tooling free forever (open source). Gate AI features, advanced collaboration, and higher limits behind a **Pro** subscription.

**Free tier (always free):**

- 1 active campaign
- All core DM tools (notes, calendar, bestiary, spellbook, item vault, encounters, quests, atlas, card forge, token forge)
- Up to 100 entities per type (NPCs, monsters, items, spells)
- Player portal (all collaboration features)
- 10 AI calls/month
- Scriptorium with PDF export (watermark-free)

**Pro tier (~$7/month or ~$60/year):**

- Unlimited campaigns
- Unlimited entities
- 200 AI calls/month included
- BYOK (Bring Your Own Key) — use your own Anthropic/OpenAI key, bypass quota
- Early access to new features
- Priority support

**AI Add-on (usage-based, available to all tiers):**

- Purchase packs of 100 AI calls for ~$2 (pro-rated cost + margin)
- Enables casual free users to access AI without full Pro commitment

### Payment Stack

| Tool                        | Role                                                   | Why                                                                                                              |
| --------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Stripe**                  | Payments, subscriptions, invoicing                     | Industry standard; excellent webhook support; Stripe Billing handles trials, upgrades, downgrades, cancellations |
| **Stripe Customer Portal**  | Self-serve subscription management                     | No custom billing UI needed                                                                                      |
| **Polar.sh**                | Optional: open-source sponsorship + one-time purchases | Developer-friendly; good for OSS projects; can run alongside Stripe                                              |
| **Supabase Edge Functions** | Stripe webhook handler                                 | `stripe-webhook` Edge Function updates a `subscriptions` table on Supabase                                       |

**Implementation steps:**

1. Add `subscription_tier` (`free` | `pro`) and `stripe_customer_id` to the `profiles` / `auth.users` metadata table.
2. Stripe webhook Edge Function: listen for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` → update `subscription_tier`.
3. Gate Pro features client-side (UX) AND server-side (Edge Function `check_quota` RLS/middleware).
4. Add `/settings/billing` page: current plan, upgrade/downgrade button (Stripe Customer Portal link), AI usage this month.
5. Free tier enforcement: enforced at Supabase Edge Function level for AI calls; campaign/entity limits enforced at DB level via a check constraint or application logic.

### Pricing Rationale

- $7/month is below the "impulse buy" threshold for hobbyist DMs; comparable to D&D Beyond Master Tier.
- Annual plan at $60 (~29% discount) improves cash flow and reduces churn.
- AI Add-on lets free users try AI without commitment, converting some to Pro.

---
