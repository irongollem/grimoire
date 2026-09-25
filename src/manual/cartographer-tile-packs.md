---
title: Cartographer: Tile Packs
section: Cartographer
section_order: 10
order: 2
summary: Upload your own map art or generate a tile pack with AI, and share it with a campaign.
keywords: cartographer, tile pack, custom tiles, upload, zip, manifest, webp, share pack, generate tiles, AI tiles, GPT Image, credits, retries, style proof, pro
---

Open **Cartographer → Tile Packs** (the **Tile Packs** button on the map list) to manage your own custom map art. Grimoire also ships a set of built-in packs that admins illustrate over time: those appear directly in the map editor's pack picker and aren't managed from this page.

## Key ideas

| Term | Meaning |
| --- | --- |
| Pack | A themed set of floor/wall/door/object art a map can paint with |
| Slot | One required tile in a pack (a floor variant, a wall segment, a door…) |
| Proof | The first three tiles (floor, wall, solid block) generated for approval before the rest |

## Available packs

The **Available packs** panel lists every pack you can currently paint with: your own uploaded or AI-generated packs, plus any read-only pack shared into your active campaign by another DM. A **Read only** badge marks packs you don't own: you can use them but not edit, delete, or reshare them. If you own a pack, you can toggle **Share with active campaign** so its members can paint with it too, and **Delete pack** to remove it (this also cancels any of its generation runs still in progress).

## Upload a pack

Custom uploads require **Pro**. Choose **Choose zip** or **Choose folder** (a folder containing `manifest.json` and its assets). Grimoire checks the pack right in your browser before uploading anything: it checks for the current format version, every required slot, canonical WebP-only assets, and exact 128×128 decoded dimensions, and reports what's missing rather than uploading a broken pack. Grimoire re-checks everything again on its end before registering the pack.

## Generate a pack

Generating a pack works on every plan: you need an active campaign selected, its AI Assistant switched on, and enough credits. With AI off, the panel shows "AI is off for this campaign" with a **Turn it on** link instead of the form.

1. Enter a **Concept name** (up to 100 characters) and a **Description** (up to 1,000 characters): materials, motifs, palette, and mood.
2. Click **Create generation run**.

Generation uses GPT Image 2 at low quality and spends credits one tile at a time. **Each tile costs 12 credits, and that includes up to three retries.** You're charged once when a tile first generates; regenerating it costs nothing until all four attempts are used, after which the tile shows **No retries left**. A complete required set is 20 tiles, so a full pack costs 240 credits whether you accept every tile on the first try or retry your way through all of them.

The run first generates three **style proofs** (a floor, a wall, and a solid block) and pauses. Review them at their actual tile scale:

- Click **Regenerate (N left)** under any proof tile you don't like.
- Once you're happy with the visual family, click **Approve and generate pack** to spend the rest of the budget on the remaining required slots.

While a run is generating, its card shows a progress bar and **completed/total jobs**. Any failed slot lists its error with a **Retry (N left)** button, or **No retries left** once they're exhausted. **Cancel** stops a run before it spends any more credits; reloading the page doesn't lose progress: the run resumes from wherever it left off.

Generated packs join your normal Cartographer pack picker once every required slot passes validation.

## Tips

> Uploading a pack you made yourself is the one Pro-only part of this page: on Free the upload panel shows a **View plans** button instead. Generating a pack and painting with shared campaign packs work on every plan.

- A provider failure or an unusable result releases its credit reservation without using one of your retries: you're only charged for tiles that actually came back usable.
- Deleting a pack removes its manifest, generated candidates, and normalized assets. Maps that used it fall back to another pack until you pick a replacement.

## Related

- [Cartographer: Overview](#cartographer-overview)
- [Cartographer: Export & AI Style](#cartographer-export-ai-style)
- [Billing & Subscription](#billing-subscription)
