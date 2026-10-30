# Promo videos

Short vertical Instagram Reels, one feature per episode, filmed from the real
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
device has its own signed-in page. `devices.ts` holds the sizes:

| Device | CSS viewport | Scale | Clip | In the Reel |
| --- | --- | --- | --- | --- |
| phone | 390x693 | 3x | 1170x2078 | rounded screen 780x1387 |
| tablet | 820x1180 | 2x | 1640x2360 | rounded screen 900x1295 |
| desktop | 1440x900 | 2x | 2880x1800 | camera window 1000x1440, no frame |

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
camera holds still between moves. A desktop screen sits on a canvas of paper
with a soft shadow (`backdrop-<shot>.png`); ffmpeg's `zoompan` crops the
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
