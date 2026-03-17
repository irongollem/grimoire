# Grimoire — Feature Roadmap

## In Progress / Next Up

- [ ] Scriptorium visual assets (page border PNG, chapter art) — see `ASSETS_PROMPT_LIST.md`

---

## Core Features (Complete)

### Campaign Management

- [x] Campaign Dashboard — live stat cards, active quests, party at a glance (HP bars, passive scores, conditions/curses), pinned + recent notes
- [x] DM Notes tracker (Tiptap editor, categories, tags, pinning)
- [x] Faerûn Calendar / timeline (Calendar of Harptos, adapter pattern for future settings)

### Content Creation & Homebrew

- [x] Scriptorium — Homebrewery-style editor, OneDnD 2024 PHB preview + PDF export
- [x] Scriptorium import engine — convert NPCs / monsters to Scriptorium documents
- [x] Scriptorium asset insert panel — browse and inject NPCs / monsters / locations as new pages
- [x] Image controls in Scriptorium editor (size presets S/M/L/XL, float left / center / right)

### Game Entities

- [x] NPC tracker with full stat blocks, portrait upload, TraitSection editor
- [x] Bestiary — monster builder with 12 SRD template presets + full SRD bundle
- [x] Item Vault — full CRUD with 15 item types, 7 rarities, weapon damage dice, charges, attunement, image upload, card printing
- [x] Spellbook — full CRUD with school/level/class filters, Spell Level Advisor, attack mechanics, AOE, conditions, card printing
- [x] Atlas (Locations) — recursive hierarchy (world → plane → continent → region → city → town → building → room), Tiptap description, Scriptorium formatter
- [x] Atlas — "Populate Setting" button seeds iconic locations from the active campaign's setting (Faerûn: ~70 locations, Greyhawk/Eberron/Dragonlance: ~15–20 each)
- [x] Atlas — Parent picker in location editor with live breadcrumb updates

### Encounters & Combat

- [x] Encounters — builder (combatants + NPC combatants, factions, XP difficulty calculator with ally offset)
- [x] Encounter Runner — live combat with initiative, HP, conditions, death saves
- [x] Named curses in encounter runner (separate from flat conditions, syncs back to party on end combat)
- [x] End-combat sync — HP, conditions, curses, and death saves written back to party_members

### Quests & Adventures

- [x] Quests — full CRUD with kanban + list view, objectives checklist, sub-quests
- [x] Quest giver/location linking with item & encounter reward references
- [x] Player quest visibility (DM shares individual quests to player portal)
- [x] Player quest notes table with private/shared toggles per entry
- [x] Adventure Journal — player personal journal with 6 categories, context linking, private/shared entries
- [x] Scriptorium formatter for quests (title, status, objectives, notes)

### Party & Character Management

- [x] Party Tracker (initiative, HP, conditions, curses, death saves, passive skills)
- [x] Companions system (familiar/animal_companion/mount/ally/sidekick with source linking)
- [x] Companion cards in Party Tracker (HP, AC, conditions, source links)
- [x] Companions in Encounter Runner initiative
- [x] Party inventory — shared table with DM + player item management
- [x] Player character sheet — interactive D&D Beyond-style sheet with ability/save/skill rolls → campaign chat
- [x] Character sheet inventory (My Items / Party Stash split, equip toggle, attack/damage rolls)
- [x] Loot drops in chat — items droppable as cards with Claim / To Stash actions (real-time sync)

### Printing & Export

- [x] Card Forge — MTG (63×88mm) and Tarot (70×120mm) print-ready cards with duplex alignment
- [x] Card Library — localStorage save/load named collections across all card types

### Collaboration & Multi-Player

- [x] **Phase 1**: campaign_members + campaign_invites tables, DM auto-membership, invite link flow (/join/:token), role-based router guard, Campaign Settings UI
- [x] **Phase 2**: Player portal (/play/\* routes), presence indicators (online dots), notes/quest visibility flags, party inventory (players read), campaign broadcast system, campaign chat + dice roll log (Supabase Realtime)
- [x] **Phase 3**: encounter_state table, live encounter sync (DM "Go Live" button), PlayerEncounterView (initiative, HP, active combatant), live encounter indicators, state persists across navigation
- [x] **Phase 4**: Interactive player character sheet (ability/save/skill rolls in campaign chat, HP ±buttons, death save pips, condition toggles), inventory management (My Items, Party Stash, equipped weapons), RLS for player-owned updates, broadcast notifications

---

## Planned (Backlog)

### Quests

- [ ] **Quest triggers** — `quest_triggers` table: quest_id, trigger_type (quest_complete / objective_done), offset_days, action_type (create_calendar_event / send_broadcast), action_payload JSONB. Example: "5 days after this quest completes, create a calendar event"

### Items & Magic Items

- [ ] Scriptorium formatter for items (stat block style: name, type line, rarity, attunement, description)
- [ ] Show item details tooltip/expand in chat before claiming
- [ ] Restrict claim button to players who have an inventory (claimed a PC)

### Spells

- [ ] Scriptorium formatter for spells (classic spell card block)
- [ ] Spell list on NPC / monster stat blocks with Spellbook links

### Atlas / Locations

- [ ] **Time-bound locations** — add optional `era_start` / `era_end` year fields; grey-out or hide locations not in current campaign year
- [ ] **Planar locations populate** — second "Populate Planes" button or opt-in checkbox in main populate (21 entries: inner/outer/transitive planes, Sigil)

### Scriptorium

