---
title: Simulacrum — 3D Minis
section: Publishing
section_order: 14
order: 6
summary: Turn an NPC, monster, or character portrait into a downloadable 3D miniature for printing or a VTT.
keywords: simulacrum, mini, miniature, 3d, stl, glb, print, vtt, meshy, sculpt, forge, base, teaser
---

**Simulacrum** turns a portrait already on an NPC, monster, or party member into a downloadable 3D miniature — a grey resin-ready model for printing, or a full-colour low-poly model for a virtual tabletop. Find it in the sidebar under **Compendium → Publish → Simulacrum** (route `/minis`; desktop only).

This is an **admin-gated feature**. It may not appear in your sidebar at all — see "Turning it on" below.

## Key ideas

| Term | Meaning |
| --- | --- |
| **Format** | **Print** (unpainted grey resin, high-poly STL/GLB/3MF, for a 3D printer) or **VTT** (full-colour, low-poly GLB/USDZ, for a virtual tabletop). |
| **Stylize** | The paid step that re-renders the portrait into a mini-appropriate style before sculpting. Re-rollable. |
| **Sculpt** | The step that turns the stylized image into an actual 3D model. |
| **Re-sculpt** | Redoing the sculpt on the same or a new stylized image — free, capped at 2 per mini. |
| **Base** | A separate 25mm pedestal composited onto the finished figure; you pick its colour and 28/32mm scale after the fact, at no extra cost. |

## Turning it on

Simulacrum ships in one of three modes, set by your admin in **Admin → Providers**:

- **Hidden** — the nav item and the "Mini" button are hidden everywhere.
- **Teaser** — the nav item appears, but opening it shows an in-lore "not yet available" notice with a **Notify me** button.
- **Live** — the full wizard is available.

If your sidebar has no Simulacrum entry, ask whoever administers your Grimoire instance to enable it.

## Forging a mini

1. Open any **NPC**, **Monster**, or party member that has a portrait, and click the **Mini** button on its image.
2. **Format** — choose **Print** ("Unpainted grey resin, ready for a 3D printer" — high-poly STL, GLB & 3MF; a single connected body, mounted on a 25 mm base; you paint it yourself once it's printed) or **VTT** ("Full-colour, low-poly render for virtual tabletops" — textured GLB & USDZ; a simplified clean silhouette, mounted on a base; drop straight into your VTT of choice).
3. **Stylize** — Grimoire re-renders the portrait into a mini-appropriate look. You can re-roll this step if you don't like the result (each attempt is paid in credits, on every plan). This step needs the campaign's AI Assistant switched on (Campaign Settings → AI Assistant) — if it's off, the step points you at the toggle instead of running.
4. **Sculpt** — the stylized image is turned into an actual 3D model. This step can take several minutes; you can navigate away and come back — the gallery card updates the moment it's ready.
5. **Done** — preview the model in 3D, then download it from the minis gallery (see below).

If a sculpt comes out wrong, you get **two free re-sculpts** per mini before you'd need to start over with a fresh stylize.

### Base & scale

Once a mini is ready, a **Base & scale** control lets you swap the pedestal colour and toggle between 28mm and 32mm scale — instantly, for free, with no re-sculpt needed.

## The minis gallery

`/minis` lists every mini you've forged, each showing its source entity's name (even if the source is later renamed or deleted). **Search**, a **format** filter, and a **status** filter (ready / in progress / failed) narrow the list.

## What your players see

When a mini exists and is ready, a small badge appears over the matching portrait wherever players see it — their own character sheet, party member cards, a shared NPC card, or a discovered monster in the Bestiary lightbox. Tapping it swaps the portrait for the live 3D preview, with the same GLB/STL downloads you have.

Visibility follows the same rules as everything else about that source: a party member's mini is visible to the whole party, an NPC's mini only if that NPC (and its portrait) is already shared, and a monster's mini only once the player has discovered it. A player never sees a mini for something they haven't otherwise been shown.

A player's badge can lag up to a minute behind you finishing a sculpt — it updates on their next data refresh rather than instantly.

## Tips

> Forging a mini spends real credits: the sculpt step is a substantial cost, quoted before you confirm. Re-sculpts (up to 2) and base/scale changes are free.

- **Minis are generated baseless and based afterward.** The 3D model itself has no pedestal; Simulacrum composites a real-world-scaled base onto it so a halfling mini and an ogre mini come out sized relative to each other, not identical blobs.
- **A failed sculpt doesn't cost you a re-sculpt**, and a failed *first* sculpt refunds in full.
- **Renaming or deleting the source entity doesn't break your mini** — the gallery keeps a snapshot of its name.

## Related

- [Gallery](#gallery) — a separate pipeline; minis do **not** appear there.
- [NPC Tracker — Overview](#npc-tracker-overview) and [Bestiary — Overview](#bestiary-overview) — where you'll find the **Mini** button on an entity.
- [Billing & Subscription](#billing-subscription) — Simulacrum's stylize step spends credits; buy more there if you run short.
