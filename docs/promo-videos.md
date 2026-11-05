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

## Posting

`npm run promo:post -- <id>` posts a finished Reel to @dungeongrimoire
through the Instagram Graph API (`post.ts`, `instagram.ts`). Without
`--publish` it is a dry run that posts nothing: it refuses a silent draft (a
narrated shot with no take; a picture-book scene has no narration), a build older than its takes, and a caption Instagram
would refuse or that has a tag word without its `#`, then prints the account,
video, cover and caption. `--publish` uploads the file (Meta's resumable
upload, so it needs no public URL), waits for Instagram to process it and
publishes at once; the API cannot schedule. The cover is the assembler's
`cover.jpg` frame, passed as its offset from `cover.json`. A posted Reel
leaves `posted.json` beside it and is not posted twice without `--again`.

A post folder with `slides/slide-1.jpg`, `slide-2.jpg`, ... and no
`manifest.json` is a **carousel** (`carousels.ts`), posted the same way: the
dry run checks there are 2 to 20 slides, all JPEG and all the size of the
first (Instagram crops every slide to it), and posting puts the slides on the
asset CDN under `promo/<id>/` (named by content hash) before Instagram fetches
them, because the API takes photos only from a public URL. "Steal this" posts
are carousels, made by `scripts/promo/steal/` (`handouts.ts` and `cards.ts`
capture the Scriptorium page, the stat block and the Card Forge card from the
app, `slides.ts` composes the 1080x1350 slides); convert the slides to JPEG
before posting.

`scripts/promo/schedule.json` lists when each post goes out (`{ id, at }`,
the time with its offset). `promo:post -- --schedule` dry-runs everything on
it; `promo:post -- --due` posts the earliest Reel whose time has come and that
has no `posted.json`, one per run. A launchd job on the maintainer's Mac runs
it at five past every hour (`scripts/promo/launchd/`, install and stop
commands in the file), logging to `promo-out/post.log` and raising a macOS
notification on every post or failure. Reels go out at 23:00 Amsterdam time,
17:00 in New York: most of the audience is in the US. A Reel the job would
post more than three hours late (the Mac was asleep) does not go out; it and
every Reel after it move back by whole days to the same time
(`pushMissed` in `schedule.ts`). To stop a Reel going out, take it off the
schedule.

The recorder's **Socials** tab (`?tab=socials`, `socials.ts` and
`voice/socials.js`) is the same thing with buttons: the account, every Reel
with its readiness, caption, schedule and post link, Post now, and the latest
posts on Instagram. Its writes accept only requests from its own page
(`isTrustedWrite`), because it can post publicly and any website can send
requests to 127.0.0.1.

The caption is `scripts/promo/captions/<id>.txt`. The token is
`INSTAGRAM_SYSTEM_USER_TOKEN` in `.env.local`: a system user of the Dungeon
Grimoire business portfolio, assigned the Instagram account, the Page and the
"Grimoire Promo Studio" app, with `instagram_basic`,
`instagram_content_publish`, `pages_read_engagement` and `pages_show_list`,
never expiring. The API reaches the account through the Page it is linked to,
so the account must stay linked to the Page.

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

## Picture-book scenes

