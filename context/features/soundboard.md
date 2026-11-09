# Soundboard

DM-driven ambient sound and music for live sessions. Since the deck (#1136) the soundboard is an instrument rather than a page: **one grid of pads docked under every DM page**, played by screen, keyboard or a Launchpad, and built on `/soundboard`. Underneath sit a per-campaign library of sounds, scenes and playlists, a custom HTML/Web Audio engine with real-time filter effects, optional Spotify and Google Cast output, and OS-level Media Session integration (CarPlay, lock screen).

**Design:** the canvas *Soundboard Launchpad* (claude.ai artifact `BkqBLyM39mso6fVk1NVUpY`, frames `01 Delta` to `12 Deck sizes`, approved 3 Nov 2026) and the decisions in epic [#1136](https://github.com/irongollem/grimoire/issues/1136). Read both before changing the deck.

**Known-gaps audit:** GitHub issue [#572](https://github.com/irongollem/grimoire/issues/572) is the audit of the audio module against paid standalone tools (Syrinscape, Foundry, Roll20); its engine, scenes, speed, integration and shared-playback phases shipped. Read it before starting content or integration work.

## The deck

### Model

A **page** (`soundboard_pages`) is a deck of **8 lanes** (columns) by as many rows as it needs. A **pad** sits at one `(lane, row)` of a page and is one of three kinds:

| Kind | Plays | Category |
| --- | --- | --- |
| `sound` | its **takes** (one or more sounds), one per press, round robin | the first take's category |
| `scene` | an ambient playlist: every track loops as a layer | ambient |
| `playlist` | a music playlist, one track at a time, crossfading | music |

A sound pad with several takes plays the next take on each press, nudged a little in pitch (rate 0.96 to 1.04) and loudness (gain 0.88 to 1) when the pad's `vary` is on (`takeVariation`). A pad whose playlist is missing from the loaded set has no kind and does not play.

A **lane** has a name and a rule. `one`: a new pad takes over, everything else audible in that lane fades out as the new one fades in (new music stops the old), **and so does the same lane on every other page** (`takeoverLanes`): the lane with the same feed, or for a lane with no feed the one with the same name, as long as that page's lane is `one` too. Music from the tavern page stops music started from the dungeon page (the maintainer, 5 Nov 2026: a page switch is not a request for two tracks); a trigger arriving in a feed's `one` lane reaches every page the same way. `together`: everything overlaps (effects never stop the music). A new page starts as Music `one`, Place `one`, Ambience `together`, four effect lanes `together` named Combat, Creatures, Weather and Doors & traps (so a DM sees at once that lane names are theirs, 8 Nov 2026), Stingers `together` (`defaultLanes()`, held equal to the column default by `deckModel.test.ts`). Lanes are stored on the page, not on the pads.

A lane may also take a **feed**: where audio the campaign starts by itself shows up. `music` is a fight's theme and a beat's music cue, `place` is the sound of where the party is (the party's location and a place page's Play), `ambience` is a beat's scene or ambient sound. A beat's one-shot effect has no lane; it shows in the Now chips only. The defaults put the three on Music, Place and Ambience, and at most one lane per page takes each (the CHECK refuses a second; the lane editor moves it).

**Guest pads.** Triggered audio that no pad on the page holds stands in the first free slot of its feed's lane, lit and labelled "From Goblin ambush", because a DM who wants it gone looks for it on the deck, not in a chip. It is never saved and goes when the audio does. A press stops it (the Fade tool fades it), and **Keep** (or the Edit tool) makes it a real pad in that slot. If a pad on the page already holds the target, that pad lights instead and there is no guest. The lane's rule covers guests both ways: a trigger arriving in a `one` lane fades out that lane's pads, and a pad pressed there stops the lane's guest. Stopping a guest stops the audio; it does not "release" the trigger, which would hand the music back to what played before the fight. The builder treats a guest's slot as free.

**Launch modes** use Ableton's names. What a press does is the pad's mode, shown on the pad; there are no hidden gestures, and every other trick is a tool.

| Mode | A press |
| --- | --- |
| `trigger` | plays once; every press fires again |
| `toggle` | starts the pad; pressing a playing pad stops it |
| `gate` | plays while held, stops on release (never faster than 80ms, so letting go does not click) |
| `repeat` | fires on a beat (`repeat_ms`, 100 to 5000) while held |

**Null means "the kind's default".** A pad's `launch_mode`, `loop`, `fade_in_ms` and `fade_out_ms` are nullable, and null is resolved on the client in `src/lib/audio/deck/deckModel.ts` (`effectiveLaunchMode`, `effectiveLoop`, `effectiveFades`) so a default can change without rewriting rows. Today: scenes and playlists are `toggle`; a sound pad is `toggle` for music and ambience and `trigger` for effects. Loop defaults on for scenes and for music/ambience sounds, off for playlists (they advance) and effects. Default fades (in/out ms): music 1000/1500, ambient 1200/1200, effects 0/150. `volume`, `vary`, `velocity` ("louder the harder you hit") and `repeat_ms` are not nullable.

**Categories are three, one per bus:** Music, Ambience (`ambient`) and Effects. `misc` is gone (it was only the column default and quietly played through the ambience bus).

### Data

| Piece | Notes |
| --- | --- |
| `soundboard_pages.lanes jsonb` | eight `{name, rule, feed?}` objects, validated by `private.is_valid_deck_lanes` (total: false, never NULL; a feed in two lanes is refused) |
| `soundboard_pads` | page, `lane` 0-7, `grid_row` 0-255, optional `playlist_id`, launch mode, loop, volume, fades, vary, velocity, repeat. Unique per `(page_id, lane, grid_row)`, **deferrable** so a swap works |
| `soundboard_pad_takes` | the sounds a sound pad plays, `position`-ordered, unique per `(pad_id, sound_id)` |
| `public.move_soundboard_pad(pad, page, lane, row)` | drag a pad to a slot; a pad already there swaps into the slot it left, in one transaction. `security invoker`: RLS decides who may move what |
| `public.update_soundboard_page_lane(page, lane, patch)` | merges a patch over one lane inside the row update, so two DMs editing two lanes both keep their change; a feed given to this lane moves off the lane that had it. `security invoker` |
| `public.reorder_soundboard_pad_takes(pad, take ids)` | a pad's takes in the order given, in one statement (one ring, never half reordered); ids not on that pad are ignored. `security invoker` |

Migrations `20261103100456_soundboard_deck.sql` (tables, categories, lanes, the guards) and `20261103100457_soundboard_deck_drops_page_columns.sql` (the old columns). The guards, and why each exists:

- **A take's sound must be in the pad's campaign, and only sound pads take takes** (`guard_pad_take_campaign`). A take has no `campaign_id`, so the shared same-campaign trigger cannot see it.
- **A pad's campaign is fixed** (`guard_pad_campaign_fixed`). Its takes were checked against the campaign it was made in; a moved pad would carry another campaign's sounds.
- **An emptied sound pad is deleted** (`drop_empty_sound_pad`, a definer: a sound's deletion cascades here whoever deleted it). The slot reads as empty, not as a dead pad.
- **Take writes follow the pad's own rules, so takes are not a side door.** Insert/update need the DM role the pad's update needs; delete needs what deleting the pad needs (its author or the campaign owner). Otherwise a co-DM could empty another DM's pad of takes and let the definer delete a pad the pad policy protects.
- Both tables ring the campaign doorbell (`signal_campaign_change`, `signal_parent_change`), are copied by the demo campaign, and `soundboard_pads` is handed over by `move_campaign_content`.
- **Gone:** `sounds.page_id`, `sounds.sort_order`, `soundboard_playlists.page_id` and `reorder_sounds`. A sound or playlist is on a page because a pad puts it there; the pad's lane and row are its order.

Client: `useDeckPads` (`src/composables/soundboard/useDeckPads.ts`) reads pads with their takes and holds the mutations (`useCreatePad`, `useUpdatePad`, `useDeletePad`, `useMovePad`, `useAddTake`, `useRemoveTake`, `useReorderTakes`).

### The deck protocol

`src/lib/audio/deck/deckSurface.ts` is types only and Vue-free: **`DeckAction` in, `DeckSnapshot` out.** Every surface speaks it, none talks to the store directly, so a new controller is one more driver and what a press does cannot drift between the pad on screen and the pad under a finger.

- **In:** `press` / `release` (lane, row, optional velocity), `tool` (`down` / `up` borrow, `toggle` locks), `page`, `pageStep`, `hush` (same phases), `fadeAll`, `pauseAll`, `stopAll`, `padVolume`, `master`, `keep` (make the guest in a slot a pad).
- **Out:** pages and the current index, the eight lanes (name, rule, feed, colour category), the cells (kind, the guest when triggered audio stands in the slot, category, name, `DeckLight`, loop, mode and whether it is the default, takes, next take, progress, volume, solo, a `blockedReason`, a meta line, the number key if the pad is in the key row), the row keys fire (`keyRow`), the active tool and the locked one, hush, paused, audible count and master volume. `DeckLight` is `off | ready | playing | looping | fading | ducked | held | blocked`; the screen tints and glows from it and a Launchpad picks LED colour and mode from it.
- **Tools:** `play` (default), `loop`, `stop`, `fade`, `solo`, `volume`, `edit`. Tap a tool to lock it on; hold it to borrow it, the way Shift works. A held tool wins over a locked one. Simple shows `play`, `loop`, `stop` only (`SIMPLE_TOOLS`). Fade and Fade all take 3s (`FADE_TOOL_MS`), Stop 60ms; Edit sends the DM to the pad's settings (`editRequest`).
- **One controller:** `useDeck()` (`src/composables/soundboard/useDeck.ts`) is the only implementation, a shared singleton (three consumers in different places must see one held tool, one set of lights and one round-robin cursor per pad). It reads the store's playback state rather than keeping a copy, so a pad a trigger started (an encounter, a location) lights like any other. Helpers: `useDeckResolved` (pad to kind, category, sounds), `useDeckSnapshot`, `useDeckReadout` (the now-playing chips). Spotify sounds play through the Spotify store: no gain, rate or gapless loop, and repeat-track is their loop.

**The surfaces that speak it:**

- **The screen:** `DeckGrid` / `DeckPad` / `DeckToolStrip` in the dock and in the builder's Play mode.
- **The keyboard** (`useDeckHotkeys`, global layer): `1` to `8` fire the **row in view** (press and release, so Gate and Repeat work, and a release goes to the row the key pressed even if the row moved under it); hold `L S F O V E` to borrow Loop, Stop, Fade, Solo, Volume, Edit, tap to lock; `P` back to Play; `H` Hush (hold or tap); `X` stop everything; `Shift+F` fade everything out. **No global Space, on purpose:** the registry claims a key the moment a binding matches, so a global Space would stop Space pressing buttons and scrolling pages across the whole app. Pause all has its button, and Space is bound only on `/soundboard` in Play mode, on the page layer, and yields when a button has focus. The keys are off while an editor owns the screen (`editorFocus`: the Cartographer, Edit map, the Play screen), whose own letters would otherwise do two things at once; MIDI stays live.
- **A press counts from the moment it lands.** `isPlaying` turns true only once the browser's `play()` resolves, so the store also marks a sound still loading (`isStarting`), and the deck treats a pad as on while it loads (`isLive`): a quick Gate tap, a Toggle's second press, a lane mate taking over, Fade all and Pause all all reach a sound that has not started yet, and a play superseded while it loaded never marks itself playing. A playlist pad still fetching its tracks is cancelled the same way.
- **Launchpad and MIDI** (`src/lib/audio/deck/midi/`, driven by `useDeckMidi`): see below.
- **Stream Deck** ([#125](https://github.com/irongollem/grimoire/issues/125)) is not built; it is one more driver on this protocol.

**Two hold/tap helpers, and why.** Both answer "tap locks, hold borrows", at different moments. `lib/audio/deck/holdTap.ts` (`createHoldTap`) serves the keyboard and controllers: a key or button sends `down` at once, because the DM holds `L` with one finger and hits a pad with another a moment later; a release under `TAP_MS` (250) with no pad fired in between also sends `toggle`. `components/soundboard/deck/tapOrHold.ts` (`createTapOrHold`) serves the on-screen buttons: one finger cannot hold a tool and press a pad, so a tap must lock cleanly without a flash of "borrowed", and `down` waits until the hold passes `HOLD_MS` (the same 250ms). Merging them would give one of the two surfaces the wrong feel.

**MIDI.** `midiAccess.ts` wraps Web MIDI behind minimal interfaces (Safari has none; a denied request reads as a state, never a throw). `launchpadProfiles.ts` holds the per-model table (Pro MK3, X, Mini MK3). `launchpadProtocol.ts` is pure: bytes in, deck events out, a snapshot in, LED messages out. The Launchpad runs in programmer mode: the 8x8 grid shows eight rows of the page from a per-device row offset, and each model's `topRow` and `rightColumn` in `launchpadProfiles.ts` say what its edge buttons do (`LaunchpadButton`: a tool, Play, Hush, a page, a page or row step, Fade all, Pause all, Stop all). The X's buttons follow their printed labels (3 Nov 2026, the maintainer's call): up and down move the grid one row, as Ableton's arrows do, left and right step pages, Session is Play, Note Loop, Custom Pause all, Capture MIDI Stop all; down the side Volume, Pan as Fade, Send A as Fade all, Send B unused, Stop Clip as Stop, Mute as Hush, Solo, Record Arm as Edit. Session exists because a tapped tool locks on, and with no Play button on the device a DM who tapped one found the pads 'stopped working'. The Mini MK3 shares the X's top row; the Pro keeps a page per top button and the plain tool column (its labels are unchecked). LEDs show ready, playing, looping and fading, a row arrow lights only where it can go and a page arrow whenever there is another page (page steps wrap round, on every surface); velocity on models that send it; a Pro's extra buttons give Stop all and paging past page eight. `DECK_TOOLS` is in the X's top-to-bottom order so the screen's tool column reads the same. **The Pro MK3 row is verified against Novation's manual and the X row on a Launchpad X (3 Nov 2026); the Mini MK3 row is from memory and never tried on hardware** (stated in `launchpadProfiles.ts`). The LED colours were picked by eye on that Launchpad X, because the LEDs are not linear: a scaled-down RGB still reads bright and turns muddy and blue at low levels. So playing is full RGB in a device-only gold, green (ambient) and violet blue, with an orange for playlists and an aqua for scenes (7 Nov 2026, chosen from the palette's layout and **not yet checked by eye on the device**), every dim look (ready, ducked, blocked, idle buttons, other pages) is a Novation palette shade, a loop pulses a palette colour and a fade flashes between the pulse colour and the ready shade. `midiLearn.ts` maps any other controller's notes and CCs to pads, tools, page steps, Hush, Fade all, Pause all, Stop all, Master and pad volume, without lights; bindings are per browser in `localStorage` (`grimoire.deckMidi.bindings.v1`), and Master and pad volume accept a CC only. A "how hard you hit" curve (gentle, even, punchy; `velocityGain`) shapes velocity. `useDeckMidiShared` is the one app-wide driver (created once by `SoundDeck`) and reconnects by itself after a reload, **permission-only**: it remembers a successful connect (`grimoire.deckMidi.remembered.v1`, cleared by Disconnect) and reconnects only when the browser already granted sysex MIDI, so it can never raise a permission prompt unasked. Controller settings live in Board settings (`DeckControllersSection`). Web MIDI needs Chrome, Edge or Firefox.

### Engine primitives the deck added

All in the store and `audioEngine`, used by `useDeck`:

- **Per-press `PlayOptions`** (`lib/audio/playOptions.ts`): `fadeInMs`, `gain` (multiplies the sound's level for this play only: velocity, take variation), `rate` (pitch-nudging, `preservesPitch` off), `loop` (gapless). `play()` takes them as a fifth parameter.
- **Gapless loop** (`lib/audio/gaplessLoop.ts`): a looping ambience or effects sound plays as two alternating elements with a 700ms crossfade over the wrap; plain element loop where Web Audio is absent. The partner half has a shadow id (`isLoopShadowId`). **Music loops on one element with the plain loop flag** (`loopsGapless` in the store): the pair keeps a second element of the same file waiting at 0:00, and iOS showed that one in Now Playing, so the lock screen and CarPlay read a looping music pad as paused at 0:00 while it played, and CarPlay kept reconnecting under it; a pad with Loop off showed as a proper media stream (7 Nov 2026). The cost is a small seam where the track wraps.
- **`fadeOut(id, ms)`, `fadeOutAll(ms)`:** fade over N and end it; unlike Pause all nothing is kept. **`isPausedAll`** is derived from what Pause all actually suspended.
- **`setHush(on)`:** its own gain stage after master (0.3, 200ms attack, 800ms release), independent of master and mute.
- **`setSolo(ids)`** (`lib/audio/soloDim.ts`): everything outside the set sits at 25% (`SOLO_DIM`); it clears itself once the soloed sounds are done, and a solo set before its sound starts is not cleared early.

### Surfaces

- **`SoundDeck`** (`components/soundboard/deck/SoundDeck.vue`) is mounted once in `DefaultLayout` for DMs. It owns what must exist once (the keyboard, the MIDI driver, settling Simple/Full, the Edit hand-off) and draws `DeckDock` on a desktop or `DeckPhoneSheet` on a phone. It draws nothing on `/soundboard` (the builder shows the deck itself; the host stays mounted so keys and MIDI keep working), in editor focus, or on a phone takeover route.
- **`DeckDock`** docks at the bottom **in flow**, so it pushes the page up rather than covering it. Sizes, remembered per device (`grimoire_deck_size`, `DeckSize`): **tucked** (a slim handle showing what plays), **row** (one pad per lane, 76px, one row at a time; its controls sit two short lines high either side of the pads so a laptop keeps their names: ‹ page › over ˄ row ˅ on the left, the transport over the Master fader and the settings pip on the right, and the size switch only when the bar is 87rem or wider, since it is in Deck settings too; every pad puts its key number in the bottom corner and gives the name the top line; its kind icon opens the foot line (`KindGlyph`), with a scene's layers or a playlist's tracks counted in a bubble on the icon's top-right quarter rather than written out; a playlist and a scene each have a **hue of their own** (`--pad-playlist` coral beside the music gold, `--pad-scene` teal beside the ambience mint; `PadHue` / `padHueOf` in `soundCategories.ts`), so a running order never reads as a single track; and a pad whose sounds have **art** shows it behind the pad in the pad's hue, a luminosity blend over the hue (25% at rest, 40% lit): the next take's art, a playlist's playing track's, else the first sound with any (`padArt`). All of this the maintainer asked for on 7 Nov 2026 (`lib/audio/soundKinds.ts`), and a small pad under 4rem inside drops its footer icons; scrolling over it or its up/down arrows step through the page's rows through `DeckGrid`'s `rowStart`, one row per gesture via `lib/audio/deck/wheelStep.ts`, so a trackpad swipe moves a row rather than racing to the last; the row shown is the bar's own, back to the top on another page; a page with one row leaves the scroll to the page), **deck** (two and a half rows; the cut-off half says there is more), **full** (the window). `D` cycles them (off on `/soundboard`). With nothing built the dock is one line, "Build your deck", that links to the builder.
- **Peek** (`useDeckPeek`): reaching for the deck opens it to Deck size **over** the page (it never pushes) and it settles back by itself (300ms dwell on the edge to open, 2.5s after the pointer leaves), or at once on a click anywhere else. On a desktop it rises from the dock and covers the Row bar or the handle, never stacks above them. Triggers: the pointer resting on the edge (from tucked or row: the DM asking for more rows), a swipe up on a phone, and two **signals**, any key `1` to `8` and **audio that starts on its own** (`useAudioThemeTriggers.revealPlayer()` calls `requestDeckPeek()` for every playable theme request and every cue), so there is always a way to stop it. A signal peeks from **tucked only**: the Row bar already shows the row the keys fire, with Pause all and Fade all beside it, and a peek over it drew the same pads twice and, re-armed by every key press, never seemed to go away (8 Nov 2026). A counter in `useSoundboardUiStore` (`deckPeekSignal`), not a flag, so two requests are two peeks. A setting turns peek off (`grimoire_deck_peek`).
- **`--dock-bottom`** (`useDockBottom`): the dock publishes its height on `<html>` so fixed layers that hug the bottom edge (the AI badge, the phone's scratchpad and chat panels) sit above it. `DefaultLayout` adds it to the content padding.
- **Phone:** `DeckPhoneSheet`, a bottom sheet above the bottom nav. Folded it is four pads and Hush; open it shows four lanes at a time, swipe for 5 to 8. Tools and the big buttons sit in thumb reach.
- **A finger presses on lift or on a still hold, never on landing** (`DeckPad`, 3 Nov 2026). The same finger scrolls the deck, and a pad that fired on `pointerdown` played every swipe that started on it. A touch is a tap when it lifts where it landed, a hold after `TOUCH_HOLD_MS` (120) still (so Gate and Repeat work by touch), and nothing once it travels `TOUCH_SLOP_PX` (10) or the browser takes it for a scroll (`pointercancel`). Mouse, pen, keys and controllers still press at once: an instrument's latency matters there, and they do not scroll.
- **Header and extras:** `DeckHeader` (page tabs), `DeckSizeControl`, `DeckSettingsPopover` (Simple/Full, size, peek, Board settings), `DeckTransport` (Pause all, Hush, Fade all, Master), `DeckMixerPopover` (the shared `SoundboardMixer`), `DeckNowChips` (what is audible and why, with `CausedByChip`).
- **`/soundboard` is the builder** (`SoundboardView`): one side panel and the deck being built (`DeckGrid` in build mode, always at least four rows with one empty row beneath). The side panel is either the library (`DeckLibraryPanel`: your sounds, scenes, playlists, the shared library; search and category in `useSoundboardUiStore`) or the picked pad's settings (`PadSettingsPanel`), with a Library / Pad switch on top: picking a pad turns it to Pad, an empty slot or Done back to Library, and the DM can flip to the library with the pad still picked to drag in a take. It never changes width or leaves (3 Nov 2026, the maintainer's call): the library used to step aside for a separate settings column below 2xl, which jumped the page on every pick, and three columns at once left a laptop's pads too narrow to read. Below `lg` both are sheets, and tapping an empty slot opens the library sheet on it, since a phone cannot drag. **Build / Play** switch: until chosen it follows the session (running means Play); Play shows `BuilderPlayDeck` with the tool strip as one column beside the deck (the docked deck uses the column at Full size and two columns at Deck size, which is too short for seven). Below `lg` the library, pad settings and lane editor are sheets; a phone shows four lanes at a time.
  - **Drop rules** (`onDropOnSlot`): a sound on an empty slot makes a pad; **dropped on a pad that already has one it becomes another take**; a sound on a scene or playlist pad is refused ("drop on an empty slot"); a playlist or scene only goes on an empty slot; a pad dropped on another pad swaps (`move_soundboard_pad`); a pad dropped on a page tab goes to that page's first free slot in its own lane. Or select an empty slot and click a library row.
  - **Pad settings autosave** (`useAutosave`; Done closes; no navigation). Name, loop, volume, launch mode, repeat beat, fades in seconds (empty means the kind's default), vary, velocity, per-take trim (`SoundTrimControl`), the takes list (reorder, remove), "Take off the deck". Only fields the DM changed are written, so an untouched field stays null (`padSettingsModel`).
  - **Lane editor** (`LaneEditor`): click a lane's name to rename it, set `one` / `together`, and choose its feed ("Plays here by itself").
  - The Edit tool (and `/soundboard?pad=<id>`) lands on a pad's settings.
  - **Every library row has Edit.** A sound's opens `SoundEditDialog`, a scene's or playlist's `PlaylistEditorDialog`. A pad's own Name only overrides what that pad shows; renaming the sound is the library's. Deleting a sound takes it off every pad, scene and playlist (the takes and tracks cascade, and `private.drop_empty_sound_pad` removes a pad left with none). The deck redesign shipped without a sound editor, and knip then removed `useDeleteSound` as unused; both came back on 7 Nov 2026.
- **Simple and Full:** one switch behind the settings pip. **Settled once** from whether the campaign already had sounds (`settleDeckControls`): new DMs start on Simple (tap plays, Loop and Stop, Pause all / Hush / Fade all), anyone who already has sounds starts on Full; the choice is then remembered (`grimoire_deck_controls`). The switch only shows or hides controls and **never changes how a pad sounds**; a pad's launch-mode glyph shows whenever its mode is not its kind's default (`modeIsDefault`).
- **Look:** "Instrument on the page": no side stripe, a faint tint of the category colour at rest (10% fill, 30% edge), the full colour with dark ink and a soft glow when playing, on the theme's own surface. The `--pad-*` tokens (`theme.css`, with Vellum's variables in `themes.vellum.ts`) are fixed instrument colours, the same in every theme; the `PAD_LIT` / `PAD_REST` class maps in `lib/audio/soundCategories.ts` name them in full for Tailwind's scanner. The older `--sound-*` tokens stay for text (`CATEGORY_SPINE` and friends). `DeckCatalogue` renders every pad state on `/dev/components`.

## Files

### Types

`src/types/sound.types.ts`, `SoundCategory` (`ambient | music | effects`), `SoundSourceType` (`upload | url | spotify | freesound | library`), `Sound`, `SoundLibraryEntry`, `SoundboardPage` (with `lanes: DeckLane[]`), `DeckLane` / `DeckLaneRule`, `LaunchMode`, `SoundboardPad` / `SoundboardPadTake` / `SoundboardPadWithTakes`, `AudioEffectPreset` (`none | through_door | through_wall | distant | underwater | cave | sewer`), `PlaylistType` (`music | ambient`), `SoundboardPlaylist`, `PlaylistTrack`/`PlaylistTrackWithSound`. Note: AI-generated sounds are **not** a distinct `source_type`, Lyria output is uploaded through the normal `upload` path (see Sound Sources below).

### Store & audio engine

`src/stores/soundboard.ts` (Pinia `useSoundboardStore`, ~1,350 lines) owns all non-Spotify playback. See **Audio Engine** below for the mechanics. `useDeck` is its main client now; the store keeps no deck state of its own.

Mechanics that live outside it because they are not reactive state and are untestable from inside a store:

- `src/lib/audio/soundTransport.ts`: element registry, transition generations, category→bus mapping.
- `src/lib/audio/sceneGenerators.ts`: the timers and randomness behind generator layers, as a pool with an injectable clock and RNG.
- `src/lib/audio/gaplessLoop.ts`, `soloDim.ts`, `playOptions.ts`: the deck's playback mechanics (see **Engine primitives the deck added**).
- `src/lib/audio/deck/`: the deck's rules and protocol: `deckModel.ts` (defaults, grid, takes, velocity), `deckSurface.ts` (the protocol types), `holdTap.ts`, `wheelStep.ts` (the row bar's scroll, one row per gesture), `rowInView.ts` (which scrolled row is in view), and `midi/` (`midiAccess`, `launchpadProfiles`, `launchpadProtocol`, `midiLearn`).

### Composables

| File | Role |
| --- | --- |
| `src/composables/soundboard/useDeck.ts` | The deck controller: the one implementation of the deck protocol (shared singleton) |
| `useDeckPads.ts` | TanStack Query read of pads with takes, plus the pad and take mutations and `move_soundboard_pad` |
| `useDeckResolved.ts`, `useDeckSnapshot.ts`, `useDeckReadout.ts` | Pad to kind/category/sounds, the `DeckSnapshot`, and the now-playing chips |
| `useDeckHotkeys.ts` | The deck's keyboard (global layer; see **The deck protocol**) |
| `useDeckMidi.ts`, `useDeckMidiShared.ts` | The Launchpad and MIDI Learn driver, and the app-wide instance with its permission-only auto-reconnect |
| `useDeckPeek.ts`, `useDockBottom.ts` | Peek state, and the `--dock-bottom` publisher |
| `useSounds.ts` | TanStack Query CRUD for `sounds`; `useSoundUpload` (converts uploads to Opus via `toOpus()`, then to the `sounds` bucket) |
| `useSoundboardPages.ts` | CRUD + `useReorderSoundboardPages` for `soundboard_pages` (names, order and lanes) |
| `useSoundboardPlaylists.ts` | CRUD for `soundboard_playlists` + `soundboard_playlist_tracks`; `useReplacePlaylistTracks` deletes and re-inserts the whole track list on every save rather than diffing |
| `useProviderSearch.ts` | TanStack Query wrapper around whichever sound provider is selected (`src/lib/audio/providers`): provider id + filters in the query key, min query length per provider, 10 min `staleTime` |
| `useMediaSession.ts` | Wires the active **music** playlist to `navigator.mediaSession`; called once from `App.vue` so it is live app-wide |
| `useCast.ts` | Google Cast Sender SDK integration (see **Cast** below); singleton, lazily initialised only when a `CastButton` first mounts |
| `useSoundPlayback.ts` | The one answer to "is this sound audible / blocked / what does the next press do" (`useBlockedCheck` feeds the deck's `blockedReason`), shared with the command palette so a file one surface cannot play is never offered by another |
| `useNowPlaying.ts`, `useAudioThemeTriggers.ts`, `useStarterScenes.ts`, `useSoundboardBroadcast.ts`, `useAudioSharing.ts` | What is audible and why; themed audio; the starter-scenes executor; shared playback (DM side) |

### Spotify

`src/stores/spotify.ts` (Pinia `useSpotifyStore`) wraps the Spotify Web Playback SDK, registering "Grimoire Soundboard" as a Connect device. `src/lib/audio/spotifyAuth.ts` implements PKCE OAuth (no client secret), tokens live in `localStorage`, not the DB. The Spotify Client ID is BYOK, stored in plaintext on `campaigns.spotify_client_id` (not the encrypted key vault) and configured by the DM in Campaign Settings → Spotify. `isEnabled` requires both a configured client ID **and** `auth.isDM`, Spotify never appears for players. Requires a Spotify **Premium** account (the Web Playback SDK rejects free accounts).

All Spotify HTTP goes through `spotifyFetch`, which converts a network-level throw (offline, waking laptop, blocked request) into a typed `SpotifyUnreachableError`; the store routes those onto `playError` (the shared `SpotifyErrorBanner`) instead of leaking unhandled rejections to Sentry (DUNGEON-GRIMOIRE-4). The distinction is load-bearing on the token path: `getValidToken` **throws** `SpotifyUnreachableError` when a refresh can't reach Spotify rather than returning `null` ("not logged in"), because the SDK's `getOAuthToken` callback and the `authentication_error` listener call `disconnect()` on null, offline must not wipe a valid session. Non-network throws still propagate: they are real bugs and belong in Sentry.

Three things keep playback alive outside desktop Chrome (#1098, a report from Firefox on iOS). `play()` and `resume()` call the SDK's `activateElement()` before their first await, inside the tap: autoplay-restricted browsers (Safari, and every iOS browser, all WebKit) otherwise start the track and pause it a second later. A play answered with 404 "Device not found" (the audio route changed under the SDK, say a Bluetooth headset connecting, or a suspended tab) transfers playback to this device (`PUT /v1/me/player`) and retries once; if that fails too the banner says to reload. And the store listens to the SDK's `initialization_error`, `account_error` and `playback_error`, which used to fail silently. Note that `setVolume` does nothing on iOS, where the volume is under the hardware buttons only.

**Where a Spotify sound sits depends on what it is (26 Oct 2026).** A single track or episode is a sound: it is a sound pad on the deck like any other, and has no previous, next or shuffle. Looping it (the Loop tool, or the pad's loop setting) puts Spotify on repeat-track, because Spotify has no per-sound loop; `useSoundPlayback` owns that branch, and the pad shows the loop glyph only while it is the track loaded, since repeat is player-wide; the deck routes a Spotify sound through the Spotify store, with no gain, rate or gapless loop. A playlist or album runs its own running order and is a playlist in the library ("From Spotify"), with the full transport. `isSpotifyCollection` (`spotifyAuth.ts`) is the one test for which is which. July's redesign (`a2ece76ac`) had taken every Spotify sound off the board; DMs wanted "this one song" on a pad, the way they would an upload. Spotify tracks do not join Grimoire playlists, on purpose (26 Oct 2026): Spotify's Developer Policy (III.7) forbids letting any system "segue, mix, re-mix, or overlap" Spotify content with other audio, and a playlist that hands from an upload to a Spotify track is a segue. It is buildable (hand the track to the SDK, advance on its end) and was decided against for that reason, so do not add it. Shared audio and Cast mirror Grimoire's music playlist and never Spotify, which the policy's III.4 (one source to several listeners) rules out anyway. Before anything said so, a DM sharing audio while playing Spotify left players pressing Join into silence. So while `useAudioSharing()` is true (sharing on, or a Cast session), every Spotify control is **dimmed but still playable** and carries a `SpotifyLocalOnlyInfo` (i), a tap-to-open note: the card's play button, the board pad, the floating player's Spotify row and the Spotify add tab. Dimmed rather than disabled because a mixed table (players in the room, one remote) still hears Spotify through the DM's speakers. With nothing shared both disappear, because "this device only" is then true of everything. The sharing setting's hint also says Spotify is not included. `urlToUri` accepts the locale segment localised share links carry (`open.spotify.com/intl-nl/track/…`).

### Freesound

`src/lib/audio/freesound.ts`, pure license-normalisation (`normalizeLicense`) and attribution-building (`buildAttribution`) helpers. `supabase/functions/freesound-search/index.ts` duplicates these two functions (Deno can't import client-side TS), **keep both copies in sync**, per the comment in both files. The edge function requires an authenticated user, filters results to `license:("Creative Commons 0" OR "Attribution")` (CC-BY-NC is explicitly excluded, Grimoire is a commercial product, see `feedback_licensing_spirit.md`), and rewrites `freesound.org/data/previews/…` URLs to the `cdn.freesound.org` host to save a redirect. Only preview clips are returned, not full-resolution source files, a fidelity/length ceiling inherited from the free API tier.

### AI generation (Lyria)

One model: Google's `lyria-3.5`, called through Google's **Interactions API** (`POST /v1beta/interactions` with `{ model, input, store: false }`; audio comes back in the `model_output` step's `audio` block). The 30-second `lyria-3-clip-preview` was retired on 24 Sep 2026 (migration `20260924201957`): Lyria 3.5 is priced flat per song whatever its length, and length is steered by the prompt rather than by picking a model. So the form asks for a **length** (1 / 2 / 3 min, no short loop: at a flat per-song price a 30-second track stopped earning its place) and **vocals** (instrumental / choir / vocals, choir is wordless, the voice fantasy scoring wants most and neither of the other two can ask for; lyrics only for vocals), and there is one credit type, `music_track`. `store: false` is deliberate, Google otherwise keeps every interaction 55 days for server-side conversation state we never use.

**The model is an admin setting.** `generate-music` reads `provider_config.audio_model` (gemini row), editable under Admin → AI Providers → Audio, and snapshots it onto the durable job. The client never sends a model id.

**Structuring (expanding the DM's request into a complete Lyria prompt via a text model, musical direction, a timestamped timeline ending at the requested length, verbatim lyrics under `Lyrics:`, written to Google's Lyria prompt guide) runs server-side, inside `generate-music`'s worker, since 25 Sep 2026.** `supabase/functions/_shared/musicPrompt.ts` holds `buildStructureMessage`, `composeFallbackPrompt` and the fallback system prompt `MUSIC_STRUCTURE_SYSTEM`; `src/lib/audio/aiMusic.ts` re-exports `composeFallbackPrompt` directly from that module (it's pure TS with no Deno-specific imports, so it's imported rather than duplicated, same as several other `_shared` modules already imported from browser code, e.g. `src/lib/storage/upload.ts`) alongside `generateMusicLocally`, `MUSIC_LENGTHS` and `LYRICS_MAX_CHARS` (2200). The structuring system prompt itself lives in `ai_system_prompts` as `music_structure`, falling back to the code copy when that row can't be read; `musicPrompt.test.ts` replays the seed plus every later migration's `replace()` on the row and fails if the code copy differs. **A description that is already a brief is formatted, not composed again (`20261103093433`):** when the DM names instruments, a key or tempo, or writes their own timestamped timeline, structuring keeps all of it, adds no instrument, and honours what they say about the start and the end (no Intro when the track should already be playing, no Outro when it should not end). Before this, the underscore rule framed every background track with an Intro and an Outro, so a written brief came back with an introduction, a final chord and swapped instruments. The prompt that comes out of structuring is sent to Lyria as-is, lyrics are never re-prepended (they were, until the 3.5 upgrade, so every lyric went out twice). **A structuring failure fails the whole job** (`"Could not prepare the music prompt."`) rather than silently falling back to `composeFallbackPrompt`, see "Before 25 Sep 2026" below for why a silent fallback is exactly what this replaced. `supabase/functions/generate-music/index.ts` is the server-mode path: validates campaign membership, resolves BYOK-vs-platform Gemini key for Lyria and a separate text-provider key for structuring (both Pro-gated for BYOK per `project_byok_pro_only.md`; a missing text key fails the request immediately rather than the job later), reserves AI credits, creates an `ai_generation_jobs` row, and returns its id immediately. Its background worker calls the text model, then Lyria, uploads the audio to the `sounds` bucket, and marks the job ready **before** recording billing; the prompt Lyria is sent is recorded on the job's `artifact_metadata.prompt` *before* the Lyria call (`recordGenerationJobMetadata`), so it survives a refusal as well as a success. `SoundForm` waits on that row and creates the sound from the durable URL/path and original campaign/page metadata. The one credit charge (`music_track`) covers both AI steps, the structuring call's own provider cost rides along on it rather than being metered separately.

**A refused prompt comes back to the DM to reword (28 Sep 2026).** Lyria screens the prompt text and answers a hit with only "The prompt contains sensitive words", never which ones, and because structuring is a fresh text-model call each time, the same request can pass on one run and be refused on the next (a song about an NPC with nothing but her name to go on was refused once and passed on retry). So when a job fails after the prompt was recorded, `waitForAiGenerationJob` rejects with `AiGenerationJobFailedError` carrying the row, and `SoundForm` puts `artifact_metadata.prompt` in an editable "Prompt sent to Lyria" box under the error. Generating again sends it as `prompt` on the `generate-music` body (stored on the job as `request_json.prompt`, max `MUSIC_PROMPT_MAX_CHARS`), which skips structuring and goes to Lyria exactly as written, so the description, length and vocals no longer change it until the DM discards it. The local-BYOK path does the same with the prompt it composed. The sound's title also reaches the structuring step (`Title:` in `buildStructureMessage`), since it is often the best one-line statement of what the track is for.

**Generation runs in the background, like every other generator (28 Sep 2026).** `src/ai/useMusicGeneration.ts` holds the server path at module level: the idempotency key, the invoke, the wait on the job and the settle (refresh `["sounds", campaign]`, acknowledge). It is registered with `registerAiGenerator` as "Music", so the DM can press "Continue in background" (or just close the dialog) and the `AiGenerationBadge` reports "Music ready!" or "Music generation failed · Reopen". The Generate tab's draft (description, length, vocals, lyrics, the refused prompt, and the last run's category) lives in the same module, so Reopen brings the dialog back exactly as it was left. That is why `AddSoundDialog` is mounted app-wide in `AiGeneratorPanels` and opened through `ui.addSoundDialogOpen` / `ui.addSoundPageId` rather than by `SoundboardView`: Reopen has to work from any page. Its content only mounts while open, so `SoundForm`'s window drop listeners never run app-wide. Music counts toward `isAnyAiGenerating`, so while a track is running the other generators wait, as they do for each other. The local-vault BYOK path stays in `SoundForm`, in the foreground.

**The local-vault BYOK path is legacy and unstructured.** When the user has a **local-vault** BYOK key (`grimoire_key_local_mode === "local"` in `localStorage`), `generateMusicLocally` still runs entirely client-side and cannot survive a reload mid-generation, but it now sends a `composeFallbackPrompt`-composed prompt rather than a structured one, since adding a second BYOK text-provider call to a path already being phased out was not worth the complexity.

**Before 25 Sep 2026,** structuring ran in the browser via `getTextProvider()` (a BYOK-only text provider that throws when a campaign has no local key). Every DM on platform credits, the overwhelming majority, silently got the unstructured fallback prompt instead of a structured one from the day the feature shipped (1 Jun 2026) until this move, because `SoundForm` swallowed the thrown error. BYOK-OpenAI users failed too, for an unrelated reason (`createOpenAiTextProvider` forced JSON output on a plain-text prompt). Structuring now runs through the same shared `_shared/textGen.ts` dispatcher every other text generator uses, so it gets platform-key support, BYOK for every configured provider (not just whichever the old client provider defaulted to), and a `fast_text_model` preference for latency, same as the quest designer.

**@mentions read images and lore into the prompt, same resolver as the Chronicler.** The Generate tab's description field is a `MentionTextarea`; typing `@Vesper` resolves against the campaign's party members, NPCs, monsters, locations and factions via `parseSceneEntities` (`src/ai/sceneEntities.ts`, shared with the Chronicler's scene-illustration and chronicle-text prompts). A mention's image (portrait, location `image_url`, faction `emblem_url`) is sent to Lyria's Interactions API as an attached image; its flattened, capped description is sent to the structuring step as context, never copied verbatim into the prompt (see `MUSIC_STRUCTURE_SYSTEM`'s "Mentioned characters and places"). With images attached, the pre-prompt writes a brief rather than an orchestration, Lyria reads images well, and letting the text model choose instruments, key and tempo first took that away, so structuring is told to leave those choices to Lyria and instead describe what the scene means. At most `MUSIC_MAX_IMAGES` (10) images reach Lyria; mentioning more throws rather than silently trimming, and a failed image fetch fails the job rather than generating without it (`generateMusicLocally`'s `fetchImageForLyria`/`dedupeImageUrls`). The description sent to the structuring model and to Lyria has its `@Underscored_Name` tokens turned back into spaced names first (`stripMentionTokens`).


### Components (`src/components/soundboard/`)

| File | Role |
| --- | --- |
| `deck/SoundDeck.vue` | The deck host, mounted once in `DefaultLayout` (DMs only) |
| `deck/DeckDock.vue`, `DeckDockBody.vue` | The docked deck on a desktop: sizes, peek, edge doorbell |
| `deck/DeckPhoneSheet.vue` | The phone's bottom sheet |
| `deck/DeckGrid.vue`, `DeckPad.vue`, `deckPadLook.ts` | The grid and the pad; `deckPadLook` holds the pad's words (tool chip, accessible name) so they are testable without mounting |
| `deck/DeckToolStrip.vue`, `DeckTransport.vue`, `DeckHeader.vue`, `DeckSizeControl.vue`, `DeckSettingsPopover.vue`, `DeckMixerPopover.vue`, `DeckNowChips.vue` | The dock's tools, whole-deck buttons, page tabs, size switch, settings, mixer and now-playing chips |
| `deck/tapOrHold.ts`, `deckSizeIcons.ts`, `deckFixtures.ts`, `DeckCatalogue.vue` | The on-screen hold helper, icons, test fixtures, and the `/dev/components` catalogue |
| `builder/DeckLibraryPanel.vue`, `DeckLibraryRow.vue`, `libraryRows.ts` | The builder's library: sounds, scenes, playlists with search and category |
| `SoundEditDialog.vue` | A library sound's Edit: name, artist, kind (music track, ambience track, effect), artwork, loudness, delete. Autosaves |
| `lib/audio/soundKinds.ts` | The five kinds (music track, playlist, ambience track, scene, effect): the icon and word every library row, pad and editor uses |
| `builder/PadSettingsPanel.vue`, `PadTakesList.vue`, `padSettingsModel.ts` | A pad's settings (autosave) and its takes |
| `builder/LaneEditor.vue` | Rename a lane, set `one` / `together`, and pick what the campaign plays there by itself |
| `builder/BuilderPlayDeck.vue`, `BuilderMixerDrawer.vue` | The builder's Play mode and the mixer drawer |
| `DeckControllersSection.vue` | Launchpad status, lights, MIDI Learn bindings and the velocity curve, inside Board settings |
| `BoardSettingsDialog.vue` | Triggers on/off, sharing to remote players, direct output, controllers |
| `SoundboardPageTabs.vue` | Draggable page tabs: rename, delete, pad counts, quota-gated "Add Page"; a pad can be dropped on a tab |
| `SoundForm.vue` | The add-sound form with its source tabs: URL, Upload, Spotify, Generate (AI), Library (our catalogue first, Freesound second). Over the 600-line soft max, flagged in #572 |
| `AddSoundDialog.vue`, `SoundProviderBrowser.vue`, `SoundProviderRow.vue` | The dialog around `SoundForm` and the provider search results |
| `SoundTrimControl.vue` | Persisted per-sound loudness correction (`gain_trim`, 0.25x to 4x), inside the pad's settings. Live preview on `@input`, persists once on `@change` |
| `SoundboardMixer.vue`, `SceneMixer.vue`, `VolumeSlider.vue` | The faders (master, buses, scene layers) shared by the dock's popover and the builder's drawer so the two cannot drift; `VolumeSlider` is the one shared range input (`accent` is `primary` or `green` for Spotify) |
| `SoundEffectPicker.vue` | Wand-icon popover for the `AudioEffectPreset` values: beside the master fader (the whole mix), beside each bus fader in the mixer (`store.setBusEffect`: every sound on Music, Ambience or Effects, filter only, so a Cave muffles and the master's reverb adds the echo), and in a sound pad's settings in Full (`store.setEffect` on every take but Spotify). All runtime only. Its `target` names what it colours in its title, so the mixer's four can be told apart |
| `SoundCategoryFilter.vue` | Pill filter (All / Music / Ambience / Effects) in the library |
| `PlaylistEditorDialog.vue`, `PlaylistTrackRow.vue` | Create/edit a scene or playlist: name, type (locked after creation), shuffle/repeat (music only), draggable track list |
| `SoundPalette.vue`, `SoundPaletteRow.vue` | The `mod+shift+K` command palette |
| `StarterScenesCard.vue` | The starter-scenes offer, on the builder's empty state and the library's Scenes list (`compact`) |
| `CastButton.vue`, `SpotifyErrorBanner.vue`, `SpotifyLocalOnlyInfo.vue`, `CausedByChip.vue`, `EqBars.vue`, `KeyCap.vue`, `PlayerAudioStream.vue` | Cast trigger, Spotify notices, the "why is this playing" chip, the EQ glyph, key caps, the player's shared-audio receiver |

Gone with the deck: `SoundboardWidget` and its toggle, `SoundCard*`, `SoundPad`, `NowRail`, `PlaylistsPanel`, and the composables `usePadLoopGesture`, `useSoundboardHotkeys`, `useMoveSound`, `useBulkAssignToPage`, `useReorderSounds`. Check `rg` before assuming one still exists.

### Views

- `src/views/soundboard/SoundboardView.vue`: `/soundboard`, the builder (see **Surfaces** above). On first load with no pages it creates a "Main" page. The migration laid existing boards out as pads per page, by category.
- `src/views/soundboard/SoundLibraryCreditsView.vue`: `/soundboard/credits`.
- `src/views/soundboard/SpotifyCallbackView.vue`: `/spotify/callback` OAuth redirect target; exchanges the PKCE code then routes back to `/soundboard`.

## Audio Engine

Rebuilt in #572 phase 1. Playback for everything except Spotify runs through a
**Web Audio bus graph** in `src/lib/audio/audioEngine.ts`, with `src/stores/soundboard.ts`
orchestrating on top and `src/lib/audio/soundTransport.ts` holding the non-reactive
plumbing:

```text
MediaElementAudioSource → BiquadFilter → soundGain → bus(music|ambient|effects) → master → destination
```

- **`src/lib/audio/audioEngine.ts`**, owns the graph. `getAudioEngine()` returns a stable object; `engine.available` is false when no `AudioContext` exists, and every method is then a safe no-op so playback still works (just without fades or buses). Consumes the shared singleton in `src/lib/audio/audioContext.ts`, the store no longer owns its own context.
- **`src/lib/audio/soundTransport.ts`**: the `HTMLAudioElement` registry, transition generations, and `category → bus` mapping. Deliberately outside Pinia: Vue's Proxy wrapper breaks `HTMLAudioElement` (volume/loop mutations silently drop, `play()` calls fail unpredictably).
- **Volume runs through `GainNode.gain`, not `audio.volume`.** That is the change that made everything else possible, `audio.volume` is pre-context and cannot be ramped as an `AudioParam`, so every transition used to be a hard cut. Elements are held wide open at `volume = 1` and the graph owns level. The fallback path still uses `audio.volume` when Web Audio is unavailable.
- **Per-sound gain composes three factors**: user volume × `gain_trim` (persisted loudness normalisation) × the active effect's gain reduction. All three writers recompute the product against the same node rather than clobbering each other.
- **Fades and crossfade.** Fade-in on play, fade-out before pause/stop (the fade-out promise resolves before the element is paused). Music-playlist advance is a real crossfade, triggered from `ontimeupdate` while the outgoing track is still audible, *not* from `onended`, which would only give a fade-in after silence. The next element is pre-created so its fetch and decode precede the transition.
- **No ducking.** An effects sound never changes the level of the music or ambient buses. The engine's duck was removed on 3 Nov 2026 because the maintainer did not want music dipping under every effect; do not re-add it. The deck's Solo tool (`DeckLight` `ducked`) is a separate per-sound dim.
- **Master and per-bus faders**: `setMasterVolume` / `setBusVolume`, surfaced in the mixer (the dock's popover and the builder's drawer).
- **Effect presets** are six lowpass frequency/Q/gain triples (`through_door`, `through_wall`, `distant`, `underwater`, `cave`, `sewer`), ramped over 0.5s, ported into the engine from the old store.
- A **transient CDN-error retry**: on `audio.onerror` the element is recreated once (`hasRetried`/`markRetried`); a second failure surfaces `loadError` with a manual Retry badge. The engine keys its source nodes by element identity (a `WeakMap`), so it rebuilds the chain when the retry swaps the element.

- **Deck primitives** (per-press options, gapless loop, fade over N, Hush, Solo) are listed under **Engine primitives the deck added**.

### Two invariants not to break

**Ramp shape.** `exponentialRampToValueAtTime` can neither approach nor leave zero. `scheduleGain` picks exponential only when both endpoints clear a silence floor and falls back to linear otherwise, this is what lets a fade-out reach true silence instead of stalling at an epsilon. Changing it reintroduces a classic Web Audio bug.

**Transition generations.** `bumpGeneration`/`isCurrentGeneration` guard the fade-out completion callback. Without them, a `stop()` immediately followed by a `play()` lets the stale callback pause the element that just started, the race that makes naive crossfading eat tracks.

### Trap when adding a call site

`play(soundId, fileUrl, category?, gainTrim?, opts?)` takes category, trim and `PlayOptions` as **optional** trailing params. Omitting `category` typechecks cleanly and routes the sound to the ambient bus, on the wrong fader, and a green build will not catch it. Every new call site must pass the sound's category.

## Themed audio (encounters & locations)

Audio binds to campaign events by **theme label**, never by a foreign key to one playlist. An encounter asks for `battle`; any music playlist tagged `battle` is a candidate, picked at random. Tagging three playlists once gives every future combat variety, a track per encounter is exactly the prep burden this avoids.

| Piece                                      | Role                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `src/lib/audio/audioThemes.ts`                   | Pure resolution: `resolveAudioTheme`, `collectThemes`, `tagsIncludeTheme`               |
| `src/lib/audio/audioTriggers.ts`                 | The bus: `requestAudioTheme` / `requestAudioCue` / `releaseAudioTheme` / `onAudioTrigger` |
| `src/composables/soundboard/useAudioThemeTriggers.ts` | The only consumer. Mounted once in `DefaultLayout`. Also exports `useAudioTriggerPrefs` and `useActiveAudioTriggers` |
| `src/lib/audio/audioTriggerPrefs.ts`             | The DM's on/off switch, localStorage, default on                                        |
| `src/components/common/controls/ThemeInput.vue`     | Free-text label with datalist suggestions, shared by the encounter and location editors |

**Slots.** An encounter drives `music`; a location drives `ambient`. They compose deliberately, dungeon ambience keeps running underneath battle music, and neither can ever contend for the other's channel. `resolveAudioTheme` will not look in the other slot even when its own has no answer.

The two slots also behave differently on release, mirroring the store. **Music is exclusive**: a trigger takes the slot and hands it back to whatever preceded it. **Ambient is additive**: a trigger adds its own scene and removes only that one, because a location has no business stopping a scene a different location started, and combat ending must leave the room the party is standing in alone.

### Who wins the slot (#870)

Three producers can want the music slot: a beat's own audio cue (`QuestRunContainedTool`, fired from the Run cockpit), a live encounter's theme, and a location's ambience. They keep separate `sourceId`s precisely so two features cannot pull each other's audio, so the ranking in frame 14 of `Sites & Cartographer.html` is an **order**, not a fight: **1** a beat's cue, DM-fired, deliberate, and always the loudest intent in the room, so it takes the slot from the others; **2** a live encounter's theme, *held, not stopped*, so it returns when the cue ends; **3** the room's own ambience, the floor.

A cue is already resolved (an exact playlist or sound id, a beat's attachment has no label left to match), so it skips `resolveAudioTheme` and goes straight through `requestAudioCue` to the same ownership path a matched theme takes: a music-slot cue (a `playlist` attachment) takes the exclusive slot exactly as an encounter's theme would; an ambient-slot cue (`audio_scene`) joins the ambient stack; a bare `sound` attachment fires through the same `useSoundTrigger` path any other playback button uses and registers as a short-lived ambient-stack owner, releasing itself the moment the store's `isPlaying` for that sound goes false (the clip ending and the DM pausing it both count, a Spotify-sourced sound has no such signal here, so those release only on an explicit stop or on leaving the beat).

**Once you touch the music, it's yours.** When the top trigger's music has been heard and then changes or goes quiet without the bus doing it (the DM pressed another music pad, stopped it, or pressed X), the bus forgets the whole music stack and the floor, so the fight ending later changes nothing. Before the deck this rarely mattered; with music a press away it was the common case, and a fight's end cut the music the DM had chosen. Pause all is not a takeover, and neither is a playlist moving to its next track, nor music that runs out by itself (the store records a track that played to its end and a playlist whose last track did, `finishedByItself` / `playlistFinishedByItself`), so a fight's loose track finishing still hands the floor back when the fight ends.

The music slot is a genuine **stack**, not a single owner with one level of history: when a beat's cue takes the slot while an encounter's theme already holds it, the theme is pushed underneath rather than replaced, so releasing the cue uncovers the theme again instead of skipping past it to whatever the DM had running before combat. `useAudioThemeTriggers`'s `musicStack` (with a `musicFloor` sentinel for "what to restore once the stack is empty") is what makes "held, not stopped" true for more than one layer of nesting.

### When it plays, and what you see (25 Sep 2026)

- **Opening a location plays nothing.** It used to autoplay on open, which surprised DMs browsing the Atlas (saving an image started the Sugarwell anthem) and gave them nothing on screen to stop it with. During a session the party's position (`usePartyAmbience`) still plays a place's ambience on its own. It reacts to changes this page sees (a session starting or continuing, the party moving, the session ending), never to the page loading: a reload mid-session adopts the scene already implied without requesting it, so the music does not restart and the deck does not peek open over the runner.
- **A location offers Play ambience / Stop ambience, and what it starts outlives the page.** The DM puts a room on, then goes to notes or an NPC while the room is still where everything happens, so leaving the page does not stop it, and neither does starting a session. `useAmbiencePlayback` owns this. It holds no state of its own: "is this place playing" is read from the bus's ambient owners (`ambience:<themeOwnerId>`), so the page and the deck cannot disagree. Pressing Play on a second place replaces the first rather than layering them. It fires a **cue**, not a theme request, because the DM pressed it on purpose: the automatic-triggers switch governs guessed audio only. The button appears only when something on the soundboard answers the theme.
- **Stopping a scene by hand frees its owner.** `useAudioThemeTriggers` watches the store's running scenes and drops any owner whose scene stopped. Without that, a scene stopped from the deck left its owner listed, and the same source's next request was ignored as a repeat (Play needed two presses).
- **Two owners can hold one scene** (a room put on by hand and the party standing in it). Releasing one only stops the scene when no other owner still targets it.
- **The library loads on demand, not at mount (#999).** `useAudioThemeTriggers` lives in `DefaultLayout`, so subscribing to the sound and playlist lists cost two requests on every DM page. It now reads them from the query cache when a trigger fires, and loads them first (`fetchQuery` with `soundsQueryOptions` / `playlistsQueryOptions`) when the cache has no usable copy; events that arrive during that load queue behind it in order, so a release never overtakes its request. The palette loads the lists when it opens; the deck reads pads, sounds and playlists through its own queries. Playback already running is never touched by any of this.
- **Audio that starts on its own asks the deck to peek.** `useAudioThemeTriggers.revealPlayer()` calls `requestDeckPeek()` whenever a request resolves to something playable, and for every cue. The deck opens to Deck size over the page for a few seconds and settles back (on a phone, the folded row). Peek can be switched off in the deck's settings, and a request only does anything from the tucked size: the Row bar already holds the stop controls.
- **The deck's tucked handle is the one thing on screen saying audio is still playing** on every DM page (a dot per playing pad, "N playing").
- **A layer's preview in the scene editor is a play/stop toggle.** A bed can run for minutes, so `PlaylistTrackRow` shows Stop while the sound plays, and closing `PlaylistEditorDialog` stops whatever it auditioned (and nothing the DM had playing before).

### The rule that governs all of it

**A trigger that finds no match does nothing at all.** It never stops, fades or replaces what is already playing. Silence the DM chose beats silence we chose, and a feature that hijacks the room the first time it guesses wrong gets switched off and never switched back on. Anything added here must keep that property; it is the behaviour the consumer's tests exist to protect.

Second rule: a **release only takes effect from whoever currently owns the slot** (`sourceId`), so a stale encounter ending cannot cut the music a newer one started. On release the slot goes back to whatever the DM had running before the takeover, restarting from the top, the honest cost of not holding a paused playlist open for the length of a fight.

### Why a bus rather than a direct call

Combat does not import the soundboard. The encounter runner has no idea which playlists exist or whether themed audio is even switched on, and giving it that knowledge would mean every future producer, locations, sessions, the calendar, grew the same dependency. Producers say what happened; the soundboard decides whether it means anything.

The encounter trigger fires on **Start Combat**, not Go Live: Go Live is about the player portal, and most tables running this are in one room.

## Keyboard

Shortcuts go through the app-wide registry (`src/lib/hotkeys.ts` + `src/composables/useHotkeys.ts`), not through per-component `document` listeners. Three layers:

| Layer     | Meaning                                                                              |
| --------- | ------------------------------------------------------------------------------------ |
| `global`  | Works anywhere. `mod+K` (campaign search), `mod+shift+K` (sound palette), `?` (cheat sheet), and the deck's keys |
| `page`    | Registered by a screen. `/soundboard` registers Space (Pause all) in Play mode here   |
| `overlay` | A modal. While **any** overlay binding is enabled, page and global bindings do not fire at all |

The overlay layer is a hard cutoff, not a precedence bump, an open palette must not let `1`-`8` fire pads on the deck behind it. This is also why every dialog reachable from `/soundboard` registers an overlay `escape` binding: it closes the dialog *and* stops the transport keys responding while the DM types a name.

Since #746, `AddSoundDialog`, `BoardSettingsDialog` and `PlaylistEditorDialog` no longer register that binding themselves, they are built on `AppModal`, and the shell registers it for them, with the same two effects. `SoundPalette` is still hand-rolled and still registers its own (along with its arrow/enter bindings), because it is a top-aligned palette rather than a centred panel and does not fit the shell's geometry.

**The deck's keys** (`useDeckHotkeys`, global layer, mounted once by `SoundDeck`): `1`-`8` fire the **row in view**, one pad per lane, and the pads of that row show their numbers, because a shortcut nobody can see is a shortcut nobody uses. The row in view is the deck's, one for every surface (3 Nov 2026, the maintainer's call): a screen reports it with the `showRow` action and the snapshot hands it back as `keyRow`, kept on the page and back to 0 on another page. The Row bar shows it and steps it; at Deck and Full size scrolling makes it the top row showing, at least half below the lane headers (`lib/audio/deck/rowInView.ts`), and opening there (a peek included) scrolls to it, so a peek from the Row bar's edge opens on the row the bar was showing. The dock body ignores the scroll its own scrollTop write fires: at the bottom of a page the row cannot reach the top, and taking the top row then would move the keys off the row being played. Hold `L S F O V E` to borrow a tool, tap to lock; `P` Play; `H` Hush; `X` stop everything; `Shift+F` fade all; `D` cycles the dock size (not on `/soundboard`). The full list and the reason there is no global Space are under **The deck protocol**. The old `/soundboard` bindings (`1`-`9` over rendered cards, arrows for track and volume, `m` mute) went with `useSoundboardHotkeys`.

**Anywhere** (`GlobalHotkeys.vue`, mounted in `DefaultLayout`): `mod+shift+K` opens `SoundPalette`. Not plain `mod+K`, `GlobalSearch` owns that for entity navigation. The palette ranks via `src/lib/audio/soundSearch.ts` (exact → prefix → word-prefix → substring, over name → tags → artist), deliberately not fuzzy: the DM has to be able to predict the top hit from the letters they typed. Playlists rank above loose sounds. Enter on a playing `effects` sound **re-fires from the top** rather than pausing; everything else toggles. The palette stays open after firing.

`?` opens `HotkeyCheatSheet`, which renders `useActiveHotkeys()` directly: it lists what is actually bound rather than a hand-maintained list that goes stale the first time someone forgets to update it.

### Gotcha: punctuation combos

`matchesCombo` skips the shift comparison for single non-alphanumeric keys. `?` is what Shift+`/` produces, so a `"?"` binding that also demanded `shiftKey === false` could never match a real keypress. Letters and digits keep the check, since `k` and `shift+k` are otherwise indistinguishable after case normalisation.

## Pages & Playlists

**Pages** (`soundboard_pages`) are the decks a DM switches between (a dungeon, the tavern): a name, an order and the eight lanes. What is on a page is its pads (`soundboard_pads`), not a column on the sound: a sound can sit on several pages, or on none. There is no "All" view; the library panel on `/soundboard` is where every sound, scene and playlist is listed, with an on-page mark. Page tabs live in `SoundboardPageTabs` (builder) and `DeckHeader` (dock).

**Playlists** (`soundboard_playlists` + junction `soundboard_playlist_tracks`) are one of two types, and the type is fixed at creation:

- **Music**, tracks play **sequentially**. `playMusicPlaylist()` builds an ordered (optionally shuffled) list of sound IDs and starts the first; each track's `audio.onended` handler checks whether it's the currently-active playlist track and calls `musicPlaylistNext()` if so, auto-advance, with `repeat` looping back to index 0 or stopping. `musicPlaylistPrev()` restarts the current track instead of going back if more than 3s in. An `AudioEffectPreset` set on the active playlist is **carried across track changes** (re-applied via `startCurrentPlaylistTrack`).
- **Ambient**: all tracks in the playlist loop **simultaneously** as independent layered sounds (`playAmbientPlaylist()` sets `isLooping = true` and calls `play()` on every track at once). There's no "current track" concept, no shuffle/repeat, and no effect carry-over.

**Music is exclusive; scenes stack.** `activeMusicPlaylist` is a single ref, two tracks at once is a mistake, while `activeAmbientPlaylists` is a list, because two rooms at once is the feature: rain over a tavern, a forge under a market.

Consequences worth knowing before touching this:

- `stopAmbientPlaylist` / `pauseAmbientPlaylist` / `resumeAmbientPlaylist` take an **optional** playlist id and default to every scene. Anything acting on behalf of one scene (a card, the palette, the scene mixer, a location trigger) must pass the id, or it silences scenes it does not own.
- `playAmbientPlaylist` **skips a layer another running scene already claimed**. There is one element per sound, so starting it twice would play it over itself at double volume with nothing to tell the copies apart. A sound therefore belongs to at most one running scene, which is what lets `setLayerVolume` take the first match.
- Ask `isPlaylistActive(id)` / `isPlaylistPaused(id)` rather than comparing against a slot. `activeMusicPlaylistId()` exists for the music slot alone.

## Sound Sources

`SoundForm` offers five ways to add a sound. Only Upload is plan-gated (Pro, `useSubscription().isPro`); Generate is `ai_enabled`- and credit-gated instead, same as every other AI generator (24 Sep 2026 policy, "all users should be able to use AI if they have tokens"):

| Source                 | `source_type` | Gate                                               | Notes                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL                    | `url`         | None                                                | Any direct audio URL                                                                                                                                                                                                                                                                  |
| Upload                 | `upload`      | **Pro**                                             | 20 MB cap, converted to Opus (`toOpus()`) client-side, stored in the `sounds` bucket                                                                                                                                                                                                  |
| Spotify                | `spotify`     | None (but DM-only, requires campaign Spotify setup) | Stores an `open.spotify.com` track/playlist/album/episode URL; playback delegates entirely to `useSpotifyStore`                                                                                                                                                                       |
| Generate (AI, Lyria)   | `upload`      | `ai_enabled` + credits (any plan)                   | Two-step, both server-side: `generate-music`'s worker expands the description, length and vocals choice into a full prompt with a text model, then Lyria 3.5 generates audio. The whole thing is a durable job: the edge worker uploads audio before the client creates the sound, preserving the original campaign/page if navigation happens. Local-BYOK remains client-side, sends a hand-composed (not structured) prompt, and is saved through `useSoundUpload`; both are saved with `artist: "Grimoire AI"`. |
| Browse SFX (Freesound) | `freesound`   | None                                                | Search-and-add from the `freesound-search` edge function; saved with the CDN preview URL plus attribution fields                                                                                                                                                                      |
| Grimoire library       | `library`     | None                                                | Search-and-add from our own `sound_library` catalogue; sets `library_id`, which exempts the row from the sound quota. See "Curated library" below                                                                                                                                     |

## Free-Tier Quotas

Enforced both client-side (`useQuota` gates the UI, showing a `PaywallModal`) and server-side (a `before insert` trigger calling `enforce_quota()` on all three tables, migration `20260614000004_soundboard_free_tier_quotas.sql`). The `check_quota` RPC is `security definer`, re-derives the plan from `user_subscriptions`/`plans` (defaulting to `free`), and counts existing rows, app admins always short-circuit to unlimited.

Free plan limits: **20 sounds, 1 soundboard page, 3 soundboard playlists.** Uploading your own audio is gated on the Pro plan directly in `SoundForm` (independent of the count-based quotas above); AI music generation is not plan-gated, it runs on any plan with the campaign's AI Assistant on and enough credits, same as every other generator (24 Sep 2026 policy: "all users should be able to use AI if they have tokens").

**Curated content is exempt from both counts.** `check_quota` and `check_all_quotas` append `and library_id is null` when counting `sounds`, and `and library_scene_slug is null` when counting `soundboard_playlists` (migrations `20260728000004`, `20260728000005`). Handing a DM a library and then charging them room to keep it defeats the point of shipping one. The two functions are the same rule written twice, once per call shape, **change both or neither**.

The rule is no longer soundboard-only: `20260818081308` extended it to `factions`, `deities`, `pantheons` and `locations` via `setting_source`, because the Populate buttons ship 15/112/13/35 rows on Faerûn against free caps of 5/5/3/10 and were therefore paywalling their own content. Same shape, same pair of functions, and now a pgTAP regression at `supabase/tests/setting_content_quota.test.sql` that asserts both functions agree.

## Curated library

802 CC0 / CC-BY sounds hosted by us, free on every tier, plus seven ready-made scenes. This is what stops a new campaign opening to an empty grid (#572 §3).

| Piece                                                      | Where                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Catalogue table                                            | `public.sound_library`, one row per sound, admin-write, authenticated-read |
| Audio                                                      | `sounds` bucket under `library/<collection>/<name>.ogg`, admin-write prefix |
| Provider adapter (default browser tab)                     | `src/lib/audio/providers/library.ts`                                         |
| Scene recipes                                              | `src/data/starterScenes.ts`                                                 |
| Add-scenes planner (pure) + executor                       | `src/lib/audio/starterScenePlan.ts`, `src/composables/soundboard/useStarterScenes.ts`        |
| The offer (builder empty state + the library's Scenes list, `compact`) | `src/components/soundboard/StarterScenesCard.vue`                           |
| In-app credits                                             | `/soundboard/credits` → `src/views/soundboard/SoundLibraryCreditsView.vue`  |
| Ingest (source folder is gitignored)                       | `scripts/ingest-sound-library.ts` + `scripts/lib/*`                         |

Source of truth for ingestion is `art-src/sounds/manifest.json` (gitignored, ~180 MB of audio alongside it); `art-src/sounds/AGENTS.md` governs what may enter it. Re-run with `npx tsx --env-file=.env.local scripts/ingest-sound-library.ts`, idempotent, `--skip-upload` rewrites rows only.

### Things not to undo

- **It is not SRD content and is not filed as if it were.** The storage prefix is `library/`, not `srd/`. Mislabelling CC0 field recordings as SRD misdescribes the licence to anyone reading the bucket later.
- **Catalogue-backed `sounds` rows carry a null `storage_path`.** One object backs every campaign that added it. `deleteSound` additionally checks `library_id` before deleting from the bucket, belt and braces, because that invariant is one stray write away from removing a sound from every user at once.
- **Attribution travels with the sound.** `sound_library.attribution` is copied onto the `sounds` row at add time and shown where the sound is added and listed. The credits view reads the catalogue live rather than a static list, because a hand-maintained credits page eventually becomes a licence breach.
- **The consolidated credits live in the Reliquary's Licences tab** (`/rules?tab=licenses`, `get_audio_licenses()`, added for #567). Per-card credit only reaches a reader once a DM has added that sound to a board, but we host all 802 regardless, and 82 of them are CC-BY and require credit. When adding a source to the catalogue, `license` and `license_url` are both load-bearing: a licence name with no URL is not a notice anyone can act on (26 Wikimedia rows shipped that way until migration `20260729000003`). `attribution` stays null only for licences that genuinely require no credit.
- **`is_loopable` is never inferred from duration.** A forty-second field recording is long enough to be a bed and still clicks on every wrap. Only the source's own claim sets it.
- **Adding starter scenes twice is a no-op.** `planStarterScenes` skips scenes already on the board and creates a shared layer once, not once per scene, the campfire appears in two scenes and must not leave a duplicate behind.

## Cast & Media Session

Both integrations are **music-playlist-only**, ambient's simultaneous-layer model has no single "now playing" item for either API to describe, so both are explicitly skipped for ambient playlists.

- **Media Session** (`useMediaSession`) is wired globally from `App.vue`, not gated to the Soundboard page, CarPlay/Android Auto/lock-screen controls work as long as anything on the board plays, anywhere in the app. A music playlist is published track by track; without one, the deck's pads and scenes are published as the board (`describeBoard`): the music pad's name, else the scene's, else any sound's (a press passes the sound's name as `PlayOptions.title`), playing or paused, with play / pause / stop mapped to Resume, Pause all and Stop all. Until 7 Nov 2026 only a playlist was published, so a pad played with the session saying "none": CarPlay showed the logo with a play button, treated the audio as a passing system sound, and switched channels for it every couple of seconds, heard as the car reconnecting, into the next app too. It publishes `MediaMetadata` (title/artist/album/artwork) and `play`/`pause`/`nexttrack`/`previoustrack`/`stop`/`seekto` action handlers, all delegating back into the soundboard store. Its position state is published only on a new track, play, or a jump of more than a second from where steady playback would be (`positionNeedsPublish`), never per `timeupdate`: the OS runs the scrubber on by itself, and each publish is a Now Playing update over the CarPlay link.
- **Keeping the AudioContext alive** (`lib/audio/audioContext.ts`). A `statechange` hook resumes a context the OS suspended or interrupted while something is audible. Backgrounding the app on iOS interrupts it, so this resume is what keeps the board playing in the background and with the screen locked. #1150 (Nov 2026) left `interrupted` alone and rate-limited the resume on the theory that each resume made CarPlay reconnect; it did not stop the reconnects and it stopped background playback, so it was reverted.
- **Google Cast** (`useCast`) mirrors the active music playlist to a Chromecast/Google Home device via the Default Media Receiver (no custom receiver app). Its one button lives in `SoundboardMixer` ("Cast to a speaker"), which exists only while a mixer is open, never in the always-docked deck header, for the reason that follows. It's lazily initialised, the Cast Sender SDK `<script>` is injected only when a `CastButton` first mounts, specifically to avoid the SDK's continuous mDNS device discovery starving audio-streaming bandwidth (this caused audible crackling when it was loaded at app startup). While casting, `soundboardStore.isCasting` is set and local playback is silenced (`pauseForCast`) so only the Cast device plays. Only Chrome/Edge desktop and Android support it; elsewhere `isCastAvailable` stays false and the button doesn't render.

## Shared playback (remote players)

A DM can share **the music slot only** with players in the portal. `soundboard_broadcast` holds one row per campaign; the DM writes it, campaign members may only read it.

| Piece                                        | Role                                                        |
| -------------------------------------------- | ------------------------------------------------------------ |
| `src/lib/audio/broadcastOffset.ts`                 | Pure: anchor → current position, and the resync threshold      |
| `src/composables/soundboard/useSoundboardBroadcast.ts`  | DM side. Module-level `broadcasting` flag + the upsert         |
| `src/composables/player/usePlayerAudioStream.ts`    | Player side. Realtime subscription and the element             |
| `src/components/soundboard/PlayerAudioStream.vue` | Player UI, mounted in `PlayerLayout`                      |

### Four decisions worth not undoing

**The current track is denormalised onto the row.** The obvious alternative, opening `sounds` up so players can read what a broadcast points at, would grant every campaign member read access to the DM's whole library in order to share one track. The row instead carries a snapshot of exactly what is audible, which is all a player is entitled to. The `sounds` bucket is already public, so the URL resolves with no storage-policy change. **Phase 6 therefore changes no existing table's RLS at all.**

**`started_at` is an anchor, not a position**, the wall-clock instant corresponding to position zero. Each client derives its own offset, so a player joining thirty seconds late lands in the right place and the row does not need rewriting several times a second. The DM pushes only on track change, pause and stop; **never on `timeupdate`**.

**Joining is an explicit act.** A browser will not start audio without a gesture from that player, so "Join audio" is a requirement rather than a courtesy, and it is the right consent model regardless: nobody's speakers should come alive because someone else pressed play.

**Broadcasting is per session and off by default.** The flag lives in memory and is gone on reload. Most tables using this are in one room, where several devices playing the same track comb-filter into a flanged mess.

### Known limits

- **Sync is approximate.** Each client plays its own copy seeked to the offset; there is no media server. Fine for music, which is why one-shot effects are deliberately not carried, they would land a second apart across a group.
- **Ambience is not shared.** Generator layers fire on random schedules, so "the same scene" would be a different arrangement on every device anyway.
- **A DM who closes the tab leaves `is_live` true.** Players hear the current track finish and then nothing. The row is corrected next time the DM opens the board.
- The player receiver hears `soundboard_broadcast` rings from the campaign doorbell through `onCampaignRing` and re-reads the row with `load()`; there is no query to invalidate, only a live ref driving an element, so the signal is listener-only (`LISTENER_ONLY_SIGNALS`). It used to own a `postgres_changes` channel, which needed the table in the `supabase_realtime` publication (migration `20260728000003`); since #999 4.2 the table rings on every write instead.

## Songs for players (`/songs`)

A DM ticks **Players can listen** on a music playlist (`soundboard_playlists.players_can_listen`, in `PlaylistEditorDialog`), and everyone in that campaign can play its songs on `/songs`: big picture buttons two to a row, made for a phone pinned to the home screen. It began with the maintainer's five-year-old, a young player in his campaign who cannot read yet (9 Nov 2026). Unlike shared playback, it needs no session and no DM at the board: it is the table's songs, any time.

| Piece | Role |
| --- | --- |
| `public.get_player_songs()` (`20261109134103`) | Every track of a flagged **music** playlist in every campaign the caller belongs to, minus Spotify. A definer with no argument (`self` in the definer registry); `supabase/tests/player_songs.test.sql` |
| `src/lib/songs/songShelf.ts` | Pure: rows into one shelf per shared playlist, a stable picture and colour per song |
| `usePlayerSongs` / `useSongPlayer` (`composables/soundboard/`) | The read (key `player-songs`, refreshed by the sounds, playlist and track rings) and a plain audio element |
| `SongsView` + `SongTile` + `SongCover` | The page, a song's button and its face (art, or picture on colour); `PlayerSettingsSongs` links to it from a player's Settings once there is something to hear |
| `usePinnedPageManifest` + `public/songs.webmanifest`, `public/songs-app/` | "Add to Home Screen" pins this page as **Grimoire Songs**, not the app's front door |

**Decisions worth not undoing.**

- **Signed in, never a public link.** The first idea was a token URL anyone could open. The child already had a young player's account in the campaign, so the page reads through that sign-in and nothing about a campaign is reachable without one. The parent signs the pinned app in once (an iOS home-screen app keeps its own storage, so the Safari session does not carry over).
- **A definer instead of wider RLS**, for the same reason shared playback denormalises its row: a player policy on `sounds` would open the DM's whole library to share a few songs. The function returns name, file, cover art, artist and loudness trim, nothing else. `sounds` files are in a public bucket already, so the URL plays with no storage change.
- **Nothing a song depends on is written.** A song with cover art (`thumbnail_url`) shows it; one without gets one of `SONG_PICTURES` (`lib/icons.ts`) on one of `SONG_COLOURS`, picked from a hash of the sound's id, so a song keeps its look when the DM adds or reorders songs. Its name sits small under the picture, for a grown-up. Playing shows a big pause sign and a progress bar on the button; a song that cannot play shows a muted speaker.
- **One page per playlist, swiped sideways; its songs scroll up and down** (the maintainer's call, 9 Nov 2026). The pager is the browser's own horizontal scroll with snap points, so a swipe feels native and needs no gesture code. With more than one playlist a bar at the bottom shows each as its first song's face in a small circle, the current one ringed; a tap there jumps. A grown-up reads the playlist's name above the songs (and the campaign's, when the account plays in several).
- **A tap plays that song and only that song.** Tap again to pause, again to carry on; a song plays to its end and stops. No queue, shuffle or repeat: what plays is always the button that was pressed.
- **Not the soundboard store.** That is the DM's instrument (buses, lanes, cast, broadcast); the page uses one audio element and sets Media Session metadata so the lock screen shows the song.
- **Public layout, signed-in route.** `/songs` uses the chrome-less `public` layout and mounts `TermsGate` itself, with `accountScoped` + `playerReadable` so either lens reaches it. The campaign doorbell is not mounted there; the read refetches when the page is opened or refocused.

## DM / Player Split

**The soundboard itself is DM-only; players get one read-only stream.** `sounds`, `soundboard_pages`, `soundboard_playlists` (and the `soundboard_playlist_tracks` junction, scoped via the parent playlist's owner) all carry RLS of the form `auth.uid() = user_id`, with no player-facing SELECT policy, **shared playback did not change that**, because the broadcast row carries its own denormalised copy of the audible track. The Soundboard route (`/soundboard`) and every editing component in this doc are reachable only from the DM-side nav; there is no `/play/soundboard`.

What a player can reach is `soundboard_broadcast`, SELECT only, and the songs of a playlist the DM marked "Players can listen", through `get_player_songs` (see Songs for players above). The stream plays through `PlayerAudioStream` in `PlayerLayout`, and only when the DM has switched sharing on for that session and the player has pressed Join on their own device. A player can never start, stop or retarget the table's audio: there is no player-facing INSERT, UPDATE or DELETE policy on that table.

**Over MCP (29 Sep 2026).** Two read tools in `supabase/functions/_shared/mcp/tools.ts`: `soundboard` lists one campaign's pages, playlists (tracks as ordered `track_sound_ids`) and sounds, and `get_audio` returns one sound's bytes as an MCP `audio` content block, capped at `MAX_INLINE_AUDIO_BYTES` (12 MB). Both run under the connection's token, so the owner-only RLS above is the whole access story. `get_audio` fetches only URLs `isSafeStorageUrl` accepts (Supabase origin or the asset CDN); Spotify, Freesound previews and pasted URLs come back as links, never proxied.

## Known Gaps

Tracked in [#572](https://github.com/irongollem/grimoire/issues/572), which sequences
the work in six phases. **Phases 1 (engine), 2 (scenes), 4 (speed), 5 (integration)
and 6 (shared playback) have shipped.** What remains:

### Phase 3, content

- **No bundled sound library.** A new campaign's Soundboard opens completely empty ("No sounds yet"); nothing ships as canonical/seed content the way SRD monsters or spells do. Being assembled **outside this repo** as a self-sourced CC0 / CC-BY collection, which sidesteps the Freesound commercial-use question rather than waiting on it. Check before starting any bundling work here.
- **Freesound's own filters are not exposed.** The edge function forwards only query, page and page size, so finding a three-second door creak means auditioning a lot of forty-second field recordings.

### Phase 5, integration

Encounters and locations are wired (see **Themed audio** above). Still open:

- **Sessions and the calendar do not trigger anything.** The bus is producer-agnostic, so adding one is a `requestAudioTheme` call plus a theme field, no soundboard changes.

"No indication of why audio is playing" is done: `src/components/soundboard/CausedByChip.vue` reads `useActiveAudioTriggers()` and shows the trigger's `label` with a release button, and (#870) a beat's own audio cue is a third producer on the same bus, see "Who wins the slot" above.

### Not phased

- **`useReplacePlaylistTracks` deletes and re-inserts the whole track list on every save** rather than diffing.
- **Other shortcuts have not migrated to the registry.** `GlobalSearch` and the soundboard dialogs have; `ImageLightbox`, `RollModePicker` and the cartographer editor still open their own `document` listeners, so the registry cannot see those combos and the cheat sheet cannot list them.

### The deck

- **Stream Deck** ([#125](https://github.com/irongollem/grimoire/issues/125)) is a driver on the deck protocol that is not written yet.
- **The Launchpad Mini MK3 is unverified on hardware** (`launchpadProfiles.ts`); the Pro MK3 follows Novation's manual and the X was checked on the device. The Pro's colours are the X's, untried on a Pro.
- **Row (scene) launch on hardware** is out of scope: a scene is already a pad, and the right column is more useful as tools.
- **The MCP `soundboard` tool** still lists pages, playlists and sounds; it does not expose pads, takes or lanes.

See the issue for the full plan and per-gap file references.
