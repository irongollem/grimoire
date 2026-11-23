---
title: Importing an Adventure
section: Getting Started
section_order: 0
order: 5
summary: Turn a PDF, page photos, pasted text, a Scriptorium book, or a LegendKeeper, World Anvil or Obsidian export into NPCs, monsters, locations, items, quests and canon.
keywords: import, bring in a book, document, pdf, photo, scan, ocr, extraction, adventure, module, book, wizard, review, wiki, legendkeeper, world anvil, obsidian, markdown, zip, paste text, scriptorium book, upload, cost, credits, page limit
---

Use this when you already have an adventure, setting book or wiki and want it in your campaign without retyping it. Instead of typing up a chapter by hand, hand Grimoire the source material and review what it found. An AI pass reads a PDF, a batch of page photos, text you paste in, or chapters of a Scriptorium book, pulls out factions, monsters, NPCs, locations, items, spells, quests, deities, canon and encounters, and lets you decide, entity by entity, what happens to each one before anything is saved. It's DM-only; there's no player-facing side to this at all. Open it from the **Canon** page with **Bring in a book**. With the campaign's AI Assistant off, only the wiki export (below) is offered, because that route needs no AI.

## Key ideas

| Term | What it means |
| --- | --- |
| **Source** | What you're importing from: a PDF, a batch of page photos, text pasted directly in, a book from your own Scriptorium, or a wiki export. |
| **Extraction** | The AI pass that reads the source and returns a structured list of entities. |
| **Decision** | What happens to one extracted entity: **Link** it to something you already have, **Create** it fresh, **Generate** it (monsters only, when the page gave no real stats), or **Ignore** it. |
| **Entity kinds** | Factions, monsters, NPCs, locations, items, spells, quests, deities, canon entries and encounters. Everything is imported first and then linked together, so a link can point at a kind that comes later in the list. |

## Uploading a document

