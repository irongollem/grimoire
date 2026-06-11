# Scriptorium Re-Architecture — "Canva for D&D"

Status: approved 2026-06 · Tracking: EPIC issue on GitHub (see Phases) · Supersedes the Homebrewery-clone framing.

## 1. Product framing — the real WHY

Scriptorium's user is not a typesetter; they are a DM who wants a book that looks like Wizards printed it. The original Homebrewery model (edit source left, see render right) is developer-brained: source → compile → artifact. The user's mental model is the artifact itself — they are **making a book**, not writing source that compiles into one.

The right framing is **Canva-for-D&D**, not InDesign:

- **Template-first** — a new document starts as a finished-looking book, never a blank page.
- **Work on/next to the real book** — the paginated, themed book is always visible and live; decorations are dragged directly on its pages.
- **Constrained styling** — every block the user can insert is pre-styled to the official look; the user physically cannot produce something amateur.
- **The system owns layout** — pagination, columns, fonts, textures, footers are never the user's job.

What stays: the Tiptap content model (~20 custom nodes), the block registry, asset-import formatters, the `--sc-*` theme variable system, AI enhance. This is a re-architecture of the *surface and pipeline*, not the content model.

## 2. Target architecture

### 2.1 Editing surface: themed galley + live book (hybrid)

Two panes, reframed as **manuscript and book**:

- **Galley (left, editable)** — Tiptap editor styled with the full book theme: parchment background, theme fonts, real callout/stat-block/table styling, at page text width, single column. WYSIWYM: what you type looks like book content; exact line/column breaks are the book's job.
- **Book (right, live)** — a Paged.js render of the real document: auto-pagination, two columns, footers, page numbers, named cover pages. Re-rendered debounced (~600 ms) after edits; typing latency lives entirely in the galley.

Two bridges make it feel like one surface:

1. **Click-to-edit** — every top-level block carries a stable UUID (`data-block-id`, custom Tiptap global-attribute extension). Paged.js preserves attributes when fragmenting; clicking the book resolves the nearest `[data-block-id]`, finds that node in the ProseMirror doc, and focuses/scrolls the galley. Galley selection highlights the matching fragment in the book.
2. **Direct manipulation on the page** — everything that is *not* flowing text (decorations, full-page art, cover fields) lives in a Vue overlay positioned on top of each rendered page, draggable/resizable even though Paged.js output itself is a non-editable clone.

