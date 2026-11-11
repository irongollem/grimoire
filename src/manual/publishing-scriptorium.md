---
title: "Scriptorium: Document Publisher"
section: Publishing
section_order: 14
order: 0
summary: Write, design, and export campaign documents in a live, auto-paginated book styled after the official rulebooks.
keywords: scriptorium, document, publish, pdf, print, export, template, furniture, decoration, paged, theme, page break, stat block, cover
---

The **Scriptorium** produces print-quality campaign materials (adventure modules, spell compendiums, monster bestiaries, handouts, session recaps) that look like an actual rulebook, not a text export. Find it in the sidebar under **Compendium → Publish → Scriptorium** (route `/scriptorium`). Writing needs a tablet or desktop screen. On a phone, Scriptorium is a reader; see "On a phone" below.

Rather than editing raw source and compiling it into a document, you write directly on the finished, paginated page. The system owns pagination, columns, fonts, and page numbering: you never lay those out by hand.

## Key ideas

| Term | Meaning |
| --- | --- |
| **Template** | A finished-looking starting book you pick before you write anything: never a blank page. |
| **The page** | The sheet you write on. It is the real page, with page breaks, columns and furniture where they will print, so there is no separate preview to look at. |
| **Read as spreads** | The whole book full screen as facing pages, in lamplight, with room for your own notes. A button in the header. |
| **Furniture** | A decoration (watercolor splatter, watermark, artist credit) that sits on a page independent of the text: drag it directly on the book, don't type it. |
| **Doc type** | Custom, Spell, Monster, Item, Class, Subclass, Species, Background, Adventure, NPC Sheet, Location, or Quest: colour-codes the document in your list. |

## Starting a document

1. Click **Create your first document** (or **New**) from the document list.
2. Pick a **template**: Blank Book, Adventure Module, Monster Compendium, Spell Compendium, Subclass Supplement, or One-Page Dungeon, each seeded with real cover, heading, and table structure for that kind of document. Every template is fully editable afterward.
3. Or click **Import Markdown** to bring an existing `.md` file (chapters, notes, even a Homebrewery brew) in as your starting book instead of a template.

### Drafting from your campaign with AI

If AI is turned on for your campaign, the template gallery and the Scriptorium list both offer **Draft with AI**. It writes a first draft of one of three documents from your own campaign data:

- **Player handout**: an in-world letter, notice, journal page or proclamation about an NPC, a location or a faction.
- **Faction dossier**: a sectioned briefing on one faction, with its leadership, members, holdings, goals and relations.
- **Session recap**: a past-tense recap of one session, written from the players' side and ending with the open threads.

Choose the kind, pick the NPC, location, faction or session it is about, and say who it is for. Add a steer if you like ("a hurried letter, half burnt"). The draft is grounded in the rows it is about and the things linked to them, and it never contradicts them. When it is written for **Players**, only what your players can already see is used, so DM-only notes and secrets stay out. When it is for **DM only**, everything on record is used.

Drafting costs credits, and the cost shows beside the button. The result opens as a normal, fully editable document with plain headings and paragraphs, ready for you to restyle. Once you change the text, the document is no longer marked as untouched AI output.

## Writing

The page has a full formatting toolbar:

- **Text**: Bold, Italic, Strikethrough, Inline code.
- **Headings**: Heading 1, Heading 2, Heading 3.
- **Blocks**: Bullet list, Ordered list, Blockquote / callout, Inline block (code block), **Wide Block** (spans both columns; use it for big art, tables, or chapter headings), **Page Break**.
- **Insert**: appends a **linked** NPC, Monster, Spell, or Location at the end of the document. Search across all four inside the modal; see "Linked entities" below.
- **Block**: opens **Insert Block**, a picker of pre-styled pieces grouped by kind:
  - **Cover Pages**: Front Cover, Inside Cover, Part Divider, Back Cover.
  - **Layout**: Wide Block, Page Break, Column Break, vertical/horizontal spacers.
  - **Callouts**: Callout Box, Note, Descriptive (read-aloud text), Pull Quote, Attribution.
  - **Decoration**: Watercolor Splatter, Watermark, Artist Credit (these are furniture, see below).
  - **Templates**: full/half/third-caster and martial class tables, Monster Stat Block (standard or wide), Spell, Magic Item, Class Feature.
  - **Structural**: Table of Contents, Skip Page Number, Reset Page Counter.
  - **Images**: insert from a URL, from your campaign's saved NPC/monster/spell/location art, or browse your uploaded photos.
