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

### Monster/NPC entry layout (#915 story 6 round 2)

A monster embeds as a Monster Manual-style ENTRY, not just a framed stat block: a document heading (so it enters the table of contents and the phone reader's own contents list — `pagedToc.ts` / `readerToc.ts`), the framed block, and the creature's art and lore. `scriptoriumImport.ts`'s `monsterFormatter` wraps all of it in `.sc-statblock-entry`, a `column-span: all` unit laid out as its own CSS grid (`theme-base.css`'s "Linked entity ENTRY layout" section) — deliberately not a manual `.sc-column-break` (round 1's approach), which Paged.js's multicol polyfill didn't honour reliably and could spill a tall stat block's art onto an otherwise empty next page.

- **Size** (`estimateStatBlockSize()`) is decided from the stat block's own TEXT length (tags stripped), not entry count — measured theme-agnostic, since the two themes print materially the same words at very different HTML verbosity. `WIDE_STATBLOCK_CHAR_THRESHOLD` (1,350) is calibrated against the Sugarwell booklet's six creatures; see the constant's own doc comment for the measured numbers.
- **Column size**: a two-cell grid — stat block left, art then lore right, both cells the width of the page's own two-column measure.
- **Wide size**: the stat block band (its own internal two-column flow) then the art floated at the start of the lore, which wraps beside and under it; `bandPosition: "bottom"` puts art and lore above the band instead. The art takes what the page leaves under the band, never more than 16rem. Two grid layouts before it failed on the Sugarwell booklet (#917).
- **Fitting an entry to its page is measured, not predicted (#915 story 6, round 3).** A Paged.js handler (`src/lib/scriptorium/pagedEntryFit.ts`, registered by both renderers) preloads every entry's art, then on each page, before Paged.js looks for overflow, takes any entry whose margin box runs past the page bottom, drops its bottom margin, and binary-searches the tallest art that still ends it on the page (floor 96px). One that cannot fit even then gets `sc-statblock-entry--split` (`break-inside: auto`, `pagedPreviewCss.ts`). It replaced a band-height formula that typography changes had pushed 19 to 41px short, which lost the Caramel Crusher's lore: Paged.js resumes after an unbreakable block that fits no page, so the rest of the entry was silently dropped. Two traps it handles: the page content box is itself a multicol, so an entry fitted to its border box whose bottom margin overflowed was laid out in an off-page column and the page printed empty; and `beforeParsed` receives the HTML string, so the preload runs in `afterParsed`.
- **Duplicate name**: when the entity has no lore (or `showLore: false`), the entry heading gets `sc-statblock-entry-heading--no-lore` (visually hidden, `theme-base.css`) rather than being removed — it still needs to be there for the TOC/reader list. With lore, both the heading and the frame's own name show, matching a real Monster Manual entry.
- **Overrides** (`size`, `showArt`, `art`, `showLore`, `bandPosition`, all `entityEmbed` attrs edited via `EntityEmbedView.vue`'s toolbar) are applied post-hoc by one function, `applyEmbedNodeOptions()` (`entityEmbeds.ts`), swapping classes/attributes on the already-injected HTML: the formatter always emits a size-"auto" default shape, and per-node attrs never change what's cached in the shared entity lookup. `resolveEntityEmbeds()` calls it for the paged preview and the PDF (options read from `data-*`), and `EntityEmbedView.vue` calls it for the editor, the phone reader and quest handouts (options read from the node's attrs). Before #917 that view ignored every option, so art or lore hidden in the book still showed on a phone.
- **Art: picture and cutout (#917).** A monster has two images: `image_url`, the picture, and `cutout_url`, the creature alone on a transparent background. The formatter emits both (`entityArtFiguresHtml`, `src/lib/scriptorium/entityArt.ts`, each tagged `data-art-kind`) and the `art` attr keeps one: `auto` (default) prefers the cutout and falls back to the picture, `cutout`/`picture` force one and fall back to the other. A cutout prints unframed and larger; a picture gets a thin printed frame. A DM's `library_monster_art` override reaches the book too: `useEntityEmbedData` merges the art layers per field (`withLibraryArt`) before formatting a library monster. Nothing here is monster-specific, so NPC portraits can follow.
- **Theme.** `EntityEmbedView.vue` formats in the document's theme via `SCRIPTORIUM_THEME_KEY` (`scriptoriumTheme.ts`), provided by the editor and by `ScriptoriumDocumentView`; it used to format every embed in the 2024 layout, including in Classic documents on a phone.
- A monster's `description` may be Tiptap JSON or plain text (both shapes exist in real data) — `richTextOrPlain()` (`scriptoriumImport.ts`) handles either, escaping plain text, and treats a genuinely empty Tiptap doc as "no lore" rather than falling back to dumping the raw JSON string.

### Long-box and long-table breaking (#915 story 6 round 2)

Every box (`.sc-note`, `.sc-descriptive`), stat block/entry, and table defaults to `break-inside: avoid` in the authoritative paged stylesheet (`pagedPreviewCss.ts`) — right for something short (it reads better jumping whole to the next page than splitting) but wrong for something long, which instead stranded the page before it part-blank. `classifyLongBoxes()` (`src/lib/scriptorium/pagedBoxes.ts`) marks a `.sc-note`/`.sc-descriptive` past `LONG_BOX_CHAR_THRESHOLD` (700 characters of text) `sc-box--long`; `promoteTableHeaders()` (`pagedTables.ts`) does the same for a generic table past `LONG_TABLE_ROW_THRESHOLD` (6 rows) with `sc-table--long`. Both run in the one pre-layout pass, `preparePagedBody()` (`pagedPrepare.ts`), so the live preview and the exported PDF paginate identically. A stat block/entry is deliberately excluded from this carve-out — its own size decision is what keeps it inside a page, not a break-relaxation. A table row itself never splits (`tr { break-inside: avoid }`, unconditional); a repeated `<thead>` only repeats across a PAGE break, never across a COLUMN break within one page — a genuine CSS multicol limitation Paged.js's polyfill can't get around.

### Page furniture

Watercolour splatters, watermarks, and artist credits are not part of the Tiptap content stream: they live in a sibling `page_furniture` jsonb column (`PageFurnitureItem[]`, see `src/types/scriptorium.types.ts`), anchored to a page or a block and positioned as a percentage of the page box so they survive page-size changes. There is no content-node form of these three kinds any more (see above) — `documentContent.ts`'s import-boundary normalization is the only place that still lifts a decoration out of a document's content, for the pre-story-2 shapes it exists to convert. Dragging one on the live book updates its `x`/`y`/`width` directly; `FurnitureInspector.vue` edits colour, layer (`under/over` the text) and width, or deletes it.

### Themes and page sizes

Two visual themes selectable per document, `onednd2024` (teal/navy, current PHB styling) and `phb2014` (2014 PHB brown/gold): see `ScriptoriumTheme` and `src/assets/scriptorium/theme-*.css`. Page sizes: A4, A5, Letter. An ink-friendly toggle strips backgrounds and decorations before printing/exporting.

### Preview and PDF export

The preview pane renders the real Paged.js pagination live, with zoom controls (fit-to-width, up to 2x, snap-to-fit) and a word count. The **PDF** button downloads a real PDF (#565): `useScriptoriumPdf` (`src/composables/scriptorium/useScriptoriumPdf.ts`) takes the already laid-out pages and posts them to the `render-pdf` edge function, which prints them through Cloudflare Browser Run's REST `/pdf` and returns the PDF. There is no print dialog and no hidden iframe any more; the result is a true vector PDF with selectable text and embedded TrueType.

The live preview and the export both lay pages out in the app's own document, and Paged.js puts each render's page rules in `document.head`. Each one asks its own `Previewer` which `<style>` elements are its (`src/lib/scriptorium/pagedStyles.ts`) rather than diffing the head: an export spans the render-pdf round trip, the preview keeps re-rendering while the DM types, and a diff used to copy the preview's rules into the PDF and then delete them from under the preview. The file is handed over by `downloadBlob` (`src/lib/downloadBlob.ts`), which every download in the app shares, and which revokes the blob's URL a minute later rather than right after the click, which Safari would abort.

- **The document must be self-contained.** Cloudflare's browser cannot reach the app's origin. Pictures already go in as `data:` URLs (`compactPrintImages`), and `inlineSameOriginAssets()` (`src/lib/scriptorium/inlineSameOriginAssets.ts`) turns every remaining root-relative `url(/…)` and `src="/…"` (the self-hosted fonts, the parchment page background) into a `data:` URI; one it cannot load fails the export rather than printing in Georgia or without parchment. A picture the canvas cannot read keeps its https CDN URL, which the renderer can fetch. The Sugarwell booklet sends about 14 MB of HTML; the cap is 40 MB (`PDF_HTML_MAX_BYTES`, Cloudflare's own limit is 50 MB).
- **Server side** (`supabase/functions/render-pdf/`, decisions in `_shared/pdfRender.ts`): caller from the verified JWT, body validated before the per-user `pdf_render` rate limit (30 an hour, `_shared/rate-limit.ts`), then Cloudflare. It needs two secrets, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_BROWSER_RUN_TOKEN` (an API token with Browser Rendering: Edit), set with `supabase secrets set` in production; locally they sit in `.env.local` beside the R2 keys, served with `supabase functions serve --env-file .env.local` (no `VITE_` prefix, so Vite never ships them to the client); without them it answers 503 "PDF export is not set up on this server yet." On Workers Free Cloudflare allows one `/pdf` request every 10 seconds account-wide and 10 browser-minutes a day; its 429 becomes "The PDF printer is busy" (or the daily-limit sentence).

**PDF with campaign data.** For a document with a `campaign_id`, an `OverflowMenu` beside the PDF button opens `ScriptoriumExportDialog.vue`. It hosts the shared bundle picker (`BundleEntityPicker.vue`, state in `useBundleSelection`), the same one the World Bundle tab uses, scoped to the document's own campaign (not necessarily the active one). `bundlePreselection()` (`src/lib/scriptorium/bundlePreselection.ts`) ticks the entities the book links (`collectEntityRefs`) plus the document itself; the picker drops any id it does not offer (a linked shared-library monster is not campaign data). On export the dialog calls `buildBundle` and passes the result to `exportPdf({ ..., bundle })`, which embeds it in the PDF. The World Bundle tab's old "Attach to PDF…" upload step is gone; the tab still imports PDFs that carry data.

**Pictures go in at print size (27 Sep 2026).** Chrome's print pipeline passes a JPEG into the PDF untouched but re-encodes any other image losslessly, at full source resolution: the Sugarwell booklet's WebP art exported at 3 to 4 MB a picture and about 600 ppi, and the file came to 55 MB. Before the pages are copied into the iframe, `compactPrintImages()` (`src/lib/scriptorium/printImages.ts`) redraws each laid-out picture at 300 ppi of its printed size: opaque ones as JPEG, anything with transparency as a smaller PNG so frameless art still sits on the page. A picture it cannot read back (no CORS, failed load) keeps its source. The same booklet now exports at 6 MB. It relies on the asset CDN sending `access-control-allow-origin: *`, which it does.

Both renderers call one function for the pre-layout pass, `preparePagedBody()` (`src/lib/scriptorium/pagedPrepare.ts`), which runs in this order: `stripTrailingEmptyParagraphs`, `expandTocPlaceholder` (`pagedToc.ts`, needs `pageSize` for its column count), `promoteTableHeaders` (`pagedTables.ts`, also classifies a long generic table `sc-table--long`), `classifyLongBoxes` (`pagedBoxes.ts`, classifies a long `.sc-note`/`.sc-descriptive` `sc-box--long`), `groupWrappedImages` (`pagedFloats.ts`, see below), then the two-column wrapper. It used to be two hand-kept chains, one per renderer, and a step added to one and not the other was a bug (#915 story 6 round 2 found the live preview missing `promoteTableHeaders` entirely and passing no `pageSize`); a new step goes in `preparePagedBody` and nowhere else.

**Wrapped images keep their caption text (27 Sep 2026).** A wrapped image (`wrapLeft`/`wrapRight`) is a float placed before its paragraph. When the float does not fit what is left of a column, the browser moves it to the next column and leaves the text where it was, so a portrait lands beside the wrong entry (Rosie in the Sugarwell booklet's Appendix C). `groupWrappedImages()` wraps a heading directly before the float, the float, and the paragraph after it in `.sc-float-group` (`break-inside: avoid` in `pagedPreviewCss.ts`, `display: flow-root` in `theme-base.css` so the next heading starts below the picture), but only when that paragraph is caption-length, under `FLOAT_GROUP_CHAR_THRESHOLD` (360 characters). A longer section keeps flowing freely: grouped, it moves on whole and blanks the space it missed, which pushed Masters' Lane onto a new page when tried.

A cover page (`coverPage.ts`) forces `break-before: page` on itself (`pagedPreviewCss.ts`) rather than relying on its own full height to push the next thing onto a new page — two consecutive covers (front then inside) share the same named page ("sc-cover"), and a shared page name does not by itself force a break between them, which round 1 left the inside cover sharing page 1 with the front cover, clipped invisible under the page box's own `overflow: hidden`. A cover's own art image carries `sc-cover-art`, opting it out of the generic `.pagedjs_page_content img { max-height; object-fit: contain }` cap that otherwise exists to stop an oversized inline image overflowing its page — applied to a full-bleed cover photo, that cap silently shrank it to ~72% of the sheet.

### Templates

New documents start from a template, never a blank page (`src/data/scriptoriumTemplates/`): Blank Book, Adventure Module, Monster Compendium, Spell Compendium, Subclass Supplement, One-Page Dungeon, or an imported Markdown file. Each template seeds `doc_type`, initial Tiptap content, and starting settings (theme, page size, tags); every field stays editable afterward.

### Campaign scope (#915)

`scriptorium_documents.campaign_id` is nullable; null means the document is account-wide, set means it belongs to one campaign the DM owns (RLS requires `private.is_campaign_dm(campaign_id)` on insert and update; deleting a campaign sets its documents' `campaign_id` back to null rather than deleting them). A new document defaults to the active campaign; the metadata toolbar's Campaign select (`ScriptoriumMetadataToolbar.vue`, wired in `ScriptoriumEditor.vue`) offers the active campaign or "All my campaigns", and additionally shows the document's own campaign as a third option when it differs from the active one, so saving cannot silently rescope it.

`documentScopeOf` / `isDocumentUsableIn` (`src/lib/scriptorium/documentScope.ts`) classify a document as `campaign` / `general` / `other_campaign` relative to the active campaign, mirroring `itemScopeOf` for the Vault minus the "library" tier (every Scriptorium document is the DM's own). The document list's Scope filter (`scriptoriumFilterScope` in `useUiStore`) uses the same four options as the Vault (Usable here / This campaign / General / Other campaigns), defaulting to Usable here. The quest beat handout picker (`QuestBeatAttachmentsPanel.vue`) narrows to documents usable in the quest's own campaign; a beat already carrying a handout id resolves it unscoped through `useScriptoriumDocument`, since a resolver of a stored id must never re-filter by scope.

### Document list

`ScriptoriumDocumentList.vue` renders a card grid (1 to 4 columns depending on width) with a colour-coded type bar, word count, and the Published badge. Filters are type, scope, and free-text search over title/tags, all held in `useUiStore` (`scriptoriumSearch`, `scriptoriumFilterType`, `scriptoriumFilterScope`, `scriptoriumHasActiveFilters`, `resetScriptoriumFilters`) so leaving and returning to the list does not drop them (#723). The bar is the shared `ListFilterBar` + `ListSearchInput` + `ListFilterSelect`; the doc-type filter is a select rather than a segmented group because the ten types do not fit as joined segments without clipping at md widths, the same call the Bestiary makes for its 14 creature types.

### Phone reading view (#915 story 7)

Scriptorium is the one Publishing tool that is not `desktopOnly` in `src/lib/nav.ts` — Card Forge, the Mint, and Character Sheet stay hidden below `md` because they are A4/letter-bound output tools with nothing to do on a phone, but a Scriptorium document is worth *reading* on one even though writing still isn't practical there. `ScriptoriumEditorView.vue` branches on `useBelow("md")`: `/scriptorium/new` shows a short "writing needs more room" `EmptyState` with a way back to the list, and `/scriptorium/:id` shows `ScriptoriumReader.vue` instead of `ScriptoriumEditor.vue`. Both routes carry `meta.fullscreenMobile` (`src/router/routes.ts`) so the reader owns the whole phone screen — no app top bar or bottom nav — the same contract the NPC/monster sheets and quest surfaces use. `ScriptoriumView.vue` and `ScriptoriumDocumentList.vue`'s "New Document" affordances are hidden below `md` (`useAbove("md")`) for the same reason; a card still opens `/scriptorium/:id` normally, which is what puts it into the reader.

`ScriptoriumReader.vue` reuses `ScriptoriumDocumentView.vue` (the same read-only renderer the quest-runner handout uses) rather than building a second renderer, via a new `layout="reader"` prop that only adds a modifier class — every phone-specific override lives in `ScriptoriumReader`'s own scoped `:deep()` styles, never in the shared theme CSS (`src/assets/scriptorium/theme-*.css`), which #915's page-shape work was editing concurrently. It turns page/column breaks into a quiet divider or nothing, floats a cover page into a fixed-height hero/closing card (the print-only `pagedPreviewCss.ts` is what normally gives `.sc-cover` its height, which the reader has none of), drops every image's float/wrap/absolute layout to a full-width block capped to `60vh`, and wraps tables in a horizontally-scrollable frame (`@tiptap/extension-table` already renders a `.tableWrapper` div around every table, so no extra markup was needed for that one).

The `tocBlock` node renders as an empty `<nav>` outside the paginated book (only `injectPagedToc`, run against Paged.js's physical pages, can fill it in — see `pagedToc.ts`), so the reader does not try to reuse it. Instead, `reader/readerToc.ts`'s `collectReaderToc` walks the document's parsed JSON directly for `heading` nodes at level 3 or shallower, pairs each with the stable `blockId` every heading already carries (`BlockId`, `src/lib/tiptap/blockId.ts`), and `ScriptoriumReader.vue` renders that as a tappable "Contents" list above the text; tapping an entry finds the matching `[data-block-id]` element in the live rendered DOM and calls `revealInScrollParent` (`src/lib/motion.ts`) to scroll to it.

### Publishing and storage

The `is_published` flag is a DM-only status badge (green, in the list) for tracking done versus draft. It changes no access. Sharing with players is a separate act, described under Handouts below. Documents are owner-only for writes: `scriptorium_documents` RLS is scoped to `user_id`, and the row also carries a `demo_source` marker (set only by the demo-campaign copy machinery, never by the client) that exempts demo copies from the document quota.

### Handouts (#970)

A campaign's document can be given to players: `scriptorium_documents.player_visible_to` holds party member ids, written only through the `share_handout` RPC. Moving a document out of its campaign withdraws the share (DB trigger); an account-wide document cannot be shared.

- **One flow, three entrances.** `HandoutShareDialog.vue` is the picker (skipped when the caller already chose) plus a confirmation built from the RPC's dry run: who receives it, what it reveals ("Ser Vallis: name (seen as The Almoner)", "The Bounty: the quest starts"), and what players will not see and why. Wording lives in `src/lib/scriptorium/handoutShareSummary.ts`. `HandoutShareControl.vue` mounts it for the desktop metadata toolbar (built on `AudienceRevealControl`; a change opens the confirmation, nothing is written until Confirm) and for the phone reader's "Give to players" button (`ScriptoriumEditorView.vue`, reader `#actions` slot).
- **Reveals.** Each linked entry decides its own reveal (its `reveal` attr, set in the embed toolbar); sharing applies them to every recipient, idempotently. Unsharing ("Take it back from everyone?", via `useConfirm`) removes the handout and never un-reveals anything.
- **No campaign, or another one.** The toolbar control is disabled with a hint; with no campaign it offers to move the document into the active campaign through the ordinary save. The audience is the active campaign's party, so a document from another campaign must be opened under its own.
- **Pending-reveal banner.** `HandoutPendingBanner.vue` runs the dry run against the current recipients, debounced after each save (`usePendingHandoutReveals`), and shows "N linked entries are hidden from players. Reveal" when something would change (a newly linked NPC, say). Autosave never reveals; the button opens the same confirmation.
- **No email.** A handout is given at the table; players see it arrive in their journal (unread dot, live). Email is for planning between sessions only, see [notifications.md](notifications.md).
- **List.** Cards show a "Shared" badge with the recipient count beside Published.
- **Unsaved edits are saved first.** `share_handout` reads the stored body, so the editor saves pending edits before the confirmation opens (`saveBeforeShare`); a reveal toggled on an embed a moment ago is the one that applies.
- **What a holder can read.** The player read fetches only `ReadableScriptoriumDocument`'s columns (no tags, AI provenance or owner id), but the select policy is row-level: a holder querying the API directly can read every column of a handout. Treat a shared document's tags as visible to its players.

### Draft with AI (#910)

**Entry point:** a **Draft with AI** button in the Scriptorium template gallery (`TemplateGallery.vue`) and the Scriptorium view (`ScriptoriumView.vue`), both setting `ui.scriptoriumDraftOpen`. `ScriptoriumDraftDialog.vue` is mounted globally in `AiGeneratorPanels.vue`, so a draft started in the background can be reopened from the AI badge on any page (state in `src/ai/useScriptoriumDraft.ts`).

**The DM picks** a kind (`handout`, `faction_dossier`, `session_recap`), a subject (an NPC, location, faction or session note; `KIND_SUBJECTS` fixes which kinds take which subjects), an audience (`players` or `dm`) and a steer.

**Server path only:** `supabase/functions/draft-scriptorium-document/index.ts`, pure helpers in `supabase/functions/_shared/scriptoriumDraft.ts`. Order: auth, account gate, request validation (unknown values are rejected, never defaulted), campaign and `ai_enabled` check, **DM-role gate via `isCampaignDm`**, prompt rows (`scriptorium_draft` plus the edition's `ruleset_context_<ruleset>`), rate limit, `reserveCredits`, fetch, model, parse, `recordGeneration` (refund on failure). Ledger reason `scriptorium_draft`, 2 credits because the output is a multi-page document.

**Every read is filtered by `campaign_id`.** A subject id from the client is only ever looked up inside the campaign, so it cannot name another campaign's row. The context blocks cover the subject and what hangs off it (a faction's members and locations, an NPC's relations, a session's other notes).

**The audience rule decides what the model may see.** For `players` a block carries only what the players could already see in the app: an NPC's name, race, occupation and appearance, a location's description only when shared, notes and related entities only when shared with at least one player. A `dm` draft gets everything the row holds. This is enforced in the builders, in one tested place, not inline in the handler.

**Output is a whitelist, not trusted HTML.** The model returns `{ title, html }`; `sanitizeDraftHtml` keeps only `ALLOWED_TAGS` with every attribute stripped (comments removed), and no title or empty HTML is a failed draft. The client converts it with `htmlToScriptoriumJson` and creates a `scriptorium_documents` row (`doc_type: "custom"`, quota-gated through `useGenerationGate("scriptorium_documents")`) carrying `ai_provenance`, then navigates to `/scriptorium/:id`.

### Quota

Document creation is quota-gated (`scriptorium_documents` in `check_quota`/`check_all_quotas`); hitting the limit triggers `PaywallModal`.

---

## Card Forge (Card Printer)

Route: `/forge`

A card-layout and print tool that generates physical trading cards for NPCs, monsters, items, and spells, plus Interlude activity cards and items-only loot decks. Cards match standard card game proportions and are designed to be cut out and used at the table.

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

### Paint portrait for entities with no art (#910)

A card or token whose entity has no picture can have one painted from where it is being made. `PaintPortraitButton.vue` is presentation only (label, cost badge, error); the caller owns the logic. `src/ai/useMissingPortrait.ts` does the work for five kinds (`npc`, `party`, `monster`, `item`, `spell`): it generates the entity's own portrait with the **same image kind and bucket the entity's detail editor uses** (`KIND_CONFIG`: for example `npc_portrait` in `npc-portraits`), then saves the URL onto the entity through its own update mutation, with a centred focal point. So the card, the token and the detail page all gain the picture at once, the Gallery files it under the right tab, and provenance is recorded per stored image like any other (#935). Text-only generation, so the likeness gate (reference images only) does not apply, as in `EntityImageBlock`. Entity facts come from `src/ai/entityImageContext.ts`, kept in step with the editors' `aiContext` so a portrait painted here describes the same entity.

One paint runs at a time across every surface (`paintingId` is module state): a second would spend credits while the first renders. A failed paint is a message on the card, not a thrown error.

Card Forge: `useCardPortraitPainter` (`src/composables/cardforge/`) wraps four painters and decides eligibility (`hasNoArt`): an NPC without a portrait, a monster without art that is not shared, an item or spell without art whose id is a uuid. **Library (shared) monsters, spells and items are read-only, so only the DM's own rows offer it**; their ids are slugs, the DM's are uuids. Shown in `CardForgePreviewGrid.vue`; The Mint's tokens tab (`TokenForgeView.vue`) uses `useMissingPortrait` directly for NPC, party member and monster tokens, one painter per kind sharing the one-at-a-time lock.

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
- **Picture / Cutout (#917)** — when the selected monster or NPC has a `cutout_url` (the figure alone on a transparent background), a Picture/Cutout `SegmentedControl` appears above the preview, defaulting to Cutout. Cutout draws the whole figure scaled to fit the ring ("contain", `drawToken`'s `imageFit`, no focal point); Picture is the ordinary cropped-and-focal-pointed render described above. The choice applies to the live preview, PNG export and the print queue alike — `TokenForgeView.vue`'s `renderEntity` computed swaps `imageUrl`/`imageFit` before anything downstream (`drawToken`, `getExportCanvas`, `addToQueue`) ever sees the entity. Custom entities have no cutout, so the control never appears for them.
- **Paper doll as token (#975)** — a party member whose character has its OWN doll (`art.source === "character"`, never a species or template doll, which would replace a player's personal portrait with a generic figure) gets the same Picture/Cutout control, and Cutout draws the character's OWN doll figure in its current outfit (`useDollArt` supplies the `MemberDoll.figure` picture, framed by `dollTokenFigure` into `TokenEntity.figure { url, source }` and drawn by `drawToken` with `containRect`). Token precedence: beast form, mini, own doll, `token_url`, portrait. `renderEntity` adds the `figure` and the queue, export and print all follow it.

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

### AI house rule generator (#910)

The Reliquary's Custom Rules tab has a **Generate** action (`RulesView.vue`, `ui.customRuleGeneratorOpen`) opening `CustomRuleGeneratorPanel.vue` (state in `src/ai/useCustomRuleGeneration.ts`). Constraints: category and an "Allow a tracker" toggle. `generate-entity-text` with `generator: "custom_rule"`, ledger reason `custom_rule_generation`.

`normalizeCustomRule` (`src/lib/rules/customRuleAi.ts`) turns the answer into a `rules` row. The category must be in `RULE_CATEGORIES`; no title or no effect text means no rule. The body is assembled as a Tiptap document: summary, then Trigger, Effect and Exceptions as headed sections.

**Tracker validation is strict, and a failing tracker costs only the tracker.** `normalizeTracker` returns null on any structural fault (min not below max, a start outside the range, an unknown type, a level outside the range or out of order, an effect of an unknown type or missing its value, exhaustion outside 1-6, a save without a valid ability and DC, buttons or triggers it cannot read), so a half-valid tracker never reaches the player sheet, and the rule text still lands without it. With the toggle off the tracker is always null.

**Writes:** `createRule` with `is_player_visible: false` (a generated rule is never published to players unprompted), the tracker, and `ai_provenance`. Then it navigates to `/rules/:id`.

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

- **All output is print-ready without external software.** Card Forge, The Mint and character sheets print through the browser's print dialog; a Scriptorium book downloads as a real PDF made by the `render-pdf` edge function (Cloudflare Browser Run), so it no longer depends on the reader's browser or print settings (#565).
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
