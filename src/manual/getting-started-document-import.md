---
title: Importing an Adventure
section: Getting Started
section_order: 0
order: 5
summary: Turn a PDF, page photos, or pasted text into NPCs, monsters, locations, items, and quests.
keywords: import, document, pdf, photo, ocr, extraction, adventure, wizard, review
---

Instead of typing up a chapter of an adventure by hand, hand Grimoire the source material and review what it found. An AI pass reads a PDF, a batch of page photos, or text you paste in, pulls out factions, monsters, NPCs, locations, items, spells, quests, and encounters, and lets you decide — entity by entity — what happens to each one before anything is saved. It's DM-only; there's no player-facing side to this at all. Open it from **Campaign Settings → Import Document**.

## Key ideas

| Term | What it means |
| --- | --- |
| **Source** | What you're importing from: a PDF, a batch of page photos, or text pasted directly in. |
| **Extraction** | The AI pass that reads the source and returns a structured list of entities. |
| **Decision** | What happens to one extracted entity: **Link** it to something you already have, **Create** it fresh, **Generate** it (monsters only, when the page gave no real stats), or **Ignore** it. |
| **Entity kinds** | Factions, monsters, NPCs, locations, items, spells, quests, and encounters — imported and linked in that order, so later kinds can reference earlier ones by name. |

## Uploading a document

1. Choose your source with the **Upload** / **Paste text** control at the top.
2. **Upload**: click **Choose a PDF or photos** and pick one PDF, or one or more page photos. **Paste text**: paste your text into the editor — it's a rich-text box on purpose, so headings, tables, and boxed text carry through to the extraction; a plain paste from a plain-text source still works, just with less structure for the model to use.
3. Once a source is selected, its page count and estimated credit cost appear. Free plans are capped at **10 pages** per import; Pro raises that to **50**.
4. Enter a **Name** for the import (auto-suggested from a single PDF's filename).
5. Tick **I have the right to use this material.** — required before you can upload.
6. Click **Upload**.

## Starting extraction

Once uploaded, the import sits at **Ready to extract**, showing its page count and cost (base cost plus a per-page charge). Click **Start extraction** to run it — this is the point credits are actually spent. You can leave the tab; extraction keeps running in the background. Click **Abandon** instead to delete the uploaded document without extracting it.

## Reviewing what was found

Once extraction finishes, the review step walks through each kind of entity the page yielded (only the kinds actually found appear). For each one, you'll see a status — **Link**, **Create**, **Generate**, or **Ignore** — and can change it:

- **Link** to an existing row (your own, or from the shared library) that the matcher found. Choosing a shared-library row for a monster or item **adds it to your own collection** rather than merely pointing at it, so it can be attached properly to the beats, encounters, and loot lists your import created.
- **Create** a brand-new row.
- **Generate** — monsters only, offered when a page named a creature but gave it no real stat block; this runs the same AI monster generator as **Bestiary**'s own generate button, without a portrait.
- **Ignore** — skip it entirely; nothing is created or linked.

A row with more than one plausible match, or only a partial-name match, starts open so you can look at it; an exact single match starts collapsed with its status already shown. Group actions ("Ignore all," "Reset to suggested") are available per kind.

If any kind would push you over your plan's limit for that resource, a warning names which one and how many would be refused, and the confirm action stays disabled until your choices fit.

## Handling failures and retries

If an extraction fails, the import shows **Import failed** with the error message. Click **Retry extraction** to try again with the same uploaded document — this button disappears once the import has expired (24 hours after upload), because by then the source document itself has been cleaned up and a retry would fail regardless. Click **Discard** to give up on it and start over.

## Finishing

Once you confirm the review, **Import complete** shows a count of what was actually created for each kind. Click **Start a new import** to import another document.

## What your players see

Nothing — this entire feature, from upload through review, is DM-only. Whatever content the import creates (NPCs, locations, quests) becomes visible to players exactly the same way as if you'd created it by hand, subject to the same visibility controls those features already use.

## Tips

> A page's mechanics (stat blocks, damage values, spell effects) are copied exactly; descriptive prose is summarised in the model's own words rather than copied verbatim — this is a deliberate legal choice, not a quality setting, so don't expect flavour text to read identically to the source.

- Only one import can be in progress per campaign at a time — starting a new one while another is uploading, extracting, or under review isn't offered until the current one finishes or is abandoned/discarded.
- Page photos are automatically resized before upload; you don't need to compress them yourself.
- Looking at your quest list instead of Campaign Settings? **Quests → New Quest** has its own "Paste a page" mode that runs the same extraction for a single quest, with a shorter one-screen review instead of a step per entity kind — see [Quest Log](#quest-log).

## Related

- [Welcome to Grimoire](#welcome-to-grimoire)
- [Creating Your First Campaign](#creating-your-first-campaign)
- [Campaign Settings](#campaign-settings)
- [AI Generation & Credits](#ai-generation-credits)
- [Quest Log](#quest-log)
