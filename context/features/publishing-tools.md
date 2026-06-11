# Publishing & Output Tools

## Overview

These are DM-only tools for creating physical and printed campaign materials. They appear in the desktop navigation under a "Publishing" or "Tools" group and are not available in the player portal. The tools share a common design: they produce output that can be printed on A4 paper, exported as PNG/PDF, or uploaded to a VTT. None require external software.

---

## Scriptorium (Document Publisher)

Route: `/scriptorium`, `/scriptorium/new`, `/scriptorium/:id`

A document publisher that produces output styled after the official D&D books. The DM writes in a rich Tiptap editor on the left and sees a live paginated preview on the right.

> **Re-architecture in progress** — see [`SCRIPTORIUM_PLAN.md`](../../SCRIPTORIUM_PLAN.md) (repo root). The Homebrewery-style two-pane model is being rebuilt as "Canva for D&D": themed editable galley + live auto-paginated book (Paged.js), vector PDF export, template gallery, and drag-on-page decorations. Phases A–E tracked in the Scriptorium EPIC GitHub issue; this section describes the _current_ shipped behavior and is updated as phases land.

### Document Types

Documents are tagged with a type that drives the colour-coded badge in the list view:

- Custom, Spell, Monster, Item, Class, Subclass, Species (race), Background, Adventure, NPC Sheet, Location, Quest

### Editor Features

- **Tiptap rich text editor** with the full common toolbar: bold, italic, strikethrough, inline code, H1–H3, bullet list, ordered list, blockquote/callout, code block
- **Wide Block** — a block that spans both columns
- **Page Break** — inserts a horizontal rule that forces a new page in the preview
- **Insert Asset panel** — pulls in an NPC, monster, or similar entity as a structured page (stat block layout)
- **Insert Block picker** — modal with categorised preset blocks (e.g. read-aloud text box, stat block template, table)
- **Image controls** (shown when an image is selected): resize to S/M/L/XL presets; align left/centre/right; float-left/float-right (text wraps); absolute pin mode with numeric top/left inputs; gutter-bleed toggle for images in wrap mode
- **Tags** on each document for filtering

### Themes & Page Sizes

Two visual themes selectable per document:

- **2024** — 2024 OneDnD PHB style (teal/navy headings, clean modern layout)
- **Classic** — 2014 PHB style

Page sizes: **A4**, **A5**, **Letter**

**Ink-friendly toggle** — strips backgrounds and decorations before printing/exporting.

### Preview

- Live side-by-side paginated preview (HTML rendered as styled pages)
- Zoom controls (fit-to-width, zoom in/out up to 2×, snap back to fit)
- Page numbers with footer text: optional, with configurable start number and recto/verso alternation
- Word count shown in editor footer and document list cards

### Export & Sharing

- **PDF export** — generates a PDF from the preview pages (shown in a preview dialog before saving to disk)
- **Publish flag** — marks a document as published; visible in the list with a globe badge
- Documents are stored in Supabase (`scriptorium_documents` table) and survive sessions

### Document List

- Grid layout (1–4 columns depending on screen width)
- Colour-coded type bar at top of each card
- Filter by type, free-text search by title/tags
- Inline delete with confirmation

### Quota

Document creation is quota-gated; hitting the limit triggers a `PaywallModal`.

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

A four-tab rules reference and management screen for the DM. Includes a built-in dice roller.

**Tabs:**

**DM Screen**
Quick-reference panel with common combat tables, conditions, and other at-a-glance information used during play.

**Compendium**
Read-only SRD/Open5e rules browser. Search and browse standard D&D 5e rules content.

**Custom Rules**
DM-authored rules, tables, and house rule documents. Each rule has:

- Title, category, tags
- Rich text content body (Tiptap editor)
- **Player visible flag** — when checked, the rule appears in the player Reliquary portal

Custom rules support an optional **Tracker** bolt-on:

- Two tracker types: **Level** (named states, e.g. Chilled → Frozen → Hypothermic) and **Points** (numeric pool, e.g. 0–20 Sanity)
- Min/Max values
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

### Player View

Route: within player portal (`/play/...`)

File: `src/views/play/PlayerReliquaryView.vue`

A read-only rules reference for players. Tabs:

- **Reference** — same ScreenTab as DM view (quick reference tables)
- **Compendium** — same SRD compendium browser
- **Codex** — character codex (species, backgrounds, classes, archetypes, abilities)
- **House Rules** — shows only custom rules where `is_player_visible` is true

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
