# Publishing & Output Tools

## Overview

These are DM-only tools for creating physical and printed campaign materials. They appear in the desktop navigation under a "Publishing" or "Tools" group and are not available in the player portal. The tools share a common design: they produce output that can be printed on A4 paper, exported as PNG/PDF, or uploaded to a VTT. None require external software.

---

## Scriptorium (Document Publisher)

Route: `/scriptorium`, `/scriptorium/new`, `/scriptorium/:id`

A "Canva for D&D" document publisher: the DM writes in a themed, editable Tiptap galley (`ScriptoriumEditor.vue`) on the left and sees a live, auto-paginated book on the right, rendered by Paged.js. Content is stored as a stringified Tiptap JSON document in `scriptorium_documents.content`, not HTML or Markdown.

### Document Types

Documents are tagged with a type that drives the colour-coded badge in the list view: Custom, Spell, Monster, Item, Class, Subclass, Species (race), Background, Adventure, NPC Sheet, Location, Quest. See `ScriptoriumDocType` in `src/types/scriptorium.types.ts`.

### Editor and custom nodes

`createScriptoriumExtensions()` (`src/lib/scriptorium/scriptoriumExtensions.ts`) builds the Tiptap extension stack on top of `StarterKit` and the table extensions. Beyond the standard formatting (bold, italic, strikethrough, inline code, H1 to H3, lists, blockquotes, code blocks), the galley has book-specific custom nodes, each its own module under `src/lib/tiptap/`:

- `coverPage`: front cover, inside cover, part divider, back cover blocks, edited through `CoverPageInspector.vue`
- `tocBlock`: a table of contents that Paged.js fills with real page numbers at render time (`src/lib/scriptorium/pagedToc.ts`)
- `descriptiveBlock`: read-aloud boxed text
- `noteBlock`: a callout/note box
- `quoteBlock` and `attribution`: a pull quote and its attribution line
- `wideBlock`: a block that spans both columns
- `columnBreak`: forces a new column
- `pageBreak`: forces a new page (this replaced the old horizontal-rule convention; see `documentContent.ts`'s import-boundary normalization for legacy documents)
- `skipCounting` / `resetCounting`: structural page-numbering controls
- `SpacerVertical` / `SpacerHorizontal`: layout spacers
- `ScriptoriumImage`: the image node, with layout modes (size presets, align, float-left/float-right with text wrap, absolute pin with numeric offsets, gutter-bleed in wrap mode), shown via a floating toolbar when the image is selected
- `BlockId`: a stable per-block id used for click-to-edit (clicking a paragraph in the preview jumps the galley to it), surviving Paged.js's pagination
- `entityEmbed` (`src/lib/tiptap/entityEmbed.ts`): a live-linked NPC/monster/spell/item/location/quest block (see Linked entity embeds, below)

**Insert Block picker** (`BlockPickerPanel.vue`) is the modal that inserts any of the above. **Insert Asset panel** (`AssetInsertPanel.vue`) appends a live-linked NPC/monster/spell/location at the end of the document.

### Linked entity embeds (#915 story 3)

Two paths put an `entityEmbed` node into a document: **Insert Asset** (`AssetInsertPanel.vue`, NPCs/monsters/spells/locations) and **Send to Scriptorium** on an entity's own detail page (`NpcDetail.vue`, `MonsterDetail.vue`, `SpellDetail.vue`, `ItemDetail.vue`, `QuestOverviewLifecycle.vue`), which creates a whole new document whose content is a single `entityEmbed` node (the entity's formatted body already opens with its name) (`buildEntityEmbedDocumentContent`, `src/lib/scriptorium/entityEmbeds.ts`). Either way the node stores only `{ entityType, entityId }`, never a copy of the entity's fields, so the document always shows CURRENT data and never goes stale when the source entity is edited.

Resolution is split across three pieces:

