---
title: Soundboard
section: Running the Table
section_order: 1
order: 5
summary: Ambient sounds and music for your sessions, organized into pages, scenes and playlists, with a mixer, effects and Chromecast output.
keywords: soundboard, sound, music, ambient, scene, spotify, playlist, page, mixer, volume, trim, effects, cast, chromecast, carplay
---

The Soundboard holds the ambient tracks, music, and one-shot effects you cue up during a session: a per-campaign library played through pads you tap at the table. Find it under **Campaign → Soundboard** in the sidebar (`/soundboard`).

## Key ideas

| Term | Meaning |
| --- | --- |
| Page | A named board of sound pads: one per dungeon, one for the tavern, and so on. |
| Category | Ambient, Music, Effects or Misc: decides how a sound behaves in the mix (see below), not just its label. |
| Scene | An **ambient** playlist: every track loops as a simultaneous layer, so several scenes can stack (rain over a tavern). |
| Playlist | A **music** playlist: tracks play one at a time and auto-advance, crossfading between them. |
| Arrange / Perform | Two looks for the same board. **Perform** (big pads, no edit controls) is automatic while a session is running; end the session, or use the page's own controls, to get back to **Arrange**. |

## Adding and organizing sounds

1. Click **Add Sound**. It shows your remaining quota on free plans, e.g. "Add Sound (14/20)".
2. Choose a source: **URL**, **Upload** (Pro), **Spotify**, **Generate** (AI, needs the campaign's AI Assistant on, and works on every plan, billed to credits), or browse the **Grimoire library** (free, curated, doesn't count against your quota) or Freesound's CC0/CC-BY clips.
3. Assign it to a **page**: a separate board you switch between with the tabs at the top. Create more pages from those tabs (also quota-gated on free plans).
4. Search and filter by category to find a sound fast mid-session.
5. Drag cards to reorder them within a page: disabled while a filter is active, so you don't lose track of position.

The **category** you give a sound decides how it behaves in the mix, not just how it's labeled: Music and Ambient sounds sit under everything else, while an Effects sound briefly ducks them so a thunderclap or a door slam lands clearly instead of fighting the bed underneath it.

If your board is empty, a starter-scenes offer lets you add a handful of ready-made ambient scenes in one click instead of building from nothing.

## The mixer

Open the floating widget and expand **Mixer** for a master fader plus one per group: Music, Ambience and Effects. Pulling Ambience down quiets every ambient layer at once without touching your music: much faster than riding each sound's own slider when the table gets loud.

## Trim: fixing sounds that are too loud or too quiet

Sounds from different sources arrive at wildly different levels: a field recording and a produced music track are rarely close. **Trim** on a sound card is the one-time correction for that: set it once and the app remembers, so you're not rebalancing the same sound every session.

Trim is deliberately separate from the volume slider. Volume is what you ride during play; trim is the correction underneath it. A sound you've adjusted shows a small gold badge so you can see at a glance which ones you've leveled.

## Effects

The wand icon on a sound applies a filter (through a door, through a wall, distant, underwater, cave or sewer) for when the party hears something from somewhere else. Effects fade in and out rather than snapping.

## Scenes and Playlists

Switch the **Sounds / Scenes / Playlists** toggle at the top of the page. **Scenes** and **Playlists** are both built from your sound library, but behave differently once playing:

- **Scenes** (ambient): every track in the scene loops **simultaneously** as an independent layer. There's no shuffle, repeat, or "current track": several scenes can run at once (rain over a tavern, a forge under a market).
- **Playlists** (music): tracks play **one at a time** and advance automatically, crossfading rather than cutting. Shuffle and repeat are available. Only one music playlist plays at a time.

The type is fixed when you create it: click **New Scene** or **New Playlist** (whichever matches the tab you're on; both show your remaining quota on free plans, e.g. "New Playlist (2/3)").

## Spotify

If your DM account has Spotify connected in Campaign Settings, click **Connect Spotify** on a sound card to stream directly from your own account alongside your uploaded sounds instead of only self-hosted files. Requires a Spotify **Premium** account: the Spotify SDK rejects free accounts. Spotify never appears for players.

## Playing through other speakers

The **Cast** button sends a music playlist to a Chromecast or Google speaker, so the table hears it from the room's speakers instead of your laptop. Scenes are layered locally and can't be cast.

Music playlists also appear in your phone or car's own media controls (lock screen, CarPlay, Android Auto, Bluetooth buttons), showing the track name, artist and artwork, with play/pause and skip.

## The floating widget

The soundboard toggle in the top bar opens a small floating player so you can control playback while working anywhere else in the app, without navigating back to this page. Drag it anywhere on screen. **Stop All** silences everything at once. It also carries its own collapsible Mixer, identical to the one on this page.

## What your players see

The Soundboard itself is entirely DM-only: there's no player-facing soundboard page. What players *can* get, if you choose to share it, is a read-only stream of whatever music playlist is currently playing: switch on sharing for the session, and each player who presses **Join audio** on their own device hears the same track, roughly in sync. It's off by default and resets every session; ambient scenes and one-shot effects are never shared this way, since scene layers and effects fire on random or local timing that would land differently on every device.

## Tips

> Pulling the Ambience bus down when the table gets loud is faster and safer than muting individual sounds: nothing stays silenced by accident after the scene changes.

- Free plans have a quota on sounds, pages, and scenes/playlists combined: see [Billing & Subscription](#billing-subscription) for the exact numbers. Curated library sounds and starter scenes don't count against it.
- Uploading your own audio files is a Pro feature, gated independently of the count-based quotas above. Generating a sound with AI is not: it works on every plan, billed to credits, once the campaign's AI Assistant is on.
- A sound's category can't be changed casually without consequence: moving an ambient bed to Effects makes it duck the mix instead of sitting under it.

## Related

- [Running a Session](#running-a-session): what switches the board from Arrange to Perform.
- [Dashboard](#dashboard): the Ambience widget jumps straight to a named page.
- [Campaign Settings](#campaign-settings): where Spotify is connected for your account.
- [Billing & Subscription](#billing-subscription): exact free-plan quotas.
