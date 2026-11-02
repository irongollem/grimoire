# Promo videos

Short vertical Instagram Reels (and, with `format: "youtube"`, landscape
YouTube videos, see "YouTube format" below), one feature per episode, filmed from the real
app. Episodes come in pairs, one from the DM's side and one from the player's,
posted a few days apart. The `/promo-episode` skill writes and films a new
pair; this page is how the pipeline works.

## Running it

Needs the local stack and the demo campaign:

```bash
npm run db:start && npm run dev:auth && npm run dev:demo
npm run promo:record -- workshop-player       # films every shot
npm run promo:voice                           # pick an episode, record the narration, build the Reel
```

`promo:voice` opens a local page (127.0.0.1 only) listing every recorded
episode with its progress; pick one (or switch from the menu at the top, or
start on one with `promo:voice -- <id>`) to see each shot's clip and line. Pick the microphone, press Space, and the clip plays while you read;
Enter keeps the take. It records with the browser's echo cancelling, noise
suppression and auto gain off (they ruin a condenser mic), trims the silence
(`wav.ts`) and saves `vo/<shot>.wav`, removing any older take of that shot.
"Assemble the Reel" runs `promo:assemble` and plays the result.
`promo:assemble -- <id>` on its own builds a draft with whatever takes exist.

The page's **Sounds** tab (`/?tab=sounds`) records sound effects, such as a
dice roll, with the same microphone and keys. Name the sound and every kept
take becomes its own file, `promo-out/sounds/<name>-01.wav`, `-02.wav` and on,
numbered past the highest take of that name (`sounds.ts`) so deleting one never
lets the next overwrite another. A sound is trimmed more gently than a voice
(down to -55 dB with 0.3 s of room) so a die's last rattle survives, and the
last quarter second is cut, where the stop key's own click lands.

The recorder starts its own app server on :5181 (`server.ts`) that does not
watch files: other sessions edit this checkout, and on the shared :5173 every
save reloaded the page mid-take. `PROMO_BASE_URL=<url>` films a server you run
yourself instead.

`promo:record -- <id> --shot <shot id>` re-films one shot and keeps the others.
A failed take saves the screen at that moment as `shots/<shot>.failed.png`.

Output lands in `promo-out/<id>/` (gitignored):

| File | What it is |
| --- | --- |
| `shots/<shot>.mp4` | one silent clip per shot, at the screen's native pixel size |
| `manifest.json` | shot order, captions, narration, lengths, sound cues |
| `script.md` | the narration to read, with a target length per shot |
| `vo/<shot>.wav` | your take for that shot, from `promo:voice` (`.m4a`, `.mp3`, `.aif` also work) |
| `<id>.mp4`, `cover.jpg` | the finished Reel and a cover frame |

Brand assets shared by every episode go in `promo-out/brand/`:
`intro.mp4` / `outro.mp4` (the sting, any size, scaled to fit) and
`theme.mp3` (the bed under every episode, ducked under the voice). Without
them the assembler draws placeholder title cards and plays no bed.

A YouTube video outlasts the one-minute theme, so it also takes
`bed-1.mp3`, `bed-2.mp3`, ... : background tunes of up to three minutes in
the theme's key, tempo and ensemble. The theme keeps its motif over the logo
and its ending over the close; between them the tunes play one after another
(`scripts/promo/beds.ts`), each from its middle so its introduction and
ending are never heard, handing over where a chapter starts, back to the
first after the last. They are level-matched to the theme, set 3 dB under the
Reel's bed and filtered the same way (`BED_EQ` in `assemble.ts`), so busy
tunes stay behind the voice and the chain reads as one piece. Without
`bed-1` a YouTube video loops the theme's underscore, which is audible.

## How it works

- **Filmed where it is safe to show.** Every episode runs in the DM fixture's
  copy of the published demo campaign (`setup/demo.ts`), never another
  campaign: `dev:campaigns` puts the maintainer's real games on the same
  account. Each episode's `setup` puts the scene back (ingredients, pending
  rows) before every take, through the loopback guard.
