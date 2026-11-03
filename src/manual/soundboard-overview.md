---
title: Soundboard
section: Running the Table
section_order: 1
order: 5
summary: The deck, a grid of sound pads docked under every page, for music, ambience and effects at the table, with lanes, takes, Hush, a mixer and Launchpad support.
keywords: soundboard, deck, pad, lane, take, sound, music, ambient, scene, spotify, playlist, page, mixer, hush, launchpad, midi, controller, volume, trim, effects, cast, chromecast, carplay
---

The Soundboard is an instrument you play at the table. Its **deck** is one grid of pads, docked at the bottom of every page, so the rain, the tavern song and the door slam are always one tap away, whatever you are looking at. You build the deck on the **Soundboard** page (**Campaign → Soundboard** in the sidebar, `/soundboard`).

## The deck

The deck sits under the page and pushes it up, so it never covers what you are reading. Pick how much room it gets:

| Size | What you see |
| --- | --- |
| **Tucked** | A slim handle that shows what is playing. |
| **Row** | One pad per lane. |
| **Deck** | Two and a half rows. The cut-off half tells you there is more; scroll for the rest. |
| **Full** | The whole window. |

Press **D** to step through the sizes. Each device remembers its own choice.

**Peek.** From Tucked or Row, reach for the deck (rest the pointer on its top edge, swipe up on a phone, or press a number key) and it opens to Deck size over the page, then settles back by itself. It also peeks when audio starts on its own, such as an encounter's battle music or a room's ambience, so you always see what is playing and can stop it. You can switch peek off in the deck's settings.

Until you have built a deck, the dock is one quiet line, **Build your deck**, that takes you to the Soundboard page. On the Soundboard page itself the deck is the page, so the dock steps aside.

## Pads, lanes and pages

A **page** is a whole deck: one for the dungeon, one for the tavern. You switch pages with the tabs on the deck.

Each page has **8 lanes** (columns) and as many rows as you need. A lane has a name and one rule:

- **One at a time.** A new pad crossfades the old one. New music replaces the old music.
- **Together.** Everything overlaps. An effect never stops the music.

A new page starts with Music and Place (one at a time), Ambience, four Effects lanes and Stingers (together). You can rename any lane and change its rule.

### Sound the campaign starts by itself

A fight can start its own music, a quest beat can cue a sound, and the party arriving somewhere can bring in that place's ambience. That sound shows up on the deck in its own lane: fight and quest music in **Music**, where the party is in **Place**, a quest's ambience in **Ambience**. If one of your pads already holds it, that pad lights up. If not, it appears in the lane's first free slot as a dashed pad that says what started it, for example "From Goblin ambush".

- **Press it** to stop it, like any pad.
- **Keep** turns it into a real pad in that slot, so it is there next time.
- The lane's rule applies. A fight's music fades out the Music pad you had playing, and pressing a Music pad takes over from the fight.

Once you change or stop the music yourself, it is yours: when the fight ends, the deck leaves your choice alone. To pick which lane takes what, click a lane's name in the builder and set **Plays here by itself**.

A **pad** is one of three things:

| Pad | What it plays |
| --- | --- |
| **Sound** | One or more sounds, called **takes**. With several takes, each press plays the next one, nudged slightly in pitch and loudness so a repeated sound does not sound machine-made. |
| **Scene** | An ambient playlist. Every track loops as a layer, so rain and a crackling fire can run together. |
| **Playlist** | A music playlist. Tracks play one at a time and crossfade. |

Every sound has a **category** that decides which part of the mix it joins: **Music**, **Ambience** or **Effects**. Music and Ambience sit under everything else, while an Effects sound briefly ducks them so a thunderclap lands clearly.

## What a press does

Each pad has a **launch mode**, and that is all a plain press does. There are no hidden double-taps.

| Mode | A press |
| --- | --- |
| **Trigger** | Plays once. Every press fires it again. |
| **Toggle** | Starts it. Press again to stop it. |
| **Gate** | Plays while you hold it, stops when you let go. |
| **Repeat** | Fires on a beat for as long as you hold it. |

Music, ambience and scenes default to Toggle and loop. Effects default to Trigger. You can change any pad's mode and loop setting.

## Tools, Hush, Fade all and Pause all

For everything else, the deck has **tools**. Tap a tool to lock it on, then tap pads. Or hold a tool to borrow it for a moment, the way Shift works, and let go to go back to normal play.

| Tool | Key | A press on a pad |
| --- | --- | --- |
| **Play** | P | Plays it (the normal state). |
| **Loop** | L | Turns looping on or off. |
| **Stop** | S | Stops it. |
| **Fade** | F | Fades it out, or in. |
| **Solo** | O | Keeps it at full level and drops everything else back. Clears itself when it ends. |
| **Volume** | V | Drag on the pad to set its level. |
| **Edit** | E | Opens the pad's settings. |

Always within reach on the deck:

- **Pause all** holds everything where it is. Press again to resume.
- **Hush** drops everything to a murmur while you talk. Tap to lock it, or hold **H** to hush only while the key is down.
- **Fade all** takes everything out over a few seconds (**Shift+F**).
- **X** stops everything at once.

## Building the deck

Open the **Soundboard** page. On the left is your **library**: your sounds, scenes and playlists, plus the shared Grimoire sounds, with search and a category filter. In the middle is the deck you are building, and the **Build / Play** switch lets you try it out right there. While a session is running the page opens in Play.

