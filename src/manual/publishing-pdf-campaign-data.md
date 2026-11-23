---
title: Sharing Adventures as PDFs
section: Publishing
section_order: 14
order: 1
summary: Embed campaign data inside a Scriptorium PDF so anyone who imports it gets your NPCs, monsters, and more, ready to play.
keywords: pdf, attach data, share a module, send adventure to another dm, import a pdf, grimoire file, share, publish, distribute, campaign data, world bundle, attach, import, adventure module, embed, scriptorium
---

A PDF you export from the Scriptorium can do more than look good: it can secretly carry **campaign data**. Grimoire embeds your chosen NPCs, monsters, locations, and other entities invisibly inside the PDF file. The PDF still opens and prints normally in any reader, but when another DM imports it into Grimoire, all of that content lands in their campaign, ready to run.

This turns a single PDF into a complete adventure package: the readable module **and** the game-ready data, in one shareable file.

## What can be embedded

Anything a World Bundle can carry:

- **Campaign content**: NPCs, locations, factions, quests, notes, encounters, characters, custom classes and subclasses, calendar events.
- **Your library**: homebrew monsters, items, homebrew spells, species, and even other Scriptorium documents.

You pick exactly which entities go in. The dialog starts with the ones your book links to, and you can change that.

## Creating a shareable PDF

You need a book that belongs to a campaign, since the data comes from that campaign. A players' book never offers this.

1. Open the book in the Scriptorium and click **Export PDF** in the header.
2. In the dialog, tick **Attach the campaign data** ("Another DM can import the monsters, places and factions this book uses"). The tick only appears for a book in a campaign.
3. Click **Choose the data**. Pick the entity categories, then tick the specific entities you want to share. Anything the book links to, plus the book itself, is already ticked for you; untick whatever you would rather keep back. Click **Continue to Details**.
4. Give the bundle a **Bundle Name** (it starts as the book's title) and, if you like, a **Description** for whoever imports it. The panel shows how many of each kind go inside.
5. Click **Export PDF**. Grimoire builds the PDF and downloads it, data inside, in one step. That file is the one to share.

Leave **Attach the campaign data** unticked to export an ordinary PDF.

## Importing a PDF with campaign data

The receiving DM goes to **Campaign Settings → World Bundle** and clicks **Import .grimoire**, then picks the PDF (the same dialog also accepts a plain `.grimoire` bundle file; a full account backup ending in `.grimoire-backup` is a different file and is **not** accepted here). Grimoire reads the embedded data and shows a preview of everything inside; they choose what to import into their campaign.

Player visibility flags and party-member links are cleared on import, so nothing arrives pre-revealed to the other table's players.

## Tips

- **Re-saving strips the data.** The embedded bundle survives normal sharing: email, Discord, cloud drives, printing. But if the PDF is run through another program that *re-saves* it (an editor's "export", "print to PDF" again, some compressors), the hidden attachment is removed. Share the downloaded file as-is.
- **The PDF stays a normal PDF.** People without Grimoire can read and print it like any other file; the embedded data is invisible to them.
- **Data and document are independent.** The embedded entities don't have to match what the document shows: you decide what a recipient receives.

## Related

- [Scriptorium: Document Publisher](#scriptorium-document-publisher): where you write and export the PDF itself.
- [Campaign Settings](#campaign-settings): where the World Bundle wizard lives.
