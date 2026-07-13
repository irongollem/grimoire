# The Interlude — art briefs

Generation briefs for the 21 canonical images The Interlude needs (#486). Everything here is **our own content** — none of it is SRD material, despite the `srd/` storage prefix (see "Where the files go").

## ✅ All 21 shipped

Every image is live in `downtime-images/srd/` and wired into `src/data/`. **Zero `null` art slots remain.**

| Set | Count | Lands on |
| --- | --- | --- |
| Archetype card faces | 8 | `DowntimeActivity.artUrl` |
| Seed NPC portraits | 6 | `npcs.portrait_url` when the seed is drawn |
| Seed item images | 7 | `items.image_url` when the seed is drawn |

The 9 note-yielding seeds get none — `notes` has no image column.

The procedural `accent` + `glyph` face remains as the fallback in code, so a missing or failed image still degrades gracefully rather than rendering an empty frame.

**Pit Fighting was regenerated** after the first pass put a POV fist and sword in the bottom third, under the title scrim. The v2 clears it to empty churned sand, matching the other seven. It was upserted over the same path — a CDN edge may briefly serve the old one.

---

## Where the files go

| | |
| --- | --- |
| Bucket | `downtime-images` (migration `20260713000002`) |
| Path | `downtime-images/srd/<filename>.webp` |
| Who can write | **App admin only.** The bucket has *no* per-user upload path — every image is canonical. |
| Who can read | Public |
| Format | **webp**, portrait **1024×1536** (2:3), ≤5 MB |

**Never store these under a user UUID.** If that account changes, every canonical URL in the DB breaks. That's the actual rule from `CLAUDE.md` — `srd/` is just this codebase's existing *name* for "canonical, shared, admin-managed", inherited from when the only shared content was SRD.

**No new table is needed.** The archetype catalog and the seed library are static TS files, so the URL is a plain string in code. (An `srd_*` table would only be needed if DMs could reskin the system deck per-campaign — which they deliberately cannot.)

Cards render `aspect-3/4` and crop via `FocalImage`, so **keep the subject in the upper-middle** and leave headroom; the bottom ~25% is covered by a dark scrim carrying the card's title.

---

## Shared style direction

> Painterly D&D sourcebook illustration. Muted, slightly desaturated palette with one dominant accent colour. Dramatic single-source lighting, deep shadows. Textured, hand-painted feel — visible brushwork, not airbrushed. No text, no lettering, no borders, no frames, no UI. Portrait composition, subject in the upper two-thirds.

Append that to every prompt below. Each brief names its **dominant accent** — lean the palette that way so the deck reads as a set at a glance.

---

## Tier 1 — the 8 archetype card faces ✅ SHIPPED

**Done.** All eight are live in `downtime-images/srd/` and wired into `artUrl` in `src/data/downtimeActivities.ts`. Filenames match the activity `key` (`carouse.webp`, `pit-fighting.webp`, …). Source PNGs → webp @ q82: 17 MB → 948 KB total.

They fill `DowntimeActivity.artUrl` and appear in **four** places: the player Activity Board, the DM prep panel, the resolve panel, and Card Forge.

**`pit-fighting.webp` was regenerated — resolved.** The first pass put a POV fist and bloody sword in the bottom-right, exactly where the card's scrim, title, and stat row land: the one card where the art fought the text. The v2 clears the bottom third to empty churned sand, so all eight now keep the lower third quiet.

These are **scenes, not portraits** — no single recurring character. Think "the moment this activity feels like".

| # | File | Accent | Prompt |
| --- | --- | --- | --- |
| 1 | `carouse.webp` | deep red `#6B1C1C` | A crowded, smoky tavern at the height of the night, seen from just inside the door. Firelight, spilled drink, a table of laughing strangers mid-toast, coins on the boards. Warmth that's one drink away from trouble. |
| 2 | `craft.webp` | bronze `#7A4B12` | A cluttered workbench at night, lit by forge-glow. Half-finished work clamped in place, tools laid out with care, curls of metal and shavings. Nobody in frame but the hands that just left. |
| 3 | `research.webp` | deep blue `#1E3A5F` | A dim archive of towering shelves, one desk lit by a single guttering lamp. Open books, unrolled charts, a stack no one has touched in years. Dust suspended in the lamplight. |
| 4 | `train.webp` | green `#2F5D3A` | A bare practice yard at grey dawn. A weighted dummy, chalk marks on flagstones, a rack of worn wooden weapons. Cold breath, no audience — the unglamorous work. |
| 5 | `business.webp` | gold `#6B5510` | A shopfront counter after closing: an open ledger, a strongbox, stacked coin, a lamp burning low. Prosperous, orderly, and quietly precarious. |
| 6 | `pit-fighting.webp` | blood `#5A1414` | A torchlit fighting pit from the fighter's eye-line. Ring of roaring faces above, sand churned and dark, an opponent's silhouette. Money changing hands in the crowd. **Bottom third is empty churned sand — no hands, no weapon, no foreground figure** (the v2 regen; v1 wrongly put a POV fist and sword under the title). |
| 7 | `lie-low.webp` | slate `#2C3440` | A shuttered attic room at night. A thin blade of moonlight through the boards, a mattress on the floor, a packed bag by the door. Stillness that is not restful. |
| 8 | `pull-a-job.webp` | purple `#3D2159` | A moonlit rooftop above a sleeping city; a rope over the edge, a shuttered window below, a gloved hand steadying on the tiles. All anticipation, nothing committed yet. |

---

## Tier 2 — 13 seed images

These fill `portrait_url` / `image_url` in `src/data/downtimeSeeds.ts`, and land on the **real NPC/item row** minted in the DM's campaign when the seed is drawn.

> **Only 13, not 22.** The other 9 seeds yield **notes**, and the `notes` table has **no image column** — there is nowhere to put art for them. Don't generate any.

### 6 NPC portraits → `npcs.portrait_url` ✅ SHIPPED

**Done.** All six are live in `downtime-images/srd/` and wired into `portrait_url` in `src/data/downtimeSeeds.ts`.

Three came in two versions. What was picked, and why:

| Seed | Picked | Why |
| --- | --- | --- |
| Fence | **v2** | The brief is "dressed one notch too well for the tavern she's drinking in" — v2's crimson-and-gold coat sells that instantly; v1's drab brown does not. v2 also puts a tavern behind her. |
| Guild recruiter | **v2** | Reads as *guild* at a glance (banner + insignia + compass brooch), and more "immaculate, unhurried". v1 is a fine swap — its open ledger and coins lean harder into "transactional" — but portraits crop tight in lists, where that context is lost anyway. |
| Debt collector | **v2** | v1 is a **setting break**: necktie, frock coat, and a gas lamp over a city arcade — that's Victorian, not D&D. v2 (hooded cloak, buttoned tunic, leather ledger, stone arch) is the only usable one. |

The other three (rival duelist, disgraced sage, noble) came as single versions and all landed — the duelist's scar and open laugh, the sage's wire-mended spectacles and ink-stained fingers, the noble's signet ring turned inward.

Character portraits: head-and-shoulders to waist-up, subject making eye contact with the viewer, plain suggestive background.

| # | File | Prompt |
| --- | --- | --- |
| 9 | `seed-fence.webp` | **Sela Quillfeather**, half-elf fence, middle-aged. Wiry, sharp-featured, cool grey eyes. Dressed one notch too well for the tavern she's drinking in. Idly turning a copper coin over her knuckles. Reads a price on you before you've spoken. |
| 10 | `seed-rival-duelist.webp` | **Corvin Ashglass**, human duelist, late twenties. Broad-shouldered, sunburnt, a duelling scar he is far too proud of. Caught mid-laugh, open and unguarded. Competitive about everything, resentful about nothing. |
| 11 | `seed-disgraced-sage.webp` | **Emeric Vann**, human scholar, older than his years. Threadbare academic robes, ink-stained fingers, spectacles mended with wire. Apologetic, precise, slightly haunted. |
| 12 | `seed-guild-recruiter.webp` | **Marisette Dow**, halfling guild recruiter. Immaculate, unhurried, a ledger within arm's reach. Smiling precisely as much as the conversation requires — warm on the surface, transactional underneath. |
| 13 | `seed-debt-collector.webp` | **Bran Otwell**, human debt collector. Deliberately unremarkable in every way — that's the point. Soft-featured, plainly dressed, immaculate ledger held closed. Scrupulously fair and entirely without mercy. |
| 14 | `seed-flirtatious-noble.webp` | **Lucien Voss**, bored young noble. Beautifully dressed but deliberately underdressed for their station. A signet ring turned inward to hide the crest. Delightful, charming, wholly unreliable. |

### 7 item images → `items.image_url` ✅ SHIPPED

**Done.** All seven are live and wired. A drawn Craft, Pit Fighting, or Pull a Job seed now mints an item that already has a picture.

Single object, centred, on a plain dark background. Museum-plate lighting — let the object be the whole picture.

| # | File | Prompt |
| --- | --- | --- |
| 15 | `seed-masterwork-tools.webp` | **Masterwork Artisan's Tools** — a roll of hand-fitted tools, worn leather, balanced to one person's grip. Better than anything shop-bought. A quiet maker's mark stamped in the steel. |
| 16 | `seed-handmade-charm.webp` | **Handmade Charm** — a small, modest enchanted trinket, clearly hand-bound rather than professionally made. A faint, honest glow. Slightly imperfect, and better for it. |
| 17 | `seed-well-forged-blade.webp` | **Well-Forged Blade** — a plain longsword of honest, careful make. No enchantment, no ornament, no glow. Just very good steel that will never be the thing that fails you. |
| 18 | `seed-champions-token.webp` | **Champion's Token** — a carved wooden or bone token given to the winner of a fighting pit. Worn smooth by handling, scuffed, sweat-darkened. Worth little; proves much. |
| 19 | `seed-confiscated-blade.webp` | **Confiscated Fighting Blade** — a nicked, well-used shortsword nobody claimed after the bout. Chipped edge, wrapped grip, honest wear. It has seen more pits than you have. |
| 20 | `seed-the-score.webp` | **The Score** — a single stolen valuable someone will eventually miss. Beautiful, portable, and conspicuously not yours. Deliberately non-specific so a DM can reskin it. |
| 21 | `seed-botched-haul.webp` | **Half-Botched Haul** — a hastily bundled grab-bag of whatever could be carried before the whistles started. Mismatched, spilling slightly open. Worth a little coin, and evidence besides. |

---

## Wiring them up once generated

1. Upload to `downtime-images/srd/<filename>.webp` **as an app admin** (the bucket rejects everyone else).
2. Paste the public URL into the matching entry:
   - Tier 1 → `artUrl` in `src/data/downtimeActivities.ts`
   - Tier 2 → `portrait_url` / `image_url` in `src/data/downtimeSeeds.ts`

The slots already exist and are `null`. No schema change, no code change — just swap the null for the URL.

**The AI airlock never accepts an image URL from the model** (`downtimeAiSeed.ts`): an AI-drafted contact or item always gets `null`, because a model-supplied URL would be an unvalidated remote reference. Art comes from the canonical bucket or not at all.