- **Add a sound.** Click **Add sound**, then choose a source: **URL**, **Upload** (Pro), **Spotify**, **Generate** (AI, needs the campaign's AI Assistant on, and works on every plan, billed to credits), or browse **Grimoire Sounds** (free, curated, doesn't count against your quota) or Freesound's CC0/CC-BY clips.
- **Place it.** Drag a row onto a slot, or select an empty slot and click the row.
- **Add a take.** Drop a sound onto a pad that already has one and it becomes another take of that pad.
- **Move pads.** Drag a pad to another slot. If a pad is already there, the two swap. Drop a pad on a page tab to send it to that page.
- **Scenes and playlists.** Use **New scene** or **New playlist** in the library. The type is fixed when you create it. Free plans have a quota on these. A scene or playlist goes on an empty slot.
- **Lanes.** Click a lane's name to rename it and choose how it plays.
- **Pad settings.** Select a pad to open its settings: name, loop, volume, launch mode, fade in and out (leave empty for the usual fade), whether each hit varies a little, and whether a controller's harder hit plays louder. Changes save by themselves; **Done** closes the panel.

If you start with nothing, a starter-scenes offer adds a handful of ready-made ambient scenes in one click.

### Trim: fixing sounds that are too loud or too quiet

Sounds from different sources arrive at wildly different levels. **Trim**, in a pad's settings, is the one-time correction: set it once and the app remembers it. It is separate from the pad's volume, which is what you ride during play.

### The mixer and effects

The **mixer** (in the deck, and as a drawer on the Soundboard page) has a master fader plus one each for Music, Ambience and Effects. Pulling Ambience down quiets every ambient layer at once without touching your music. The wand beside the master fader puts the whole mix through a filter: through a door, through a wall, distant, underwater, cave or sewer. To put one pad's sound through a filter instead (a voice behind the door, the rest of the room clear), open the pad's settings in Full: **Effect** sits under the fades, and holds for the rest of the session.

## Simple and Full

The deck has two modes, set behind the settings pip in its header. **Simple** is a tap to play, plus Loop, Stop, Pause all, Hush and Fade all. **Full** adds every tool, the launch-mode glyphs, lanes and controllers. New DMs start on Simple; anyone who already had sounds starts on Full. The switch only shows or hides controls. It never changes how a pad sounds, and a pad shows a small glyph whenever its mode is not the usual one for its kind.

## Keys

| Key | What it does |
| --- | --- |
| **1** to **8** | Fire the top pad of that lane. |
| **L S F O V E** | Hold to borrow Loop, Stop, Fade, Solo, Volume or Edit. Tap to lock. |
| **P** | Back to Play. |
| **H** | Hush. |
| **X** | Stop everything. |
| **Shift+F** | Fade everything out. |
| **D** | Change the deck size. |
| **Space** | Pause or resume everything, on the Soundboard page while playing. Elsewhere Space keeps its usual job. |
| **Ctrl/Cmd+Shift+K** | Search all your sounds and scenes and fire one. |

## On a phone

On a phone the deck is a bottom sheet above the navigation bar. Folded, it shows four pads and Hush. Open it for the whole deck, four lanes at a time: swipe sideways for lanes 5 to 8. Tools and the big buttons sit at the bottom, in thumb reach.

## Controllers

You can play the deck from a **Launchpad** (Mini MK3, X or Pro MK3). Open **Board settings** on the Soundboard page and connect it. The grid mirrors the page you are on, the top row picks pages, the right column holds the tools, and the lights show which pads are ready, playing and looping. On models that sense how hard you hit, a harder hit can play louder.

Any other MIDI controller works through **Learn a control**: pick what it should do, then press the key or turn the knob. Learned controls have no lights.

Controllers need **Chrome, Edge or Firefox**. **Safari** cannot talk to MIDI controllers, so you will see a note saying so; everything else on the deck works there. The browser asks once for permission, and after that the deck reconnects by itself.

## Spotify

If your DM account has Spotify connected in Campaign Settings, you can add a Spotify track as a sound and play it from a pad alongside your uploaded sounds. A Spotify pad can't vary its pitch or loudness, and looping it repeats the track. Requires a Spotify **Premium** account. Spotify never appears for players.

## Playing through other speakers

Music playlists also appear in your phone or car's own media controls (lock screen, CarPlay, Android Auto, Bluetooth buttons), showing the track name, artist and artwork, with play/pause and skip.

To play the music on a Google Home or Chromecast speaker, open the **mixer** and use **Cast to a speaker** (Chrome and Edge on a computer, or Android). The mixer's levels and effects do not reach a Cast speaker; it plays the music as it is.

## What your players see

The Soundboard itself is entirely DM-only. What players *can* get, if you choose to share it, is a read-only stream of whatever music playlist is currently playing: switch on sharing in Board settings, and each player who presses **Join audio** on their own device hears the same track, roughly in sync. It's off by default and resets every session; ambient scenes and one-shot effects are never shared this way, since they would land differently on every device.

## Tips

> Pulling the Ambience fader down when the table gets loud is faster and safer than muting individual pads: nothing stays silenced by accident after the scene changes.

- Put the sounds you reach for most in the top row: keys **1** to **8** fire it without touching the mouse.
- Free plans have a quota on sounds, pages, and scenes/playlists combined: see [Billing & Subscription](#billing-subscription) for the exact numbers. Curated library sounds and starter scenes don't count against it.
- Uploading your own audio files is a Pro feature, gated independently of the count-based quotas above. Generating a sound with AI is not: it works on every plan, billed to credits, once the campaign's AI Assistant is on.
- A sound's category decides which fader it rides and whether it ducks the mix. Moving an ambient bed to Effects makes it duck the mix instead of sitting under it.

## Related

- [Running a Session](#running-a-session): what switches the Soundboard page to Play.
- [Dashboard](#dashboard): the Ambience widget jumps straight to a named page.
- [Campaign Settings](#campaign-settings): where Spotify is connected for your account.
- [Billing & Subscription](#billing-subscription): exact free-plan quotas.
