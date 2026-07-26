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
| `SoundCard.vue` (609 lines — also over the soft max)                      | Per-sound card: thumbnail upload, inline name/artist/category editing, HTML Audio transport (play/pause/stop/loop/seek/volume/effect picker) **or** Spotify transport depending on `source_type`, page-move dropdown, WebM/Safari warning badge, load-error retry badge |
| `AddSoundDialog.vue`                                                      | Modal wrapper around `SoundForm`                                                                                                                                                                                                                                        |
| `SoundFreesoundBrowser.vue`                                               | Freesound search results with a single shared preview `<Audio>` element (module-scope, same non-reactive pattern as the store) and an "Add" button per hit                                                                                                              |
| `SoundEffectPicker.vue`                                                   | Wand-icon popover for the 6 `AudioEffectPreset` values, teleported to `<body>` to escape widget overflow clipping                                                                                                                                                       |
| `SoundCategoryFilter.vue`                                                 | Pill filter (All/Ambient/Music/Effects/Misc)                                                                                                                                                                                                                            |
| `SoundboardPageTabs.vue`                                                  | Draggable page-tab bar: rename (double-click), delete, horizontal-scroll overflow cues, quota-gated "Add Page"                                                                                                                                                          |
| `SoundboardWidget.vue`                                                    | Floating, draggable mini-player (teleported to `<body>`) showing Spotify / active music playlist / active ambient playlist / individual playing sounds, plus "Stop All"                                                                                                 |
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

Playback for everything except Spotify goes through a **module-level, non-reactive** engine in `src/stores/soundboard.ts` — deliberately kept out of Pinia's reactive state because Vue's Proxy wrapper breaks `HTMLAudioElement` (volume/loop mutations silently drop, `play()` calls fail unpredictably):

- `audioInstances: Map<soundId, HTMLAudioElement>` — one element per sound, created lazily via `getOrCreate()` and eagerly "warmed up" (buffering starts) as soon as a `SoundCard` mounts, so playback starts instantly on click. `crossOrigin = "anonymous"` is set before `src` so the element can later be promoted into a Web Audio graph.
- A **transient CDN-error retry**: on `audio.onerror` the element is recreated once (`retriedIds` tracks this); a second failure surfaces `loadError` in the UI with a manual Retry badge.
- **Web Audio effect chain** (`effectChains: Map<soundId, EffectChain>`): a sound is "promoted" into a Web Audio graph — `source (MediaElementAudioSourceNode) → BiquadFilter (lowpass) → GainNode → ctx.destination` — the first time an effect is applied via `setEffect()`. Once promoted, the element's output permanently routes through the shared `AudioContext` (a Web Audio constraint), but the chain stays transparent (`frequency = 22000 Hz`, `Q = 0.7071`, `gain = 1.0`) until a preset is picked. Six presets (`through_door`, `through_wall`, `distant`, `underwater`, `cave`, `sewer`) are just different lowpass-frequency/Q/gain triples — all ramped over 0.5s via `linearRampToValueAtTime`. Volume itself is **not** part of this graph — it's set directly via `audio.volume`, pre-context, so it stacks with (rather than goes through) the effect gain.
- There is **one `AudioContext` per browser tab** (`sharedAudioCtx`), resumed on `visibilitychange` (screen unlock, CarPlay interaction) since iOS suspends it in the background.
- `releaseSound()` tears down both the effect chain and the audio element when a sound is deleted.

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

Per the audit in [#572](https://github.com/irongollem/grimoire/issues/572):

- **No fades or crossfade anywhere.** `play()`/`stop()`/`pause()`/`musicPlaylistNext()` all hard-cut; the only ramp in the codebase is the 0.5s effect-preset transition in `setEffect()`. Track advance is `stop(current)` then `play(next)`, so the next element isn't even created (let alone buffered) until the previous one ends.
- **No master volume or bus mixing.** Each sound gets its own private `source → filter → gain → destination` chain; there's no shared bus per `category`, and `category` itself has zero effect on the audio graph — it's a metadata filter only.
- **No ducking** — an effect/one-shot sound never attenuates a music or ambient bed underneath it.
- **No keyboard shortcuts** — every control is mouse/touch only; there's no global hotkey composable in the repo.
- **No bundled sound library** — a new campaign's Soundboard opens completely empty ("No sounds yet"); nothing ships as canonical/seed content the way SRD monsters or spells do.
- **No integration with encounters, locations, or sessions** — `useSoundboardStore` is imported only by soundboard's own files. Starting an encounter doesn't start combat music, a Location has no attached soundscape, and there's no session cue sheet.

See the issue for the full remediation plan (bus-graph rebuild, scene/generator model, curated library, campaign-triggered audio, opt-in broadcast to players) and exact file/line references for each gap.