- `collectEntityRefs(json)` / `resolveEntityEmbeds(html, lookup)` (`src/lib/scriptorium/entityEmbeds.ts`) are pure: the first walks a Tiptap JSON document for the unique `{type, id}` refs it holds, the second replaces each placeholder `div[data-type="entity-embed"]` in a rendered HTML string with the entity's current, sanitized body HTML (or a "no longer available" marker), in place, so `data-block-id` and every other attribute on the block survive.
- `useEntityEmbedData(refs, { theme })` (`src/composables/scriptorium/useEntityEmbedData.ts`) fetches every referenced entity UNSCOPED by id (`useQueries`, batched per type, sharing query keys with `useNpc`/`useResolvedMonster`/`useSpell`/`useItem`/`useLocation`/`useQuest` so the cache is shared), resolves the secondary joins the formatters want (an NPC's location name, a quest's giver/location names and objectives, an item's granted spells) in a second dependent pass, and formats each into body HTML via `formatEntityEmbedBodyHtml` (`scriptoriumImport.ts`'s single dispatch point over the same formatter objects `formatNpcForScriptorium` etc. already use).
- `EntityEmbedView.vue` is the node's Vue node view (`VueNodeViewRenderer`): it renders the live, sanitized content inline in the galley, with a small hover toolbar (editable mode only) offering **Open** (routes to the entity's own page) and **Detach** (confirms via `useConfirm`, then replaces the node with its current content as ordinary editable nodes; the entity stops updating the document from that point on).

The preview pane and PDF export stay HTML-string based (Paged.js paginates a string, not live components), so `ScriptoriumEditor.vue` resolves embeds itself: `previewHtml` is `resolveEntityEmbeds(rawHtml, lookup)` where `lookup` comes from `useEntityEmbedData(collectEntityRefs(rawJson))`, both reactive, so the preview and any PDF exported from it re-render automatically when a linked entity's data changes.

`ScriptoriumDocumentView.vue` is the read-only counterpart: it mounts a non-editable `Editor` with `createScriptoriumExtensions()` through `<EditorContent>`, which is enough for `entityEmbed`'s own node view to resolve itself live (no manual `resolveEntityEmbeds` pass needed): `VueNodeViewRenderer` only activates once `editor.contentComponent` is set, which happens on `<EditorContent>` mount regardless of `editable`. It replaced the generic `RichTextViewer` for a quest beat's attached handout in `QuestRunContainedTool.vue`, whose schema had no idea what a `coverPage`, `noteBlock` or `entityEmbed` node was, silently dropping a handout's cover, read-aloud boxes and linked entities at the table.

Nothing in the app writes HTML into `scriptorium_documents.content` any more: every write path is JSON, and since #915 story 2 every read path trusts that. `src/lib/scriptorium/documentContent.ts` is the one module both sides of that boundary go through:

- **`parseStoredContent(content)`** is what `ScriptoriumEditor.vue`'s content loading and `ScriptoriumDocumentView.vue` both call. It does exactly one thing — `JSON.parse`, and throw a typed `UnreadableDocumentError` if the result isn't a Tiptap document. No migration, no HTML fallback: a row that isn't valid current-version JSON is a broken row, not a legacy shape to translate, and both components show a visible "This document could not be read" state (`EmptyState`) rather than handing broken content to Tiptap. The two production documents that predated story 3's write-path change (raw HTML `content` strings) were converted once, not read around forever.
- **`normalizeImportedDocument(row)`** is the import boundary: the one place content can still arrive from outside this app's own editor is World Bundle import (`useWorldBundle.ts`, via `remapScriptoriumDocumentForImport`), since a bundle exported long ago can carry a raw HTML `content` string or a pre-furniture JSON shape. It folds the old lazy v1→v2 (`<hr>` → `pageBreak`) and v2→v3 (decoration nodes and absolute images lifted into `page_furniture`) migrations into one conversion, run once at the edge rather than on every open. `htmlToScriptoriumJson(html)` is exported standalone for converting raw HTML directly (used once to convert the two pre-story-3 production rows).

The `watercolor`, `watermark`, and `artistCredit` Tiptap nodes were deleted in story 2 — they existed only so old content parsed, and the import-boundary normalization now lifts those legacy shapes into `page_furniture` before the schema ever sees them, so nothing needs to keep parsing them. New decorations have only ever been page furniture (see below), never content nodes.

### Page furniture

Watercolour splatters, watermarks, and artist credits are not part of the Tiptap content stream: they live in a sibling `page_furniture` jsonb column (`PageFurnitureItem[]`, see `src/types/scriptorium.types.ts`), anchored to a page or a block and positioned as a percentage of the page box so they survive page-size changes. There is no content-node form of these three kinds any more (see above) — `documentContent.ts`'s import-boundary normalization is the only place that still lifts a decoration out of a document's content, for the pre-story-2 shapes it exists to convert. Dragging one on the live book updates its `x`/`y`/`width` directly; `FurnitureInspector.vue` edits colour, layer (`under/over` the text) and width, or deletes it.

