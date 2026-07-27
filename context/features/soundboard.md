# Soundboard

DM-driven ambient sound and music player for live sessions: a per-campaign library of sounds organised into pages (boards) and playlists, played through a custom HTML/Web Audio engine with real-time filter effects, optional Spotify and Google Cast output, and OS-level Media Session integration (CarPlay, lock screen).

**Known-gaps audit:** GitHub issue [#572](https://github.com/irongollem/grimoire/issues/572) is a full audit of this module against paid standalone tools (Syrinscape, Foundry, Roll20) and specs the work to close the gaps listed at the bottom of this doc — read it before starting any soundboard work, since it contains exact file/line references for every weak point.

## Files

### Types

`src/types/sound.types.ts` — `SoundCategory` (`ambient | music | effects | misc`), `SoundSourceType` (`upload | url | spotify | freesound`), `Sound`, `SoundboardPage`, `AudioEffectPreset` (`none | through_door | through_wall | distant | underwater | cave | sewer`), `PlaylistType` (`music | ambient`), `SoundboardPlaylist`, `PlaylistTrack`/`PlaylistTrackWithSound`. Note: AI-generated sounds are **not** a distinct `source_type` — Lyria output is uploaded through the normal `upload` path (see Sound Sources below).

### Store & audio engine

`src/stores/soundboard.ts` (Pinia `useSoundboardStore`, ~1130 lines) owns all non-Spotify playback. See **Audio Engine** below for the mechanics.

Two mechanics live outside it because neither is reactive state and both are untestable from inside a store:

- `src/lib/soundTransport.ts` — element registry, duck refcounting, transition generations, category→bus mapping.
- `src/lib/sceneGenerators.ts` — the timers and randomness behind generator layers, as a pool with an injectable clock and RNG.

### Composables

| File                                        | Role                                                                                                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/composables/useSounds.ts`              | TanStack Query CRUD for the `sounds` table; `useSoundUpload` (converts uploads to Opus via `toOpus()`, then to the `sounds` storage bucket); `useSoundThumbnailUpload` (wraps `useImageUpload("sound-images")`) |
| `src/composables/useSoundboardPages.ts`     | CRUD + `useReorderSoundboardPages` for `soundboard_pages`                                                                                                                                                       |
| `src/composables/useSoundboardPlaylists.ts` | CRUD for `soundboard_playlists` + `soundboard_playlist_tracks`; `useReplacePlaylistTracks` deletes and re-inserts the whole track list on every save rather than diffing (flagged as tech debt in #572)         |
| `src/composables/useFreesoundSearch.ts`     | TanStack Query wrapper around the `freesound-search` edge function, min 2-char query, 10 min `staleTime`                                                                                                        |
| `src/composables/useMediaSession.ts`        | Wires the active **music** playlist to `navigator.mediaSession`; called once from `App.vue` (`if (!import.meta.env.SSR) useMediaSession();`) so it's live app-wide, not just on the Soundboard page             |
| `src/composables/useCast.ts`                | Google Cast Sender SDK integration (see **Cast** below); singleton, lazily initialised only when a `CastButton` first mounts                                                                                    |
| `src/composables/useSoundPlayback.ts`       | The one answer to "is this sound audible / is it blocked / what does the next press do", as list-friendly predicates plus a reactive facade. Both card transports and the palette use it, so a file one surface knows it cannot play is never offered as playable by another |
| `src/composables/useSoundboardHotkeys.ts`   | The `page`-layer transport bindings for `/soundboard` (see **Keyboard** below)                                                                                                                                  |

### Spotify

`src/stores/spotify.ts` (Pinia `useSpotifyStore`) wraps the Spotify Web Playback SDK, registering "Grimoire Soundboard" as a Connect device. `src/lib/spotifyAuth.ts` implements PKCE OAuth (no client secret) — tokens live in `localStorage`, not the DB. The Spotify Client ID is BYOK, stored in plaintext on `campaigns.spotify_client_id` (not the encrypted key vault) and configured by the DM in Campaign Settings → Spotify. `isEnabled` requires both a configured client ID **and** `auth.isDM` — Spotify never appears for players. Requires a Spotify **Premium** account (the Web Playback SDK rejects free accounts).

### Freesound

`src/lib/freesound.ts` — pure license-normalisation (`normalizeLicense`) and attribution-building (`buildAttribution`) helpers. `supabase/functions/freesound-search/index.ts` duplicates these two functions (Deno can't import client-side TS) — **keep both copies in sync**, per the comment in both files. The edge function requires an authenticated user, filters results to `license:("Creative Commons 0" OR "Attribution")` (CC-BY-NC is explicitly excluded — Grimoire is a commercial product, see `feedback_licensing_spirit.md`), and rewrites `freesound.org/data/previews/…` URLs to the `cdn.freesound.org` host to save a redirect. Only preview clips are returned, not full-resolution source files — a fidelity/length ceiling inherited from the free API tier.

### AI generation (Lyria)

`src/lib/aiMusic.ts` exports `generateMusicWithLyria`, `structureMusicPrompt` (expands a plain description into a structured prompt via a text model first), `LYRIA_MODELS` (`lyria-3-clip-preview` / `lyria-3-pro-preview`), and `LYRICS_MAX_CHARS` (2200). `supabase/functions/generate-music/index.ts` is the server-mode path: validates campaign membership, resolves BYOK-vs-platform Gemini key (BYOK is Pro-only per `project_byok_pro_only.md`), reserves AI credits, calls the Lyria `generateContent` endpoint, and returns base64 audio. The client-side `generateMusicWithLyria` path is used instead when the user has a **local-vault** BYOK key (`grimoire_key_local_mode === "local"` in `localStorage`).

### Components (`src/components/soundboard/`)

| File                                                                      | Role                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SoundForm.vue` (636 lines — over the 600-line soft max, flagged in #572) | The add-sound form with 5 source tabs: URL, Upload, Spotify, Generate (AI), Browse SFX (Freesound). Whole-window drag-and-drop hijack while mounted.                                                                                         |
| `SoundCard.vue` (76 lines)                                                | Thin orchestrator: routes between the two transports on `source_type`, computes the card's active-highlight state, warms up the audio element on mount                                                                                       |
| `SoundCardHeader.vue`                                                     | Thumbnail upload, inline name/artist/category editing, WebM/Safari + retry badges, loop toggle, delete, and the trim control                                                                                                                 |
| `SoundCardAudioTransport.vue`                                             | Local-audio transport: page picker, play/stop, effect picker, volume, progress bar                                                                                                                                                           |
| `SoundCardSpotifyTransport.vue`                                           | Spotify transport in its three states (disabled / not connected / ready)                                                                                                                                                                     |
| `SoundTrimControl.vue`                                                    | Persisted per-sound loudness correction (`gain_trim`, 0.25×–4×). Live preview on `@input`, persists once on `@change`. Gold badge when trimmed away from 1×                                                                                  |
| `VolumeSlider.vue`                                                        | The one shared range input — master, buses, per-sound and Spotify all use it (`label`/`showPercent`/`wide`/`muted`/`accent` props)                                                                                                           |
| `AddSoundDialog.vue`                                                      | Modal wrapper around `SoundForm`                                                                                                                                                                                                             |
| `SoundFreesoundBrowser.vue`                                               | Freesound search results with a single shared preview `<Audio>` element (module-scope, same non-reactive pattern as the store) and an "Add" button per hit                                                                                   |
| `SoundEffectPicker.vue`                                                   | Wand-icon popover for the 6 `AudioEffectPreset` values, teleported to `<body>` to escape widget overflow clipping                                                                                                                            |
| `SoundCategoryFilter.vue`                                                 | Pill filter (All/Ambient/Music/Effects/Misc)                                                                                                                                                                                                 |
| `SoundboardPageTabs.vue`                                                  | Draggable page-tab bar: rename (double-click), delete, horizontal-scroll overflow cues, quota-gated "Add Page"                                                                                                                               |
| `SoundboardWidget.vue`                                                    | Floating, draggable mini-player (teleported to `<body>`) showing Spotify / active music playlist / active ambient playlist / individual playing sounds, plus "Stop All" and a collapsible **Mixer** (master + music/ambience/effects faders) |
| `SoundboardWidgetToggle.vue`                                              | Nav-bar button that opens/closes the floating widget; badge = count of currently-playing sounds (+1 if Spotify is playing)                                                                                                                   |
| `CastButton.vue`                                                          | Google Cast trigger; renders nothing until `isCastAvailable`                                                                                                                                                                                 |
| `PlaylistsPanel.vue`                                                      | Playlist grid for the active page (or all playlists on "All"), quota-gated "New Playlist"                                                                                                                                                    |
| `PlaylistCard.vue`                                                        | Playlist grid card: play/pause/stop; prev/next + `CastButton` for music playlists only                                                                                                                                                       |
| `PlaylistEditorDialog.vue`                                                | Create/edit modal: name, type (locked after creation), shuffle/repeat (music only), draggable track list, add-sound via `EntityCombobox`                                                                                                     |
| `PlaylistTrackRow.vue`                                                    | One draggable track row inside the editor, with a category colour chip                                                                                                                                                                       |

### Views

- `src/views/soundboard/SoundboardView.vue` — the `/soundboard` DM page. Page tabs, a Sounds/Playlists mode toggle, a filter bar (search + category, both in `useUiStore` per the Filter State Pattern), a drag-reorderable sound grid. On first load with zero pages it auto-creates a "Main" page and bulk-assigns every existing sound to it.
- `src/views/soundboard/SpotifyCallbackView.vue` — `/spotify/callback` OAuth redirect target; exchanges the PKCE code then routes back to `/soundboard`.

## Audio Engine

Rebuilt in #572 phase 1. Playback for everything except Spotify runs through a
**Web Audio bus graph** in `src/lib/audioEngine.ts`, with `src/stores/soundboard.ts`
orchestrating on top and `src/lib/soundTransport.ts` holding the non-reactive
plumbing:

```
MediaElementAudioSource → BiquadFilter → soundGain → bus(music|ambient|effects) → master → destination
```

- **`src/lib/audioEngine.ts`** — owns the graph. `getAudioEngine()` returns a stable object; `engine.available` is false when no `AudioContext` exists, and every method is then a safe no-op so playback still works (just without fades or buses). Consumes the shared singleton in `src/lib/audioContext.ts` — the store no longer owns its own context.
- **`src/lib/soundTransport.ts`** — the `HTMLAudioElement` registry, duck refcounting, transition generations, and `category → bus` mapping. Deliberately outside Pinia: Vue's Proxy wrapper breaks `HTMLAudioElement` (volume/loop mutations silently drop, `play()` calls fail unpredictably).
- **Volume runs through `GainNode.gain`, not `audio.volume`.** That is the change that made everything else possible — `audio.volume` is pre-context and cannot be ramped as an `AudioParam`, so every transition used to be a hard cut. Elements are held wide open at `volume = 1` and the graph owns level. The fallback path still uses `audio.volume` when Web Audio is unavailable.
- **Per-sound gain composes three factors** — user volume × `gain_trim` (persisted loudness normalisation) × the active effect's gain reduction. All three writers recompute the product against the same node rather than clobbering each other.
- **Fades and crossfade.** Fade-in on play, fade-out before pause/stop (the fade-out promise resolves before the element is paused). Music-playlist advance is a real crossfade, triggered from `ontimeupdate` while the outgoing track is still audible — _not_ from `onended`, which would only give a fade-in after silence. The next element is pre-created so its fetch and decode precede the transition.
- **Ducking.** An `effects`-category sound attenuates the music and ambient buses (never the effects bus) with a fast attack and slower release. Ref-counted via a Set in `soundTransport`, so overlapping one-shots do not un-duck each other.
- **Master and per-bus faders** — `setMasterVolume` / `setBusVolume`, surfaced in the widget's Mixer section.
- **Effect presets** are six lowpass frequency/Q/gain triples (`through_door`, `through_wall`, `distant`, `underwater`, `cave`, `sewer`), ramped over 0.5s, ported into the engine from the old store.
- A **transient CDN-error retry**: on `audio.onerror` the element is recreated once (`hasRetried`/`markRetried`); a second failure surfaces `loadError` with a manual Retry badge. The engine keys its source nodes by element identity (a `WeakMap`), so it rebuilds the chain when the retry swaps the element.

### Two invariants not to break

**Ramp shape.** `exponentialRampToValueAtTime` can neither approach nor leave zero. `scheduleGain` picks exponential only when both endpoints clear a silence floor and falls back to linear otherwise — this is what lets a fade-out reach true silence instead of stalling at an epsilon. Changing it reintroduces a classic Web Audio bug.

**Transition generations.** `bumpGeneration`/`isCurrentGeneration` guard the fade-out completion callback. Without them, a `stop()` immediately followed by a `play()` lets the stale callback pause the element that just started — the race that makes naive crossfading eat tracks.

### Trap when adding a call site

`play(soundId, fileUrl, category?, gainTrim?)` takes category and trim as **optional** trailing params. Omitting `category` typechecks cleanly and routes the sound to the ambient bus, where it will never duck — a green build will not catch it. Every new call site must pass the sound's category.

## Themed audio (encounters & locations)

Audio binds to campaign events by **theme label**, never by a foreign key to one playlist. An encounter asks for `battle`; any music playlist tagged `battle` is a candidate, picked at random. Tagging three playlists once gives every future combat variety — a track per encounter is exactly the prep burden this avoids.

| Piece                                       | Role                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/lib/audioThemes.ts`                    | Pure resolution: `resolveAudioTheme`, `collectThemes`, `tagsIncludeTheme`                    |
| `src/lib/audioTriggers.ts`                  | The bus: `requestAudioTheme` / `releaseAudioTheme` / `onAudioTrigger`                        |
| `src/composables/useAudioThemeTriggers.ts`  | The only consumer. Mounted once in `DefaultLayout`. Also exports `useAudioTriggerPrefs`      |
| `src/lib/audioTriggerPrefs.ts`              | The DM's on/off switch, localStorage, default on                                            |
| `src/components/common/ThemeInput.vue`      | Free-text label with datalist suggestions, shared by the encounter and location editors     |

**Slots.** An encounter drives `music`; a location drives `ambient`. They compose deliberately — dungeon ambience keeps running underneath battle music — and neither can ever contend for the other's channel. `resolveAudioTheme` will not look in the other slot even when its own has no answer.

### The rule that governs all of it

**A trigger that finds no match does nothing at all.** It never stops, fades or replaces what is already playing. Silence the DM chose beats silence we chose, and a feature that hijacks the room the first time it guesses wrong gets switched off and never switched back on. Anything added here must keep that property; it is the behaviour the consumer's tests exist to protect.

Second rule: a **release only takes effect from whoever currently owns the slot** (`sourceId`), so a stale encounter ending cannot cut the music a newer one started. On release the slot goes back to whatever the DM had running before the takeover, restarting from the top — the honest cost of not holding a paused playlist open for the length of a fight.

### Why a bus rather than a direct call

Combat does not import the soundboard. The encounter runner has no idea which playlists exist or whether themed audio is even switched on, and giving it that knowledge would mean every future producer — locations, sessions, the calendar — grew the same dependency. Producers say what happened; the soundboard decides whether it means anything.

The encounter trigger fires on **Start Combat**, not Go Live: Go Live is about the player portal, and most tables running this are in one room.

## Keyboard

Shortcuts go through the app-wide registry (`src/lib/hotkeys.ts` + `src/composables/useHotkeys.ts`), not through per-component `document` listeners. Three layers:

| Layer     | Meaning                                                                              |
| --------- | ------------------------------------------------------------------------------------ |
| `global`  | Works anywhere. Currently `mod+K` (campaign search), `mod+shift+K` (sound palette), `?` (cheat sheet) |
| `page`    | Registered by a screen. The soundboard's transport keys live here                     |
| `overlay` | A modal. While **any** overlay binding is enabled, page and global bindings do not fire at all |

The overlay layer is a hard cutoff, not a precedence bump — an open palette must not let `1`-`9` fire sounds on the board behind it. This is also why every dialog reachable from `/soundboard` registers an overlay `escape` binding: it closes the dialog _and_ stops the transport keys responding while the DM types a name.

**On `/soundboard`** (`useSoundboardHotkeys`): `1`-`9` fire the first nine cards in **rendered** order — after page filter, category filter and drag-reordering — and the card shows its number, because a shortcut nobody can see is a shortcut nobody uses. Plus `space` (pause/resume everything), `←`/`→` (track), `↑`/`↓` (master volume), `m` (mute), `x` (stop all). Space yields when a button has focus, since a focused button already answers to it.

**Anywhere** (`GlobalHotkeys.vue`, mounted in `DefaultLayout`): `mod+shift+K` opens `SoundPalette`. Not plain `mod+K` — `GlobalSearch` owns that for entity navigation. The palette ranks via `src/lib/soundSearch.ts` (exact → prefix → word-prefix → substring, over name → tags → artist), deliberately not fuzzy: the DM has to be able to predict the top hit from the letters they typed. Playlists rank above loose sounds. Enter on a playing `effects` sound **re-fires from the top** rather than pausing; everything else toggles. The palette stays open after firing.

`?` opens `HotkeyCheatSheet`, which renders `useActiveHotkeys()` directly — it lists what is actually bound rather than a hand-maintained list that goes stale the first time someone forgets to update it.

### Gotcha: punctuation combos

`matchesCombo` skips the shift comparison for single non-alphanumeric keys. `?` is what Shift+`/` produces, so a `"?"` binding that also demanded `shiftKey === false` could never match a real keypress. Letters and digits keep the check, since `k` and `shift+k` are otherwise indistinguishable after case normalisation.

## Pages & Playlists

**Pages** (`soundboard_pages`) are simple named boards a DM uses to organise sounds by scene/location — a `sounds.page_id` FK (nullable, `on delete set null`) assigns a sound to at most one page. The "All" pseudo-tab in `SoundboardPageTabs` shows every sound regardless of page.

**Playlists** (`soundboard_playlists` + junction `soundboard_playlist_tracks`) are one of two types, and the type is fixed at creation:

- **Music** — tracks play **sequentially**. `playMusicPlaylist()` builds an ordered (optionally shuffled) list of sound IDs and starts the first; each track's `audio.onended` handler checks whether it's the currently-active playlist track and calls `musicPlaylistNext()` if so — auto-advance, with `repeat` looping back to index 0 or stopping. `musicPlaylistPrev()` restarts the current track instead of going back if more than 3s in. An `AudioEffectPreset` set on the active playlist is **carried across track changes** (re-applied via `startCurrentPlaylistTrack`).
- **Ambient** — all tracks in the playlist loop **simultaneously** as independent layered sounds (`playAmbientPlaylist()` sets `isLooping = true` and calls `play()` on every track at once). There's no "current track" concept, no shuffle/repeat, and no effect carry-over.

Only one music playlist and one ambient playlist can be active at a time (`activeMusicPlaylist` / `activeAmbientPlaylist` are single refs, not a list) — you cannot layer two ambient scenes.

## Sound Sources

`SoundForm` offers five ways to add a sound, three of them Pro-gated (`useSubscription().isPro`):

| Source                 | `source_type` | Pro-gated?                                        | Notes                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL                    | `url`         | No                                                | Any direct audio URL                                                                                                                                                                                                                                                                  |
| Upload                 | `upload`      | **Yes**                                           | 20 MB cap, converted to Opus (`toOpus()`) client-side, stored in the `sounds` bucket                                                                                                                                                                                                  |
| Spotify                | `spotify`     | No (but DM-only, requires campaign Spotify setup) | Stores an `open.spotify.com` track/playlist/album/episode URL; playback delegates entirely to `useSpotifyStore`                                                                                                                                                                       |
| Generate (AI, Lyria)   | `upload`      | **Yes**                                           | Two-step: `structureMusicPrompt()` expands the description, then Lyria generates audio (BYOK-local client-side, or the `generate-music` edge function for platform/campaign-BYOK); result is uploaded through the normal `useSoundUpload` path and saved with `artist: "Grimoire AI"` |
| Browse SFX (Freesound) | `freesound`   | No                                                | Search-and-add from the `freesound-search` edge function; saved with the CDN preview URL plus attribution fields                                                                                                                                                                      |

## Free-Tier Quotas

Enforced both client-side (`useQuota` gates the UI, showing a `PaywallModal`) and server-side (a `before insert` trigger calling `enforce_quota()` on all three tables, migration `20260614000004_soundboard_free_tier_quotas.sql`). The `check_quota` RPC is `security definer`, re-derives the plan from `user_subscriptions`/`plans` (defaulting to `free`), and counts existing rows — app admins always short-circuit to unlimited.

Free plan limits: **20 sounds, 1 soundboard page, 3 soundboard playlists.** Uploads and AI generation are gated on the Pro plan directly in `SoundForm` (independent of the count-based quotas above).

## Cast & Media Session

Both integrations are **music-playlist-only** — ambient's simultaneous-layer model has no single "now playing" item for either API to describe, so both are explicitly skipped for ambient playlists.

- **Media Session** (`useMediaSession`) is wired globally from `App.vue`, not gated to the Soundboard page — CarPlay/Android Auto/lock-screen controls work as long as a music playlist is active anywhere in the app. It publishes `MediaMetadata` (title/artist/album/artwork) and `play`/`pause`/`nexttrack`/`previoustrack`/`stop`/`seekto` action handlers, all delegating back into the soundboard store.
- **Google Cast** (`useCast`) mirrors the active music playlist to a Chromecast/Google Home device via the Default Media Receiver (no custom receiver app). It's lazily initialised — the Cast Sender SDK `<script>` is injected only when a `CastButton` first mounts, specifically to avoid the SDK's continuous mDNS device discovery starving audio-streaming bandwidth (this caused audible crackling when it was loaded at app startup). While casting, `soundboardStore.isCasting` is set and local playback is silenced (`pauseForCast`) so only the Cast device plays. Only Chrome/Edge desktop and Android support it; elsewhere `isCastAvailable` stays false and the button doesn't render.

## DM / Player Split

**Players currently have no access to the soundboard at all.** All three tables — `sounds`, `soundboard_pages`, `soundboard_playlists` (and the `soundboard_playlist_tracks` junction, scoped via the parent playlist's owner) — carry RLS policies of the form `auth.uid() = user_id` with no player-facing SELECT policy of any kind. `useCampaignLiveSync` does not subscribe to any soundboard table either, so there's no realtime channel a player-side view could even listen on. The Soundboard route (`/soundboard`) and every component in this doc are reachable only from the DM-side nav; there is no `/play/soundboard` equivalent. Any "the party can hear ambient audio" experience today is purely physical — the DM's speakers.

## Known Gaps

Tracked in [#572](https://github.com/irongollem/grimoire/issues/572), which sequences
the work in six phases. **Phases 1 (engine), 2 (scenes), 4 (speed) and the bulk of
5 (integration) have shipped.** What remains:

### Left over from phase 2

- **Only one scene at a time.** `activeAmbientPlaylist` is still a single ref, so you cannot run rain on top of a tavern — you can only replace one with the other.
- **Scenes do not crossfade into each other.** Individual tracks and loop wraps do; switching from one scene to another still cuts.

### Phase 3 — content

- **No bundled sound library.** A new campaign's Soundboard opens completely empty ("No sounds yet"); nothing ships as canonical/seed content the way SRD monsters or spells do. Being assembled **outside this repo** as a self-sourced CC0 / CC-BY collection, which sidesteps the Freesound commercial-use question rather than waiting on it. Check before starting any bundling work here.
- **Freesound's own filters are not exposed.** The edge function forwards only query, page and page size, so finding a three-second door creak means auditioning a lot of forty-second field recordings.

### Phase 5 — integration

Encounters and locations are wired (see **Themed audio** above). Still open:

- **Sessions and the calendar do not trigger anything.** The bus is producer-agnostic, so adding one is a `requestAudioTheme` call plus a theme field — no soundboard changes.
- **No indication of _why_ audio is playing.** The trigger carries a `label` ("Goblin ambush") that nothing displays yet, so a DM who forgot they themed an encounter has no way to see what started the music.

### Phase 6 — shared playback

- **Players hear nothing.** RLS on all three soundboard tables is owner-only and no realtime channel is subscribed. Planned as opt-in and off by default, and explicitly remote-only: several devices in one room playing the same track comb-filter into a flanged mess.

### Not phased

- **`useReplacePlaylistTracks` deletes and re-inserts the whole track list on every save** rather than diffing.
- **Other shortcuts have not migrated to the registry.** `GlobalSearch` and the soundboard dialogs have; `ImageLightbox`, `RollModePicker`, `NpcWebView` and the cartographer editor still open their own `document` listeners, so the registry cannot see those combos and the cheat sheet cannot list them.

See the issue for the full plan and per-gap file references.