A scene is a painting that moves a little, in the manner of a picture
book: steam off a kettle, a candle, a curtain stirring, the room shifting
slightly with depth as the viewpoint drifts (#1139). It is one painting cut
into layers and moved by code, not a video model, so it keeps the painting's
finish and moves exactly as much as the scene file says.

```bash
npm run promo:scene -- inn-dawn --preview   # plays it live at http://127.0.0.1:5183/?scene=inn-dawn
npm run promo:scene -- inn-dawn --stills 0,6,12   # single frames at those seconds, to place layers by eye
npm run promo:scene -- inn-dawn             # films promo-out/inn-dawn/
npm run promo:assemble -- inn-dawn          # the Reel: the scene alone, no brand cards or theme
npm run promo:post -- inn-dawn              # dry run, once captions/inn-dawn.txt exists
```

**The art.** The painter queue is `~/Desktop/art-955/scenes/` (see the
`make-art-from-queue` skill). The painter paints the empty room first, the
plate, then each moving part on a transparent background with the plate
attached, so the part takes the room's style and light. The queue holds a
part until its plate exists and moves aside a PNG without an alpha channel.
Keep the briefs quiet: few objects, large calm areas, one light. Paint
from Sothery (Sugarwell is the demo campaign, and every scene of the setting
promotes it) and from classic D&D too: a rough tavern, a dungeon, a dragon's
hoard (the maintainer, 4 Nov 2026). Brief the next plates wide, so the
camera can pan across the room in a portrait Reel rather than only drift:
the inn's portrait plate leaves about 120 px either side. A landscape plate
is enlarged about 1.9x at Reel height; a sharper route is a portrait centre
extended left and right by the painter as edits of it, stitched into a
panorama. That needs a `pan` camera beside today's drift. A busy
painting is the generated look this is meant to avoid. `--art <dir>` films
from another folder.

**The scene file** (`scripts/promo/scenes/<id>.ts`, listed in `catalog.ts`;
the types and maths are `src/lib/bookNook/scene.ts`, shared with the app's Book Nook; the Reel-only fields are `ReelScene` in `scenes/reel.ts`) is one back-to-front `stack`:

- a `layer` is an image with an `anchor` (the point of the image pinned to
  `at` in the frame, which it sways and scales about), a drawn `width`, a
  `depth` (the plate is 1; a part standing on something in the plate shares
  its depth, or it slides off it; nearer things are above 1 and move more),
  an optional contact `shadow`, a `plane` for a part on a side wall (a
  curtain at a window: it narrows and closes in on the wall's eye level
  toward the corner, so its edges slope with the wall's own lines; a part
  painted face-on and hung flat there reads as pasted on), and `motions`:
  `sway`, `bob`, `drift`, `flicker` (a flame) and `billow` (hanging cloth,
  fixed at the anchor's row);
- effects drawn between layers: `steam` (wisps rising from a point), `motes`
  (dust turning in a shaft of light) and `light` (spill on the room around a
  source, flickering with the flame it `follows`);
- one `grade` (a soft-light tint and a vignette) over the whole frame, so the
  cut-outs and the plate share one light;
- `camera`: a slow figure-of-eight drift (`drift`, a fraction of the frame's
  width) and a push in and out (`push`). This is the parallax, and it should
  stay at a per cent or two. A scene bigger than the frame also gives the
  camera a `path`: the points the view is centred on at given seconds, eased
  from one to the next and round from the last to the first by the loop's
  end. Cup Town tilts from a picnic at the viewer's feet up to the town and
  back, and its `captionAt` brings the line in only once the town is up.
- `tagline`: a second, quieter line with its own `at`, set in the bottom
  third of a Reel (above the strip Instagram covers). The title is read
  alone first: Cup Town asks "Will you join us?" and, two and a half seconds
  later, answers with the setting's subtitle, "Stay as long as you like".
  `scenes/scene.test.ts` holds a tagline to at least two seconds after its title and
  no longer on screen than it.

**Loops without a seam.** Every motion's period is rounded to a whole number
of cycles per `loop`, flicker is a sum of harmonics of the loop, and a wisp's
age is taken round the loop, so the frame at `t + loop` is the frame at `t`
(`scenes/scene.test.ts` holds every scene in the catalog to that, and the plate to
covering the frame however far the camera drifts).

**Filming** (`scenes/film.ts`) does not screen-record. It serves the scene
page (`scenes/browser/`, which imports the renderer from `src/lib/bookNook/render.ts`, bundled with esbuild and type-checked by
`tsconfig.scenes.json`, since it runs in a browser), steps it through exact
frames at 30 fps in headless Chrome and pipes them to ffmpeg. It writes the
same `manifest.json` and `shots/scene.mp4` a recorded episode has: one shot on
the `scene` surface, which fills the frame with no screen around it (`frame:
"none"` in `layouts.ts`), with the scene's `caption` as a line of text fading
over the picture, and no narration. A shot with no narration needs no voice
take, so the scene's sound is its own: the `sound.ambience` list, mixed
into `ambience.wav` with short fades, as one cue. A sound is a soundboard
library URL or a file in the art folder (the scene's Lyria tune), and loops
under the whole shot unless it names a `clip`, which plays that cut once
from `at`: the tune plays a cut from its middle, and the dawn bells strike
three times and stop, since a bell in Sothery never strikes more.

A scene's manifest says `brand: false`, so `promo:assemble` adds no brand
open, close or theme: the title is on the picture, with the wordmark fading
in under it and out with it (the `title` caption), and with no card at
either end the Reel loops on Instagram without a seam, the last frame
running straight into the first. A scene Reel is short on purpose (two of
its loops, 22 s for the inn): Reels are ranked on watching through and
watching again, and a seamless loop is watched again without anyone
noticing. The sound loops too: it is mixed 1.5 s past the end and that
overflow is crossfaded into the opening, and a tune's cut is chosen where
its end, what follows and its start match in level, or the loop dips as it
comes round. A sung cut needs more: the blend lays its next 1.5 s over the
opening, so whatever words follow the cut's end are heard over its first.
Make the loop exactly as long as the song takes to come round to the same
words, so the blend lays a line over the same line. Cup Town's loop is set
by its song this way (one refrain to the same point in the next, 680
frames), not the other way round; word timings from a local Whisper model
(`faster-whisper`, `small.en`) and a chroma match find that distance. The
seam sits on the line's first word, where the two times are alike, not in
the breath before it, where the band may play once and rest the next.
Ambience meant for playing at the table wants minutes, which is a
longer `duration` for YouTube or the website, not a longer Reel. It also
writes `still.png`, the opening frame, to review beside the plate.

The renderer (`src/lib/bookNook/render.ts`) has no Node and no promo dependencies, and under the OS's
reduce-motion setting it draws the opening frame and stops, so the same
scene can later play on the website. Posts whose picture is made this way
carry Instagram's AI label; screen recordings of the app do not.
