# Soundboard

DM-driven ambient sound and music player for live sessions: a per-campaign library of sounds organised into pages (boards) and playlists, played through a custom HTML/Web Audio engine with real-time filter effects, optional Spotify and Google Cast output, and OS-level Media Session integration (CarPlay, lock screen).

**Known-gaps audit:** GitHub issue [#572](https://github.com/irongollem/grimoire/issues/572) is a full audit of this module against paid standalone tools (Syrinscape, Foundry, Roll20) and specs the work to close the gaps listed at the bottom of this doc — read it before starting any soundboard work, since it contains exact file/line references for every weak point.

## Files

### Types

`src/types/sound.types.ts` — `SoundCategory` (`ambient | music | effects | misc`), `SoundSourceType` (`upload | url | spotify | freesound`), `Sound`, `SoundboardPage`, `AudioEffectPreset` (`none | through_door | through_wall | distant | underwater | cave | sewer`), `PlaylistType` (`music | ambient`), `SoundboardPlaylist`, `PlaylistTrack`/`PlaylistTrackWithSound`. Note: AI-generated sounds are **not** a distinct `source_type` — Lyria output is uploaded through the normal `upload` path (see Sound Sources below).

### Store & audio engine

`src/stores/soundboard.ts` (Pinia `useSoundboardStore`, ~620 lines) owns all non-Spotify playback. See **Audio Engine** below for the mechanics.

### Composables

| File                                        | Role                                                                                                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/composables/useSounds.ts`              | TanStack Query CRUD for the `sounds` table; `useSoundUpload` (converts uploads to Opus via `toOpus()`, then to the `sounds` storage bucket); `useSoundThumbnailUpload` (wraps `useImageUpload("sound-images")`) |
| `src/composables/useSoundboardPages.ts`     | CRUD + `useReorderSoundboardPages` for `soundboard_pages`                                                                                                                                                       |
| `src/composables/useSoundboardPlaylists.ts` | CRUD for `soundboard_playlists` + `soundboard_playlist_tracks`; `useReplacePlaylistTracks` deletes and re-inserts the whole track list on every save rather than diffing (flagged as tech debt in #572)         |
| `src/composables/useFreesoundSearch.ts`     | TanStack Query wrapper around the `freesound-search` edge function, min 2-char query, 10 min `staleTime`                                                                                                        |
| `src/composables/useMediaSession.ts`        | Wires the active **music** playlist to `navigator.mediaSession`; called once from `App.vue` (`if (!import.meta.env.SSR) useMediaSession();`) so it's live app-wide, not just on the Soundboard page             |
| `src/composables/useCast.ts`                | Google Cast Sender SDK integration (see **Cast** below); singleton, lazily initialised only when a `CastButton` first mounts                                                                                    |

### Spotify

`src/stores/spotify.ts` (Pinia `useSpotifyStore`) wraps the Spotify Web Playback SDK, registering "Grimoire Soundboard" as a Connect device. `src/lib/spotifyAuth.ts` implements PKCE OAuth (no client secret) — tokens live in `localStorage`, not the DB. The Spotify Client ID is BYOK, stored in plaintext on `campaigns.spotify_client_id` (not the encrypted key vault) and configured by the DM in Campaign Settings → Spotify. `isEnabled` requires both a configured client ID **and** `auth.isDM` — Spotify never appears for players. Requires a Spotify **Premium** account (the Web Playback SDK rejects free accounts).

### Freesound

`src/lib/freesound.ts` — pure license-normalisation (`normalizeLicense`) and attribution-building (`buildAttribution`) helpers. `supabase/functions/freesound-search/index.ts` duplicates these two functions (Deno can't import client-side TS) — **keep both copies in sync**, per the comment in both files. The edge function requires an authenticated user, filters results to `license:("Creative Commons 0" OR "Attribution")` (CC-BY-NC is explicitly excluded — Grimoire is a commercial product, see `feedback_licensing_spirit.md`), and rewrites `freesound.org/data/previews/…` URLs to the `cdn.freesound.org` host to save a redirect. Only preview clips are returned, not full-resolution source files — a fidelity/length ceiling inherited from the free API tier.

### AI generation (Lyria)

`src/lib/aiMusic.ts` exports `generateMusicWithLyria`, `structureMusicPrompt` (expands a plain description into a structured prompt via a text model first), `LYRIA_MODELS` (`lyria-3-clip-preview` / `lyria-3-pro-preview`), and `LYRICS_MAX_CHARS` (2200). `supabase/functions/generate-music/index.ts` is the server-mode path: validates campaign membership, resolves BYOK-vs-platform Gemini key (BYOK is Pro-only per `project_byok_pro_only.md`), reserves AI credits, calls the Lyria `generateContent` endpoint, and returns base64 audio. The client-side `generateMusicWithLyria` path is used instead when the user has a **local-vault** BYOK key (`grimoire_key_local_mode === "local"` in `localStorage`).

### Components (`src/components/soundboard/`)

| File                                                                      | Role                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SoundForm.vue` (636 lines — over the 600-line soft max, flagged in #572) | The add-sound form with 5 source tabs: URL, Upload, Spotify, Generate (AI), Browse SFX (Freesound). Whole-window drag-and-drop hijack while mounted.                                                                                                                    |
| `SoundCard.vue` (76 lines)                                                | Thin orchestrator: routes between the two transports on `source_type`, computes the card's active-highlight state, warms up the audio element on mount |
| `SoundCardHeader.vue`                                                     | Thumbnail upload, inline name/artist/category editing, WebM/Safari + retry badges, loop toggle, delete, and the trim control |
| `SoundCardAudioTransport.vue`                                             | Local-audio transport: page picker, play/stop, effect picker, volume, progress bar |
| `SoundCardSpotifyTransport.vue`                                           | Spotify transport in its three states (disabled / not connected / ready) |
| `SoundTrimControl.vue`                                                    | Persisted per-sound loudness correction (`gain_trim`, 0.25×–4×). Live preview on `@input`, persists once on `@change`. Gold badge when trimmed away from 1× |
| `VolumeSlider.vue`                                                        | The one shared range input — master, buses, per-sound and Spotify all use it (`label`/`showPercent`/`wide`/`muted`/`accent` props) |
| `AddSoundDialog.vue`                                                      | Modal wrapper around `SoundForm`                                                                                                                                                                                                                                        |
| `SoundFreesoundBrowser.vue`                                               | Freesound search results with a single shared preview `<Audio>` element (module-scope, same non-reactive pattern as the store) and an "Add" button per hit                                                                                                              |
| `SoundEffectPicker.vue`                                                   | Wand-icon popover for the 6 `AudioEffectPreset` values, teleported to `<body>` to escape widget overflow clipping                                                                                                                                                       |
| `SoundCategoryFilter.vue`                                                 | Pill filter (All/Ambient/Music/Effects/Misc)                                                                                                                                                                                                                            |
| `SoundboardPageTabs.vue`                                                  | Draggable page-tab bar: rename (double-click), delete, horizontal-scroll overflow cues, quota-gated "Add Page"                                                                                                                                                          |
| `SoundboardWidget.vue`                                                    | Floating, draggable mini-player (teleported to `<body>`) showing Spotify / active music playlist / active ambient playlist / individual playing sounds, plus "Stop All" and a collapsible **Mixer** (master + music/ambience/effects faders) |
| `SoundboardWidgetToggle.vue`                                              | Nav-bar button that opens/closes the floating widget; badge = count of currently-playing sounds (+1 if Spotify is playing)                                                                                                                                              |
| `CastButton.vue`                                                          | Google Cast trigger; renders nothing until `isCastAvailable`                                                                                                                                                                                                            |
| `PlaylistsPanel.vue`                                                      | Playlist grid for the active page (or all playlists on "All"), quota-gated "New Playlist"                                                                                                                                                                               |
| `PlaylistCard.vue`                                                        | Playlist grid card: play/pause/stop; prev/next + `CastButton` for music playlists only                                                                                                                                                                                  |
| `PlaylistEditorDialog.vue`                                                | Create/edit modal: name, type (locked after creation), shuffle/repeat (music only), draggable track list, add-sound via `EntityCombobox`                                                                                                                                |
| `PlaylistTrackRow.vue`                                                    | One draggable track row inside the editor, with a category colour chip                                                                                                                                                                                                  |

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
- **Fades and crossfade.** Fade-in on play, fade-out before pause/stop (the fade-out promise resolves before the element is paused). Music-playlist advance is a real crossfade, triggered from `ontimeupdate` while the outgoing track is still audible — *not* from `onended`, which would only give a fade-in after silence. The next element is pre-created so its fetch and decode precede the transition.
- **Ducking.** An `effects`-category sound attenuates the music and ambient buses (never the effects bus) with a fast attack and slower release. Ref-counted via a Set in `soundTransport`, so overlapping one-shots do not un-duck each other.
- **Master and per-bus faders** — `setMasterVolume` / `setBusVolume`, surfaced in the widget's Mixer section.
- **Effect presets** are six lowpass frequency/Q/gain triples (`through_door`, `through_wall`, `distant`, `underwater`, `cave`, `sewer`), ramped over 0.5s, ported into the engine from the old store.
- A **transient CDN-error retry**: on `audio.onerror` the element is recreated once (`hasRetried`/`markRetried`); a second failure surfaces `loadError` with a manual Retry badge. The engine keys its source nodes by element identity (a `WeakMap`), so it rebuilds the chain when the retry swaps the element.

### Two invariants not to break

**Ramp shape.** `exponentialRampToValueAtTime` can neither approach nor leave zero. `scheduleGain` picks exponential only when both endpoints clear a silence floor and falls back to linear otherwise — this is what lets a fade-out reach true silence instead of stalling at an epsilon. Changing it reintroduces a classic Web Audio bug.

**Transition generations.** `bumpGeneration`/`isCurrentGeneration` guard the fade-out completion callback. Without them, a `stop()` immediately followed by a `play()` lets the stale callback pause the element that just started — the race that makes naive crossfading eat tracks.

### Trap when adding a call site

`play(soundId, fileUrl, category?, gainTrim?)` takes category and trim as **optional** trailing params. Omitting `category` typechecks cleanly and routes the sound to the ambient bus, where it will never duck — a green build will not catch it. Every new call site must pass the sound's category.

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

Tracked in [#572](https://github.com/irongollem/grimoire/issues/572). Phase 1 (the
audio engine) is largely done — fades, crossfade, ducking, master/bus faders and
per-sound trim all shipped. What remains:

**Still open in phase 1**

- **Looping is not gapless.** Ambience beds use `audio.loop`, which seams audibly on every cycle in every browser.
- **`cave` and `sewer` have no reverb.** All six presets are lowpass-only, so those two sound muffled rather than reverberant, which is acoustically wrong for a space defined by its reflections.
- **Effects apply per-sound only.** `setEffect` filters one sound's chain, so selecting `cave` colours a single track while the music bed and every other layer stay dry. Walking into a cave should affect everything audible — the bus graph now makes bus/master-level effects cheap, but they don't exist yet.
- **Playlists can still stall after OS suspension.** `resumeAudioEngine()` resumes the `AudioContext` but deliberately does not re-play paused elements, because that raced with the advance chain. Note the transition-generation counter added in phase 1 is the mechanism that would now make safe re-play possible. This matters more than it looks: the soundboard's music playlists are in daily CarPlay use, where the DM cannot touch the screen to recover.

**Later phases**

- **No keyboard shortcuts** — every control is mouse/touch only; no global hotkey composable exists in the repo.
- **No bundled sound library** — a new campaign's Soundboard opens completely empty ("No sounds yet"); nothing ships as canonical/seed content the way SRD monsters or spells do.
- **No scene model or random generators** — ambient playlists layer fixed loops, but there is no concept of a one-shot firing at a random interval within a range, which is what stops ambience sounding like a two-minute loop.
- **No integration with encounters, locations, or sessions** — `useSoundboardStore` is imported only by soundboard's own files. Starting an encounter doesn't start combat music and a Location has no attached soundscape. The planned model binds by *theme* (a tagged pool) rather than a track per encounter, so it costs no per-encounter prep.
- **Players hear nothing** — RLS on all three soundboard tables is owner-only and no realtime channel is subscribed. Planned as opt-in and off by default, and explicitly remote-only: several devices in one room playing the same track comb-filter into a flanged mess.

See the issue for the full plan and per-gap file references.
