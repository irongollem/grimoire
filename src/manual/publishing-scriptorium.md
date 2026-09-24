---
title: Scriptorium — Document Publisher
section: Publishing
section_order: 14
order: 0
summary: Write, design, and export campaign documents in a live, auto-paginated book styled after the official rulebooks.
keywords: scriptorium, document, publish, pdf, print, export, template, furniture, decoration, paged, theme, page break, stat block, cover
---

The **Scriptorium** produces print-quality campaign materials — adventure modules, spell compendiums, monster bestiaries, handouts, session recaps — that look like an actual rulebook, not a text export. Find it in the sidebar under **Compendium → Publish → Scriptorium** (route `/scriptorium`; desktop only — the editing surface needs more room than a phone gives it).

Rather than editing raw source and compiling it into a document, you write directly next to (and click straight into) the finished, paginated book. The system owns pagination, columns, fonts, and page numbering — you never lay those out by hand.

## Key ideas

| Term | Meaning |
| --- | --- |
| **Template** | A finished-looking starting book you pick before you write anything — never a blank page. |
| **Galley** | The themed editor pane where you type. |
| **The book** | The live, auto-paginated preview beside the galley — what will actually print. Click any paragraph in it to jump the galley to that block. |
| **Furniture** | A decoration (watercolor splatter, watermark, artist credit) that sits on a page independent of the text — drag it directly on the book, don't type it. |
| **Doc type** | Custom, Spell, Monster, Item, Class, Subclass, Species, Background, Adventure, NPC Sheet, Location, or Quest — colour-codes the document in your list. |

## Starting a document

1. Click **Create your first document** (or **New**) from the document list.
2. Pick a **template** — Blank Book, Adventure Module, Monster Compendium, Spell Compendium, Subclass Supplement, or One-Page Dungeon — each seeded with real cover, heading, and table structure for that kind of document. Every template is fully editable afterward.
3. Or click **Import Markdown** to bring an existing `.md` file — chapters, notes, even a Homebrewery brew — in as your starting book instead of a template.

## Writing

The galley on the left has a full formatting toolbar:

- **Text** — Bold, Italic, Strikethrough, Inline code.
- **Headings** — Heading 1, Heading 2, Heading 3.
- **Blocks** — Bullet list, Ordered list, Blockquote / callout, Inline block (code block), **Wide Block** (spans both columns — use it for big art, tables, or chapter headings), **Page Break**.
- **Insert** — appends a formatted NPC, Monster, Spell, or Location as a new page at the end of the document, pulled live from your own campaign data. Search across all four inside the modal.
- **Block** — opens **Insert Block**, a picker of pre-styled pieces grouped by kind:
  - **Cover Pages** — Front Cover, Inside Cover, Part Divider, Back Cover.
  - **Layout** — Wide Block, Page Break, Column Break, vertical/horizontal spacers.
  - **Callouts** — Callout Box, Note, Descriptive (read-aloud text), Pull Quote, Attribution.
  - **Decoration** — Watercolor Splatter, Watermark, Artist Credit (these are furniture — see below).
  - **Templates** — full/half/third-caster and martial class tables, Monster Stat Block (standard or wide), Spell, Magic Item, Class Feature.
  - **Structural** — Table of Contents, Skip Page Number, Reset Page Counter.
  - **Images** — insert from a URL, from your campaign's saved NPC/monster/spell/location art, or browse your uploaded photos.
- **Toggle two-column preview** — switches the book between one and two columns.
- **Theme** — **2024** (OneDnD teal/navy) or **Classic** (2014 PHB brown/gold).
- **Page size** — A4, A5, or Letter.
- **Ink-friendly** — strips backgrounds and decorations, for cheaper printing.

**Undo/Redo** are always available. Click any paragraph in the book preview and the galley jumps straight to it — the whole editor is click-to-edit, not just a source-and-compile split.

### Images

Select an image to reveal its own toolbar: size presets (S/M/L/XL), align left/centre/right, wrap-left/wrap-right (text flows around it), an absolute-pin mode with numeric top/left/right/bottom inputs, and a gutter-bleed toggle (in wrap modes) to pin the image to the column edge. If the image came from Grimoire's own storage, an **Edit in Illuminator** button opens it in the [Illuminator](#illuminator-image-effects) for colour grading, vignettes, or edge treatment, with a **Save to Scriptorium** button there to bring the edited version straight back.

### Cover pages

Click a cover page block and its own **Edit** control opens the cover inspector: title, subtitle, background art (upload or browse your library), and — on the front cover, when art is set — a **Darken behind title** toggle for legibility.

### Decorating a page (furniture)

Watercolor splatters, watermarks, and artist credits aren't part of the text — they're **furniture**, positioned on the page independent of the flowing content. Add one from **Insert Block → Decoration**, then drag it directly on the live book to reposition it; a right-hand inspector panel lets you set its colour, layer (above or below the text), width, or delete it.

## Preview and export

The **book** panel beside the galley shows the real, paginated document, themed exactly as it will print — page count and render time are shown under it. Use the zoom controls (**–** / **Fit** / **+**) to inspect at different sizes; fit-to-width is the default and re-snaps whenever you change page size.

Click **PDF** to export. A true vector PDF is generated — selectable text, embedded fonts — via your browser's print pipeline, not a screenshot.

**After your first export**, a tip appears pointing you at attaching campaign data to the saved file — see [Sharing Adventures as PDFs](#sharing-adventures-as-pdfs).

## Document settings and list

Above the galley: **Document title**, **Document type**, a **PUBLISHED** checkbox, and a **PAGE #S** checkbox (reveals footer text and a starting page number field when on). **Save** (or **Create** for a new document) and **Delete** sit alongside.

The **Publish** checkbox marks a document with a green "Published" badge in your list — a DM-only status flag for tracking what's done vs. draft. It does not currently share the document with players.

Your document list shows a card grid with a colour-coded type bar, word count, and the Published badge; filter by **type** and free-text **search** — both remembered across visits so navigating away and back doesn't reset them.

## Tips

- **Templates are a starting point, not a lock-in.** Change the doc type, theme, or page size any time after picking one.
- **Furniture and content are independent layers.** Moving a watercolor splatter never reflows your text, and editing text never moves your decorations.

## Related

- [Sharing Adventures as PDFs](#sharing-adventures-as-pdfs) — embed campaign data in an exported PDF.
- [Illuminator — Image Effects](#illuminator-image-effects) — the Scriptorium's art pipeline for images you insert.
- [Card Forge — Card Printer](#card-forge-card-printer) — print entities as cards instead of book pages.