- **Toggle two-column preview**: switches the book between one and two columns.
- **Theme**: **2024** (OneDnD teal/navy) or **Classic** (2014 PHB brown/gold).
- **Page size**: A4, A5, or Letter.
- **Ink-friendly**: strips backgrounds and decorations, for cheaper printing.

**Undo/Redo** are always available. **Focus** in the header hides the chapter list so the page you write on has the room, and brings it back when you press it again. **Read as spreads** shows the whole book as facing pages; Escape or Close brings you back to the page, and a note's **Edit this part** takes you to its text. While a long book is still being numbered, the chapter list says so and shows how far it has got. You can keep writing.

### Images

Beside the page there is a **panel** that always describes what you have selected, or the page itself when nothing is. On a wide screen it is always there; on a narrower one it slides in when you select something and goes away when you click back into the text or press its close button, and **Focus** hides it. With nothing selected it tells you which page you are on ("16 of 28", and where it falls in its chapter), which paper it is printed on (with a **Book settings** link), what is placed on this page, and lets you add a picture, a watercolour, a watermark or an artist credit to it.

Select an image and the panel becomes **Picture**. Its **Layer** control says where the picture lives: **In the text** (it moves as you write), or **Behind the text** or **In front** (it is placed on the page). In the text you choose a size (S/M/L/XL), whether it aligns left, centre or right, whether the text wraps around it, and, when it wraps, whether it bleeds into the column gutter and whether it stays **with its text** in print. **Replace**, **Edit picture** and **Remove** are below.