### Themes and page sizes

Two visual themes selectable per document, `onednd2024` (teal/navy, current PHB styling) and `phb2014` (2014 PHB brown/gold): see `ScriptoriumTheme` and `src/assets/scriptorium/theme-*.css`. Page sizes: A4, A5, Letter. An ink-friendly toggle strips backgrounds and decorations before printing/exporting.

### Preview and PDF export

The preview pane renders the real Paged.js pagination live, with zoom controls (fit-to-width, up to 2x, snap-to-fit) and a word count. PDF export (`useScriptoriumPrint.ts`) does not rasterize a screenshot: it renders the document with Paged.js into an off-screen host, serialises the Paged.js-injected page-sizing CSS, and transplants the rendered pages plus every required stylesheet into a hidden same-origin iframe, then calls `window.print()` on it. The user's browser "Save as PDF" then produces a true vector PDF with selectable text and embedded fonts. The iframe is removed after printing and never touches the app's own layout, scroll, or zoom.

### Templates

New documents start from a template, never a blank page (`src/data/scriptoriumTemplates/`): Blank Book, Adventure Module, Monster Compendium, Spell Compendium, Subclass Supplement, One-Page Dungeon, or an imported Markdown file. Each template seeds `doc_type`, initial Tiptap content, and starting settings (theme, page size, tags); every field stays editable afterward.

### Campaign scope (#915)

