---
name: promo-booth
description: Run the promo recording booth for the maintainer - the voice-over recorder, the Sounds tab for sound effects, assembling Reels and YouTube videos from their takes, rebuilding every episode after a pipeline change, and checking a cut by eye. Use when the maintainer says they recorded or dubbed episodes, asks to (re)build, bake, assemble or "record the rest", wants to record sounds such as dice rolls, or asks where a finished video is.
user-invocable: true
---

# The recording booth

The booth is everything after an episode has been filmed: the maintainer
records the narration and sound effects, and the assembler cuts the finished
video. Writing and filming episodes is `/promo-episode` (Reels) and
`/promo-youtube` (long form). The pipeline is documented in
`docs/promo-videos.md`; read its "Running it" section first.

## Where things are

| Path (gitignored, never commit) | What |
| --- | --- |
| `promo-out/<id>/manifest.json` | the filmed episode: shots, captions, narration, format |
| `promo-out/<id>/shots/<shot>.mp4` | the silent clips |
| `promo-out/<id>/vo/<shot>.wav` | the maintainer's takes, one per shot |
| `promo-out/<id>/<id>.mp4`, `cover.jpg` | the finished video and its cover frame |
| `promo-out/<id>/chapters.txt`, `captions.srt` | YouTube only: description chapters and subtitles |
| `promo-out/brand/` | `theme.mp3` (the bed under every episode); `intro.*` / `outro.*` clips if present, else drawn cards |
| `promo-out/sounds/<name>-NN.wav` | sound effects from the Sounds tab |

An episode's takes are the maintainer's own voice. Never delete or overwrite
anything in `vo/` or `sounds/`; re-assembling only reads them.

## The recorder

`npm run promo:voice` serves the booth page on http://127.0.0.1:5182/ (or the next
free port above it if taken) and opens it. Start it in the background
(`run_in_background`) so the session keeps working; `PROMO_VOICE_NO_OPEN=1`
skips opening a browser tab. It is plain files plus a small server
(`scripts/promo/voice.ts`): page changes need only a reload, server changes
need a restart (stop the old background task first).

- **Voice-over tab** (`/` then pick an episode): each shot's clip, caption and
  line. Space records with a 3-2-1 countdown while the clip plays, Enter keeps,
  R retakes, Esc cancels, arrows move between shots. "Assemble" cuts the video
  from whatever takes exist.
- **Sounds tab** (`/?tab=sounds`): name a sound, record, keep. Every kept take
  is its own numbered file, so recording `dice-roll` ten times gives ten
  variants; a deleted number is never reused. "Show in Finder" opens the folder.

The maintainer works the page; you do not record on their behalf. If the page
shows "The microphone could not be opened", it is the browser's permission
for 127.0.0.1, which only they can grant.

## Assembling

```bash
rtk proxy npm run promo:assemble -- <id>          # one episode
```

- Takes a minute or two per Reel and longer for a long YouTube video; run a
  batch in the background, one episode after another (they share the CPU and
  `.work/` folders are per episode, but parallel runs only slow each other).
- Reads `manifest.json`, `vo/`, `shots/` and `brand/`; writes the `.mp4` and
  `cover.jpg` (plus the YouTube sidecars). A shot without a take plays silent,
  so a draft before recording is fine.
- "Record the rest" / "bake them" after the maintainer dubbed: list which
  episodes have every take (`vo/` count against the manifest's shots) and
  assemble those. Report any episode still missing takes, by shot.
- After any change under `scripts/promo/` that affects the picture or sound
  (layouts, cards, camera, assemble), rebuild every episode with takes, so the
  maintainer never posts a stale cut.

## Checking a cut

Look before you report. A green assemble says nothing about framing.

```bash
ffmpeg -v error -y -i promo-out/<id>/<id>.mp4 -vf "fps=1/5,scale=360:-1,tile=6x2" -frames:v 1 /path/in/scratchpad/sheet.jpg
```

Read the sheet. Check that captions sit inside the frame, nothing important is
cut off the screen, zooms land on what the narration names, and no shot
freezes for long on a still frame (narration longer than its clip). For
detail, pull one full-size frame with `-ss <t> -frames:v 1`.

## Handing over

Say which videos were built and give their paths
(`promo-out/<id>/<id>.mp4`). For YouTube, also point at `chapters.txt` (paste
into the description) and `captions.srt` (upload under Subtitles in YouTube
Studio). Posting to Instagram or YouTube is the maintainer's; never upload or
post anything.

Commit pipeline changes (`scripts/promo/`, `docs/promo-videos.md`) by explicit
file. `promo-out/` is never committed.
