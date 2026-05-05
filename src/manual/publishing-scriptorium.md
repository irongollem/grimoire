---
title: Scriptorium — Document Publisher
section: Publishing Tools
section_order: 11
order: 0
summary: Write, design, and export campaign documents in a paginated two-column layout.
keywords: scriptorium, document, publish, pdf, print, export, two column, theme, page break, stat block
---

The **Scriptorium** (`/scriptorium`) is a document editor that produces print-quality campaign materials: adventure modules, spell compendiums, monster bestiaries, handouts, and session recaps.

## Document types

Each document has a type that colour-codes it in the list:

Custom, Spell, Monster, Item, Class, Subclass, Species, Background, Adventure, NPC Sheet, Location, Quest.

Types are for organisation — the editor works the same regardless of type.

## Editor features

The Scriptorium uses a rich Tiptap editor with a full formatting toolbar:

- **Text formatting** — bold, italic, strikethrough, inline code.
- **Headings** — H1, H2, H3 for section hierarchy.
- **Lists** — bulleted and numbered.
- **Blockquote** — for read-aloud text or highlighted passages.
- **Code block** — for tables or mechanical text.

**Special blocks:**

- **Wide Block** — a section that spans both columns. Use for large art, important tables, or chapter headings.
- **Page Break** — forces a new page in the paginated preview and PDF export.
- **Insert Asset** — insert a formatted NPC or monster stat block from your tracker or bestiary directly into the document.
- **Insert Block** — pick from a library of starter blocks: read-aloud text, stat block templates, formatted tables.

**Images:**

- Upload images with size presets (S/M/L/XL) and alignment (left, centre, right).
- Float images (text wraps around them) with float-left or float-right.
- Gutter-bleed pins an image to the column edge.

## Page settings

- **Theme** — 2024 OneDnD (teal/navy headers, modern layout) or Classic 2014 (brown/gold, traditional look).
- **Page size** — A4, A5, or Letter.
- **Ink-Friendly toggle** — strips background colours for economical printing.
- **Page numbers** — toggle on/off; set footer text and starting page number.

## Preview and export

The live **Preview** panel shows a paginated, print-accurate rendering of your document beside the editor. Use zoom controls to inspect at different sizes.

Click **Export PDF** to generate a PDF. A preview dialog appears before the download so you can confirm layout.

## Publishing

The **Publish** toggle marks a document as published — shown with a globe badge in the list view. This is a DM-only status flag; it doesn't currently share the document to players, but is useful for tracking what's "done" vs in draft.

## Quick export from other tools

Most entities (spells, quests, monsters, NPCs) have a **Scriptorium** button on their detail view. Clicking it creates a new Scriptorium document pre-populated with the entity's content in the appropriate document type.