`scriptorium_documents.campaign_id` is nullable; null means the document is account-wide, set means it belongs to one campaign the DM owns (RLS requires `private.is_campaign_dm(campaign_id)` on insert and update; deleting a campaign sets its documents' `campaign_id` back to null rather than deleting them). A new document defaults to the active campaign; the metadata toolbar's Campaign select (`ScriptoriumMetadataToolbar.vue`, wired in `ScriptoriumEditor.vue`) offers the active campaign or "All my campaigns", and additionally shows the document's own campaign as a third option when it differs from the active one, so saving cannot silently rescope it.

`documentScopeOf` / `isDocumentUsableIn` (`src/lib/scriptorium/documentScope.ts`) classify a document as `campaign` / `general` / `other_campaign` relative to the active campaign, mirroring `itemScopeOf` for the Vault minus the "library" tier (every Scriptorium document is the DM's own). The document list's Scope filter (`scriptoriumFilterScope` in `useUiStore`) uses the same four options as the Vault (Usable here / This campaign / General / Other campaigns), defaulting to Usable here. The quest beat handout picker (`QuestBeatAttachmentsPanel.vue`) narrows to documents usable in the quest's own campaign; a beat already carrying a handout id resolves it unscoped through `useScriptoriumDocument`, since a resolver of a stored id must never re-filter by scope.

### Document list

`ScriptoriumDocumentList.vue` renders a card grid (1 to 4 columns depending on width) with a colour-coded type bar, word count, and the Published badge. Filters are type, scope, and free-text search over title/tags, all held in `useUiStore` (`scriptoriumSearch`, `scriptoriumFilterType`, `scriptoriumFilterScope`, `scriptoriumHasActiveFilters`, `resetScriptoriumFilters`) so leaving and returning to the list does not drop them (#723). The bar is the shared `ListFilterBar` + `ListSearchInput` + `ListFilterSelect`; the doc-type filter is a select rather than a segmented group because the ten types do not fit as joined segments without clipping at md widths, the same call the Bestiary makes for its 14 creature types.

### Publishing and storage

The `is_published` flag is a DM-only status badge (green, in the list) for tracking done versus draft. It does not currently share the document with players or change any access. Documents are owner-only: `scriptorium_documents` RLS is scoped to `user_id`, and the row also carries a `demo_source` marker (set only by the demo-campaign copy machinery, never by the client) that exempts demo copies from the document quota.

### Quota

Document creation is quota-gated (`scriptorium_documents` in `check_quota`/`check_all_quotas`); hitting the limit triggers `PaywallModal`.

---

## Card Forge (Card Printer)

Route: `/forge`

A card-layout and print tool that generates physical trading cards for NPCs, monsters, items, and spells. Cards match standard card game proportions and are designed to be cut out and used at the table.

### Card Sizes

Two formats, selectable at the top of the view:

| Format | Dimensions  | Grid on A4 | Cards per sheet |
| ------ | ----------- | ---------- | --------------- |
| MTG    | 63 × 88 mm  | 3 × 3      | 9               |
| Tarot  | 70 × 120 mm | 2 × 2      | 4               |

### Entity Sources

Four source tabs, each with a searchable, scrollable list and per-source selection count badge:

- **NPCs** — searchable by name, occupation, race
- **Monsters** — searchable by name, type, habitat; subtitle shows size/type/CR
- **Items** — searchable by name, item type, rarity; subtitle shows rarity/type/subtype
- **Spells** — searchable by name, school, class list; subtitle shows level/school

Selections from all four sources aggregate into a single combined `selectedSubjects` list — you can mix entity types freely.

**Select All / None** buttons operate on the current filtered list. Tab count badges show how many cards are selected per source.

### Card Anatomy (per card type)

Every card has a **front** and a **back** component. Front and back are separate sheets when printing.

**NPC / Monster front:**

- Title bar with name + CR or level badge
- Art area (portrait image with focal-point cropping, or glyph placeholder)
- Type line (race · occupation for NPC; size · type for monster)
- Stats strip: HP / AC / Speed
- Ability score grid: STR/DEX/CON/INT/WIS/CHA with modifier
- Footer: entity tags + kind label

**NPC / Monster back:**

- Full stat block rows (skills, saves, resistances, senses, languages, challenge)
- Abilities & Actions section (special abilities and actions, truncated to fit)
- Flavor footer: flavor text + occupation/habitat

**Item front:**

- Title bar with name + rarity badge
- Art area (item image with focal-point cropping, or glyph placeholder)
- Type line (rarity · type · subtype)
- Stats strip: DMG / AC / Charges
- Info grid: weight, value, attunement, tags
- Footer

**Spell front:**

- Title bar with name + level badge
- Art area
- Type line (school · casting time)
- Stats: Range / Duration / Components
- Description text (truncated to fit)
- Footer: class tags

**Back cards** for items and spells show extended description, property list, and flavor text.

**Tarot variants** of all four types use the taller 70 × 120 mm format with adjusted layouts for the larger card body.

Frame color is driven by entity type: each card uses a CSS `--fc` custom property that tints the card border/header.

### Print Layout

- Prints front sheets followed by back sheets
- **Duplex alignment**: back sheets have columns reversed per row so that when the paper is flipped on the long (left) edge, each back aligns with its front
- Cards are padded with empty placeholders to fill the grid
- 1 mm bleed on each side (cards are printed 2 mm oversize and sit with `-1mm` margin so color fully covers cut lines)
- Print CSS is injected into `<head>` at print-time to guarantee `@page { size: A4 portrait; margin: 0; }` is honored by all browsers including Safari
- App chrome (sidebar, header) is hidden during print via `@media print` rules

### Card Library (Saved Collections)

- Named card collections can be saved to and loaded from `localStorage` (key: `cardforge_library`)
- Each collection stores the list of `{ kind, id }` pairs and a creation timestamp
- Load dialog shows all saved collections with card count and date; loading a collection restores full selection state and switches to the tab with the most cards
- Collections can be deleted individually

### Preview

Live card preview grid on screen (screen-sized rendering, separate from print size). Scrollable preview area shows all selected cards as front faces.

---

## The Mint (VTT Token Creator)

Route: `/mint`

Two-tab tool for creating circular VTT tokens and printable prop coins.

### Tokens Tab

Creates round VTT-ready token images from campaign entities.

**Entity sources (sub-tabs):**

- Party, NPCs, Monsters, Custom

Custom source: enter a name and optionally upload a local image file.

**Token preview** — live 220 × 220 px canvas preview (rendered at 512 × 512 px internally).

**Settings per token:**

- **Ring color** — 6 presets (Party blue, Ally gold, Enemy red, Neutral gray, Boss purple, Nature green) plus a custom color picker. Default ring color is preset by source tab (party → blue, NPC → gold, monster → red).
- **Ring width** — Thin / Medium / Thick / Heavy
- **Name label** — toggle on/off; when on, the name is arc-rendered along the bottom of the inner circle with a dark gradient band behind it
- **Export size** — 280 px (Roll20 standard 1 × 1 grid) or 512 px (HD / large creatures)

**Rendering:**

- Entity portrait is clipped to a circle using Canvas 2D
- Focal point from the entity is used to center the subject in the circle, clamped so the image fully covers the inner area
- If no portrait, the entity's initial is shown as a placeholder glyph with a radial gradient background

**Export:**

- Download PNG (named `<entity_name>_token.png`)
- Copy to clipboard (uses Clipboard API where available)

**Print queue:**

- Add individual tokens to a queue, then print a sheet
- Print size: 25 mm (70/sheet), 32 mm (48/sheet), 50 mm (20/sheet)
- Back style: **Mystery** (dark disc with ring color and `?` glyph) or **Mirror** (same image as front)
- Duplex aligned: back sheet columns are reversed per row
- Queue items shown as pill badges; removable individually

### Coins Tab

Designs and prints custom prop coins.

**Controls:**

- **Metal** — Gold (GP), Silver (SP), Copper (CP), Platinum (PP), Electrum (EP), Iron; denomination label auto-updates when metal changes
- **Centre value** — free text (e.g. "10")
- **Emblem / motif** — preset symbol picker (crown, skull, dragon, star, sword, shield, flame, leaf, anchor, moon, sun, eye, plus None); symbols rendered as Unicode glyphs
- **Denomination label** — free text (e.g. "GP")
- **Rim text** — free text curved around the coin edge (e.g. "Kingdom of Arendor")
- **Print size** — Small 24 mm (~70/sheet), Standard 30 mm (~48/sheet), Large 38 mm (~35/sheet)

**Preview:** live SVG coin preview (200 × 200 px screen display).

**Print output:**

- Front sheet filled with copies of the coin design
- Back sheet with columns reversed for duplex alignment
- Printed on A4 at `margin: 0`

---

## Illuminator (Image Effects)

Route: `/illuminate`

A client-side image processing tool for applying photographic and painterly treatments to images before using them in Scriptorium or other outputs. All processing runs in the browser via Canvas 2D — no server round-trip.

**Input:** drag-and-drop or file picker; PNG, JPG, WebP.

### Effect Sections (independently toggleable, collapsible accordion)

**Colour Grading**

- Presets (quick-apply named colour grades)
- Individual sliders: Brightness, Contrast, Saturation, Temperature (warm/cool), Hue rotation (−180° to +180°)
- Reset to defaults

**Vignette**

- Mode: Transparent (alpha fade) or Colour (solid color fade)
- Color picker (in Colour mode)
- Strength and Softness sliders

**Texture Overlay**

- Upload a texture image (drag or file picker)
- Blend mode: multiple canvas compositing modes
- Opacity and Tile scale sliders

**Depth of Field**

- Click the preview canvas to set the focal point (crosshair shown in preview, not in export)
- Falloff curve: Linear, Quadratic, Cubic
- Focus radius, Blur strength, Desaturation sliders (out-of-focus areas can be desaturated)

#### Edge Treatment

- Four independent edges: Top, Right, Bottom, Left
- Each edge has its own enable toggle and controls: Roughness, Fade width, Tear depth, Passes (1–12), Variation
- Active edge count badge shown in parent header

### Export

- Preview renders at up to 900 px on the longest side (for performance)
- Export processes at full source resolution
- Download as PNG (named `<original_filename>-illuminated.png`)
- Copy to clipboard (Clipboard API)
- "Reset all to defaults" resets every section

---

## Reliquary (Rules Reference)

### DM View

Route: `/rules`

A five-tab rules reference and management screen for the DM. Includes a built-in dice roller.

All three searchable tabs keep their query in `useUiStore` — `compendiumSearch`, `manualSearch`, `customRulesSearch` (+ `*HasActiveFilters` / `reset*Filters`) — so switching tabs or leaving the Reliquary does not wipe it, and all three render the same `ListFilterBar` + `ListSearchInput` chrome with a Clear button (#723). In the two sidebar tabs the search sits in the bar's `above` slot so Clear falls beneath it rather than fighting the 16rem column for width.

**Tabs:**

**DM Screen**
Quick-reference panel with common combat tables, conditions, and other at-a-glance information used during play.

**Compendium**
Read-only SRD/Open5e rules browser. Search and browse standard D&D 5e rules content, scoped to the active campaign's ruleset via `useRuleset()`.

**Dual-edition sync (#555, closes #142)** — the `sync-srd-rules` Edge Function was rewritten from the old v1 `/v1/sections/` (2014-only) endpoint to Open5e v2 `/v2/rulesets/` + `/v2/rules/`, synced for both editions. `library_rules` holds 268 rows for 2014 (41 sections + 227 rules) and 67 for 2024 (11 + 56). A ruleset becomes a top-level (parent) row; rules nest under it via `parent_slug`. Cleanup on each sync run is scoped by a provenance marker (`provenance->>endpoint`) so it only ever removes rows this sync previously wrote itself — legacy v1 and abandoned-v2 identities are cleaned this way, and user-authored custom rules are never touched. Deployed on a weekly cron (`supabase functions deploy sync-srd-rules`); admin/service-role manual invocation unchanged (`supabase functions invoke sync-srd-rules`).

**Custom Rules**
DM-authored rules, tables, and house rule documents. Each rule has:

- Title, category, tags
- Rich text content body (Tiptap editor)
- **Player visible flag** — when checked, the rule appears in the player Reliquary portal

Custom rules support an optional **Tracker** bolt-on:

- Two tracker types: **Level** (named states, e.g. Chilled → Frozen → Hypothermic) and **Points** (numeric pool, e.g. 0–20 Sanity)
- Min/Max values, plus an optional Starting value (`TrackerDef.start`, `src/types/rule.types.ts`) for trackers that don't start at their floor, e.g. the demo campaign's Lucidity (0–10, every character starts at 8). Absent, a character with no saved state reads at `min`, same as before this field existed. Every reader of an unset tracker value (the player character sheet, DM tracker buttons, the dashboard rule-tracker widget, and the delta-apply math) goes through the one pure helper `trackerInitialValue()` (`src/lib/rules/trackerValue.ts`), which also clamps a saved `start` into [min, max]
- **Levels** (Level type): each level has a numeric or ability-code value, a name, a color badge, and a list of mechanical effects:
  - Note (label shown on player sheet)
  - Speed penalty (numeric)
  - Disadvantage on ability checks (optional scope: specific abilities or all)
  - Disadvantage on saving throws (optional scope)
  - Exhaustion level (1–6)
  - Saving throw (ability, base DC, optional +tracker value)
- **DM Buttons**: named buttons with a delta value (e.g. "Add Corruption +1", "Cleanse −1") shown in the DM's party panel

**DM Manual**
A set of built-in markdown reference pages loaded from `src/manual/`. Current pages:

- Item Tags Overview
- Item Containers
- Item Ranged Ammo
- Workshop: Crafting Ingredients
- Workshop: Cooking / Food
- Encounters: Monster Discovery

**Licences** (`src/components/rules/LicensesTab.vue`, reachable at `/rules?tab=licenses`)

Per-source attribution for every body of shared content in the database, and the licence texts those licences oblige us to publish. Shipped for #567 as a pre-launch legal gate.

The shape to understand before touching it: most of what we host is **not** WotC SRD. Of ~3,540 shared monsters only ~660 are SRD; the rest is Kobold Press (OGL 1.0a, except the Black Flag Reference Document which is **ORC**) and EN Publishing (OGL 1.0a). Calling any of it "SRD" in the UI is a licence problem, not a wording nitpick.

- **`content_sources`** (migration `20260729000002`) is the catalogue: one row per `source_document_key` with `title`, `publisher`, `license_keys`, `copyright_notice`, `product_url`, `is_redistributable`, `is_metadata_curated`. Attribution is a join, not 3,500 copies of a copyright line that can drift.
- **`get_content_licenses()`** — `SECURITY INVOKER`, no args. Returns one row per source that actually has content, with per-kind tallies (monsters/spells/items/species/rules/classes) joined to the catalogue. The join is `LEFT` on purpose: an uncatalogued source surfaces as "Uncatalogued source" rather than disappearing from the page whose job is proving nothing is unattributed.
- **`src/data/ogl.ts`** — the OGL 1.0a text, verbatim, machine-extracted from the Open Gaming Foundation's canonical copy. Section 10 requires we ship it. **Never reword or regenerate it.** Sections 1–14 render as-is; section 15 is rebuilt at render time from the `copyright_notice` of every OGL source present, because section 6 requires the chain to name each work we actually copy.
- **`src/data/licenses.ts` / `src/lib/library/contentLicenses.ts`** — licence descriptors and the pure grouping/§15-chain helpers (unit-tested).
- **`is_metadata_curated`** — rows where upstream metadata is wrong or absent and we maintain them by hand. `scripts/seed-content-sources.ts` skips them. This is what stops a re-seed silently reverting Black Flag's licence from ORC to Open5e's incorrect CC-BY tag.
- **Audio** (`get_audio_licenses()`, migration `20260729000003`, `AudioLicenseCard.vue`) — the tab also covers the soundboard's shipped catalogue: 802 sounds, of which **82 are CC-BY and legally require credit**. Grouped by `(license, source)` rather than modelled into `content_sources`, because audio attribution is per-sound and each `sound_library` row already stores a ready-to-display credit line. `attributions` is **null, never `[]`**, for CC0 groups — no credit required is a different state from credits gone missing, and the card says so in words. Per-sound credit still travels onto the DM's board via `SoundCard.vue`; this is the consolidated notice.

Several `source_document_key` values are stale pre-v2 Open5e slugs (`cc`, `menagerie`, `dmag`, `blackflag`, `taldorei`…) that no longer match upstream keys (`ccdx`, `a5e-mm`, `deepm`, `bfrd`, `tdcs`). `LEGACY_DOCUMENT_KEY_ALIASES` in `src/lib/library/open5eApi.ts` maps between them — any data-driven backfill that skips it matches nothing.

### Player View

Route: within player portal (`/play/...`)

File: `src/views/play/PlayerReliquaryView.vue`

A read-only rules reference for players. Tabs:

- **Reference** — same ScreenTab as DM view (quick reference tables)
- **Compendium** — same compendium browser
- **Codex** — character codex (species, backgrounds, classes, archetypes, abilities)
- **House Rules** — shows only custom rules where `is_player_visible` is true
- **Licences** — same LicensesTab as the DM view; the notices have to be reachable by everyone who sees the content

Players cannot create or edit rules.

---

## Key Capabilities / USPs

- **All output is print-ready in the browser** — no external software, no PDF service. The browser's print dialog is the only dependency for physical output.
- **Duplex alignment is automatic** — Card Forge and The Mint both reverse columns on back sheets so double-sided printing works correctly on any printer with long-edge flip.
- **Card Forge aggregates across all entity types** — a single print run can mix NPCs, monsters, items, and spells. Most similar tools require one entity type per export.
- **Card Library persists named collections** — the DM can save a boss encounter's card set and reload it next session without re-selecting.
- **Scriptorium produces genuinely styled output** — not raw HTML. The preview matches the chosen PHB theme (teal/navy 2024 or classic 2014) with two-column layout, ornamental headers, and proper page dimensions.
- **Scriptorium images have professional layout controls** — float left/right with text wrap, absolute pin positioning, gutter bleed, and multiple size presets; comparable to desktop DTP software.
- **Token focal-point awareness** — portrait images in tokens use the same focal-point metadata set on the entity, so the face stays centered in the circle even for off-center portraits.
- **Illuminator runs entirely client-side at full resolution** — no upload, no service. Edge treatment, depth of field, colour grading, and texture overlay are all composited in Canvas 2D.
- **Custom Rules with Trackers integrate into the live session** — a rule like "Corruption" can define named levels, mechanical effects, and DM control buttons that appear directly in the party tracker during play.

---

## Data Fields / Storage

| Tool         | Storage                                  | Key fields                                                                                    |
| ------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| Scriptorium  | Supabase `scriptorium_documents`         | title, content (Tiptap JSON), doc_type, tags[], is_published, word_count                      |
| Card Forge   | localStorage only                        | `cardforge_library` — array of `{ id, name, created, items: [{kind, id}] }`                   |
| The Mint     | No persistence                           | All token/coin state is session-local                                                         |
| Illuminator  | No persistence                           | All image processing is session-local                                                         |
| Custom Rules | Supabase `custom_rules` (via `useRules`) | title, category, tags[], content (Tiptap JSON), is_player_visible, tracker (JSONB TrackerDef) |