1. Choose your source with the **Upload** / **Paste text** / **A book** / **Wiki export** control at the top.
2. **Upload**: click **Choose a PDF or photos** and pick one PDF, or one or more page photos. **Paste text**: paste your text into the editor. It's a rich-text box on purpose, so headings, tables, and boxed text carry through to the extraction; a plain paste from a plain-text source still works, just with less structure for the model to use. **A book**: pick one of the campaign's Scriptorium books under **Book**, tick the **Chapters to read** (**Tick all** selects them all), and click **Start import**. Things the book already links to are found by name and linked, not made again.
3. Once a source is selected, its page count and estimated credit cost appear. Free plans are capped at **10 pages** per import; Pro raises that to **50**.
4. Enter a **Name** for the import (auto-suggested from a single PDF's filename).
5. Tick **I have the right to use this material.** This is required before you can upload.
6. Tick **This is my own writing** if you wrote the source yourself. Your prose is then kept word for word. Leave it off for a published book, whose scenes are put in other words, in full.
7. Click **Upload**.

## Starting extraction

Once uploaded, the import sits at **Ready to extract**, showing its page count and cost (base cost plus a per-page charge). Click **Start extraction** to run it: this is the point credits are actually spent. You can leave the tab; extraction keeps running in the background. Click **Abandon** instead to delete the uploaded document without extracting it.

## Reviewing what was found

Once extraction finishes, the review step walks through each kind of entity the page yielded (only the kinds actually found appear), one screen per kind, with **Back**, **Next** and **Skip this type** at the foot. For each entity you'll see a status (**Link**, **Create**, **Generate**, or **Ignore**) and can change it:

- **Link** to an existing row (your own, or from the shared library) that the matcher found. Choosing a shared-library row for a monster or item **adds it to your own collection** rather than merely pointing at it, so it can be attached properly to the beats, encounters, and loot lists your import created.
- **Create** a brand-new row.
- **Generate**: monsters only, offered when a page named a creature but gave it no real stat block; this runs the same AI monster generator as **Bestiary**'s own generate button, without a portrait.
- **Ignore**: skip it entirely; nothing is created or linked.

A row with more than one plausible match, or only a partial-name match, starts open so you can look at it; an exact single match starts collapsed with its status already shown. Group actions (**Ignore all**, **Reset to suggested**) are available per kind.

The last screen, **Ready to import**, lists what each kind will do, has an optional **Source book** name to file monsters and items under, and the **Import** button, which also shows the credit cost of anything you set to **Generate**.

If any kind would push you over your plan's limit for that resource, a warning names which one and how many would be refused, and the confirm action stays disabled until your choices fit.

## Handling failures and retries

If an extraction fails, the import shows **Import failed** with the error message. Click **Retry extraction** to try again with the same uploaded document: this button disappears once the import has expired (24 hours after upload), because by then the source document itself has been cleaned up and a retry would fail regardless. Click **Discard** to give up on it and start over.

## Finishing

Once you click **Import**, **Import complete** shows a count of what was actually created for each kind, with **View** links to open them; click **Done** to close it. You can then use **Start a new import** to bring in another document.

## Importing a wiki export

Moving over from LegendKeeper, World Anvil or Obsidian? Choose **Wiki export** at the top of the import tab. This one needs **no AI and no credits**: your browser reads the files, nothing is sent to a model, and everything it creates is for your eyes only until you share it yourself.

1. Pick the export: a **.zip**, the Markdown or HTML files themselves, or an unzipped export **folder**.
2. **Sort.** You see which app the export looks like, any files that were not read (images and settings, with the reason), and your pages grouped by folder. Each page has a guess at what it is: **NPC**, **Place**, **Faction**, **Quest**, **Item**, **Note**, or **Skip**. Change any of them, or use **Set all to…** on a folder to settle a whole folder at once. Big folders start closed.
3. Name the import, tick **I have the right to use this material**, and continue.
4. **Review.** Each page matching something you already have is linked rather than copied; you can change it to **Create** or **Ignore**, and open a page to see how its text will be stored. If the import would go past your plan's limits, it tells you before anything is written.
5. **Import.** One exported page becomes one record, kept whole as rich text. Pages nested under a place in your wiki put their NPCs and sub-places inside it, and links between pages become @mentions of places, factions and NPCs. A link to a quest, item or note stays as plain text, and the result lists any link that could not be turned into a mention.

A quest page becomes a quest with a one-line summary, and the rest of its text goes into the quest's own DM notes. No beat is made for it.

Afterwards you can optionally tick imported pages to be **read by AI** for stat blocks and other details. That is a normal AI import of just those pages, with its usual page limit, credit cost and review; it is not offered when AI is turned off for the campaign.

If the page is reloaded halfway through a review, the import tab says it was interrupted: drop the same export again to carry on (your choices of kind are remembered), or abandon it.

## What your players see

Nothing: this entire feature, from upload through review, is DM-only. Whatever content the import creates (NPCs, locations, quests) becomes visible to players exactly the same way as if you'd created it by hand, subject to the same visibility controls those features already use.

## Tips

> A page's mechanics (stat blocks, damage values, spell effects) are copied exactly; descriptive prose is put in the model's own words rather than copied verbatim, and a quest's scenes are paraphrased in full, with every detail you need to run them: this is a deliberate legal choice, not a quality setting, so don't expect flavour text to read identically to the source. The **This is my own writing** tick is the exception, for text that is already yours.

- Only one import can be in progress per campaign at a time: starting a new one while another is uploading, extracting, or under review isn't offered until the current one finishes or is abandoned/discarded.
- Page photos are automatically resized before upload; you don't need to compress them yourself.
- Just want one quest? **Quests → New Quest** has its own "Paste a page" mode that runs the same extraction for a single quest, with a shorter one-screen review instead of a step per entity kind: see [Quest Log](#quest-log).

## Related

- [Welcome to Grimoire](#welcome-to-grimoire)
- [Creating Your First Campaign](#creating-your-first-campaign)
- [Campaign Settings](#campaign-settings)
- [AI Generation & Credits](#ai-generation-credits)
- [Quest Log](#quest-log)