- **A real browser at device size.** `stage.ts` opens a visible Chrome window
  at the device's CSS size and scale and records it through the DevTools
  screencast. Headless Chrome sends too few frames, at CSS-pixel size. See
  Devices and the camera below.
- **What the page does first** (`page-setup.js`): picks the campaign and the
  DM or player lens, seeds `Math.random` so the dice land the same every
  take (the episode's `seed`), draws a ring where each tap lands, and reports
  every sound the app plays so the assembler can mix it back in. A local
  storage URL is mapped to the production CDN, which has the files
  (`assets.ts`).
- **Assembly** (`assemble.ts`, timeline maths in `timeline.ts`): each shot is
  as long as its clip or its voice-over plus 0.4 s, whichever is longer, the
  last frame holding if you talk past it. The screen sits on the
  Vellum page colour with the caption above it, inside Instagram's safe area.
  Loudness is normalised to -14 LUFS.

## Writing an episode

An episode is a TypeScript file in `scripts/promo/episodes/`, listed in
`episodes/index.ts`. Each shot has a caption (eight words at most: most Reels
play muted), a narration line, and a `run` that drives the page with the
helpers in `ShotContext` (`tap`, `type`, `scroll`, `scrollTo`, `hold`). Keep
an episode under about 45 seconds and open on the payoff.

The narration names what is on screen by the app's own label ("Under
Equipped", "the Spawn panel"), the first time the shot reaches it. A viewer
cannot read a heading while the voice is already explaining what sits under
it; hearing the name lets them find it, and find it again in the app.

## Setup and teardown

`Episode.setup` puts the scene back before every recording, so it must be
idempotent. `Episode.teardown` is its mirror: `record.ts` calls it once after
the last shot, in a `finally`, so it runs whether the take finished or failed
halfway. Use it to undo what a take leaves behind that would show on the next
screen or in the real app: an open session (there is one open session per
campaign, and the app asks about sessions older than six hours) and the chat
lines a take posted. It must not assume the take got as far as its last shot.

`Episode.prepare({ offstage })` runs once after setup and before the first
shot, unfilmed, for a state only a browser can make: a fight already under way
when the Reel opens exists only after someone has clicked through the lobby, so
the combat episodes let the offstage DM go live, set initiatives and start
combat there.
Like `setup`, it writes to the local stack's demo campaign only.

## Devices and the camera

`Episode.device` is `"phone"` (default), `"tablet"` or `"desktop"`, and a
shot's own `device` overrides it, so a Reel can cut from a laptop to a phone.
A shot on another device than the one before needs its own `startAt`: each
device has its own signed-in page. A shot's `account` likewise overrides the
episode's, so one video can film the DM's laptop and then the player's own
phone signed in as the player; each account and device pair is its own page.
A shot that names neither falls back to the episode's, even right after a shot
on another pair, so every shot off the default names both. `devices.ts` holds what filming needs
(viewport, scale, sidebar); where each screen sits in a finished video is
`layouts.ts`, per format. The Reel's sizes:

| Device | CSS viewport | Scale | Clip | In the Reel |
| --- | --- | --- | --- | --- |
| phone | 390x693 | 3x | 1170x2078 | rounded screen 780x1387 |
| tablet | 820x1180 | 2x | 1640x2360 | rounded screen 900x1295 |
| desktop | 1440x900 | 2x | 2880x1800 | landscape 1000x750 in a browser window, narration below |

A headed Chrome renders at one scale per browser, so the recorder launches one
browser per scale in use and opens each device's stage on first need. On a
desktop `tap` clicks instead of tapping; the ring still shows.

`ctx.focus(locator, { padding? })` points the camera at part of the screen
(padding in CSS pixels, default 8% of the target); `ctx.focus(null)` goes back
to the whole screen. It logs where the target is right now, so scroll first,
and hold afterwards: the glide takes 0.7 s. `manifest.json` keeps the moves as
`camera` in clip time, in device pixels. A shot that never calls it shows the
whole screen.

The arithmetic is `camera.ts` (tested): the view is padded, fitted to the
window's shape, centred and clamped inside the canvas, and never closer than
2.6x the full view. Each move eases with a smoothstep over 0.7 s and the
camera holds still between moves.

A desktop stays landscape, in a browser window (a title bar with the app's
address, rounded and shadowed like the phone) whose page area is 4:3, which
is the page beside the sidebar (1200x900 CSS px) exactly, so a desktop shot
rests on the whole page with nothing cut; a page with no sidebar (the player
portal in preview, `focus(null, { leftInset: 0 })`) rests on the whole screen.
A tall window once showed 625 of those 1200 px and lost every page's right
half. The whole page is small on a phone, so the shot's narration is written
out under the window (`subtitles` in `layouts.ts`, up to four lines), and a
`focus` is what makes text readable: zooms keep the landscape shape, and one on
the page keeps the sidebar out of frame. A desktop screen sits on a canvas of plain paper (`backdrop-<shot>.png`); ffmpeg's `zoompan` crops the
window out of it with `z`, `x`, `y` expressions on the input time. A frozen
last frame keeps the camera where it ended. Phone and tablet shots with no
camera move go through the plain screen-in-frame path.

## The offstage actor

Some shots need a second person acting live: the player's phone shows "Your
turn" only when the DM presses Next Turn in their own browser. `ctx.offstage(
"dm" | "player")` returns `{ page, open, base }` for the other fixture account,
in the same demo campaign with that account's lens, on a desktop viewport. It
runs in its own headless browser and context, is never filmed, and is opened by
the first shot that asks and kept for the rest of the episode, so its realtime
connection stays up. The first call can take a while (a cold app compile); do it
before the moment you film.

## YouTube format

`Episode.format` is `"reel"` (the default, 1080x1920) or `"youtube"`
(1920x1080), for longer, in-depth feature videos. It is copied into
`manifest.json`; a manifest without it is a Reel, so older episodes assemble
as before. A shot that starts a chapter carries `chapter: "Title"`, which
`record.ts` keeps in the manifest and prints as a heading in `script.md`.

Presentation lives in `layouts.ts`, one entry per format and device, and
`assemble.ts` and `compose/cards.ts` read the layout rather than any size.

| Format | Device | Window | Caption |
| --- | --- | --- | --- |
| reel | phone | rounded screen 780x1387 | band across the top, always on |
| reel | tablet | rounded screen 900x1295 | band across the top, always on |
| reel | desktop | landscape 1000x750 in a browser window | band across the top, narration written out below |
| youtube | desktop | 16:10 page area 1536x960 in a browser window, the whole screen with its sidebar | pill over the foot of the page, shown from 0.3 s to 4.5 s of each shot, fading in and out |
| youtube | phone | rounded screen 540x960 on the left | text panel on the right, always on |
| youtube | tablet | rounded screen 667x960 on the left | text panel on the right, always on |

On YouTube a shot that opens a chapter shows its title as a small gold line
above the caption. There is no burned-in narration: upload the subtitles
instead. Narration is long on YouTube, so a caption is a heading for what is
on screen, not a summary.

Assembling a YouTube episode also writes two files beside the `.mp4`:

- `chapters.txt`: one `m:ss Title` line per shot with a `chapter`, at that
  shot's start (`h:mm:ss` once the video passes an hour). The first line is
  always `0:00`, as YouTube requires, even though the first shot starts after
  the intro. YouTube wants at least three chapters of ten seconds or more.
  Paste the file into the video's description.
- `captions.srt`: the narration, one cue per sentence, spread across each
  shot's voice-over in proportion to the sentence's length and never past the
  end of the shot. Upload it under Subtitles in YouTube Studio. A shot with no
  voice-over yet gets no cue.

The arithmetic is `sidecars.ts` (tested).