To put a picture anywhere on a page, select it and choose **Behind the text** or **In front** under Layer: it stays where it was, and you can now drag it and resize it from its corner, on the page you write on. Back in the panel you choose whether it **moves with its paragraph** or **stays on its page** (switching keeps the picture exactly where it is drawn), and you can pin it to one of the page's four corners, flush against both paper edges. Behind the text, it is printed into the paper at a **Strength** you set, so the words over it stay readable. Choose **In the text** again and it goes back into the writing, right after its paragraph, with any treatment it had. Drag a picture near a corner and it snaps there. A picture behind the text is picked up by clicking empty space over it, or by the small **Picture** handle that appears when you point at it; a click on a word over it still puts your cursor in the text. If the image came from Grimoire's own storage, **Edit picture** opens it in the [Illuminator](#illuminator-image-effects) for colour grading, vignettes, or edge treatment, with a **Save to Scriptorium** button there to bring the edited version straight back.

### Cover pages

Click a cover page and the panel becomes **Cover**: title, subtitle, background art (upload or browse your library), and, on the front cover, when art is set, a **Darken behind the title** toggle for legibility. A part divider has a part number and subtitle; a back cover has its subtitle, three blurbs, tagline and product link. Changes show on the cover as you type, and there is nothing to apply: undo takes one back.

### Linked entities

An NPC, Monster, Spell, Location, or Quest brought in through **Insert** (or the **Send to Scriptorium** button on that entity's own page) is a **live link**, not a one-time snapshot: it always shows that entity's current data, so editing the NPC later updates every book that references it, with nothing to re-insert. On the page, hover a linked block to see its type badge and two controls:

- **Open** jumps straight to that entity's own page.
- **Detach** turns the block into ordinary editable text, frozen at its current content. Use this when you want to diverge from the source, for example writing a version of a monster stat block that's tougher for a specific fight. Detaching cannot be undone from the block itself (though the usual Undo still works), so it asks you to confirm first.

If the source entity is later deleted, the block shows a plain "no longer available" notice instead of stale or blank content, both on the page and in the exported book.

A linked **Monster** (or NPC) embeds as a full entry — name, framed stat block, art, and lore — laid out automatically as a column-width block or a page-wide band depending on how much the stat block holds. Select it and the panel becomes **Linked entry**, with a size (Auto/Column/Wide), a **Show the art** option and a cutout or picture choice, **Show the lore** (hide the description text — useful for a pure reference sheet), a Top/Bottom choice for a wide entry's band position, what sharing the handout reveals, and **Starts a new page** (on by default, so each entry starts fresh like a Monster Manual page; turn it off for a variant that should share its family's first entry, e.g. a second animated-object type right after the first). On the page itself the entry keeps only **Open** and **Detach…**.

### Decorating a page (furniture)

Watercolor splatters, watermarks, and artist credits aren't part of the text: they're **furniture**, positioned on the page independent of the flowing content. Add one from **Insert Block → Decoration**, then drag it directly on the live book to reposition it; a right-hand inspector panel lets you set its colour, layer (above or below the text), width, or delete it.

## Preview and export

The page you write on is the real, paginated document, themed exactly as it will print. For the whole book at once, press **Read as spreads** in the header: it fits a facing pair of pages to your screen and moves through the book a spread at a time with the arrow keys.

Click **PDF** to download the book as a real PDF (selectable text, embedded fonts and pictures, not a screenshot). It is built for you and saved straight to your downloads; there is no print dialog to click through.

For a document that belongs to a campaign, the small menu beside **PDF** offers **PDF with campaign data…**. It lets you pick NPCs, monsters and other entities to travel inside the file, in one step: see [Sharing Adventures as PDFs](#sharing-adventures-as-pdfs).

## Document settings and list

Above the page: **Document title**, **Document type**, a **Campaign** dropdown, a **PUBLISHED** checkbox, and a **PAGE #S** checkbox (reveals footer text and a starting page number field when on). **Save** (or **Create** for a new document) and **Delete** sit alongside.

The **Publish** checkbox marks a document with a green "Published" badge in your list: a DM-only status flag for tracking what's done vs. draft. It does not currently share the document with players.

Your document list shows a card grid with a colour-coded type bar, word count, and the Published badge; filter by **type**, **scope**, and free-text **search**, all remembered across visits so navigating away and back doesn't reset them.

### Campaign scope

Every document belongs to one campaign, or to none. A new document defaults to your active campaign; the **Campaign** dropdown in the toolbar lets you switch it to **All my campaigns** instead, which makes it account-wide and visible no matter which campaign you have open. A document you wrote while a different campaign was active keeps showing that campaign's name in the dropdown, so saving it never quietly moves it somewhere else.

The document list's **Scope** filter finds documents by the same classification: *Usable here* (the default: your active campaign's documents plus your account-wide ones), *This campaign*, *General* (account-wide only), or *Other campaigns* to find something you wrote while working in a different campaign. Deleting a campaign never deletes the documents scoped to it; they become account-wide instead.

A document scoped to a campaign can only be attached as a quest handout within that same campaign (or an account-wide one): attaching from the quest beat's Placements panel already narrows the picker this way.

## On a phone

The document list and its filters work on a phone exactly as they do everywhere else, but writing does not: the page layout, art placement, and formatting tools need more room than a phone gives them, so **New Document** is hidden there and opening one for editing shows a short explanation with a way back to the list instead.

Tapping a document from the list instead opens it as a **reader**: a single flowing column, like an e-book, rather than the paginated book. Page and column breaks disappear (a page break leaves a faint divider), a cover page becomes a compact card at the top with its title and art, back-cover blurbs become a closing card, images run the full width of the screen, and tables scroll sideways inside their own frame so they never widen the page. If the document has any headings, a tappable **Contents** list sits above the text and jumps straight to the section you tap — the same headings that would appear in the printed book's own table of contents, including a linked monster/NPC's own entry name, even when its stat block frame is showing the only visible copy of the name.

## Tips

- **Templates are a starting point, not a lock-in.** Change the doc type, theme, or page size any time after picking one.
- **Furniture and content are independent layers.** Moving a watercolor splatter never reflows your text, and editing text never moves your decorations.

## Related

- [Sharing Adventures as PDFs](#sharing-adventures-as-pdfs): embed campaign data in an exported PDF.
- [Illuminator: Image Effects](#illuminator-image-effects): the Scriptorium's art pipeline for images you insert.
- [Card Forge: Card Printer](#card-forge-card-printer): print entities as cards instead of book pages.
