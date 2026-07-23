---
title: Sharing Adventures as PDFs
section: Publishing Tools
section_order: 11
order: 1
summary: Embed campaign data inside a Scriptorium PDF so anyone who imports it gets your NPCs, monsters, and more — ready to play.
keywords: pdf, share, publish, distribute, campaign data, world bundle, attach, import, adventure module, embed, scriptorium
---

A PDF you export from the Scriptorium can do more than look good — it can secretly carry **campaign data**. Grimoire embeds your chosen NPCs, monsters, locations, and other entities invisibly inside the PDF file. The PDF still opens and prints normally in any reader, but when another DM imports it into Grimoire, all of that content lands in their campaign, ready to run.

This turns a single PDF into a complete adventure package: the readable module **and** the game-ready data, in one shareable file.

## What can be embedded

Anything a World Bundle can carry:

- **Campaign content** — NPCs, locations, factions, quests, notes, encounters, characters, custom classes and subclasses, calendar events.
- **Your library** — homebrew monsters, items, homebrew spells, species, and even other Scriptorium documents.

You pick exactly which entities go in — nothing is included automatically.

## Creating a shareable PDF (two steps)

**Step 1 — Export your document as a PDF.**
In the Scriptorium editor, click the **PDF** button above the preview and save the file using your browser's print dialog.

**Step 2 — Attach your campaign data to it.**
Go to **Campaign Settings → World Bundle**. Walk through the wizard: choose the entity categories, tick the specific entities you want to share, and give the bundle a name. On the final step, click **Attach to PDF…** and select the PDF you saved in step 1. Grimoire embeds the data and downloads a new copy ending in `-grimoire.pdf`.

That `-grimoire.pdf` file is the one to share.

## Importing a PDF with campaign data

The receiving DM opens **Campaign Settings → World Bundle → Import**, and selects the PDF (the same place also accepts plain `.grimoire` bundle files). Grimoire reads the embedded data and shows a preview of everything inside; they choose what to import into their campaign.

Player visibility flags and party-member links are cleared on import, so nothing arrives pre-revealed to the other table's players.

## Good to know

- **Re-saving strips the data.** The embedded bundle survives normal sharing — email, Discord, cloud drives, printing. But if the PDF is run through another program that *re-saves* it (an editor's "export", "print to PDF" again, some compressors), the hidden attachment is removed. Share the `-grimoire.pdf` file as-is.
- **The PDF stays a normal PDF.** People without Grimoire can read and print it like any other file; the embedded data is invisible to them.
- **Data and document are independent.** The embedded entities don't have to match what the document shows — you decide what a recipient receives.