- [ ] **Two-column layout** — CSS `columns: 2` toggle for PHB-style two-column pages
- [ ] **Table support** — Tiptap table extension for stat comparison tables
- [ ] **Visual assets** — page border PNG, chapter art (see `ASSETS_PROMPT_LIST.md`)

### Search & Export

- [ ] **Full-text search** — cross-entity search across NPCs, monsters, notes, spells, items, locations, quests
- [ ] **Campaign export/import** — JSON export of entire campaign data; import to restore or share

### World Bundles & Community

- [ ] **Unified world bundles** — `WorldBundle` interface combining calendar events + locations + key NPCs + starting items per setting
- [ ] **User-uploadable bundles** — allow DMs to upload world bundle JSON for custom settings with client-side validation and import preview

### Tokens & VTT Integration

- [x] **The Mint** (formerly Token Forge) — circular VTT token generator at `/tokens`. Source tabs: Party / NPCs / Monsters / Custom. Ring colour presets + custom picker. Ring width options. Optional curved arc name label. Export 280px / 512px PNG + clipboard copy. Entities without art get an initial-letter placeholder.
- [x] **Token print sheet** — multi-select tokens into a print queue, choose physical size (25mm / 32mm / 50mm), back style (Mystery ? / Mirror front), prints duplex-aligned front + back A4 sheets with column-reversed backs.
- [x] **Coin designer** — SVG coin designer tab in The Mint. Metal selector (Copper/Silver/Electrum/Gold/Platinum) with auto-denomination (CP/SP/EP/GP/PP). Emblem picker (Crown/Cross/Fleur/Star/Anchor/Moon/Diamond/Omega/Knight). Centre value + denomination label. Curved rim inscription via SVG textPath. Live preview. Duplex-aligned A4 print sheet (Small 24mm ×70 / Standard 30mm ×48 / Large 38mm ×35 per sheet).

### Misc

- [ ] **Monster import from external sources** — import tool to pull stat blocks from D&D Beyond or Open5e API directly into Bestiary
- [ ] **Campaign settings page** — set active calendar, current year, campaign name, default location
- [ ] **Crafting system** — allow players to craft items using gear proficiencies, crafting tools

---

## AI Features

AI features are gated behind a Pro tier and proxied through Supabase Edge Functions — API keys never reach the client. Usage is tracked per-user for cost control and quota enforcement.

### Implementation Strategy

**Architecture:**

- All AI calls go through `supabase/functions/ai-*` Edge Functions (Deno). The client calls `supabase.functions.invoke('ai-generate-monster', { body: { prompt } })`.
- Edge Functions hold the API keys (Anthropic, OpenAI) as Supabase secrets — never in the frontend bundle.
- `ai_usage_log` table: `(id, user_id, campaign_id, feature, model, tokens_used, cost_cents, created_at)`. Insert a row after every successful AI call.
- Monthly quota enforced at Edge Function entry: query `ai_usage_log` for current month sum; reject with 429 if exceeded.
- BYOK (Bring Your Own Key): Pro users can store their own Anthropic/OpenAI key in an encrypted `user_settings` column. Edge Functions check for a user key first and use it (bypassing quota) if present.

**Text generation — Claude API (claude-haiku-4-5 for speed/cost, sonnet for quality):**

- [ ] **Monster generation** — DM types a concept ("ancient shadow dragon corrupted by the Far Realm") → Edge Function calls Claude with a structured prompt → returns a full `StatBlock` JSON matching the existing `Monster` type → auto-populates the Bestiary editor for review/save. Uses `claude-haiku-4-5` for cost efficiency.
- [ ] **NPC generation** — concept prompt → NPC with name, race, occupation, personality, backstory, appearance, secret. Populates the NPC editor. Option to also generate a stat block.
- [ ] **Quest hook generation** — setting + party level + optional theme → 3–5 quest hooks with title, summary, giver, potential objectives. One click creates a draft quest.
- [ ] **Description writer** — "Enhance" button in Tiptap editors (notes, location descriptions, NPC backstory): select text → rewrite in vivid D&D prose. Uses in-editor selection as context.
- [ ] **Item generation** — flavour prompt → magic item with name, type, rarity, description, mechanical properties (charges, attunement, damage).
- [ ] **Spell generation** — concept prompt → spell with all fields (school, level, components, casting time, range, duration, description, at higher levels).

**Image generation — dedicated image API:**

- [ ] **Portrait generation** — describe an NPC/monster → generate portrait art. Upload directly to the entity's `portrait_url` / `image_url` in Supabase Storage. Recommended API: **Replicate** (Stable Diffusion XL or FLUX) — cheaper than DALL-E 3, good quality, no content-policy issues for fantasy monsters. DALL-E 3 as fallback for higher-quality single shots.
- [ ] **Token art generation** — generate a tight circular portrait optimised for VTT tokens. Feeds directly into Token Forge. Prompt auto-augmented with "facing forward, dramatic lighting, fantasy portrait style, circular crop".
- [ ] **Scene/location art** — generate a wide establishing shot for a location (for Scriptorium or session notes header image).

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

## Ideas & Distant Future

- [ ] **Open5e spells & items API** — pre-populate Spells and Items modules with SRD content (no runtime API dependency, scrape/bundle only)
- [ ] **Custom calendars** — expand adapter pattern for additional campaign settings beyond Faerûn
- [ ] **SRD imagery** if I (admin) add an image to an SRD monster/NPC/item/spell, make it available to all campaigns as a default option in the image picker, heck wouldnt it be a better idea to have the SRD content in a separate "SRD" section of the DB thats readonly to all players and DM's. That way everyone doesnt need to "import" SRD but can just "enable SRD content" in their campaign settings and have it available everywhere by default