**Rejected alternatives** (recorded so we don't re-litigate):

- *True per-page two-column WYSIWYG editing* — infeasible. ProseMirror needs one continuous contenteditable DOM; community pagination extensions assume a single linear flow and cannot handle multicol fragmentation, floats with `shape-outside`, `column-span: all`, or gutter-bleed negative margins. Making that editable means writing a custom layout engine (why Google Docs moved to canvas).
- *Themed galley + pagination as a toggle view* — makes the book a mode you visit instead of the artifact you work on, and leaves decoration drag-editing homeless.

### 2.2 Content stream vs. page furniture

Auto-reflow makes "page 7" unstable, but watercolors/watermarks/artist credits/absolute art are page-anchored by nature. Adopt the InDesign split:

- **Content stream** — the Tiptap doc. Keeps all flowing content including wrap/gutter-bleed images, covers and part dividers (atom nodes that own a page via `break-before/after: page` + Paged.js *named pages*: `page: sc-cover` → `@page sc-cover { margin: 0 }`, replacing the current `:has()` footer hacks).
- **Page furniture** — a sibling `page_furniture jsonb` column on `scriptorium_documents`, NOT inside Tiptap JSON:

```ts
export type FurnitureAnchor =
  | { type: "page"; page: number }      // fixed physical page (full-page art, front matter)
  | { type: "block"; blockId: string }; // page containing this block (default — follows reflow)

export interface PageFurnitureItem {
  id: string;
  kind: "watercolor" | "watermark" | "artistCredit" | "art";
  anchor: FurnitureAnchor;
  x: number; y: number;   // % of page box — survives page-size changes
  width: number;          // % of page width
  z: "under" | "over";    // behind or above text
  props: Record<string, string | number>; // variant, color, opacity, text, src…
}
```

One shared `renderFurniture.ts` runs after Paged.js layout (`afterRendered` hook) and absolutely positions each item on its resolved page — the *same code* in live preview and print, so the PDF matches the screen. In the preview the items are Vue components with drag/resize handles + an inspector popover — issue #245 falls out of the architecture for free.

**Illuminator is the art pipeline.** Illuminator (`/illuminate`) exists specifically to prep art for Scriptorium — the two are hard-linked and must stay that way through every phase. The existing round-trip (`useScriptoriumIlluminator`: select image → "Edit in Illuminator" → return via query params) is preserved for in-flow images, and Phase D extends it to furniture: every `kind: "art"` furniture item gets the same "Edit in Illuminator" affordance in its inspector, and the furniture insert flow offers "process in Illuminator first" before placement. Template art placeholders (Phase C) deep-link to Illuminator as the suggested fill path.

### 2.3 Pagination & print

- **Paged.js** renders the book. Manual `<hr>` page breaks become an explicit `pageBreak` hint node (`break-before: page`) — optional override, not structural requirement.
- **Footers/page numbers** move from hand-built DOM injection to standard `@page` margin boxes (`@bottom-center { content: string(footerText) }`, `counter(page)`); `skipCounting`/`resetCounting` reimplemented as a small Paged.js Handler reading their data attributes; covers suppress footers via their named page.
- **TOC** becomes a post-layout pass: after render, read each heading's real page number from its `.pagedjs_page` ancestor, fill the `tocBlock`, re-run layout once. Templates size the TOC to whole pages to keep this stable.
- **PDF export — print-first, server-later**:
  - *Phase B*: render the Paged.js output in a hidden same-origin iframe with the shared theme CSS injected, call `print()`. True vector PDF, selectable text, browser font embedding, zero infra. Traps handled: `@page { size: … }` (paper pre-select, no browser margins), `print-color-adjust: exact` (parchment/accent fills without the "Background graphics" checkbox), pre-print hint dialog ("Save as PDF, margins: None").
  - *Phase E*: server render for #329 — `print()` never hands us PDF bytes, so embedding campaign data needs a server. Supabase Edge Functions can't host Chromium; the Edge Function drives a remote browser via `puppeteer-core` + WebSocket endpoint (Browserless.io or a small Fly.io Chrome container), renders the same HTML + CSS + furniture pass, attaches the world bundle with pdf-lib. Client print remains the free/fast path; server render is the "Publish" path.

### 2.4 Theme CSS single source of truth

Today the theme exists 3×: `scriptorium-editor.css` (editor), `ScriptoriumPreviewPane.vue` scoped styles (preview), `RENDER_CSS` string literal (PDF). Replace with one directory of plain CSS files (no Tailwind directives/`@apply` — must be inlinable anywhere):

```text
src/assets/scriptorium/
  theme-base.css        # all .sc-* structural rules, written against CSS vars
  theme-onednd2024.css  # variable values only
  theme-phb2014.css     # variable values only
  print.css             # @page rules, named pages, margin-box footers, counters (Phase B)
```

Consumed three ways from identical files: (1) app — imported into `main.css`, scoped under a `.sc-theme` root class on both galley and book pages; (2) print iframe — Vite `?inline` import injected into the iframe head; (3) server (Phase E) — fetched as static build assets.

### 2.5 Templates

A template = `{ meta: { id, name, description, docType, thumbnail }, settings, content: JSONContent, furniture: PageFurnitureItem[] }`, living as TypeScript modules in `src/data/scriptoriumTemplates/` — git-versioned, type-checked, vitest-validated (every template must load into a headless Editor without schema errors). `/scriptorium/new` becomes a template gallery (thumbnail cards → deep copy with fresh block UUIDs).

Initial set: **Adventure Module** (cover, credits, TOC, 3 chapters with part dividers, read-aloud + stat-block examples, back cover), **Monster Compendium**, **Spell Compendium**, **Subclass Supplement** (class table pre-placed), **One-Page Dungeon**, **Blank Book**. A DB table (SRD `is_canonical` pattern) only if/when user-shareable templates become a feature.

### 2.6 Migration & compatibility

`content_version` int on the row; lazy migrate-on-open via pure, unit-tested functions in `src/lib/scriptorium/migrations/`:

- **v1 → v2 (Phase B)**: every `horizontalRule` → explicit `pageBreak` node. Preserves intent exactly — under manual pagination every `<hr>` *was* a hard break, so v1 docs paginate identically. Cover nodes lose their `<hr>` sentinels (named pages handle isolation).
- **v2 → v3 (Phase D)**: watercolor/watermark/artistCredit nodes and `layoutMode: "absolute"` images lifted into `page_furniture`, anchored to the nearest preceding block UUID (page-anchored for front matter). Legacy node definitions stay registered forever so old JSON always parses; they render nothing post-v3.

### 2.7 Fonts (decided)

**Best OFL lookalikes** — no murky-license PHB clone fonts (Solbera etc.), per project licensing policy. Evaluate Alegreya / Vollkorn / Crimson Pro as body against the PHB look; Cinzel stays for display unless a better OFL face is found. Wired as `--sc-body-font` values only.

## 3. Phases

| Phase | Scope | Size | Closes |
| --- | --- | --- | --- |
| **A** | Theme CSS unification + themed galley + `blockId` groundwork + font pick | 2–3 wk | — |
| **B** | Paged.js live book, pageBreak hints, print-iframe vector export, click-to-edit, v1→v2 migration. **Week 1 = go/no-go spike** (see Risks) | 5–7 wk | #330 |
| **C** | Template gallery + 6 templates | 1.5–2 wk | — |
| **D** | `page_furniture` column, drag/resize overlay + inspector, v2→v3 migration | 3–4 wk | #245 |
| **E** | Server render + pdf-lib campaign-data attachment + pdf.js import (blocked by #36/#38) | 3–4 wk | #329 |

Every phase leaves the product fully working. End of Phase B deletes `useScriptoriumPdf.ts`, `html2canvas`, `jspdf`, `PdfPreviewDialog.vue`, the px/mm calibration tables, and the manual `htmlToPages`/`pageFooters`/`injectPageAnchors` machinery.

## 4. Risk register

1. **Paged.js two-column fragmentation — existential.** Breaking a multicol container across pages, floats near page boundaries, `column-span: all` under fragmentation, gutter-bleed negative margins possibly clipped by the page box. The Phase B week-1 spike tests exactly these with a 30-page PHB-representative doc. Fallback: Paged.js for single-column + a measure-based column splitter for two-column (adds 3–4 wk; revisit plan at that point).
2. **Repagination performance on 100+ page books** (1–5 s full re-layout, main thread, no worker). Mitigations: 600 ms debounce, "repaginating…" indicator, virtualized page list, galley never blocks.
3. **Print-dialog UX / font embedding.** Chrome embeds subsetted webfonts reliably; Safari/Firefox shakier — document "export works best in Chrome/Edge" initially; pre-print dialog addresses scale/margin footguns.
4. **TOC two-pass convergence** — page-number fill can shift pagination; whole-page TOC blocks + one re-layout pass; worst case one render stale.
5. **Font authenticity ceiling** — OFL lookalikes cap "indistinguishable from WotC" at ~90%; accepted trade-off.
6. **Testing** — happy-dom can't run Paged.js layout. Pure logic (migrations, furniture anchoring, TOC building, template validation) gets vitest; pagination fidelity gets a puppeteer smoke flow.

## 5. Keep / delete ledger

| Asset | Fate |
| --- | --- |
| 20 Tiptap nodes, blockRegistry, scriptoriumImport formatters, cover/stat-block/class-table templates, AI enhance, zoom composable, TanStack hooks | Kept (coverPage gains named-page CSS; tocBlock renderer replaced in B) |
| Illuminator round-trip (`useScriptoriumIlluminator`) | Kept and extended — Phase D wires it into furniture art items; Phase C templates deep-link art placeholders to Illuminator |
| watercolor/watermark/artistCredit nodes, image `absolute` mode | Kept through C; parse-only legacy after D |
| `useScriptoriumPdf.ts`, html2canvas, jspdf, RENDER_CSS, `PdfPreviewDialog.vue`, px/mm calibration | RENDER_CSS theme rules die in A; rest deleted end of B |
| `htmlToPages` / `pageFooters` / `injectPageAnchors` / `buildTocPages` | Deleted in B |
| `.phb-editor` dark theme CSS | Replaced in A by themed galley |
| skipCounting / resetCounting | Kept; reimplemented as Paged.js handler in B |
